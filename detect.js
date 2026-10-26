/* VisionPilot — free in-browser detection & scene understanding (no paid APIs):
   COCO-SSD (TensorFlow.js) with multi-crop + lowered-threshold passes + class-aware NMS,
   MobileNetV2 (TensorFlow.js) fine-grained visual classification,
   face-api.js face + 68-landmark pose/angle estimation,
   and canvas pixel/gradient analysis for accurate colors, materials, lighting, background & depth of field. */
(() => {
const FACE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js'; // bundles TensorFlow.js
const FACE_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
const MOBILENET_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
  s.onload = res; s.onerror = () => { s.remove(); rej(new Error('Could not load ' + src)); }; document.head.appendChild(s);
});

/* ---------- models (loaded once, cached in IndexedDB after first download) ---------- */
const COCO_MODEL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json';
const COCO_IDB = 'indexeddb://vp-coco-lite-v1';
let ready = null, coco = null, mobilenetModel = null, faceOK = false;

function init() {
  const yieldFrame = () => new Promise(r => requestAnimationFrame(r));
  return ready || (ready = (async () => {
    await yieldFrame();
    if (!window.faceapi) await loadScript(FACE_URL);
    await yieldFrame();
    if (!window.tf && window.faceapi?.tf) window.tf = window.faceapi.tf;
    if (!window.cocoSsd) await loadScript(COCO_URL);
    await yieldFrame();
    await window.tf.ready?.();
    await yieldFrame();
    const faces = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS)
    ]).then(() => { faceOK = true; }).catch(e => console.warn('face-api models did not load', e));

    const useIdb = typeof location !== 'undefined' && location.protocol !== 'file:';
    let gm = useIdb ? await window.tf.loadGraphModel(COCO_IDB).catch(() => null) : null;
    if (!gm) {
      gm = await window.tf.loadGraphModel(COCO_MODEL);
      if (useIdb) gm.save(COCO_IDB).catch(() => {});
    }
    await yieldFrame();
    const origLoad = window.tf.loadGraphModel;
    window.tf.loadGraphModel = url => url === COCO_MODEL ? Promise.resolve(gm) : origLoad.call(window.tf, url);
    try { coco = await window.cocoSsd.load({base:'lite_mobilenet_v2'}); }
    finally { window.tf.loadGraphModel = origLoad; }

    const mnLoad = (async () => {
      if (!window.mobilenet) await loadScript(MOBILENET_URL);
      if (window.mobilenet && !mobilenetModel) {
        mobilenetModel = await window.mobilenet.load({version:2, alpha:1.0});
      }
    })().catch(e => console.warn('mobilenet model did not load', e));

    await Promise.race([Promise.all([faces, mnLoad]), new Promise(r => setTimeout(r, 4500))]);
  })().catch(e => { ready = null; throw e; }));
}
// Lazy-loaded on demand when Multiple Mode detection is requested (never block initial page reload)

/* ---------- COCO class -> VisionPilot subject type & category ---------- */
const ANIMALS = new Set(['bird','cat','dog','horse','sheep','cow','elephant','bear','zebra','giraffe']);
const VEHICLES = new Set(['bicycle','motorcycle','airplane','bus','train','truck','boat']);
const PRODUCTS = new Set([
  'bottle','wine glass','cup','fork','knife','spoon','bowl','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza','donut','cake',
  'backpack','umbrella','handbag','tie','suitcase','frisbee','skis','snowboard','sports ball','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'book','clock','vase','scissors','teddy bear','hair drier','toothbrush','laptop','mouse','remote','keyboard','microwave','oven','toaster','sink','refrigerator','tv'
]);
function mapClass(cls) {
  cls = String(cls || '').toLowerCase();
  if (cls === 'person') return 'person';
  if (cls === 'car') return 'car';
  if (cls === 'cell phone') return 'phone';
  if (ANIMALS.has(cls)) return 'animal';
  if (VEHICLES.has(cls)) return 'vehicle';
  if (PRODUCTS.has(cls)) return 'product';
  return 'object';
}
// High-level 3-way category required by Part 2: Person, Product/Object, or Other
function categoryOf(type) {
  if (type === 'person') return 'Person';
  if (['car', 'phone', 'vehicle', 'product', 'object'].includes(type)) return 'Product/Object';
  return 'Other';
}
const DEF_CM = {person:170, car:145, phone:15, animal:60, vehicle:160, product:28, object:60, auto:100};
const NOUN = {person:'person', car:'car', phone:'smartphone', animal:'animal', vehicle:'vehicle', product:'product', object:'object', auto:'subject'};
const TYPE_LABEL = {person:'Person', product:'Product', object:'Object', animal:'Animal', car:'Car', phone:'Phone', vehicle:'Vehicle', auto:'Other'};
const SUBJ_PALETTE = ['#e85d2b', '#3fb950', '#3f7cf6', '#d4a72c', '#a371f7', '#2bb3c0', '#f78fb3', '#f97316', '#22c55e', '#60a5fa'];

function map3DModelInfo(cls, type, subtype) {
  const c = String(cls || subtype || '').toLowerCase();
  if (type === 'person' || c === 'person') return {model3d:'person', base3d:'Person'};
  if (c === 'cat' || /cat|kitten|tabby|persian|siamese/i.test(c)) return {model3d:'cat', base3d:'Cat'};
  if (c === 'chair' || c === 'couch' || c === 'bench' || /chair|armchair|stool|sofa|couch|bench/i.test(c)) return {model3d:'chair', base3d:'Chair'};
  if (c === 'dining table' || c === 'desk' || /table|desk/i.test(c)) return {model3d:'table', base3d:'Table'};
  if (c === 'potted plant' || c === 'tree' || /tree|plant|bush|palm|pine/i.test(c)) return {model3d:'tree', base3d:'Tree'};
  if (type === 'car' || type === 'vehicle' || /car|truck|bus|sedan|coupe|suv/i.test(c)) return {model3d:'car', base3d:'Car'};
  if (type === 'phone' || /phone|smartphone|cell/i.test(c)) return {model3d:'phone', base3d:'Phone'};
  if (type === 'animal' || ANIMALS.has(c)) return {model3d:'animal', base3d:c ? c[0].toUpperCase() + c.slice(1) : 'Animal'};
  if (/bottle|cup|wine glass|vase|mug/i.test(c)) return {model3d:'cylinder', base3d:c ? c[0].toUpperCase() + c.slice(1) : 'Bottle'};
  if (/sports ball|orange|apple|bowl/i.test(c)) return {model3d:'sphere', base3d:c ? c[0].toUpperCase() + c.slice(1) : 'Sphere'};
  return {model3d:'box', base3d:TYPE_LABEL[type] || 'Object'};
}

/* ---------- pixel sampling & accurate perceptual color naming ---------- */
function pixelGrid(img, max = 192) {
  const w0 = img.naturalWidth || img.width || 1, h0 = img.naturalHeight || img.height || 1;
  const s = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(img, 0, 0, w, h);
  return {w, h, data:g.getImageData(0, 0, w, h).data};
}
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = ((mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60) % 360;
  return [h, s, l];
}
function colorName([r, g, b]) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (l < .13) return 'black';
  if (l > .90 && s < .18) return 'white';
  if (s < .11) return l < .28 ? 'charcoal' : l < .48 ? 'dark gray' : l < .74 ? 'gray' : 'light gray';
  if (s < .25 && h >= 18 && h < 55) return l < .35 ? 'dark brown' : l > .68 ? 'beige' : 'tan';
  if (h >= 12 && h < 42 && l < .42) return 'brown';
  if (h >= 34 && h < 60 && l > .74 && s < .45) return 'cream';
  let base;
  if (h < 14 || h >= 345) base = 'red';
  else if (h < 28) base = 'red-orange';
  else if (h < 44) base = 'orange';
  else if (h < 66) base = 'yellow';
  else if (h < 84) base = 'lime green';
  else if (h < 155) base = 'green';
  else if (h < 186) base = 'teal';
  else if (h < 208) base = 'cyan';
  else if (h < 252) base = 'blue';
  else if (h < 275) base = 'indigo';
  else if (h < 308) base = 'purple';
  else if (h < 332) base = 'magenta';
  else base = 'pink';
  if (base === 'blue' && l < .28) return 'navy blue';
  if (base === 'blue' && l > .70) return 'sky blue';
  if (base === 'red' && l < .28) return 'maroon';
  if (base === 'green' && l < .27) return 'forest green';
  if (l < .26) return 'dark ' + base;
  if (l > .77 && s < .65) return 'light ' + base;
  return base;
}
const toHex = ([r, g, b]) => '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');

function borderBg(px) {
  const {w, h, data} = px, samples = [];
  const push = (x, y) => { const i = (y * w + x) * 4; if (data[i + 3] >= 128) samples.push([data[i], data[i + 1], data[i + 2]]); };
  for (let x = 0; x < w; x += 2) { push(x, 0); push(x, 1); push(x, h - 1); }
  for (let y = 0; y < h; y += 2) { push(0, y); push(w - 1, y); }
  if (!samples.length) return null;
  const rs = samples.map(s => s[0]).sort((a, b) => a - b);
  const gs = samples.map(s => s[1]).sort((a, b) => a - b);
  const bs = samples.map(s => s[2]).sort((a, b) => a - b);
  const m = Math.floor(samples.length / 2);
  return [rs[m], gs[m], bs[m]];
}

// Weighted color histogram inside a normalized box {x,y,w,h}; ignores border background and boosts saturated/center pixels
function dominant(px, box, opts = {}) {
  const {w, h, data} = px;
  const x0 = clamp(Math.floor(box.x * w), 0, w - 1), y0 = clamp(Math.floor(box.y * h), 0, h - 1);
  const x1 = clamp(Math.ceil((box.x + box.w) * w), x0 + 1, w), y1 = clamp(Math.ceil((box.y + box.h) * h), y0 + 1, h);
  const bg = opts.skipBorder === false ? null : borderBg(px);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = Math.max(1, (x1 - x0) / 2), ry = Math.max(1, (y1 - y0) / 2);
  const bins = new Map(), satBins = new Map();
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 128) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (bg && Math.hypot(r - bg[0], g - bg[1], b - bg[2]) < 24) continue;
    const [, s, l] = rgbToHsl(r, g, b);
    const dist2 = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    const cw = opts.centerWeight !== false ? Math.max(.2, 1.25 - .65 * dist2) : 1;
    const sw = (s > .18 && l > .12 && l < .88) ? (1 + s * (opts.satWeight ?? 2.4)) : (l < .08 || l > .93 ? .35 : .65);
    const wt = cw * sw;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const b0 = bins.get(k) || [0, 0, 0, 0];
    b0[0] += wt; b0[1] += r * wt; b0[2] += g * wt; b0[3] += b * wt;
    bins.set(k, b0);
    if (s > .20 && l > .13 && l < .86) {
      const s0 = satBins.get(k) || [0, 0, 0, 0];
      s0[0] += wt; s0[1] += r * wt; s0[2] += g * wt; s0[3] += b * wt;
      satBins.set(k, s0);
    }
  }
  if (!bins.size && bg) return dominant(px, box, {...opts, skipBorder:false});
  if (!bins.size) return null;
  let totalW = 0, satW = 0;
  for (const v of bins.values()) totalW += v[0];
  for (const v of satBins.values()) satW += v[0];
  const pool = (satBins.size && satW > totalW * .16) ? satBins : bins;
  const top = [...pool.values()].sort((a, b) => b[0] - a[0]);
  const [n0, sr0, sg0, sb0] = top[0];
  const seed = [sr0 / n0, sg0 / n0, sb0 / n0];
  let tw = 0, tr = 0, tg = 0, tb = 0;
  for (const [nw, sr, sg, sb] of top.slice(0, 6)) {
    const c = [sr / nw, sg / nw, sb / nw];
    if (Math.hypot(c[0] - seed[0], c[1] - seed[1], c[2] - seed[2]) < 48) {
      tw += nw; tr += sr; tg += sg; tb += sb;
    }
  }
  const rgb = tw > 0 ? [tr / tw, tg / tw, tb / tw] : seed;
  return {rgb, name:colorName(rgb), hex:toHex(rgb)};
}

/* ---------- geometry & non-max suppression ---------- */
const sub = (b, rx, ry, rw, rh) => ({x:b.x + b.w * rx, y:b.y + b.h * ry, w:b.w * rw, h:b.h * rh});
const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function iou(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const ua = a.w * a.h + b.w * b.h - inter;
  return ua > 0 ? inter / ua : 0;
}
function containment(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const minA = Math.min(a.w * a.h, b.w * b.h);
  return minA > 0 ? inter / minA : 0;
}

// Connected-component foreground island segmentation for finding distinct objects/products on clean or uniform backgrounds
function findForegroundIslands(px) {
  const {w, h, data} = px, bg = borderBg(px);
  if (!bg) return [];
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 110) continue;
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    if (d > 28) mask[y * w + x] = 1;
  }
  const vis = new Uint8Array(w * h), islands = [];
  const q = new Int32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const idx = y * w + x;
    if (!mask[idx] || vis[idx]) continue;
    let head = 0, tail = 0, x0 = x, y0 = y, x1 = x, y1 = y, cnt = 0;
    q[tail++] = idx; vis[idx] = 1;
    while (head < tail) {
      const cur = q[head++], cy = Math.floor(cur / w), cx = cur - cy * w;
      cnt++;
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx;
      if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
      const nb = [cur - 1, cur + 1, cur - w, cur + w];
      for (let k = 0; k < 4; k++) {
        const n = nb[k];
        if (n >= 0 && n < w * h && mask[n] && !vis[n]) { vis[n] = 1; q[tail++] = n; }
      }
    }
    const bw = (x1 - x0 + 1) / w, bh = (y1 - y0 + 1) / h, area = bw * bh;
    if (cnt > (w * h) * .010 && area > .012 && area < .92) {
      islands.push({x:clamp(x0 / w - .01, 0, 1), y:clamp(y0 / h - .01, 0, 1), w:clamp(bw + .02, .05, 1), h:clamp(bh + .02, .05, 1), mass:cnt / (w * h)});
    }
  }
  islands.sort((a, b) => b.mass - a.mass);
  const merged = [];
  for (const isl of islands) {
    const hit = merged.find(m => iou(m, isl) > .25 || containment(m, isl) > .68);
    if (hit) {
      const nx = Math.min(hit.x, isl.x), ny = Math.min(hit.y, isl.y);
      const nx1 = Math.max(hit.x + hit.w, isl.x + isl.w), ny1 = Math.max(hit.y + hit.h, isl.y + isl.h);
      hit.x = nx; hit.y = ny; hit.w = nx1 - nx; hit.h = ny1 - ny; hit.mass += isl.mass;
    } else merged.push({...isl});
  }
  return merged.slice(0, 8);
}

// Estimate body bounding box when face-api detects a person's face that COCO-SSD missed
function inferPersonBoxFromFace(fbox, px) {
  const cx = fbox.x + fbox.w / 2;
  const bw = clamp(fbox.w * 3.1, .16, .82);
  const bx = clamp(cx - bw / 2, 0, 1 - bw);
  const by = clamp(fbox.y - fbox.h * .28, 0, .9);
  let bh = clamp(fbox.h * 5.8, .28, 1 - by);
  const isl = findForegroundIslands(px).find(i => inside({x:cx, y:fbox.y + fbox.h / 2}, i));
  if (isl && isl.h > bh * .7) {
    return {x:isl.x, y:Math.min(by, isl.y), w:isl.w, h:clamp(Math.max(bh, isl.y + isl.h - Math.min(by, isl.y)), .2, 1)};
  }
  return {x:bx, y:by, w:bw, h:bh};
}

/* ---------- pose, orientation & angle estimation ---------- */
function personPoseAndAngle(b, face, px) {
  let facing = 'front-facing view', viewCode = 'front';
  if (face && face.pts && face.pts.length >= 68) {
    const pts = face.pts;
    const rEye = pts[36], lEye = pts[45], nose = pts[30], jawL = pts[0], jawR = pts[16], chin = pts[8];
    const eyeSpan = Math.max(1e-4, Math.hypot(lEye[0] - rEye[0], lEye[1] - rEye[1]));
    const eyeMidX = (rEye[0] + lEye[0]) / 2, eyeMidY = (rEye[1] + lEye[1]) / 2;
    const yawRatio = (nose[0] - eyeMidX) / eyeSpan;
    const jawLdist = Math.hypot(nose[0] - jawL[0], nose[1] - jawL[1]);
    const jawRdist = Math.hypot(jawR[0] - nose[0], jawR[1] - nose[1]);
    const asym = (jawLdist - jawRdist) / Math.max(1e-4, jawLdist + jawRdist);
    const yaw = yawRatio * .6 + asym * .4;
    if (yaw > .28) { facing = 'profile / strong three-quarter view facing right'; viewCode = 'right'; }
    else if (yaw > .11) { facing = 'three-quarter view angled slightly right'; viewCode = 'three-quarter'; }
    else if (yaw < -.28) { facing = 'profile / strong three-quarter view facing left'; viewCode = 'left'; }
    else if (yaw < -.11) { facing = 'three-quarter view angled slightly left'; viewCode = 'three-quarter'; }
    else { facing = 'front-facing view looking at camera'; viewCode = 'front'; }
    const faceH = Math.max(1e-4, chin[1] - eyeMidY);
    const noseRel = (nose[1] - eyeMidY) / faceH;
    if (noseRel < .34) facing += ', head tilted slightly up';
    else if (noseRel > .52) facing += ', head tilted slightly down';
  } else if (!face) {
    const headCol = dominant(px, sub(b, .28, .02, .44, .16), {skipBorder:true, satWeight:.5});
    if (headCol && ['black', 'dark brown', 'brown', 'charcoal'].includes(headCol.name)) {
      facing = 'back or turned-away view'; viewCode = 'back';
    }
  }
  const ar = b.h / Math.max(.05, b.w);
  let framing;
  if (b.h > .74 && ar > 1.75) framing = 'full-body standing pose';
  else if (b.h > .58 && ar <= 1.75) framing = 'seated or crouched full/three-quarter pose';
  else if (b.h > .45) framing = 'medium / three-quarter body framing';
  else if (face && face.box.h / b.h > .42) framing = 'close-up portrait framing';
  else framing = 'upper-body / waist-up framing';
  return {facing, framing, viewCode};
}

function objectAngleAndSurface(b, type, px) {
  const {w, h, data} = px, bg = borderBg(px) || [128, 128, 128];
  const x0 = clamp(Math.floor(b.x * w), 0, w - 1), y0 = clamp(Math.floor(b.y * h), 0, h - 1);
  const x1 = clamp(Math.ceil((b.x + b.w) * w), x0 + 1, w), y1 = clamp(Math.ceil((b.y + b.h) * h), y0 + 1, h);
  let leftMass = 0, rightMass = 0, topMass = 0, botMass = 0, glints = 0, darks = 0, total = 0;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * w + x) * 4;
    if (data[i + 3] < 110) continue;
    const d = Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]);
    if (d < 22) continue;
    total++;
    if (x < mx) leftMass++; else rightMass++;
    if (y < my) topMass++; else botMass++;
    const [, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    if (l > .86 && s < .28) glints++;
    if (l < .16) darks++;
  }
  const aspect = b.w / Math.max(.05, b.h);
  const lrSkew = total > 20 ? (leftMass - rightMass) / total : 0;
  const tbSkew = total > 20 ? (topMass - botMass) / total : 0;
  const glintRatio = total > 20 ? glints / total : 0;

  let angleText = 'front view, eye-level camera angle', viewCode = 'front';
  if (type === 'car' || type === 'vehicle') {
    if (aspect > 1.72) {
      const dir = lrSkew > .04 ? 'facing left' : lrSkew < -.04 ? 'facing right' : 'horizontal profile';
      angleText = `side profile view (${dir}), eye-level angle`;
      viewCode = lrSkew >= 0 ? 'left' : 'right';
    } else if (aspect > 1.28) {
      const dir = lrSkew >= 0 ? 'front-left' : 'front-right';
      angleText = `${dir} three-quarter view, slightly ${tbSkew < -.05 ? 'elevated' : 'eye-level'} angle`;
      viewCode = 'three-quarter';
    } else {
      angleText = `direct front/rear view, ${tbSkew < -.06 ? 'slightly high angle' : 'eye-level angle'}`;
      viewCode = 'front';
    }
  } else if (type === 'phone') {
    const camTL = dominant(px, sub(b, .06, .04, .34, .26), {skipBorder:false});
    const bodyMid = dominant(px, sub(b, .25, .42, .50, .38), {skipBorder:false});
    const hasCamBump = camTL && bodyMid && Math.hypot(camTL.rgb[0] - bodyMid.rgb[0], camTL.rgb[1] - bodyMid.rgb[1], camTL.rgb[2] - bodyMid.rgb[2]) > 14;
    if (aspect < .68) {
      angleText = `upright / flat-lay vertical orientation (${hasCamBump ? 'back side showing camera module' : 'front/back face visible'})`;
      viewCode = hasCamBump ? 'back' : 'front';
    } else if (aspect > 1.35) {
      angleText = 'horizontal landscape orientation, angled product view';
      viewCode = 'three-quarter';
    } else {
      angleText = `angled three-quarter product view (${hasCamBump ? 'rear panel & camera module visible' : 'main face visible'})`;
      viewCode = hasCamBump ? 'back' : 'three-quarter';
    }
  } else {
    if (tbSkew < -.10) { angleText = 'slightly elevated high-angle product view (~25° down)'; viewCode = 'three-quarter'; }
    else if (tbSkew > .10) { angleText = 'low-angle heroic product view (~15° up)'; viewCode = 'front'; }
    else if (Math.abs(lrSkew) > .09) { angleText = `three-quarter angled view (${lrSkew > 0 ? 'turned slightly left' : 'turned slightly right'})`; viewCode = 'three-quarter'; }
    else { angleText = 'straight-on front eye-level view'; viewCode = 'front'; }
  }
  const finish = glintRatio > .045 ? 'glossy / metallic reflective finish'
    : glintRatio > .015 ? 'semi-gloss smooth surface finish'
    : 'matte / soft-textured surface finish';
  const condition = darks / Math.max(1, total) > .45 ? 'clean dark-toned surface in pristine studio condition' : 'clean, well-maintained condition with crisp surface contours';
  return {angleText, viewCode, finish, condition};
}

function spatialPosition(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, area = b.w * b.h;
  const horiz = cx < .34 ? 'on the left side of the frame' : cx > .66 ? 'on the right side of the frame' : cx < .44 ? 'slightly left of center' : cx > .56 ? 'slightly right of center' : 'centered horizontally';
  const vert = cy < .36 ? 'in the upper portion' : cy > .64 ? 'in the lower portion' : 'at mid-frame height';
  const depth = area > .42 ? 'foreground close-up (fills ~' + Math.round(area * 100) + '% of frame)'
    : area > .15 ? 'midground primary plane (~' + Math.round(area * 100) + '% of frame)'
    : 'background / secondary plane (~' + Math.round(area * 100) + '% of frame)';
  return {horiz, vert, depth, summary:`${horiz}, ${vert} (${depth})`};
}

/* ---------- cross-class & same-class NMS deduplication ---------- */
const HANDHELD_CLASSES = new Set([
  'cell phone','bottle','wine glass','cup','bowl','book','handbag','backpack','umbrella','laptop',
  'sports ball','remote','clock','vase','scissors','toothbrush','tie','suitcase','frisbee','skis',
  'snowboard','kite','baseball bat','baseball glove','skateboard','surfboard','tennis racket',
  'fork','knife','spoon','banana','apple','sandwich','orange','broccoli','carrot','hot dog','pizza',
  'donut','cake','mouse','keyboard','teddy bear','hair drier','potted plant'
]);
const CONTAINER_SURFACE_CLASSES = new Set([
  'dining table','couch','bed','bench','chair','desk','table','refrigerator','oven','sink','tv'
]);
function sameCategoryGroup(a, b) {
  if (a.cls && b.cls && a.cls === b.cls) return true;
  // Never treat two different COCO classes (e.g. a cup on a dining table, or a laptop on a couch, or a bottle next to a bowl) as the same category group!
  const aIsGeneric = !a.cls || a.cls === 'subject' || a.cls === 'product' || a.cls === 'object';
  const bIsGeneric = !b.cls || b.cls === 'subject' || b.cls === 'product' || b.cls === 'object';
  if (!aIsGeneric && !bIsGeneric && a.cls !== b.cls) {
    if (['car', 'truck', 'bus'].includes(a.cls) && ['car', 'truck', 'bus'].includes(b.cls)) return true;
    return false;
  }
  if (a.type === b.type) return true;
  if (['car', 'vehicle'].includes(a.type) && ['car', 'vehicle'].includes(b.type)) return true;
  if (aIsGeneric && bIsGeneric && ['product', 'object', 'auto'].includes(a.type) && ['product', 'object', 'auto'].includes(b.type)) return true;
  return false;
}
function dedupeCandidates(candidates) {
  // Filter invalid or microscopic noise boxes
  const rawValid = candidates.filter(c => {
    const b = c.box;
    if (!b || b.w < .024 || b.h < .026 || b.w * b.h < .0022) return false;
    if (b.w > .98 && b.h > .98 && (c.score || 0) < .52) return false;
    return true;
  });

  // Eliminate composite wide group boxes that span 2 or more distinct individual detections of the same category
  // (e.g. a full-image box covering 2-3 cats or 3-4 objects while crop passes found each individual cat/object)
  const valid = rawValid.filter(w => {
    const wArea = w.box.w * w.box.h;
    if (wArea < .10 || w.box.w < .34) return true;
    const inner = rawValid.filter(c => {
      if (c === w || !sameCategoryGroup(w, c)) return false;
      const cArea = c.box.w * c.box.h;
      if (cArea >= wArea * .72 || c.box.w >= w.box.w * .72) return false;
      return containment(w.box, c.box) > .68 && (c.score || 0) >= .15;
    });
    if (inner.length < 2) return true;
    for (let i = 0; i < inner.length; i++) {
      for (let j = i + 1; j < inner.length; j++) {
        const bi = inner[i].box, bj = inner[j].box;
        const xOv = Math.max(0, Math.min(bi.x + bi.w, bj.x + bj.w) - Math.max(bi.x, bj.x));
        const xOvRatio = xOv / Math.max(1e-5, Math.min(bi.w, bj.w));
        if (iou(bi, bj) < .28 && xOvRatio < .35) {
          return false; // w is a composite box spanning multiple horizontally separate subjects
        }
      }
    }
    return true;
  });

  // Sort primarily by confidence score (slightly favoring tight specific objects over huge background furniture)
  valid.sort((a, b) => {
    const aSurf = CONTAINER_SURFACE_CLASSES.has(a.cls) ? .90 : 1.0;
    const bSurf = CONTAINER_SURFACE_CLASSES.has(b.cls) ? .90 : 1.0;
    const sa = (a.score || .5) * aSurf * (1 + .04 * Math.sqrt(a.box.w * a.box.h));
    const sb = (b.score || .5) * bSurf * (1 + .04 * Math.sqrt(b.box.w * b.box.h));
    return sb - sa;
  });
  const kept = [];
  for (const cand of valid) {
    let dup = false;
    const candArea = cand.box.w * cand.box.h;
    for (const k of kept) {
      const kArea = k.box.w * k.box.h;
      const ov = iou(k.box, cand.box);
      const cont = containment(k.box, cand.box);
      const sameType = sameCategoryGroup(k, cand);

      if (sameType) {
        // For people, if both have distinct non-overlapping faces, keep both people!
        const twoDistinctFaces = k.type === 'person' && k._face && cand._face && iou(k._face.box, cand._face.box) < .15;
        const kcx = k.box.x + k.box.w / 2, kcy = k.box.y + k.box.h / 2;
        const ccx = cand.box.x + cand.box.w / 2, ccy = cand.box.y + cand.box.h / 2;
        const centerDist = Math.hypot(kcx - ccx, kcy - ccy);
        const minSpan = Math.min(Math.max(k.box.w, k.box.h), Math.max(cand.box.w, cand.box.h));
        const iouThr = k.type === 'animal' ? .42 : k.type === 'person' ? .44 : .42;
        // Merge upper-half and lower-half detections of the exact same standing person
        const xOv = Math.max(0, Math.min(k.box.x + k.box.w, cand.box.x + cand.box.w) - Math.max(k.box.x, cand.box.x));
        const xOvRatio = xOv / Math.max(1e-5, Math.min(k.box.w, cand.box.w));
        const yOv = Math.min(k.box.y + k.box.h, cand.box.y + cand.box.h) - Math.max(k.box.y, cand.box.y);
        if (!twoDistinctFaces && k.type === 'person' && xOvRatio > .62 && Math.abs(kcx - ccx) < Math.max(k.box.w, cand.box.w) * .36 && yOv > -.02) {
          const minX = Math.min(k.box.x, cand.box.x), maxX = Math.max(k.box.x + k.box.w, cand.box.x + cand.box.w);
          const minY = Math.min(k.box.y, cand.box.y), maxY = Math.max(k.box.y + k.box.h, cand.box.y + cand.box.h);
          k.box = {x:minX, y:minY, w:maxX - minX, h:maxY - minY};
          dup = true; break;
        }
        if (!twoDistinctFaces && (ov > iouThr || (cont > .78 && (centerDist < minSpan * .52 || candArea < kArea * .85)))) {
          dup = true; break;
        }
      } else {
        // Cross-class duplicate check:
        const candIsGeneric = cand.cls === 'subject' || cand.cls === 'product';
        const kIsGeneric = k.cls === 'subject' || k.cls === 'product';
        if (candIsGeneric && (cont > .68 || ov > .42)) { dup = true; break; }
        if (kIsGeneric && !candIsGeneric && (cont > .68 || ov > .42)) {
          Object.assign(k, cand);
          dup = true; break;
        }
        // Laptop vs its own screen (tv) or built-in keyboard: keep laptop
        const isLaptopPartPair = (k.cls === 'laptop' && (cand.cls === 'tv' || cand.cls === 'keyboard')) ||
          (cand.cls === 'laptop' && (k.cls === 'tv' || k.cls === 'keyboard'));
        if (isLaptopPartPair && (cont > .52 || ov > .24)) {
          if (cand.cls === 'laptop' && k.cls !== 'laptop') Object.assign(k, cand);
          dup = true; break;
        }
        // Faceless low-confidence person overlapping a detected animal (e.g. cats/dogs) is a false positive
        if (k.type === 'animal' && cand.type === 'person' && !cand._face && (cand.score || 0) < .52 && (ov > .18 || cont > .45)) {
          dup = true; break;
        }
        if (cand.type === 'animal' && k.type === 'person' && !k._face && (k.score || 0) < .52 && (ov > .18 || cont > .45)) {
          Object.assign(k, cand);
          dup = true; break;
        }
        // Never allow a container/furniture surface (table, couch, bed, chair, bench) to suppress a smaller object on/in it, or vice versa!
        const oneIsContainer = CONTAINER_SURFACE_CLASSES.has(k.cls) !== CONTAINER_SURFACE_CLASSES.has(cand.cls);
        const areaRatio = Math.min(kArea, candArea) / Math.max(1e-5, Math.max(kArea, candArea));
        if (oneIsContainer && areaRatio < .68) {
          continue;
        }
        // If two non-person detections have nearly identical bounding boxes (ov > 0.65 and similar size) on the exact same item, keep higher score
        if (k.type !== 'person' && cand.type !== 'person' && ov > .65 && areaRatio > .62) {
          dup = true; break;
        }
        // If cand is inside a person box (or person overlaps cand), keep distinct handheld/accessory/furniture/smaller items
        if (k.type === 'person' && cont > .85 && !HANDHELD_CLASSES.has(cand.cls) && !CONTAINER_SURFACE_CLASSES.has(cand.cls) && candArea > kArea * .65 && ov > .60) {
          dup = true; break;
        }
      }
    }
    if (!dup) kept.push({...cand, box:{...cand.box}});
  }
  return kept;
}

/* ---------- main detection pipeline (multi-crop COCO-SSD + face-api + MobileNetV2 + islands) ---------- */
async function analyze(img) {
  await init();
  const w0 = img.naturalWidth || img.width || 1, h0 = img.naturalHeight || img.height || 1;
  const s = Math.min(1, 640 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // 1) Full-image COCO-SSD pass with lowered threshold (0.10) so all foreground, background, and tabletop objects are caught
  const rawFull = await coco.detect(c, 60, .10).catch(() => []);
  await new Promise(r => setTimeout(r, 0));

  // 2) Multi-scale overlapping sub-crop passes (halves, thirds, quadrants, and center focus crops) with main-thread yields
  const crops = [
    {rx:0,    ry:0,   rw:.62, rh:1},
    {rx:.38,  ry:0,   rw:.62, rh:1},
    {rx:0,    ry:0,   rw:.46, rh:1},
    {rx:.27,  ry:0,   rw:.46, rh:1},
    {rx:.54,  ry:0,   rw:.46, rh:1},
    {rx:0,    ry:0,   rw:.58, rh:.58},
    {rx:.42,  ry:0,   rw:.58, rh:.58},
    {rx:0,    ry:.42, rw:.58, rh:.58},
    {rx:.42,  ry:.42, rw:.58, rh:.58},
    {rx:.16,  ry:.14, rw:.68, rh:.72},
    {rx:0,    ry:.22, rw:.54, rh:.68},
    {rx:.46,  ry:.22, rw:.54, rh:.68}
  ];
  const rawCrops = [];
  const subC = document.createElement('canvas');
  const subG = subC.getContext('2d');
  for (let ci = 0; ci < crops.length; ci++) {
    const cr = crops[ci];
    const cw = Math.max(64, Math.round(w * cr.rw)), ch = Math.max(64, Math.round(h * cr.rh));
    const sx = Math.round(w * cr.rx), sy = Math.round(h * cr.ry);
    subC.width = cw; subC.height = ch;
    subG.drawImage(c, sx, sy, cw, ch, 0, 0, cw, ch);
    const dets = await coco.detect(subC, 30, .12).catch(() => []);
    for (const d of dets) {
      const bx = d.bbox[0] / cw, by = d.bbox[1] / ch, bw = d.bbox[2] / cw, bh = d.bbox[3] / ch;
      const touchesInternalLeft = cr.rx > 0 && bx < .016;
      const touchesInternalRight = (cr.rx + cr.rw) < .99 && (bx + bw) > .984;
      const touchesInternalTop = cr.ry > 0 && by < .016;
      const touchesInternalBot = (cr.ry + cr.rh) < .99 && (by + bh) > .984;
      if (touchesInternalLeft || touchesInternalRight || touchesInternalTop || touchesInternalBot) continue;
      rawCrops.push({
        cls: d.class,
        type: mapClass(d.class),
        score: d.score * .96,
        box: {
          x: clamp(cr.rx + bx * cr.rw, 0, 1),
          y: clamp(cr.ry + by * cr.rh, 0, 1),
          w: clamp(bw * cr.rw, .02, 1),
          h: clamp(bh * cr.rh, .02, 1)
        }
      });
    }
    if (ci % 3 === 2) await new Promise(r => setTimeout(r, 0));
  }

  // 3) Face detection + 68 landmarks (inputSize 416 catches smaller faces in 3-4 person group photos)
  let rawFaces = [];
  if (faceOK) {
    try { rawFaces = await faceapi.detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({inputSize:416, scoreThreshold:.24})).withFaceLandmarks(); }
    catch (e) { rawFaces = []; }
  }
  const mnScene = [];
  const px = pixelGrid(img);

  const faces = (rawFaces || []).map(f => {
    const b = f.detection.box;
    return {
      box:{x:clamp(b.x / w, 0, 1), y:clamp(b.y / h, 0, 1), w:clamp(b.width / w, 0, 1), h:clamp(b.height / h, 0, 1)},
      pts:f.landmarks.positions.map(p => [p.x / w, p.y / h])
    };
  });

  const fullMapped = (rawFull || []).map(r => ({
    cls: r.class,
    type: mapClass(r.class),
    score: r.score,
    box: {
      x: clamp(r.bbox[0] / w, 0, 1),
      y: clamp(r.bbox[1] / h, 0, 1),
      w: clamp(r.bbox[2] / w, 0, 1),
      h: clamp(r.bbox[3] / h, 0, 1)
    }
  }));

  // Combine full-frame and sub-crop detections and deduplicate
  let objs = dedupeCandidates([...fullMapped, ...rawCrops]);

  // Attach faces to person boxes; if a single person box contains multiple distinct faces, split cleanly along midpoints between faces
  const usedFaces = new Set();
  const expandedObjs = [];
  for (const o of objs) {
    if (o.type === 'person') {
      const matchingFaces = faces.filter((f, fi) => !usedFaces.has(fi) && inside({x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2}, o.box));
      if (matchingFaces.length <= 1) {
        if (matchingFaces[0]) {
          o._face = matchingFaces[0];
          usedFaces.add(faces.indexOf(matchingFaces[0]));
        }
        expandedObjs.push(o);
      } else {
        matchingFaces.sort((a, b) => (a.box.x + a.box.w / 2) - (b.box.x + b.box.w / 2));
        const fCenters = matchingFaces.map(f => f.box.x + f.box.w / 2);
        matchingFaces.forEach((f, idx) => {
          usedFaces.add(faces.indexOf(f));
          const leftBound = idx === 0 ? o.box.x : (fCenters[idx - 1] + fCenters[idx]) / 2;
          const rightBound = idx === matchingFaces.length - 1 ? (o.box.x + o.box.w) : (fCenters[idx] + fCenters[idx + 1]) / 2;
          const inf = inferPersonBoxFromFace(f.box, px);
          const bx = clamp(Math.max(leftBound, inf.x), 0, .95);
          const bw = clamp(Math.min(rightBound, inf.x + inf.w) - bx, .08, 1 - bx);
          expandedObjs.push({cls:'person', type:'person', score:o.score || .82, box:{x:bx, y:o.box.y, w:bw, h:o.box.h}, _face:f});
        });
      }
    } else {
      expandedObjs.push(o);
    }
  }
  objs = expandedObjs;

  // Any remaining detected face not inside a person box (and not on an animal) spawns a dedicated person subject
  faces.forEach((f, fi) => {
    if (usedFaces.has(fi)) return;
    const fc = {x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2};
    const hasPerson = objs.some(o => o.type === 'person' && (inside(fc, o.box) || iou(o.box, f.box) > .15));
    const onAnimal = objs.some(o => o.type === 'animal' && (inside(fc, o.box) || iou(o.box, f.box) > .06 || containment(o.box, f.box) > .25));
    if (!hasPerson && !onAnimal) {
      objs.push({cls:'person', type:'person', score:.82, box:inferPersonBoxFromFace(f.box, px), _face:f});
    }
  });

  // Filter out false-positive faceless person detections overlapping animals (e.g. multi-cat photos)
  const animalObjs = objs.filter(o => o.type === 'animal' && (o.score || 0) >= .32);
  if (animalObjs.length) {
    objs = objs.filter(o => {
      if (o.type !== 'person' || o._face) return true;
      const overlapsAnimal = animalObjs.some(a => iou(o.box, a.box) > .14 || containment(o.box, a.box) > .38);
      if (overlapsAnimal && (o.score || 0) < .68) return false;
      if (!faces.length && (o.score || 0) < .58) return false;
      return true;
    });
  }

  // Foreground island pass: catch distinct products/objects across all scenes that COCO missed or merged
  const islands = findForegroundIslands(px);
  const hasPeopleOrAnimalsOrCars = objs.some(o => ['person', 'animal', 'car', 'vehicle'].includes(o.type));
  // If a single generic product/object box covers 2+ separated foreground islands, split it into the individual islands
  if (!hasPeopleOrAnimalsOrCars && islands.length >= 2) {
    const splitObjs = [];
    for (const o of objs) {
      const innerIsls = islands.filter(isl => containment(o.box, isl) > .65 && (isl.w * isl.h) < (o.box.w * o.box.h) * .75);
      if (innerIsls.length >= 2) {
        innerIsls.forEach(isl => splitObjs.push({cls:o.cls, type:o.type, score:o.score, box:{x:isl.x, y:isl.y, w:isl.w, h:isl.h}}));
      } else {
        splitObjs.push(o);
      }
    }
    objs = splitObjs;
  }
  const minIslandMass = hasPeopleOrAnimalsOrCars ? .018 : .007;
  for (const isl of islands) {
    const covered = objs.some(o => iou(o.box, isl) > .22 || containment(o.box, isl) > .58);
    const touchesBottomCorner = isl.y > .68 && (isl.y + isl.h > .97) && (isl.x < .03 || isl.x + isl.w > .97);
    if (!covered && !touchesBottomCorner && objs.length < 14 && isl.mass > minIslandMass) {
      objs.push({cls:'product', type:objs.length === 0 ? 'auto' : 'product', score:.52, box:{x:isl.x, y:isl.y, w:isl.w, h:isl.h}});
    }
  }

  objs = dedupeCandidates(objs);

  if (!objs.length) {
    const fallbackBox = islands[0] ? {x:islands[0].x, y:islands[0].y, w:islands[0].w, h:islands[0].h} : {x:.15, y:.1, w:.7, h:.8};
    objs = [{cls:'subject', type:'auto', score:.5, box:fallbackBox}];
  }

  // Sort left-to-right for natural numbering (Person 1, Person 2, Car 1, Product 1...)
  objs.sort((a, b) => (a.box.x + a.box.w / 2) - (b.box.x + b.box.w / 2));

  // Per-subject fine-grained classification with MobileNetV2 for generic/auto/product/object boxes
  if (mobilenetModel) {
    const subC = document.createElement('canvas');
    const subG = subC.getContext('2d');
    for (const o of objs.slice(0, 10)) {
      if (o.type !== 'auto' && o.cls !== 'subject' && o.cls !== 'product' && o.type !== 'object') continue;
      try {
        const sx = clamp(Math.floor(o.box.x * w), 0, w - 1), sy = clamp(Math.floor(o.box.y * h), 0, h - 1);
        const sw = clamp(Math.round(o.box.w * w), 16, w - sx), sh = clamp(Math.round(o.box.h * h), 16, h - sy);
        subC.width = Math.min(224, sw); subC.height = Math.min(224, sh);
        subG.drawImage(c, sx, sy, sw, sh, 0, 0, subC.width, subC.height);
        const preds = await mobilenetModel.classify(subC, 3).catch(() => []);
        if (preds && preds.length) {
          o._mnTags = preds.filter(p => p.probability >= .10).map(p => p.className.split(',')[0].trim().toLowerCase());
          const topTag = o._mnTags[0] || '';
          if (o.type === 'auto' || o.cls === 'subject' || o.cls === 'product') {
            if (/car|sedan|coupe|convertible|cabriolet|limousine|minivan|jeep|sports car|wagon|racer/i.test(topTag)) { o.type = 'car'; o.cls = topTag; }
            else if (/cellular telephone|cellphone|iPod|hand-held computer|modem/i.test(topTag)) { o.type = 'phone'; o.cls = 'smartphone'; }
            else if (/cat|tabby|tiger cat|persian cat|siamese cat|egyptian cat|dog|retriever|terrier|spaniel|shepherd|pug|poodle|hound|husky|bird|parrot|owl|horse|cow|sheep/i.test(topTag)) { o.type = 'animal'; o.cls = topTag; }
            else if (/bottle|perfume|lotion|mug|cup|watch|shoe|sneaker|sandal|sunglass|camera|bag|backpack|lamp|vase|clock|pillow|cushion|book|headphones|speaker/i.test(topTag)) { o.type = 'product'; o.cls = topTag; }
            else if (topTag) { o.type = 'product'; o.cls = topTag; }
          }
        }
      } catch (e) {}
    }
  }

  const counts = {};
  const subjects = objs.slice(0, 12).map((o, idx) => describe(o, px, faces, idx, counts));
  assign3DSceneInfo(subjects);
  const sceneMeta = analyzeSceneContext(px, subjects, mnScene);
  const det = {
    w: w0,
    h: h0,
    subjects,
    faces,
    view: subjects[0]?.viewCode || 'front',
    sceneMeta
  };
  det.fullSceneDesc = buildSceneParagraph(det, {isMulti:false, selectedKey:''});
  return det;
}

function assign3DSceneInfo(subjects) {
  if (!Array.isArray(subjects) || !subjects.length) return;
  const counts3d = {};
  subjects.forEach(s => {
    const mInfo = map3DModelInfo(s.cls, s.type, s.subtype);
    s.model3d = mInfo.model3d;
    counts3d[mInfo.base3d] = (counts3d[mInfo.base3d] || 0) + 1;
    s.name3d = `${mInfo.base3d} ${counts3d[mInfo.base3d]}`;
  });
  const personHeights = subjects.filter(s => s.type === 'person').map(s => s.box?.h || .6);
  const maxPersonBoxH = personHeights.length ? Math.max(...personHeights, .35) : .65;
  const chairSubs = subjects.filter(s => s.model3d === 'chair');
  subjects.forEach(s => {
    const b = s.box || {x:.35, y:.15, w:.3, h:.7};
    const cx = b.x + b.w / 2, bottomY = b.y + b.h;
    const x3d = subjects.length === 1 && Math.abs(cx - .5) < .14 ? 0 : Math.round(((cx - .5) * 3.0) * 100) / 100;
    const z3d = subjects.length === 1 ? 0 : Math.round(((.84 - bottomY) * 2.0) * 100) / 100;
    s.pos3d = {x:x3d, y:0, z:z3d};
    if (s.type === 'person') {
      const relH = clamp(b.h / Math.max(.25, maxPersonBoxH), .68, 1.14);
      const hM = Math.round(clamp(1.75 * relH, 1.25, 1.96) * 100) / 100;
      s.cm = Math.round(hM * 100);
      s.scale3d = hM;
      const nearChair = chairSubs.find(ch => {
        const cb = ch.box;
        const horizDist = Math.abs((cb.x + cb.w / 2) - cx);
        return iou(b, cb) > .08 || containment(b, cb) > .22 || (horizDist < Math.max(b.w, cb.w) * .85 && Math.abs((cb.y + cb.h) - bottomY) < .22);
      });
      const ar = b.h / Math.max(.05, b.w);
      const isSeatedRatio = b.h > .38 && ar <= 1.72;
      if (nearChair || isSeatedRatio) {
        s.pose3d = 'sitting_chair';
        s.seatedOnChair = true;
        if (nearChair) {
          const chX = Math.round((((nearChair.box.x + nearChair.box.w / 2) - .5) * 3.0) * 100) / 100;
          const chZ = Math.round(((.84 - (nearChair.box.y + nearChair.box.h)) * 2.0) * 100) / 100;
          s.pos3d = {x:chX, y:0, z:chZ};
          nearChair.pos3d = {x:chX, y:0, z:Math.round((chZ - .06) * 100) / 100};
        }
      } else {
        s.pose3d = 'standing';
        s.seatedOnChair = false;
      }
    } else if (s.model3d === 'cat') {
      const ar = b.w / Math.max(.05, b.h);
      s.pose3d = ar > 1.35 ? 'walking_still' : ar < .88 ? 'sitting' : 'standing';
      s.scale3d = .38;
    } else if (s.model3d === 'chair') {
      s.scale3d = .86;
    } else if (s.model3d === 'table') {
      s.scale3d = .78;
    } else if (s.model3d === 'tree') {
      const hM = Math.round(clamp(b.h * 2.8, 1.2, 2.8) * 100) / 100;
      s.scale3d = hM;
    } else if (s.model3d === 'car') {
      s.scale3d = 1.48;
    } else if (s.model3d === 'phone') {
      s.scale3d = .16;
    } else {
      const hM = Math.round(clamp((s.cm || 60) / 100, .2, 2.2) * 100) / 100;
      s.scale3d = hM;
    }
  });
}

/* ---------- rich subject description (Part 2 + Part 7) ---------- */
function refineSubtypeName(o) {
  const rawCls = (o.cls && o.cls !== 'subject' && o.cls !== 'product') ? o.cls : '';
  const mn = (o._mnTags && o._mnTags[0]) ? o._mnTags[0] : '';
  if (o.type === 'car') {
    if (mn && /sports car|convertible|cabriolet|sedan|coupe|limousine|beach wagon|jeep|minivan|pickup|racer/i.test(mn)) return mn;
    return 'modern car';
  }
  if (o.type === 'phone') return 'smartphone';
  if (o.type === 'person') return 'person';
  if (rawCls && rawCls !== 'object') {
    if (mn && mn.length > 2 && !/web site|envelope|binder|screen|monitor|television/i.test(mn) && rawCls === 'product') return mn;
    return rawCls;
  }
  if (mn && !/web site|envelope|binder|screen|monitor/i.test(mn)) return mn;
  return NOUN[o.type] || 'object';
}

function describe(o, px, faces, idx, counts) {
  const b = o.box, t = o.type || 'auto';
  counts[t] = (counts[t] || 0) + 1;
  const label = `${TYPE_LABEL[t] || 'Object'} ${counts[t]}`;
  const category = categoryOf(t);
  const uiColor = SUBJ_PALETTE[idx % SUBJ_PALETTE.length];
  const pos = spatialPosition(b);
  const subtype = refineSubtypeName(o);
  const s = {
    type: t,
    category,
    cls: o.cls,
    subtype,
    label,
    uiColor,
    score: o.score,
    box: b,
    boxes: [b],
    cm: DEF_CM[t] || 100,
    position: pos.summary,
    horiz: pos.horiz,
    vert: pos.vert,
    depth: pos.depth
  };

  if (t === 'person') {
    const face = o._face || faces.find(f => inside({x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2}, b));
    s.face = face ? {box:face.box, pts:face.pts} : null;
    if (face) s.boxes = [b, face.box];
    const top = face ? (face.box.y + face.box.h * 1.22 - b.y) / b.h : .2;
    const R = {
      shirt: sub(b, .26, clamp(top, .12, .42), .48, .30),
      pants: sub(b, .28, .58, .44, .28),
      shoes: sub(b, .2, .91, .6, .09),
      hair:  face ? {x:clamp(face.box.x, 0, .95), y:clamp(face.box.y - face.box.h * .45, 0, .95), w:face.box.w, h:face.box.h * .42} : sub(b, .32, .02, .36, .10)
    };
    const parts = {};
    Object.entries(R).forEach(([k, r]) => { const c = dominant(px, r, {satWeight: k === 'hair' ? 1.0 : 2.2}); if (c) parts[k] = c; });
    if (face) {
      const c = dominant(px, sub(face.box, .28, .38, .44, .36), {skipBorder:false, satWeight:.4, centerWeight:true});
      if (c) parts.skin = c;
    }
    s.parts = Object.fromEntries(Object.entries(parts).map(([k, c]) => [k, c.hex]));
    s.partNames = Object.fromEntries(Object.entries(parts).map(([k, c]) => [k, c.name]));
    const mainCol = parts.shirt || dominant(px, sub(b, .22, .18, .56, .62));
    s.color = mainCol?.hex || '#e85d2b';
    s.colorName = mainCol?.name || 'neutral';
    const pa = personPoseAndAngle(b, face, px);
    s.angle = pa.facing;
    s.pose = pa.framing;
    s.viewCode = pa.viewCode;
    const wear = [
      parts.shirt && `a ${parts.shirt.name} upper garment/shirt with natural fabric folds and weave texture`,
      parts.pants && (b.h > .52 ? `${parts.pants.name} trousers/bottoms` : null),
      parts.shoes && (b.h > .74 ? `${parts.shoes.name} footwear` : null)
    ].filter(Boolean);
    const hairNote = parts.hair ? ` with ${parts.hair.name} hair` : '';
    const skinNote = parts.skin ? `, natural ${parts.skin.name} skin tone` : '';
    s.desc = `${pa.framing} of a person${hairNote}${skinNote} ${pos.horiz} (${pos.depth}), ${pa.facing}${wear.length ? ', wearing ' + joinList(wear) : ''}`;
    s.detail = `A person in a ${s.desc}. Dominant outfit color: ${s.colorName}.`;
    s.richSentence = `A person captured in a ${pa.framing}${hairNote}${skinNote}, positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]}, ${pa.facing}${wear.length ? ', dressed in ' + joinList(wear) : ''} with lifelike skin pores, hair strands, and crisp garment textures`;
  } else if (t === 'animal') {
    const inner = sub(b, .14, .16, .72, .68);
    const c = dominant(px, inner, {satWeight:2.0, centerWeight:true});
    const sec = dominant(px, sub(b, .24, .48, .52, .42), {satWeight:1.4, centerWeight:false});
    s.color = c?.hex || '#e85d2b';
    s.colorName = c?.name || 'warm brown';
    s.secColorName = (sec && sec.name !== s.colorName) ? sec.name : null;
    const oa = objectAngleAndSurface(b, t, px);
    s.angle = oa.angleText;
    s.finish = 'soft natural fur coat';
    s.condition = 'clear whisker, ear, and eye detail';
    s.viewCode = oa.viewCode;
    const animalName = (o.cls && /cat|dog|bird|horse|sheep|cow/i.test(o.cls)) ? o.cls.toLowerCase() : (subtype || 'animal');
    const secNote = s.secColorName ? ` with ${s.secColorName} chest and paw markings` : '';
    const ar = b.w / Math.max(.05, b.h);
    const posture = ar > 1.32 ? 'walking or outstretched posture' : ar < .88 ? 'attentive seated posture' : 'alert standing posture';
    s.pose = posture;
    s.desc = `${s.colorName} ${animalName}${secNote} in an ${posture} ${pos.horiz} (${pos.depth}), ${oa.angleText}`;
    s.detail = `A ${s.desc}. Primary coat color: ${s.colorName}, ${s.condition}.`;
    s.richSentence = `A ${s.colorName} ${animalName}${secNote} in an ${posture}, positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]} (${oa.angleText}) with finely resolved fur strands, expressive eyes, alert ears, and natural whiskers`;
  } else {
    const inner = (t === 'car' || t === 'vehicle') ? sub(b, .12, .18, .76, .54) : sub(b, .12, .12, .76, .76);
    const c = dominant(px, inner, {satWeight:2.8, centerWeight:true});
    const sec = dominant(px, sub(b, .22, .55, .56, .35), {satWeight:1.5, centerWeight:false});
    const trimCol = dominant(px, sub(b, .08, .08, .84, .24), {satWeight:1.2, centerWeight:false});
    s.color = c?.hex || '#e85d2b';
    s.colorName = c?.name || 'neutral';
    s.secColorName = (sec && sec.name !== s.colorName) ? sec.name : (trimCol && trimCol.name !== s.colorName ? trimCol.name : null);
    const oa = objectAngleAndSurface(b, t, px);
    s.angle = oa.angleText;
    s.finish = oa.finish;
    s.condition = oa.condition;
    s.viewCode = oa.viewCode;
    const itemName = subtype || NOUN[t] || 'object';
    const secNote = s.secColorName ? ` with ${s.secColorName} trim and accents` : '';
    s.desc = `${s.colorName} ${itemName}${secNote} ${pos.horiz} (${pos.depth}), ${oa.angleText}, ${oa.finish}`;
    s.detail = `A ${s.desc}. Primary color: ${s.colorName}, ${oa.condition}.`;
    if (t === 'car' || t === 'vehicle') {
      s.richSentence = `A ${s.colorName} ${itemName}${secNote} featuring a ${oa.finish} and ${oa.condition}, positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]} in a ${oa.angleText} with clearly defined bodywork, wheels, glass cabin, and trim details`;
    } else if (t === 'phone') {
      s.richSentence = `A sleek ${s.colorName} ${itemName}${secNote} with a ${oa.finish} and precision-machined edges, placed ${pos.horiz} in the ${pos.depth.split(' (')[0]} in an ${oa.angleText}`;
    } else {
      s.richSentence = `A ${s.colorName} ${itemName}${secNote} with a ${oa.finish} (${oa.condition}), positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]} and seen from a ${oa.angleText}`;
    }
  }
  return s;
}

/* ---------- Scene, Environment, Lighting & Depth-of-Field Analyzer (Part 7) ---------- */
function analyzeSceneContext(px, subjects, mnScene) {
  const {w, h, data} = px;
  const mainBoxes = subjects.map(s => s.box);
  const inAnySubj = (nx, ny) => mainBoxes.some(b => nx >= b.x && nx <= b.x + b.w && ny >= b.y && ny <= b.y + b.h);

  let bgCount = 0, bgLumSum = 0, bgLumSq = 0, bgSatSum = 0, bgWarmSum = 0, bgEdgeSum = 0;
  let fgCount = 0, fgLumSum = 0, fgLumSq = 0, fgEdgeSum = 0;
  let leftLum = 0, leftN = 0, rightLum = 0, rightN = 0, topLum = 0, topN = 0, botLum = 0, botN = 0;
  let hiGlints = 0, deepShadows = 0;

  for (let y = 1; y < h - 1; y++) {
    const ny = y / h;
    for (let x = 1; x < w - 1; x++) {
      const nx = x / w;
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const [hue, sat, lum] = rgbToHsl(r, g, b);
      // Simple Sobel-like gradient magnitude for texture/sharpness estimation
      const iR = i + 4, iD = i + w * 4;
      const gx = Math.abs(r - data[iR]) + Math.abs(g - data[iR + 1]) + Math.abs(b - data[iR + 2]);
      const gy = Math.abs(r - data[iD]) + Math.abs(g - data[iD + 1]) + Math.abs(b - data[iD + 2]);
      const edge = (gx + gy) / 6;

      if (nx < .5) { leftLum += lum; leftN++; } else { rightLum += lum; rightN++; }
      if (ny < .5) { topLum += lum; topN++; } else { botLum += lum; botN++; }
      if (lum > .88) hiGlints++;
      if (lum < .12) deepShadows++;

      if (inAnySubj(nx, ny)) {
        fgCount++; fgLumSum += lum; fgLumSq += lum * lum; fgEdgeSum += edge;
      } else {
        bgCount++; bgLumSum += lum; bgLumSq += lum * lum; bgSatSum += sat;
        bgWarmSum += (r - b) / 255;
        bgEdgeSum += edge;
      }
    }
  }

  const topBgCol = dominant(px, {x:.04, y:.02, w:.92, h:.24}, {skipBorder:false, satWeight:1.2, centerWeight:false});
  const floorCol = dominant(px, {x:.08, y:.78, w:.84, h:.20}, {skipBorder:false, satWeight:1.1, centerWeight:false});
  const totalPx = Math.max(1, (w - 2) * (h - 2));

  const bgLum = bgCount > 0 ? bgLumSum / bgCount : .65;
  const bgStd = bgCount > 0 ? Math.sqrt(Math.max(0, bgLumSq / bgCount - bgLum * bgLum)) : .1;
  const bgSat = bgCount > 0 ? bgSatSum / bgCount : .1;
  const bgEdge = bgCount > 0 ? bgEdgeSum / bgCount : 4;
  const fgEdge = fgCount > 0 ? fgEdgeSum / fgCount : 12;
  const warmAvg = bgCount > 0 ? bgWarmSum / bgCount : 0;

  // Environment & background characterization
  const topName = topBgCol?.name || 'neutral gray';
  const floorName = floorCol?.name || topName;
  const isStudioUniform = bgStd < .11 && bgEdge < 6.5;
  const isHighKey = bgLum > .82 && bgStd < .14;
  const isDarkLowKey = bgLum < .24;

  // Check if MobileNet scene predictions hint at an environment setting
  const envHint = (mnScene || [])
    .filter(p => p.probability >= .10)
    .map(p => p.className.split(',')[0].trim().toLowerCase())
    .find(n => /seashore|lakeside|alp|valley|cliff|park|street|palace|library|restaurant|shop|stage|patio|greenhouse|mosque|church|monastery|boathouse|pier|promenade|sandbar|forest|meadow/i.test(n));

  let bgSentence;
  if (isHighKey) {
    bgSentence = `The background is a clean, bright high-key ${topName} studio cyclorama with a smooth ${floorName} floor surface and subtle, natural contact grounding beneath ${subjects.length > 1 ? 'the subjects' : 'the subject'}.`;
  } else if (isStudioUniform) {
    bgSentence = `Behind ${subjects.length > 1 ? 'the subjects' : 'the subject'} is a controlled, seamless ${topName} studio backdrop transitioning smoothly into a ${floorName} floor plane with soft contact shadows and zero distracting clutter.`;
  } else if (isDarkLowKey) {
    bgSentence = `The surrounding environment features a moody, low-key ${topName} backdrop with deep atmospheric falloff and a dark ${floorName} ground plane that isolates ${subjects.length > 1 ? 'the subjects' : 'the subject'} dramatically.`;
  } else if (envHint) {
    bgSentence = `The background reveals a detailed ${envHint}-style environment with ${topName} upper tones and a ${floorName} lower surface, adding authentic spatial depth and environmental context behind ${subjects.length > 1 ? 'the subjects' : 'the subject'}.`;
  } else if (bgSat > .28) {
    bgSentence = `The background environment features rich, colorful ${topName} upper surroundings and a ${floorName} ground plane with natural environmental textures and spatial depth.`;
  } else {
    bgSentence = `The background consists of a softly detailed ${topName} setting transitioning to a ${floorName} lower plane, providing clean visual separation and natural spatial perspective.`;
  }

  // Lighting direction, quality, color temperature & reflections
  const lDiff = (leftN && rightN) ? (leftLum / leftN) - (rightLum / rightN) : 0;
  const vDiff = (topN && botN) ? (topLum / topN) - (botLum / botN) : 0;
  const lightDir = Math.abs(lDiff) > .055
    ? (lDiff > 0 ? 'angled from camera-left' : 'angled from camera-right')
    : 'balanced frontal and overhead placement';
  const lightElev = vDiff > .05 ? 'elevated key light' : vDiff < -.05 ? 'low-angle upward fill' : 'eye-level studio key light';
  const glintPct = hiGlints / totalPx, shadowPct = deepShadows / totalPx;
  const lightQuality = (glintPct > .04 && shadowPct > .06)
    ? 'crisp, high-contrast directional illumination with pronounced specular highlights and defined shadow falloff'
    : bgStd < .12
    ? 'soft, diffused wrap-around studio illumination with smooth tonal gradations and gentle shadow edges'
    : 'natural, well-balanced lighting with clean highlights and realistic shadow depth';
  const colorTemp = warmAvg > .06
    ? 'warm golden-neutral color temperature (~4600K)'
    : warmAvg < -.06
    ? 'cool crisp daylight-blue color balance (~6200K)'
    : 'neutral true-to-life daylight color balance (~5600K)';
  const lightSentence = `Lighting is driven by an ${lightElev} ${lightDir}, delivering ${lightQuality} and a ${colorTemp} with realistic surface reflections.`;

  // Depth of field, camera angle & overall style
  const dofRatio = bgEdge / Math.max(1, fgEdge);
  const dofDesc = dofRatio < .45
    ? 'a shallow depth of field that keeps the foreground tack-sharp while softly blurring the background into smooth bokeh'
    : dofRatio < .78
    ? 'a balanced medium depth of field with crisp subject focus and gentle background softening'
    : 'a deep, commercial depth of field keeping both the subject contours and surrounding environment clearly readable';

  const mainSub = subjects[0];
  const mainArea = mainSub ? mainSub.box.w * mainSub.box.h : .35;
  const shotScale = mainArea > .46 ? 'tight close-up / medium-close framing'
    : mainArea > .20 ? 'balanced medium-full commercial framing'
    : 'wide environmental framing';
  const camAngle = mainSub?.angle || 'eye-level front perspective';
  const styleGenre = mainSub?.type === 'person' ? 'editorial portrait photography'
    : (mainSub?.type === 'car' || mainSub?.type === 'vehicle') ? 'commercial automotive photography'
    : 'high-end commercial product and studio photography';
  const camSentence = `Captured in ${shotScale} from a ${camAngle} with ${dofDesc}, the overall composition conveys a clean, photorealistic ${styleGenre} aesthetic with sharp micro-textures.`;

  return {bgSentence, lightSentence, camSentence, shotScale, dofDesc, styleGenre, topName, floorName};
}

// Builds a natural whole-image scene paragraph for #subjDesc without numbered subject labels (never mentions Person 1, Product 1, Object 1, etc.)
function buildSceneParagraph(det, opts = {}) {
  if (!det || !Array.isArray(det.subjects) || !det.subjects.length) return '';
  const subs = opts.customSubjects || det.subjects;
  const meta = det.sceneMeta || analyzeSceneContext(det._px || {w:16, h:16, data:new Uint8ClampedArray(1024)}, subs, []);

  const cleanSubjPhrase = (s) => {
    const noun = (s.subtype || s.cls || (s.type === 'person' ? 'person' : s.type === 'phone' ? 'smartphone' : s.type === 'car' ? 'car' : s.type === 'animal' ? 'animal' : 'item')).toLowerCase();
    const col = s.colorName ? `${s.colorName} ` : '';
    const pos = s.horiz || s.position || 'in the frame';
    const act = s.pose ? ` ${s.pose}` : (s.finish ? ` with a ${s.finish}` : '');
    return `a ${col}${noun}${act} ${pos}`.replace(/\s+/g, ' ').trim();
  };

  const people = subs.filter(s => s.type === 'person');
  const items = subs.filter(s => s.type !== 'person');

  let mainSentence = '';
  if (people.length && items.length) {
    const pDesc = people.slice(0, 3).map(cleanSubjPhrase).join(', ');
    const iDesc = items.slice(0, 3).map(cleanSubjPhrase).join(' and ');
    mainSentence = `The scene shows ${pDesc}, accompanied by ${iDesc} arranged in the foreground.`;
  } else if (people.length > 1) {
    mainSentence = `The scene shows ${people.slice(0, 3).map(cleanSubjPhrase).join(' alongside ')} captured together in a natural setting.`;
  } else if (subs.length === 1) {
    mainSentence = `The image features ${cleanSubjPhrase(subs[0])} captured in ${meta.shotScale}.`;
  } else {
    mainSentence = `The composition features ${subs.slice(0, 3).map(cleanSubjPhrase).join(', ')} arranged across the frame.`;
  }

  const raw = `${mainSentence} ${meta.bgSentence || ''}`.replace(/\s+/g, ' ').trim();
  return raw
    .replace(/\b(Person|Product|Object|Subject|Vehicle|Animal)\s*\d+\b/gi, '$1')
    .replace(/\s*\[(Human|Product\/Object|Animal|Vehicle)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Re-evaluate a detection result when the user manually changes #subjType so Focus Mode & descriptions reload immediately
function retype(det, newType) {
  if (!det || !det._px || !Array.isArray(det.subjects)) return det;
  const counts = {};
  det.subjects = det.subjects.map((old, idx) => {
    const o = {cls:newType === 'auto' ? 'object' : newType, type:newType, score:old.score || .8, box:old.box, _face:old.face ? {box:old.face.box, pts:old.face.pts} : null};
    return describe(o, det._px, det.faces || [], idx, counts);
  });
  assign3DSceneInfo(det.subjects);
  det.view = det.subjects[0]?.viewCode || 'front';
  det.sceneMeta = analyzeSceneContext(det._px, det.subjects, []);
  det.fullSceneDesc = buildSceneParagraph(det, {isMulti:false, selectedKey:''});
  return det;
}

const joinList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ---------- what is at a pointed spot (focus point detail - Part 5d & 6) ---------- */
const LM = [['right eye', 36, 41], ['left eye', 42, 47], ['right eyebrow', 17, 21], ['left eyebrow', 22, 26], ['nose', 27, 35], ['mouth and lips', 48, 67], ['chin', 6, 10]];

function isNearBox(p, b, pad = .05) {
  return p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;
}

function pointInfo(det, x, y, preferredSubj = null) {
  if (!det || !Array.isArray(det.subjects)) return null;
  const p = {x, y};
  let h = null;

  // If a preferred subject (from Multiple Mode selection or explicit index/key/label) is provided, check if point is inside or near it first
  if (preferredSubj !== null && preferredSubj !== undefined && preferredSubj !== '') {
    const prefIdx = typeof preferredSubj === 'number'
      ? preferredSubj
      : det.subjects.findIndex((s, i) => `img0_s${i}` === preferredSubj || s.key === preferredSubj || s.label === preferredSubj || String(preferredSubj).endsWith(`_s${i}`));
    if (prefIdx >= 0 && det.subjects[prefIdx]) {
      const ps = det.subjects[prefIdx];
      if (isNearBox(p, ps.box, .06)) {
        h = {s: ps, i: prefIdx};
      }
    }
  }

  if (!h) {
    const hits = det.subjects
      .map((s, i) => ({s, i}))
      .filter(item => inside(p, item.s.box))
      .sort((a, b) => a.s.box.w * a.s.box.h - b.s.box.w * b.s.box.h);
    h = hits[0] || null;
  }

  if (!h) {
    const nearHits = det.subjects
      .map((s, i) => ({s, i}))
      .filter(item => isNearBox(p, item.s.box, .045))
      .sort((a, b) => a.s.box.w * a.s.box.h - b.s.box.w * b.s.box.h);
    h = nearHits[0] || null;
  }

  const spotCol = det._px ? dominant(det._px, {x:clamp(x - .025, 0, .95), y:clamp(y - .025, 0, .95), w:.05, h:.05}, {skipBorder:false, satWeight:1.8}) : null;
  const tightCol = det._px ? dominant(det._px, {x:clamp(x - .012, 0, .97), y:clamp(y - .012, 0, .97), w:.024, h:.024}, {skipBorder:false, satWeight:2.2}) : spotCol;

  if (!h) {
    return {
      index:-1, part:'background area',
      colorName:spotCol?.name || null, color:spotCol?.hex || null,
      where:`background at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`,
      whereOnSubject:`background (${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top)`,
      fullDetail:`Background area (${spotCol ? spotCol.name + ', ' : ''}${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top)`
    };
  }

  const s = h.s, b = s.box;
  const rx = clamp((x - b.x) / Math.max(.02, b.w), 0, 1);
  const ry = clamp((y - b.y) / Math.max(.02, b.h), 0, 1);
  const f = s.face;
  const midlineX = (s.type === 'person' && f && f.box) ? (f.box.x + f.box.w * .5) : (b.x + b.w * .5);
  const side = (s.type === 'person' ? (x < midlineX) : (rx < .5)) ? 'right' : 'left';
  const iside = rx < .5 ? 'left' : 'right';
  const vert = ry < .28 ? 'upper' : ry > .68 ? 'lower' : 'middle';
  const horiz = rx < .34 ? 'left' : rx > .66 ? 'right' : 'center';
  let part = null;

  if (s.type === 'person') {
    if (f) {
      const fb = f.box, fs = Math.max(fb.w, fb.h);
      let best = null, bd = 1e9;
      if (Array.isArray(f.pts) && f.pts.length >= 68) {
        LM.forEach(([n, a, z]) => {
          for (let k = a; k <= z; k++) {
            const d = Math.hypot(f.pts[k][0] - x, (f.pts[k][1] - y) * det.h / det.w);
            if (d < bd) { bd = d; best = n; }
          }
        });
      }
      const browY = (Array.isArray(f.pts) && f.pts.length >= 25) ? Math.min(f.pts[19][1], f.pts[24][1]) : (fb.y + fb.h * .28);
      if (y < fb.y + fb.h * .12 && y >= b.y - fb.h * .6 && x >= fb.x - fb.w * .35 && x <= fb.x + fb.w * 1.35) {
        part = `the person's head and hair`;
      } else if (best && bd < fs * .16) {
        part = best === 'mouth and lips' ? `the person's mouth` : best === 'nose' ? `the person's nose` : `the person's ${best}`;
      } else if (inside(p, fb)) {
        part = y < browY ? `the person's forehead and head` : `the person's ${x < fb.x + fb.w / 2 ? 'right' : 'left'} eye`;
      } else if (y < fb.y && y > fb.y - fb.h * .85 && x > fb.x - fb.w * .35 && x < fb.x + fb.w * 1.35) {
        part = `the person's head and hair`;
      } else if (Math.abs(y - (fb.y + fb.h * .5)) < fb.h * .42 && (x < fb.x || x > fb.x + fb.w) && Math.abs(x - (fb.x + fb.w / 2)) < fb.w * .88) {
        part = `the person's ${x < fb.x ? 'right' : 'left'} ear`;
      }
    }
    if (!part) {
      const faceTop = f ? clamp((f.box.y - b.y) / b.h, 0, .25) : .04;
      const faceBottom = f ? clamp((f.box.y + f.box.h - b.y) / b.h, .10, .38) : .18;
      const skinHex = s.parts?.skin || null;
      const shirtName = s.partNames?.shirt || '';
      const tightName = tightCol?.name || '';
      const isOuterArmZone = rx < .34 || rx > .66;
      const isHalfBodyOrSeated = Boolean(s.seatedOnChair || /seated|serving/i.test(s.pose || '') || (b.h < .58 && (b.y + b.h) < .84));
      const isWristBandHeight = ry >= Math.max(faceBottom + .16, .39) && ry <= .49;
      const isHandHeight = ry > .49 && ry <= (isHalfBodyOrSeated ? .96 : .65);
      const isDistinctFromShirt = tightName && shirtName && tightName !== shirtName;

      if (ry < Math.max(.09, faceTop + .05)) {
        part = `the person's head and hair`;
      } else if (ry < faceBottom) {
        if (rx < .26 || rx > .74) part = `the person's ${side} ear`;
        else if (ry > (faceTop + faceBottom) * 0.62) part = rx > .42 && rx < .58 ? `the person's mouth` : `the person's nose`;
        else part = `the person's ${side} eye`;
      } else if (ry < faceBottom + .06) {
        part = `the person's ${side} side of neck and collar`;
      } else if (isWristBandHeight && isOuterArmZone) {
        part = `the person's ${side} hand`;
      } else if (isHandHeight && (isOuterArmZone || (skinHex && tightName === s.partNames?.skin && isDistinctFromShirt))) {
        part = `the person's ${side} hand`;
      } else if (ry < .54) {
        if (rx < .28 || rx > .72) {
          part = ry > .39 ? `the person's ${side} hand` : `the person's ${side} arm and sleeve`;
        } else if (ry < faceBottom + .14) {
          part = `the person's ${side} shoulder`;
        } else {
          part = `the person's ${side} upper chest`;
        }
      } else if (ry < .63 || isHalfBodyOrSeated) {
        part = (rx < .36 || rx > .64 || isHalfBodyOrSeated) ? `the person's ${side} hand` : `the person's ${side} waist`;
      } else if (ry < .88) {
        part = `the person's ${side} leg`;
      } else {
        part = `the person's ${side} foot`;
      }
    }
  } else if (s.type === 'car' || s.type === 'vehicle') {
    const viewCode = s.viewCode || 'front';
    const isRearView = viewCode === 'back';
    const isRightSide = viewCode === 'right';
    const isLeftSide = viewCode === 'left' || viewCode === 'three-quarter';
    if (ry >= .48 && (rx < .44 || rx > .56)) {
      if (isRearView) {
        part = rx < .5 ? `the car's rear left wheel` : `the car's rear right wheel`;
      } else if (isRightSide) {
        part = rx < .46 ? `the car's rear right wheel` : `the car's front right wheel`;
      } else if (isLeftSide) {
        part = rx < .54 ? `the car's front left wheel` : `the car's rear left wheel`;
      } else {
        part = rx < .5 ? `the car's front left wheel` : `the car's front right wheel`;
      }
    } else if (ry < .42) {
      if (isRearView) {
        part = `the car's rear window`;
      } else if (rx > .24 && rx < .76 && !isLeftSide && !isRightSide) {
        part = `the car's front windshield`;
      } else if (isLeftSide && rx < .36) {
        part = `the car's front windshield`;
      } else if (isRightSide && rx > .64) {
        part = `the car's front windshield`;
      } else {
        part = `the car's ${isRightSide ? 'right' : 'left'} side window`;
      }
    } else if (isRearView || (isLeftSide && rx > .74) || (isRightSide && rx < .26)) {
      part = `the car's rear section and taillight`;
    } else if (ry < .64 && ((rx < .30 || rx > .70) || (isLeftSide && rx < .32) || (isRightSide && rx > .68))) {
      part = `the car's front ${rx < .5 ? 'left' : 'right'} headlight`;
    } else {
      part = `the car's front hood and grille`;
    }
  } else if (s.type === 'phone') {
    if (rx < .52 && ry < .36) { part = `the phone's ${side} camera lens module`; }
    else if (rx < .1 || rx > .9) { part = `the phone's ${side} frame and buttons`; }
    else if (ry > .88) { part = `the phone's bottom ${side} edge`; }
    else { part = `the phone's ${side} body panel`; }
  } else if (s.type === 'animal') {
    if (ry < .22) { part = `the animal's ${side} ear`; }
    else if (ry < .34 && rx > .22 && rx < .78) { part = `the animal's ${side} eye (eyes)`; }
    else if (ry < .42 && rx > .25 && rx < .75) { part = `the animal's nose`; }
    else if (ry < .50 && rx > .25 && rx < .75) { part = `the animal's mouth`; }
    else if (ry > .65) { part = (rx < .38 || rx > .62) ? `the animal's rear ${side} leg` : `the animal's front ${side} leg`; }
    else if (rx < .20 || rx > .80) { part = `the animal's rear ${side} leg`; }
    else { part = `the animal's front ${side} leg`; }
  } else if (s.type === 'product' || s.type === 'object') {
    const prodCol = tightCol?.name || spotCol?.name || s.colorName || 'colored';
    const prodName = s.subtype || s.cls || 'product';
    if (ry < .24) { part = `the ${prodCol} ${prodName} (${side} top cap; brand is not visible)`; }
    else if (ry > .80) { part = `the ${prodCol} ${prodName} (${side} base edge; brand is not visible)`; }
    else { part = `the ${prodCol} ${prodName} (${side} side; brand is not visible)`; }
  }

  if (!part) part = `${vert === 'middle' && horiz === 'center' ? 'center' : (vert === 'middle' ? '' : vert + '-') + (horiz === 'center' ? 'middle' : horiz)} surface detail`.replace(/^-/, '');
  const cName = tightCol?.name || spotCol?.name || s.colorName || null;
  const cHex = tightCol?.hex || spotCol?.hex || s.color || null;
  const regionStr = `${vert}-${horiz}`.replace('middle-center', 'center').replace('middle-', '');
  const whereStr = `${regionStr} region of ${s.label}`;
  const whereOnSubject = `on the ${regionStr} area of ${s.label} (${Math.round(rx * 100)}% across, ${Math.round(ry * 100)}% down the subject)`;
  const fullDetail = `${s.label} — Focus cursor pointing at ${part}${cName ? ` (${cName})` : ''}, located ${whereOnSubject}: ${s.angle || 'front view'}, positioned ${s.position || 'in frame'}${s.pose ? `, ${s.pose}` : ''}.`;
  return {index:h.i, subject:s, part, colorName:cName, color:cHex, where:whereStr, whereOnSubject, fullDetail};
}

async function analyzeKeep(img) {
  const det = await analyze(img);
  Object.defineProperty(det, '_px', {value:pixelGrid(img), enumerable:false, configurable:true});
  return det;
}

window.VPDetect = {
  init, analyze:analyzeKeep, retype, pointInfo, buildSceneParagraph, categoryOf, colorName, SUBJ_PALETTE,
  dominantOf:(img, box) => dominant(pixelGrid(img), box || {x:0, y:0, w:1, h:1})
};
})();
