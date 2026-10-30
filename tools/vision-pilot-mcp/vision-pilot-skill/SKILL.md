---
name: vision-pilot
description: Work on Vision Pilot (framesbyismail/VisionPilot) — the camera, motion and lighting prompt web app, its Chrome extension (AI Bridge), its Cloudflare sign-in worker and its Electron desktop app. Use when changing, fixing, testing or publishing Vision Pilot ("VisionPilot", "vision pilot", "visionpilot.us.ci", "Image mode", "Video & 3D", "Focus panel", "AI Bridge extension", "desktop app").
---

# Vision Pilot

## Where things are

| Part | Folder | Notes |
|---|---|---|
| Website (published) | `H:\Skills\VisionPilot\VisionPilot-GitHub` | git clone of `framesbyismail/VisionPilot`; GitHub Pages builds it on every push |
| Chrome extension | `VisionPilot-GitHub\extension` | MV3; talks to ChatGPT / Claude / Gemini in the user's signed-in Chrome |
| Sign-in worker | `H:\Skills\VisionPilot\worker` | Cloudflare `visionpilot-auth`; also serves the site on `visionpilot.us.ci` |
| Desktop app | `H:\Skills\VisionPilot\Vision Pilot` | Electron; bundles the built site, updates from GitHub Pages |
| Test MCP | `H:\Skills\VisionPilot\vision-pilot-mcp` | see `GUIDE.md` there |
| Old site copy | `H:\Skills\VisionPilot\github` | never change it |

## Before changing anything

1. `git fetch` in `VisionPilot-GitHub` and compare with `origin/main` — the owner also edits with other AIs and uploads
   files through the GitHub website. Build on what is there; never start over or drop working features.
2. Read the file you change; match its style (vanilla JS, no framework, comments that say why).

## How the site works

- `index.html` loads `detect.js`, `clip-text/clip-writer.js`, `ai-bridge.js`, `core.js` (Image mode, state `window.AC`,
  prompt engine), `resize.js`, `auth.js`. Video & 3D (`three.js` + `video.js`) loads after the page is ready
  (`window.VPLoadVideo()`), or at once when the app opens in Video mode. `models/ort.min.js` loads itself when needed.
- Normal / Advanced: `AC.isPro()` (approved by the owner through the worker) and `S.mode`. Advanced-only things go
  through `ensureAdvMode(name)`; `enforce()` puts them back in Normal mode (Image Detection & Focus included).
- `sw.js` caches the app. `version.json` (made by `scripts/build-site.mjs`) lists every file's SHA-256; the service
  worker and the desktop app refresh only files whose hash changed. Bump `CACHE_VERSION` only when the caching rules change.
- GitHub Pages runs `.github/workflows/static.yml`: `scripts/build-site.mjs` minifies the app code into `_site`.

## Extension (AI Bridge)

- ChatGPT changes its page often. The reply lives in `li[data-message-role="assistant"]` (signed out) or under
  `h4[data-conversation-role="assistant"]` (signed in). Generated images and code-made files (Remove Background PNG)
  are read from ChatGPT's own conversation data (`fetchConversationImage` in `chatgpt-content.js`), not from the page.
- After changing the extension, rebuild `visionpilot-ai-bridge-extension.zip` from the `extension` folder.

## Test before publishing

Use the Vision Pilot MCP (`GUIDE.md`): `start_website`, `check_layout`, `test_ai_model`, `check_3d_zoom`, and the scripts in
`tests/`. Test the built site too (`node scripts/build-site.mjs`, then `VP_SITE_DIR=.../_site VP_PORT=8791`).

## Publishing

- Site: commit and push to `main` of `framesbyismail/VisionPilot` (owner's approval first). Pages deploys in about a minute.
- Worker: `npx.cmd wrangler deploy` in `worker` (PowerShell blocks `npx.ps1`; the owner runs it or approves it and clicks Authorize in the browser when Cloudflare asks; secrets live in Cloudflare, never in files).
- Desktop: `npm run dist:win` in `Vision Pilot` (Linux on Linux, Mac on a Mac).

## Never

- Type passwords or OAuth secrets anywhere; the owner does that.
- Give Advanced mode without the owner's approval (no `setPro(true)` outside `auth.js`).
- Change `H:\Skills\VisionPilot\github`.
