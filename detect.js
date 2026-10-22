/* VisionPilot — free in-browser detection (no paid APIs):
   COCO-SSD (TensorFlow.js) + multi-pass NMS + foreground island segmentation find all people, products, cars and objects,
   face-api finds faces + 68 landmarks for pose/angle estimation, and canvas pixel clustering extracts accurate subject colors. */
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
    if (!window.tf && window.faceapi?.tf) window.tf = window.faceapi.tf;
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
  'umbrella', 'tie', 'sports ball', 'skateboard', 'surfboard', 'tennis racket', 'toaster', 'microwave', 'hair drier', 'toothbrush', 'scissors',
  'frisbee', 'skis', 'snowboard', 'kite', 'baseball bat', 'baseball glove', 'bowl', 'spoon', 'fork', 'knife'];
const BACKGROUND = ['dining table', 'bed', 'toilet', 'sink', 'refrigerator', 'oven', 'traffic light', 'fire hydrant', 'stop sign', 'parking meter', 'bench'];
const typeOf = cls => cls === 'person' ? 'person' : cls === 'car' ? 'car' : cls === 'cell phone' ? 'phone' : VEHICLE.includes(cls) ? 'vehicle'
  : ANIMAL.includes(cls) ? 'animal' : PRODUCT.includes(cls) ? 'product' : 'object';
const NOUN = {person:'person', car:'car', phone:'phone', vehicle:'vehicle', animal:'animal', product:'product', object:'object', auto:'subject'};
const TYPE_TITLE = {person:'Person', car:'Car', phone:'Phone', vehicle:'Vehicle', animal:'Animal', product:'Product', object:'Object', auto:'Object'};
const HEIGHT = {person:175, car:150, phone:16, vehicle:150, animal:60, product:30, object:50, auto:100};
const SUBJ_PALETTE = ['#e85d2b', '#3fb950', '#3f7cf6', '#d4a72c', '#a371f7', '#2bb3c0', '#f78fb3', '#f97316', '#22c55e', '#60a5fa'];

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
  if (l < .11) return 'matte black';
  if (l < .17 && s < .22) return 'charcoal black';
  if (s < .12 || (l > .92 && s < .28)) return l > .88 ? 'pure white' : l > .68 ? 'silver grey' : l > .38 ? 'neutral grey' : 'dark charcoal';
  if (h >= 14 && h < 42 && s < .48 && l > .56) return 'warm beige';
  if (h >= 12 && h < 40 && l < .40) return l < .24 ? 'dark brown' : 'tan brown';
  if (h >= 40 && h < 66 && l < .42) return 'olive green';
  let n;
  if (h < 11 || h >= 346) n = l < .32 ? 'crimson red' : 'red';
  else if (h < 26) n = 'coral orange';
  else if (h < 42) n = 'orange';
  else if (h < 56) n = 'amber gold';
  else if (h < 70) n = 'yellow';
  else if (h < 155) n = l < .30 ? 'forest green' : 'emerald green';
  else if (h < 195) n = 'teal';
  else if (h < 220) n = 'sky blue';
  else if (h < 258) n = l < .28 ? 'navy blue' : 'royal blue';
  else if (h < 292) n = 'violet purple';
  else if (h < 328) n = 'magenta pink';
  else n = 'rose pink';
  if (l > .75 && !n.startsWith('light') && !n.includes('sky') && !n.includes('beige')) return 'light ' + n.replace(/^(royal|emerald|crimson|coral|violet|magenta|rose) /, '');
  if (l < .23 && !n.startsWith('dark') && !n.includes('navy') && !n.includes('crimson') && !n.includes('forest')) return 'dark ' + n;
  return n;
}

// pixel grid of the downscaled image, plus border color statistics for accurate background rejection
function pixelGrid(img) {
  const W = img.naturalWidth || img.videoWidth || img.width || 320, H = img.naturalHeight || img.videoHeight || img.height || 320;
  const sc = Math.min(1, 640 / Math.max(W, H)), w = Math.max(1, Math.round(W * sc)), h = Math.max(1, Math.round(H * sc));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', {willReadFrequently:true}); g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const borderSamples = [];
  const pushPx = (x, y) => {
    const i = (y * w + x) * 4;
    if (d[i + 3] > 128) borderSamples.push([d[i], d[i + 1], d[i + 2]]);
  };
  for (let x = 0; x < w; x += 2) { pushPx(x, 0); pushPx(x, h - 1); if (h > 4) { pushPx(x, 2); pushPx(x, h - 3); } }
  for (let y = 0; y < h; y += 2) { pushPx(0, y); pushPx(w - 1, y); if (w > 4) { pushPx(2, y); pushPx(w - 3, y); } }
  let border = null, borderTol = 36;
  if (borderSamples.length) {
    const m = [0, 0, 0];
    borderSamples.forEach(p => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; });
    border = m.map(v => v / borderSamples.length);
    const avgDist = borderSamples.reduce((acc, p) => acc + Math.hypot(p[0] - border[0], p[1] - border[1], p[2] - border[2]), 0) / borderSamples.length;
    borderTol = clamp(avgDist * 1.45 + 22, 26, 56);
  }
  return {c, w, h, d, W, H, border, borderTol};
}

const isBgPixel = (px, r, g, b, a) => {
  if (a < 128) return true;
  if (!px.border) return false;
  return Math.hypot(r - px.border[0], g - px.border[1], b - px.border[2]) < px.borderTol;
};

// dominant color of a normalized box: center-weighted, background-rejected, with chromatic cluster preservation
function dominant(px, box, {skipBorder = true, satWeight = 2.6, centerWeight = true} = {}) {
  const x0 = Math.floor(clamp(box.x, 0, 1) * px.w), y0 = Math.floor(clamp(box.y, 0, 1) * px.h);
  const x1 = Math.max(x0 + 1, Math.ceil(clamp(box.x + box.w, 0, 1) * px.w)), y1 = Math.max(y0 + 1, Math.ceil(clamp(box.y + box.h, 0, 1) * px.h));
  const bw = x1 - x0, bh = y1 - y0, n = Math.max(1, bw * bh), step = Math.max(1, Math.floor(Math.sqrt(n / 6000)));
  const bins = new Map(), chromBins = new Map();
  let totalW = 0, chromW = 0;
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * px.w + x) * 4, a = px.d[i + 3];
    if (a < 128) continue;
    const r = px.d[i], g = px.d[i + 1], b = px.d[i + 2];
    if (skipBorder && isBgPixel(px, r, g, b, a)) continue;
    const [, s, l] = hsl([r, g, b]);
    // de-emphasize extreme specular glare and deep shadow crevices so true surface paint/fabric wins
    const specPenalty = (l > .95 && s < .15) ? .25 : (l < .06) ? .35 : 1;
    const cx = (x - x0) / bw - .5, cy = (y - y0) / bh - .5;
    const cw = centerWeight ? Math.max(.2, 1 - 1.6 * (cx * cx + cy * cy)) : 1;
    const wt = cw * specPenalty * (1 + satWeight * s);
    const k = (r >> 4) << 8 | (g >> 4) << 4 | (b >> 4);
    const bin = bins.get(k) || {w:0, r:0, g:0, b:0};
    bin.w += wt; bin.r += r * wt; bin.g += g * wt; bin.b += b * wt; bins.set(k, bin);
    totalW += wt;
    if (s > .20 && l > .10 && l < .90) {
      const cb = chromBins.get(k) || {w:0, r:0, g:0, b:0};
      const cwt = wt * (1 + s * 2);
      cb.w += cwt; cb.r += r * cwt; cb.g += g * cwt; cb.b += b * cwt; chromBins.set(k, cb);
      chromW += wt;
    }
  }
  if (!bins.size) return skipBorder ? dominant(px, box, {skipBorder:false, satWeight, centerWeight}) : null;
  // If at least 16% of the subject has clear chromatic color, pick from chromatic clusters so neutral shadows/glass don't wash out the color
  const pool = (chromW > totalW * .16 && chromBins.size) ? chromBins : bins;
  let best = null, bestScore = -1;
  pool.forEach((b, k) => {
    let w = b.w, rr = b.r, gg = b.g, bb = b.b;
    const r = k >> 8, g = k >> 4 & 15, bl = k & 15;
    for (let dr = -1; dr <= 1; dr++) for (let dg = -1; dg <= 1; dg++) for (let db = -1; db <= 1; db++) {
      if (!dr && !dg && !db) continue;
      const nb = pool.get((r + dr) << 8 | (g + dg) << 4 | (bl + db));
      if (nb) { w += nb.w * .65; rr += nb.r * .65; gg += nb.g * .65; bb += nb.b * .65; }
    }
    if (w > bestScore) { bestScore = w; best = {w, r:rr, g:gg, b:bb}; }
  });
  const rgb = [best.r / best.w, best.g / best.w, best.b / best.w];
  return {rgb, hex:toHex(rgb), name:colorName(rgb)};
}

const sub = (b, x, y, w, h) => ({x:clamp(b.x + b.w * x, 0, 1), y:clamp(b.y + b.h * y, 0, 1), w:clamp(b.w * w, .01, 1), h:clamp(b.h * h, .01, 1)});
const inside = (p, b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
function iou(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const inter = w * h, union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}
function overlap(a, b) {
  const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return w * h / Math.min(a.w * a.h || 1, b.w * b.h || 1);
}

// Connected-component foreground island detector for studio products/objects not covered by COCO's 80 classes
function findForegroundIslands(px) {
  const gw = 72, gh = 72, mask = new Uint8Array(gw * gh), labels = new Int32Array(gw * gh);
  let fgCount = 0;
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    const x = Math.min(px.w - 1, Math.floor((gx + .5) * px.w / gw)), y = Math.min(px.h - 1, Math.floor((gy + .5) * px.h / gh));
    const i = (y * px.w + x) * 4;
    if (!isBgPixel(px, px.d[i], px.d[i + 1], px.d[i + 2], px.d[i + 3])) { mask[gy * gw + gx] = 1; fgCount++; }
  }
  if (fgCount < gw * gh * .015 || fgCount > gw * gh * .88) return [];
  const islands = [];
  let nextId = 1;
  const q = new Int32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    if (!mask[i] || labels[i]) continue;
    const id = nextId++;
    let head = 0, tail = 0, minX = gw, minY = gh, maxX = 0, maxY = 0, count = 0;
    q[tail++] = i; labels[i] = id;
    while (head < tail) {
      const cur = q[head++], cy = Math.floor(cur / gw), cx = cur % gw;
      count++;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < gw && ny >= 0 && ny < gh) {
          const ni = ny * gw + nx;
          if (mask[ni] && !labels[ni]) { labels[ni] = id; q[tail++] = ni; }
        }
      }
    }
    const areaFrac = count / (gw * gh);
    if (areaFrac >= .016) {
      const bx = Math.max(0, (minX - 1) / gw), by = Math.max(0, (minY - 1) / gh);
      const bw = Math.min(1 - bx, (maxX - minX + 3) / gw), bh = Math.min(1 - by, (maxY - minY + 3) / gh);
      if (bw * bh >= .02 && bw < .96 && bh < .96) islands.push({cls:'product', type:'product', score:.52, box:{x:bx, y:by, w:bw, h:bh}, area:bw * bh, fromIsland:true});
    }
  }
  return islands.sort((a, b) => b.area - a.area).slice(0, 6);
}

/* ---------- position, pose & angle estimators ---------- */
function posInfo(b) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, area = b.w * b.h;
  const horiz = cx < .28 ? 'on the far left' : cx < .43 ? 'on the left' : cx > .72 ? 'on the far right' : cx > .57 ? 'on the right' : 'in the center';
  const depth = area > .32 || (b.y + b.h > .92 && b.h > .5) ? 'foreground' : area < .08 && cy < .48 ? 'background' : 'mid-ground';
  return {horiz, depth, cx, cy};
}

function personPoseAndAngle(b, face, px) {
  const ar = (b.w * px.W) / Math.max(1, b.h * px.H);
  let framing;
  if (face && face.box.h / b.h > .36) framing = 'close-up portrait';
  else if (b.h < .45) framing = 'head-and-shoulders close-up';
  else if (b.h < .66) framing = 'medium waist-up pose';
  else if (ar > .62 && b.h < .78) framing = 'seated or crouched pose';
  else if (b.h < .82 && b.y + b.h < .95) framing = 'three-quarter standing pose';
  else framing = 'full-body standing pose';

  let facing = 'front-facing', viewCode = 'front', headTilt = '';
  if (face && face.pts && face.pts.length >= 68) {
    const nose = face.pts[30], jawL = face.pts[2], jawR = face.pts[14], eyeL = face.pts[36], eyeR = face.pts[45];
    const span = Math.max(1e-4, jawR[0] - jawL[0]);
    const ratio = (nose[0] - jawL[0]) / span; // 0.5 = symmetric front; <0.5 = turned toward image-left (subject's right)
    if (ratio < .24) { facing = 'right side profile'; viewCode = 'right'; }
    else if (ratio < .39) { facing = 'three-quarter angle facing camera-left'; viewCode = 'three-quarter'; }
    else if (ratio > .76) { facing = 'left side profile'; viewCode = 'left'; }
    else if (ratio > .61) { facing = 'three-quarter angle facing camera-right'; viewCode = 'three-quarter'; }
    else { facing = 'front-facing at camera'; viewCode = 'front'; }
    const tiltDeg = Math.atan2((eyeR[1] - eyeL[1]) * px.H, (eyeR[0] - eyeL[0]) * px.W) * 180 / Math.PI;
    if (Math.abs(tiltDeg) > 7) headTilt = `, head tilted ${Math.round(Math.abs(tiltDeg))}°`;
  } else {
    facing = ar < .36 ? 'side profile pose' : 'back or angled view';
    viewCode = ar < .36 ? 'left' : 'back';
  }
  return {framing, facing: facing + headTilt, viewCode};
}

function objectAngleAndSurface(b, t, px) {
  const ar = (b.w * px.W) / Math.max(1, b.h * px.H);
  const x0 = Math.floor(clamp(b.x, 0, 1) * px.w), y0 = Math.floor(clamp(b.y, 0, 1) * px.h);
  const x1 = Math.max(x0 + 2, Math.ceil(clamp(b.x + b.w, 0, 1) * px.w)), y1 = Math.max(y0 + 2, Math.ceil(clamp(b.y + b.h, 0, 1) * px.h));
  const xm = Math.floor((x0 + x1) / 2);
  let lMass = 0, rMass = 0, symDiff = 0, symCount = 0, hiSpec = 0, tot = 0;
  const bw = x1 - x0;
  for (let y = y0; y < y1; y += 2) {
    for (let dx = 0; dx < Math.floor(bw / 2); dx += 2) {
      const il = (y * px.w + (x0 + dx)) * 4, ir = (y * px.w + (x1 - 1 - dx)) * 4;
      const al = !isBgPixel(px, px.d[il], px.d[il + 1], px.d[il + 2], px.d[il + 3]);
      const ar2 = !isBgPixel(px, px.d[ir], px.d[ir + 1], px.d[ir + 2], px.d[ir + 3]);
      if (al) lMass++;
      if (ar2) rMass++;
      const ll = (px.d[il] + px.d[il + 1] + px.d[il + 2]) / 3, lr = (px.d[ir] + px.d[ir + 1] + px.d[ir + 2]) / 3;
      symDiff += Math.abs(ll - lr); symCount++;
      if (ll > 235 || lr > 235) hiSpec++;
      tot += 2;
    }
  }
  const sym = 1 - (symCount ? symDiff / (symCount * 255) : 0);
  const leftHeavy = lMass > rMass * 1.12, rightHeavy = rMass > lMass * 1.12;
  const finish = (hiSpec / Math.max(1, tot)) > .07 ? 'glossy reflective finish' : sym < .72 ? 'textured surface' : 'smooth matte finish';
  const cy = b.y + b.h / 2;
  const elev = cy > .58 ? 'slightly high tabletop angle' : cy < .40 ? 'low-angle hero perspective' : 'eye-level perspective';

  let angleText, viewCode = 'front';
  if (t === 'car' || t === 'vehicle') {
    if (ar > 2.0) { angleText = `${leftHeavy ? 'left' : 'right'} side profile view, ${elev}`; viewCode = leftHeavy ? 'left' : 'right'; }
    else if (ar > 1.42 || leftHeavy || rightHeavy) { angleText = `three-quarter ${leftHeavy ? 'front-left' : 'front-right'} angle, ${elev}`; viewCode = 'three-quarter'; }
    else { angleText = `straight-on front view, ${elev}`; viewCode = 'front'; }
  } else if (t === 'phone') {
    if (ar < .62) { angleText = `upright ${sym > .84 ? 'front/back view' : 'angled three-quarter view'}, ${elev}`; viewCode = sym > .84 ? 'front' : 'three-quarter'; }
    else { angleText = `flat-lay / angled product view, ${elev}`; viewCode = 'top'; }
  } else {
    if (sym > .85 && !leftHeavy && !rightHeavy) { angleText = `straight-on front view, ${elev}`; viewCode = 'front'; }
    else if (leftHeavy) { angleText = `three-quarter front-left angle, ${elev}`; viewCode = 'three-quarter'; }
    else if (rightHeavy) { angleText = `three-quarter front-right angle, ${elev}`; viewCode = 'three-quarter'; }
    else { angleText = `three-quarter studio angle, ${elev}`; viewCode = 'three-quarter'; }
  }
  return {angleText, finish, viewCode};
}

/* ---------- main analyze pipeline ---------- */
async function analyze(img) {
  await init();
  const px = pixelGrid(img);
  const preds = await coco.detect(px.c, 25, .22);
  let faces = [];
  if (faceOK) {
    try {
      faces = (await faceapi.detectAllFaces(px.c, new faceapi.TinyFaceDetectorOptions({inputSize:416, scoreThreshold:.55})).withFaceLandmarks()).map(f => {
        const b = f.detection.box, P = f.landmarks.positions.map(p => [p.x / px.w, p.y / px.h]);
        return {box:{x:b.x / px.w, y:b.y / px.h, w:b.width / px.w, h:b.height / px.h}, score:f.detection.score, pts:P};
      });
    } catch (e) { console.warn('face detection failed', e); }
  }

  let objs = preds.map(p => ({cls:p.class, type:typeOf(p.class), score:p.score,
    box:{x:clamp(p.bbox[0] / px.w, 0, 1), y:clamp(p.bbox[1] / px.h, 0, 1), w:clamp(p.bbox[2] / px.w, .01, 1), h:clamp(p.bbox[3] / px.h, .01, 1)}}));
  objs.forEach(o => { o.area = o.box.w * o.box.h; });

  // Filter foreground detections; allow lower threshold for people/cars/phones/products so secondary subjects are counted
  const fg = objs.filter(o => !BACKGROUND.includes(o.cls) && (o.score >= .28 || (o.type === 'person' && o.score >= .22)));
  let main = (fg.length ? fg : objs).filter(o => o.area >= .012 || o === (fg.length ? fg : objs)[0]).sort((a, b) => b.score * Math.sqrt(b.area) - a.score * Math.sqrt(a.area));

  // Class-aware NMS so multiple distinct people/products stay separate while duplicate overlapping boxes are merged
  const kept = [];
  for (const o of main) {
    if (kept.some(k => k.type === o.type && (iou(o.box, k.box) > .55 || overlap(o.box, k.box) > .82))) continue;
    kept.push(o);
    if (kept.length >= 12) break;
  }
  main = kept;

  // Match each detected face to a person box; only synthesize a standalone person box if face score is high and not inside a non-person object
  const usedPersons = new Set();
  faces.forEach(f => {
    const fc = {x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2};
    const matchIdx = main.findIndex((o, idx) => o.type === 'person' && !usedPersons.has(idx) && inside(fc, o.box));
    if (matchIdx >= 0) {
      usedPersons.add(matchIdx);
      main[matchIdx]._face = f;
    } else if (f.score >= .65 && !main.some(o => o.type !== 'person' && inside(fc, o.box))) {
      const w = clamp(f.box.w * 3.1, .12, .75), h = clamp(Math.min(1 - Math.max(0, f.box.y - f.box.h * .35), f.box.h * 7.2), .22, .95);
      const bx = clamp(fc.x - w / 2, 0, 1 - w), by = clamp(f.box.y - f.box.h * .35, 0, 1 - h);
      main.push({cls:'person', type:'person', score:f.score, box:{x:bx, y:by, w, h}, area:w * h, fromFace:true, _face:f});
    }
  });

  // Check foreground islands for studio products/objects not in COCO-SSD
  const islands = findForegroundIslands(px);
  if (!main.length && islands.length) {
    main = islands;
  } else if (islands.length > 1) {
    islands.forEach(isl => {
      if (!main.some(m => iou(isl.box, m.box) > .25 || overlap(isl.box, m.box) > .45)) {
        main.push(isl);
      }
    });
  }

  if (!main.length) main = [{cls:'product', type:'product', score:.5, box:{x:.14, y:.1, w:.72, h:.8}, area:.576}];

  // Sort left-to-right for consistent numbering (Person 1, Person 2, Product 1, etc.)
  main.sort((a, b) => (a.box.x + a.box.w / 2) - (b.box.x + b.box.w / 2));

  const counts = {};
  const subjects = main.slice(0, 12).map((o, idx) => describe(o, px, faces, idx, counts));
  const primary = subjects.reduce((a, s) => (s.box.w * s.box.h) > (a.box.w * a.box.h) ? s : a, subjects[0]);
  const view = primary?.viewCode || 'front';
  return {
    w:px.W, h:px.H, subjects, faces, view,
    personCount: subjects.filter(s => s.type === 'person').length,
    objectCount: subjects.filter(s => s.type !== 'person').length,
    image:dominant(px, {x:0, y:0, w:1, h:1}, {skipBorder:false})
  };
}

function describe(o, px, faces, idx = 0, counts = {}) {
  const b = o.box, t = o.type || 'object';
  counts[t] = (counts[t] || 0) + 1;
  const label = `${TYPE_TITLE[t] || 'Object'} ${counts[t]}`;
  const uiColor = SUBJ_PALETTE[idx % SUBJ_PALETTE.length];
  const pos = posInfo(b);
  const s = {
    type:t, cls:o.cls, label, score:+(o.score || .5).toFixed(2),
    box:b, boxes:[b], cm:HEIGHT[t] || 50,
    uiColor, position:pos.horiz, depth:pos.depth
  };

  if (t === 'person') {
    const face = o._face || faces.find(f => inside({x:f.box.x + f.box.w / 2, y:f.box.y + f.box.h / 2}, b));
    s.face = face ? {box:face.box, pts:face.pts} : null;
    if (face) s.boxes = [b, face.box];
    const top = face ? (face.box.y + face.box.h * 1.22 - b.y) / b.h : .2;
    const R = {
      shirt:sub(b, .26, clamp(top, .12, .42), .48, .30),
      pants:sub(b, .28, .58, .44, .28),
      shoes:sub(b, .2, .91, .6, .09)
    };
    const parts = {};
    Object.entries(R).forEach(([k, r]) => { const c = dominant(px, r, {satWeight:2.2}); if (c) parts[k] = c; });
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
      parts.shirt && `${parts.shirt.name} top`,
      parts.pants && (b.h > .58 ? `${parts.pants.name} bottoms` : null),
      parts.shoes && (b.h > .76 ? `${parts.shoes.name} footwear` : null)
    ].filter(Boolean);
    s.desc = `${pa.framing} of a person ${pos.horiz} (${pos.depth}), ${pa.facing}${wear.length ? ', wearing ' + joinList(wear) : ''}`;
    s.detail = `${label}: ${s.desc}. Dominant outfit color: ${s.colorName} (${s.color}). Estimated height: ${s.cm} cm.`;
  } else {
    const inner = (t === 'car' || t === 'vehicle') ? sub(b, .12, .18, .76, .54) : sub(b, .12, .12, .76, .76);
    const c = dominant(px, inner, {satWeight:2.8, centerWeight:true});
    const sec = dominant(px, sub(b, .25, .55, .5, .35), {satWeight:1.5, centerWeight:false});
    s.color = c?.hex || '#e85d2b';
    s.colorName = c?.name || 'neutral';
    const oa = objectAngleAndSurface(b, t, px);
    s.angle = oa.angleText;
    s.finish = oa.finish;
    s.viewCode = oa.viewCode;
    const itemName = (o.cls && o.cls !== 'subject' && o.cls !== 'product') ? o.cls : NOUN[t] || 'object';
    const secNote = (sec && sec.name !== s.colorName) ? ` with ${sec.name} accents` : '';
    s.desc = `${s.colorName} ${itemName}${secNote} ${pos.horiz} (${pos.depth}), ${oa.angleText}, ${oa.finish}`;
    s.detail = `${label}: ${s.desc}. Primary color: ${s.colorName} (${s.color}). Approx size: ${s.cm} cm.`;
  }
  return s;
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
  return det;
}

const joinList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ---------- what is at a pointed spot (focus point detail) ---------- */
const LM = [['right eye', 36, 41], ['left eye', 42, 47], ['right eyebrow', 17, 21], ['left eyebrow', 22, 26], ['nose', 27, 35], ['mouth and lips', 48, 67], ['chin', 6, 10]];
function pointInfo(det, x, y) {
  if (!det) return null;
  const p = {x, y}, hits = det.subjects.map((s, i) => ({s, i})).filter(h => inside(p, h.s.box)).sort((a, b) => a.s.box.w * a.s.box.h - b.s.box.w * b.s.box.h);
  const h = hits[0];
  const spotCol = det._px ? dominant(det._px, {x:clamp(x - .03, 0, .94), y:clamp(y - .03, 0, .94), w:.06, h:.06}, {skipBorder:false, satWeight:1.8}) : null;
  if (!h) {
    return {
      index:-1, part:'background', sizeCm:null,
      colorName:spotCol?.name || null, color:spotCol?.hex || null,
      where:`background at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`,
      fullDetail:`Background area (${spotCol ? spotCol.name + ', ' : ''}${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top).`
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
      if (ry > .55 && (rx < .34 || rx > .66)) { part = `${iside} wheel and rim`; sizeCm = 65; }
      else if (ry < .42) { part = rx < .5 ? 'side window and A-pillar' : 'rear side window and roofline'; sizeCm = 60; }
      else if (ry > .82) { part = 'lower side skirt'; sizeCm = 40; }
      else { part = rx < .2 || rx > .8 ? `${iside} bumper fender` : 'side door panel'; sizeCm = 80; }
    } else {
      if (ry < .32) { part = rx > .28 && rx < .72 ? 'windshield glass' : 'roof pillar and mirror'; sizeCm = 95; }
      else if (ry < .62) { part = rx < .3 || rx > .7 ? `${side} headlight assembly` : 'front grille and emblem'; sizeCm = 35; }
      else if (ry > .72 && (rx < .26 || rx > .74)) { part = `front ${side} wheel`; sizeCm = 65; }
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
  init, analyze:analyzeKeep, retype, pointInfo, colorName, SUBJ_PALETTE,
  dominantOf:(img, box) => dominant(pixelGrid(img), box || {x:0, y:0, w:1, h:1})
};
})();
