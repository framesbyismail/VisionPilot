// Vision Pilot desktop — updates from GitHub on every start.
// The GitHub repo is published to GitHub Pages together with version.json (every file with its SHA-256).
// On start the app reads that list, downloads only the files that changed, checks each one, then switches to the new copy.
// If anything fails (offline, bad file) it keeps running the copy it already has.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REMOTE = process.env.VP_UPDATE_URL || 'https://framesbyismail.github.io/VisionPilot/';
const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const readJson = p => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };

async function fetchWithTimeout(url, ms, asBuffer = false) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, {signal:ctl.signal, cache:'no-store', headers:{'user-agent':'VisionPilot-Desktop'}});
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return asBuffer ? Buffer.from(await r.arrayBuffer()) : await r.json();
  } finally { clearTimeout(t); }
}

// the folder to serve: the newest good download, else the copy shipped with the app
function activeSiteDir(userData, bundled) {
  const cur = path.join(userData, 'site-current');
  if (fs.existsSync(path.join(cur, 'index.html')) && readJson(path.join(cur, 'version.json'))) return cur;
  return bundled;
}

// onStatus({text, pct}) — pct is 0..100 of the update step only
async function checkAndUpdate({userData, bundled, onStatus = () => {}}) {
  const active = activeSiteDir(userData, bundled);
  const local = readJson(path.join(active, 'version.json')) || {version:'none', files:{}};
  onStatus({text:'Checking GitHub for updates…', pct:5});
  let remote;
  try { remote = await fetchWithTimeout(REMOTE + 'version.json?t=' + Date.now(), 7000); }
  catch (e) { onStatus({text:'Offline — starting the installed version', pct:100}); return {updated:false, offline:true, dir:active, version:local.version, error:e.message}; }
  if (!remote || !remote.files) { onStatus({text:'Starting…', pct:100}); return {updated:false, dir:active, version:local.version}; }
  if (remote.version === local.version) { onStatus({text:`Up to date (${String(remote.version).slice(0, 7)})`, pct:100}); return {updated:false, dir:active, version:local.version}; }

  // build the next copy: unchanged files are copied from the current one, changed ones downloaded and checked
  const next = path.join(userData, 'site-next');
  fs.rmSync(next, {recursive:true, force:true});
  const names = Object.keys(remote.files);
  const changed = names.filter(n => (local.files || {})[n] !== remote.files[n]);
  let done = 0;
  try {
    for (const n of names) {
      const dest = path.join(next, n);
      if (!dest.startsWith(next)) continue; // never write outside the update folder
      fs.mkdirSync(path.dirname(dest), {recursive:true});
      const src = path.join(active, n);
      if (!changed.includes(n) && fs.existsSync(src)) { fs.copyFileSync(src, dest); continue; }
      const buf = await fetchWithTimeout(REMOTE + n.split('/').map(encodeURIComponent).join('/') + '?v=' + remote.files[n].slice(0, 12), 120000, true);
      if (sha256(buf) !== remote.files[n]) throw new Error('Checksum mismatch for ' + n);
      fs.writeFileSync(dest, buf);
      done++;
      onStatus({text:`Downloading update ${done}/${changed.length}…`, pct:10 + 85 * done / Math.max(1, changed.length)});
    }
    fs.writeFileSync(path.join(next, 'version.json'), JSON.stringify(remote));
    const cur = path.join(userData, 'site-current'), old = path.join(userData, 'site-old');
    fs.rmSync(old, {recursive:true, force:true});
    if (fs.existsSync(cur)) fs.renameSync(cur, old);
    fs.renameSync(next, cur);
    fs.rmSync(old, {recursive:true, force:true});
    onStatus({text:`Updated to ${String(remote.version).slice(0, 7)} (${changed.length} file${changed.length === 1 ? '' : 's'})`, pct:100});
    return {updated:true, dir:cur, version:remote.version, files:changed.length};
  } catch (e) {
    fs.rmSync(next, {recursive:true, force:true});
    onStatus({text:'Update failed — starting the installed version', pct:100});
    return {updated:false, dir:active, version:local.version, error:e.message};
  }
}

module.exports = {checkAndUpdate, activeSiteDir, REMOTE};
