# Vision Pilot desktop app

One codebase for Windows, macOS and Linux (Electron). The app carries the whole website inside it, so it works offline,
and on every start it checks GitHub for a newer version.

## How it works

- **Start:** a small loading box shows while the app checks `https://framesbyismail.github.io/VisionPilot/version.json`.
  The app opens when the page says it is ready (at most 10 seconds).
- **Updates:** `version.json` lists every file of the site with its SHA-256. The app downloads only the files that
  changed, checks each one, then switches to the new copy. Offline or a bad download: it keeps the copy it has.
  `version.json` is made by `scripts/build-site.mjs` in the GitHub repo on every push (see `.github/workflows/static.yml`).
- **AI models (ChatGPT, Claude, Gemini):** the app sends jobs to the VisionPilot AI Bridge extension in the user's normal
  Chrome, where they are signed in. The extension connects to the app on this computer only (`127.0.0.1:47821`).
  If Chrome is closed, the app starts it in the background.
- **Sign-in:** opens in the user's browser and comes back to the app by itself.

## Build

```bash
npm install
npm run dist:win      # Windows installer   -> release/Vision Pilot Setup <version>.exe
npm run dist:linux    # Linux AppImage + deb (run on Linux)
npm run dist:mac      # macOS dmg + zip     (run on a Mac)
```

Each `dist` command first runs `npm run bundle-site`, which builds `../VisionPilot-GitHub` exactly like GitHub does
(minified code + `version.json`) into `./site`. Set `VP_SITE_SRC` to use another site folder.

## Check it

```bash
npm start
npx electron . --verify-smoke-test
```

The smoke test prints `VISIONPILOT_SMOKE_OK {...}` and quits. `VP_UPDATE_URL=<address>/` points the updater at another
copy of the site (for testing updates).
