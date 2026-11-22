# autodeployer-gui

Thin GUI for [AutoDeployer](https://github.com/PrakashNiraula/AutoDeployer).  
**Never** executes `.bat` / `.sh` / Java itself — only the `autodeployer` CLI.

## Quick start

```bash
# Terminal A — build or point at core
export AD_ROOT=/path/to/AutoDeployer
# optional: go build -o "$AD_ROOT/app/autodeployer" "$AD_ROOT/cmd/autodeployer"

cd autodeployer-gui
npm install
npm run dev
```

- UI: http://127.0.0.1:5173  
- Bridge: http://127.0.0.1:8787  

## Screens (D4)

Jobs catalog · Job Overview/Files/Schedules/Runs/Env · Plan confirm · Prod typed gate · Running+Kill · History+log · Deployments hint · Doctor

## Invariant test

```bash
npm run test:detach
```

Asserts that a `run` child is started `detached` and is not in the bridge’s process group (closing the GUI/bridge does not tree-kill it).

## Stack

See [STACK.md](./STACK.md). Target packaging: Tauri 2 wrapping this React UI.
