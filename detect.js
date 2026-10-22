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
  return ready || (ready = (async () => {
    if (!window.faceapi) await loadScript(FACE_URL);
    if (!window.tf && window.faceapi?.tf) window.tf = window.faceapi.tf;
    if (!window.cocoSsd) await loadScript(COCO_URL);
    await window.tf.ready?.();
    const faces = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS),
      faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS)
    ]).then(() => { faceOK = true; }).catch(e => console.warn('face-api models did not load', e));

    let gm = await window.tf.loadGraphModel(COCO_IDB).catch(() => null);
    if (!gm) {
      gm = await window.tf.loadGraphModel(COCO_MODEL);
      gm.save(COCO_IDB).catch(() => {});
    }
    const origLoad = window.tf.loadGraphModel;
    window.tf.loadGraphModel = url => url === COCO_MODEL ? Promise.resolve(gm) : origLoad.call(window.tf, url);
    try { coco = await window.cocoSsd.load({base:'lite_mobilenet_v2'}); }
    finally { window.tf.loadGraphModel = origLoad; }

    await Promise.race([faces, new Promise(r => setTimeout(r, 6000))]);
  })().catch(e => { ready = null; throw e; }));
}

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
const HANDHELD_CLASSES = new Set(['cell phone','bottle','wine glass','cup','book','handbag','backpack','umbrella','laptop','sports ball','remote']);
function dedupeCandidates(candidates) {
  // Filter invalid or microscopic noise boxes
  const valid = candidates.filter(c => {
    const b = c.box;
    if (!b || b.w < .035 || b.h < .04 || b.w * b.h < .005) return false;
    if (b.w > .98 && b.h > .98 && (c.score || 0) < .52) return false;
    return true;
  });
  // Sort by confidence weighted slightly by box area
  valid.sort((a, b) => {
    const sa = (a.score || .5) * (1 + .2 * Math.sqrt(a.box.w * a.box.h));
    const sb = (b.score || .5) * (1 + .2 * Math.sqrt(b.box.w * b.box.h));
    return sb - sa;
  });
  const kept = [];
  for (const cand of valid) {
    let dup = false;
    for (const k of kept) {
      const ov = iou(k.box, cand.box);
      const cont = containment(k.box, cand.box);
      const sameType = k.type === cand.type
        || (['car', 'vehicle'].includes(k.type) && ['car', 'vehicle'].includes(cand.type))
        || (['product', 'object', 'auto'].includes(k.type) && ['product', 'object', 'auto'].includes(cand.type));

      if (sameType) {
        // For people, if both have distinct non-overlapping faces, keep both people!
        const twoDistinctFaces = k.type === 'person' && k._face && cand._face && iou(k._face.box, cand._face.box) < .15;
        if (!twoDistinctFaces && (ov > .40 || cont > .78)) {
          // Expand box slightly if high overlap to capture full extent
          if (ov > .55 && cand.score > k.score * .75) {
            const x0 = Math.min(k.box.x, cand.box.x), y0 = Math.min(k.box.y, cand.box.y);
            const x1 = Math.max(k.box.x + k.box.w, cand.box.x + cand.box.w), y1 = Math.max(k.box.y + k.box.h, cand.box.h + cand.box.y);
            k.box = {x:x0, y:y0, w:x1 - x0, h:y1 - y0};
          }
          dup = true; break;
        }
      } else {
        // Cross-class duplicate check:
        // Suppress generic island/object if it is mostly inside an already-detected specific object
        const candIsGeneric = ['object', 'auto'].includes(cand.type) || cand.cls === 'subject';
        const kIsGeneric = ['object', 'auto'].includes(k.type) || k.cls === 'subject';
        if (candIsGeneric && (cont > .70 || ov > .48)) { dup = true; break; }
        if (kIsGeneric && !candIsGeneric && (cont > .70 || ov > .48)) {
          // Upgrade the kept generic box to the specific class
          Object.assign(k, cand);
          dup = true; break;
        }
        // If two non-person detections overlap heavily (e.g. phone & remote on the same object), keep higher score
        if (k.type !== 'person' && cand.type !== 'person' && (ov > .62 || cont > .85)) {
          dup = true; break;
        }
        // If cand is inside a person box, keep it ONLY if it is a distinct handheld/accessory item or smaller than 55% of person
        if (k.type === 'person' && cont > .82 && !HANDHELD_CLASSES.has(cand.cls) && (cand.box.w * cand.box.h) > (k.box.w * k.box.h) * .55) {
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
  const s = Math.min(1, 512 / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  // 1) Full-image COCO-SSD pass with lowered threshold (0.16) so secondary/smaller objects aren't missed
  const rawFull = await coco.detect(c, 35, .16).catch(() => []);

  // 2) Overlapping sub-crop passes to reliably detect multiple objects or smaller items in the same image
  const crops = [
    {rx:0,    ry:0,   rw:.62, rh:1},
    {rx:.38,  ry:0,   rw:.62, rh:1}
  ];
  const rawCrops = [];
  const subC = document.createElement('canvas');
  const subG = subC.getContext('2d');
  for (const cr of crops) {
    const cw = Math.max(64, Math.round(w * cr.rw)), ch = Math.max(64, Math.round(h * cr.rh));
    const sx = Math.round(w * cr.rx), sy = Math.round(h * cr.ry);
    subC.width = cw; subC.height = ch;
    subG.drawImage(c, sx, sy, cw, ch, 0, 0, cw, ch);
    const dets = await coco.detect(subC, 15, .20).catch(() => []);
    for (const d of dets) {
      const bx = d.bbox[0] / cw, by = d.bbox[1] / ch, bw = d.bbox[2] / cw, bh = d.bbox[3] / ch;
      const touchesInternalLeft = cr.rx > 0 && bx < .015;
      const touchesInternalRight = (cr.rx + cr.rw) < .99 && (bx + bw) > .985;
      if ((touchesInternalLeft || touchesInternalRight) && bw < .22) continue;
      rawCrops.push({
        cls: d.class,
        type: mapClass(d.class),
        score: d.score * .95,
        box: {
          x: clamp(cr.rx + bx * cr.rw, 0, 1),
          y: clamp(cr.ry + by * cr.rh, 0, 1),
          w: clamp(bw * cr.rw, .02, 1),
          h: clamp(bh * cr.rh, .02, 1)
        }
      });
    }
  }

  // 3) Face detection + 68 landmarks (DetectAllFaceLandmarksTask is a thenable without .catch, so wrap in try/catch)
  let rawFaces = [];
  if (faceOK) {
    try { rawFaces = await faceapi.detectAllFaces(c, new faceapi.TinyFaceDetectorOptions({inputSize:320, scoreThreshold:.28})).withFaceLandmarks(); }
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

  // Attach faces to person boxes; if a single person box contains multiple distinct faces, split/spawn person entries
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
        // Multiple faces inside one wide person box -> create separate person boxes
        matchingFaces.sort((a, b) => a.box.x - b.box.x);
        matchingFaces.forEach((f, idx) => {
          usedFaces.add(faces.indexOf(f));
          const inf = inferPersonBoxFromFace(f.box, px);
          const bx = clamp(Math.max(o.box.x, inf.x), 0, .95);
          const bw = clamp(Math.min(o.box.x + o.box.w - bx, inf.w), .08, 1 - bx);
          expandedObjs.push({cls:'person', type:'person', score:o.score || .78, box:{x:bx, y:o.box.y, w:bw, h:o.box.h}, _face:f});
        });
      }
    } else {
      expandedObjs.push(o);
    }
  }
  objs = expandedObjs;

  // Any remaining detected face not inside a person box spawns a dedicated person subject
  faces.forEach((f, fi) => {
    if (usedFaces.has(fi)) return;
    const fc = {x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2};
    const hasPerson = objs.some(o => o.type === 'person' && (inside(fc, o.box) || iou(o.box, f.box) > .15));
    if (!hasPerson) {
      objs.push({cls:'person', type:'person', score:.80, box:inferPersonBoxFromFace(f.box, px), _face:f});
    }
  });

  // Foreground island pass: catch distinct products/objects on studio/uniform backgrounds that COCO missed
  const islands = findForegroundIslands(px);
  for (const isl of islands) {
    const covered = objs.some(o => iou(o.box, isl) > .22 || containment(o.box, isl) > .55);
    const touchesBottomCorner = isl.y > .65 && (isl.y + isl.h > .96) && (isl.x < .04 || isl.x + isl.w > .96);
    if (!covered && !touchesBottomCorner && objs.length < 10 && isl.mass > .022) {
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

  // Optional per-subject fine-grained classification with MobileNetV2 on top subjects
  if (mobilenetModel) {
    const subC = document.createElement('canvas');
    const subG = subC.getContext('2d');
    for (const o of objs.slice(0, 6)) {
      try {
        const sx = clamp(Math.floor(o.box.x * w), 0, w - 1), sy = clamp(Math.floor(o.box.y * h), 0, h - 1);
        const sw = clamp(Math.round(o.box.w * w), 16, w - sx), sh = clamp(Math.round(o.box.h * h), 16, h - sy);
        subC.width = Math.min(224, sw); subC.height = Math.min(224, sh);
        subG.drawImage(c, sx, sy, sw, sh, 0, 0, subC.width, subC.height);
        const preds = await mobilenetModel.classify(subC, 3).catch(() => []);
        if (preds && preds.length) {
          o._mnTags = preds.filter(p => p.probability >= .12).map(p => p.className.split(',')[0].trim().toLowerCase());
          // Refine 'auto' or generic 'object' if MobileNet strongly sees a specific vehicle/phone/product
          const topTag = o._mnTags[0] || '';
          if (o.type === 'auto' || o.cls === 'subject') {
            if (/car|sedan|coupe|convertible|cabriolet|limousine|minivan|jeep|sports car|wagon|racer/i.test(topTag)) { o.type = 'car'; o.cls = topTag; }
            else if (/cellular telephone|cellphone|iPod|hand-held computer|modem/i.test(topTag)) { o.type = 'phone'; o.cls = 'smartphone'; }
            else if (/bottle|perfume|lotion|mug|cup|watch|shoe|sneaker|sandal|sunglass|camera|bag|backpack/i.test(topTag)) { o.type = 'product'; o.cls = topTag; }
            else if (topTag) { o.type = 'product'; o.cls = topTag; }
          }
        }
      } catch (e) {}
    }
  }

  const counts = {};
  const subjects = objs.slice(0, 12).map((o, idx) => describe(o, px, faces, idx, counts));
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
      parts.shirt && `a ${parts.shirt.name} top with natural fabric folds`,
      parts.pants && (b.h > .55 ? `${parts.pants.name} trousers/bottoms` : null),
      parts.shoes && (b.h > .74 ? `${parts.shoes.name} footwear` : null)
    ].filter(Boolean);
    const hairNote = parts.hair ? ` with ${parts.hair.name} hair` : '';
    s.desc = `${pa.framing} of a person${hairNote} ${pos.horiz} (${pos.depth}), ${pa.facing}${wear.length ? ', wearing ' + joinList(wear) : ''}`;
    s.detail = `${label} (${category}): ${s.desc}. Dominant outfit color: ${s.colorName} (${s.color}). Estimated height: ${s.cm} cm.`;
    s.richSentence = `${label} is captured in a ${pa.framing}${hairNote}, positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]}, ${pa.facing}${wear.length ? ', dressed in ' + joinList(wear) : ''} with lifelike skin and garment textures`;
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
    s.detail = `${label} (${category}): ${s.desc}. Primary color: ${s.colorName} (${s.color}), ${oa.condition}. Approx size: ${s.cm} cm.`;
    if (t === 'car' || t === 'vehicle') {
      s.richSentence = `${label} is a ${s.colorName} ${itemName}${secNote} featuring a ${oa.finish} and ${oa.condition}, positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]} in a ${oa.angleText} with clearly defined bodywork, wheels, and trim details`;
    } else if (t === 'phone') {
      s.richSentence = `${label} is a sleek ${s.colorName} ${itemName}${secNote} with a ${oa.finish} and precision-machined edges, placed ${pos.horiz} in the ${pos.depth.split(' (')[0]} in an ${oa.angleText}`;
    } else {
      s.richSentence = `${label} is a ${s.colorName} ${itemName}${secNote} with a ${oa.finish} (${oa.condition}), positioned ${pos.horiz} in the ${pos.depth.split(' (')[0]} and seen from a ${oa.angleText}`;
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

// Builds a rich 5-8 sentence paragraph for #subjDesc (Part 7), with Multiple Mode main-subject emphasis when selected
function buildSceneParagraph(det, opts = {}) {
  if (!det || !Array.isArray(det.subjects) || !det.subjects.length) return '';
  const subs = opts.customSubjects || det.subjects;
  const isMulti = !!opts.isMulti;
  const selectedKey = opts.selectedKey || '';
  const meta = det.sceneMeta || analyzeSceneContext(det._px || {w:16, h:16, data:new Uint8ClampedArray(1024)}, subs, []);

  const sentences = [];

  if (subs.length === 1 && !isMulti) {
    const s = subs[0];
    sentences.push(`Photorealistic ${meta.styleGenre} scene featuring a single main subject (${s.label}, ${s.category}) in ${meta.shotScale}.`);
    sentences.push(`${s.richSentence || `${s.label}: ${s.desc}`}, standing approx ${s.cm} cm in real-world scale with a dominant ${s.colorName || 'natural'} color palette.`);
  } else {
    const selIdx = selectedKey ? subs.findIndex((s, i) => (s.key || `img0_s${i}`) === selectedKey || s.label === selectedKey) : -1;
    const selSub = selIdx >= 0 ? subs[selIdx] : null;
    const countSummary = `${subs.length} detected subject${subs.length > 1 ? 's' : ''} (${subs.map(s => `${s.label} [${s.category}]`).join(', ')})`;

    if (selSub) {
      sentences.push(`Photorealistic multi-subject scene containing ${countSummary}, with primary compositional emphasis locked on ${selSub.label} as the central hero subject of the shot.`);
      sentences.push(`MAIN SUBJECT — ${selSub.richSentence || `${selSub.label}: ${selSub.desc}`}, rendered in a dominant ${selSub.colorName || 'natural'} palette at approx ${selSub.cm} cm scale, placed dead-center in sharpest focus and hero lighting.`);
      const others = subs.filter((_, i) => i !== selIdx);
      if (others.length) {
        const otherDescs = others.map(o => `${o.richSentence || `${o.label}: ${o.desc}`} (secondary non-focus element kept softly blurred in the background/periphery)`).join('; ');
        sentences.push(`Secondary elements in the scene: ${otherDescs}.`);
      }
    } else {
      sentences.push(`Photorealistic scene featuring ${countSummary} arranged in ${meta.shotScale}.`);
      subs.forEach(s => {
        sentences.push(`${s.richSentence || `${s.label}: ${s.desc}`} (dominant color: ${s.colorName || 'natural'}, approx ${s.cm} cm).`);
      });
    }
  }

  sentences.push(meta.bgSentence);
  sentences.push(meta.lightSentence);
  sentences.push(meta.camSentence);

  return sentences.filter(Boolean).join(' ');
}

// Re-evaluate a detection result when the user manually changes #subjType so Focus Mode & descriptions reload immediately
function retype(det, newType) {
  if (!det || !det._px || !Array.isArray(det.subjects)) return det;
  const counts = {};
  det.subjects = det.subjects.map((old, idx) => {
    const o = {cls:newType === 'auto' ? 'object' : newType, type:newType, score:old.score || .8, box:old.box, _face:old.face ? {box:old.face.box, pts:old.face.pts} : null};
    return describe(o, det._px, det.faces || [], idx, counts);
  });
  det.view = det.subjects[0]?.viewCode || 'front';
  det.sceneMeta = analyzeSceneContext(det._px, det.subjects, []);
  det.fullSceneDesc = buildSceneParagraph(det, {isMulti:false, selectedKey:''});
  return det;
}

const joinList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ---------- what is at a pointed spot (focus point detail - Part 6) ---------- */
const LM = [['right eye', 36, 41], ['left eye', 42, 47], ['right eyebrow', 17, 21], ['left eyebrow', 22, 26], ['nose', 27, 35], ['mouth and lips', 48, 67], ['chin', 6, 10]];
function pointInfo(det, x, y) {
  if (!det) return null;
  const p = {x, y}, hits = det.subjects.map((s, i) => ({s, i})).filter(h => inside(p, h.s.box)).sort((a, b) => a.s.box.w * a.s.box.h - b.s.box.w * b.s.box.h);
  const h = hits[0];
  const spotCol = det._px ? dominant(det._px, {x:clamp(x - .03, 0, .94), y:clamp(y - .03, 0, .94), w:.06, h:.06}, {skipBorder:false, satWeight:1.8}) : null;
  if (!h) {
    return {
      index:-1, part:'background area', sizeCm:null,
      colorName:spotCol?.name || null, color:spotCol?.hex || null,
      where:`background at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`,
      fullDetail:`Background area (${spotCol ? spotCol.name + ', ' : ''}${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top)`
    };
  }
  const s = h.s, b = s.box, rx = (x - b.x) / b.w, ry = (y - b.y) / b.h, side = rx < .5 ? 'right' : 'left', iside = rx < .5 ? 'left' : 'right';
  const vert = ry < .33 ? 'upper' : ry > .67 ? 'lower' : 'middle', horiz = rx < .33 ? 'left' : rx > .67 ? 'right' : 'center';
  let part = null, sizeCm = Math.max(1, Math.round(s.cm * .08));
  if (s.type === 'person') {
    const f = s.face;
    if (f) {
      const fb = f.box, fs = Math.max(fb.w, fb.h);
      let best = null, bd = 1e9;
      LM.forEach(([n, a, z]) => { for (let k = a; k <= z; k++) { const d = Math.hypot(f.pts[k][0] - x, (f.pts[k][1] - y) * det.h / det.w); if (d < bd) { bd = d; best = n; } } });
      if (best && bd < fs * .16) { part = best; sizeCm = best.includes('eye') ? 3 : best === 'nose' ? 5 : best.startsWith('mouth') ? 5 : 6; }
      else if (inside(p, fb)) { const browY = Math.min(f.pts[19][1], f.pts[24][1]); part = y < browY ? 'forehead' : `${x < fb.x + fb.w / 2 ? 'right' : 'left'} cheek`; sizeCm = 8; }
      else if (y < fb.y && y > fb.y - fb.h * .7 && x > fb.x - fb.w * .2 && x < fb.x + fb.w * 1.2) { part = 'hair'; sizeCm = 12; }
      else if (Math.abs(y - (fb.y + fb.h * .5)) < fb.h * .35 && (x < fb.x || x > fb.x + fb.w) && Math.abs(x - (fb.x + fb.w / 2)) < fb.w * .8) { part = `${x < fb.x ? 'right' : 'left'} ear`; sizeCm = 6; }
    }
    if (!part) {
      const faceBottom = f ? (f.box.y + f.box.h - b.y) / b.h : .16;
      if (ry < faceBottom) { part = 'head and face'; sizeCm = 22; }
      else if (ry < faceBottom + .06) { part = 'neck and collar'; sizeCm = 12; }
      else if (ry < .52) { part = Math.abs(rx - .5) > .3 ? `${side} arm / sleeve` : ry < faceBottom + .15 ? 'shoulders and collar' : 'upper torso / shirt'; sizeCm = 25; }
      else if (ry < .60) { part = Math.abs(rx - .5) > .3 ? `${side} hand` : 'waistline'; sizeCm = 14; }
      else if (ry < .90) { part = `${side} leg / trousers`; sizeCm = 30; }
      else { part = `${side} shoe`; sizeCm = 26; }
    }
  } else if (s.type === 'car' || s.type === 'vehicle') {
    const sideView = s.viewCode === 'left' || s.viewCode === 'right';
    if (sideView) {
      if (ry > .55 && (rx < .34 || rx > .66)) { part = `${iside === 'left' ? 'front-left' : 'rear-left'} wheel and rim`; sizeCm = 65; }
      else if (ry < .42) { part = rx < .5 ? 'side window and A-pillar' : 'rear side window and roofline'; sizeCm = 60; }
      else if (ry > .82) { part = 'lower side skirt'; sizeCm = 40; }
      else { part = rx < .2 || rx > .8 ? `${iside} bumper fender` : 'side door panel'; sizeCm = 80; }
    } else {
      if (ry < .32) { part = rx > .28 && rx < .72 ? 'windshield glass' : 'roof pillar and mirror'; sizeCm = 95; }
      else if (ry < .62) { part = rx < .3 || rx > .7 ? `${side} headlight assembly` : 'front grille and emblem'; sizeCm = 35; }
      else if (ry > .72 && (rx < .26 || rx > .74)) { part = `front-${side} wheel`; sizeCm = 65; }
      else { part = rx > .3 && rx < .7 ? 'front bumper and intake' : `${side} front bumper corner`; sizeCm = 50; }
    }
  } else if (s.type === 'phone') {
    if (rx < .52 && ry < .36) { part = 'camera lens module'; sizeCm = 3.5; }
    else if (rx < .1 || rx > .9) { part = 'metallic side frame and buttons'; sizeCm = 4; }
    else if (ry > .88) { part = 'bottom speaker and charging port edge'; sizeCm = 3; }
    else { part = 'center body panel and logo area'; sizeCm = 6; }
  } else if (s.type === 'product' || s.type === 'object') {
    if (ry < .24) { part = 'top cap / upper rim detail'; sizeCm = Math.max(2, Math.round(s.cm * .18)); }
    else if (ry > .80) { part = 'base and lower edge'; sizeCm = Math.max(2, Math.round(s.cm * .2)); }
    else if (rx > .24 && rx < .76) { part = 'center branding / main surface detail'; sizeCm = Math.max(3, Math.round(s.cm * .28)); }
    else { part = `${iside} contour edge and surface`; sizeCm = Math.max(2, Math.round(s.cm * .22)); }
  } else if (s.type === 'animal') {
    part = ry < .35 ? 'head and eyes' : ry > .75 ? 'legs and paws' : 'body coat and fur'; sizeCm = Math.round(s.cm * .28);
  }
  if (!part) part = `${vert === 'middle' && horiz === 'center' ? 'center' : (vert === 'middle' ? '' : vert + '-') + (horiz === 'center' ? 'middle' : horiz)} detail`.replace(/^-/, '');
  const cName = spotCol?.name || s.colorName || null, cHex = spotCol?.hex || s.color || null;
  const whereStr = `${vert}-${horiz} of ${s.label}`.replace('middle-center', 'center');
  const fullDetail = `${s.label} — ${part}${cName ? ` (${cName})` : ''}: ${s.angle || 'front view'}, positioned ${s.position || 'in frame'}${s.pose ? `, ${s.pose}` : ''}${s.finish ? `, ${s.finish}` : ''}.`;
  return {index:h.i, subject:s, part, sizeCm, colorName:cName, color:cHex, where:whereStr, fullDetail};
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
