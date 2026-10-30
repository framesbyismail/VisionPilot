// Puts the website inside the desktop app (./site), built exactly like GitHub builds it (minified code + version.json),
// so the app works offline from the first start and the updater only downloads what changed after that.
// Site folder: VP_SITE_SRC, else the repo this app sits in (desktop/ of the GitHub repo), else ../VisionPilot-GitHub.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IN_REPO = fs.existsSync(path.join(APP, '..', 'scripts', 'build-site.mjs'));
const SRC = path.resolve(process.env.VP_SITE_SRC || (IN_REPO ? path.join(APP, '..') : path.join(APP, '..', 'VisionPilot-GitHub')));
const OUT = path.join(APP, 'site');
if (!fs.existsSync(path.join(SRC, 'scripts', 'build-site.mjs'))) throw new Error('Site not found at ' + SRC + ' (set VP_SITE_SRC)');
// the site's build needs terser; install it there once if it is missing
if (!fs.existsSync(path.join(SRC, 'node_modules', 'terser'))) {
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['i', '--no-save', '--no-package-lock', 'terser@5.36.0'], {cwd:SRC, stdio:'inherit', shell:process.platform === 'win32'});
}
execFileSync(process.execPath, [path.join(SRC, 'scripts', 'build-site.mjs')], {cwd:SRC, stdio:'inherit', env:{...process.env, VP_OUT:OUT}});
console.log('site bundled into', OUT);
