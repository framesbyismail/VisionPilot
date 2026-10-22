/* VisionPilot — video mode: 3D proxy scene, Cinema 4D style keyframes + timeline, viewport export, video prompt */
(() => {
const AC = window.AC; if (!AC) return;
const {S, $, rad, clamp, norm360, signed, rnd, cap, joinList, esc, escAttr, hooks} = AC;
const V = () => S.video;

/* ---------- easing (animation principles) ---------- */
const back = 1.70158, back2 = back * 1.525;
const bounceOut = t => { const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; };
const EASES = {
  easeInOut:{name:'Ease In & Out (slow in, slow out)', f:t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2, desc:'slow in and slow out'},
  linear:{name:'Linear', f:t => t, desc:'constant speed'},
  easeIn:{name:'Ease In (slow start)', f:t => t * t * t, desc:'starts slowly and accelerates'},
  easeOut:{name:'Ease Out (slow stop)', f:t => 1 - (1 - t) ** 3, desc:'decelerates into the end'},
  smooth:{name:'Smooth (sine)', f:t => -(Math.cos(Math.PI * t) - 1) / 2, desc:'gentle sine easing'},
  anticipate:{name:'Anticipation (back in)', f:t => (back + 1) * t ** 3 - back * t * t, desc:'pulls back slightly before moving (anticipation)'},
  overshoot:{name:'Overshoot (follow-through)', f:t => 1 + (back + 1) * (t - 1) ** 3 + back * (t - 1) ** 2, desc:'overshoots and settles back (follow-through)'},
  backInOut:{name:'Anticipation + overshoot', f:t => t < .5 ? ((2 * t) ** 2 * ((back2 + 1) * 2 * t - back2)) / 2 : ((2 * t - 2) ** 2 * ((back2 + 1) * (t * 2 - 2) + back2) + 2) / 2, desc:'anticipates, then overshoots and settles'},
  bounce:{name:'Bounce', f:bounceOut, desc:'bounces into place'},
  elastic:{name:'Elastic', f:t => t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI) / 3) + 1, desc:'springy elastic settle'},
  hold:{name:'Hold (step)', f:t => t < 1 ? 0 : 1, desc:'holds, then cuts'},
  custom:{name:'Custom curve (graph editor)', f:t => t, desc:'follows a custom speed curve'}
};
// cubic-bezier versions of the presets: a graph editor curve starts from these
const BZ = {linear:[1 / 3, 1 / 3, 2 / 3, 2 / 3], easeInOut:[.65, 0, .35, 1], easeIn:[.32, 0, .67, 0], easeOut:[.33, 1, .68, 1], smooth:[.37, 0, .63, 1],
  anticipate:[.36, 0, .66, -.56], overshoot:[.34, 1.56, .64, 1], backInOut:[.68, -.6, .32, 1.6]};
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = t => ((ax * t + bx) * t + cx) * t, sy = t => ((ay * t + by) * t + cy) * t, dx = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) { const e = sx(t) - x; if (Math.abs(e) < 1e-6) return sy(t); const d = dx(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    while (hi - lo > 1e-6) { if (sx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
const bzCache = new WeakMap(); // a curve is rebuilt only when its bz array is replaced
function easeFn(k) {
  if (k.e === 'custom' && Array.isArray(k.bz)) { let f = bzCache.get(k.bz); if (!f) { f = cubicBezier(...k.bz); bzCache.set(k.bz, f); } return f; }
  return (EASES[k.e] || EASES.easeInOut).f;
}
function setKeyEase(k, e) {
  if (e === 'custom' && !(k.e === 'custom' && k.bz)) k.bz = (BZ[k.e] || BZ.easeInOut).slice();
  k.e = e;
}
const easeClass = e => e === 'linear' ? '' : e === 'hold' ? 'hold' : 'ease';

/* ---------- objects ---------- */
const MODELS = {person:'Person', car:'Car', phone:'Phone', box:'Box', sphere:'Sphere', cylinder:'Cylinder', cone:'Cone', torus:'Torus', capsule:'Capsule', animal:'Animal', image:'Image card'};
const PALETTE = ['#e85d2b', '#3f7cf6', '#3fb950', '#d4a72c', '#a371f7', '#e5484d', '#2bb3c0', '#c8c8c8'];
let oid = 0;
function modelFor(s) {
  if (s.type === 'car') return 'car';
  if (s.type === 'phone') return 'phone';
  if (s.type === 'person') return 'person';
  if (s.type === 'vehicle') return 'car';
  if (s.type === 'animal') return 'animal';
  if (/phone|mobile|smartphone|iphone|pixel|galaxy/i.test(s.desc || '')) return 'phone';
  if (s.type === 'product' || s.type === 'object') return 'box';
  return 'capsule';
}
function widthFor(model, h) {
  return {person:Math.max(.3, h * .29), car:Math.max(2, h * 3), phone:h * .48, box:h * .7, sphere:h, cylinder:h * .5, cone:h * .6, torus:h, capsule:h * .4, animal:h * 1.5, image:h * .7}[model] || h * .6;
}
function newObject(model, label, h, extra = {}) {
  h = h || {person:1.75, car:1.5, phone:.16, animal:.6}[model] || .5;
  return {id:'o' + Date.now().toString(36) + (++oid), label, model, h:rnd(h, 3), w:rnd(widthFor(model, h), 3), color:PALETTE[V().objects.length % PALETTE.length],
    x:0, z:0, y:0, ry:0, img:-1, auto:false, ...extra};
}
function syncObjectsFromSubjects() {
  const subs = AC.allSubjects(), objs = V().objects;
  V().objects = objs.filter(o => !o.auto || subs.some(s => s.label === o.label));
  subs.forEach(s => {
    const ex = V().objects.find(o => o.label === s.label);
    if (ex) { if (ex.auto && s.img >= 0) ex.img = s.img; return; }
    V().objects.push(newObject(modelFor(s), s.label, (s.cm || AC.SUBJ[s.type]?.cm || 100) / 100, {auto:true, img:s.img}));
  });
  layoutAuto();
  if (!V().objects.find(o => o.id === sel)) sel = V().objects[0]?.id || null;
}
function layoutAuto() {
  const autos = V().objects.filter(o => o.auto && !o.placed);
  if (!autos.length) return;
  const gap = .35, total = autos.reduce((a, o) => a + o.w, 0) + gap * (autos.length - 1);
  let x = -total / 2;
  autos.forEach(o => { o.x = rnd(x + o.w / 2, 3); x += o.w + gap; o.placed = true; });
}
let sel = null;
const objById = id => V().objects.find(o => o.id === id);
const objByLabel = l => V().objects.find(o => o.label === l);

/* ---------- animatable properties ---------- */
function props() {
  const P = [
    {path:'cam.az', group:'Camera', name:'Orbit', kind:'angle', get:() => S.az, set:v => AC.setAz(v), fmt:v => Math.round(signed(v)) + '°'},
    {path:'cam.el', group:'Camera', name:'Tilt', kind:'num', get:() => S.el, set:v => AC.setEl(v), fmt:v => Math.round(v) + '°'},
    {path:'cam.dist', group:'Camera', name:'Distance', kind:'num', get:() => S.dist, set:v => AC.setDist(v), fmt:v => AC.mStr(v)},
    {path:'cam.roll', group:'Camera', name:'Dutch roll', kind:'num', get:() => S.roll, set:v => { S.roll = clamp(v, -45, 45); }, fmt:v => Math.round(v) + '°'},
    {path:'cam.focal', group:'Camera', name:'Focal length', kind:'num', get:() => S.focal, set:v => AC.setFocal(v), fmt:v => Math.round(v) + ' mm'},
    {path:'cam.sensor', group:'Camera', name:'Sensor size', kind:'num', get:() => S.sensorW, set:v => { S.sensorW = clamp(v, 1, 100); }, fmt:v => rnd(v, 1) + ' mm'},
    {path:'focus', group:'Focus point', name:'Focus subject', kind:'target', get:() => S.focus.on ? S.focus.target : '', set:v => { S.focus.target = v; if (v) S.focus.on = true; }, fmt:v => v || 'Custom point'},
    ...['x', 'y', 'z'].map(a => ({path:'focus.' + a, group:'Focus point', name:'Focus ' + a.toUpperCase(), kind:'num', get:() => fpos()[a], set:v => { fpos()[a] = v; }, fmt:v => rnd(v, 2) + ' m'}))
  ];
  V().objects.forEach(o => {
    const g = 'obj:' + o.id;
    const mk = (key, name, kind, fmt) => ({path:`obj.${o.id}.${key}`, group:g, name, kind, get:() => o[key], set:v => { o[key] = v; }, fmt});
    P.push(mk('x', 'Position X', 'num', v => rnd(v, 2) + ' m'), mk('z', 'Position Z', 'num', v => rnd(v, 2) + ' m'),
      mk('y', 'Lift Y', 'num', v => rnd(v, 2) + ' m'), mk('ry', 'Rotation', 'angle', v => Math.round(signed(v)) + '°'),
      mk('h', 'Height', 'num', v => rnd(v, 2) + ' m'), mk('w', 'Width', 'num', v => rnd(v, 2) + ' m'), mk('color', 'Color', 'color', v => v));
  });
  return P;
}
function fpos() { if (!S.focus.pos) S.focus.pos = {x:0, y:AC.calc().subjH / 2, z:0}; return S.focus.pos; }
const COMPOSITE = {'cam.pos':['cam.az', 'cam.el', 'cam.dist'], 'focus.pos':['focus.x', 'focus.y', 'focus.z']};
const groupName = g => g.startsWith('obj:') ? (objById(g.slice(4))?.label || 'Object') : g;
const tracks = () => V().tracks;
function cleanTracks() {
  const live = new Set(props().map(p => p.path));
  Object.keys(tracks()).forEach(k => { if (!live.has(k) || !tracks()[k].length) delete tracks()[k]; });
}

/* ---------- interpolation ---------- */
const hexToRgb = h => { const n = parseInt(String(h).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbToHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function seg(keys, t) {
  if (t <= keys[0].t) return {a:keys[0], b:keys[0], e:0};
  const last = keys[keys.length - 1];
  if (t >= last.t) return {a:last, b:last, e:0};
  let i = 0; while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1], u = (t - a.t) / (b.t - a.t || 1);
  return {a, b, e:easeFn(a)(u)};
}
function valueAt(path, t, kind, base) {
  const keys = tracks()[path];
  if (!keys || !keys.length) return base;
  const {a, b, e} = seg(keys, t);
  if (kind === 'target') return a === b ? a.v : e < .5 ? a.v : b.v;
  if (kind === 'color') { const x = hexToRgb(a.v), y = hexToRgb(b.v); return rgbToHex(x.map((v, i) => v + (y[i] - v) * e)); }
  return a.v + (b.v - a.v) * e;
}

/* ---------- time + application ---------- */
let T = 0, playing = false, lastApplied = {}, applying = false;
const fps = () => V().fps;
const frameDur = () => 1 / fps();
const snap = t => Math.round(t * fps()) / fps();
const frameOf = t => Math.round(t * fps());
const endFrame = () => Math.round(V().duration * fps());
const tc = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
function apply(t) {
  applying = true;
  const P = props();
  AC.applyQuiet(() => { P.forEach(p => { if (tracks()[p.path]?.length) p.set(valueAt(p.path, t, p.kind, p.get())); }); });
  lastApplied = {};
  P.forEach(p => { if (tracks()[p.path]?.length) lastApplied[p.path] = p.get(); });
  applying = false;
}
function setTime(t) { T = clamp(snap(t), 0, V().duration); apply(T); updateTimeUI(); }
// auto keying: changing an animated value records a key at the current frame
function autoKey() {
  if (S.app !== 'video' || applying || playing || !V().autokey) return;
  let any = false;
  props().forEach(p => {
    const keys = tracks()[p.path]; if (!keys?.length) return;
    const cur = p.get(), prev = lastApplied[p.path];
    const same = p.kind === 'num' || p.kind === 'angle' ? Math.abs(cur - prev) < 1e-6 || (p.kind === 'angle' && Math.abs(norm360(cur) - norm360(prev)) < 1e-6) : cur === prev;
    if (same) return;
    upsertKey(p.path, T, keyValue(p)); lastApplied[p.path] = cur; any = true;
  });
  if (any) buildTimeline();
}
function keyValue(p) {
  const cur = p.get();
  if (p.kind !== 'angle' || !tracks()[p.path]?.length) return cur;
  const base = valueAt(p.path, T, 'num', cur); return base + signed(cur - base);
}
function upsertKey(path, t, v, e) {
  const keys = tracks()[path] || (tracks()[path] = []);
  const ex = keys.find(k => Math.abs(k.t - t) < frameDur() / 2);
  if (ex) { ex.v = v; if (e) ex.e = e; return ex; }
  const prev = [...keys].reverse().find(k => k.t < t);
  const k = {t:snap(t), v, e:e || prev?.e || 'easeInOut'};
  if (k.e === 'custom') k.bz = (prev?.bz || BZ.easeInOut).slice();
  keys.push(k); keys.sort((a, b) => a.t - b.t);
  return k;
}
const keyHere = path => (tracks()[path] || []).find(k => Math.abs(k.t - T) < frameDur() / 2);
// C4D style key button: click adds a key on this frame, click again removes it
function keyToggle(path) {
  if (S.app !== 'video') return;
  if (COMPOSITE[path]) {
    const parts = COMPOSITE[path], here = parts.filter(q => keyHere(q));
    if (path === 'focus.pos' && !here.length) {
      // keying the point turns the focus into a custom point at the current aim
      const tg = targetAt(T); Object.assign(fpos(), {x:rnd(tg.x, 3), y:rnd(tg.y, 3), z:rnd(tg.z, 3)});
      S.focus.on = true; S.focus.target = '';
      if (tracks().focus?.length) upsertKey('focus', T, '');
    }
    if (here.length) here.forEach(q => { const keys = tracks()[q], k = keyHere(q); keys.splice(keys.indexOf(k), 1); if (!keys.length) delete tracks()[q]; });
    else parts.forEach(q => { const pp = props().find(x => x.path === q); upsertKey(q, T, keyValue(pp)); lastApplied[q] = pp.get(); });
    AC.toast(`${path === 'cam.pos' ? 'Camera position' : 'Focus point position'}: key ${here.length ? 'removed' : 'added'} at frame ${frameOf(T)}`);
    buildTimeline(); AC.save(); AC.changed(); return;
  }
  const p = props().find(x => x.path === path); if (!p) return;
  const ex = keyHere(path);
  if (ex) {
    const keys = tracks()[path]; keys.splice(keys.indexOf(ex), 1);
    if (!keys.length) delete tracks()[path];
    if (selKey?.k === ex) selKey = null;
    AC.toast(`${p.name}: key removed at frame ${frameOf(T)}`);
  } else {
    if (path === 'focus' && !S.focus.on) S.focus.on = true;
    upsertKey(path, T, keyValue(p)); lastApplied[path] = p.get();
    AC.toast(`${p.name}: key at frame ${frameOf(T)}`);
  }
  buildTimeline(); AC.save(); AC.changed();
}
function recordAll() {
  ['cam.az', 'cam.el', 'cam.dist', 'cam.roll', 'cam.focal'].concat(S.focus.on ? ['focus'] : []).forEach(path => {
    const p = props().find(x => x.path === path); upsertKey(path, T, keyValue(p)); lastApplied[path] = p.get();
  });
  buildTimeline(); AC.save(); AC.changed(); AC.toast(`Camera keyed at frame ${frameOf(T)}`);
}
const allKeyTimes = () => [...new Set(Object.values(tracks()).flat().map(k => rnd(k.t, 4)))].sort((a, b) => a - b);
// timeline layers: the power slider shows and edits only the chosen groups (Camera, Focus point, each object)
const groupOfPath = p => p.startsWith('cam.') ? 'Camera' : p === 'focus' || p.startsWith('focus.') ? 'Focus point' : p.startsWith('obj.') ? 'obj:' + p.split('.')[1] : p;
const kFilter = new Set(); // empty = every group
const inFilter = p => !kFilter.size || kFilter.has(groupOfPath(p));
const fKeys = () => Object.entries(tracks()).filter(([p]) => inFilter(p)).flatMap(([, ks]) => ks);
const fKeyTimes = () => [...new Set(fKeys().map(k => rnd(k.t, 4)))].sort((a, b) => a - b);
const fKeysAt = t => fKeys().filter(k => Math.abs(k.t - t) < 1e-4);

/* ---------- camera target + scene helpers ---------- */
function objCenter(o, t) { const g = k => valueAt(`obj.${o.id}.${k}`, t, 'num', o[k]); return {x:g('x'), y:g('y') + g('h') / 2, z:g('z')}; }
function centroid(t) {
  const os = V().objects; if (!os.length) return {x:0, y:AC.calc().subjH / 2, z:0};
  const c = os.map(o => objCenter(o, t));
  return {x:c.reduce((a, p) => a + p.x, 0) / c.length, y:c.reduce((a, p) => a + p.y, 0) / c.length, z:c.reduce((a, p) => a + p.z, 0) / c.length};
}
function targetAt(t) {
  const keys = tracks().focus;
  const custom = () => ({x:valueAt('focus.x', t, 'num', fpos().x), y:valueAt('focus.y', t, 'num', fpos().y), z:valueAt('focus.z', t, 'num', fpos().z)});
  const pos = label => { const o = label && objByLabel(label); return o ? objCenter(o, t) : S.focus.on ? custom() : centroid(t); };
  if (keys?.length) {
    const {a, b, e} = seg(keys, t);
    const pa = pos(a.v), pb = pos(b.v);
    return {x:pa.x + (pb.x - pa.x) * e, y:pa.y + (pb.y - pa.y) * e, z:pa.z + (pb.z - pa.z) * e};
  }
  return S.focus.on && S.focus.target ? pos(S.focus.target) : centroid(t);
}
function camAt(t) {
  const v = (path, base) => valueAt(path, t, 'num', base);
  return {az:v('cam.az', S.az), el:v('cam.el', S.el), dist:v('cam.dist', S.dist), roll:v('cam.roll', S.roll), focal:v('cam.focal', S.focal), sensor:v('cam.sensor', S.sensorW)};
}
function camWorld(t) {
  const c = camAt(t), tg = targetAt(t), a = rad(c.az), e = rad(clamp(c.el, -89.5, 89.5));
  return {x:tg.x + Math.sin(a) * Math.cos(e) * c.dist, y:tg.y + Math.sin(e) * c.dist, z:tg.z + Math.cos(a) * Math.cos(e) * c.dist};
}
const isVideo = () => S.app === 'video';
hooks.target = () => isVideo() ? targetAt(T) : null;
hooks.sceneExtent = view => {
  if (!isVideo() || !V().objects.length) return null;
  const tg = targetAt(T);
  return Math.max(...V().objects.map(o => view === 'top' ? Math.hypot(o.x - tg.x, o.z - tg.z) + o.w / 2 : Math.max(o.h + o.y, Math.hypot(o.x - tg.x, o.z - tg.z) + o.w / 2))) * 1.1;
};
function depthFor(o) { return {person:.3, car:o.w * .42, phone:.012, sphere:o.w, cylinder:o.w, cone:o.w, torus:o.h * .25, capsule:o.w, animal:o.w * .4, image:.02, box:o.w * .6}[o.model] ?? o.w * .6; }
// labels skip themselves when they would overlap one already drawn
function labelPainter(ctx) {
  const boxes = [];
  ctx.font = '10px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
  return (text, x, y, force) => {
    const w = ctx.measureText(text).width + 6, b = {l:x - w / 2, r:x + w / 2, t:y - 11, b:y + 2};
    if (!force && boxes.some(o => b.l < o.r && b.r > o.l && b.t < o.b && b.b > o.t)) return;
    boxes.push(b); ctx.fillStyle = AC.C.panel; ctx.globalAlpha = .75; ctx.fillRect(b.l, b.t, w, 13); ctx.globalAlpha = 1;
    ctx.fillStyle = AC.C.fg; ctx.fillText(text, x, y);
  };
}
hooks.drawTopScene = (ctx, v) => {
  if (!isVideo()) return false;
  const C = AC.C, tg = v.T, label = labelPainter(ctx), objs = [...V().objects].sort((a, b) => (a.id === sel) - (b.id === sel));
  objs.forEach(o => {
    const px = v.cx + (o.x - tg.x) * v.s, py = v.cy + (o.z - tg.z) * v.s;
    const w = Math.max(6, (o.model === 'car' ? o.w * .42 : o.w) * v.s), d = Math.max(4, (o.model === 'car' ? o.w : depthFor(o)) * v.s);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-rad(o.ry));
    ctx.fillStyle = o.color; ctx.globalAlpha = .55; ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.globalAlpha = 1; ctx.strokeStyle = o.id === sel ? C.green : C.fg; ctx.lineWidth = o.id === sel ? 2 : 1; ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.fillStyle = C.fg; ctx.beginPath(); ctx.moveTo(-4, d / 2 + 3); ctx.lineTo(4, d / 2 + 3); ctx.lineTo(0, d / 2 + 8); ctx.fill();
    ctx.restore();
  });
  [...objs].reverse().forEach(o => label(o.label, v.cx + (o.x - tg.x) * v.s, v.cy + (o.z - tg.z) * v.s - Math.max(4, depthFor(o) * v.s) / 2 - 6, o.id === sel));
  if (V().path) drawPath(ctx, v, 'top');
  return true;
};
hooks.drawSideScene = (ctx, v) => {
  if (!isVideo()) return false;
  const C = AC.C, tg = v.T, a = rad(S.az), ux = Math.sin(a), uz = Math.cos(a), groundY = v.cy + tg.y * v.s, label = labelPainter(ctx);
  const objs = [...V().objects].sort((p, q) => (p.id === sel) - (q.id === sel)), tops = [];
  objs.forEach(o => {
    const d = (o.x - tg.x) * ux + (o.z - tg.z) * uz;
    const px = v.cx - d * v.s, w = Math.max(6, o.w * v.s * .8), h = Math.max(6, o.h * v.s), top = groundY - (o.y + o.h) * v.s;
    ctx.fillStyle = o.color; ctx.globalAlpha = .55; ctx.fillRect(px - w / 2, top, w, h);
    ctx.globalAlpha = 1; ctx.strokeStyle = o.id === sel ? C.green : C.fg; ctx.lineWidth = o.id === sel ? 2 : 1; ctx.strokeRect(px - w / 2, top, w, h);
    tops.push([o, px, top]);
  });
  tops.reverse().forEach(([o, px, top]) => label(o.label, px, top - 5, o.id === sel));
  if (V().path) drawPath(ctx, v, 'side');
  return true;
};
function drawPath(ctx, v, kind) {
  if (!Object.keys(tracks()).length) return;
  const C = AC.C, tg = v.T, n = 90, dur = V().duration, a = rad(S.az), ux = Math.sin(a), uz = Math.cos(a);
  const toScr = p => kind === 'top' ? [v.cx + (p.x - tg.x) * v.s, v.cy + (p.z - tg.z) * v.s]
    : [v.cx - ((p.x - tg.x) * ux + (p.z - tg.z) * uz) * v.s, v.cy - (p.y - tg.y) * v.s];
  ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.globalAlpha = .85; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = toScr(camWorld(dur * i / n)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.accent;
  allKeyTimes().forEach(t => { const [x, y] = toScr(camWorld(t)); ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.fill(); });
  ctx.restore();
}

/* ---------- three.js viewport ---------- */
let R = null;
function aspectRatio() {
  const s = S.aspect === 'custom' ? S.aspectCustom : S.aspect;
  const m = String(s || '').match(/(\d+(?:\.\d+)?)\s*[:x×\/]\s*(\d+(?:\.\d+)?)/i);
  const r = m ? +m[1] / +m[2] : 4 / 5;
  return isFinite(r) && r > .2 && r < 5 ? r : 4 / 5;
}
function initThree() {
  if (R || !window.THREE) { if (!window.THREE) $('vpNote').textContent = '3D viewer could not load. Rig views and timeline still work.'; return; }
  const THREE = window.THREE;
  const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  $('vpFrame').prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2b2c30);
  scene.fog = new THREE.Fog(0x2b2c30, 25, 70);
  const camera = new THREE.PerspectiveCamera(40, 1, .005, 400);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a40, .45); scene.add(hemi);
  const lights = {};
  AC.ROLES.forEach((r, i) => {
    const l = new THREE.DirectionalLight(0xffffff, 0);
    if (i === 0) { l.castShadow = true; l.shadow.mapSize.set(2048, 2048); Object.assign(l.shadow.camera, {left:-8, right:8, top:8, bottom:-8, near:.2, far:60}); }
    scene.add(l); scene.add(l.target); lights[r.id] = l;
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({color:0x3b3c41, roughness:.95}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(40, 40, 0x666870, 0x46474d); grid.position.y = .001; scene.add(grid);
  R = {THREE, renderer, scene, camera, lights, hemi, ground, grid, objs:new Map()};
  new ResizeObserver(() => renderVP()).observe($('vpWrap'));
  // zoom the camera with the scroll wheel here (and only here)
  $('vpWrap').addEventListener('wheel', e => { e.preventDefault(); AC.setDist(S.dist * Math.exp(e.deltaY * .0012)); AC.changed(); }, {passive:false});
}
function mat(color, o = {}) { return new R.THREE.MeshStandardMaterial({color, roughness:.6, metalness:.05, ...o}); }
function addMesh(g, geo, m, x, y, z) { const me = new R.THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; }
function buildModel(o) {
  const THREE = R.THREE, g = new THREE.Group(), h = o.h, w = o.w, c = o.color, m = mat(c);
  switch (o.model) {
    case 'person': {
      const sx = w / (h * .29), skin = mat(0xd9b38c), dark = mat(new THREE.Color(c).multiplyScalar(.55));
      const leg = new THREE.CylinderGeometry(h * .045, h * .035, h * .47, 12);
      addMesh(g, leg, dark, -h * .055, h * .235, 0); addMesh(g, leg, dark, h * .055, h * .235, 0);
      addMesh(g, new THREE.CylinderGeometry(h * .11, h * .09, h * .33, 16), m, 0, h * .63, 0);
      const arm = new THREE.CylinderGeometry(h * .03, h * .025, h * .33, 10);
      const a1 = addMesh(g, arm, m, -h * .14, h * .62, 0), a2 = addMesh(g, arm, m, h * .14, h * .62, 0);
      a1.rotation.z = -.12; a2.rotation.z = .12;
      addMesh(g, new THREE.CylinderGeometry(h * .025, h * .03, h * .05, 10), skin, 0, h * .815, 0);
      addMesh(g, new THREE.SphereGeometry(h * .068, 20, 16), skin, 0, h * .9, 0);
      addMesh(g, new THREE.SphereGeometry(h * .012, 8, 6), mat(0x222222), 0, h * .905, h * .066);
      g.scale.x = clamp(sx, .5, 2.5);
      break;
    }
    case 'car': {
      const L = w, W = Math.max(1.4, w * .42), body = h * .5;
      addMesh(g, new THREE.BoxGeometry(W, body * .75, L), m, 0, h * .18 + body * .375, 0);
      addMesh(g, new THREE.BoxGeometry(W * .88, h * .38, L * .5), mat(0x223040, {metalness:.3, roughness:.2}), 0, h * .18 + body * .75 + h * .19, -L * .05);
      const wheel = new THREE.CylinderGeometry(h * .18, h * .18, W * .16, 20), wm = mat(0x151515);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const wh = addMesh(g, wheel, wm, sx * W * .45, h * .18, sz * L * .32); wh.rotation.z = Math.PI / 2; });
      addMesh(g, new THREE.BoxGeometry(W * .7, h * .06, .02), mat(0xffffcc, {emissive:0x555533}), 0, h * .4, L / 2 + .01);
      break;
    }
    case 'phone': {
      const d = Math.max(.006, w * .1);
      addMesh(g, new THREE.BoxGeometry(w, h, d), m, 0, h / 2, 0);
      addMesh(g, new THREE.PlaneGeometry(w * .9, h * .93), mat(0x0a0a0c, {roughness:.15, metalness:.4}), 0, h / 2, d / 2 + .0005);
      addMesh(g, new THREE.BoxGeometry(w * .38, w * .38, d * .6), mat(0x202020), -w * .22, h * .82, -d / 2 - d * .3);
      break;
    }
    case 'sphere': { const s = addMesh(g, new THREE.SphereGeometry(h / 2, 32, 24), m, 0, h / 2, 0); s.scale.x = s.scale.z = w / h; break; }
    case 'cylinder': addMesh(g, new THREE.CylinderGeometry(w / 2, w / 2, h, 32), m, 0, h / 2, 0); break;
    case 'cone': addMesh(g, new THREE.ConeGeometry(w / 2, h, 32), m, 0, h / 2, 0); break;
    case 'torus': { const t = addMesh(g, new THREE.TorusGeometry(h * .36, h * .13, 16, 40), m, 0, h / 2, 0); t.scale.x = w / h; break; }
    case 'capsule': {
      const r = w / 2, body = Math.max(.001, h - w);
      addMesh(g, new THREE.CylinderGeometry(r, r, body, 24), m, 0, r + body / 2, 0);
      addMesh(g, new THREE.SphereGeometry(r, 24, 12), m, 0, r + body, 0); addMesh(g, new THREE.SphereGeometry(r, 24, 12), m, 0, r, 0);
      break;
    }
    case 'animal': {
      const L = w, body = addMesh(g, new THREE.SphereGeometry(.5, 24, 16), m, 0, h * .62, 0); body.scale.set(L * .32, h * .38, L * .5);
      const leg = new THREE.CylinderGeometry(h * .06, h * .05, h * .45, 10);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => addMesh(g, leg, m, sx * L * .1, h * .225, sz * L * .28));
      addMesh(g, new THREE.SphereGeometry(h * .17, 18, 14), m, 0, h * .85, L * .42);
      break;
    }
    case 'image': {
      const ref = AC.refs[o.img], img = ref?.img;
      const ar = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : .7;
      let mm = mat(0x888888);
      if (img && img.naturalWidth) {
        const tx = new THREE.Texture(img); tx.needsUpdate = true; tx.encoding = THREE.sRGBEncoding;
        // transparent PNG: empty pixels stay empty
        mm = new THREE.MeshStandardMaterial({map:tx, side:THREE.DoubleSide, roughness:.9, transparent:!!ref.alpha, alphaTest:ref.alpha ? .05 : 0});
      }
      const p = addMesh(g, new THREE.PlaneGeometry(h * ar, h), mm, 0, h / 2, 0); p.castShadow = false;
      break;
    }
    default: addMesh(g, new THREE.BoxGeometry(w, h, depthFor(o)), m, 0, h / 2, 0);
  }
  return g;
}
function syncScene() {
  const live = new Set();
  V().objects.forEach(o => {
    live.add(o.id);
    const ref = AC.refs[o.img];
    const sig = [o.model, rnd(o.h, 3), rnd(o.w, 3), o.color, o.img, o.model === 'image' ? (ref ? ref.id + ':' + (ref.img.naturalWidth || 0) : 'none') : ''].join('|');
    let e = R.objs.get(o.id);
    if (!e || e.sig !== sig) { if (e) R.scene.remove(e.g); e = {g:buildModel(o), sig}; R.scene.add(e.g); R.objs.set(o.id, e); }
    e.g.position.set(o.x, o.y, o.z); e.g.rotation.y = rad(o.ry);
  });
  R.objs.forEach((e, id) => { if (!live.has(id)) { R.scene.remove(e.g); R.objs.delete(id); } });
}
function renderVP(sizeOverride) {
  if (!isVideo() || !R) return;
  const ar = aspectRatio();
  let w, h;
  if (sizeOverride) ({w, h} = sizeOverride);
  else {
    const box = $('vpWrap'); const bw = box.clientWidth - 16, bh = box.clientHeight - 16;
    if (bw < 20 || bh < 20) return;
    w = Math.min(bw, bh * ar); h = w / ar;
  }
  if (sizeOverride) R.renderer.setPixelRatio(1); else R.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  R.renderer.setSize(Math.round(w), Math.round(h), !sizeOverride);
  syncScene();
  R.ground.visible = R.grid.visible = V().ground !== false;
  const k = AC.calc(), tg = targetAt(T), a = rad(S.az), e = rad(S.el);
  R.camera.fov = k.vfov; R.camera.aspect = w / h; R.camera.near = Math.max(.002, S.dist * .02); R.camera.updateProjectionMatrix();
  R.camera.position.set(tg.x + Math.sin(a) * Math.cos(e) * S.dist, tg.y + Math.sin(e) * S.dist, tg.z + Math.cos(a) * Math.cos(e) * S.dist);
  R.camera.up.set(0, 1, 0); R.camera.lookAt(tg.x, tg.y, tg.z); R.camera.rotateZ(-rad(S.roll));
  // the lighting rig drives the viewer lights (default: a soft key and fill)
  const rig = S.lightOn ? S.lights : {key:{on:true, az:45, el:40, pow:100, k:5600, hard:40}, fill:{on:true, az:-45, el:15, pow:40, k:5600, hard:10}};
  AC.ROLES.forEach(r => {
    const L = rig[r.id], l = R.lights[r.id];
    if (!L || !L.on) { l.intensity = 0; return; }
    const la = rad(L.az), le = rad(clamp(L.el, -30, 89)), ld = 12;
    l.position.set(tg.x + Math.sin(la) * Math.cos(le) * ld, Math.max(.3, tg.y + Math.sin(le) * ld), tg.z + Math.cos(la) * Math.cos(le) * ld);
    l.target.position.set(tg.x, tg.y, tg.z);
    const [cr, cg, cb] = AC.kelvinRGB(L.k); l.color.setRGB(cr / 255, cg / 255, cb / 255);
    l.intensity = 1.2 * L.pow / 100;
  });
  R.hemi.intensity = S.lightOn ? .2 + (1 - (S.lights.key?.hard ?? 40) / 100) * .3 : .45;
  R.renderer.render(R.scene, R.camera);
  $('vpGuides').hidden = !V().guides;
  // focus marker on the viewer (never exported: it sits outside the canvas)
  const f = $('vpFocus');
  if (S.focus.on && !sizeOverride) {
    const p = new R.THREE.Vector3(tg.x, tg.y, tg.z).project(R.camera);
    f.hidden = p.z > 1;
    f.style.left = ((p.x + 1) / 2 * w) + 'px'; f.style.top = ((1 - p.y) / 2 * h) + 'px';
    $('vpFocusLab').textContent = (valueAt('focus', T, 'target', S.focus.target) || 'Focus point') + (S.focus.note ? ' · ' + S.focus.note : '');
  } else f.hidden = true;
}
hooks.render = () => renderVP();

/* ---------- scene objects panel (with a fixed camera entry) ---------- */
const CAM_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1" y="4" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m11 7 4-2v6l-4-2z" fill="currentColor"/></svg>';
let objPropsKey = '';
const kb = (path, label) => `<button class="kb" data-kp="${path}" aria-label="Keyframe ${escAttr(label)}"></button>`;
function numField(id, label, path, step, min, max, attr) {
  return `<div class="field"><div class="labrow"><label for="${id}">${kb(path, label)}${label}</label></div><input type="number" id="${id}" ${attr} step="${step}" min="${min}" max="${max}"></div>`;
}
function renderObjects() {
  $('objList').innerHTML = V().objects.map(o => `<button class="objrow" data-oid="${o.id}" aria-pressed="${o.id === sel}"><span class="sw" style="background:${escAttr(o.color)}"></span>${esc(o.label)}<span class="m">${MODELS[o.model]}</span></button>`).join('');
  const o = objById(sel);
  const key = o ? o.id + o.model + AC.refs.length : 'none';
  if (key !== objPropsKey) {
    objPropsKey = key;
    if (sel === 'camera') {
      $('objProps').innerHTML = `<div class="sep"></div>
        <p class="hint">The camera's orbit, tilt, distance, roll and X / Y / Z position are in the Camera angle panel; focal length and sensor are in Camera &amp; lens. The camera can't be deleted.</p>
        <div class="row"><button class="btn ghost sm" id="openCamAngle" style="flex:none">Open Camera angle</button><button class="btn ghost sm" id="openCamLens" style="flex:none">Open Camera &amp; lens</button></div>`;
    } else if (!o) { $('objProps').innerHTML = ''; }
    else {
      const n = (k, label, step, min, max) => numField('op_' + k, label, `obj.${o.id}.${k}`, step, min, max, `data-ok="${k}"`);
      $('objProps').innerHTML = `<div class="sep"></div>
        <div class="field"><label for="op_label">Name</label><input type="text" id="op_label" data-ok="label"></div>
        <div class="grid2"><div class="field"><label for="op_model">Model</label><select id="op_model" data-ok="model">${Object.entries(MODELS).map(([k, nm]) => `<option value="${k}">${nm}</option>`).join('')}</select></div>
          <div class="field"><label for="op_img">Image</label><select id="op_img" data-ok="img"><option value="-1">None</option>${AC.refs.map((r, i) => `<option value="${i}">Image ${i + 1}${r.alpha ? ' (PNG)' : ''}</option>`).join('')}</select></div></div>
        <div class="grid2">${n('h', 'Height m', .01, .01, 50)}${n('w', 'Width m', .01, .01, 50)}</div>
        <div class="grid2">${n('x', 'Position X', .05, -100, 100)}${n('z', 'Position Z', .05, -100, 100)}</div>
        <div class="grid2">${n('y', 'Lift Y', .05, -10, 50)}${n('ry', 'Rotation °', 1, -720, 720)}</div>
        <div class="field"><div class="labrow"><label for="op_color">${kb(`obj.${o.id}.color`, 'Color')}Color</label></div><input type="color" id="op_color" data-ok="color"></div>
        <button class="btn ghost sm" id="objDel" style="align-self:flex-start;flex:none">Delete object</button>`;
      ['op_model', 'op_img'].forEach(id => AC.enhance($(id)));
    }
  }
  syncObjProps();
}
function syncObjProps() {
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el && !el.classList.contains('scrubbing')) el.value = v; };
  if (sel !== 'camera') {
    const o = objById(sel); if (!o || !$('op_label')) return;
    set('op_label', o.label); set('op_h', rnd(o.h, 3)); set('op_w', rnd(o.w, 3)); set('op_x', rnd(o.x, 3)); set('op_z', rnd(o.z, 3));
    set('op_y', rnd(o.y, 3)); set('op_ry', Math.round(o.ry)); set('op_color', o.color);
    if (!AC.refs[o.img]) o.img = -1;
    $('op_model').value = o.model; $('op_img').value = String(o.img); AC.refreshDD($('op_model')); AC.refreshDD($('op_img'));
  }
}
$('objList').addEventListener('click', e => { const b = e.target.closest('[data-oid]'); if (!b) return; sel = b.dataset.oid; renderObjects(); AC.changed(); });
$('objProps').addEventListener('input', e => {
  const cp = e.target.dataset.cp;
  if (cp) {
    const v = parseFloat(e.target.value); if (!isFinite(v)) return;
    if (cp === 'az') AC.setAz(v); else if (cp === 'el') AC.setEl(v); else if (cp === 'dist') AC.setDist(v);
    else if (cp === 'roll') S.roll = clamp(v, -45, 45); else if (cp === 'focal') AC.setFocal(v); else if (cp === 'sensor') S.sensorW = clamp(v, 1, 100);
    AC.changed(); return;
  }
  const k = e.target.dataset.ok, o = objById(sel); if (!k || !o) return;
  if (k === 'label') { const old = o.label; o.label = e.target.value || old; if (S.focus.target === old) S.focus.target = o.label;
    (tracks().focus || []).forEach(kf => { if (kf.v === old) kf.v = o.label; }); o.auto = false; buildTimeline(); }
  else if (k === 'color') o.color = e.target.value;
  else if (k !== 'model' && k !== 'img') { const v = parseFloat(e.target.value); if (isFinite(v)) o[k] = k === 'h' || k === 'w' ? Math.max(.01, v) : v; }
  o.placed = true; AC.changed();
});
$('objProps').addEventListener('change', e => {
  const k = e.target.dataset.ok, o = objById(sel); if (!o) return;
  if (k === 'model') { o.model = e.target.value; o.w = rnd(widthFor(o.model, o.h), 3); if (o.model === 'image' && o.img < 0 && AC.refs.length) o.img = 0; objPropsKey = ''; renderObjects(); AC.changed(); }
  if (k === 'img') { o.img = +e.target.value; AC.changed(); }
});
$('objProps').addEventListener('click', e => {
  if (e.target.closest('#openCamAngle')) { AC.showPanel('pAngle'); return; }
  if (e.target.closest('#openCamLens')) { AC.showPanel('pCam'); return; }
  if (!e.target.closest('#objDel')) return;
  const o = objById(sel); if (!o) return;
  V().objects = V().objects.filter(x => x !== o); cleanTracks();
  sel = V().objects[0]?.id || null; objPropsKey = ''; renderObjects(); buildTimeline(); AC.changed(); AC.toast(`${o.label} deleted`);
});
$('objAddModel').innerHTML = Object.entries(MODELS).map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
$('objAddModel').value = 'image';
AC.refreshDD($('objAddModel'));
$('objAdd').addEventListener('click', () => {
  const m = $('objAddModel').value, n = V().objects.filter(o => o.model === m).length + 1;
  // a new image card takes the next reference image that no card shows yet
  let img = -1;
  if (m === 'image' && AC.refs.length) {
    const used = new Set(V().objects.filter(o => o.model === 'image').map(o => o.img));
    img = AC.refs.findIndex((r, i) => !used.has(i)); if (img < 0) img = (n - 1) % AC.refs.length;
  }
  const o = newObject(m, `${MODELS[m]} ${n}`, null, {placed:true, img});
  if (m === 'image' && AC.refs[img]?.img.naturalWidth) o.w = rnd(o.h * AC.refs[img].img.naturalWidth / AC.refs[img].img.naturalHeight, 3);
  const tg = targetAt(T); o.x = rnd(tg.x + (V().objects.length ? .6 * V().objects.length : 0), 2); o.z = rnd(tg.z, 2);
  V().objects.push(o); sel = o.id; objPropsKey = ''; renderObjects(); buildTimeline(); AC.changed();
});

/* ---------- Cinema 4D style timeline ---------- */
let selKey = null; // {t} = every key on that frame (power slider) or {path, k} = one key (tracks)
function drawPower() {
  const c = $('powerC'); if (!c) return;
  const {ctx, w, h} = AC.fit(c), n = endFrame();
  if (w < 20) return;
  ctx.fillStyle = AC.C['panel-2']; ctx.fillRect(0, 30, w, h - 30);
  ctx.strokeStyle = AC.C.line; ctx.fillStyle = AC.C.muted; ctx.font = '11px "JetBrains Mono", monospace'; ctx.textBaseline = 'top';
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find(s => w / (n / s) > 42) || 100;
  for (let f = 0; f <= n; f++) {
    const x = Math.round(f / n * (w - 1)) + .5, major = f % step === 0;
    if (!major && w / n < 3) continue;
    ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, major ? 20 : 26); ctx.stroke();
    if (major) { ctx.textAlign = f === 0 ? 'left' : f === n ? 'right' : 'center'; ctx.fillText(String(f), x, 4); }
  }
}
function renderKeyGroups() {
  const box = $('kGroups'); if (!box) return;
  const counts = new Map();
  Object.entries(tracks()).forEach(([p, ks]) => { const g = groupOfPath(p); counts.set(g, (counts.get(g) || 0) + ks.length); });
  [...kFilter].forEach(g => { if (!counts.has(g)) kFilter.delete(g); });
  const order = ['Camera', 'Focus point', ...V().objects.map(o => 'obj:' + o.id)].filter(g => counts.has(g));
  if (!order.length) { box.innerHTML = ''; return; }
  const icon = g => g === 'Camera' ? CAM_ICON : `<span class="sw${g.startsWith('obj:') ? '' : ' fp'}"${g.startsWith('obj:') ? ` style="background:${escAttr(objById(g.slice(4))?.color || '#888')}"` : ''}></span>`;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  box.innerHTML = `<button class="kg" data-kg="" aria-pressed="${!kFilter.size}" title="Show and edit every keyframe">All<b>${total}</b></button>`
    + order.map(g => `<button class="kg" data-kg="${escAttr(g)}" aria-pressed="${kFilter.has(g)}" title="Show and edit ${escAttr(groupName(g))} keyframes (click more to combine)">${icon(g)}${esc(groupName(g))}<b>${counts.get(g)}</b></button>`).join('');
}
$('kGroups').addEventListener('click', e => {
  const b = e.target.closest('[data-kg]'); if (!b) return;
  const g = b.dataset.kg;
  if (!g) kFilter.clear();
  else {
    if (kFilter.has(g)) kFilter.delete(g); else kFilter.add(g);
    // picking an object layer also selects it in Scene objects so its values can be edited right away
    if (kFilter.has(g) && g.startsWith('obj:') && objById(g.slice(4))) { sel = g.slice(4); renderObjects(); }
    const live = new Set(Object.keys(tracks()).map(groupOfPath));
    if (live.size && [...live].every(x => kFilter.has(x))) kFilter.clear();
  }
  selKey = null; buildTimeline(); AC.changed();
});
function buildTimeline() {
  if (!isVideo()) return;
  cleanTracks();
  renderKeyGroups();
  const dur = V().duration, times = fKeyTimes();
  $('powerKeys').innerHTML = times.map(t => {
    const ks = fKeysAt(t), e = ks[0]?.e || 'easeInOut';
    return `<button class="pkey ${easeClass(e)}${selKey && selKey.t !== undefined && Math.abs(selKey.t - t) < 1e-4 ? ' sel' : ''}" data-pt="${t}" style="left:${t / dur * 100}%" title="Frame ${frameOf(t)} · ${ks.length} key${ks.length > 1 ? 's' : ''} · ${escAttr(EASES[e]?.name || '')}"><i></i></button>`;
  }).join('');
  if (V().showTracks) {
    const P = props().filter(p => tracks()[p.path]?.length && inFilter(p.path));
    $('tracks').innerHTML = P.length ? P.map(p => `<div class="trow"><div class="tn">${kb(p.path, p.name)}<span class="g">${esc(groupName(p.group))}</span>${esc(p.name)}</div>`
      + `<div class="tt" data-tpath="${p.path}">${tracks()[p.path].map((k, i) => `<button class="kf ${easeClass(k.e)}${selKey && (selKey.k === k || selKey.keys?.includes(k)) ? ' sel' : ''}" data-kpath="${p.path}" data-ki="${i}" style="left:${k.t / dur * 100}%" title="Frame ${frameOf(k.t)} · ${escAttr(EASES[k.e]?.name || '')}"><i></i></button>`).join('')}<span class="ph2" style="left:${T / dur * 100}%"></span></div></div>`).join('')
      : '<p class="hint" style="padding:10px 14px">No animated values yet. Click a ○ key button next to any value, or the red record button.</p>';
  }
  $('tracks').hidden = !V().showTracks; $('tlTracksBtn').setAttribute('aria-pressed', !!V().showTracks);
  $('graph').hidden = !V().showGraph; $('tlGraphBtn').setAttribute('aria-pressed', !!V().showGraph);
  if (selKey) { const k = selectedKeys()[0]; if (k) { $('kfEase').value = k.e; AC.refreshDD($('kfEase')); } else selKey = null; }
  $('kfEdit').hidden = !selKey;
  const all = Object.values(tracks()).flat().length;
  $('tlInfo').textContent = `${kFilter.size ? fKeys().length + ' / ' : ''}${all} keys · ${fps()} fps`;
  drawPower(); updateTimeUI();
  if (V().showGraph) { renderGraphProps(); drawGraph(); }
}
function updateTimeUI() {
  const dur = V().duration;
  $('vpTc').textContent = `${tc(T)} / ${tc(dur)} · frame ${frameOf(T)}`;
  const fr = $('tlFrame'); if (document.activeElement !== fr && !fr.classList.contains('scrubbing')) fr.value = frameOf(T);
  fr.max = endFrame();
  const ds = $('tlDurS'); if (document.activeElement !== ds) ds.value = tc(dur);
  const ef = $('tlEndF'); if (document.activeElement !== ef && !ef.classList.contains('scrubbing')) ef.value = endFrame();
  $('phead').style.left = (T / dur * 100) + '%';
  $('gPhead').style.left = `calc(${GP}px + (100% - ${GP * 2 + 1}px) * ${T / dur})`;
  document.querySelectorAll('.tt .ph2').forEach(p => { p.style.left = (T / dur * 100) + '%'; });
  document.querySelectorAll('.kb[data-kp]').forEach(b => {
    const keys = (COMPOSITE[b.dataset.kp] || [b.dataset.kp]).flatMap(q => tracks()[q] || []);
    b.classList.toggle('anim', isVideo() && keys.length > 0);
    b.classList.toggle('on', isVideo() && keys.some(k => Math.abs(k.t - T) < frameDur() / 2));
    b.title = !keys.length ? 'Add a key on this frame' : keys.some(k => Math.abs(k.t - T) < frameDur() / 2) ? 'Remove the key on this frame' : 'Animated: add a key on this frame';
  });
}
const timeFromX = (el, clientX) => { const r = el.getBoundingClientRect(); return clamp((clientX - r.left) / r.width, 0, 1) * V().duration; };
let pd = null;
$('power').addEventListener('pointerdown', e => {
  const pk = e.target.closest('[data-pt]');
  $('power').setPointerCapture(e.pointerId);
  if (pk && (e.ctrlKey || e.metaKey)) { setEase(fKeysAt(+pk.dataset.pt), 'linear'); return; }
  if (pk) {
    const t = +pk.dataset.pt;
    selKey = {t}; pd = {mode:'key', t0:t, x0:e.clientX, moved:false, keys:fKeysAt(t)};
    document.querySelectorAll('.pkey.sel, .kf.sel').forEach(x => x.classList.remove('sel')); pk.classList.add('sel');
    $('kfEdit').hidden = false; $('kfEase').value = pd.keys[0]?.e || 'easeInOut'; AC.refreshDD($('kfEase'));
    return;
  }
  stop(); pd = {mode:'scrub'}; setTime(timeFromX($('power'), e.clientX));
});
$('power').addEventListener('pointermove', e => {
  if (!pd) return;
  if (pd.mode === 'scrub') { setTime(timeFromX($('power'), e.clientX)); return; }
  if (Math.abs(e.clientX - pd.x0) > 3) pd.moved = true;
  if (!pd.moved) return;
  const r = $('power').getBoundingClientRect();
  const t = snap(clamp(pd.t0 + (e.clientX - pd.x0) / r.width * V().duration, 0, V().duration));
  pd.keys.forEach(k => { k.t = t; }); selKey = {t};
  const el = document.querySelector('.pkey.sel'); if (el) el.style.left = (t / V().duration * 100) + '%';
});
const pEnd = () => {
  if (!pd) return;
  if (pd.mode === 'key') {
    if (!pd.moved) { stop(); setTime(pd.t0); }
    else { Object.values(tracks()).forEach(keys => { keys.sort((a, b) => a.t - b.t); for (let i = keys.length - 1; i > 0; i--) if (Math.abs(keys[i].t - keys[i - 1].t) < 1e-4) keys.splice(i - 1, 1); }); }
    buildTimeline(); apply(T); AC.save(); AC.changed();
  }
  pd = null;
};
$('power').addEventListener('pointerup', pEnd); $('power').addEventListener('pointercancel', pEnd);
// per-value tracks
let td = null;
$('tracks').addEventListener('pointerdown', e => {
  const kfb = e.target.closest('[data-kpath]'), tt = e.target.closest('.tt');
  if (!tt) return;
  $('tracks').setPointerCapture(e.pointerId);
  if (kfb && (e.ctrlKey || e.metaKey)) { const k = tracks()[kfb.dataset.kpath]?.[+kfb.dataset.ki]; if (k) setEase([k], 'linear'); return; }
  if (kfb) {
    const keys = tracks()[kfb.dataset.kpath], k = keys?.[+kfb.dataset.ki]; if (!k) return;
    selKey = {path:kfb.dataset.kpath, k}; td = {mode:'key', k, keys, el:tt, x0:e.clientX, t0:k.t, moved:false};
    document.querySelectorAll('.pkey.sel, .kf.sel').forEach(x => x.classList.remove('sel')); kfb.classList.add('sel');
    $('kfEdit').hidden = false; $('kfEase').value = k.e; AC.refreshDD($('kfEase'));
    return;
  }
  stop(); td = {mode:'scrub', el:tt}; setTime(timeFromX(tt, e.clientX));
});
$('tracks').addEventListener('pointermove', e => {
  if (!td) return;
  if (td.mode === 'scrub') { setTime(timeFromX(td.el, e.clientX)); return; }
  if (Math.abs(e.clientX - td.x0) > 3) td.moved = true;
  if (!td.moved) return;
  const r = td.el.getBoundingClientRect();
  const t = snap(clamp(td.t0 + (e.clientX - td.x0) / r.width * V().duration, 0, V().duration));
  if (td.keys.some(k => k !== td.k && Math.abs(k.t - t) < frameDur() / 2)) return;
  td.k.t = t; const el = document.querySelector('.kf.sel'); if (el) el.style.left = (t / V().duration * 100) + '%';
});
const tEnd = () => {
  if (!td) return;
  if (td.mode === 'key') { td.keys.sort((a, b) => a.t - b.t); if (!td.moved) { stop(); setTime(td.k.t); } buildTimeline(); apply(T); AC.save(); AC.changed(); }
  td = null;
};
$('tracks').addEventListener('pointerup', tEnd); $('tracks').addEventListener('pointercancel', tEnd);
function setEase(keys, e) {
  if (!keys.length) return;
  keys.forEach(k => { if (e === 'toggleHold') { if (k.e === 'hold') k.e = k.pe || 'easeInOut'; else { k.pe = k.e; k.e = 'hold'; } } else setKeyEase(k, e); });
  buildTimeline(); apply(T); AC.save(); AC.changed();
  AC.toast(e === 'toggleHold' ? (keys[0].e === 'hold' ? 'Hold keyframe on' : 'Hold keyframe off') : EASES[e].name);
}
let ctxEl = null;
function closeCtx() { ctxEl?.remove(); ctxEl = null; }
function openCtx(x, y, keys) {
  closeCtx();
  const m = document.createElement('div'); m.className = 'ctx'; m.setAttribute('role', 'menu');
  const mac = /Mac|iP/.test(navigator.platform);
  const items = [['easeInOut', 'Easy Ease', 'F9'], ['easeIn', 'Easy Ease In', 'Shift+F9'], ['easeOut', 'Easy Ease Out', 'Ctrl+Shift+F9'],
    ['linear', 'Linear', mac ? 'Cmd + Click' : 'Ctrl + Click'], ['sep'], ['toggleHold', 'Toggle Hold Keyframe', ''], ['sep'],
    ['anticipate', 'Anticipation', ''], ['overshoot', 'Overshoot', ''], ['bounce', 'Bounce', ''], ['elastic', 'Elastic', ''], ['sep'], ['delete', 'Delete keyframe', 'Del']];
  m.innerHTML = items.map(([id, n, k]) => id === 'sep' ? '<div class="sepl"></div>' : `<button role="menuitem" data-ce="${id}">${n}<span>${k}</span></button>`).join('');
  document.body.appendChild(m); ctxEl = m;
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, 8, innerWidth - r.width - 8) + 'px'; m.style.top = clamp(y, 8, innerHeight - r.height - 8) + 'px';
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-ce]'); if (!b) return;
    const id = b.dataset.ce; closeCtx();
    if (id === 'delete') { const ks = new Set(keys); Object.keys(tracks()).forEach(q => { tracks()[q] = tracks()[q].filter(k => !ks.has(k)); }); selKey = null; cleanTracks(); buildTimeline(); apply(T); AC.save(); AC.changed(); }
    else setEase(keys, id);
  });
  m.querySelector('button')?.focus();
}
document.addEventListener('pointerdown', e => { if (ctxEl && !ctxEl.contains(e.target)) closeCtx(); }, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCtx();
  if (!isVideo() || !selKey || e.target.closest('input, textarea')) return;
  const ks = selectedKeys();
  if (e.key === 'F9') { e.preventDefault(); setEase(ks, e.shiftKey && (e.ctrlKey || e.metaKey) ? 'easeOut' : e.shiftKey ? 'easeIn' : 'easeInOut'); }
});
document.addEventListener('contextmenu', e => {
  const pk = e.target.closest('.pkey[data-pt]'), kf = e.target.closest('.kf[data-kpath]');
  if (!pk && !kf) return;
  e.preventDefault();
  let keys;
  if (pk) { const t = +pk.dataset.pt; keys = fKeysAt(t); selKey = {t}; }
  else { const k = tracks()[kf.dataset.kpath]?.[+kf.dataset.ki]; keys = k ? [k] : []; selKey = k ? {path:kf.dataset.kpath, k} : null; }
  buildTimeline();
  if (keys.length) openCtx(e.clientX, e.clientY, keys);
});
$('kfEase').innerHTML = Object.entries(EASES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('');
AC.refreshDD($('kfEase'));
const selectedKeys = () => {
  if (!selKey) return [];
  if (selKey.keys) { const live = new Set(Object.values(tracks()).flat()); return selKey.keys.filter(k => live.has(k)); }
  return selKey.k ? [selKey.k] : fKeysAt(selKey.t);
};
$('kfEase').addEventListener('change', e => { selectedKeys().forEach(k => setKeyEase(k, e.target.value)); buildTimeline(); apply(T); AC.save(); AC.changed(); });
$('kfDel').addEventListener('click', () => {
  const ks = new Set(selectedKeys()); if (!ks.size) return;
  Object.keys(tracks()).forEach(p => { tracks()[p] = tracks()[p].filter(k => !ks.has(k)); });
  selKey = null; cleanTracks(); buildTimeline(); apply(T); AC.save(); AC.changed();
});

/* ---------- graph editor (After Effects style) ---------- */
// Value graph: every number track as a curve; drag keys in time and value, drag the bezier handles to shape the ease.
// Speed graph: how fast each value changes (read only, keys can still move in time).
const GCOL = ['#e85d2b', '#3f7cf6', '#3fb950', '#d4a72c', '#a371f7', '#e5484d', '#2bb3c0', '#f78fb3'], GP = 8;
const gShow = new Set(); // curves picked in the graph bar (empty = every visible curve)
let gMode = 'value', gGeo = null, gd = null;
const graphProps = () => props().filter(p => (p.kind === 'num' || p.kind === 'angle') && tracks()[p.path]?.length && inFilter(p.path));
function graphShown() {
  const all = graphProps();
  [...gShow].forEach(q => { if (!all.some(p => p.path === q)) gShow.delete(q); });
  return gShow.size ? all.filter(p => gShow.has(p.path)) : all;
}
function clampKeyV(path, v) {
  if (/\.(h|w)$/.test(path) || path === 'cam.dist') return Math.max(.01, v);
  if (path === 'cam.focal' || path === 'cam.sensor') return Math.max(1, v);
  if (path === 'cam.el') return clamp(v, -89.5, 89.5);
  if (path === 'cam.roll') return clamp(v, -45, 45);
  return v;
}
function gFmt(c, v) {
  const s = c.p.kind === 'angle' ? Math.round(v) + '°' : c.p.fmt(v);
  return gMode === 'speed' ? s + '/s' : s;
}
function renderGraphProps() {
  const all = graphProps(), box = $('gProps');
  box.innerHTML = all.map((p, i) => `<button class="gp" data-gp="${escAttr(p.path)}" aria-pressed="${gShow.has(p.path)}" title="Show only this curve (click more to combine)"><span class="sw" style="background:${GCOL[i % GCOL.length]}"></span>${esc(groupName(p.group))} · ${esc(p.name)}</button>`).join('');
  document.querySelectorAll('#graph [data-gm]').forEach(b => b.setAttribute('aria-pressed', b.dataset.gm === gMode));
}
function graphGeo() {
  const {ctx, w, h} = AC.fit($('graphC')), dur = V().duration, pt = 14, pb = 14, ph = Math.max(10, h - pt - pb);
  const all = graphProps(), order = all.map(p => p.path), n = Math.max(60, Math.round(w / 3)), frozen = gd?.ranges;
  const curves = graphShown().map(p => {
    const keys = tracks()[p.path], val = t => valueAt(p.path, t, 'num', 0);
    let pts;
    if (gMode === 'value') pts = Array.from({length:n + 1}, (_, i) => { const t = dur * i / n; return [t, val(t)]; });
    else { const e = dur / n / 2; pts = Array.from({length:n + 1}, (_, i) => { const t = dur * i / n; return [t, Math.abs(val(Math.min(dur, t + e)) - val(Math.max(0, t - e))) / (Math.min(dur, t + e) - Math.max(0, t - e))]; }); }
    let lo, hi;
    if (frozen?.has(p.path)) ({lo, hi} = frozen.get(p.path));
    else {
      const vs = pts.map(q => q[1]).concat(gMode === 'value' ? keys.map(k => k.v) : []);
      lo = gMode === 'speed' ? 0 : Math.min(...vs); hi = Math.max(...vs);
      if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
      const m = (hi - lo) * .1; if (gMode === 'value') lo -= m; hi += m;
    }
    return {p, keys, pts, lo, hi, col:GCOL[Math.max(0, order.indexOf(p.path)) % GCOL.length]};
  });
  // 8 px side padding keeps edge keys whole; with the 6 px margin it lines up with the ruler above
  const X = t => GP + t / dur * (w - GP * 2 - 1), tX = x => clamp((x - GP) / (w - GP * 2 - 1), 0, 1) * dur;
  const Y = (c, v) => pt + (1 - (v - c.lo) / (c.hi - c.lo)) * ph, vY = (c, y) => c.hi - (y - pt) / ph * (c.hi - c.lo);
  // where a key sits on its curve (speed graph: the speed at that time)
  const keyV = (c, k) => gMode === 'value' ? k.v : c.pts[clamp(Math.round(k.t / dur * n), 0, n)][1];
  return {ctx, w, h, pt, pb, ph, curves, X, tX, Y, vY, keyV, hits:[]};
}
// a segment's bezier handle as a point in time / value (flat segments borrow a quarter of the curve height)
function handlePos(c, a, b, which) {
  const bz = a.e === 'custom' && a.bz ? a.bz : BZ[a.e]; if (!bz) return null;
  const dv = b.v - a.v, span = Math.abs(dv) > 1e-9 ? dv : (c.hi - c.lo) * .25;
  return {t:a.t + (which ? bz[2] : bz[0]) * (b.t - a.t), v:a.v + (which ? bz[3] : bz[1]) * span, span};
}
function drawGraph() {
  if (!isVideo() || !V().showGraph || $('graph').hidden) return;
  const G = gGeo = graphGeo(), {ctx, w, h, X, Y, curves} = G, C = AC.C;
  if (w < 20) return;
  ctx.fillStyle = C['panel-2']; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.globalAlpha = .55;
  const n = endFrame(), step = [1, 2, 5, 10, 20, 25, 50, 100].find(s => w / (n / s) > 42) || 100;
  for (let f = 0; f <= n; f += step) { const x = Math.round(X(f / fps())) + .5; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let i = 0; i <= 4; i++) { const y = Math.round(G.pt + G.ph * i / 4) + .5; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.globalAlpha = 1;
  ctx.font = '10px "JetBrains Mono", monospace'; ctx.textBaseline = 'middle';
  if (!curves.length) {
    ctx.fillStyle = C.muted; ctx.textAlign = 'center';
    ctx.fillText('No animated number values in this layer yet. Add keyframes to see their curves here.', w / 2, h / 2); return;
  }
  const sel = new Set(selectedKeys());
  curves.forEach(c => {
    ctx.strokeStyle = c.col; ctx.lineWidth = c.keys.some(k => sel.has(k)) ? 2.2 : 1.5;
    ctx.beginPath(); c.pts.forEach(([t, v], i) => { const x = X(t), y = Y(c, v); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  });
  // value labels when one curve is shown; otherwise each curve is scaled to fit on its own
  ctx.textAlign = 'left'; ctx.fillStyle = C.muted;
  if (curves.length === 1) { const c = curves[0]; for (let i = 0; i <= 4; i++) ctx.fillText(gFmt(c, c.hi - (c.hi - c.lo) * i / 4), GP + 8, G.pt + G.ph * i / 4 + (i === 0 ? 6 : i === 4 ? -6 : 0)); }
  else { ctx.textAlign = 'right'; ctx.fillText(gMode === 'value' ? 'each curve scaled to fit' : 'speed, each curve scaled to fit', w - 4, 8); }
  // bezier handles of the selected keys (value graph)
  if (gMode === 'value') curves.forEach(c => c.keys.forEach((k, i) => {
    if (!sel.has(k)) return;
    const segs = []; if (i > 0) segs.push([c.keys[i - 1], k, 1]); if (i < c.keys.length - 1) segs.push([k, c.keys[i + 1], 0]);
    segs.forEach(([a, b, which]) => {
      const hp = handlePos(c, a, b, which); if (!hp) return;
      const kx = X(k.t), ky = Y(c, k.v), hx = X(hp.t), hy = Y(c, hp.v);
      ctx.strokeStyle = C.fg; ctx.globalAlpha = .7; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(hx, hy); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = C.fg; ctx.beginPath(); ctx.arc(hx, hy, 3.5, 0, 7); ctx.fill();
      G.hits.push({type:'handle', c, a, b, which, span:hp.span, x:hx, y:hy});
    });
  }));
  curves.forEach(c => c.keys.forEach(k => {
    const x = X(k.t), y = Y(c, G.keyV(c, k)), s = sel.has(k);
    ctx.fillStyle = s ? C.green : C.panel; ctx.strokeStyle = s ? C.fg : c.col; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.rect(x - 4, y - 4, 8, 8); ctx.fill(); ctx.stroke();
    G.hits.push({type:'key', c, k, x, y});
  }));
  if (gd?.mode === 'box' && gd.moved) {
    ctx.setLineDash([4, 3]); ctx.strokeStyle = C.accent; ctx.fillStyle = C.accent; ctx.globalAlpha = .12;
    const bx = Math.min(gd.x0, gd.x1), by = Math.min(gd.y0, gd.y1), bw = Math.abs(gd.x1 - gd.x0), bh = Math.abs(gd.y1 - gd.y0);
    ctx.fillRect(bx, by, bw, bh); ctx.globalAlpha = 1; ctx.strokeRect(bx + .5, by + .5, bw, bh); ctx.setLineDash([]);
  }
}
function setGraphSel(ks, light) {
  selKey = ks.length ? {keys:[...new Set(ks)]} : null;
  if (light) return;
  buildTimeline();
}
const gPos = e => { const r = $('gWrap').getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top}; };
function gHit(x, y) {
  const hs = gGeo?.hits || [];
  for (const type of ['handle', 'key']) {
    let best = null, bd = 8;
    hs.forEach(hh => { if (hh.type !== type) return; const d = Math.hypot(hh.x - x, hh.y - y); if (d < bd) { bd = d; best = hh; } });
    if (best) return best;
  }
  return null;
}
$('gWrap').addEventListener('pointerdown', e => {
  if (e.button !== 0 || !gGeo) return;
  const {x, y} = gPos(e), hit = gHit(x, y);
  $('gWrap').setPointerCapture(e.pointerId); stop();
  const ranges = new Map(gGeo.curves.map(c => [c.p.path, {lo:c.lo, hi:c.hi}]));
  if (hit?.type === 'handle') { gd = {mode:'handle', hit, ranges, x0:x, y0:y, moved:false}; return; }
  if (hit?.type === 'key') {
    let ks = selectedKeys();
    if (e.shiftKey || e.ctrlKey || e.metaKey) ks = ks.includes(hit.k) ? ks.filter(k => k !== hit.k) : [...ks, hit.k];
    else if (!ks.includes(hit.k)) ks = [hit.k];
    setGraphSel(ks);
    const moving = [];
    gGeo.curves.forEach(c => c.keys.forEach(k => { if (ks.includes(k)) moving.push({k, c, keys:c.keys, t0:k.t, v0:k.v}); }));
    gd = {mode:'key', moving, ranges, x0:x, y0:y, moved:false};
    return;
  }
  gd = {mode:'box', ranges, x0:x, y0:y, x1:x, y1:y, moved:false, add:e.shiftKey || e.ctrlKey || e.metaKey, base:selectedKeys()};
});
$('gWrap').addEventListener('pointermove', e => {
  if (!gd || !gGeo) return;
  const {x, y} = gPos(e), G = gGeo, dur = V().duration;
  if (Math.hypot(x - gd.x0, y - gd.y0) > 3) gd.moved = true;
  if (!gd.moved) return;
  if (gd.mode === 'box') {
    gd.x1 = x; gd.y1 = y;
    const l = Math.min(gd.x0, x), r = Math.max(gd.x0, x), t = Math.min(gd.y0, y), b = Math.max(gd.y0, y);
    const inside = G.hits.filter(hh => hh.type === 'key' && hh.x >= l && hh.x <= r && hh.y >= t && hh.y <= b).map(hh => hh.k);
    setGraphSel(gd.add ? [...gd.base, ...inside] : inside, true); drawGraph(); return;
  }
  if (gd.mode === 'handle') {
    const {c, a, b, which, span} = gd.hit, rg = gd.ranges.get(c.p.path);
    const t = G.tX(x), v = rg.hi - (y - G.pt) / G.ph * (rg.hi - rg.lo);
    const bx = clamp((t - a.t) / (b.t - a.t || 1), 0, 1), by = clamp((v - a.v) / span, -2, 3);
    const bz = (a.e === 'custom' && a.bz ? a.bz : BZ[a.e] || BZ.easeInOut).slice();
    if (which) { bz[2] = bx; bz[3] = by; } else { bz[0] = bx; bz[1] = by; }
    a.e = 'custom'; a.bz = bz.map(q => rnd(q, 4));
    apply(T); drawGraph(); return;
  }
  // move the selected keys: time snaps to frames, value follows the mouse (Shift locks to one direction)
  let dx = x - gd.x0, dy = y - gd.y0;
  if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
  const dt = Math.round(dx / (G.w - 1) * dur * fps()) / fps(), moving = new Set(gd.moving.map(m => m.k));
  const ok = gd.moving.every(m => { const nt = clamp(snap(m.t0 + dt), 0, dur); return !m.keys.some(k => !moving.has(k) && Math.abs(k.t - nt) < frameDur() / 2); });
  gd.moving.forEach(m => {
    if (ok) m.k.t = clamp(snap(m.t0 + dt), 0, dur);
    if (gMode === 'value') { const rg = gd.ranges.get(m.c.p.path); m.k.v = clampKeyV(m.c.p.path, m.v0 - dy / G.ph * (rg.hi - rg.lo)); }
  });
  apply(T); drawGraph();
});
const gEnd = e => {
  if (!gd) return;
  const d = gd; gd = null;
  if (d.mode === 'box') {
    if (!d.moved) { setGraphSel([], true); setTime(gGeo.tX(gPos(e).x)); }
    buildTimeline(); return;
  }
  if (d.moved) {
    Object.values(tracks()).forEach(keys => { keys.sort((a, b) => a.t - b.t); for (let i = keys.length - 1; i > 0; i--) if (Math.abs(keys[i].t - keys[i - 1].t) < 1e-4) keys.splice(i - 1, 1); });
    buildTimeline(); apply(T); AC.save(); AC.changed();
  } else drawGraph();
};
$('gWrap').addEventListener('pointerup', gEnd); $('gWrap').addEventListener('pointercancel', gEnd);
$('gWrap').addEventListener('contextmenu', e => {
  const hit = gHit(gPos(e).x, gPos(e).y); if (hit?.type !== 'key') return;
  e.preventDefault();
  if (!selectedKeys().includes(hit.k)) setGraphSel([hit.k]);
  openCtx(e.clientX, e.clientY, selectedKeys());
});
$('graph').addEventListener('click', e => {
  const m = e.target.closest('[data-gm]'), p = e.target.closest('[data-gp]'), ez = e.target.closest('[data-ge]');
  if (m) { gMode = m.dataset.gm; renderGraphProps(); drawGraph(); }
  if (p) { const q = p.dataset.gp; if (gShow.has(q)) gShow.delete(q); else gShow.add(q); if (gShow.size === graphProps().length) gShow.clear(); renderGraphProps(); drawGraph(); }
  if (ez) { const ks = selectedKeys(); if (!ks.length) AC.toast('Select keyframes in the graph first (click or drag a box)'); else setEase(ks, ez.dataset.ge); }
});
function toggleGraph() {
  V().showGraph = !V().showGraph; if (V().showGraph) V().showTracks = false;
  AC.save(); buildTimeline(); requestAnimationFrame(() => { renderVP(); drawGraph(); });
}
$('tlGraphBtn').addEventListener('click', toggleGraph);
new ResizeObserver(() => drawGraph()).observe($('gWrap'));
// chip rows have no scrollbar: the mouse wheel scrolls them sideways
['gProps', 'kGroups'].forEach(id => $(id).addEventListener('wheel', e => {
  const el = $(id); if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault(); el.scrollLeft += e.deltaY;
}, {passive:false}));

/* ---------- transport ---------- */
let rafPlay = 0, lastTs = 0;
const PLAY = '<path d="M4 2.5v11l9-5.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>', PAUSE = '<path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/>';
function play() {
  if (playing) return;
  if (T >= V().duration - 1e-6) T = 0;
  playing = true; $('tlPlayIco').innerHTML = PAUSE; $('tlPlay').setAttribute('aria-pressed', 'true'); lastTs = performance.now();
  const step = ts => {
    if (!playing) return;
    let t = T + (ts - lastTs) / 1000; lastTs = ts;
    if (t > V().duration) { if (V().loop) t = 0; else { T = V().duration; apply(T); updateTimeUI(); stop(); return; } }
    T = t; apply(T); updateTimeUI();
    rafPlay = requestAnimationFrame(step);
  };
  rafPlay = requestAnimationFrame(step);
}
function stop() { if (!playing) return; playing = false; cancelAnimationFrame(rafPlay); $('tlPlayIco').innerHTML = PLAY; $('tlPlay').setAttribute('aria-pressed', 'false'); T = snap(T); }
$('tlPlay').addEventListener('click', () => playing ? stop() : play());
$('tlStart').addEventListener('click', () => { stop(); setTime(0); });
$('tlEnd').addEventListener('click', () => { stop(); setTime(V().duration); });
$('tlPrevFrame').addEventListener('click', () => { stop(); setTime(T - frameDur()); });
$('tlNextFrame').addEventListener('click', () => { stop(); setTime(T + frameDur()); });
$('tlPrevKey').addEventListener('click', () => { const t = [...fKeyTimes()].reverse().find(t => t < T - 1e-6); stop(); setTime(t ?? 0); });
$('tlNextKey').addEventListener('click', () => { const t = fKeyTimes().find(t => t > T + 1e-6); stop(); setTime(t ?? V().duration); });
$('tlLoop').addEventListener('click', () => { V().loop = !V().loop; $('tlLoop').setAttribute('aria-pressed', V().loop); AC.save(); });
$('tlAuto').addEventListener('click', () => { V().autokey = !V().autokey; $('tlAuto').setAttribute('aria-pressed', V().autokey); AC.save(); AC.toast(V().autokey ? 'Auto keying on' : 'Auto keying off'); });
$('tlRec').addEventListener('click', recordAll);
$('tlTracksBtn').addEventListener('click', () => { V().showTracks = !V().showTracks; if (V().showTracks) V().showGraph = false; AC.save(); buildTimeline(); requestAnimationFrame(() => renderVP()); });
$('tlFrame').addEventListener('change', e => { const f = parseInt(e.target.value, 10); if (isFinite(f)) { stop(); setTime(f / fps()); } });
$('tlFrame').addEventListener('input', e => { if (e.target.classList.contains('scrubbing')) { const f = parseInt(e.target.value, 10); if (isFinite(f)) { stop(); setTime(f / fps()); } } });
// video length: seconds ("8", "8.5") or minutes:seconds ("0:12", "00:12.50")
function setDuration(sec) {
  V().duration = rnd(clamp(sec, 1, 60), 3);
  Object.values(tracks()).forEach(keys => keys.forEach(k => { k.t = Math.min(k.t, V().duration); }));
  setTime(Math.min(T, V().duration)); buildTimeline(); AC.save(); AC.changed();
}
$('tlDurS').addEventListener('change', e => {
  const v = e.target.value.trim(), m = v.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  const sec = m ? +m[1] * 60 + +m[2] : parseFloat(v.replace(',', '.'));
  if (isFinite(sec) && sec > 0) { setDuration(sec); AC.toast(`Video length ${tc(V().duration)}`); } else { e.target.value = tc(V().duration); AC.toast('Type seconds, like 8 or 0:12'); }
});
$('tlDurS').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('tlEndF').addEventListener('change', e => {
  const f = clamp(parseInt(e.target.value, 10) || endFrame(), fps(), 60 * fps());
  V().duration = rnd(f / fps(), 4);
  Object.values(tracks()).forEach(keys => keys.forEach(k => { k.t = Math.min(k.t, V().duration); }));
  setTime(Math.min(T, V().duration)); buildTimeline(); AC.save(); AC.changed();
});
document.addEventListener('keydown', e => {
  if (!isVideo() || e.target.closest('input, textarea, select, .dd-pop, [contenteditable]')) return;
  if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
  else if (e.key === 'F3' && e.shiftKey) { e.preventDefault(); toggleGraph(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selKey) { e.preventDefault(); $('kfDel').click(); }
  else if (e.key === 'ArrowRight' && e.altKey) { stop(); setTime(T + frameDur()); }
  else if (e.key === 'ArrowLeft' && e.altKey) { stop(); setTime(T - frameDur()); }
});
$('vpGuidesBtn').addEventListener('click', () => { V().guides = !V().guides; $('vpGuidesBtn').setAttribute('aria-pressed', V().guides); AC.save(); renderVP(); });
$('vpGround').addEventListener('click', () => { V().ground = V().ground === false; $('vpGround').setAttribute('aria-pressed', V().ground); AC.save(); renderVP(); });
$('vpPath').addEventListener('click', () => { V().path = !V().path; $('vpPath').setAttribute('aria-pressed', V().path); AC.save(); AC.drawAll(); });

/* ---------- export ---------- */
let dl = null;
const dlReady = (async () => { try { dl = window.claude ? await window.claude.use('downloads') : null; } catch (e) { dl = null; } return dl; })();
async function saveFile(filename, blob) {
  await dlReady;
  if (!dl) {
    // outside Claude (the desktop copy): a normal browser download
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    AC.toast('Downloaded ' + filename); return;
  }
  try { await dl.save({filename, data:blob}); AC.toast('Saved ' + filename); }
  catch (e) { if (e?.code === 'declined') AC.toast('Save cancelled'); else if (e?.code === 'rate_limited') AC.toast('A save is already open. Try again in a moment'); else AC.toast('Could not save the file'); }
}
function exportSize() { const ar = aspectRatio(); return ar >= 1 ? {w:1280, h:Math.round(1280 / ar / 2) * 2} : {w:Math.round(1280 * ar / 2) * 2, h:1280}; }
$('expFrame').addEventListener('click', () => {
  if (!R) { AC.toast('3D viewer is not available'); return; }
  const sz = exportSize(); renderVP(sz);
  R.renderer.domElement.toBlob(b => { renderVP(); if (b) saveFile(`visionpilot-frame-${String(frameOf(T)).padStart(4, '0')}.png`, b); else AC.toast('Could not capture the frame'); }, 'image/png');
});
let exporting = false;
// fast export: every frame is rendered offscreen and encoded with WebCodecs, then muxed into an MP4.
// No real time playback, so a 10 s clip takes only as long as the GPU needs to render and encode it.
const MUXER_URL = 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.2.2/build/mp4-muxer.min.js';
let muxerLoad = null;
function loadMuxer() {
  if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
  return muxerLoad || (muxerLoad = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = MUXER_URL; s.async = true;
    s.onload = () => window.Mp4Muxer ? res(window.Mp4Muxer) : rej(new Error('MP4 muxer missing'));
    s.onerror = () => { muxerLoad = null; s.remove(); rej(new Error('MP4 muxer could not load')); };
    document.head.appendChild(s);
  }));
}
async function pickAvc(w, h) {
  // High / Main / Baseline at level 4.0 cover 1280 px in either orientation; 3.1 is the last resort
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f']) {
    const cfg = {codec, width:w, height:h, bitrate:8e6, framerate:fps(), avc:{format:'avc'}};
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) { /* try the next profile */ }
  }
  return null;
}
const tick = () => new Promise(r => setTimeout(r, 0));
async function exportFast(btn, sz) {
  if (!window.VideoEncoder || !window.VideoFrame) return null;
  const cfg = await pickAvc(sz.w, sz.h); if (!cfg) return null;
  const M = await loadMuxer().catch(() => null); if (!M) return null;
  const muxer = new M.Muxer({target:new M.ArrayBufferTarget(), fastStart:'in-memory',
    video:{codec:'avc', width:sz.w, height:sz.h, ...(Number.isInteger(fps()) ? {frameRate:fps()} : {})}});
  let err = null;
  const enc = new VideoEncoder({output:(chunk, meta) => muxer.addVideoChunk(chunk, meta), error:e => { err = e; }});
  enc.configure(cfg);
  const cvs = R.renderer.domElement, n = endFrame(), us = 1e6 / fps(), gop = Math.max(1, Math.round(fps() * 2));
  let lastUI = 0;
  try {
    for (let f = 0; f <= n; f++) {
      if (err) throw err;
      T = f / fps(); apply(T); renderVP(sz);
      const frame = new VideoFrame(cvs, {timestamp:Math.round(f * us), duration:Math.round(us)});
      enc.encode(frame, {keyFrame:f % gop === 0}); frame.close();
      // keep the encoder queue short so memory stays flat on long clips
      while (enc.encodeQueueSize > 8 && !err) await new Promise(r => setTimeout(r, 1));
      if (performance.now() - lastUI > 80) { btn.textContent = `Exporting ${Math.round(f / n * 100)}%`; updateTimeUI(); await tick(); lastUI = performance.now(); }
    }
    btn.textContent = 'Finishing…';
    await enc.flush(); if (err) throw err;
  } finally { if (enc.state !== 'closed') enc.close(); }
  muxer.finalize();
  return new Blob([muxer.target.buffer], {type:'video/mp4'});
}
// fallback for browsers without WebCodecs: record the canvas in real time
async function exportRealtime(btn, sz) {
  const cvs = R.renderer.domElement;
  if (!cvs.captureStream || !window.MediaRecorder) return null;
  const type = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
  if (!type) return null;
  const isMp4 = type.startsWith('video/mp4'), n = endFrame();
  renderVP(sz);
  const stream = cvs.captureStream(fps()), rec = new MediaRecorder(stream, {mimeType:type, videoBitsPerSecond:8e6}), chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  rec.start();
  const t0 = performance.now();
  for (let f = 0; f <= n; f++) {
    T = f / fps(); apply(T); renderVP(sz); updateTimeUI();
    btn.textContent = `Recording ${Math.round(f / n * 100)}%`;
    const wait = t0 + (f + 1) * 1000 / fps() - performance.now();
    await new Promise(r => setTimeout(r, Math.max(0, wait)));
  }
  rec.stop(); await done; stream.getTracks().forEach(t => t.stop());
  if (!isMp4) AC.toast('This browser cannot record MP4, saving WebM instead');
  return new Blob(chunks, {type:isMp4 ? 'video/mp4' : 'video/webm'});
}
$('expVideo').addEventListener('click', async () => {
  if (exporting) return;
  if (!R) { AC.toast('3D viewer is not available'); return; }
  exporting = true; stop();
  const btn = $('expVideo'), label = btn.textContent, sz = exportSize(), keepT = T, t0 = performance.now();
  btn.disabled = true; btn.textContent = 'Preparing…';
  let blob = null;
  try {
    try { blob = await exportFast(btn, sz); }
    catch (e) { console.warn('Fast export failed, falling back to real time recording', e); blob = null; }
    if (!blob) { AC.toast('Fast export is not available here, recording in real time'); blob = await exportRealtime(btn, sz); }
  } finally {
    btn.textContent = label; btn.disabled = false; exporting = false; setTime(keepT); renderVP();
  }
  if (!blob) { AC.toast('Video export is not supported in this browser'); return; }
  const mp4 = blob.type === 'video/mp4';
  console.info(`Video export: ${endFrame() + 1} frames in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  await saveFile(mp4 ? 'visionpilot-camera-reference.mp4' : 'visionpilot-camera-reference.webm', blob);
});

/* ---------- enter / leave video ---------- */
function showDur() {
  $('durSec').value = V().duration; $('durFps').value = String(V().fps); AC.refreshDD($('durFps'));
  $('durModal').hidden = false; setTimeout(() => $('durSec').focus(), 30);
}
$('durOk').addEventListener('click', () => {
  V().duration = rnd(clamp(parseFloat($('durSec').value) || 5, 1, 60), 2); V().fps = +$('durFps').value || 24;
  $('durModal').hidden = true; V().ready = true; go();
});
$('durCancel').addEventListener('click', () => { $('durModal').hidden = true; });
$('durModal').addEventListener('keydown', e => { if (e.key === 'Escape') $('durModal').hidden = true; if (e.key === 'Enter' && e.target.id === 'durSec') $('durOk').click(); });
function go() {
  S.app = 'video';
  syncObjectsFromSubjects();
  AC.applyLayout();
  initThree();
  $('tlLoop').setAttribute('aria-pressed', V().loop); $('tlAuto').setAttribute('aria-pressed', V().autokey !== false);
  $('vpGuidesBtn').setAttribute('aria-pressed', V().guides); $('vpPath').setAttribute('aria-pressed', V().path); $('vpGround').setAttribute('aria-pressed', V().ground !== false);
  objPropsKey = ''; renderObjects(); buildTimeline(); setTime(0);
  AC.changed();
  requestAnimationFrame(() => { renderVP(); AC.drawAll(); drawPower(); });
}
['vfX', 'vfY', 'vfZ'].forEach(id => $(id).addEventListener('input', () => {
  const v = ['vfX', 'vfY', 'vfZ'].map(i => parseFloat($(i).value)); if (!v.every(isFinite)) return;
  S.focus.on = true; S.focus.target = ''; Object.assign(fpos(), {x:v[0], y:v[1], z:v[2]});
  AC.changed();
}));
function syncFocusXYZ() {
  if (!isVideo()) return;
  const tg = targetAt(T);
  ['vfX', 'vfY', 'vfZ'].forEach((id, i) => AC.setIfIdle($(id), rnd([tg.x, tg.y, tg.z][i], 2)));
}
hooks.enterVideo = () => { if (!V().ready) showDur(); else go(); };
hooks.leaveVideo = () => { stop(); };
hooks.onChange = () => autoKey();
hooks.keyToggle = path => keyToggle(path);
hooks.afterSync = () => { if (isVideo()) { renderObjects(); syncFocusXYZ(); } updateTimeUI(); };
hooks.restored = () => {
  if (!V().objects.find(o => o.id === sel)) sel = V().objects[0]?.id || null;
  selKey = null; objPropsKey = '';
  if (isVideo()) {
    initThree(); renderObjects(); buildTimeline(); apply(T);
    // timeline toggles live in the state too, so their buttons follow undo / redo
    $('tlLoop').setAttribute('aria-pressed', !!V().loop); $('tlAuto').setAttribute('aria-pressed', V().autokey !== false);
    $('vpGuidesBtn').setAttribute('aria-pressed', !!V().guides); $('vpPath').setAttribute('aria-pressed', !!V().path); $('vpGround').setAttribute('aria-pressed', V().ground !== false);
  }
};
/* ---------- undo / redo (history lives in core.js) ---------- */
// every animated value inside a plain state copy, as [holder, key] pairs
function animSlots(st) {
  const out = [], tr = st.video?.tracks || {}, CAM = {'cam.az':'az', 'cam.el':'el', 'cam.dist':'dist', 'cam.roll':'roll', 'cam.focal':'focal', 'cam.sensor':'sensorW'};
  Object.keys(tr).sort().forEach(p => {
    if (!tr[p]?.length) return;
    if (CAM[p]) { out.push([st, CAM[p]]); if (p === 'cam.focal') out.push([st, 'lensId'], [st, 'aperture']); }
    else if (p === 'focus') { if (st.focus) out.push([st.focus, 'target'], [st.focus, 'on']); }
    else if (p.startsWith('focus.')) { if (st.focus?.pos) out.push([st.focus.pos, p.slice(6)]); }
    else if (p.startsWith('obj.')) { const [, id, k] = p.split('.'), o = (st.video.objects || []).find(x => x.id === id); if (o) out.push([o, k]); }
  });
  return out;
}
// view toggles are preferences, not edits: undo / redo keeps whatever is set right now
const VIEW_PREFS = ['loop', 'autokey', 'guides', 'ground', 'path', 'showTracks', 'showGraph'];
hooks.beforeRestore = st => { if (st.video && S.video) VIEW_PREFS.forEach(k => { if (k in S.video) st.video[k] = S.video[k]; else delete st.video[k]; }); };
// two states are "the same edit" when they only differ in values the keyframes drive (scrub / playback) or view toggles
hooks.histSame = (a, b) => {
  if (!isVideo()) return false;
  try {
    const A = JSON.parse(a), B = JSON.parse(b);
    if (JSON.stringify(A.video?.tracks) !== JSON.stringify(B.video?.tracks)) return false;
    animSlots(A).forEach(([o, k]) => { o[k] = null; }); animSlots(B).forEach(([o, k]) => { o[k] = null; });
    VIEW_PREFS.forEach(k => { if (A.video) delete A.video[k]; if (B.video) delete B.video[k]; });
    return JSON.stringify(A) === JSON.stringify(B);
  } catch (e) { return false; }
};
hooks.historyBlocked = () => { if (exporting) { AC.toast('Wait for the export to finish'); return true; } return false; };
hooks.histChanged = (canUndo, canRedo) => { $('tlUndo').disabled = !canUndo; $('tlRedo').disabled = !canRedo; };
$('tlUndo').addEventListener('click', () => { stop(); AC.undo(); });
$('tlRedo').addEventListener('click', () => { stop(); AC.redo(); });
hooks.extraTargets = () => isVideo() ? V().objects.map(o => o.label) : [];
hooks.afterDock = () => { if (isVideo()) { objPropsKey = ''; renderObjects(); drawPower(); renderVP(); drawGraph(); } };
hooks.refsChanged = () => { if (!isVideo()) return; syncObjectsFromSubjects(); objPropsKey = ''; renderObjects(); buildTimeline(); renderVP(); };
hooks.themeChanged = () => { if (isVideo()) { drawPower(); renderVP(); drawGraph(); } };
new ResizeObserver(() => { if (isVideo()) drawPower(); }).observe($('power'));

/* ---------- video prompt ---------- */
function describeSegment(t0, t1, cm) {
  const c0 = camAt(t0), c1 = camAt(t1), moves = [];
  const dAz = c1.az - c0.az, dEl = c1.el - c0.el, r = c1.dist / c0.dist, z = c1.focal / c0.focal, dRoll = c1.roll - c0.roll;
  const dolly = r < .93 ? 'in' : r > 1.07 ? 'out' : null, zoom = z > 1.07 ? 'in' : z < .93 ? 'out' : null;
  const secs = Math.max(t1 - t0, 1e-3), cmds = [], shotOf = c => AC.calc({dist:c.dist, focal:c.focal, sensorW:c.sensor}).shot.name.toLowerCase();
  if (Math.abs(dAz) >= 3) {
    const deg = Math.round(Math.abs(dAz)), right = dAz > 0, sp = Math.round(Math.abs(dAz) / secs);
    cmds.push(`camera arcs ${right ? 'RIGHT' : 'LEFT'} around the subject by ${deg}°`);
    moves.push(`the camera travels in an arc around the subject toward camera-${right ? 'right' : 'left'} by ${deg}° (${right ? 'counter-clockwise' : 'clockwise'} seen from above, about ${sp}° per second); on screen the background slides from ${right ? 'right to left' : 'left to right'} and the subject turns to show ${right ? 'its left side' : 'its right side'}, while staying centered`);
  }
  if (Math.abs(dEl) >= 3) {
    const deg = Math.round(Math.abs(dEl)), up = dEl > 0;
    cmds.push(`camera ${up ? 'rises (crane UP)' : 'lowers (crane DOWN)'} by ${deg}°`);
    moves.push(up ? `the camera rises ${deg}° higher and tilts down to keep the subject centered: we look down on the subject more and the horizon drops in the frame`
      : `the camera lowers ${deg}° and tilts up to keep the subject centered: we look up at the subject more and the horizon rises in the frame`);
  }
  if (dolly && zoom && dolly !== zoom) {
    cmds.push('dolly zoom (vertigo effect)');
    moves.push(`dolly zoom: the camera moves ${dolly === 'in' ? 'forward' : 'backward'} from ${AC.mStr(c0.dist)} to ${AC.mStr(c1.dist)} while zooming ${zoom} from ${Math.round(c0.focal)} to ${Math.round(c1.focal)} mm, so the subject keeps its size and the background stretches`);
  } else {
    if (dolly) {
      cmds.push(dolly === 'in' ? `camera PUSHES IN (moves forward) to a ${shotOf(c1)}` : `camera PULLS BACK (moves backward) to a ${shotOf(c1)}`);
      moves.push(dolly === 'in' ? `the camera physically moves forward from ${AC.mStr(c0.dist)} to ${AC.mStr(c1.dist)}${c1.dist < .4 ? ' into a macro close-up' : ''}: the subject grows larger in the frame, from a ${shotOf(c0)} to a ${shotOf(c1)}`
        : `the camera physically moves backward from ${AC.mStr(c0.dist)} to ${AC.mStr(c1.dist)}: the subject gets smaller in the frame, from a ${shotOf(c0)} to a ${shotOf(c1)}, revealing more surroundings`);
    }
    if (zoom) { cmds.push(`lens ZOOMS ${zoom.toUpperCase()} to ${Math.round(c1.focal)} mm`); moves.push(`the lens zooms ${zoom} from ${Math.round(c0.focal)} to ${Math.round(c1.focal)} mm without moving the camera`); }
  }
  if (Math.abs(dRoll) >= 2) { cmds.push(`camera rolls to a ${Math.round(c1.roll)}° tilt`); moves.push(`the camera rolls ${dRoll > 0 ? 'clockwise' : 'counter-clockwise'} to a ${Math.round(c1.roll)}° dutch angle`); }
  const f0 = valueAt('focus', t0, 'target', S.focus.on ? S.focus.target : ''), fEnd = valueAt('focus', t1, 'target', f0);
  if (tracks().focus?.length && f0 !== fEnd) { cmds.push(`camera pans from ${f0 || 'the group'} to ${fEnd || 'the group'}`); moves.push(`the camera turns from ${f0 || 'the group'} to ${fEnd || 'the group'} and pulls focus onto ${fEnd || 'the group'}`); }
  const subj = [];
  V().objects.forEach(o => {
    const g = (k, t) => valueAt(`obj.${o.id}.${k}`, t, k === 'color' ? 'color' : 'num', o[k]);
    const dx = g('x', t1) - g('x', t0), dz = g('z', t1) - g('z', t0), dr = g('ry', t1) - g('ry', t0), dh = g('h', t1) / g('h', t0), dy = g('y', t1) - g('y', t0);
    const mv = Math.hypot(dx, dz);
    if (mv > .05) subj.push(`${o.label} moves ${rnd(mv, 2)} m ${Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'to the right' : 'to the left') : (dz > 0 ? 'toward the front' : 'away, toward the back')}`);
    if (Math.abs(dr) >= 5) subj.push(`${o.label} turns ${Math.round(Math.abs(dr))}° ${dr > 0 ? 'to its left' : 'to its right'}`);
    if (Math.abs(dy) > .05) subj.push(`${o.label} ${dy > 0 ? 'rises' : 'lowers'} ${rnd(Math.abs(dy), 2)} m`);
    if (Math.abs(dh - 1) > .05) subj.push(`${o.label} ${dh > 1 ? 'grows' : 'shrinks'} to ${Math.round(dh * 100)}% size`);
    if (g('color', t0) !== g('color', t1)) subj.push(`${o.label} changes color from ${g('color', t0)} to ${g('color', t1)}`);
  });
  let ease = null;
  for (const [path, keys] of Object.entries(tracks())) {
    const k = keys.find(k => Math.abs(k.t - t0) < 1e-4 && keys.indexOf(k) < keys.length - 1);
    if (k) { ease = k.e; if (path.startsWith('cam.')) break; }
  }
  const shot = c => AC.calc({dist:c.dist, focal:c.focal, sensorW:c.sensor}).shot.name;
  const a0 = AC.azInfo(c0.az, cm.noun, cm.possN), a1 = AC.azInfo(c1.az, cm.noun, cm.possN), e0 = AC.elInfo(c0.el, cm.noun, cm.possN), e1 = AC.elInfo(c1.el, cm.noun, cm.possN);
  const move = moves.length ? moves.join('; ') : 'the camera holds completely still (locked-off)';
  const command = `${rnd(t0, 2)}s to ${rnd(t1, 2)}s: ${cmds.length ? cmds.join(' + ') : 'camera HOLDS STILL'}${ease && cmds.length ? ` (${EASES[ease].desc})` : ''}`;
  const easeTxt = ease && moves.length ? EASES[ease].desc : null;
  const sentence = `${rnd(t0, 2)}–${rnd(t1, 2)}s (frames ${frameOf(t0)}–${frameOf(t1)}): ${cap(move)}${easeTxt ? `, ${easeTxt}` : ''}; framing goes from ${a0.label.toLowerCase()}, ${e0.label.toLowerCase()}, ${shot(c0).toLowerCase()}`
    + (moves.length ? ` to ${a1.label.toLowerCase()}, ${e1.label.toLowerCase()}, ${shot(c1).toLowerCase()}` : '') + (subj.length ? `. ${cap(joinList(subj))}` : '') + '.';
  const cs = (c, a, e) => ({azimuth_deg:Math.round(signed(c.az)), view:a.label, elevation_deg:Math.round(c.el), elevation_view:e.label, distance_m:rnd(c.dist, 3),
    focal_length_mm:Math.round(c.focal), sensor_mm:rnd(c.sensor, 1), roll_deg:Math.round(c.roll), shot_scale:shot(c)});
  return {command, time:`${rnd(t0, 2)}s–${rnd(t1, 2)}s`, frames:`${frameOf(t0)}–${frameOf(t1)}`, camera_move:move, easing:ease ? EASES[ease].name : null, start:cs(c0, a0, e0), end:cs(c1, a1, e1),
    focus:fEnd || f0 || null, subject_motion:subj, description:sentence};
}
hooks.buildVideoPrompt = () => {
  const cm = AC.common(), dur = V().duration;
  const times = [...new Set([0, ...allKeyTimes().filter(t => t > 0 && t < dur), dur].map(t => rnd(t, 4)))].sort((a, b) => a - b);
  const shots = []; for (let i = 0; i < times.length - 1; i++) if (times[i + 1] - times[i] > 1e-3) shots.push(describeSegment(times[i], times[i + 1], cm));
  const c0 = camAt(0), c1 = camAt(dur);
  const ang0 = AC.angleParts(cm, c0.az, c0.el), ang1 = AC.angleParts(cm, c1.az, c1.el);
  const objs = V().objects.map(o => ({label:o.label, proxy_model:MODELS[o.model], height_m:rnd(o.h, 2), width_m:rnd(o.w, 2), position_m:{x:rnd(o.x, 2), z:rnd(o.z, 2), lift:rnd(o.y, 2)}, rotation_deg:Math.round(o.ry),
    reference_image:AC.refs[o.img] ? o.img + 1 : null, description:AC.allSubjects().find(s => s.label === o.label)?.desc || null}));
  const keyframes = {};
  Object.entries(tracks()).forEach(([path, keys]) => {
    const p = props().find(x => x.path === path); if (!p) return;
    keyframes[`${groupName(p.group)} · ${p.name}`] = keys.map(k => ({frame:frameOf(k.t), time_s:rnd(k.t, 3), value:p.fmt(k.v), easing:EASES[k.e]?.name || k.e}));
  });
  const moveSummary = shots.map(s => s.description).join(' ');
  const timing = shots.map(s => s.command).join('. ');
  const shot0 = AC.calc({dist:c0.dist, focal:c0.focal, sensorW:c0.sensor}).shot.name.toLowerCase(), shot1 = AC.calc({dist:c1.dist, focal:c1.focal, sensorW:c1.sensor}).shot.name.toLowerCase();
  const master = `ONE continuous ${dur}-second shot, ${cm.aspectStr}, no cuts. CAMERA MOTION (follow this exact timing and direction): ${timing}. `
    + `First frame: ${ang0.A.label.toLowerCase()}, ${ang0.E.label.toLowerCase()}, ${shot0}. Last frame: ${ang1.A.label.toLowerCase()}, ${ang1.E.label.toLowerCase()}, ${shot1}. `
    + `Subject: the exact same ${cm.subjRef} from the reference image${AC.refs.length > 1 ? 's' : ''}. `
    + (cm.action ? cm.action + ' ' : '')
    + (cm.composition ? 'All subjects from every reference image appear together in one scene. ' : '')
    + `Camera move in detail: ${moveSummary} `
    + `Shot on ${cm.body.name} with ${cm.lensName}. ${cm.dofPhrase}. `
    + (cm.detail ? `Macro detail: ${cm.detail.part}${S.focus.target ? ' of ' + S.focus.target : ''} fills the frame when the camera is closest. ` : '')
    + (cm.focus ? `${cm.focus.target || 'The focus point'} is the main subject and stays centered and sharpest. ` : 'The camera always aims at the subject, which stays centered and in focus. ')
    + `Keep ${joinList(cm.preserve.slice(0, 4))} identical to the reference in every frame. The background turns with the camera and shows the scene from each new direction. `
    + 'The attached reference video is ONLY a camera-motion guide made with simple gray stand-in shapes: copy its camera path, timing, easing and framing, but never its look. '
    + 'The final video must be real live-action footage of the real subjects from the reference images, filmed with a real cinema camera: real skin with pores, real hair, real fabric and materials, natural light and motion. Not 3D, not CGI, not animation, not a game engine look. Smooth, stable, continuous camera motion with no cuts.'
    + (cm.keyTexts.length ? ' ' + cm.keyTexts.map(t => t.split(':')[0]).join('. ') + '.' : '');
  const detailed = [
    `Use the attached reference image${AC.refs.length > 1 ? 's' : ''} as the single source of truth for the ${cm.subjRef}, and the attached camera reference video (visionpilot-camera-reference.mp4) only as the camera-motion and blocking guide. The gray shapes in that video are placeholders: never show them and never copy their 3D look. Film the real subjects as live-action footage.`,
    cm.action, cm.composition, cm.focus?.text || '', cm.detail?.text || '',
    `Video length ${dur} s at ${fps()} fps (${endFrame()} frames), ${cm.aspectStr}, filmed as one single continuous take. Camera timeline (follow the timing and direction exactly, no extra moves): ${timing}. In detail: ${moveSummary}`,
    `The shot starts at ${ang0.A.phrase}, ${ang0.E.phrase} and ends at ${ang1.A.phrase}, ${ang1.E.phrase}.`,
    ang0.hidden.length || ang1.hidden.length ? `As the camera moves, show ${joinList([...new Set([...ang0.hidden, ...ang1.hidden])])} realistically and consistently with the reference. Do not invent new features.` : '',
    `Camera: ${cm.body.name} (${cm.body.sensorName}), ${cm.lensName}, ${cap(cm.lensChar)}.`, `${cm.dofPhrase}.`,
    cm.lightText,
    `Do not change the ${cm.noun}: keep ${joinList(cm.preserve)} exactly as in the reference in every frame, with no flicker or morphing.`,
    cm.bgText, `At the start: ${ang0.bgView} At the end: ${ang1.bgView}`,
    cm.keyTexts.length ? 'Key requirements: ' + cm.keyTexts.join('. ') + '.' : '',
    `${cap(cm.body.look)}. Real live-action cinematography, photorealistic, temporally consistent, natural motion blur and subtle film grain.`
  ].filter(Boolean).join(' ');
  return {
    prompt_type:'camera_motion_video',
    master_prompt:master,
    detailed_prompt:detailed,
    duration_s:dur, fps:fps(), frames:endFrame(), aspect_ratio:cm.aspectStr,
    key_requirements:cm.keyTexts,
    reference_video:{file:'visionpilot-camera-reference.mp4', how_to_use:'camera path, timing, easing, framing and subject placement reference; gray shapes are stand-ins for the real subjects', export_from:'VisionPilot viewer (Export video)'},
    reference_images:AC.refs.length ? AC.refs.map((r, i) => ({image:i + 1, file:r.name, transparent_png:r.alpha || undefined, subjects:cm.subs.filter(s => s.img === i).map(s => s.label)})) : [{image:1, file:null, note:'attach your reference image'}],
    composition:cm.composition || null,
    subjects:objs,
    camera_motion:{timeline:shots.map(s => s.command), rule:'one continuous take; follow each time range and direction exactly; no extra moves, no cuts'},
    shots,
    keyframes,
    focus_point:cm.focus ? {target:cm.focus.target || 'custom point', note:cm.focus.note, animated:!!(tracks().focus?.length || tracks()['focus.x']?.length),
      position_m:cm.focus.target ? null : {x:rnd(fpos().x, 2), y:rnd(fpos().y, 2), z:rnd(fpos().z, 2)}} : null,
    macro_detail:cm.detail ? {detail:cm.detail.part, of:cm.detail.of, approx_size_cm:cm.detail.size_cm} : null,
    camera:{...AC.cameraJSON(cm), start:shots[0]?.start || null, end:shots[shots.length - 1]?.end || null},
    depth_of_field:{enabled:S.dof, aperture:AC.apStr(cm.N), focus:'locked on the focus subject throughout, pulling focus when the target changes', background:cm.bgBlur},
    lighting:AC.lightingJSON(cm),
    background:{setting:cm.bgText, start_angle:ang0.bgView, end_angle:ang1.bgView, rule:'the background must move and change with the camera, never a static pasted backdrop'},
    style:{look:'real live-action footage', not:'3D render, CGI, animation, game engine, gray placeholder shapes', camera_look:cm.body.look},
    negative_prompt:cm.negative + ', 3D animation, rendered look, game engine, Unreal Engine look, gray placeholder shapes, mannequins, low-poly, smooth plastic faces, jittery camera, sudden jumps, jump cuts, flicker, morphing faces, warping, inconsistent identity between frames, frozen background'
  };
};

/* ---------- boot ---------- */
updateTimeUI();
if (S.app === 'video' && V().ready) go();
})();
