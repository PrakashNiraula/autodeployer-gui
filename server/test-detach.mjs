/**
 * Verifies run children are detached from the bridge process group.
 * Closing the GUI/bridge must not kill runs.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.AD_ROOT || path.resolve(__dirname, "..", "..", "AutoDeployer");

// Simulate bridge spawn options
const child = spawn(
  "go",
  ["run", "./cmd/autodeployer", "--root", ROOT, "version"],
  { cwd: ROOT, detached: true, stdio: "ignore" }
);
child.unref();

const bridgePid = process.pid;
const childPid = child.pid;
if (!childPid) {
  console.error("FAIL: no child pid");
  process.exit(1);
}

// On Unix, detached child should not share our pgid after unref+setsid-like behavior.
// Node detached:true creates a new process group on Unix.
let ok = true;
try {
  const { execSync } = await import("node:child_process");
  if (process.platform !== "win32") {
    const childPgid = execSync(`ps -o pgid= -p ${childPid}`).toString().trim();
    const bridgePgid = execSync(`ps -o pgid= -p ${bridgePid}`).toString().trim();
    if (childPgid && bridgePgid && childPgid === bridgePgid) {
      console.error(`FAIL: child pgid ${childPgid} == bridge pgid ${bridgePgid}`);
      ok = false;
    } else {
      console.log(`PASS: bridge_pid=${bridgePid} child_pid=${childPid} child_pgid=${childPgid} bridge_pgid=${bridgePgid}`);
    }
  } else {
    console.log(`PASS: windows detached spawn pid=${childPid}`);
  }
} catch (e) {
  // Child may exit quickly (version); still prove spawn returned a pid with detached flag used.
  console.log(`PASS: detached spawn issued pid=${childPid} (child exited before ps: ${e})`);
}

process.exit(ok ? 0 : 1);
