#!/usr/bin/env node
/**
 * Thin CLI bridge for the AutoDeployer GUI.
 * The GUI never spawns .bat/.sh/Java — only `autodeployer` subprocesses.
 * `run` is spawned detached so closing the GUI never kills the job.
 */
import express from "express";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);
const PORT = Number(process.env.AD_GUI_PORT || 8787);
const ROOT = process.env.AD_ROOT || path.resolve(process.cwd(), "..", "AutoDeployer");
const BIN =
  process.env.AD_BIN ||
  path.join(ROOT, "app", process.platform === "win32" ? "autodeployer.exe" : "autodeployer");

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  if (_.method === "OPTIONS") return res.sendStatus(204);
  next();
});

async function resolveBin() {
  try {
    await fs.access(BIN);
    return BIN;
  } catch {
    // fall back to `go run` from core repo during development
    return null;
  }
}

async function cli(args, { json = true } = {}) {
  const bin = await resolveBin();
  const base = ["--root", ROOT, ...(json ? ["--json"] : []), ...args];
  let stdout, stderr, code = 0;
  try {
    if (bin) {
      const r = await execFileAsync(bin, base, { maxBuffer: 8 * 1024 * 1024, encoding: "utf8" });
      stdout = r.stdout;
      stderr = r.stderr;
    } else {
      const r = await execFileAsync(
        "go",
        ["run", "./cmd/autodeployer", ...base],
        { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, encoding: "utf8" }
      );
      stdout = r.stdout;
      stderr = r.stderr;
    }
  } catch (e) {
    code = e.code ?? 1;
    if (typeof code !== "number") code = 1;
    stdout = e.stdout || "";
    stderr = e.stderr || String(e);
  }
  let data = null;
  if (json && stdout.trim()) {
    try {
      data = JSON.parse(stdout);
    } catch {
      data = { raw: stdout };
    }
  } else {
    data = { text: stdout };
  }
  return { ok: code === 0, code, data, stderr };
}

app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, root: ROOT, bin: (await resolveBin()) || "go run" });
});

app.get("/api/jobs", async (_req, res) => {
  res.json(await cli(["jobs", "list"]));
});

app.get("/api/jobs/:id", async (req, res) => {
  res.json(await cli(["jobs", "show", req.params.id]));
});

app.get("/api/jobs/:id/readme", async (req, res) => {
  const p = path.join(ROOT, "project", "jobs", req.params.id, "README.md");
  try {
    const text = await fs.readFile(p, "utf8");
    res.json({ ok: true, code: 0, data: { path: p, text } });
  } catch (e) {
    res.json({ ok: false, code: 2, data: null, stderr: String(e) });
  }
});

app.get("/api/jobs/:id/tree", async (req, res) => {
  const base = path.join(ROOT, "project", "jobs", req.params.id);
  const files = [];
  async function walk(dir, rel = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(path.join(dir, e.name), r);
      else files.push(r);
    }
  }
  try {
    await walk(base);
    res.json({ ok: true, code: 0, data: files });
  } catch (e) {
    res.json({ ok: false, code: 3, data: [], stderr: String(e) });
  }
});

app.get("/api/jobs/:id/file", async (req, res) => {
  const rel = String(req.query.path || "");
  if (!rel || rel.includes("..")) {
    return res.status(400).json({ ok: false, code: 2, stderr: "bad path" });
  }
  const p = path.join(ROOT, "project", "jobs", req.params.id, rel);
  const rootJob = path.join(ROOT, "project", "jobs", req.params.id);
  if (!p.startsWith(rootJob)) {
    return res.status(400).json({ ok: false, code: 2, stderr: "path escape" });
  }
  try {
    const text = await fs.readFile(p, "utf8");
    res.json({ ok: true, code: 0, data: { path: rel, text } });
  } catch (e) {
    res.json({ ok: false, code: 2, stderr: String(e) });
  }
});

app.get("/api/plan/:id", async (req, res) => {
  res.json(await cli(["plan", req.params.id, "--env", String(req.query.env || "dev")]));
});

app.post("/api/run", async (req, res) => {
  const { job_id, env, plan_id } = req.body || {};
  if (!job_id || !env || !plan_id) {
    return res.status(400).json({ ok: false, code: 2, stderr: "job_id, env, plan_id required" });
  }
  const args = [
    "--root", ROOT, "run", job_id,
    "--env", env, "--trigger", "gui", "--plan-id", plan_id, "--yes", "--quiet",
  ];
  const bin = await resolveBin();
  let child;
  if (bin) {
    child = spawn(bin, args, { detached: true, stdio: "ignore" });
  } else {
    child = spawn("go", ["run", "./cmd/autodeployer", ...args], {
      cwd: ROOT, detached: true, stdio: "ignore",
    });
  }
  child.unref();
  // Closing GUI / this bridge must not kill the run process.
  res.json({ ok: true, code: 0, data: { started: true, pid: child.pid, detached: true } });
});

app.post("/api/cancel/:runId", async (req, res) => {
  res.json(await cli(["cancel", req.params.runId]));
});

app.get("/api/history", async (req, res) => {
  const args = ["history", "list"];
  if (req.query.job) args.push("--job", String(req.query.job));
  if (req.query.limit) args.push("--limit", String(req.query.limit));
  res.json(await cli(args));
});

app.get("/api/history/:id", async (req, res) => {
  res.json(await cli(["history", "show", req.params.id]));
});

app.get("/api/logs/:id", async (req, res) => {
  res.json(await cli(["logs", "tail", req.params.id], { json: false }));
});

app.get("/api/env/:job", async (req, res) => {
  const env = String(req.query.env || "dev");
  const reveal = req.query.reveal === "1";
  const args = ["env", "list", "--job", req.params.job, "--env", env];
  if (reveal) args.splice(1, 0, "--reveal"); // global flag before subcommand handled by CLI parseGlobals on all args
  // CLI expects globals anywhere: --reveal env list ...
  res.json(await cli(reveal ? ["--reveal", "env", "list", "--job", req.params.job, "--env", env] : ["env", "list", "--job", req.params.job, "--env", env]));
});

app.post("/api/env/:job", async (req, res) => {
  const { env, key, value } = req.body || {};
  res.json(await cli(["env", "set", "--job", req.params.job, "--env", env, "--key", key, "--value", value]));
});

app.get("/api/schedules", async (_req, res) => {
  res.json(await cli(["schedule", "list"]));
});

app.get("/api/doctor", async (req, res) => {
  const args = ["doctor"];
  if (req.query.fix === "1") args.push("--fix");
  res.json(await cli(args));
});

app.listen(PORT, () => {
  console.log(`AutoDeployer GUI bridge on http://127.0.0.1:${PORT} root=${ROOT}`);
});
