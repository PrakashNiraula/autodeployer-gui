const BASE = import.meta.env.VITE_API || ""; // same-origin; Vite proxies /api → bridge

export type CliResult<T = unknown> = {
  ok: boolean;
  code: number;
  data: T;
  stderr?: string;
};

async function get<T>(path: string): Promise<CliResult<T>> {
  const r = await fetch(`${BASE}${path}`);
  return r.json();
}

async function post<T>(path: string, body: unknown): Promise<CliResult<T>> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json();
}

export const api = {
  health: () => get<{ ok: boolean; root: string }>("/api/health"),
  jobs: () => get<Array<{ id: string; name: string; description: string }>>("/api/jobs"),
  job: (id: string) => get<Record<string, unknown>>(`/api/jobs/${id}`),
  readme: (id: string) => get<{ text: string }>(`/api/jobs/${id}/readme`),
  tree: (id: string) => get<string[]>(`/api/jobs/${id}/tree`),
  file: (id: string, path: string) =>
    get<{ path: string; text: string }>(`/api/jobs/${id}/file?path=${encodeURIComponent(path)}`),
  plan: (id: string, env: string) => get<Record<string, unknown>>(`/api/plan/${id}?env=${encodeURIComponent(env)}`),
  run: (job_id: string, env: string, plan_id: string) =>
    post<{ started: boolean; pid: number; detached: boolean }>("/api/run", { job_id, env, plan_id }),
  cancel: (runId: string) => post<unknown>(`/api/cancel/${runId}`, {}),
  history: (job?: string) =>
    get<Array<Record<string, unknown>>>(`/api/history${job ? `?job=${encodeURIComponent(job)}` : ""}`),
  historyShow: (id: string) => get<Record<string, unknown>>(`/api/history/${id}`),
  logs: (id: string) => get<{ text: string }>(`/api/logs/${id}`),
  envList: (job: string, env: string, reveal = false) =>
    get<Record<string, string>>(`/api/env/${job}?env=${encodeURIComponent(env)}${reveal ? "&reveal=1" : ""}`),
  envSet: (job: string, env: string, key: string, value: string) =>
    post<unknown>(`/api/env/${job}`, { env, key, value }),
  schedules: () => get<Array<Record<string, unknown>>>("/api/schedules"),
  doctor: (fix = false) => get<Record<string, unknown>>(`/api/doctor${fix ? "?fix=1" : ""}`),
};
