# Vision Pilot MCP — guide

An MCP server that lets a coding agent (Claude Code, or any MCP client) open Vision Pilot, click through it and check it:
the website from the local GitHub folder or the live site, and the desktop app.

## Setup (once)

```bash
cd H:\Skills\VisionPilot\vision-pilot-mcp
npm install
```

Add it to the agent. For Claude Code, in the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "vision-pilot": { "command": "node", "args": ["H:/Skills/VisionPilot/vision-pilot-mcp/server.js"] }
  }
}
```

It uses the Google Chrome installed on the computer. Folders (change with environment variables):

| What | Default | Variable |
|---|---|---|
| Website | `../VisionPilot-GitHub` | `VP_SITE_DIR` |
| Desktop app | `../Vision Pilot` | `VP_DESKTOP_DIR` |
| Local server port | `8775` | `VP_PORT` |

Use another `VP_PORT` when something else already serves on 8775 (tests would reach that server instead).

## Tools

| Tool | What it does |
|---|---|
| `start_website` | Serves the local site (or opens `url`, e.g. the live site) in Chrome and waits until the page reports ready. `withExtension: true` loads the VisionPilot AI Bridge extension; `profileDir` keeps sign-ins between runs. |
| `start_desktop` / `stop_desktop` | Starts the Electron app and attaches to its main window. |
| `get_state` | Mode (Image / Video), Normal / Advanced, open panels and sizes, focus subjects, 3D objects. |
| `click`, `select_chip`, `type_text`, `set_value`, `upload_files` | Use the app like a person. |
| `evaluate` | Runs JavaScript in the page (`window.AC` = app state and helpers, `window.VPTest` = test hooks). |
| `screenshot` | Whole app or one panel (`selector`, e.g. `#pFocus`). |
| `check_layout` | Every button, icon and text stays inside its panel (optionally after resizing all panels). |
| `check_3d_zoom` | 3D zoom with one and with several subjects: moves forward, never enters a subject. |
| `test_ai_model` | One real job through the extension: ChatGPT / Claude / Gemini describes a sample image and the answer must come back. |
| `test_remove_background` | Remove Background through the AI bridge: did the PNG come back, how long, which error. |
| `check_extension` | Is the extension connected to the running app. |
| `check_github` | New commits on GitHub compared with the local folder (other people or AIs may have changed it). |
| `console_logs` | The page console (errors only if asked). |

### Useful `VPTest` hooks (through `evaluate`)

- `VPTest.ready`, `VPTest.loadMs` — the page finished loading, and how long it took.
- `VPTest.video3d()` — 3D camera position, rotation and field of view.
- `VPTest.seek(seconds)` — go to a time on the 3D timeline; returns every object there.
- `VPTest.bikeHands()` — how far the rider's hands are from the handlebar grips.
- `VPTest.resizeAll({scale})`, `VPTest.resetSizes()` — resize every panel, put them back.
- `VPTest.removeBackground()`, `VPTest.extensionStatus()`.

## Sign-ins for Claude and Gemini

ChatGPT also answers signed out. For Claude and Gemini, start once with
`start_website {withExtension: true, profileDir: "H:/Skills/VisionPilot/vp-test-browser-profile"}`, sign in to both in that
window, close it. Later runs with the same `profileDir` stay signed in. The agent never types passwords.

## Test scripts (`tests/`)

Run from this folder, e.g. `node tests/lazytest.mjs`. Inside the GitHub repo this folder is `tools/vision-pilot-mcp` and finds the site and `desktop/` by itself:

| Script | Checks |
|---|---|
| `lazytest.mjs` | Page ready time; Video & 3D loads after the page, and at once when the app opens in Video mode. |
| `normalfocus.mjs` | Image Detection & Focus stays off in Normal mode; picking a model never gives Advanced mode. |
| `center2.mjs <WxH>` | Middle column of Image and Video mode stays inside the screen. |
| `bike.mjs`, `bikeanim.mjs` | Rider seat and hands on the bike; every bike animation preset frame by frame. |
| `swtest.mjs` | After a new build, one reload serves the changed file and cached models stay (`VP_PORT=8791`). |
| `desk.mjs`, `deskext.mjs` | Desktop app opens; desktop app -> extension -> ChatGPT -> answer back. |
| `gptrun.mjs [gpt|claude|gemini]` | One AI job through the extension in a test Chrome. |
| `detbench.mjs` | Image detection speed and results. |
| `extzip.mjs [url]` | The site's Install Extension zip is complete and Chrome loads it. |
| `extlive.mjs [folder]` | An extension folder on the live site: popup, "Extension Connected", one ChatGPT job. |
| `drawerdl.mjs` | Three-dot menu Downloads: desktop app (latest .exe), extension zip, MCP zip. |

To test the built (minified) site like GitHub publishes it: in `../VisionPilot-GitHub` run
`node scripts/build-site.mjs`, then `VP_SITE_DIR=../VisionPilot-GitHub/_site VP_PORT=8791 node tests/<script>.mjs`.
