/* VisionPilot — free in-browser detection (no paid APIs):
   COCO-SSD (TensorFlow.js) finds the main subjects, face-api finds faces + 68 landmarks,
   and plain canvas pixel data gives the colors. Everything runs locally in the browser. */
(() => {
const FACE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js'; // bundles TensorFlow.js
const FACE_MODELS = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';
const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const loadScript = src => new Promise((res, rej) => {
  const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
  s.onload = res; s.onerror = () => { s.remove(); rej(new Error('Could not load ' + src)); }; document.head.appendChild(s);
});

/* ---------- models (loaded once, cached in IndexedDB after first download) ---------- */
const COCO_MODEL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/model.json';
const COCO_IDB = 'indexeddb://vp-coco-lite-v1';
let ready = null, coco = null, faceOK = false;
function init() {
  return ready || (ready = (async () => {
    if (!window.faceapi) await loadScript(FACE_URL);
    if (!window.tf && window.faceapi?.tf) window.tf = window.faceapi.tf;   // COCO-SSD shares face-api's TensorFlow.js
    if (!window.cocoSsd) await loadScript(COCO_URL);
    await window.tf.ready?.();
    const faces = Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(FACE_MODELS), faceapi.nets.faceLandmark68Net.loadFromUri(FACE_MODELS)])
      .then(() => { faceOK = true; }).catch(e => console.warn('face-api models did not load', e));
    let gm = await window.tf.loadGraphModel(COCO_IDB).catch(() => null);
    if (!gm) {
      gm = await window.tf.loadGraphModel(COCO_MODEL);
      gm.save(COCO_IDB).catch(() => {});
    }
    coco = new window.cocoSsd.ObjectDetection('lite_mobilenet_v2');
    coco.model = gm;
    await faces;
  })().catch(e => { ready = null; throw e; }));
}

/* ---------- COCO classes -> VisionPilot subject types ---------- */
const VEHICLE = ['truck', 'bus', 'motorcycle', 'bicycle', 'airplane', 'boat', 'train'];
const ANIMAL = ['bird', 'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'teddy bear'];
const PRODUCT = ['bottle', 'wine glass', 'cup', 'laptop', 'tv', 'keyboard', 'mouse', 'remote', 'book', 'clock', 'vase', 'handbag', 'backpack', 'suitcase',
  'umbrella', 'tie', 'sports ball', 'skateboard', 'surfboard', 'tennis racket', 'toaster', 'microwave', 'hair drier', 'toothbrush', 'scissors', 'frisbee', 'skis', 'snowboard', 'kite', 'baseball bat', 'baseball glove'];
const BACKGROUND = ['dining table', 'chair', 'couch', 'bed', 'potted plant', 'bench', 'toilet', 'sink', 'refrigerator', 'oven', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter'];
const typeOf = cls => cls === 'person' ? 'person' : cls === 'car' ? 'car' : cls === 'cell phone' ? 'phone' : VEHICLE.includes(cls) ? 'vehicle'
  : ANIMAL.includes(cls) ? 'animal' : PRODUCT.includes(cls) ? 'product' : 'object';
const NOUN = {person:'person', car:'car', phone:'phone', vehicle:'vehicle', animal:'animal', product:'product', object:'object', auto:'subject'};
const HEIGHT = {person:175, car:150, phone:16, vehicle:150, animal:60, product:30, object:50, auto:100};

/* ---------- colors from canvas pixels ---------- */
const toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function hsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}
function colorName(c) {
  const [h, s, l] = hsl(c);
  if (l < .13) return 'black';
  if (s < .14 || (l > .9 && s < .3)) return l > .86 ? 'white' : l > .62 ? 'light grey' : l > .36 ? 'grey' : 'dark grey';
  let n = h < 12 || h >= 345 ? 'red' : h < 38 ? 'orange' : h < 66 ? 'yellow' : h < 160 ? 'green' : h < 195 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink';
  if (n === 'orange' && l < .42) n = 'brown';
  if (n === 'yellow' && l < .4) n = 'olive';
  if (n === 'orange' && s < .45 && l > .55) n = 'beige';
  if (n === 'blue' && l < .3) n = 'navy blue';
  if (n === 'red' && l < .3) n = 'dark red';
  return l > .72 && !['beige', 'white'].includes(n) ? 'light ' + n : l < .26 && !n.startsWith('dark') && n !== 'navy blue' && n !== 'brown' ? 'dark ' + n : n;
}
// pixel grid of the (downscaled) image, plus the color of its border (usually the backdrop)
function pixelGrid(img) {
  const W = img.naturalWidth || img.videoWidth || img.width, H = img.naturalHeight || img.videoHeight || img.height;
  const sc = Math.min(1, 640 / Math.max(W, H)), w = Math.max(1, Math.round(W * sc)), h = Math.max(1, Math.round(H * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let br = [0, 0, 0], bn = 0;
  for (let x = 0; x < w; x += 3) [0, h - 1].forEach(y => { const i = (y * w + x) * 4; if (d[i + 3] > 128) { br[0] += d[i]; br[1] += d[i + 1]; br[2] += d[i + 2]; bn++; } });
  for (let y = 0; y < h; y += 3) [0, w - 1].forEach(x => { const i = (y * w + x) * 4; if (d[i + 3] > 128) { br[0] += d[i]; br[1] += d[i + 1]; br[2] += d[i + 2]; bn++; } });
  return {c, w, h, d, W, H, border:bn ? br.map(v => v / bn) : null};
}
// dominant color of a normalized box: saturated pixels count more, the backdrop color is skipped
function dominant(px, box, {skipBorder = true, satWeight = 2} = {}) {
  const x0 = Math.floor(clamp(box.x, 0, 1) * px.w), y0 = Math.floor(clamp(box.y, 0, 1) * px.h);
  const x1 = Math.ceil(clamp(box.x + box.w, 0, 1) * px.w), y1 = Math.ceil(clamp(box.y + box.h, 0, 1) * px.h);
  const n = Math.max(1, (x1 - x0) * (y1 - y0)), step = Math.max(1, Math.floor(Math.sqrt(n / 5000)));
  const bins = new Map();
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * px.w + x) * 4; if (px.d[i + 3] < 128) continue;
    const c = [px.d[i], px.d[i + 1], px.d[i + 2]];
    if (skipBorder && px.border && Math.hypot(c[0] - px.border[0], c[1] - px.border[1], c[2] - px.border[2]) < 34) continue;
    const k = (c[0] >> 4) << 8 | (c[1] >> 4) << 4 | (c[2] >> 4), [, s] = hsl(c);
    const b = bins.get(k) || {w:0, r:0, g:0, b:0}; const wt = 1 + satWeight * s;
    b.w += wt; b.r += c[0] * wt; b.g += c[1] * wt; b.b += c[2] * wt; bins.set(k, b);
  }
  if (!bins.size) return skipBorder ? dominant(px, box, {skipBorder:false, satWeight}) : null;
  // merge each bin with its neighbours so a color split over two bins still wins
  let best = null, bw = -1;
  bins.forEach((b, k) => {
    let w = b.w; const r = k >> 8, g = k >> 4 & 15, bl = k & 15;
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
      if (!dr && !dg && !db) continue; const nb = bins.get((r + dr) << 8 | (g + dg) << 4 | (bl + db)); if (nb) w += nb.w * .5;
    }
    if (w > bw) { bw = w; best = b; }
  });
  const rgb = [best.r / best.w, best.g / best.w, best.b / best.w];
  return {rgb, hex:toHex(rgb), name:colorName(rgb)};
}
const sub = (b, x, y, w, h) => ({x:b.x + b.w * x, y:b.y + b.h * y, w:b.w * w, h:b.h * h});

/* ---------- analysis ---------- */
const where = b => { const cx = b.x + b.w / 2; return cx < .38 ? 'on the left' : cx > .62 ? 'on the right' : 'in the center'; };
async function analyze(img) {
  await init();
  const px = pixelGrid(img);
  const preds = await coco.detect(px.c, 20, .3);
  let faces = [];
  if (faceOK) {
    try {
      faces = (await faceapi.detectAllFaces(px.c, new faceapi.TinyFaceDetectorOptions({inputSize:416, scoreThreshold:.4})).withFaceLandmarks()).map(f => {
        const b = f.detection.box, P = f.landmarks.positions.map(p => [p.x / px.w, p.y / px.h]);
        return {box:{x:b.x / px.w, y:b.y / px.h, w:b.width / px.w, h:b.height / px.h}, score:f.detection.score, pts:P};
      });
    } catch (e) { console.warn('face detection failed', e); }
  }
  let objs = preds.map(p => ({cls:p.class, type:typeOf(p.class), score:p.score,
    box:{x:p.bbox[0] / px.w, y:p.bbox[1] / px.h, w:p.bbox[2] / px.w, h:p.bbox[3] / px.h}}));
  objs.forEach(o => { o.area = o.box.w * o.box.h; });
  const fg = objs.filter(o => !BACKGROUND.includes(o.cls) && o.score >= .45);
  let main = (fg.length ? fg : objs).filter(o => o.area >= .025 || o === (fg.length ? fg : objs)[0]).sort((a, b) => b.area - a.area).slice(0, 8);
  // drop boxes that sit almost entirely inside a bigger box of the same type (duplicates)
  main = main.filter((o, i) => !main.some((p, j) => j < i && p.type === o.type && overlap(o.box, p.box) > .8));
  // faces without a detected person still mean a person
  faces.forEach(f => {
    const fc = {x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2};
    if (!main.some(o => o.type === 'person' && inside(fc, o.box))) {
      const w = f.box.w * 3.2, h = Math.min(1 - f.box.y + f.box.h * .4, f.box.h * 8);
      main.push({cls:'person', type:'person', score:f.score, box:{x:clamp(fc.x - w / 2, 0, 1), y:clamp(f.box.y - f.box.h * .4, 0, 1), w, h}, fromFace:true});
    }
  });
  if (!main.length) main = [{cls:'subject', type:'auto', score:0, box:{x:.15, y:.1, w:.7, h:.8}}];
  main.sort((a, b) => (a.box.x + a.box.w / 2) - (b.box.x + b.box.w / 2));   // left to right, like the labels
  const subjects = main.map(o => describe(o, px, faces));
  const ar = main[0] ? (main[0].box.w * px.W) / (main[0].box.h * px.H) : 1;
  const view = main[0]?.type === 'car' || main[0]?.type === 'vehicle' ? (ar > 2 ? 'left' : 'three-quarter')
    : main[0]?.type === 'person' ? (subjects[0].face ? 'front' : 'back') : 'front';
  return {w:px.W, h:px.H, subjects, faces, view, image:dominant(px, {x:0, y:0, w:1, h:1}, {skipBorder:false})};
}
const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function overlap(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h / (a.w * a.h || 1);
}
function describe(o, px, faces) {
  const b = o.box, t = o.type, s = {type:t, cls:o.cls, score:+o.score.toFixed(2), box:b, cm:HEIGHT[t]};
  if (t === 'person') {
    const face = faces.find(f => inside({x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2}, b));
    s.face = face ? {box:face.box, pts:face.pts} : null;
    // clothing bands down the body (relative to the face when we have one)
    const top = face ? (face.box.y + face.box.h * 1.25 - b.y) / b.h : .2;
    const R = {shirt:sub(b, .32, clamp(top, .12, .4), .36, .3), pants:sub(b, .34, .6, .32, .26), shoes:sub(b, .2, .935, .6, .065)};
    const parts = {};
    Object.entries(R).forEach(([k, r]) => { const c = dominant(px, r, {satWeight:1}); if (c) parts[k] = c; });
    if (face) { const c = dominant(px, sub(face.box, .3, .45, .4, .3), {skipBorder:false, satWeight:.3}); if (c) parts.skin = c; }
    s.parts = Object.fromEntries(Object.entries(parts).map(([k, c]) => [k, c.hex]));
    s.partNames = Object.fromEntries(Object.entries(parts).map(([k, c]) => [k, c.name]));
    const c = parts.shirt || dominant(px, sub(b, .25, .2, .5, .6));
    s.color = c?.hex; s.colorName = c?.name;
    const wear = [parts.shirt && `a ${parts.shirt.name} top`, parts.pants && `${parts.pants.name} trousers`, parts.shoes && `${parts.shoes.name} shoes`].filter(Boolean);
    s.desc = `person ${where(b)}${wear.length ? ', wearing ' + joinList(wear) : ''}`;
  } else {
    // the body paint / main material: the middle of the box, away from the edges and the ground
    const c = dominant(px, t === 'car' || t === 'vehicle' ? sub(b, .12, .2, .76, .5) : sub(b, .15, .15, .7, .7));
    s.color = c?.hex; s.colorName = c?.name;
    s.desc = `${c ? c.name + ' ' : ''}${o.cls === 'subject' ? 'main subject' : o.cls} ${where(b)}`;
  }
  return s;
}
const joinList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ---------- what is at a pointed spot (focus point detail) ---------- */
// face landmark groups (68-point model); left / right are the subject's own sides (image left = their right)
const LM = [['right eye', 36, 41], ['left eye', 42, 47], ['right eyebrow', 17, 21], ['left eyebrow', 22, 26], ['nose', 27, 35], ['mouth and lips', 48, 67], ['chin', 6, 10]];
function pointInfo(det, x, y) {
  if (!det) return null;
  const p = {x, y}, hits = det.subjects.map((s, i) => ({s, i})).filter(h => inside(p, h.s.box)).sort((a, b) => a.s.box.w * a.s.box.h - b.s.box.w * b.s.box.h);
  const h = hits[0];
  if (!h) return {index:-1, part:'background', sizeCm:null, where:''};
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
      const faceBottom = f ? (f.box.y + f.box.h - b.y) / b.h : .14;
      if (ry < faceBottom) { part = 'head'; sizeCm = 23; }
      else if (ry < faceBottom + .06) { part = 'neck'; sizeCm = 12; }
      else if (ry < .5) { part = Math.abs(rx - .5) > .3 ? `${side} arm` : ry < faceBottom + .14 ? 'shoulders and collar' : 'chest of the top'; sizeCm = 25; }
      else if (ry < .58) { part = Math.abs(rx - .5) > .3 ? `${side} hand` : 'waist and belt'; sizeCm = 15; }
      else if (ry < .92) { part = `${side} leg of the trousers`; sizeCm = 30; }
      else { part = `${side} shoe`; sizeCm = 28; }
    }
  } else if (s.type === 'car' || s.type === 'vehicle') {
    const sideView = det.view === 'left' || det.view === 'right';
    if (sideView) {
      if (ry > .55 && (rx < .34 || rx > .66)) { part = `${iside} wheel (${rx < .5 ? 'image left' : 'image right'})`; sizeCm = 65; }
      else if (ry < .42) { part = rx < .5 ? 'side window and A-pillar area' : 'rear side window'; sizeCm = 60; }
      else if (ry > .82) { part = 'side skirt'; sizeCm = 40; }
      else { part = rx < .2 || rx > .8 ? `${iside} bumper corner` : 'door panel'; sizeCm = 80; }
    } else {
      if (ry < .3) { part = rx > .3 && rx < .7 ? 'windshield' : 'roof pillar'; sizeCm = 100; }
      else if (ry < .6) { part = rx < .3 || rx > .7 ? `${side} headlight` : 'grille and badge'; sizeCm = 35; }
      else if (ry > .72 && (rx < .25 || rx > .75)) { part = `front ${side} wheel`; sizeCm = 65; }
      else { part = rx > .3 && rx < .7 ? 'front bumper and license plate' : `${side} side of the front bumper`; sizeCm = 50; }
    }
  } else if (s.type === 'phone') {
    if (rx < .5 && ry < .35) { part = 'camera module'; sizeCm = 3; }
    else if (rx < .08 || rx > .92) { part = 'side buttons and edge'; sizeCm = 4; }
    else if (ry > .9) { part = 'bottom edge and port'; sizeCm = 3; }
    else { part = 'back panel and logo'; sizeCm = 6; }
  } else if (s.type === 'animal') {
    part = ry < .35 ? 'head' : ry > .75 ? 'legs and paws' : 'body and fur'; sizeCm = Math.round(s.cm * .3);
  }
  if (!part) part = `${vert === 'middle' && horiz === 'center' ? 'center' : (vert === 'middle' ? '' : vert + '-') + (horiz === 'center' ? 'middle' : horiz)} part`.replace(/^-/, '');
  const c = det._px ? dominant(det._px, {x:x - .025, y:y - .025, w:.05, h:.05}, {skipBorder:false, satWeight:.5}) : null;
  return {index:h.i, part, sizeCm, colorName:c?.name || null, color:c?.hex || null, where:`${vert}-${horiz} of the ${NOUN[s.type] || 'subject'}`.replace('middle-center', 'center')};
}
// keep a pixel grid next to the result so pointInfo can read the color under the point
async function analyzeKeep(img) { const det = await analyze(img); Object.defineProperty(det, '_px', {value:pixelGrid(img), enumerable:false}); return det; }

window.VPDetect = {init, analyze:analyzeKeep, pointInfo, colorName, dominantOf:(img, box) => dominant(pixelGrid(img), box || {x:0, y:0, w:1, h:1})};
})();
