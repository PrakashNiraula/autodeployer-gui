# Stack choice — AutoDeployer GUI

**Choice:** Vite + React + TypeScript UI, with a small **Node CLI bridge** (`server/bridge.mjs`).

**Default in plan:** Tauri 2 + React.

**Why this MVP first**

1. No Rust toolchain on the build host; Tauri 2 would block shipping Phase 4 screens.
2. The product invariant is “GUI only starts the CLI; never spawns bats/Java; close never kills runs.” That lives in the bridge (`spawn(..., { detached: true })`), which maps 1:1 to a future Tauri `invoke` command.
3. Screens match D3/D4; every action calls `autodeployer` via the bridge.

**Migration path to Tauri 2**

- Keep the React UI.
- Replace `fetch('/api/...')` with Tauri commands that shell the same CLI args.
- Delete the Node bridge for production packaging; keep it for web-dev against a remote root if needed.

**Env**

- `AD_ROOT` — AutoDeployer install root (default: sibling `../AutoDeployer`)
- `AD_BIN` — path to `autodeployer` binary (optional; falls back to `go run`)
- `AD_GUI_PORT` — bridge port (default `8787`)
