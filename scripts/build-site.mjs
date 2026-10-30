// Builds the published site into _site (run by .github/workflows/static.yml on every push):
// - the app code (prompt engine included) is minified: comments removed, local names shortened, so it is hard to read and copy
// - everything else is copied as it is
// - version.json lists every file with its SHA-256; the desktop app reads it to download only what changed
// Run locally: npm i --no-save terser@5.36.0 && node scripts/build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {minify} from 'terser';

const ROOT = process.cwd();
const OUT = path.resolve(ROOT, process.env.VP_OUT || '_site');
// never published (desktop/ and tools/ are the desktop app and the test MCP, kept in the repo but not on the site)
const SKIP = new Set(['.git', '.github', 'scripts', '_site', 'node_modules', 'desktop', 'tools', '.gitignore', 'package.json', 'package-lock.json']);
// app code that gets minified (the extension folder is copied as it is: Chrome reviews readable code)
const MINIFY = /^(core|video|detect|ai-bridge|auth|resize|ads|sw)\.js$|^clip-text\/clip-writer\.js$/;

const rel = p => path.relative(ROOT, p).split(path.sep).join('/');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    if (dir === ROOT && SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}

fs.rmSync(OUT, {recursive:true, force:true});
const files = walk(ROOT);
let saved = 0;
for (const src of files) {
  const r = rel(src), dest = path.join(OUT, r);
  fs.mkdirSync(path.dirname(dest), {recursive:true});
  if (!MINIFY.test(r)) { fs.copyFileSync(src, dest); continue; }
  const code = fs.readFileSync(src, 'utf8');
  // classic scripts share their top-level names (window.AC and friends), so only names inside functions are shortened
  const res = await minify(code, {ecma:2020, compress:{passes:2}, mangle:true, format:{comments:false}});
  if (!res.code) throw new Error('Minify failed for ' + r);
  fs.writeFileSync(dest, res.code);
  saved += code.length - res.code.length;
  console.log(`minified ${r}: ${Math.round(code.length / 1024)} KB -> ${Math.round(res.code.length / 1024)} KB`);
}

// version.json: the commit (or a hash of everything) plus every published file's SHA-256
const list = {};
for (const p of walk(OUT).sort()) {
  const r = path.relative(OUT, p).split(path.sep).join('/');
  if (r === 'version.json') continue;
  list[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}
const version = process.env.GITHUB_SHA || crypto.createHash('sha256').update(JSON.stringify(list)).digest('hex');
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({version, built:new Date().toISOString(), files:list}));
// GitHub Pages: serve the files as they are (no Jekyll)
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`built ${Object.keys(list).length} files into ${rel(OUT)} (version ${version.slice(0, 7)}, ${Math.round(saved / 1024)} KB smaller)`);
