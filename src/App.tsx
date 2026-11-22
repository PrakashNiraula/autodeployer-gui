import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import "./App.css";

type Nav = "jobs" | "running" | "history" | "deployments" | "doctor";
type JobTab = "overview" | "files" | "schedules" | "runs" | "env";

const ENVS = ["dev", "uat", "prod"] as const;

export default function App() {
  const [nav, setNav] = useState<Nav>("jobs");
  const [env, setEnv] = useState<string>("dev");
  const [jobs, setJobs] = useState<Array<{ id: string; name: string; description: string }>>([]);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobTab, setJobTab] = useState<JobTab>("overview");
  const [readme, setReadme] = useState("");
  const [tree, setTree] = useState<string[]>([]);
  const [filePath, setFilePath] = useState("");
  const [fileText, setFileText] = useState("");
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [envMap, setEnvMap] = useState<Record<string, string>>({});
  const [reveal, setReveal] = useState(false);
  const [schedules, setSchedules] = useState<Array<Record<string, unknown>>>([]);
  const [doctor, setDoctor] = useState<Record<string, unknown> | null>(null);
  const [logText, setLogText] = useState("");
  const [error, setError] = useState("");
  const [planModal, setPlanModal] = useState<Record<string, unknown> | null>(null);
  const [prodGate, setProdGate] = useState(false);
  const [prodTyped, setProdTyped] = useState("");
  const [status, setStatus] = useState("");

  const refreshJobs = useCallback(async () => {
    const r = await api.jobs();
    if (!r.ok) setError(r.stderr || `jobs exit ${r.code}`);
    setJobs(Array.isArray(r.data) ? r.data : []);
  }, []);

  const refreshHistory = useCallback(async (jid?: string | null) => {
    const r = await api.history(jid || undefined);
    setHistory(Array.isArray(r.data) ? r.data : []);
  }, []);

  useEffect(() => {
    void refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    if (nav === "running" || nav === "history") void refreshHistory();
    if (nav === "doctor") {
      void api.doctor().then((r) => setDoctor((r.data as Record<string, unknown>) || null));
    }
  }, [nav, refreshHistory]);

  useEffect(() => {
    if (!jobId) return;
    void (async () => {
      if (jobTab === "overview") {
        const r = await api.readme(jobId);
        setReadme(r.data?.text || "(no README.md)");
      }
      if (jobTab === "files") {
        const r = await api.tree(jobId);
        setTree(Array.isArray(r.data) ? r.data : []);
      }
      if (jobTab === "runs") void refreshHistory(jobId);
      if (jobTab === "env") {
        const r = await api.envList(jobId, env, reveal);
        setEnvMap((r.data as Record<string, string>) || {});
      }
      if (jobTab === "schedules") {
        const r = await api.schedules();
        const all = Array.isArray(r.data) ? r.data : [];
        setSchedules(all.filter((s) => s.job_id === jobId));
      }
    })();
  }, [jobId, jobTab, env, reveal, refreshHistory]);

  async function openFile(p: string) {
    if (!jobId) return;
    setFilePath(p);
    const r = await api.file(jobId, p);
    setFileText(r.data?.text || "");
  }

  async function doPlan() {
    if (!jobId) return;
    setError("");
    const r = await api.plan(jobId, env);
    if (!r.ok && r.code !== 0) {
      setError(r.stderr || `plan exit ${r.code}`);
    }
    setPlanModal(r.data as Record<string, unknown>);
  }

  async function confirmRun() {
    if (!jobId || !planModal) return;
    if (env === "prod" && !prodGate) {
      setProdGate(true);
      return;
    }
    if (env === "prod" && prodTyped !== "prod") {
      setError("Type prod to continue");
      return;
    }
    const planId = String(planModal.plan_id || "");
    const r = await api.run(jobId, env, planId);
    setPlanModal(null);
    setProdGate(false);
    setProdTyped("");
    if (!r.ok) setError(r.stderr || "run failed");
    else {
      setStatus(`Started detached pid=${r.data?.pid} — closing GUI will not kill it.`);
      setNav("running");
      void refreshHistory();
    }
  }

  async function kill(runId: string) {
    const r = await api.cancel(runId);
    if (!r.ok) setError(r.stderr || `cancel ${r.code}`);
    void refreshHistory();
  }

  async function viewLog(runId: string) {
    const r = await api.logs(runId);
    setLogText(r.data?.text || JSON.stringify(r.data));
  }

  const running = history.filter((h) => h.status === "running");

  return (
    <div className="app">
      <header className="top">
        <strong>AutoDeployer</strong>
        <div className="top-right">
          <label>
            Env{" "}
            <select value={env} onChange={(e) => setEnv(e.target.value)}>
              {ENVS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <span className={`chip ${env}`}>{env.toUpperCase()}</span>
        </div>
      </header>

      <div className="shell">
        <nav className="gnav">
          {(
            [
              ["jobs", "Jobs"],
              ["running", "Running"],
              ["history", "History"],
              ["deployments", "Deployments"],
              ["doctor", "Doctor"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={nav === k && !jobId ? "on" : ""} onClick={() => { setNav(k); setJobId(null); }}>
              {label}
            </button>
          ))}
        </nav>

        <main>
          {error && <div className="banner bad">{error}</div>}
          {status && <div className="banner ok">{status}</div>}

          {!jobId && nav === "jobs" && (
            <section>
              <h2>Jobs (projects)</h2>
              <button className="btn g" onClick={() => void refreshJobs()}>
                Refresh
              </button>
              {jobs.length === 0 && (
                <div className="empty">
                  <strong>No jobs yet</strong>
                  Add project/jobs/&lt;id&gt;/job.yaml then refresh.
                </div>
              )}
              {jobs.map((j) => (
                <button
                  key={j.id}
                  className="card-btn"
                  onClick={() => {
                    setJobId(j.id);
                    setJobTab("overview");
                  }}
                >
                  <strong>{j.id}</strong>
                  <div className="meta">{j.name}</div>
                  <div className="meta">{j.description}</div>
                </button>
              ))}
            </section>
          )}

          {!jobId && nav === "running" && (
            <section>
              <h2>Running</h2>
              <table>
                <thead>
                  <tr>
                    <th>Run</th>
                    <th>Job</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {running.map((r) => (
                    <tr key={String(r.id)}>
                      <td>{String(r.id)}</td>
                      <td>{String(r.job_id)}</td>
                      <td>
                        <span className="badge run">running</span>
                      </td>
                      <td>
                        <button className="btn bad" onClick={() => void kill(String(r.id))}>
                          Kill
                        </button>
                      </td>
                    </tr>
                  ))}
                  {running.length === 0 && (
                    <tr>
                      <td colSpan={4} className="meta">
                        No running jobs
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>
          )}

          {!jobId && nav === "history" && (
            <section>
              <h2>History</h2>
              <div className="split">
                <table>
                  <thead>
                    <tr>
                      <th>Job</th>
                      <th>Status</th>
                      <th>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={String(r.id)} onClick={() => void viewLog(String(r.id))} style={{ cursor: "pointer" }}>
                        <td>{String(r.job_id)}</td>
                        <td>
                          <span className={`badge ${String(r.status)}`}>{String(r.status)}</span>
                        </td>
                        <td>{String(r.started_local || "")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <pre className="log">{logText || "Select a run to view its log"}</pre>
              </div>
            </section>
          )}

          {!jobId && nav === "deployments" && (
            <section>
              <h2>Deployments</h2>
              <p className="meta">Promote is CLI-only for v1: <code>autodeployer promote --from &lt;dir&gt;</code></p>
            </section>
          )}

          {!jobId && nav === "doctor" && (
            <section>
              <h2>Doctor</h2>
              <button className="btn g" onClick={() => void api.doctor(true).then((r) => setDoctor(r.data as Record<string, unknown>))}>
                doctor --fix
              </button>
              <pre className="code">{JSON.stringify(doctor, null, 2)}</pre>
            </section>
          )}

          {jobId && (
            <section>
              <div className="job-top">
                <button className="link" onClick={() => setJobId(null)}>
                  ← Jobs
                </button>
                <strong>{jobId}</strong>
                <div>
                  <button className="btn g" onClick={() => void doPlan()}>
                    Plan
                  </button>
                  <button className="btn" onClick={() => void doPlan()}>
                    Run
                  </button>
                </div>
              </div>
              <div className="tabs">
                {(["overview", "files", "schedules", "runs", "env"] as JobTab[]).map((t) => (
                  <button key={t} className={jobTab === t ? "on" : ""} onClick={() => setJobTab(t)}>
                    {t}
                  </button>
                ))}
              </div>

              {jobTab === "overview" && (
                <article className="card readme">
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit" }}>{readme}</pre>
                </article>
              )}

              {jobTab === "files" && (
                <div className="files">
                  <div className="tree">
                    {tree.map((p) => (
                      <button key={p} className={filePath === p ? "sel" : ""} onClick={() => void openFile(p)}>
                        {p}
                      </button>
                    ))}
                  </div>
                  <pre className="code">{fileText || "Select a file"}</pre>
                </div>
              )}

              {jobTab === "schedules" && (
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Cron</th>
                      <th>Env</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((s) => (
                      <tr key={String(s.id)}>
                        <td>{String(s.id)}</td>
                        <td>{String(s.cron)}</td>
                        <td>{String(s.env_profile)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {jobTab === "runs" && (
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Status</th>
                      <th>Trigger</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((r) => (
                      <tr key={String(r.id)}>
                        <td>{String(r.started_local)}</td>
                        <td>
                          <span className={`badge ${String(r.status)}`}>{String(r.status)}</span>
                          {r.skip_reason ? ` · ${String(r.skip_reason)}` : ""}
                        </td>
                        <td>{String(r.trigger)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {jobTab === "env" && (
                <div>
                  <button className="btn g" onClick={() => setReveal((v) => !v)}>
                    {reveal ? "Hide secrets" : "Reveal"}
                  </button>
                  <table>
                    <thead>
                      <tr>
                        <th>Key</th>
                        <th>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(envMap).map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td>
                            <code>{v}</code>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </main>
      </div>

      {planModal && (
        <div className="modal-back">
          <div className="modal">
            <h3>{prodGate ? "Production gate" : "Confirm plan"}</h3>
            {!prodGate && (
              <>
                <div className="meta">
                  plan_id: {String(planModal.plan_id)} · can_execute={String(planModal.can_execute)}
                </div>
                <pre className="kv">{JSON.stringify(planModal.env_validation, null, 2)}</pre>
                <button className="btn g" onClick={() => setPlanModal(null)}>
                  Cancel
                </button>
                <button className="btn" onClick={() => void confirmRun()}>
                  Confirm &amp; run
                </button>
              </>
            )}
            {prodGate && (
              <>
                <p className="meta">
                  Type <strong>prod</strong> to continue.
                </p>
                <input value={prodTyped} onChange={(e) => setProdTyped(e.target.value)} autoFocus />
                <button className="btn g" onClick={() => setProdGate(false)}>
                  Back
                </button>
                <button className="btn bad" onClick={() => void confirmRun()}>
                  Run on prod
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
