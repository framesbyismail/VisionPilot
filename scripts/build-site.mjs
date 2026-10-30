// Builds the published site into _site (run by .github/workflows/static.yml on every push):
// - the app code (prompt engine included) is minified: comments removed, local names shortened, so it is hard to read and copy
// - everything else is copied as it is
// - version.json lists every file with its SHA-256; the desktop app reads it to download only what changed
// Run locally: npm i --no-save terser@5.36.0 && node scripts/build-site.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
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

// the extension download is always made from the extension/ folder itself, so the zip can never miss a file
// (fixed dates: the same files always give the same zip, so updates only see it change when the extension changes)
function zipFolder(dir) {
  const crcTable = Array.from({length:256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  const local = [], central = [];
  let offset = 0;
  for (const name of fs.readdirSync(dir).filter(n => fs.statSync(path.join(dir, n)).isFile()).sort()) {
    const data = fs.readFileSync(path.join(dir, name)), packed = zlib.deflateRawSync(data, {level:9}), nameBuf = Buffer.from(name, 'utf8'), crc = crc32(data);
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
    head.writeUInt16LE(DOS_TIME, 10); head.writeUInt16LE(DOS_DATE, 12); head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(DOS_TIME, 12); cen.writeUInt16LE(DOS_DATE, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt32LE(offset, 42);
    local.push(head, nameBuf, packed); central.push(cen, nameBuf);
    offset += head.length + nameBuf.length + packed.length;
  }
  const cenSize = central.reduce((a, b) => a + b.length, 0), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10); end.writeUInt32LE(cenSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, ...central, end]);
}
const extZip = zipFolder(path.join(ROOT, 'extension'));
fs.writeFileSync(path.join(OUT, 'visionpilot-ai-bridge-extension.zip'), extZip);
fs.writeFileSync(path.join(ROOT, 'visionpilot-ai-bridge-extension.zip'), extZip); // keep the repo copy the same
console.log(`extension zip: ${fs.readdirSync(path.join(ROOT, 'extension')).length} files, ${Math.round(extZip.length / 1024)} KB`);

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
