/* VisionPilot — Video & 3D: rigged 3D models, poses, basic modeling & grouping, animation presets, keyframes + timeline, viewport export, prompts */
(() => {
const AC = window.AC; if (!AC) return;
const {S, $, rad, clamp, norm360, signed, rnd, cap, joinList, esc, escAttr, hooks} = AC;
const isVideo = () => S.app === 'video';
const is3D = () => isVideo();
const V = () => S.video;
const focusSt = () => S.focus;
let vpViewMode = 'orbit';

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
const bzCache = new WeakMap();
function easeFn(k) {
  if (k.e === 'custom' && Array.isArray(k.bz)) { let f = bzCache.get(k.bz); if (!f) { f = cubicBezier(...k.bz); bzCache.set(k.bz, f); } return f; }
  return (EASES[k.e] || EASES.easeInOut).f;
}
function setKeyEase(k, e) {
  if (e === 'custom' && !(k.e === 'custom' && k.bz)) k.bz = (BZ[k.e] || BZ.easeInOut).slice();
  k.e = e;
}
const easeClass = e => e === 'linear' ? '' : e === 'hold' ? 'hold' : 'ease';

/* ---------- objects, models, poses & grouping ---------- */
const MODELS = {
  person:'Person',
  car:'Car',
  phone:'Phone',
  cat:'Cat',
  animal:'Animal (Dog)',
  tree:'Tree',
  table:'Table',
  chair:'Chair',
  backdrop:'Backdrop',
  box:'Box (Cube)',
  sphere:'Sphere',
  cylinder:'Cylinder',
  cone:'Cone',
  torus:'Torus',
  capsule:'Capsule',
  pyramid:'Pyramid',
  tube:'Tube',
  disc:'Disc',
  plane:'Plane',
  platonic:'Platonic',
  image:'Image card',
  custom:'Uploaded 3D model',
  group:'Group'
};
const PERSON_POSES = {
  standing:{name:'Standing (Default)', prompt:'standing upright naturally'},
  walking_still:{name:'Walking', prompt:'walking toward the right in a natural stride'},
  running_still:{name:'Running', prompt:'running toward the right in an athletic sprint'},
  sitting_chair:{name:'Sitting on Chair', prompt:'seated comfortably on a chair with knees bent'},
  sitting_ground:{name:'Sitting on Ground', prompt:'sitting low on the ground'},
  crouch_prep:{name:'Jump Preparation Crouch', prompt:'crouched down with knees bent and arms pulled back preparing to jump'},
  jumping_pose:{name:'Mid-Air Jump Pose', prompt:'leaping in mid-air with arms raised and legs tucked'},
  waving:{name:'Waving Hand', prompt:'standing and raising one hand in a friendly wave'},
  arms_crossed:{name:'Arms Crossed', prompt:'standing confidently with arms folded across the chest'},
  pointing:{name:'Pointing Forward', prompt:'extending one arm forward pointing ahead'},
  thinking:{name:'Hand on Chin (Thinking)', prompt:'standing in a thoughtful pose with one hand raised to the chin'}
};
const CAT_POSES = {
  standing:{name:'Standing (Alert)', prompt:'standing alert on all four paws with tail raised'},
  walking_still:{name:'Walking', prompt:'walking toward the right in a graceful feline stride'},
  running_still:{name:'Running', prompt:'sprinting toward the right in a bounding feline run'},
  sitting:{name:'Sitting Upright', prompt:'sitting upright neatly on its hind legs'},
  sleeping:{name:'Curled Sleeping', prompt:'curled up low and resting peacefully'},
  stretching:{name:'Playful Stretch', prompt:'bowing its front paws down in a long feline stretch'},
  pouncing:{name:'Crouched / Pouncing', prompt:'crouched low and poised to pounce'},
  jumping:{name:'Jump (Mid-Air)', prompt:'leaping through the air with front paws stretched forward, hind legs extended back and tail streaming behind'}
};
const ANIMAL_POSES = {
  standing:{name:'Standing (Alert)', prompt:'standing alert on all four paws with tail raised'},
  walking_still:{name:'Walking', prompt:'walking toward the right in a natural four-legged stride'},
  running_still:{name:'Running', prompt:'galloping toward the right in an energetic sprint'},
  sitting:{name:'Sitting Upright', prompt:'sitting obediently on its hind legs'},
  sleeping:{name:'Lying / Sleeping', prompt:'resting low on the ground peacefully'},
  stretching:{name:'Playful Bow / Stretch', prompt:'bowing its front legs down in a playful stretch'},
  pouncing:{name:'Crouched / Ready to Leap', prompt:'crouched low and coiled to leap forward'},
  jumping:{name:'Jump (Mid-Air)', prompt:'leaping through the air with front legs reaching forward, hind legs extended back and tail streaming behind'}
};
const CAR_POSES = {
  standing:{name:'Parked (Default)', prompt:'parked level on all four wheels'},
  jumping:{name:'Jump (Airborne)', prompt:'airborne in a stunt jump with the nose raised, wheels hanging loose and suspension fully extended'}
};
const isRiggedChar = m => m === 'person' || m === 'cat' || m === 'animal';
const hasPoseModel = m => isRiggedChar(m) || m === 'car';
const poseMapFor = m => m === 'person' ? PERSON_POSES : m === 'cat' ? CAT_POSES : m === 'animal' ? ANIMAL_POSES : m === 'car' ? CAR_POSES : null;
// jump poses lift the object off the ground (so choosing them from the dropdown / right-click menu looks right immediately)
const JUMP_POSES = new Set(['jumping_pose', 'jumping', 'leaping']);
function applyPoseSideEffects(o) {
  if (!o) return;
  if (isRiggedChar(o.model) && (o.pose === 'walking_still' || o.pose === 'running_still')) o.ry = 90;
  if (JUMP_POSES.has(o.pose) && (o.y || 0) < .05) o.y = rnd(Math.max(.28, (o.h || 1) * (o.model === 'person' ? .28 : o.model === 'car' ? .55 : .7)), 2);
  else if (!JUMP_POSES.has(o.pose) && o.model !== 'person' && (o.y || 0) > .05 && o._poseLift) o.y = 0;
  o._poseLift = JUMP_POSES.has(o.pose);
}
const PALETTE = ['#e85d2b', '#3f7cf6', '#3fb950', '#d4a72c', '#a371f7', '#e5484d', '#2bb3c0', '#c8c8c8'];
let oid = 0;
function modelFor(s) {
  if (s.model3d && MODELS[s.model3d]) return s.model3d;
  if (s.type === 'person') return 'person';
  const d = `${s.label || ''} ${s.desc || ''} ${s.cocoClass || ''}`.toLowerCase();
  if (/\b(cat|kitten|feline)\b/.test(d)) return 'cat';
  if (/\b(chair|armchair|stool|couch|sofa|bench|seat)\b/.test(d)) return 'chair';
  if (/\b(table|desk|dining table|counter)\b/.test(d)) return 'table';
  if (/\b(tree|plant|potted plant|palm|bush)\b/.test(d)) return 'tree';
  if (/\b(backdrop|curtain|wall|background)\b/.test(d)) return 'backdrop';
  if (s.type === 'car' || s.type === 'vehicle' || /\b(car|sedan|suv|truck|bus|van)\b/.test(d)) return 'car';
  if (s.type === 'phone' || /\b(phone|mobile|smartphone|iphone|pixel|galaxy)\b/.test(d)) return 'phone';
  if (s.type === 'animal' || /\b(dog|horse|bird|bear|sheep|cow)\b/.test(d)) return 'animal';
  if (s.type === 'product' || s.type === 'object') return 'box';
  return 'capsule';
}
function defaultHeightFor(model) {
  return {person:1.75, car:1.15, phone:.16, cat:.34, animal:.65, tree:2.4, table:.78, chair:.86, backdrop:2.6,
    box:.6, sphere:.6, cylinder:.7, cone:.7, torus:.55, capsule:.65, pyramid:.7, tube:.6, disc:.08, plane:.04, platonic:.6, image:1.2, group:1.0}[model] || .6;
}
function widthFor(model, h) {
  return {person:Math.max(.34, h * .29), car:Math.max(1.5, h * 2.25), phone:h * .48, cat:Math.max(.26, h * 1.35), animal:h * 1.45,
    tree:h * .68, table:h * 1.55, chair:h * .58, backdrop:h * 1.15, box:h * .85, sphere:h, cylinder:h * .55, cone:h * .65,
    torus:h, capsule:h * .45, pyramid:h * .85, tube:h * .75, disc:h * 6, plane:h * 25, platonic:h, image:h * .75, group:h}[model] || h * .65;
}
function depthFor(o) {
  const m = o.model, w = o.w, h = o.h;
  return {person:.32, car:w * .44, phone:.014, cat:w * .38, animal:w * .42, tree:w, table:w * .65, chair:w * .95,
    backdrop:Math.max(h * .92, w * .82), sphere:w, cylinder:w, cone:w, torus:h * .28, capsule:w, pyramid:w, tube:w, disc:w, plane:w, platonic:w,
    image:.02, box:w * .85, group:w}[m] ?? w * .75;
}
function newObject(model, label, h, extra = {}) {
  h = h || defaultHeightFor(model);
  const list = V().objects || [];
  return {id:'o' + Date.now().toString(36) + (++oid), label, model, h:rnd(h, 3), w:rnd(widthFor(model, h), 3),
    sx:1, sy:1, sz:1,
    color:model === 'backdrop' ? '#dcdedf' : PALETTE[list.length % PALETTE.length], x:0, z:0, y:0, ry:0, img:-1, auto:false,
    pose:hasPoseModel(model) ? 'standing' : '', children:null, ...extra};
}

let sel = null, userDeselected = false;
const selSet = new Set();
function selectObj(id, multi = false) {
  if (!id) { sel = null; selSet.clear(); userDeselected = true; return; }
  userDeselected = false;
  if (id === 'camera') { sel = 'camera'; selSet.clear(); return; }
  if (multi) {
    if (selSet.has(id)) {
      selSet.delete(id);
      if (sel === id) sel = [...selSet][0] || null;
    } else {
      if (sel && sel !== 'camera') selSet.add(sel);
      selSet.add(id);
      sel = id;
    }
  } else {
    sel = id;
    selSet.clear();
    selSet.add(id);
  }
}
function isObjSelected(id) {
  return sel === id || selSet.has(id);
}
let gizmoMode = 'move', hoverGizmoAxis = null;

function parseScale3d(s, m) {
  const raw = typeof s.scale3d === 'number' ? s.scale3d : (s.scale3d && typeof s.scale3d.h === 'number' ? s.scale3d.h : null);
  const fallback = (s.cm || AC.SUBJ[s.type]?.cm || defaultHeightFor(m) * 100) / 100;
  const val = isFinite(raw) && raw > 0 ? raw : (isFinite(fallback) && fallback > 0 ? fallback : defaultHeightFor(m));
  return rnd(clamp(val, .05, 25), 3);
}
function parsePos3d(s) {
  if (!s.pos3d) return null;
  if (Array.isArray(s.pos3d)) {
    const [x, y, z] = s.pos3d;
    return {x:isFinite(x) ? rnd(x, 2) : 0, y:isFinite(y) ? rnd(y, 2) : 0, z:isFinite(z) ? rnd(z, 2) : 0};
  }
  if (typeof s.pos3d === 'object') {
    return {
      x:isFinite(s.pos3d.x) ? rnd(s.pos3d.x, 2) : 0,
      y:isFinite(s.pos3d.y) ? rnd(s.pos3d.y, 2) : 0,
      z:isFinite(s.pos3d.z) ? rnd(s.pos3d.z, 2) : 0
    };
  }
  return null;
}
function sanitizeObjects(objs) {
  if (!Array.isArray(objs)) return;
  objs.forEach(o => {
    if (!isFinite(o.h) || o.h <= 0) o.h = defaultHeightFor(o.model);
    if (!isFinite(o.w) || o.w <= 0) o.w = rnd(widthFor(o.model, o.h), 3);
    if (!isFinite(o.sx) || o.sx <= 0) o.sx = 1;
    if (!isFinite(o.sy) || o.sy <= 0) o.sy = 1;
    if (!isFinite(o.sz) || o.sz <= 0) o.sz = 1;
    if (!isFinite(o.x)) o.x = 0;
    if (!isFinite(o.y) || o.y < 0) o.y = 0;
    if (!isFinite(o.z)) o.z = 0;
    if (!isFinite(o.ry)) o.ry = 0;
    if (hasPoseModel(o.model) && !o.pose) o.pose = 'standing';
  });
}

// Find a chair that a person is placed in front of and aligned with
function findAlignedChairForPerson(o) {
  if (!o || o.model !== 'person') return null;
  const chairs = (V().objects || []).filter(c => c.id !== o.id && c.model === 'chair');
  let best = null, bestDist = 1e9;
  for (const ch of chairs) {
    const dx = (o.x || 0) - (ch.x || 0), dz = (o.z || 0) - (ch.z || 0);
    const ang = -rad(ch.ry || 0);
    const localX = dx * Math.cos(ang) - dz * Math.sin(ang);
    const localZ = dx * Math.sin(ang) + dz * Math.cos(ang);
    const D = depthFor(ch), W = ch.w || .5;
    if (Math.abs(localX) <= W * .68 && localZ >= -D * .48 && localZ <= D * .88) {
      const d = Math.hypot(localX, localZ);
      if (d < bestDist) { bestDist = d; best = {chair:ch, localX, localZ, D, W}; }
    }
  }
  return best;
}
function checkAutoSitOnChair(o, snapXZ = false) {
  if (!o || o.model !== 'person') return false;
  const aligned = findAlignedChairForPerson(o);
  if (aligned && (o.y || 0) <= (aligned.chair.h || .86) * .75) {
    const {chair, localX, D, W} = aligned;
    o.pose = 'sitting_chair';
    o._autoSatChairId = chair.id;
    o.ry = chair.ry || 0;
    if (snapXZ) {
      const sx = clamp(localX, -W * .12, W * .12);
      const sz = -D * .12;
      const ang = rad(chair.ry || 0);
      o.x = rnd((chair.x || 0) + sx * Math.cos(ang) - sz * Math.sin(ang), 3);
      o.z = rnd((chair.z || 0) + sx * Math.sin(ang) + sz * Math.cos(ang), 3);
    }
    return true;
  } else if (o._autoSatChairId) {
    delete o._autoSatChairId;
    if (!o.userPosed && o.pose === 'sitting_chair') o.pose = 'standing';
  }
  return false;
}

function syncObjectsFromSubjectsFor(targetState) {
  if (!targetState) return;
  const objs = targetState.objects || (targetState.objects = []);
  sanitizeObjects(objs);
  // If reference images are currently loading/detecting and have no subjects yet, keep existing objects until detection completes
  if (AC.refs.length && AC.refs.some(r => r.status === 'wait' || r.status === 'busy') && AC.refs.every(r => !r.subjects?.length) && objs.length) {
    return;
  }
  const subs = AC.allSubjects();
  const match = computeImageMatch();
  const matchItems = new Map((match?.items || []).map(i => [i.key, i]));
  const desiredAutos = [];
  subs.forEach(s => {
    const m = modelFor(s), h = parseScale3d(s, m), w = rnd(widthFor(m, h), 3);
    const lbl = s.name3d || s.label;
    const mi = matchItems.get(s.key);
    const pos = parsePos3d(s) || (mi ? {x:mi.x, y:0, z:mi.z} : null);
    const pose = isRiggedChar(m) ? 'standing' : '';
    desiredAutos.push({
      label:lbl, model:m, h, w, img:s.img ?? -1,
      color:s.color || null, parts:s.parts || null,
      pose, pos, ry:0, desc:s.desc || ''
    });
    // If a person was detected sitting on a chair and no separate chair subject exists near them, add a Chair right under them
    if (m === 'person' && s.seatedOnChair && !subs.some(other => other !== s && modelFor(other) === 'chair')) {
      const chairIdx = desiredAutos.filter(x => x.model === 'chair').length + 1;
      const chairPos = pos ? {x:pos.x, y:0, z:rnd(pos.z - .06, 2)} : {x:0, y:0, z:-.06};
      desiredAutos.push({
        label:`Chair ${chairIdx}`, model:'chair', h:.86, w:rnd(widthFor('chair', .86), 3),
        img:s.img ?? -1, color:'#7a5638', parts:null, pose:'', pos:chairPos,
        desc:'chair beneath seated person'
      });
    }
  });

  const manuals = objs.filter(o => !o.auto);
  const oldAutos = objs.filter(o => o.auto);
  const usedOld = new Set();
  const nextAutos = desiredAutos.map((d, idx) => {
    let ex = oldAutos.find(o => !usedOld.has(o) && o.label === d.label);
    if (!ex && idx < oldAutos.length && !usedOld.has(oldAutos[idx])) ex = oldAutos[idx];
    if (ex) {
      usedOld.add(ex);
      const oldLabel = ex.label;
      const changedSource = ex.img !== d.img || ex.model !== d.model;
      if (changedSource) { ex.userMoved = false; ex.userPosed = false; }
      ex.label = d.label;
      ex.img = d.img;
      ex.model = d.model;
      ex.h = d.h;
      ex.w = d.w;
      if (d.color) ex.color = d.color;
      ex.parts = d.parts || null;
      if (d.pose && !ex.userPosed) ex.pose = d.pose;
      if (d.pos && !ex.userMoved) {
        ex.x = d.pos.x; ex.y = d.pos.y; ex.z = d.pos.z; ex.placed = true;
        if (isFinite(d.ry)) ex.ry = d.ry;
      }
      if (d.desc) {
        ex.subjDesc = d.desc;
        if (targetState.subjDetails && !targetState.subjDetails[ex.id]) targetState.subjDetails[ex.id] = d.desc;
      }
      if (oldLabel !== ex.label) {
        if (S.focus.target === oldLabel) S.focus.target = ex.label;
        if (targetState.focus?.target === oldLabel) targetState.focus.target = ex.label;
        if (Array.isArray(targetState.focus?.targets)) targetState.focus.targets = targetState.focus.targets.map(t => t === oldLabel ? ex.label : t);
        if (targetState.tracks?.focus) targetState.tracks.focus.forEach(kf => { if (kf.v === oldLabel) kf.v = ex.label; });
      }
      return ex;
    }
    const posExtra = d.pos ? {x:d.pos.x, y:d.pos.y, z:d.pos.z, placed:true, ry:d.ry || 0} : {};
    const created = newObject(d.model, d.label, d.h, {
      auto:true, img:d.img,
      color:d.color || (!AC.refs.length && S.subjColor ? S.subjColor : PALETTE[(manuals.length + idx) % PALETTE.length]),
      parts:d.parts || null,
      pose:d.pose,
      subjDesc:d.desc || '',
      ...posExtra
    });
    if (d.desc && targetState.subjDetails && !targetState.subjDetails[created.id]) {
      targetState.subjDetails[created.id] = d.desc;
    }
    return created;
  });

  targetState.objects = [...manuals, ...nextAutos];
  layoutAutoFor(targetState);
  sanitizeObjects(targetState.objects);
  // Keep the 3D camera at its default position and angle when reference images are uploaded (do not auto-change camera angle or pose)
}
/* ---------- reference image -> 3D scene: camera angle, subject placement, facing and size ---------- */
const ASPECT_PRESETS = [['1:1', 1], ['4:5', .8], ['3:4', .75], ['2:3', 2 / 3], ['3:2', 1.5], ['16:9', 16 / 9], ['9:16', 9 / 16], ['6:5', 1.2], ['21:9', 21 / 9]];
// camera azimuth (deg) that reproduces how this subject is turned in the photo (+ = camera swings to the subject's left, - = to its right)
function viewAz(s) {
  const code = s.viewCode || 'front', txt = String(s.angle || s.facing || '').toLowerCase();
  const left = /left/.test(txt) && !/right/.test(txt), right = /right/.test(txt) && !/left/.test(txt);
  if (code === 'left') return 90;
  if (code === 'right') return -90;
  if (code === 'back') return 180;
  if (code === 'three-quarter') return left ? 38 : right ? -38 : 30;
  return 0;
}
// camera elevation (deg): explicit wording from the detector first, otherwise where the subject sits in the frame (level camera assumption)
function viewEl(s, k) {
  const txt = String(s.angle || '').toLowerCase();
  if (/top-down|bird/.test(txt)) return 70;
  if (/high-angle|elevated|from above|looking down/.test(txt)) return 24;
  if (/low-angle|heroic|from below|looking up/.test(txt)) return -14;
  const cy = s.box.y + s.box.h / 2, base = /eye-level|straight-on/.test(txt) ? .4 : 1;
  return Math.round(clamp((cy - .5) * k.vfov * 1.1 * base, -14, 34));
}
function computeImageMatch() {
  const subs = AC.allSubjects().filter(s => s.box && AC.refs[s.img]?.img?.naturalWidth);
  if (!subs.length) return null;
  const area = s => s.box.w * s.box.h;
  const main = subs.reduce((a, s) => area(s) > area(a) ? s : a, subs[0]);
  const ref = AC.refs[main.img], imgAr = ref.img.naturalWidth / ref.img.naturalHeight, k = AC.calc();
  const az = viewAz(main), el = viewEl(main, k);
  const realH = s => parseScale3d(s, modelFor(s));
  const depthOf = s => clamp(realH(s) / Math.max(.1, s.box.h) * S.focal / k.sH, .6, 60);
  const dMain = depthOf(main), cxm = main.box.x + main.box.w / 2;
  const rx = Math.cos(rad(az)), rz = -Math.sin(rad(az)), lx = -Math.sin(rad(az)), lz = -Math.cos(rad(az));
  const items = subs.filter(s => s.img === main.img).map(s => {
    const d = clamp(depthOf(s), dMain * .35, dMain * 3);
    const lateral = (s.box.x + s.box.w / 2 - cxm) * (d * k.sH / S.focal) * imgAr, fwd = d - dMain;
    let ry = norm360(az - viewAz(s) + 180) - 180;
    if (s === main) ry = 0;
    return {key:s.key, x:rnd(lateral * rx + fwd * lx, 2), z:rnd(lateral * rz + fwd * lz, 2), ry:rnd(ry, 0), main:s === main};
  });
  const near = ASPECT_PRESETS.reduce((a, p) => Math.abs(p[1] - imgAr) < Math.abs(a[1] - imgAr) ? p : a, ASPECT_PRESETS[0]);
  const aspect = Math.abs(near[1] - imgAr) / imgAr < .03 ? {aspect:near[0], custom:''} : {aspect:'custom', custom:`${Math.round(imgAr * 100)}:100`};
  return {az, el, dist:rnd(dMain, 2), aspect, items, mainLabel:main.name3d || main.label, imgAr};
}
function applyCameraMatch(m) {
  if (!m) return false;
  AC.setAz(m.az); AC.setEl(m.el); AC.setDist(m.dist);
  S.aspect = m.aspect.aspect; S.aspectCustom = m.aspect.custom;
  S.roll = 0;
  return true;
}

function syncObjectsFromSubjects() {
  syncObjectsFromSubjectsFor(V());
  if (!userDeselected && !V().objects.find(o => o.id === sel)) selectObj(V().objects[0]?.id || null);
}
function layoutAutoFor(targetState) {
  const autos = (targetState.objects || []).filter(o => o.auto && !o.placed);
  if (!autos.length) return;
  const gap = .35, total = autos.reduce((a, o) => a + o.w, 0) + gap * (autos.length - 1);
  let x = -total / 2;
  autos.forEach(o => { o.x = rnd(x + o.w / 2, 3); x += o.w + gap; o.placed = true; });
}
hooks.subjColorChanged = c => {
  const a = V().objects.find(o => o.auto) || objById(sel);
  if (a) { a.color = c; if (a.parts?.shirt) a.parts = {...a.parts, shirt:c}; }
};
hooks.subjTypeChanged = () => {
  if (!is3D()) return;
  syncObjectsFromSubjects();
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); buildTimeline(); renderVP();
};
const objById = id => V().objects.find(o => o.id === id);
const objByLabel = l => V().objects.find(o => o.label === l);

/* ---------- Grouping, Copy, Paste, Delete, Bottom Slide-Up Editing Bar ---------- */
let clipboardObjs = [], editingObjId = null;
function cloneObjData(o) {
  return JSON.parse(JSON.stringify(o));
}
function openObjEditBar(id) {
  const o = objById(id || sel) || V().objects[0];
  if (!o) { AC.toast('Select or add a 3D object first'); return; }
  editingObjId = o.id;
  if (!isObjSelected(o.id)) {
    selectObj(o.id, false);
    renderObjects(); buildTimeline(); renderVP();
  }
  const bar = $('objEditBar'), ren = $('objEditRename'), det = $('objEditDetail');
  if (!bar) return;
  const dets = V().subjDetails || (V().subjDetails = {});
  if (ren) ren.value = o.label || '';
  if (det) det.value = dets[o.id] !== undefined ? dets[o.id] : (o.subjDesc || '');
  bar.hidden = false;
  bar.classList.add('open');
  setTimeout(() => { ren?.focus(); ren?.select?.(); }, 40);
}
function closeObjEditBar() {
  editingObjId = null;
  const bar = $('objEditBar');
  if (bar) bar.classList.remove('open');
}
function renderTlSubjDetail() {
  const pane = $('tlSubjDetail'), list = $('tlSubjDetailList'), lbl = $('tlSubjDetailLbl'), desc = $('tlSubjDetailDesc');
  if (!pane || !list) return;
  const objs = V().objects || [];
  if (!objs.length) {
    list.innerHTML = '<span class="hint">No 3D objects in scene yet.</span>';
    if (lbl) lbl.textContent = 'Subject Detail';
    if (desc) desc.value = '';
    return;
  }
  const active = (sel && sel !== 'camera' ? objById(sel) : null) || objs[0];
  const dets = V().subjDetails || (V().subjDetails = {});
  list.innerHTML = objs.map(x => `<button type="button" class="tog fsubj" data-tlsid="${escAttr(x.id)}" aria-pressed="${x.id === active.id}" style="--sc:${escAttr(x.color)}"><i class="sdot" style="background:${escAttr(x.color)}"></i><span>${esc(x.label)}${x.model === 'group' && x.children ? ` (${x.children.length})` : ''}</span></button>`).join('');
  if (lbl) lbl.textContent = `${active.label} — Subject Detail`;
  if (desc && document.activeElement !== desc) {
    desc.value = dets[active.id] !== undefined ? dets[active.id] : (active.subjDesc || '');
  }
}
function saveTlSubjDetail() {
  const objs = V().objects || [];
  const active = (sel && sel !== 'camera' ? objById(sel) : null) || objs[0];
  if (!active) return;
  const detVal = ($('tlSubjDetailDesc')?.value || '').trim();
  const dets = V().subjDetails || (V().subjDetails = {});
  dets[active.id] = detVal;
  active.subjDesc = detVal;
  AC.save(); AC.changed();
  AC.toast(`Saved Subject Detail for "${active.label}"`);
}
function saveObjEditBar() {
  const o = objById(editingObjId || sel);
  if (o) {
    const ren = $('objEditRename'), det = $('objEditDetail');
    const nextName = (ren?.value || '').trim();
    if (nextName && nextName !== o.label) {
      const old = o.label; o.label = nextName; o.auto = false;
      const fs = focusSt();
      if (fs.target === old) fs.target = o.label;
      if (Array.isArray(fs.targets)) fs.targets = fs.targets.map(t => t === old ? o.label : t);
      (tracks().focus || []).forEach(kf => { if (kf.v === old) kf.v = o.label; });
    }
    const detVal = (det?.value || '').trim();
    const dets = V().subjDetails || (V().subjDetails = {});
    dets[o.id] = detVal;
    o.subjDesc = detVal;
  }
  closeObjEditBar();
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); buildTimeline(); syncVideoFocus(); AC.save(); AC.changed();
  AC.toast('Saved name and subject detail');
}
function groupSelectedObjects(ids, customName) {
  const list = (ids || [...selSet]).map(objById).filter(Boolean);
  if (list.length < 2) { AC.toast('Hold Shift and select at least 2 objects to group'); return null; }
  const gCount = V().objects.filter(o => o.model === 'group').length + 1;
  const name = (customName || `Group ${gCount}`).trim() || `Group ${gCount}`;
  // Flatten any existing groups inside the selection so nested children stay clean
  const members = [];
  list.forEach(o => {
    if (o.model === 'group' && Array.isArray(o.children)) {
      o.children.forEach(ch => members.push({
        ...ch,
        x:rnd(o.x + (ch.dx || 0), 3),
        y:rnd(Math.max(0, o.y + (ch.dy || 0)), 3),
        z:rnd(o.z + (ch.dz || 0), 3),
        ry:rnd((o.ry || 0) + (ch.dry || 0), 1)
      }));
    } else {
      members.push(cloneObjData(o));
    }
  });
  const cx = rnd(members.reduce((a, m) => a + m.x, 0) / members.length, 3);
  const cz = rnd(members.reduce((a, m) => a + m.z, 0) / members.length, 3);
  const minY = Math.max(0, Math.min(...members.map(m => Math.max(0, m.y || 0))));
  const maxY = Math.max(...members.map(m => Math.max(0, m.y || 0) + m.h));
  const maxSpan = Math.max(.4, ...members.map(m => Math.hypot(m.x - cx, m.z - cz) * 2 + m.w));
  const children = members.map(m => ({
    ...m,
    dx:rnd(m.x - cx, 3),
    dy:rnd(Math.max(0, (m.y || 0) - minY), 3),
    dz:rnd(m.z - cz, 3),
    dry:rnd(m.ry || 0, 1)
  }));
  const grp = newObject('group', name, rnd(Math.max(.3, maxY - minY), 3), {
    w:rnd(maxSpan, 3), x:cx, y:rnd(minY, 3), z:cz, ry:0, placed:true, auto:false,
    color:members[0]?.color || PALETTE[0],
    children
  });
  const remIds = new Set(list.map(o => o.id));
  V().objects = V().objects.filter(o => !remIds.has(o.id));
  V().objects.push(grp);
  if (isVideo()) cleanTracks();
  selectObj(grp.id, false);
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); buildTimeline(); AC.save(); AC.changed();
  openObjEditBar(grp.id);
  return grp;
}
function mergeIntoGroup(sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const src = objById(sourceId), tgt = objById(targetId);
  if (!src || !tgt) return;
  if (tgt.model === 'group' && Array.isArray(tgt.children)) {
    const newChild = {
      ...cloneObjData(src),
      dx:rnd(src.x - tgt.x, 3),
      dy:rnd(Math.max(0, (src.y || 0) - (tgt.y || 0)), 3),
      dz:rnd(src.z - tgt.z, 3),
      dry:rnd((src.ry || 0) - (tgt.ry || 0), 1)
    };
    tgt.children.push(newChild);
    V().objects = V().objects.filter(o => o.id !== src.id);
    selectObj(tgt.id, false);
    objPropsKey = ''; vfOptsKey = '';
    renderObjects(); buildTimeline(); AC.save(); AC.changed();
    openObjEditBar(tgt.id);
  } else {
    groupSelectedObjects([targetId, sourceId]);
  }
}
function ungroupObject(id) {
  const g = objById(id || sel);
  if (!g || g.model !== 'group' || !Array.isArray(g.children) || !g.children.length) return;
  if (editingObjId === g.id) closeObjEditBar();
  const restored = g.children.map(ch => {
    const item = {
      ...cloneObjData(ch),
      id:'o' + Date.now().toString(36) + (++oid),
      x:rnd(g.x + (ch.dx || 0), 3),
      y:rnd(Math.max(0, (g.y || 0) + (ch.dy || 0)), 3),
      z:rnd(g.z + (ch.dz || 0), 3),
      ry:rnd((g.ry || 0) + (ch.dry || 0), 1),
      placed:true, auto:false
    };
    delete item.dx; delete item.dy; delete item.dz; delete item.dry;
    return item;
  });
  const idx = V().objects.indexOf(g);
  V().objects.splice(idx, 1, ...restored);
  if (isVideo()) cleanTracks();
  selSet.clear(); restored.forEach(r => selSet.add(r.id)); sel = restored[0]?.id || null;
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); buildTimeline(); AC.save(); AC.changed();
  AC.toast(`Ungrouped "${g.label}"`);
}
function deleteSelectedObjects(ids) {
  const targets = (ids?.length ? ids : selSet.size ? [...selSet] : sel && sel !== 'camera' ? [sel] : []).map(objById).filter(Boolean);
  if (!targets.length) return;
  const rem = new Set(targets.map(o => o.id));
  if (editingObjId && rem.has(editingObjId)) closeObjEditBar();
  V().objects = V().objects.filter(o => !rem.has(o.id));
  if (isVideo()) cleanTracks();
  selectObj(V().objects[0]?.id || null, false);
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); buildTimeline(); AC.save(); AC.changed();
  AC.toast(targets.length > 1 ? `Deleted ${targets.length} objects` : `${targets[0].label} deleted`);
}
function copySelectedObjects(ids) {
  const targets = (ids?.length ? ids : selSet.size ? [...selSet] : sel && sel !== 'camera' ? [sel] : []).map(objById).filter(Boolean);
  if (!targets.length) return;
  clipboardObjs = targets.map(cloneObjData);
  AC.toast(targets.length > 1 ? `Copied ${targets.length} objects` : `Copied "${targets[0].label}"`);
}
function pasteCopiedObjects() {
  if (!clipboardObjs.length) { AC.toast('Nothing copied yet'); return; }
  const created = clipboardObjs.map((src, i) => {
    const copy = cloneObjData(src);
    copy.id = 'o' + Date.now().toString(36) + (++oid);
    copy.label = `${src.label} copy`;
    copy.x = rnd((src.x || 0) + .45 * (i + 1), 3);
    copy.z = rnd((src.z || 0) + .25 * (i + 1), 3);
    copy.auto = false; copy.placed = true;
    V().objects.push(copy);
    return copy;
  });
  selSet.clear(); created.forEach(c => selSet.add(c.id)); sel = created[created.length - 1]?.id || null;
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); buildTimeline(); AC.save(); AC.changed();
  AC.toast(created.length > 1 ? `Pasted ${created.length} objects` : `Pasted "${created[0].label}"`);
}
function renameObjectModal(id) {
  openObjEditBar(id || sel);
}

/* ---------- animatable properties ---------- */
function props() {
  const fs = focusSt();
  const P = [
    {path:'cam.az', group:'Camera', name:'Orbit', kind:'angle', get:() => S.az, set:v => AC.setAz(v), fmt:v => Math.round(signed(v)) + '°'},
    {path:'cam.el', group:'Camera', name:'Tilt', kind:'num', get:() => S.el, set:v => AC.setEl(v), fmt:v => Math.round(v) + '°'},
    {path:'cam.dist', group:'Camera', name:'Distance', kind:'num', get:() => S.dist, set:v => AC.setDist(v), fmt:v => AC.mStr(v)},
    {path:'cam.roll', group:'Camera', name:'Dutch roll', kind:'num', get:() => S.roll, set:v => { S.roll = clamp(v, -45, 45); }, fmt:v => Math.round(v) + '°'},
    {path:'cam.focal', group:'Camera', name:'Focal length', kind:'num', get:() => S.focal, set:v => AC.setFocal(v), fmt:v => Math.round(v) + ' mm'},
    {path:'cam.sensor', group:'Camera', name:'Sensor size', kind:'num', get:() => S.sensorW, set:v => { S.sensorW = clamp(v, 1, 100); }, fmt:v => rnd(v, 1) + ' mm'},
    {path:'focus', group:'Focus', name:'Focus subject', kind:'target', get:() => fs.on ? fs.target : '', set:v => { fs.target = v; if (v) fs.on = true; }, fmt:v => v || 'Custom point'},
    ...['x', 'y', 'z'].map(a => ({path:'focus.' + a, group:'Focus', name:'Focus ' + a.toUpperCase(), kind:'num', get:() => fpos()[a], set:v => { fpos()[a] = v; }, fmt:v => rnd(v, 2) + ' m'}))
  ];
  V().objects.forEach(o => {
    const g = 'obj:' + o.id;
    const mk = (key, name, kind, fmt) => ({path:`obj.${o.id}.${key}`, group:g, name, kind, get:() => o[key] ?? (key.startsWith('s') ? 1 : 0), set:v => { o[key] = v; }, fmt});
    P.push(mk('x', 'Position X', 'num', v => rnd(v, 2) + ' m'), mk('z', 'Position Z', 'num', v => rnd(v, 2) + ' m'),
      mk('y', 'Lift Y', 'num', v => rnd(v, 2) + ' m'), mk('ry', 'Rotation', 'angle', v => Math.round(signed(v)) + '°'),
      mk('rx', 'Tilt (pitch)', 'num', v => Math.round(v ?? 0) + '°'), mk('rz', 'Roll (lean)', 'num', v => Math.round(v ?? 0) + '°'),
      mk('sx', 'Scale X', 'num', v => rnd(v ?? 1, 2) + '×'), mk('sy', 'Scale Y', 'num', v => rnd(v ?? 1, 2) + '×'), mk('sz', 'Scale Z', 'num', v => rnd(v ?? 1, 2) + '×'),
      mk('h', 'Height', 'num', v => rnd(v, 2) + ' m'), mk('w', 'Width', 'num', v => rnd(v, 2) + ' m'), mk('color', 'Color', 'color', v => v));
  });
  return P;
}
function fpos() {
  const fs = focusSt();
  if (!fs.pos || typeof fs.pos !== 'object' || Array.isArray(fs.pos)) {
    const arr = Array.isArray(fs.pos) ? fs.pos : [0, AC.calc().subjH / 2, 0];
    fs.pos = {x:arr[0] || 0, y:arr[1] ?? AC.calc().subjH / 2, z:arr[2] || 0};
  }
  return fs.pos;
}
const COMPOSITE = {'cam.pos':['cam.az', 'cam.el', 'cam.dist'], 'focus.pos':['focus.x', 'focus.y', 'focus.z']};
function compositeParts(path) {
  if (COMPOSITE[path]) return COMPOSITE[path];
  const m = /^obj\.([^.]+)\.scale$/.exec(path);
  if (m) return ['sx', 'sy', 'sz'].map(a => `obj.${m[1]}.${a}`);
  return null;
}
const groupName = g => g.startsWith('obj:') ? (objById(g.slice(4))?.label || 'Object') : g;
const tracks = () => S.video.tracks || (S.video.tracks = {});
function cleanTracks() {
  const live = new Set(props().map(p => p.path));
  Object.keys(tracks()).forEach(k => { if (!live.has(k) || !tracks()[k].length) delete tracks()[k]; });
}

/* ---------- interpolation ---------- */
const hexToRgb = h => { const n = parseInt(String(h).slice(1), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbToHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
function seg(keys, t) {
  if (t <= keys[0].t) return {a:keys[0], b:keys[0], e:0, i:0, u:0};
  const last = keys[keys.length - 1];
  if (t >= last.t) return {a:last, b:last, e:0, i:keys.length - 2, u:1};
  let i = 0; while (i < keys.length - 2 && keys[i + 1].t <= t) i++;
  const a = keys[i], b = keys[i + 1], u = (t - a.t) / (b.t - a.t || 1);
  return {a, b, e:easeFn(a)(u), i, u};
}
function smoothKnotTangent(keys, k, side) {
  const cur = keys[k];
  if (side === 'in' && typeof cur?.mIn === 'number' && isFinite(cur.mIn)) return cur.mIn;
  if (side === 'out' && typeof cur?.mOut === 'number' && isFinite(cur.mOut)) return cur.mOut;
  if (typeof cur?.m === 'number' && isFinite(cur.m)) return cur.m;
  const n = keys.length - 1;
  if (k <= 0) {
    if (keys[0].e === 'easeIn' || keys[0].e === 'easeInOut') return 0;
    return (keys[1].v - keys[0].v) / Math.max(1e-5, keys[1].t - keys[0].t);
  }
  if (k >= n) {
    if (keys[n - 1].e === 'easeOut' || keys[n - 1].e === 'easeInOut') return 0;
    return (keys[n].v - keys[n - 1].v) / Math.max(1e-5, keys[n].t - keys[n - 1].t);
  }
  const h0 = Math.max(1e-5, keys[k].t - keys[k - 1].t);
  const h1 = Math.max(1e-5, keys[k + 1].t - keys[k].t);
  const d0 = (keys[k].v - keys[k - 1].v) / h0;
  const d1 = (keys[k + 1].v - keys[k].v) / h1;
  if (d0 * d1 <= 0) return 0;
  const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
  return (w1 + w2) / (w1 / d0 + w2 / d1);
}
function valueAt(path, t, kind, base) {
  if (!isVideo()) return base;
  const keys = tracks()[path];
  if (!keys || !keys.length) return base;
  const {a, b, e, i, u} = seg(keys, t);
  if (a === b) return a.v;
  if (kind === 'target') return e < .5 ? a.v : b.v;
  if (kind === 'color') { const x = hexToRgb(a.v), y = hexToRgb(b.v); return rgbToHex(x.map((v, j) => v + (y[j] - v) * e)); }
  const hasExplicitM = typeof a.mOut === 'number' || typeof a.m === 'number' || typeof b.mIn === 'number' || typeof b.m === 'number';
  if (a.e !== 'hold' && a.e !== 'custom' && a.e !== 'bounce' && a.e !== 'elastic' && (hasExplicitM || (keys.length > 2 && (a.e === 'smooth' || b.e === 'smooth')))) {
    const h = Math.max(1e-5, b.t - a.t);
    const m0 = smoothKnotTangent(keys, i, 'out') * h;
    const m1 = smoothKnotTangent(keys, i + 1, 'in') * h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a.v + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * b.v + (u3 - u2) * m1;
  }
  return a.v + (b.v - a.v) * e;
}

/* ---------- time + application ---------- */
let T = 0, playing = false, lastApplied = {}, applying = false;
const fps = () => S.video.fps || 24;
const frameDur = () => 1 / fps();
const snap = t => Math.round(t * fps()) / fps();
const frameOf = t => Math.round(t * fps());
const endFrame = () => Math.round((S.video.duration || 5) * fps());
const tc = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`; };
function apply(t) {
  if (!isVideo()) return;
  applying = true;
  const P = props();
  AC.applyQuiet(() => { P.forEach(p => { if (tracks()[p.path]?.length) p.set(valueAt(p.path, t, p.kind, p.get())); }); });
  lastApplied = {};
  P.forEach(p => { if (tracks()[p.path]?.length) lastApplied[p.path] = p.get(); });
  applying = false;
}
function setTime(t) {
  T = clamp(snap(t), 0, S.video.duration || 5); apply(T);
  updateTimeUI();
}
function autoKey() {
  if (S.app !== 'video' || applying || playing || !S.video.autokey) return;
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
function keyToggle(path) {
  if (S.app !== 'video') return;
  const parts = compositeParts(path);
  if (parts) {
    const here = parts.filter(q => keyHere(q));
    if (path === 'focus.pos' && !here.length) {
      const tg = targetAt(T); Object.assign(fpos(), {x:rnd(tg.x, 3), y:rnd(tg.y, 3), z:rnd(tg.z, 3)});
      S.focus.on = true; S.focus.target = '';
      if (tracks().focus?.length) upsertKey('focus', T, '');
    }
    if (here.length) here.forEach(q => { const keys = tracks()[q], k = keyHere(q); keys.splice(keys.indexOf(k), 1); if (!keys.length) delete tracks()[q]; });
    else parts.forEach(q => { const pp = props().find(x => x.path === q); if (pp) { upsertKey(q, T, keyValue(pp)); lastApplied[q] = pp.get(); } });
    const label = path === 'cam.pos' ? 'Camera position' : path === 'focus.pos' ? 'Focus position' : 'Scale (X, Y, Z)';
    AC.toast(`${label}: key ${here.length ? 'removed' : 'added'} at frame ${frameOf(T)}`);
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
function recordKeyTargets() {
  const filterObjIds = [...kFilter].filter(g => g.startsWith('obj:')).map(g => g.slice(4));
  let objIds = filterObjIds;
  if (!objIds.length && !kFilter.has('Camera')) {
    if (selSet.size) objIds = [...selSet];
    else if (sel && sel !== 'camera') objIds = [sel];
  }
  const objTargets = [...new Set(objIds)].map(objById).filter(Boolean);
  const wantCam = kFilter.has('Camera') || !objTargets.length;
  return {objTargets, wantCam};
}
function recordAll() {
  if (!isVideo()) return;
  const {objTargets, wantCam} = recordKeyTargets();
  const allProps = props();
  const recPath = path => {
    const p = allProps.find(x => x.path === path);
    if (p) { upsertKey(path, T, keyValue(p)); lastApplied[path] = p.get(); }
  };
  const labels = [];
  if (wantCam) {
    ['cam.az', 'cam.el', 'cam.dist', 'cam.roll', 'cam.focal'].concat(S.focus.on ? ['focus'] : []).forEach(recPath);
    labels.push('Camera');
  }
  objTargets.forEach(o => {
    ['x', 'z', 'y', 'ry', 'rx', 'rz', 'sx', 'sy', 'sz'].forEach(k => recPath(`obj.${o.id}.${k}`));
    labels.push(o.label);
  });
  buildTimeline(); AC.save(); AC.changed();
  AC.toast(`${labels.join(' + ') || 'Camera'} keyed at frame ${frameOf(T)}`);
}
const allKeyTimes = () => [...new Set(Object.values(tracks()).flat().map(k => rnd(k.t, 4)))].sort((a, b) => a - b);
const groupOfPath = p => p.startsWith('cam.') ? 'Camera' : p === 'focus' || p.startsWith('focus.') ? 'Focus' : p.startsWith('obj.') ? 'obj:' + p.split('.')[1] : p;
const kFilter = new Set();
const inFilter = p => !kFilter.size || kFilter.has(groupOfPath(p));
const fKeys = () => Object.entries(tracks()).filter(([p]) => inFilter(p)).flatMap(([, ks]) => ks);
const fKeyTimes = () => [...new Set(fKeys().map(k => rnd(k.t, 4)))].sort((a, b) => a - b);
const fKeysAt = t => fKeys().filter(k => Math.abs(k.t - t) < 1e-4);

/* ---------- camera target + scene helpers ---------- */
function objCenter(o, t) { const g = k => valueAt(`obj.${o.id}.${k}`, t, 'num', o[k]); return {x:g('x'), y:g('y') + g('h') / 2, z:g('z')}; }
function objStageAnchor(o) {
  const mid = (k, fallback) => {
    const ks = isVideo() ? tracks()[`obj.${o.id}.${k}`] : null;
    if (!ks || !ks.length) return fallback;
    const vs = ks.map(x => x.v);
    return (Math.min(...vs) + Math.max(...vs)) / 2;
  };
  return {x:mid('x', o.x || 0), y:(o.y || 0) + (o.h || 1) / 2, z:mid('z', o.z || 0)};
}
function centroid(t) {
  const os = V().objects; if (!os.length) return {x:0, y:AC.calc().subjH / 2, z:0};
  const c = os.map(o => objStageAnchor(o));
  return {x:c.reduce((a, p) => a + p.x, 0) / c.length, y:c.reduce((a, p) => a + p.y, 0) / c.length, z:c.reduce((a, p) => a + p.z, 0) / c.length};
}
function hasFocusPointKeys() {
  if (!isVideo()) return false;
  const tr = tracks();
  return !!(tr['focus.x']?.length || tr['focus.y']?.length || tr['focus.z']?.length);
}
function targetAt(t) {
  const fs = focusSt();
  const keys = isVideo() ? tracks().focus : null;
  const custom = () => ({x:valueAt('focus.x', t, 'num', fpos().x), y:valueAt('focus.y', t, 'num', fpos().y), z:valueAt('focus.z', t, 'num', fpos().z)});
  const pos = label => { const o = label && objByLabel(label); return o ? objCenter(o, t) : (V().objects.length ? centroid(t) : fs.on ? custom() : centroid(t)); };
  if (keys?.length) {
    const {a, b, e} = seg(keys, t);
    const pa = pos(a.v), pb = pos(b.v);
    return {x:pa.x + (pb.x - pa.x) * e, y:pa.y + (pb.y - pa.y) * e, z:pa.z + (pb.z - pa.z) * e};
  }
  const activeTargets = Array.isArray(fs.targets) && fs.targets.length ? fs.targets.map(objByLabel).filter(Boolean) : [];
  if (fs.on && activeTargets.length > 1) {
    const cs = activeTargets.map(o => objCenter(o, t));
    return {x:cs.reduce((a, p) => a + p.x, 0) / cs.length, y:cs.reduce((a, p) => a + p.y, 0) / cs.length, z:cs.reduce((a, p) => a + p.z, 0) / cs.length};
  }
  if (fs.on && fs.target) return pos(fs.target);
  if (V().objects.length) return centroid(t);
  return fs.on ? custom() : centroid(t);
}
function focusMarkerAt(t) {
  const fs = focusSt();
  if (hasFocusPointKeys() || fs.pointPinned) {
    return {
      x:valueAt('focus.x', t, 'num', fpos().x),
      y:valueAt('focus.y', t, 'num', fpos().y),
      z:valueAt('focus.z', t, 'num', fpos().z)
    };
  }
  return targetAt(t);
}
function hasCamOrbitMove() {
  if (!isVideo()) return false;
  const d = V().duration || 5;
  const azKeys = tracks()['cam.az'] || [];
  if (azKeys.length >= 2) {
    const vals = azKeys.map(k => k.v);
    if (Math.max(...vals) - Math.min(...vals) >= 35) return true;
  }
  return Math.abs(camAt(d).az - camAt(0).az) >= 35;
}
function classify3DObjPart(o, lx, ly, lz, oh, ow, osz, t) {
  const m = o.model;
  if (m === 'person') {
    const ny = ly / Math.max(.1, oh);
    if (ny >= .78) {
      if (Math.abs(lx) >= oh * .16 && ny < .88) return lx < 0 ? 'right hand' : 'left hand';
      return 'head';
    }
    if (Math.abs(lx) >= oh * .09 && ny >= .34 && ny <= .62) {
      return lx < -.02 ? 'right hand' : lx > .02 ? 'left hand' : 'hand';
    }
    if (Math.abs(lz) >= oh * .10 && ny >= .36 && ny <= .76) {
      return lx < -.02 ? 'right hand' : lx > .02 ? 'left hand' : 'hand';
    }
    if (ny >= .62 && ny < .78) {
      if (Math.abs(lx) >= oh * .11) return lx < 0 ? 'right arm' : 'left arm';
      if (ny >= .73) return 'neck';
      return 'chest and upper torso';
    }
    if (ny >= .42 && ny < .62) return 'waist and hips';
    if (ny >= .10 && ny < .42) return lx < -.01 ? 'right leg' : lx > .01 ? 'left leg' : 'leg';
    return lx < -.01 ? 'right foot and shoe' : lx > .01 ? 'left foot and shoe' : 'foot and shoe';
  }
  if (m === 'car') {
    if (!hasFocusPointKeys() && !focusSt().pointPinned && hasCamOrbitMove()) {
      const dur = Math.max(.001, V().duration || 5);
      const u = clamp(t / dur, 0, 1);
      if (u < .25) return 'front wheel';
      if (u < .50) return 'door';
      if (u < .75) return 'windshield';
      return 'rear wheel';
    }
    const L = ow, W = ow * .46 * osz, wheelR = oh * .235;
    if (lz > L * .12 && lz < L * .46 && ly <= oh * .48 && (Math.abs(lx) >= W * .16 || Math.hypot(lz - L * .30, ly - wheelR) <= wheelR * 1.55)) {
      return 'front wheel';
    }
    if (lz < -L * .12 && lz > -L * .46 && ly <= oh * .48 && (Math.abs(lx) >= W * .16 || Math.hypot(lz + L * .30, ly - wheelR) <= wheelR * 1.55)) {
      return 'rear wheel';
    }
    if (lz >= -L * .08 && lz <= L * .25 && ly >= oh * .50 && Math.abs(lx) <= W * .42) {
      return 'windshield';
    }
    if (lz < -L * .08 && lz >= -L * .38 && ly >= oh * .56 && Math.abs(lx) <= W * .40) {
      return 'rear windshield';
    }
    if (lz >= -L * .22 && lz <= L * .20 && ly >= oh * .12 && ly < oh * .58) {
      return 'door';
    }
    if (lz >= -L * .30 && lz <= L * .14 && ly >= oh * .56 && ly <= oh * .88 && Math.abs(lx) > W * .36) {
      return 'side window';
    }
    if (ly > oh * .84 && lz >= -L * .26 && lz <= L * .08) return 'roof';
    if (lz >= L * .38 && ly >= oh * .24 && ly <= oh * .48 && Math.abs(lx) >= W * .20) return 'headlight';
    if (lz >= L * .38 && ly < oh * .38) return 'front grille and bumper';
    if (lz > L * .18 && ly >= oh * .30 && ly <= oh * .62) return 'hood';
    if (lz <= -L * .38 && ly >= oh * .54) return 'rear spoiler';
    if (lz <= -L * .38 && ly >= oh * .38 && ly < oh * .54) return 'taillight';
    if (lz <= -L * .38 && ly < oh * .38) return 'rear bumper';
    const s = Math.sign(lx || 1);
    const landmarks = [
      ['front wheel', s * W * .45, wheelR, L * .30],
      ['rear wheel', s * W * .45, wheelR, -L * .30],
      ['door', s * W * .44, oh * .38, 0],
      ['windshield', 0, oh * .72, L * .10],
      ['hood', 0, oh * .48, L * .30],
      ['roof', 0, oh * .90, -L * .08],
      ['rear windshield', 0, oh * .72, -L * .24]
    ];
    let best = 'door', bestD = 1e9;
    for (const [nm, px, py, pz] of landmarks) {
      const d = Math.hypot(lx - px, ly - py, lz - pz);
      if (d < bestD) { bestD = d; best = nm; }
    }
    return best;
  }
  if (m === 'cat' || m === 'animal') {
    const L = Math.max(m === 'cat' ? .26 : .42, ow);
    if (lz >= L * .22 && ly >= oh * .50) return ly >= oh * .86 ? 'ears' : 'head';
    if (lz <= -L * .22 && ly >= oh * .32) return 'tail';
    if (ly <= oh * .22) return lz >= 0 ? 'front paw' : 'hind paw';
    if (ly <= oh * .46) return lz >= 0 ? 'front leg' : 'hind leg';
    return 'back and torso';
  }
  if (m === 'phone') {
    if (ly >= oh * .70 && lx <= 0) return 'rear camera module';
    if (lz >= 0) return 'screen display';
    return 'back casing';
  }
  if (m === 'chair') {
    if (ly >= oh * .55) return 'backrest';
    if (ly >= oh * .35) return 'seat cushion';
    return 'chair leg';
  }
  if (m === 'table') return ly >= oh * .72 ? 'tabletop surface' : 'table leg';
  if (m === 'tree') return ly >= oh * .42 ? 'leafy canopy' : 'tree trunk';
  if (m === 'custom' && o.modelInfo?.parts?.length) {
    const idx = clamp(Math.floor((1 - clamp(ly / Math.max(.1, oh), 0, .999)) * o.modelInfo.parts.length), 0, o.modelInfo.parts.length - 1);
    return o.modelInfo.parts[idx]?.part || 'main body';
  }
  const ny = ly / Math.max(.1, oh);
  return ny >= .68 ? 'upper section' : ny <= .32 ? 'lower base' : 'center body';
}
function detect3DFocusPartAt(t = T) {
  const objs = V().objects || [];
  if (!objs.length) return null;
  const fs = focusSt();
  const fm = focusMarkerAt(t);
  const prefLbl = valueAt('focus', t, 'target', fs.target) || (Array.isArray(fs.targets) && fs.targets[0]) || '';
  let bestObj = null, bestScore = 1e9;
  for (const cand of objs) {
    const ox = valueAt(`obj.${cand.id}.x`, t, 'num', cand.x || 0);
    const oy = valueAt(`obj.${cand.id}.y`, t, 'num', cand.y || 0);
    const oz = valueAt(`obj.${cand.id}.z`, t, 'num', cand.z || 0);
    const oh = Math.max(.05, valueAt(`obj.${cand.id}.h`, t, 'num', cand.h || defaultHeightFor(cand.model)) * valueAt(`obj.${cand.id}.sy`, t, 'num', cand.sy ?? 1));
    const ow = Math.max(.05, valueAt(`obj.${cand.id}.w`, t, 'num', cand.w || widthFor(cand.model, oh)) * valueAt(`obj.${cand.id}.sx`, t, 'num', cand.sx ?? 1));
    const rx = Math.max(0, Math.abs(fm.x - ox) - ow * .65);
    const ry = fm.y < oy ? oy - fm.y : fm.y > oy + oh * 1.08 ? fm.y - (oy + oh * 1.08) : 0;
    const rz = Math.max(0, Math.abs(fm.z - oz) - ow * .65);
    let d = Math.hypot(rx, ry, rz);
    if (cand.label === prefLbl) d -= .18;
    if (d < bestScore) { bestScore = d; bestObj = cand; }
  }
  const o = bestObj || objs[0];
  const ox = valueAt(`obj.${o.id}.x`, t, 'num', o.x || 0);
  const oy = valueAt(`obj.${o.id}.y`, t, 'num', o.y || 0);
  const oz = valueAt(`obj.${o.id}.z`, t, 'num', o.z || 0);
  const ory = valueAt(`obj.${o.id}.ry`, t, 'num', o.ry || 0);
  const oh = Math.max(.05, valueAt(`obj.${o.id}.h`, t, 'num', o.h || defaultHeightFor(o.model)) * valueAt(`obj.${o.id}.sy`, t, 'num', o.sy ?? 1));
  const ow = Math.max(.05, valueAt(`obj.${o.id}.w`, t, 'num', o.w || widthFor(o.model, oh)) * valueAt(`obj.${o.id}.sx`, t, 'num', o.sx ?? 1));
  const osz = Math.max(.05, valueAt(`obj.${o.id}.sz`, t, 'num', o.sz ?? 1));
  const dx = fm.x - ox, dy = fm.y - oy, dz = fm.z - oz;
  const ang = -rad(ory), cosA = Math.cos(ang), sinA = Math.sin(ang);
  const lx = dx * cosA - dz * sinA;
  const lz = dx * sinA + dz * cosA;
  const ly = dy;
  const partName = classify3DObjPart(o, lx, ly, lz, oh, ow, osz, t);
  return {
    objectId: o.id,
    objectLabel: o.label,
    modelType: o.model,
    partName,
    fullLabel: `${o.label}'s ${partName}`,
    point: {x:rnd(fm.x, 2), y:rnd(fm.y, 2), z:rnd(fm.z, 2)}
  };
}
function sampleFocusPartTimeline() {
  const fs = focusSt();
  if (!fs.on && !fs.showMark && !tracks().focus?.length && !hasFocusPointKeys()) return null;
  const objs = V().objects || [];
  if (!objs.length) return null;
  const dur = V().duration || 5;
  let sampleTimes = [];
  if (hasFocusPointKeys() || tracks().focus?.length) {
    const fTimes = ['focus', 'focus.x', 'focus.y', 'focus.z']
      .flatMap(p => (tracks()[p] || []).map(k => rnd(k.t, 4)));
    sampleTimes = [...new Set([0, ...fTimes])].filter(t => t >= 0 && t <= dur).sort((a, b) => a - b);
  } else if (hasCamOrbitMove()) {
    sampleTimes = [0, rnd(dur * .28, 4), rnd(dur * .56, 4), rnd(dur * .84, 4)];
  } else {
    sampleTimes = [rnd(T, 4)];
  }
  const timeline = [];
  for (const t of sampleTimes) {
    const info = detect3DFocusPartAt(t);
    if (!info) continue;
    const prev = timeline[timeline.length - 1];
    if (!prev || prev.fullLabel !== info.fullLabel) {
      timeline.push({
        t: rnd(t, 2),
        frame: frameOf(t),
        objectLabel: info.objectLabel,
        modelType: info.modelType,
        partName: info.partName,
        fullLabel: info.fullLabel
      });
    }
  }
  const current = detect3DFocusPartAt(T) || timeline[0] || null;
  return {current, timeline, shifted: timeline.length > 1};
}
function camAt(t) {
  const v = (path, base) => valueAt(path, t, 'num', base);
  return {az:v('cam.az', S.az), el:v('cam.el', S.el), dist:v('cam.dist', S.dist), roll:v('cam.roll', S.roll), focal:v('cam.focal', S.focal), sensor:v('cam.sensor', S.sensorW)};
}
function camWorld(t) {
  const c = camAt(t), tg = targetAt(t), a = rad(c.az), e = rad(clamp(c.el, -89.5, 89.5));
  return {x:tg.x + Math.sin(a) * Math.cos(e) * c.dist, y:tg.y + Math.sin(e) * c.dist, z:tg.z + Math.cos(a) * Math.cos(e) * c.dist};
}
hooks.target = () => is3D() ? targetAt(T) : null;
hooks.sceneExtent = view => {
  if (!is3D() || !V().objects.length) return null;
  const tg = targetAt(T);
  const vals = V().objects.map(o => view === 'top' ? Math.hypot((o.x || 0) - tg.x, (o.z || 0) - tg.z) + (o.w || .5) / 2 : Math.max((o.h || 1) + (o.y || 0), Math.hypot((o.x || 0) - tg.x, (o.z || 0) - tg.z) + (o.w || .5) / 2)).filter(isFinite);
  if (!vals.length) return null;
  const ext = Math.max(...vals) * 1.1;
  return isFinite(ext) && ext > 0 ? ext : null;
};
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
  if (!is3D()) return false;
  const C = AC.C, tg = v.T, label = labelPainter(ctx), objs = [...V().objects].sort((a, b) => isObjSelected(a.id) - isObjSelected(b.id));
  objs.forEach(o => {
    const px = v.cx + (o.x - tg.x) * v.s, py = v.cy + (o.z - tg.z) * v.s;
    const w = Math.max(6, (o.model === 'car' ? o.w * .42 : o.w) * v.s), d = Math.max(4, (o.model === 'car' ? o.w : depthFor(o)) * v.s);
    const selected = isObjSelected(o.id);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-rad(o.ry));
    ctx.fillStyle = o.color; ctx.globalAlpha = .55; ctx.fillRect(-w / 2, -d / 2, w, d);
    ctx.globalAlpha = 1; ctx.strokeStyle = selected ? C.green : C.fg; ctx.lineWidth = selected ? 2 : 1; ctx.strokeRect(-w / 2, -d / 2, w, d);
    ctx.fillStyle = C.fg; ctx.beginPath(); ctx.moveTo(-4, d / 2 + 3); ctx.lineTo(4, d / 2 + 3); ctx.lineTo(0, d / 2 + 8); ctx.fill();
    ctx.restore();
  });
  [...objs].reverse().forEach(o => label(o.label, v.cx + (o.x - tg.x) * v.s, v.cy + (o.z - tg.z) * v.s - Math.max(4, depthFor(o) * v.s) / 2 - 6, isObjSelected(o.id)));
  if (isVideo() && V().path) drawPath(ctx, v, 'top');
  return true;
};
hooks.drawSideScene = (ctx, v) => {
  if (!is3D()) return false;
  const C = AC.C, tg = v.T, a = rad(S.az), ux = Math.sin(a), uz = Math.cos(a), groundY = v.cy + tg.y * v.s, label = labelPainter(ctx);
  const objs = [...V().objects].sort((p, q) => isObjSelected(p.id) - isObjSelected(q.id)), tops = [];
  objs.forEach(o => {
    const d = (o.x - tg.x) * ux + (o.z - tg.z) * uz;
    const px = v.cx - d * v.s, w = Math.max(6, o.w * v.s * .8), h = Math.max(6, o.h * v.s), top = groundY - (o.y + o.h) * v.s;
    const selected = isObjSelected(o.id);
    ctx.fillStyle = o.color; ctx.globalAlpha = .55; ctx.fillRect(px - w / 2, top, w, h);
    ctx.globalAlpha = 1; ctx.strokeStyle = selected ? C.green : C.fg; ctx.lineWidth = selected ? 2 : 1; ctx.strokeRect(px - w / 2, top, w, h);
    tops.push([o, px, top]);
  });
  tops.reverse().forEach(([o, px, top]) => label(o.label, px, top - 5, isObjSelected(o.id)));
  if (isVideo() && V().path) drawPath(ctx, v, 'side');
  return true;
};
function drawPath(ctx, v, kind) {
  if (!Object.keys(tracks()).length) return;
  const C = AC.C, tg = v.T, n = 90, dur = S.video.duration || 5, a = rad(S.az), ux = Math.sin(a), uz = Math.cos(a);
  const toScr = p => kind === 'top' ? [v.cx + (p.x - tg.x) * v.s, v.cy + (p.z - tg.z) * v.s]
    : [v.cx - ((p.x - tg.x) * ux + (p.z - tg.z) * uz) * v.s, v.cy - (p.y - tg.y) * v.s];
  ctx.save(); ctx.strokeStyle = C.accent; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.globalAlpha = .85; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const [x, y] = toScr(camWorld(dur * i / n)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = C.accent;
  allKeyTimes().forEach(t => { const [x, y] = toScr(camWorld(t)); ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.fill(); });
  ctx.restore();
}

/* ---------- three.js viewport: rigged models, poses & locomotion ---------- */
let R = null;
const rigMotionState = new Map();
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
  const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3a40, .5); scene.add(hemi);
  const lights = {};
  AC.ROLES.forEach((r, i) => {
    const l = new THREE.DirectionalLight(0xffffff, 0);
    if (i === 0) { l.castShadow = true; l.shadow.mapSize.set(2048, 2048); Object.assign(l.shadow.camera, {left:-8, right:8, top:8, bottom:-8, near:.2, far:60}); }
    scene.add(l); scene.add(l.target); lights[r.id] = l;
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({color:0x3b3c41, roughness:.95}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(40, 40, 0x666870, 0x46474d); grid.position.y = .001; scene.add(grid);
  const raycaster = new THREE.Raycaster();
  const gizmo = buildGizmo(THREE);
  scene.add(gizmo.group);
  R = {THREE, renderer, scene, camera, lights, hemi, ground, grid, raycaster, gizmo, objs:new Map()};
  new ResizeObserver(() => renderVP()).observe($('vpWrap'));
  $('vpWrap').addEventListener('wheel', e => { e.preventDefault(); AC.setDist(S.dist * Math.exp(e.deltaY * .0012)); AC.changed(); }, {passive:false});
  bindViewportPicking();
}
function buildGizmo(THREE) {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 999;
  const moveGrp = new THREE.Group();
  const rotGrp = new THREE.Group();
  const scaleGrp = new THREE.Group();
  group.add(moveGrp, rotGrp, scaleGrp);
  const COLORS = {x:0xff3b30, y:0x34c759, z:0x2f7cf6, hi:0xffe033};
  const mats = {
    x:new THREE.MeshBasicMaterial({color:COLORS.x, depthTest:false, depthWrite:false, transparent:true, opacity:.96}),
    y:new THREE.MeshBasicMaterial({color:COLORS.y, depthTest:false, depthWrite:false, transparent:true, opacity:.96}),
    z:new THREE.MeshBasicMaterial({color:COLORS.z, depthTest:false, depthWrite:false, transparent:true, opacity:.96}),
    center:new THREE.MeshBasicMaterial({color:0xf5f5f7, depthTest:false, depthWrite:false, transparent:true, opacity:.95}),
    hit:new THREE.MeshBasicMaterial({color:0xffffff, depthTest:false, depthWrite:false, transparent:true, opacity:0, visible:false})
  };
  const hitMeshes = [];
  const tagHit = (mesh, axis, mode) => {
    mesh.userData.gizmoAxis = axis;
    mesh.userData.gizmoMode = mode;
    mesh.renderOrder = 1000;
    hitMeshes.push(mesh);
    return mesh;
  };
  // Center sphere for Move
  const centerSph = new THREE.Mesh(new THREE.SphereGeometry(.045, 14, 12), mats.center);
  centerSph.renderOrder = 1000;
  moveGrp.add(centerSph);

  // Move arrows (X = Red, Y = Green, Z = Blue)
  const makeMoveAxis = axis => {
    const ag = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .66, 14), mats[axis]);
    shaft.position.y = .36; shaft.renderOrder = 999;
    const head = new THREE.Mesh(new THREE.ConeGeometry(.056, .18, 18), mats[axis]);
    head.position.y = .76; head.renderOrder = 999;
    const hit = tagHit(new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .90, 10), mats.hit), axis, 'move');
    hit.position.y = .45;
    ag.add(shaft, head, hit);
    if (axis === 'x') ag.rotation.z = -Math.PI / 2;
    else if (axis === 'z') ag.rotation.x = Math.PI / 2;
    moveGrp.add(ag);
  };
  ['x', 'y', 'z'].forEach(makeMoveAxis);

  // Rotate rings (X = Red, Y = Green, Z = Blue) with tangent arrow cones
  const makeRotAxis = (axis, radius) => {
    const rg = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, .018, 14, 64), mats[axis]);
    ring.renderOrder = 999;
    const tip1 = new THREE.Mesh(new THREE.ConeGeometry(.045, .11, 14), mats[axis]);
    tip1.position.set(radius, 0, 0); tip1.rotation.z = 0; tip1.renderOrder = 999;
    const tip2 = new THREE.Mesh(new THREE.ConeGeometry(.045, .11, 14), mats[axis]);
    tip2.position.set(-radius, 0, 0); tip2.rotation.z = Math.PI; tip2.renderOrder = 999;
    const hit = tagHit(new THREE.Mesh(new THREE.TorusGeometry(radius, .09, 10, 48), mats.hit), axis, 'rotate');
    rg.add(ring, tip1, tip2, hit);
    if (axis === 'y') rg.rotation.x = Math.PI / 2;
    else if (axis === 'x') rg.rotation.y = Math.PI / 2;
    rotGrp.add(rg);
  };
  makeRotAxis('y', .64);
  makeRotAxis('x', .59);
  makeRotAxis('z', .54);

  // Cinema 4D Scale axes (X = Red, Y = Green, Z = Blue with cube handles + center uniform cube)
  const centerCube = new THREE.Mesh(new THREE.BoxGeometry(.095, .095, .095), mats.center);
  centerCube.renderOrder = 1000;
  const centerHit = tagHit(new THREE.Mesh(new THREE.BoxGeometry(.18, .18, .18), mats.hit), 'xyz', 'scale');
  scaleGrp.add(centerCube, centerHit);
  const makeScaleAxis = axis => {
    const sg = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.016, .016, .66, 12), mats[axis]);
    shaft.position.y = .36; shaft.renderOrder = 999;
    const boxCap = new THREE.Mesh(new THREE.BoxGeometry(.092, .092, .092), mats[axis]);
    boxCap.position.y = .74; boxCap.renderOrder = 999;
    const hit = tagHit(new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .90, 10), mats.hit), axis, 'scale');
    hit.position.y = .45;
    sg.add(shaft, boxCap, hit);
    if (axis === 'x') sg.rotation.z = -Math.PI / 2;
    else if (axis === 'z') sg.rotation.x = Math.PI / 2;
    scaleGrp.add(sg);
  };
  ['x', 'y', 'z'].forEach(makeScaleAxis);

  return {
    group, moveGrp, rotGrp, scaleGrp, mats, hitMeshes, COLORS,
    setHighlight(ax) {
      ['x', 'y', 'z'].forEach(k => mats[k].color.setHex((ax === k || ax === 'xyz') ? COLORS.hi : COLORS[k]));
      mats.center.color.setHex(ax === 'xyz' ? COLORS.hi : 0xf5f5f7);
    }
  };
}
function mat(color, o = {}) { return new R.THREE.MeshStandardMaterial({color, roughness:.55, metalness:.08, ...o}); }
function addMesh(g, geo, m, x, y, z) { const me = new R.THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; g.add(me); return me; }
// multi-joint tail: each segment is a pivot (so it can wag, curl and stream behind the animal) with a rest bend per joint
function buildTailChain(parent, material, lens, radii, rest) {
  const THREE = R.THREE, segs = [];
  let par = parent;
  lens.forEach((len, i) => {
    const piv = new THREE.Group(); piv.position.set(0, i ? lens[i - 1] : 0, 0); piv.rotation.x = rest[i]; par.add(piv);
    addMesh(piv, new THREE.SphereGeometry(radii[i], 10, 8), material, 0, 0, 0);
    addMesh(piv, new THREE.CylinderGeometry(radii[i + 1], radii[i], len, 12), material, 0, len / 2, 0);
    segs.push(piv); par = piv;
  });
  addMesh(par, new THREE.SphereGeometry(radii[lens.length], 10, 8), material, 0, lens[lens.length - 1], 0);
  return segs;
}
function buildSingleModel(o) {
  const THREE = R.THREE, g = new THREE.Group(), h = o.h, w = o.w, c = o.color, m = mat(c);
  switch (o.model) {
    case 'person': {
      const sx = w / (h * .29), P = o.parts || {};
      const shirtM = mat(P.shirt || c, {roughness:.6}), pantsM = mat(P.pants || new THREE.Color(c).multiplyScalar(.48), {roughness:.7});
      const shoesM = mat(P.shoes || 0x1e2026, {roughness:.45}), skin = mat(P.skin || 0xe2b897, {roughness:.55});
      const hairM = mat(P.hair || 0x2a211b, {roughness:.75});
      const root = new THREE.Group(); g.add(root);
      const pelvis = addMesh(root, new THREE.CylinderGeometry(h * .092, h * .085, h * .1, 16), pantsM, 0, h * .49, 0);
      pelvis.scale.z = .72;
      const torsoGrp = new THREE.Group(); torsoGrp.position.set(0, h * .53, 0); root.add(torsoGrp);
      const chest = addMesh(torsoGrp, new THREE.CylinderGeometry(h * .115, h * .092, h * .28, 18), shirtM, 0, h * .14, 0);
      chest.scale.z = .68; chest.userData.part = 'shirt';
      const shoulders = addMesh(torsoGrp, new THREE.SphereGeometry(h * .118, 18, 12), shirtM, 0, h * .265, 0);
      shoulders.scale.set(1.12, .38, .66);
      // Head & neck pivot
      const headGrp = new THREE.Group(); headGrp.position.set(0, h * .29, 0); torsoGrp.add(headGrp);
      addMesh(headGrp, new THREE.CylinderGeometry(h * .028, h * .033, h * .055, 12), skin, 0, h * .022, 0);
      const head = addMesh(headGrp, new THREE.SphereGeometry(h * .072, 24, 18), skin, 0, h * .105, 0);
      head.scale.set(.92, 1.06, .96);
      const hair = addMesh(headGrp, new THREE.SphereGeometry(h * .075, 20, 14), hairM, 0, h * .118, -h * .006);
      hair.scale.set(.95, .92, .98);
      addMesh(headGrp, new THREE.SphereGeometry(h * .011, 10, 8), skin, 0, h * .102, h * .069); // nose
      addMesh(headGrp, new THREE.SphereGeometry(h * .009, 8, 8), mat(0x18181c), -h * .024, h * .112, h * .063);
      addMesh(headGrp, new THREE.SphereGeometry(h * .009, 8, 8), mat(0x18181c), h * .024, h * .112, h * .063);
      // Left & right articulated arms
      const makeArm = side => {
        const sh = new THREE.Group(); sh.position.set(side * h * .142, h * .255, 0); torsoGrp.add(sh);
        addMesh(sh, new THREE.SphereGeometry(h * .034, 12, 10), shirtM, 0, 0, 0);
        addMesh(sh, new THREE.CylinderGeometry(h * .031, h * .026, h * .16, 12), shirtM, 0, -h * .08, 0);
        const elbow = new THREE.Group(); elbow.position.set(0, -h * .16, 0); sh.add(elbow);
        addMesh(elbow, new THREE.SphereGeometry(h * .025, 10, 10), skin, 0, 0, 0);
        addMesh(elbow, new THREE.CylinderGeometry(h * .024, h * .02, h * .15, 12), skin, 0, -h * .075, 0);
        addMesh(elbow, new THREE.SphereGeometry(h * .024, 10, 10), skin, 0, -h * .155, 0);
        sh.rotation.z = side * .09;
        return {sh, elbow};
      };
      const leftArm = makeArm(-1), rightArm = makeArm(1);
      // Left & right articulated legs
      const makeLeg = side => {
        const hip = new THREE.Group(); hip.position.set(side * h * .058, h * .47, 0); root.add(hip);
        addMesh(hip, new THREE.CylinderGeometry(h * .048, h * .038, h * .23, 14), pantsM, 0, -h * .115, 0);
        const knee = new THREE.Group(); knee.position.set(0, -h * .23, 0); hip.add(knee);
        addMesh(knee, new THREE.SphereGeometry(h * .037, 12, 10), pantsM, 0, 0, 0);
        addMesh(knee, new THREE.CylinderGeometry(h * .036, h * .028, h * .21, 14), pantsM, 0, -h * .105, 0);
        const shoe = addMesh(knee, new THREE.BoxGeometry(h * .076, h * .045, h * .145), shoesM, 0, -h * .218, h * .024);
        shoe.userData.part = 'shoes';
        return {hip, knee};
      };
      const leftLeg = makeLeg(-1), rightLeg = makeLeg(1);
      g.userData.baseScaleX = clamp(sx, .55, 2.4);
      g.scale.x = g.userData.baseScaleX;
      g.userData.rig = {type:'person', h, root, torsoGrp, headGrp, leftArm, rightArm, leftLeg, rightLeg};
      break;
    }
    case 'cat': {
      const L = Math.max(.26, w), root = new THREE.Group(); g.add(root);
      const furM = mat(c, {roughness:.62}), bellyM = mat(new THREE.Color(c).lerp(new THREE.Color(0xffffff), .28), {roughness:.68});
      const earM = mat(0xe89ca5, {roughness:.55}), eyeM = mat(0x22c55e, {roughness:.18, emissive:0x0a2e16}), pupilM = mat(0x111214, {roughness:.2});
      const torsoGrp = new THREE.Group(); torsoGrp.position.set(0, h * .52, 0); root.add(torsoGrp);
      const torso = addMesh(torsoGrp, new THREE.CylinderGeometry(h * .21, h * .23, L * .54, 18), furM, 0, 0, 0);
      torso.rotation.x = Math.PI / 2; torso.scale.x = .88;
      const chest = addMesh(torsoGrp, new THREE.SphereGeometry(h * .235, 18, 14), furM, 0, h * .01, L * .25);
      chest.scale.set(.88, .98, 1.05);
      const haunch = addMesh(torsoGrp, new THREE.SphereGeometry(h * .225, 18, 14), furM, 0, h * .02, -L * .25);
      haunch.scale.set(.9, 1.02, 1.05);
      const neck = addMesh(torsoGrp, new THREE.CylinderGeometry(h * .12, h * .15, h * .2, 14), furM, 0, h * .14, L * .31);
      neck.rotation.x = .38;
      const headGrp = new THREE.Group(); headGrp.position.set(0, h * .22, L * .36); torsoGrp.add(headGrp);
      const cranium = addMesh(headGrp, new THREE.SphereGeometry(h * .195, 22, 18), furM, 0, h * .06, h * .03);
      cranium.scale.set(1.04, .95, 1.02);
      addMesh(headGrp, new THREE.SphereGeometry(h * .072, 14, 12), bellyM, -h * .042, 0, h * .19);
      addMesh(headGrp, new THREE.SphereGeometry(h * .072, 14, 12), bellyM, h * .042, 0, h * .19);
      addMesh(headGrp, new THREE.SphereGeometry(h * .03, 10, 10), earM, 0, h * .035, h * .255);
      const earGeo = new THREE.ConeGeometry(h * .076, h * .18, 4), inEarGeo = new THREE.ConeGeometry(h * .045, h * .13, 4);
      [-1, 1].forEach(s => {
        const eOuter = addMesh(headGrp, earGeo, furM, s * h * .115, h * .24, h * .01);
        eOuter.rotation.z = -s * .22; eOuter.rotation.x = .12;
        const eInner = addMesh(headGrp, inEarGeo, earM, s * h * .115, h * .23, h * .032);
        eInner.rotation.z = -s * .22; eInner.rotation.x = .12;
        addMesh(headGrp, new THREE.SphereGeometry(h * .032, 12, 12), eyeM, s * h * .078, h * .085, h * .185);
        addMesh(headGrp, new THREE.SphereGeometry(h * .016, 8, 8), pupilM, s * h * .08, h * .085, h * .21);
      });
      const makeCatLeg = (lx, lz, isHind) => {
        const hip = new THREE.Group(); hip.position.set(lx, h * .46, lz); root.add(hip);
        const upperR = isHind ? h * .078 : h * .062;
        addMesh(hip, new THREE.SphereGeometry(upperR, 12, 10), furM, 0, 0, 0);
        addMesh(hip, new THREE.CylinderGeometry(upperR, h * .046, h * .23, 12), furM, 0, -h * .115, 0);
        const knee = new THREE.Group(); knee.position.set(0, -h * .22, 0); hip.add(knee);
        addMesh(knee, new THREE.SphereGeometry(h * .045, 10, 10), furM, 0, 0, 0);
        addMesh(knee, new THREE.CylinderGeometry(h * .044, h * .036, h * .21, 12), furM, 0, -h * .105, 0);
        const paw = addMesh(knee, new THREE.SphereGeometry(h * .048, 12, 10), bellyM, 0, -h * .215, h * .022);
        paw.scale.set(.92, .62, 1.28);
        return {hip, knee};
      };
      const fl = makeCatLeg(-h * .115, L * .23, false), fr = makeCatLeg(h * .115, L * .23, false);
      const bl = makeCatLeg(-h * .12, -L * .23, true), br = makeCatLeg(h * .12, -L * .23, true);
      // relaxed, hanging cat tail (rest pose points back and down, curling slightly at the tip)
      const tailGrp = new THREE.Group(); tailGrp.position.set(0, h * .07, -L * .30); torsoGrp.add(tailGrp);
      const tailRest = [-2.05, -.32, .38];
      const tailSegs = buildTailChain(tailGrp, furM, [L * .26, L * .24, L * .20], [h * .05, h * .042, h * .034, h * .026], tailRest);
      g.userData.rig = {type:'cat', h, L, root, torsoGrp, headGrp, fl, fr, bl, br, tailGrp, tailSegs, tailRest};
      break;
    }
    case 'animal': {
      const L = Math.max(.42, w), root = new THREE.Group(); g.add(root);
      const coatM = mat(c, {roughness:.58});
      const darkCoatM = mat(new THREE.Color(c).multiplyScalar(.62), {roughness:.65});
      const chestCoatM = mat(new THREE.Color(c).lerp(new THREE.Color(0xfff8eb), .35), {roughness:.62});
      const noseM = mat(0x16171a, {roughness:.25, metalness:.15});
      const eyeM = mat(0x1b1917, {roughness:.15});
      const collarM = mat(0xd93a40, {roughness:.4, metalness:.2});
      const torsoGrp = new THREE.Group(); torsoGrp.position.set(0, h * .54, 0); root.add(torsoGrp);
      // Ribcage, deep chest & tucked waist
      const ribcage = addMesh(torsoGrp, new THREE.CylinderGeometry(h * .195, h * .165, L * .48, 20), coatM, 0, h * .01, 0);
      ribcage.rotation.x = Math.PI / 2; ribcage.scale.set(.86, 1, 1.05);
      const chest = addMesh(torsoGrp, new THREE.SphereGeometry(h * .21, 20, 16), coatM, 0, -h * .01, L * .22);
      chest.scale.set(.86, 1.06, 1.08);
      const frontBlaze = addMesh(torsoGrp, new THREE.SphereGeometry(h * .16, 16, 12), chestCoatM, 0, -h * .03, L * .28);
      frontBlaze.scale.set(.68, .92, .75);
      const hips = addMesh(torsoGrp, new THREE.SphereGeometry(h * .178, 18, 14), coatM, 0, h * .02, -L * .23);
      hips.scale.set(.86, 1.02, 1.05);
      // Muscular neck & collar
      const neck = addMesh(torsoGrp, new THREE.CylinderGeometry(h * .115, h * .148, h * .24, 16), coatM, 0, h * .15, L * .29);
      neck.rotation.x = .42;
      const collar = addMesh(torsoGrp, new THREE.TorusGeometry(h * .132, h * .018, 10, 24), collarM, 0, h * .09, L * .27);
      collar.rotation.x = Math.PI / 2 + .42;
      // Head, sculpted snout, nose, eyes & ears
      const headGrp = new THREE.Group(); headGrp.position.set(0, h * .26, L * .34); torsoGrp.add(headGrp);
      const skull = addMesh(headGrp, new THREE.SphereGeometry(h * .145, 22, 18), coatM, 0, h * .05, h * .02);
      skull.scale.set(.94, .96, 1.06);
      const muzzle = addMesh(headGrp, new THREE.CylinderGeometry(h * .062, h * .088, h * .16, 16), coatM, 0, h * .018, h * .155);
      muzzle.rotation.x = Math.PI / 2 + .08; muzzle.scale.x = .92;
      const muzzleTip = addMesh(headGrp, new THREE.SphereGeometry(h * .062, 14, 12), chestCoatM, 0, h * .014, h * .225);
      muzzleTip.scale.set(.92, .85, .85);
      addMesh(headGrp, new THREE.SphereGeometry(h * .03, 12, 10), noseM, 0, h * .042, h * .272);
      [-1, 1].forEach(s => {
        addMesh(headGrp, new THREE.SphereGeometry(h * .022, 10, 10), eyeM, s * h * .065, h * .078, h * .135);
        // Sculpted alert/semi-floppy ears
        const earG = new THREE.Group(); earG.position.set(s * h * .105, h * .145, -h * .01); headGrp.add(earG);
        const earBase = addMesh(earG, new THREE.ConeGeometry(h * .058, h * .16, 10), darkCoatM, 0, h * .055, 0);
        earBase.scale.z = .55; earBase.rotation.z = -s * .28; earBase.rotation.x = .22;
      });
      // 4 articulated multi-joint legs (shoulder/hip + knee/hock + paw)
      const makeDogLeg = (lx, lz, isHind) => {
        const hip = new THREE.Group(); hip.position.set(lx, h * .48, lz); root.add(hip);
        const topR = isHind ? h * .078 : h * .062;
        addMesh(hip, new THREE.SphereGeometry(topR, 12, 10), coatM, 0, 0, 0);
        const upper = addMesh(hip, new THREE.CylinderGeometry(topR, h * .046, h * .24, 14), coatM, 0, -h * .12, isHind ? -h * .015 : 0);
        if (isHind) upper.rotation.x = .12;
        const knee = new THREE.Group(); knee.position.set(0, -h * .23, isHind ? -h * .025 : 0); hip.add(knee);
        addMesh(knee, new THREE.SphereGeometry(h * .044, 10, 10), coatM, 0, 0, 0);
        addMesh(knee, new THREE.CylinderGeometry(h * .042, h * .034, h * .23, 12), coatM, 0, -h * .115, 0);
        const paw = addMesh(knee, new THREE.SphereGeometry(h * .048, 12, 10), chestCoatM, 0, -h * .23, h * .025);
        paw.scale.set(.92, .58, 1.32);
        return {hip, knee};
      };
      const fl = makeDogLeg(-h * .115, L * .22, false), fr = makeDogLeg(h * .115, L * .22, false);
      const bl = makeDogLeg(-h * .12, -L * .22, true), br = makeDogLeg(h * .12, -L * .22, true);
      // 3-joint dog tail: sickle curve at rest, wags with a travelling wave, streams back in a run and tucks when sitting
      const tailGrp = new THREE.Group(); tailGrp.position.set(0, h * .06, -L * .30); torsoGrp.add(tailGrp);
      const tailRest = [-1.0, .42, .38];
      const tailSegs = buildTailChain(tailGrp, coatM, [L * .13, L * .12, L * .10], [h * .046, h * .038, h * .03, h * .022], tailRest);
      g.userData.rig = {type:'animal', h, L, root, torsoGrp, headGrp, fl, fr, bl, br, tailGrp, tailSegs, tailRest};
      break;
    }
    case 'car': {
      const L = w, W = w * .46, wheelR = h * .235;
      const paintM = mat(c, {metalness:.62, roughness:.18});
      const darkPaintM = mat(new THREE.Color(c).multiplyScalar(.72), {metalness:.55, roughness:.24});
      const glassM = mat(0x111923, {metalness:.85, roughness:.07});
      const carbonM = mat(0x15171c, {metalness:.3, roughness:.42});
      const chromeM = mat(0xdbe0e8, {metalness:.88, roughness:.14});
      const tireM = mat(0x121316, {roughness:.82, metalness:.05});
      const caliperM = mat(0xe53935, {metalness:.4, roughness:.3});
      const hlM = mat(0xf8fbff, {emissive:0xcfe2ff, roughness:.1});
      const tlM = mat(0xff2424, {emissive:0xb91c1c, roughness:.15});

      const bodyGrp = new THREE.Group();
      g.add(bodyGrp);

      // 1) Lower sculpted GT chassis hull (bumper-to-bumper beltline, hood & rear deck)
      const hullProf = new THREE.Shape();
      const zF = L * .485, zR = -L * .485;
      hullProf.moveTo(zR, h * .18);
      hullProf.lineTo(zF * .96, h * .15);
      hullProf.quadraticCurveTo(zF, h * .15, zF, h * .27);
      hullProf.quadraticCurveTo(zF * .97, h * .44, L * .34, h * .50);
      hullProf.lineTo(L * .14, h * .54);
      hullProf.lineTo(-L * .34, h * .56);
      hullProf.lineTo(zR * .96, h * .55);
      hullProf.quadraticCurveTo(zR, h * .53, zR, h * .40);
      hullProf.closePath();

      const hullW = W * .88;
      const hullGeo = new THREE.ExtrudeGeometry(hullProf, {
        depth:hullW,
        bevelEnabled:true,
        bevelThickness:W * .04,
        bevelSize:h * .026,
        bevelSegments:4,
        curveSegments:20
      });
      hullGeo.rotateY(-Math.PI / 2);
      hullGeo.translate(hullW / 2, 0, 0);
      hullGeo.computeVertexNormals();
      addMesh(bodyGrp, hullGeo, paintM, 0, 0, 0);

      // 2) Upper aerodynamic fastback cabin (painted roof + A/B/C pillars)
      const cabProf = new THREE.Shape();
      cabProf.moveTo(-L * .36, h * .53);
      cabProf.lineTo(L * .16, h * .52);
      cabProf.quadraticCurveTo(L * .03, h * .89, -L * .05, h * .93);
      cabProf.quadraticCurveTo(-L * .20, h * .93, -L * .36, h * .58);
      cabProf.closePath();

      const cabW = W * .72;
      const cabGeo = new THREE.ExtrudeGeometry(cabProf, {
        depth:cabW,
        bevelEnabled:true,
        bevelThickness:W * .035,
        bevelSize:h * .022,
        bevelSegments:3,
        curveSegments:18
      });
      cabGeo.rotateY(-Math.PI / 2);
      cabGeo.translate(cabW / 2, 0, 0);
      cabGeo.computeVertexNormals();
      addMesh(bodyGrp, cabGeo, paintM, 0, 0, 0);

      // 3) Flush side windows (extruded slightly wider than cabW so dark glass sits cleanly in the side profile)
      const winProf = new THREE.Shape();
      winProf.moveTo(-L * .29, h * .56);
      winProf.lineTo(L * .10, h * .55);
      winProf.quadraticCurveTo(L * .01, h * .83, -L * .06, h * .86);
      winProf.quadraticCurveTo(-L * .18, h * .86, -L * .29, h * .60);
      winProf.closePath();

      const winW = W * .795;
      const winGeo = new THREE.ExtrudeGeometry(winProf, {
        depth:winW,
        bevelEnabled:false,
        curveSegments:16
      });
      winGeo.rotateY(-Math.PI / 2);
      winGeo.translate(winW / 2, 0, 0);
      winGeo.computeVertexNormals();
      addMesh(bodyGrp, winGeo, glassM, 0, 0, 0);

      // 4) Curved front windshield & rear fastback glass matching cabProf curvature
      const fWindProf = new THREE.Shape();
      fWindProf.moveTo(L * .168, h * .545);
      fWindProf.quadraticCurveTo(L * .052, h * .895, -L * .015, h * .938);
      fWindProf.lineTo(-L * .045, h * .918);
      fWindProf.quadraticCurveTo(L * .025, h * .87, L * .135, h * .535);
      fWindProf.closePath();
      const fWindW = W * .64;
      const fWindGeo = new THREE.ExtrudeGeometry(fWindProf, {depth:fWindW, bevelEnabled:false, curveSegments:18});
      fWindGeo.rotateY(-Math.PI / 2);
      fWindGeo.translate(fWindW / 2, 0, 0);
      fWindGeo.computeVertexNormals();
      addMesh(bodyGrp, fWindGeo, glassM, 0, 0, 0);

      const rWindProf = new THREE.Shape();
      rWindProf.moveTo(-L * .10, h * .936);
      rWindProf.quadraticCurveTo(-L * .215, h * .925, -L * .368, h * .595);
      rWindProf.lineTo(-L * .335, h * .58);
      rWindProf.quadraticCurveTo(-L * .195, h * .895, -L * .085, h * .912);
      rWindProf.closePath();
      const rWindW = W * .62;
      const rWindGeo = new THREE.ExtrudeGeometry(rWindProf, {depth:rWindW, bevelEnabled:false, curveSegments:18});
      rWindGeo.rotateY(-Math.PI / 2);
      rWindGeo.translate(rWindW / 2, 0, 0);
      rWindGeo.computeVertexNormals();
      addMesh(bodyGrp, rWindGeo, glassM, 0, 0, 0);

      // B-pillar trim & hood power-dome sculpt
      [-1, 1].forEach(sx => {
        const bPil = addMesh(bodyGrp, new THREE.BoxGeometry(W * .015, h * .30, L * .028), carbonM, sx * W * .396, h * .70, -L * .08);
        bPil.rotation.z = -sx * .06;
      });
      const dome = addMesh(bodyGrp, new THREE.BoxGeometry(W * .44, h * .028, L * .25), darkPaintM, 0, h * .525, L * .28);
      dome.rotation.x = .08;

      // Rounded fender wheel-arch lips, side skirts, mirrors & door handles
      const archTorusGeo = new THREE.TorusGeometry(wheelR * 1.04, W * .038, 12, 24, Math.PI);
      [-1, 1].forEach(sx => {
        const fArch = addMesh(bodyGrp, archTorusGeo, paintM, sx * W * .455, wheelR * 1.0, L * .295);
        fArch.rotation.y = Math.PI / 2;
        const rArch = addMesh(bodyGrp, archTorusGeo, paintM, sx * W * .455, wheelR * 1.0, -L * .295);
        rArch.rotation.y = Math.PI / 2;
        // Carbon side skirts between wheels
        addMesh(bodyGrp, new THREE.BoxGeometry(W * .045, h * .05, L * .36), carbonM, sx * W * .47, h * .165, 0);
        // Sculpted side mirrors with arm
        const mir = addMesh(bodyGrp, new THREE.BoxGeometry(W * .085, h * .05, L * .042), paintM, sx * W * .455, h * .58, L * .11);
        mir.rotation.y = -sx * .18;
        // Flush chrome door handles
        addMesh(bodyGrp, new THREE.BoxGeometry(W * .018, h * .02, L * .052), chromeM, sx * W * .472, h * .48, -L * .03);
      });

      // Front splitter, honeycomb grille & aggressive LED headlights
      addMesh(bodyGrp, new THREE.BoxGeometry(W * .98, h * .045, L * .08), carbonM, 0, h * .15, L * .465);
      addMesh(bodyGrp, new THREE.BoxGeometry(W * .54, h * .14, L * .04), carbonM, 0, h * .28, L * .478);
      [-1, 1].forEach(sx => {
        const hl = addMesh(bodyGrp, new THREE.BoxGeometry(W * .21, h * .058, L * .045), hlM, sx * W * .33, h * .38, L * .468);
        hl.rotation.y = -sx * .14;
        addMesh(bodyGrp, new THREE.BoxGeometry(W * .18, h * .08, L * .03), carbonM, sx * W * .35, h * .24, L * .475);
      });

      // Rear diffuser, lip spoiler, full-width LED lightbar & quad exhaust tips
      addMesh(bodyGrp, new THREE.BoxGeometry(W * .96, h * .09, L * .06), carbonM, 0, h * .20, -L * .468);
      const spoiler = addMesh(bodyGrp, new THREE.BoxGeometry(W * .86, h * .032, L * .065), carbonM, 0, h * .61, -L * .46);
      spoiler.rotation.x = .18;
      addMesh(bodyGrp, new THREE.BoxGeometry(W * .86, h * .032, L * .025), tlM, 0, h * .49, -L * .482);
      [-1, 1].forEach(sx => {
        addMesh(bodyGrp, new THREE.BoxGeometry(W * .24, h * .068, L * .03), tlM, sx * W * .31, h * .48, -L * .48);
        const ex1 = addMesh(bodyGrp, new THREE.CylinderGeometry(h * .028, h * .028, L * .05, 12), chromeM, sx * W * .28, h * .19, -L * .485);
        ex1.rotation.x = Math.PI / 2;
        const ex2 = addMesh(bodyGrp, new THREE.CylinderGeometry(h * .028, h * .028, L * .05, 12), chromeM, sx * W * .21, h * .19, -L * .485);
        ex2.rotation.x = Math.PI / 2;
      });

      // 4 detailed 5-spoke performance wheels with brake rotors & red calipers
      const wheelW = W * .155;
      const tireGeo = new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 28);
      const rimOuterGeo = new THREE.CylinderGeometry(wheelR * .68, wheelR * .68, wheelW * 1.02, 24);
      const rotorGeo = new THREE.CylinderGeometry(wheelR * .52, wheelR * .52, wheelW * .35, 18);
      const spokeGeo = new THREE.BoxGeometry(wheelW * 1.05, wheelR * .62, wheelR * .11);
      const wheels = [], frontSteer = [];
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
        const steerGrp = new THREE.Group();
        steerGrp.position.set(sx * W * .45, wheelR, sz * L * .30);
        g.add(steerGrp);
        if (sz > 0) frontSteer.push(steerGrp);
        // Brake caliper (fixed to knuckle)
        addMesh(steerGrp, new THREE.BoxGeometry(wheelW * .55, wheelR * .42, wheelR * .24), caliperM, sx * wheelW * .18, wheelR * .12, -sz * wheelR * .32);
        const spinGrp = new THREE.Group();
        steerGrp.add(spinGrp);
        wheels.push(spinGrp);
        const tire = addMesh(spinGrp, tireGeo, tireM, 0, 0, 0); tire.rotation.z = Math.PI / 2;
        const rotor = addMesh(spinGrp, rotorGeo, darkPaintM, 0, 0, 0); rotor.rotation.z = Math.PI / 2;
        const hub = addMesh(spinGrp, new THREE.CylinderGeometry(wheelR * .2, wheelR * .2, wheelW * 1.06, 14), chromeM, 0, 0, 0); hub.rotation.z = Math.PI / 2;
        const rimRing = addMesh(spinGrp, rimOuterGeo, mat(0x23262d, {metalness:.6, roughness:.3}), 0, 0, 0); rimRing.rotation.z = Math.PI / 2;
        for (let sp = 0; sp < 5; sp++) {
          const ang = (sp / 5) * Math.PI * 2;
          const spk = addMesh(spinGrp, spokeGeo, chromeM, 0, Math.cos(ang) * wheelR * .31, Math.sin(ang) * wheelR * .31);
          spk.rotation.x = -ang;
        }
      });
      g.userData.rig = {type:'car', h, L, W, bodyGrp, wheels, frontSteer, wheelR};
      break;
    }
    case 'phone': {
      const d = Math.max(.008, w * .1);
      addMesh(g, new THREE.BoxGeometry(w, h, d), mat(c, {metalness:.5, roughness:.25}), 0, h / 2, 0);
      addMesh(g, new THREE.PlaneGeometry(w * .91, h * .94), mat(0x0b0d13, {roughness:.12, metalness:.5}), 0, h / 2, d / 2 + .0006);
      addMesh(g, new THREE.BoxGeometry(w * .4, w * .4, d * .55), mat(0x1c1e24, {metalness:.4, roughness:.3}), -w * .21, h * .81, -d / 2 - d * .25);
      break;
    }
    case 'tree': {
      const trunkM = mat(0x6b472a, {roughness:.85}), leafM = mat(c === '#e85d2b' ? 0x3b8c47 : c, {roughness:.7});
      addMesh(g, new THREE.CylinderGeometry(w * .1, w * .15, h * .42, 14), trunkM, 0, h * .21, 0);
      addMesh(g, new THREE.SphereGeometry(w * .44, 18, 14), leafM, 0, h * .58, 0);
      addMesh(g, new THREE.SphereGeometry(w * .34, 16, 12), leafM, -w * .18, h * .52, w * .12);
      addMesh(g, new THREE.SphereGeometry(w * .34, 16, 12), leafM, w * .18, h * .54, -w * .1);
      addMesh(g, new THREE.SphereGeometry(w * .3, 16, 12), leafM, 0, h * .8, 0);
      break;
    }
    case 'table': {
      const D = depthFor(o), topH = Math.max(.03, h * .06), legW = Math.max(.035, Math.min(w, D) * .07);
      const woodM = mat(c, {roughness:.55});
      addMesh(g, new THREE.BoxGeometry(w, topH, D), woodM, 0, h - topH / 2, 0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        addMesh(g, new THREE.BoxGeometry(legW, h - topH, legW), woodM, sx * (w / 2 - legW * 1.1), (h - topH) / 2, sz * (D / 2 - legW * 1.1));
      });
      break;
    }
    case 'chair': {
      const D = depthFor(o), seatY = h * .48, seatT = Math.max(.03, h * .05), legW = Math.max(.028, w * .075);
      const chM = mat(c, {roughness:.55});
      addMesh(g, new THREE.BoxGeometry(w, seatT, D), chM, 0, seatY, 0);
      addMesh(g, new THREE.BoxGeometry(w, h - seatY, seatT), chM, 0, seatY + (h - seatY) / 2, -D / 2 + seatT / 2);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        addMesh(g, new THREE.CylinderGeometry(legW * .5, legW * .42, seatY, 10), chM, sx * (w / 2 - legW), seatY / 2, sz * (D / 2 - legW));
      });
      break;
    }
    case 'backdrop': {
      // Smooth continuous one-piece L-shaped studio cyclorama backdrop (matching Image 1)
      const floorL = Math.max(1.4, w * .68);
      const t = Math.max(.045, Math.min(h, w) * .028);
      const rIn = clamp(Math.min(h, floorL) * .32, .22, .85);
      const rOut = rIn + t;
      const zBack = -floorL / 2, zFront = floorL / 2;
      const zC = zBack + rOut, yC = rOut;
      const shape = new THREE.Shape();
      shape.moveTo(zBack, h);
      shape.lineTo(zBack + t, h);
      shape.lineTo(zBack + t, yC);
      shape.absarc(zC, yC, rIn, Math.PI, Math.PI * 1.5, false);
      shape.lineTo(zFront, t);
      shape.lineTo(zFront, 0);
      shape.lineTo(zC, 0);
      shape.absarc(zC, yC, rOut, Math.PI * 1.5, Math.PI, true);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {depth:w, bevelEnabled:false, curveSegments:32});
      geo.translate(0, 0, -w / 2);
      geo.rotateY(-Math.PI / 2);
      geo.computeVertexNormals();
      const bdCol = c === '#e85d2b' ? '#dcdedf' : c;
      const bdM = mat(bdCol, {roughness:.8, metalness:.04});
      addMesh(g, geo, bdM, 0, 0, 0);
      break;
    }
    case 'sphere': { const s = addMesh(g, new THREE.SphereGeometry(h / 2, 32, 24), m, 0, h / 2, 0); s.scale.x = s.scale.z = w / h; break; }
    case 'cylinder': addMesh(g, new THREE.CylinderGeometry(w / 2, w / 2, h, 32), m, 0, h / 2, 0); break;
    case 'cone': addMesh(g, new THREE.ConeGeometry(w / 2, h, 32), m, 0, h / 2, 0); break;
    case 'pyramid': { const py = addMesh(g, new THREE.ConeGeometry(w * .7, h, 4), m, 0, h / 2, 0); py.rotation.y = Math.PI / 4; break; }
    case 'torus': { const t = addMesh(g, new THREE.TorusGeometry(h * .36, h * .13, 18, 42), m, 0, h / 2, 0); t.scale.x = w / h; break; }
    case 'tube': {
      const outer = w / 2, inner = outer * .62;
      const shape = new THREE.Shape(); shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true); shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {depth:h, bevelEnabled:false, curveSegments:28});
      geo.rotateX(Math.PI / 2);
      addMesh(g, geo, m, 0, h, 0);
      break;
    }
    case 'disc': addMesh(g, new THREE.CylinderGeometry(w / 2, w / 2, Math.max(.015, h), 36), m, 0, Math.max(.015, h) / 2, 0); break;
    case 'plane': addMesh(g, new THREE.BoxGeometry(w, Math.max(.01, h), w), m, 0, Math.max(.01, h) / 2, 0); break;
    case 'platonic': addMesh(g, new THREE.DodecahedronGeometry(Math.max(w, h) * .5), m, 0, h / 2, 0); break;
    case 'capsule': {
      const r = w / 2, body = Math.max(.001, h - w);
      addMesh(g, new THREE.CylinderGeometry(r, r, body, 24), m, 0, r + body / 2, 0);
      addMesh(g, new THREE.SphereGeometry(r, 24, 12), m, 0, r + body, 0); addMesh(g, new THREE.SphereGeometry(r, 24, 12), m, 0, r, 0);
      break;
    }
    case 'image': {
      const ref = AC.refs[o.img], img = ref?.img;
      const ar = img && img.naturalWidth ? img.naturalWidth / img.naturalHeight : .7;
      let mm = mat(0x888888);
      if (img && img.naturalWidth) {
        const tx = new THREE.Texture(img); tx.needsUpdate = true; tx.encoding = THREE.sRGBEncoding;
        mm = new THREE.MeshStandardMaterial({map:tx, side:THREE.DoubleSide, roughness:.9, transparent:!!ref.alpha, alphaTest:ref.alpha ? .05 : 0});
      }
      const p = addMesh(g, new THREE.PlaneGeometry(h * ar, h), mm, 0, h / 2, 0); p.castShadow = false;
      break;
    }
    case 'custom': {
      const entry = CUSTOM.get(o.customId);
      if (!entry) {
        // the file lives only in this browser session: show a wire box until the model is uploaded again
        const ph = addMesh(g, new THREE.BoxGeometry(Math.max(.2, w), h, Math.max(.2, w)), new THREE.MeshStandardMaterial({color:0x9aa0a6, wireframe:true}), 0, h / 2, 0);
        ph.userData.noOutline = true;
        break;
      }
      const sc = h / Math.max(1e-6, entry.size.y);
      const holder = new THREE.Group();
      holder.scale.setScalar(sc);
      holder.position.set(-entry.center.x * sc, -entry.min.y * sc, -entry.center.z * sc);
      const SU = THREE.SkeletonUtils;
      const clone = SU && SU.clone ? SU.clone(entry.root) : entry.root.clone(true);
      clone.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; n.frustumCulled = false; n.userData.noOutline = true; } });
      holder.add(clone); g.add(holder);
      if (entry.clips.length) g.userData.customRig = {mixer:new THREE.AnimationMixer(clone), clips:entry.clips, cur:null, action:null};
      // invisible box used for click-picking + orange edge box as the selection outline (skinned meshes can't use the shell outline)
      const bw = Math.max(.02, entry.size.x * sc), bd = Math.max(.02, entry.size.z * sc);
      const proxy = new THREE.Mesh(new THREE.BoxGeometry(bw, h, bd), new THREE.MeshBasicMaterial({visible:false}));
      proxy.position.set(0, h / 2, 0); proxy.userData.noOutline = true; proxy.userData.pickProxy = true; g.add(proxy);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(proxy.geometry), new THREE.LineBasicMaterial({color:0xff9f1c}));
      edges.position.copy(proxy.position); edges.visible = false; edges.userData.isOutline = true; g.add(edges);
      g.userData.extraOutlines = [edges];
      break;
    }
    case 'group': {
      (o.children || []).forEach(ch => {
        const cg = buildSingleModel(ch);
        cg.position.set(ch.dx || 0, ch.dy || 0, ch.dz || 0);
        cg.rotation.y = rad(ch.dry || 0);
        g.add(cg);
      });
      break;
    }
    default: addMesh(g, new THREE.BoxGeometry(w, h, depthFor(o)), m, 0, h / 2, 0);
  }
  return g;
}
function buildModel(o) {
  const THREE = R.THREE, g = buildSingleModel(o);
  const bodyMeshes = [];
  g.traverse(n => {
    n.userData.oid = o.id;
    if (n.isMesh && !n.userData.isOutline) bodyMeshes.push(n);
  });
  const outlines = [];
  const backMatPrimary = new THREE.MeshBasicMaterial({color:0xff8c1a, side:THREE.BackSide});
  const edgeMatPrimary = new THREE.LineBasicMaterial({color:0xff9f1c});
  bodyMeshes.forEach(m => {
    if (m.userData.noOutline || m.isSkinnedMesh) return;
    const gType = m.geometry?.type || '';
    const isFlat = gType === 'PlaneGeometry' || gType === 'RingGeometry' || gType === 'CircleGeometry';
    if (!isFlat) {
      const sh = new THREE.Mesh(m.geometry, backMatPrimary);
      sh.scale.set(1.065, 1.045, 1.065);
      sh.castShadow = false; sh.receiveShadow = false; sh.visible = false;
      sh.userData.isOutline = true; sh.userData.oid = o.id;
      m.add(sh);
      outlines.push(sh);
    }
    if (isFlat || gType === 'BoxGeometry') {
      const ed = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 75), edgeMatPrimary);
      ed.visible = false; ed.userData.isOutline = true; ed.userData.oid = o.id;
      m.add(ed);
      outlines.push(ed);
    }
  });
  (g.userData.extraOutlines || []).forEach(x => { x.userData.oid = o.id; outlines.push(x); });
  g.userData.outlines = outlines;
  g.userData.oid = o.id;
  return g;
}

let liveRigRaf = 0;
let liveRigRunning = false;
let activeVpDrag = false;
function ensureLiveRigLoop() {
  if (liveRigRunning || !is3D() || exporting) return;
  const hasLivePose = (V().objects || []).some(o => isRiggedChar(o.model) && (o.pose === 'walking_still' || o.pose === 'running_still'));
  if (!hasLivePose) return;
  liveRigRunning = true;
  let lastT = performance.now();
  const tick = now => {
    if (!is3D() || exporting) { liveRigRunning = false; liveRigRaf = 0; return; }
    const dt = clamp((now - lastT) / 1000, .004, .06);
    lastT = now;
    const objs = (V().objects || []).filter(o => isRiggedChar(o.model) && (o.pose === 'walking_still' || o.pose === 'running_still'));
    if (!objs.length) { liveRigRunning = false; liveRigRaf = 0; return; }
    if (!playing && !activeVpDrag) {
      objs.forEach(o => {
        const isRun = o.pose === 'running_still';
        const spd = isRun ? 1.85 : .78;
        o.ry = 90;
        const hasXTrack = isVideo() && tracks()[`obj.${o.id}.x`]?.length > 1;
        if (!hasXTrack) {
          let nx = (o.x || 0) + spd * dt;
          if (nx > 2.3) nx = -2.3;
          o.x = rnd(nx, 3);
        }
      });
      syncObjProps();
      AC.drawAll();
    }
    if (!playing) renderVP();
    liveRigRaf = requestAnimationFrame(tick);
  };
  liveRigRaf = requestAnimationFrame(tick);
}

// Compute real-time velocity, walk/run phase, jump preparation crouch, and vehicle wheel/drift dynamics
// Deterministic travelled-distance table along an object's keyframed path: walk cycles & wheel spin depend only on timeline time,
// so the live preview and the exported video are frame-for-frame identical (no more lag / frozen gaits in the export).
const pathCache = new Map();
function pathDist(o, t) {
  const kx = tracks()[`obj.${o.id}.x`], kz = tracks()[`obj.${o.id}.z`];
  if (!((kx && kx.length > 1) || (kz && kz.length > 1))) return null;
  const kr = tracks()[`obj.${o.id}.ry`], dur = S.video.duration || 5;
  const sig = dur + '|' + JSON.stringify([kx, kz, kr, o.x, o.z, o.ry]);
  let c = pathCache.get(o.id);
  if (!c || c.sig !== sig) {
    const N = Math.max(4, Math.ceil(dur * 120)), dt = dur / N, u = new Float32Array(N + 1), s = new Float32Array(N + 1);
    const at = (tt) => [valueAt(`obj.${o.id}.x`, tt, 'num', o.x), valueAt(`obj.${o.id}.z`, tt, 'num', o.z), valueAt(`obj.${o.id}.ry`, tt, 'num', o.ry)];
    let [px, pz] = at(0);
    for (let i = 1; i <= N; i++) {
      const [x, z, ry] = at(i * dt), dx = x - px, dz = z - pz, r = rad(ry);
      const stepDist = Math.hypot(dx, dz);
      const fwdProj = dx * Math.sin(r) + dz * Math.cos(r);
      const dirSign = fwdProj < -stepDist * .25 ? -1 : 1;
      u[i] = u[i - 1] + stepDist;
      s[i] = s[i - 1] + dirSign * stepDist;
      px = x; pz = z;
    }
    c = {sig, dt, N, u, s}; pathCache.set(o.id, c);
  }
  const f = clamp(t / c.dt, 0, c.N), i0 = Math.floor(f), i1 = Math.min(c.N, i0 + 1), w = f - i0;
  return {u:c.u[i0] + (c.u[i1] - c.u[i0]) * w, s:c.s[i0] + (c.s[i1] - c.s[i0]) * w};
}

// Compute velocity, walk/run phase, jump preparation crouch, tails and vehicle wheel/drift dynamics
function updateRigPoseAndMotion(o, g, t) {
  const rig = g.userData.rig;
  if (!rig) return;
  let st = rigMotionState.get(o.id);
  if (!st) {
    st = {x:o.x || 0, y:o.y || 0, z:o.z || 0, ry:o.ry || 0, t:performance.now(), phase:0, wheelSpin:0, moveHold:0, jumpPrep:0};
    rigMotionState.set(o.id, st);
  }
  const now = performance.now(), dt = clamp((now - st.t) / 1000, .001, .15);
  const clocked = isVideo() && (playing || exporting);
  let vx = 0, vz = 0, vy = 0, vRy = 0, crouchPrep = 0, timelineSpeed = 0, pd = null;
  // 1) Timeline keyframe velocity when in Video mode (analytic, independent of the real frame rate)
  if (isVideo()) {
    const dur = S.video.duration || 5, dtSample = .025, tPrev = Math.max(0, t - dtSample), tNext = Math.min(dur, t + dtSample), span = Math.max(.005, tNext - tPrev);
    const V1 = (k, tt) => valueAt(`obj.${o.id}.${k}`, tt, 'num', o[k]);
    vx = (V1('x', tNext) - V1('x', tPrev)) / span; vz = (V1('z', tNext) - V1('z', tPrev)) / span;
    vy = (V1('y', tNext) - V1('y', tPrev)) / span; vRy = (V1('ry', tNext) - V1('ry', tPrev)) / span;
    timelineSpeed = Math.hypot(vx, vz);
    const yFuture = V1('y', Math.min(dur, t + .22));
    if ((o.y || 0) <= .04 && yFuture > .10) crouchPrep = clamp((yFuture - (o.y || 0)) / .32, 0, 1);
    pd = pathDist(o, t);
  }
  const useClock = clocked || !!pd;
  // 2) Check automatic chair sitting for person before drag-walk so placing/aligning with a chair seats immediately
  if (rig.type === 'person' && timelineSpeed <= .05 && o.y <= .08 && o.pose !== 'walking_still' && o.pose !== 'running_still') {
    checkAutoSitOnChair(o, false);
    g.rotation.y = rad(o.ry || 0);
  }
  // 3) Interactive drag movement (moving the object in a view) only when the timeline is not driving it
  const dxDrag = (o.x || 0) - st.x, dzDrag = (o.z || 0) - st.z, dyDrag = (o.y || 0) - st.y;
  const dragSpeed = Math.hypot(dxDrag, dzDrag) / dt;
  const animalish = rig.type === 'cat' || rig.type === 'animal';
  const wheelR = rig.wheelR || .3;
  if (pd && !activeVpDrag) {
    st.phase = pd.u * (animalish ? 6.4 : 4.4);
    st.wheelSpin = pd.s / wheelR;
  } else if (!useClock && dragSpeed > .08 && o.pose !== 'sitting_chair') {
    vx = dxDrag / dt; vz = dzDrag / dt;
    st.moveHold = now + 160;
    st.phase += Math.hypot(dxDrag, dzDrag) * (animalish ? 6.4 : 5.2);
    st.wheelSpin += Math.hypot(dxDrag, dzDrag) / wheelR;
    clearTimeout(st.settleTimer);
    st.settleTimer = setTimeout(() => renderVP(), 170);
  }
  if (dyDrag > .015 && (o.y || 0) < .28 && !useClock) st.jumpPrep = now + 220;
  st.x = o.x || 0; st.y = o.y || 0; st.z = o.z || 0; st.ry = o.ry || 0; st.t = now;

  // If Walking or Running pose is selected on Person / Cat / Animal, face right (+X, ry=90) and advance the gait at a fixed cadence
  const isPoseWalk = isRiggedChar(o.model) && o.pose === 'walking_still';
  const isPoseRun = isRiggedChar(o.model) && o.pose === 'running_still';
  if (isPoseWalk || isPoseRun) {
    if (!activeVpDrag && (!isVideo() || !tracks()[`obj.${o.id}.ry`]?.length)) {
      o.ry = 90;
      g.rotation.y = rad(90);
    }
    const cadence = animalish ? (isPoseRun ? 12.5 : 6.6) : (isPoseRun ? 11.5 : 5.6);
    if (useClock) st.phase = t * cadence; else st.phase += dt * cadence;
    ensureLiveRigLoop();
  }

  const rawSpeed = o.pose === 'sitting_chair' ? 0 : Math.max(Math.hypot(vx, vz), now < st.moveHold ? .65 : 0);
  const speed = isPoseRun ? Math.max(rawSpeed, 2.3) : isPoseWalk ? Math.max(rawSpeed, .95) : rawSpeed;
  const isMoving = (speed > .05 || isPoseWalk || isPoseRun) && o.y <= .08;
  const isRunning = isPoseRun || (isMoving && speed > (animalish ? 1.5 : 1.65));
  const isPrep = crouchPrep > .05 || now < st.jumpPrep || o.pose === 'crouch_prep';
  const isAirborne = (o.y || 0) > .08 || JUMP_POSES.has(o.pose);
  const rawAir = JUMP_POSES.has(o.pose) ? 1 : clamp(((o.y || 0) - .01) / .18, 0, 1);
  const airBlend = rawAir * rawAir * (3 - 2 * rawAir);
  rig.st = st;

  if (rig.type === 'person') {
    const h = rig.h, {root, torsoGrp, headGrp, leftArm, rightArm, leftLeg, rightLeg} = rig;
    rig.seatedChair = false;
    root.position.set(0, 0, 0); torsoGrp.rotation.set(0, 0, 0); headGrp.rotation.set(0, 0, 0);
    leftArm.sh.rotation.set(0, 0, -.09); leftArm.elbow.rotation.set(0, 0, 0);
    rightArm.sh.rotation.set(0, 0, .09); rightArm.elbow.rotation.set(0, 0, 0);
    leftLeg.hip.rotation.set(0, 0, 0); leftLeg.knee.rotation.set(0, 0, 0);
    rightLeg.hip.rotation.set(0, 0, 0); rightLeg.knee.rotation.set(0, 0, 0);

    if (isPrep && airBlend < .99) {
      const amt = (crouchPrep > .05 ? crouchPrep : .85) * (1 - airBlend);
      root.position.y = -h * .14 * amt;
      torsoGrp.rotation.x = .38 * amt;
      headGrp.rotation.x = -.25 * amt;
      leftLeg.hip.rotation.x = -.85 * amt; leftLeg.knee.rotation.x = 1.45 * amt;
      rightLeg.hip.rotation.x = -.85 * amt; rightLeg.knee.rotation.x = 1.45 * amt;
      leftArm.sh.rotation.x = .65 * amt; leftArm.elbow.rotation.x = -.45 * amt;
      rightArm.sh.rotation.x = .65 * amt; rightArm.elbow.rotation.x = -.45 * amt;
    } else if (isRunning) {
      // Full dynamic running gait (high knee drive, forward torso lean, pumped bent elbows)
      const s = Math.sin(st.phase), c = Math.cos(st.phase);
      const amp = .88;
      root.position.y = Math.abs(c) * h * .042 - h * .018;
      torsoGrp.rotation.x = .26;
      torsoGrp.rotation.y = s * .14;
      headGrp.rotation.x = -.16;
      headGrp.rotation.y = -s * .08;
      leftLeg.hip.rotation.x = s * amp - .08;
      leftLeg.knee.rotation.x = Math.max(.12, (-s * .5 + .5) * 1.28);
      rightLeg.hip.rotation.x = -s * amp - .08;
      rightLeg.knee.rotation.x = Math.max(.12, (s * .5 + .5) * 1.28);
      leftArm.sh.rotation.x = -s * .85;
      leftArm.elbow.rotation.x = -1.12 - Math.max(0, -s) * .25;
      rightArm.sh.rotation.x = s * .85;
      rightArm.elbow.rotation.x = -1.12 - Math.max(0, s) * .25;
    } else if (isMoving) {
      // Natural articulated walking gait toward right (+X) or along path
      const amp = clamp(speed * .45, .42, .62), s = Math.sin(st.phase), c = Math.cos(st.phase);
      root.position.y = Math.abs(c) * h * .022;
      torsoGrp.rotation.x = .06;
      torsoGrp.rotation.y = s * .08;
      leftLeg.hip.rotation.x = s * amp;
      leftLeg.knee.rotation.x = Math.max(.04, -s) * amp * 1.18;
      rightLeg.hip.rotation.x = -s * amp;
      rightLeg.knee.rotation.x = Math.max(.04, s) * amp * 1.18;
      leftArm.sh.rotation.x = -s * amp * .78;
      leftArm.elbow.rotation.x = -Math.max(.18, -s * .45);
      rightArm.sh.rotation.x = s * amp * .78;
      rightArm.elbow.rotation.x = -Math.max(.18, s * .45);
    } else if (airBlend < .99) {
      checkAutoSitOnChair(o, false);
      g.rotation.y = rad(o.ry || 0);
      switch (o.pose || 'standing') {
        case 'sitting_chair': {
          const aligned = findAlignedChairForPerson(o);
          const ch = aligned?.chair || (V().objects || []).find(c => c.model === 'chair');
          const chH = ch ? (ch.h || .86) : .86;
          const chY = ch ? Math.max(0, ch.y || 0) : 0;
          const seatTopY = chY + chH * .48 + Math.max(.03, chH * .05) / 2;
          root.position.y = (seatTopY - Math.max(0, o.y || 0)) - h * .422;
          if (aligned) {
            const targetLocalX = clamp(aligned.localX, -aligned.W * .12, aligned.W * .12);
            const targetLocalZ = -aligned.D * .12;
            root.position.x = (targetLocalX - aligned.localX) / (g.scale.x || 1);
            root.position.z = targetLocalZ - aligned.localZ;
          } else {
            root.position.z = 0;
          }
          const hipWorldY = seatTopY + h * .048;
          const alpha = Math.asin(clamp((hipWorldY - h * .2405) / (h * .23), -.35, .65));
          const bend = Math.PI / 2 - alpha;
          leftLeg.hip.rotation.x = -bend; leftLeg.knee.rotation.x = bend;
          rightLeg.hip.rotation.x = -bend; rightLeg.knee.rotation.x = bend;
          leftArm.sh.rotation.x = -.28; leftArm.elbow.rotation.x = -.85;
          rightArm.sh.rotation.x = -.28; rightArm.elbow.rotation.x = -.85;
          rig.seatedChair = true;
          break;
        }
        case 'sitting_ground':
          root.position.y = -h * .38;
          leftLeg.hip.rotation.x = -1.35; leftLeg.hip.rotation.z = -.25; leftLeg.knee.rotation.x = 1.6;
          rightLeg.hip.rotation.x = -1.35; rightLeg.hip.rotation.z = .25; rightLeg.knee.rotation.x = 1.6;
          leftArm.sh.rotation.x = -.2; leftArm.elbow.rotation.x = -.5;
          rightArm.sh.rotation.x = -.2; rightArm.elbow.rotation.x = -.5;
          break;
        case 'waving':
          rightArm.sh.rotation.z = 2.35; rightArm.sh.rotation.x = -.25; rightArm.elbow.rotation.z = .45;
          leftArm.sh.rotation.z = -.12;
          break;
        case 'arms_crossed':
          leftArm.sh.rotation.x = -.65; leftArm.sh.rotation.z = .38; leftArm.elbow.rotation.y = .85; leftArm.elbow.rotation.x = -1.1;
          rightArm.sh.rotation.x = -.65; rightArm.sh.rotation.z = -.38; rightArm.elbow.rotation.y = -.85; rightArm.elbow.rotation.x = -1.1;
          break;
        case 'pointing':
          rightArm.sh.rotation.x = -1.48; rightArm.elbow.rotation.x = -.08;
          headGrp.rotation.y = -.08;
          break;
        case 'thinking':
          rightArm.sh.rotation.x = -.95; rightArm.sh.rotation.z = -.25; rightArm.elbow.rotation.x = -1.65;
          leftArm.sh.rotation.x = -.45; leftArm.elbow.rotation.x = -1.15;
          headGrp.rotation.x = .12;
          break;
      }
    }
    if (airBlend > .001) {
      const mix = (a, b) => a + (b - a) * airBlend;
      root.position.y = mix(root.position.y, 0);
      torsoGrp.rotation.x = mix(torsoGrp.rotation.x, -.08);
      leftArm.sh.rotation.x = mix(leftArm.sh.rotation.x, -2.1);
      leftArm.sh.rotation.z = mix(leftArm.sh.rotation.z, -.35);
      leftArm.elbow.rotation.x = mix(leftArm.elbow.rotation.x, -.35);
      rightArm.sh.rotation.x = mix(rightArm.sh.rotation.x, -2.1);
      rightArm.sh.rotation.z = mix(rightArm.sh.rotation.z, .35);
      rightArm.elbow.rotation.x = mix(rightArm.elbow.rotation.x, -.35);
      leftLeg.hip.rotation.x = mix(leftLeg.hip.rotation.x, -.55);
      leftLeg.knee.rotation.x = mix(leftLeg.knee.rotation.x, .95);
      rightLeg.hip.rotation.x = mix(rightLeg.hip.rotation.x, .25);
      rightLeg.knee.rotation.x = mix(rightLeg.knee.rotation.x, .65);
    }
  } else if (rig.type === 'cat' || rig.type === 'animal') {
    animateQuadruped(rig, o, st, {isRunning, isMoving, isPrep, isAirborne, airBlend, crouchPrep, t, vy});
  } else if (rig.type === 'car') {
    animateCar(rig, o, st, {vx, vz, vy, vRy, timelineSpeed, isAirborne, dt});
  }
}

// Cat & dog body rig: gaits, mid-air leap, crouch before a jump, sit / sleep / bow poses, then the tail
function animateQuadruped(rig, o, st, c) {
  const dog = rig.type === 'animal';
  const h = rig.h, {root, neckGrp, headGrp, fl, fr, bl, br} = rig;
  root.position.set(0, 0, 0); root.rotation.set(0, 0, 0);
  if (neckGrp) neckGrp.rotation.set(0, 0, 0);
  headGrp.rotation.set(0, 0, 0);
  [fl, fr, bl, br].forEach(l => { l.hip.rotation.set(0, 0, 0); l.knee.rotation.set(0, 0, 0); });
  const pose = o.pose || 'standing';
  const airBlend = c.airBlend ?? (c.isAirborne ? 1 : 0);
  let tail = 'stand';
  const crouch = amt => {
    root.position.y = -h * (dog ? .15 : .16) * amt; root.rotation.x = .12 * amt;
    fl.hip.rotation.x = -.5 * amt; fl.knee.rotation.x = .6 * amt;
    fr.hip.rotation.x = -.5 * amt; fr.knee.rotation.x = .6 * amt;
    bl.hip.rotation.x = .6 * amt; bl.knee.rotation.x = -.7 * amt;
    br.hip.rotation.x = .6 * amt; br.knee.rotation.x = -.7 * amt;
    headGrp.rotation.x = -.12 * amt;
    tail = 'crouch';
  };
  if (airBlend < .99) {
    if (c.isPrep || pose === 'pouncing') {
      crouch(c.crouchPrep > .05 ? c.crouchPrep : .9);
    } else if (c.isRunning) {
      // bounding gallop: front pair and hind pair stride with spinal pitch & bound
      const k = dog ? 1.15 : 1.15, s = Math.sin(st.phase * k), cs = Math.cos(st.phase * k), off = dog ? .4 : .35;
      root.position.y = Math.max(0, cs) * h * (dog ? .12 : .11) - h * .02;
      root.rotation.x = s * (dog ? .19 : .18);
      if (neckGrp) neckGrp.rotation.x = (dog ? .18 : .14) - s * .1;
      if (dog) headGrp.rotation.x = -.1;
      const a = dog ? .76 : .72, b = dog ? .82 : .78, kk = dog ? .72 : .65;
      fl.hip.rotation.x = s * a; fl.knee.rotation.x = Math.max(0, -s) * kk;
      fr.hip.rotation.x = Math.sin(st.phase * k + off) * a; fr.knee.rotation.x = Math.max(0, -cs) * kk;
      bl.hip.rotation.x = -s * b; bl.knee.rotation.x = -Math.max(0, s) * kk;
      br.hip.rotation.x = -Math.sin(st.phase * k + off) * b; br.knee.rotation.x = -Math.max(0, -s) * kk;
      tail = 'run';
    } else if (c.isMoving) {
      // 4-beat walk / trot
      const s = Math.sin(st.phase * 1.25), cs = Math.cos(st.phase * 1.25), a = dog ? .55 : .52;
      root.position.y = Math.abs(cs) * h * (dog ? .03 : .025);
      if (neckGrp) neckGrp.rotation.x = Math.abs(s) * (dog ? .06 : 0);
      fl.hip.rotation.x = s * a; fl.knee.rotation.x = Math.max(0, -s) * (dog ? .6 : .55);
      br.hip.rotation.x = s * a; br.knee.rotation.x = -Math.max(0, -s) * (dog ? .52 : .48);
      fr.hip.rotation.x = -s * a; fr.knee.rotation.x = Math.max(0, s) * (dog ? .6 : .55);
      bl.hip.rotation.x = -s * a; bl.knee.rotation.x = -Math.max(0, s) * (dog ? .52 : .48);
      tail = 'walk';
    } else {
      switch (pose) {
        case 'sitting':
          root.position.y = -h * (dog ? .15 : .12);
          root.rotation.x = dog ? -.46 : -.42;
          if (neckGrp && dog) neckGrp.rotation.x = .24;
          headGrp.rotation.x = dog ? .22 : .42;
          bl.hip.rotation.x = dog ? .92 : .85; bl.knee.rotation.x = dog ? -1.05 : -.95;
          br.hip.rotation.x = dog ? .92 : .85; br.knee.rotation.x = dog ? -1.05 : -.95;
          fl.hip.rotation.x = dog ? .42 : .38; fr.hip.rotation.x = dog ? .42 : .38;
          tail = 'sit';
          break;
        case 'sleeping':
          root.position.y = -h * (dog ? .3 : .28);
          fl.hip.rotation.x = 1.25; fl.knee.rotation.x = dog ? .4 : .35;
          fr.hip.rotation.x = 1.25; fr.knee.rotation.x = dog ? .4 : .35;
          bl.hip.rotation.x = -1.2; bl.knee.rotation.x = dog ? -.4 : -.35;
          br.hip.rotation.x = -1.2; br.knee.rotation.x = dog ? -.4 : -.35;
          if (neckGrp && dog) neckGrp.rotation.x = .32;
          headGrp.rotation.y = dog ? .42 : .55; headGrp.rotation.x = dog ? .25 : .35;
          tail = 'sleep';
          break;
        case 'stretching':
        case 'play_bow':
          root.position.y = -h * (dog ? .11 : .08);
          root.rotation.x = dog ? .36 : .28;
          if (neckGrp && dog) neckGrp.rotation.x = -.22;
          headGrp.rotation.x = dog ? -.15 : -.1;
          fl.hip.rotation.x = dog ? -.78 : -.75; fl.knee.rotation.x = .45;
          fr.hip.rotation.x = dog ? -.78 : -.75; fr.knee.rotation.x = .45;
          if (dog) { bl.hip.rotation.x = -.18; br.hip.rotation.x = -.18; }
          tail = 'bow';
          break;
        default:
          tail = 'stand';
      }
    }
  }
  if (airBlend > .001) {
    // stretched mid-air leap: nose rises on the way up and dips on the way down, front legs reach, hind legs trail
    const up = clamp((c.vy || 0) / 2.2, -1, 1);
    const mix = (a, b) => a + (b - a) * airBlend;
    root.position.y = mix(root.position.y, 0);
    root.rotation.x = mix(root.rotation.x, -.08 - .2 * up);
    fl.hip.rotation.x = mix(fl.hip.rotation.x, -.95); fl.knee.rotation.x = mix(fl.knee.rotation.x, .12);
    fr.hip.rotation.x = mix(fr.hip.rotation.x, -.85); fr.knee.rotation.x = mix(fr.knee.rotation.x, .2);
    bl.hip.rotation.x = mix(bl.hip.rotation.x, .9); bl.knee.rotation.x = mix(bl.knee.rotation.x, -.15);
    br.hip.rotation.x = mix(br.hip.rotation.x, .78); br.knee.rotation.x = mix(br.knee.rotation.x, -.25);
    if (neckGrp) neckGrp.rotation.x = mix(neckGrp.rotation.x, -.18);
    headGrp.rotation.x = mix(headGrp.rotation.x, -.1);
    if (airBlend > .5) tail = 'jump';
  }
  animateTail(rig, tail, st, c.t, dog);
}

// Tail rig: base angle per mode + travelling wag wave along the joints. Rest bends live in rig.tailRest.
function animateTail(rig, mode, st, t, dog) {
  const segs = rig.tailSegs; if (!segs) return;
  const rest = rig.tailRest;
  const T0 = dog
    ? {stand:-1.0, walk:-.95, run:-1.5, jump:-1.62, crouch:-1.25, sit:-1.3, sleep:-1.9, bow:-.55}
    : {stand:-2.05, walk:-1.9, run:-1.62, jump:-1.56, crouch:-1.95, sit:-2.35, sleep:-2.4, bow:-1.7};
  const target = T0[mode] ?? T0.stand;
  rig.tailGrp.rotation.set(target - rest[0], mode === 'sleep' ? (dog ? .9 : 1.3) : mode === 'sit' && !dog ? .55 : 0, 0);
  const ph = mode === 'walk' || mode === 'run' ? st.phase * (dog ? 1.7 : 1.0) : t * (dog ? 7 : 2.4);
  const amp = dog ? ({stand:.16, walk:.42, run:.22, jump:.1, crouch:.12, sit:.3, sleep:0, bow:.5}[mode] ?? .16)
                  : ({stand:.07, walk:.2, run:.1, jump:.08, crouch:.32, sit:.12, sleep:0, bow:.1}[mode] ?? .08);
  segs.forEach((s, i) => s.rotation.set(rest[i], 0, amp * (.55 + i * .3) * Math.sin(ph - i * .85)));
}

// Car rig: rolling wheels (spin = distance / radius), counter-steer, body lean, suspension and jump attitude
function animateCar(rig, o, st, c) {
  const {bodyGrp, wheels, frontSteer} = rig, h = rig.h;
  wheels.forEach(w => { w.rotation.x = st.wheelSpin; });
  let targetSteer = 0, targetRoll = 0, targetPitch = 0;
  if (c.timelineSpeed > .08) {
    const moveHeading = Math.atan2(c.vx, c.vz) * 180 / Math.PI;
    let slip = ((moveHeading - (o.ry || 0) + 540) % 360) - 180;
    const absSlip = Math.abs(slip);
    const slipFade = absSlip > 105 ? Math.max(0, Math.cos(clamp((absSlip - 105) / 60, 0, 1) * Math.PI / 2)) : 1;
    slip *= slipFade;
    targetSteer = clamp(rad(slip * .72 + c.vRy * .08), -.58, .58);
    targetRoll = clamp(rad(-slip * .085 - c.vRy * .018), -.085, .085);
    targetPitch = clamp(-c.timelineSpeed * .0025, -.018, .015);
  }
  const jumping = c.isAirborne || o.pose === 'jumping';
  let targetSus = 0;
  if (jumping) { targetSus = h * .055; targetSteer *= .35; if (o.pose === 'jumping') targetPitch -= .18; }
  else targetSus = clamp((c.vy || 0) * .01, -.035, .018) * h;
  const alpha = 1 - Math.exp(-clamp(c.dt || .016, .004, .08) * 22);
  st.steer = (st.steer ?? targetSteer) + (targetSteer - (st.steer ?? targetSteer)) * alpha;
  st.roll = (st.roll ?? targetRoll) + (targetRoll - (st.roll ?? targetRoll)) * alpha;
  st.pitch = (st.pitch ?? targetPitch) + (targetPitch - (st.pitch ?? targetPitch)) * alpha;
  st.sus = (st.sus ?? targetSus) + (targetSus - (st.sus ?? targetSus)) * alpha;
  frontSteer.forEach(fs => { fs.rotation.y = st.steer; });
  if (bodyGrp) { bodyGrp.rotation.set(st.pitch, 0, st.roll); bodyGrp.position.y = st.sus; }
}
// exact lowest world-space vertex of an object (Box3 on rotated parts over-estimates, which made spinning wheels / swinging limbs bounce the model)
function preciseMinY(root) {
  let minY = Infinity;
  root.traverse(n => {
    if (!n.isMesh || n.userData.isOutline || n.isSkinnedMesh || !n.visible) return;
    const geo = n.geometry, pos = geo?.attributes?.position;
    if (!pos) return;
    const me = n.matrixWorld.elements;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const bs = geo.boundingSphere;
    if (bs) {
      const sc = Math.max(Math.hypot(me[0], me[1], me[2]), Math.hypot(me[4], me[5], me[6]), Math.hypot(me[8], me[9], me[10]));
      const cy = me[1] * bs.center.x + me[5] * bs.center.y + me[9] * bs.center.z + me[13];
      if (cy - bs.radius * sc >= minY) return;
    }
    const arr = pos.array, cnt = pos.count, stride = pos.itemSize || 3;
    const a = me[1], b = me[5], c = me[9], d = me[13];
    for (let i = 0; i < cnt; i++) {
      const j = i * stride, y = a * arr[j] + b * arr[j + 1] + c * arr[j + 2] + d;
      if (y < minY) minY = y;
    }
  });
  return minY;
}

function syncScene(showSelUI = true) {
  const live = new Set();
  V().objects.forEach(o => {
    live.add(o.id);
    o.y = Math.max(0, o.y || 0);
    const ref = AC.refs[o.img];
    const sig = [o.model, rnd(o.h, 3), rnd(o.w, 3), o.color, JSON.stringify(o.parts || ''), JSON.stringify(o.children || ''), o.img, o.customId || '', o.model === 'custom' ? (CUSTOM.has(o.customId) ? 'ok' : 'missing') : '', o.model === 'image' ? (ref ? ref.id + ':' + (ref.img.naturalWidth || 0) : 'none') : ''].join('|');
    let e = R.objs.get(o.id);
    if (!e || e.sig !== sig) { if (e) R.scene.remove(e.g); e = {g:buildModel(o), sig}; R.scene.add(e.g); R.objs.set(o.id, e); }
    e.g.position.set(o.x || 0, o.y || 0, o.z || 0);
    // yaw first, then pitch/roll in the object's own frame (so a car tilts nose-up along its own heading)
    e.g.rotation.order = 'YXZ';
    e.g.rotation.set(rad(o.rx || 0), rad(o.ry || 0), rad(o.rz || 0));
    const baseSX = e.g.userData.rig?.baseScaleX || 1;
    e.g.scale.set((o.sx ?? 1) * baseSX, o.sy ?? 1, o.sz ?? 1);
    updateRigPoseAndMotion(o, e.g, T);
    if (e.g.userData.customRig) updateCustomClip(o, e.g.userData.customRig, T);
    // Strict ground-plane collision & anti-floating clamp (exact lowest vertex, so spinning wheels / swinging limbs never bounce the object)
    const carFlatOnGround = o.model === 'car' && (o.y || 0) <= .001 && !JUMP_POSES.has(o.pose) && Math.abs(o.rx || 0) < .05 && Math.abs(o.rz || 0) < .05;
    if (!carFlatOnGround && o.model !== 'custom' && o.model !== 'group') {
      e.g.updateMatrixWorld(true);
      const minY = preciseMinY(e.g);
      if (isFinite(minY)) {
        const airborne = (o.y || 0) > .001 || JUMP_POSES.has(o.pose);
        if (minY < 0) e.g.position.y += -minY;
        else if (!airborne && !e.g.userData.rig?.seatedChair && minY > .002) e.g.position.y -= minY;
      }
    }
    const selected = showSelUI && isObjSelected(o.id);
    if (e.g.userData.outlines) {
      e.g.userData.outlines.forEach(ol => { ol.visible = selected; });
    }
  });
  R.objs.forEach((e, id) => { if (!live.has(id)) { R.scene.remove(e.g); R.objs.delete(id); rigMotionState.delete(id); } });
  if (R.gizmo) {
    const activeObj = showSelUI && sel && sel !== 'camera' ? objById(sel) : null;
    if (activeObj) {
      R.gizmo.group.visible = true;
      const gy = (activeObj.y || 0) + Math.min((activeObj.h || 1) * (activeObj.sy ?? 1) * .48, 1.0);
      R.gizmo.group.position.set(activeObj.x || 0, gy, activeObj.z || 0);
      // Fixed screen-space pixel size in the viewport (2x larger Cinema 4D constant screen-scale controller)
      const camDir = new R.THREE.Vector3();
      R.camera.getWorldDirection(camDir);
      const depth = Math.max(.01, Math.abs(R.gizmo.group.position.clone().sub(R.camera.position).dot(camDir)) || R.camera.position.distanceTo(R.gizmo.group.position));
      const vpH = Math.max(160, R.renderer.domElement.clientHeight || 360);
      const worldH = 2 * depth * Math.tan(rad(R.camera.fov || 40) / 2);
      const gScale = worldH * (92 / vpH);
      R.gizmo.group.scale.set(gScale, gScale, gScale);
      R.gizmo.moveGrp.visible = gizmoMode === 'move';
      R.gizmo.rotGrp.visible = gizmoMode === 'rotate';
      if (R.gizmo.scaleGrp) R.gizmo.scaleGrp.visible = gizmoMode === 'scale';
      R.gizmo.setHighlight(hoverGizmoAxis);
    } else {
      R.gizmo.group.visible = false;
    }
  }
}
function renderVP(sizeOverride) {
  if (!is3D() || !R) return;
  const ar = aspectRatio();
  let w, h;
  if (sizeOverride) ({w, h} = sizeOverride);
  else {
    const box = $('vpWrap'); const bw = box.clientWidth - 16, bh = box.clientHeight - 16;
    if (bw < 20 || bh < 20) return;
    w = Math.min(bw, bh * ar); h = w / ar;
  }
  // only resize the WebGL buffers when something changed (re-allocating them every frame is what made video export crawl)
  const wantPR = sizeOverride ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  if (R.renderer.getPixelRatio() !== wantPR) R.renderer.setPixelRatio(wantPR);
  const sizeKey = Math.round(w) + 'x' + Math.round(h) + (sizeOverride ? 'x' : 'c');
  if (R.sizeKey !== sizeKey) { R.renderer.setSize(Math.round(w), Math.round(h), !sizeOverride); R.sizeKey = sizeKey; }
  const k = AC.calc(), tg = targetAt(T), a = rad(S.az), e = rad(S.el);
  if (!sizeOverride && vpViewMode === 'top') {
    const ext = hooks.sceneExtent?.('top') || 1.6;
    const dTop = Math.max(2.2, S.dist * 1.15, ext * 2.2);
    R.camera.fov = 38; R.camera.aspect = w / h; R.camera.near = .01; R.camera.updateProjectionMatrix();
    R.camera.position.set(tg.x, tg.y + dTop, tg.z);
    R.camera.up.set(0, 0, -1);
    R.camera.lookAt(tg.x, 0, tg.z);
  } else if (!sizeOverride && vpViewMode === 'side') {
    const ext = hooks.sceneExtent?.('side') || 1.6;
    const dSide = Math.max(2.2, S.dist * 1.15, ext * 2.2);
    const lookY = Math.max(.65, tg.y);
    R.camera.fov = 38; R.camera.aspect = w / h; R.camera.near = .01; R.camera.updateProjectionMatrix();
    R.camera.position.set(tg.x + dSide, lookY, tg.z);
    R.camera.up.set(0, 1, 0);
    R.camera.lookAt(tg.x, lookY, tg.z);
  } else {
    R.camera.fov = k.vfov; R.camera.aspect = w / h; R.camera.near = Math.max(.002, S.dist * .02); R.camera.updateProjectionMatrix();
    R.camera.position.set(tg.x + Math.sin(a) * Math.cos(e) * S.dist, tg.y + Math.sin(e) * S.dist, tg.z + Math.cos(a) * Math.cos(e) * S.dist);
    R.camera.up.set(0, 1, 0); R.camera.lookAt(tg.x, tg.y, tg.z); R.camera.rotateZ(-rad(S.roll));
  }
  syncScene(!sizeOverride);
  R.ground.visible = R.grid.visible = V().ground !== false;
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
  const f = $('vpFocus'), fs = focusSt();
  if (fs.showMark && !sizeOverride) {
    const fm = focusMarkerAt(T);
    const p = new R.THREE.Vector3(fm.x, fm.y, fm.z).project(R.camera);
    f.hidden = p.z > 1;
    const u = clamp((p.x + 1) / 2, .04, .96), v = clamp((1 - p.y) / 2, .04, .96);
    f.style.left = (u * w) + 'px';
    f.style.top = (v * h) + 'px';
    f.classList.toggle('flip-x', u > .52);
    f.classList.toggle('flip-y', v < .15);
    const fpPart = detect3DFocusPartAt(T);
    const fLbl = fpPart
      ? `${fpPart.objectLabel} · ${fpPart.partName}`
      : (Array.isArray(fs.targets) && fs.targets.length ? fs.targets.join(', ') : (valueAt('focus', T, 'target', fs.target) || 'Focus'));
    $('vpFocusLab').textContent = fLbl + (fs.note ? ' · ' + fs.note : '');
  } else f.hidden = true;
}
hooks.render = () => renderVP();

function setFocusMarkerWorld(wx, wy, wz, hitObj = null, commitKeys = true) {
  const fs = focusSt();
  if (!fs.on) fs.showMark = true;
  fs.on = true;
  fs.pointPinned = true;
  Object.assign(fpos(), {x:rnd(wx, 3), y:rnd(Math.max(0, wy), 3), z:rnd(wz, 3)});
  if (hitObj) {
    fs.target = hitObj.label;
    if (!Array.isArray(fs.targets) || !fs.targets.length) fs.targets = [hitObj.label];
  }
  if (commitKeys && isVideo()) {
    if (T <= 1e-4 && !hasFocusPointKeys()) {
      fs._frame0Pos = {x:fpos().x, y:fpos().y, z:fpos().z};
    } else {
      if (!hasFocusPointKeys() && fs._frame0Pos) {
        upsertKey('focus.x', 0, fs._frame0Pos.x);
        upsertKey('focus.y', 0, fs._frame0Pos.y);
        upsertKey('focus.z', 0, fs._frame0Pos.z);
      }
      upsertKey('focus.x', T, fpos().x);
      upsertKey('focus.y', T, fpos().y);
      upsertKey('focus.z', T, fpos().z);
      lastApplied['focus.x'] = fpos().x;
      lastApplied['focus.y'] = fpos().y;
      lastApplied['focus.z'] = fpos().z;
      buildTimeline();
    }
  }
  syncFocusXYZ();
  renderVP();
}
function raycastHitOnObjects(clientX, clientY) {
  if (!R || !R.renderer?.domElement) return null;
  const rect = R.renderer.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const ndc = new R.THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  R.raycaster.setFromCamera(ndc, R.camera);
  const meshes = [];
  R.objs.forEach(e => e.g.traverse(n => { if (n.isMesh && !n.userData.isOutline) meshes.push(n); }));
  const hits = R.raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const oidHit = hits[0].object?.userData?.oid;
  return {point:hits[0].point, obj:oidHit ? objById(oidHit) : null};
}

function setVpViewMode(m) {
  vpViewMode = m === 'top' || m === 'side' ? m : 'orbit';
  $('vtagOrbit')?.setAttribute('aria-pressed', String(vpViewMode === 'orbit'));
  $('vtagTop')?.setAttribute('aria-pressed', String(vpViewMode === 'top'));
  $('vtagSide')?.setAttribute('aria-pressed', String(vpViewMode === 'side'));
  const titleEl = $('vpTitle');
  if (titleEl) titleEl.textContent = vpViewMode === 'top' ? 'Top View (3D)' : vpViewMode === 'side' ? 'Side View (3D)' : '3D Camera View';
  renderVP();
}
$('vtagOrbit')?.addEventListener('click', () => setVpViewMode('orbit'));
$('vtagTop')?.addEventListener('click', () => setVpViewMode('top'));
$('vtagSide')?.addEventListener('click', () => setVpViewMode('side'));

// Raycast helpers for gizmo axes and 3D objects in the viewport
function raycastGizmoAt(clientX, clientY) {
  if (!R || !R.gizmo?.group.visible || !R.renderer?.domElement) return null;
  const rect = R.renderer.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const ndc = new R.THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  R.raycaster.setFromCamera(ndc, R.camera);
  const activeMode = gizmoMode === 'rotate' ? 'rotate' : gizmoMode === 'scale' ? 'scale' : 'move';
  const candidates = R.gizmo.hitMeshes.filter(m => m.userData.gizmoMode === activeMode);
  const hits = R.raycaster.intersectObjects(candidates, false);
  return hits.length ? hits[0].object.userData.gizmoAxis : null;
}
function raycastObjectAt(clientX, clientY) {
  if (!R || !R.renderer?.domElement) return null;
  const rect = R.renderer.domElement.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const ndc = new R.THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  R.raycaster.setFromCamera(ndc, R.camera);
  const meshes = [];
  R.objs.forEach(e => e.g.traverse(n => { if (n.isMesh && !n.userData.isOutline) meshes.push(n); }));
  const hits = R.raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  const oidHit = hits[0].object?.userData?.oid;
  return oidHit ? objById(oidHit) : null;
}
function projectWorldDeltaToAxis(originVec, axisVec, dxPx, dyPx) {
  const rect = R.renderer.domElement.getBoundingClientRect();
  const p0 = originVec.clone().project(R.camera);
  const p1 = originVec.clone().add(axisVec).project(R.camera);
  const sx0 = (p0.x + 1) * .5 * rect.width, sy0 = (1 - p0.y) * .5 * rect.height;
  const sx1 = (p1.x + 1) * .5 * rect.width, sy1 = (1 - p1.y) * .5 * rect.height;
  const vx = sx1 - sx0, vy = sy1 - sy0;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 4) return (dxPx - dyPx) * Math.max(.002, S.dist * .0022);
  return (dxPx * vx + dyPx * vy) / lenSq;
}
function bindViewportPicking() {
  const wrap = $('vpWrap'); if (!wrap) return;
  let vpDrag = null;
  wrap.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('button, input, select')) return;
    if (e.target.closest('#vpFocus')) {
      e.preventDefault(); e.stopPropagation();
      try { wrap.setPointerCapture(e.pointerId); } catch (err) {}
      activeVpDrag = true;
      const fm0 = focusMarkerAt(T);
      vpDrag = {
        mode:'focusMarker',
        x0:e.clientX, y0:e.clientY,
        fx0:fm0.x, fy0:fm0.y, fz0:fm0.z,
        moved:false
      };
      return;
    }
    const gAxis = raycastGizmoAt(e.clientX, e.clientY);
    if (gAxis && sel && sel !== 'camera') {
      const cur = objById(sel);
      if (cur) {
        hoverGizmoAxis = gAxis;
        wrap.setPointerCapture(e.pointerId);
        activeVpDrag = true;
        vpDrag = {
          id:cur.id, axis:gAxis, mode:gizmoMode,
          x0:e.clientX, y0:e.clientY,
          ox:cur.x || 0, oy:cur.y || 0, oz:cur.z || 0,
          orx:cur.rx || 0, ory:cur.ry || 0, orz:cur.rz || 0,
          osx:cur.sx ?? 1, osy:cur.sy ?? 1, osz:cur.sz ?? 1,
          moved:false
        };
        renderVP();
        return;
      }
    }
    const hit = raycastObjectAt(e.clientX, e.clientY);
    if (!hit) {
      // Clicking empty space in the 3D viewport deselects the object and hides the gizmo controller
      if (sel) {
        selectObj(null, false);
        hoverGizmoAxis = null;
        renderObjects(); buildTimeline(); renderVP(); AC.drawAll(); AC.changed();
      }
      return;
    }
    selectObj(hit.id, e.shiftKey);
    renderObjects(); buildTimeline(); renderVP(); AC.changed();
    wrap.setPointerCapture(e.pointerId);
    activeVpDrag = true;
    vpDrag = {
      id:hit.id, axis:'free', mode:gizmoMode,
      x0:e.clientX, y0:e.clientY,
      ox:hit.x || 0, oy:hit.y || 0, oz:hit.z || 0,
      orx:hit.rx || 0, ory:hit.ry || 0, orz:hit.rz || 0,
      osx:hit.sx ?? 1, osy:hit.sy ?? 1, osz:hit.sz ?? 1,
      moved:false
    };
  });
  wrap.addEventListener('pointermove', e => {
    if (!vpDrag) {
      const gAx = raycastGizmoAt(e.clientX, e.clientY);
      if (gAx !== hoverGizmoAxis) { hoverGizmoAxis = gAx; renderVP(); }
      const hObj = gAx ? true : !!raycastObjectAt(e.clientX, e.clientY);
      wrap.style.cursor = hObj ? 'grab' : '';
      return;
    }
    if (vpDrag.mode === 'focusMarker') {
      const dx = e.clientX - vpDrag.x0, dy = e.clientY - vpDrag.y0;
      if (Math.hypot(dx, dy) > 1) vpDrag.moved = true;
      wrap.style.cursor = 'grabbing';
      const hit = raycastHitOnObjects(e.clientX, e.clientY);
      if (hit) {
        setFocusMarkerWorld(hit.point.x, hit.point.y, hit.point.z, hit.obj, false);
      } else {
        const scale = Math.max(.002, S.dist * .0022);
        const a = rad(S.az), rx = Math.cos(a), rz = -Math.sin(a);
        const nx = vpDrag.fx0 + dx * scale * rx;
        const ny = Math.max(0, vpDrag.fy0 - dy * scale);
        const nz = vpDrag.fz0 + dx * scale * rz;
        setFocusMarkerWorld(nx, ny, nz, null, false);
      }
      return;
    }
    const o = objById(vpDrag.id); if (!o) return;
    const dx = e.clientX - vpDrag.x0, dy = e.clientY - vpDrag.y0;
    if (Math.hypot(dx, dy) > 2) vpDrag.moved = true;
    if (!vpDrag.moved) return;
    wrap.style.cursor = 'grabbing';
    const scale = Math.max(.002, S.dist * .0022);
    const origin = new R.THREE.Vector3(vpDrag.ox, vpDrag.oy + Math.min((o.h || 1) * (o.sy ?? 1) * .48, 1.0), vpDrag.oz);
    if (vpDrag.mode === 'scale' && vpDrag.axis !== 'free') {
      if (vpDrag.axis === 'x') {
        const d = projectWorldDeltaToAxis(origin, new R.THREE.Vector3(1, 0, 0), dx, dy);
        o.sx = rnd(clamp(vpDrag.osx + d * 1.25, .05, 20), 2);
      } else if (vpDrag.axis === 'y') {
        const d = projectWorldDeltaToAxis(origin, new R.THREE.Vector3(0, 1, 0), dx, dy);
        o.sy = rnd(clamp(vpDrag.osy + d * 1.25, .05, 20), 2);
      } else if (vpDrag.axis === 'z') {
        const d = projectWorldDeltaToAxis(origin, new R.THREE.Vector3(0, 0, 1), dx, dy);
        o.sz = rnd(clamp(vpDrag.osz + d * 1.25, .05, 20), 2);
      } else {
        const f = clamp(1 + (dx - dy) * .005, .1, 10);
        o.sx = rnd(clamp(vpDrag.osx * f, .05, 20), 2);
        o.sy = rnd(clamp(vpDrag.osy * f, .05, 20), 2);
        o.sz = rnd(clamp(vpDrag.osz * f, .05, 20), 2);
      }
    } else if (vpDrag.mode === 'rotate' && vpDrag.axis !== 'free') {
      if (vpDrag.axis === 'x') {
        o.rx = rnd(clamp(vpDrag.orx + dy * .6, -180, 180), 1);
      } else if (vpDrag.axis === 'z') {
        o.rz = rnd(clamp(vpDrag.orz - dx * .6, -180, 180), 1);
      } else {
        o.ry = rnd(vpDrag.ory + dx * .75, 1);
      }
    } else if (vpDrag.axis === 'x') {
      const d = projectWorldDeltaToAxis(origin, new R.THREE.Vector3(1, 0, 0), dx, dy);
      o.x = rnd(vpDrag.ox + d, 3);
    } else if (vpDrag.axis === 'y' || e.altKey) {
      const d = vpDrag.axis === 'y'
        ? projectWorldDeltaToAxis(origin, new R.THREE.Vector3(0, 1, 0), dx, dy)
        : -dy * scale;
      o.y = rnd(Math.max(0, vpDrag.oy + d), 3);
    } else if (vpDrag.axis === 'z') {
      const d = projectWorldDeltaToAxis(origin, new R.THREE.Vector3(0, 0, 1), dx, dy);
      o.z = rnd(vpDrag.oz + d, 3);
    } else if (vpViewMode === 'top') {
      o.x = rnd(vpDrag.ox + dx * scale, 3);
      o.z = rnd(vpDrag.oz + dy * scale, 3);
    } else if (vpViewMode === 'side') {
      o.z = rnd(vpDrag.oz - dx * scale, 3);
      o.y = rnd(Math.max(0, vpDrag.oy - dy * scale), 3);
    } else {
      const a = rad(S.az), rx = Math.cos(a), rz = -Math.sin(a), fx = -Math.sin(a), fz = -Math.cos(a);
      o.x = rnd(vpDrag.ox + dx * scale * rx - dy * scale * fx, 3);
      o.z = rnd(vpDrag.oz + dx * scale * rz - dy * scale * fz, 3);
    }
    o.placed = true; o.userMoved = true;
    syncObjProps(); renderVP(); AC.drawAll();
  });
  const endVpDrag = () => {
    if (!vpDrag) return;
    if (vpDrag.mode === 'focusMarker') {
      const moved = vpDrag.moved;
      vpDrag = null; activeVpDrag = false; wrap.style.cursor = '';
      if (moved) {
        setFocusMarkerWorld(fpos().x, fpos().y, fpos().z, null, true);
        AC.save(); AC.changed();
      }
      return;
    }
    const o = objById(vpDrag.id);
    const moved = vpDrag.moved; vpDrag = null; activeVpDrag = false; hoverGizmoAxis = null; wrap.style.cursor = '';
    if (moved && o && o.model === 'person') {
      if (checkAutoSitOnChair(o, true)) { objPropsKey = ''; syncObjProps(); }
    }
    renderVP(); AC.drawAll();
    if (moved) { autoKey(); AC.save(); AC.changed(); }
  };
  wrap.addEventListener('pointerup', endVpDrag);
  wrap.addEventListener('pointercancel', endVpDrag);
  wrap.addEventListener('dblclick', e => {
    if (e.target.closest('button, input, select')) return;
    const hit = raycastObjectAt(e.clientX, e.clientY);
    if (!hit) return;
    selectObj(hit.id, false);
    renderObjects(); buildTimeline(); renderVP();
    openObjEditBar(hit.id);
  });
}

/* ---------- Object panel & Bottom Slide-Up Editing Bar (#objEditBar) ---------- */
const CAM_ICON = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><rect x="1" y="4" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m11 7 4-2v6l-4-2z" fill="currentColor"/></svg>';
let objPropsKey = '';
const kb = (path, label) => isVideo() ? `<button class="kb" data-kp="${path}" aria-label="Keyframe ${escAttr(label)}"></button>` : '';
function numField(id, label, path, step, min, max, attr) {
  return `<div class="field"><div class="labrow"><label for="${id}">${kb(path, label)}${label}</label></div><input type="number" id="${id}" ${attr} step="${step}" min="${min}" max="${max}"></div>`;
}
function bindDragToGroup(container, attrName) {
  if (!container || container.dataset.dragBound) return;
  container.dataset.dragBound = '1';
  let dragId = null;
  container.addEventListener('dragstart', e => {
    const el = e.target.closest(`[${attrName}]`);
    const v = el?.getAttribute(attrName) || '';
    const oid = v.startsWith('obj:') ? v.slice(4) : v;
    if (!oid || oid === 'camera' || !objById(oid)) { e.preventDefault(); return; }
    dragId = oid;
    e.dataTransfer?.setData('text/plain', oid);
  });
  container.addEventListener('dragover', e => {
    const el = e.target.closest(`[${attrName}]`);
    const v = el?.getAttribute(attrName) || '';
    const oid = v.startsWith('obj:') ? v.slice(4) : v;
    if (!dragId || !oid || oid === dragId || !objById(oid)) return;
    e.preventDefault();
    container.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    el.classList.add('drag-over');
  });
  container.addEventListener('dragleave', e => {
    const el = e.target.closest(`[${attrName}]`);
    el?.classList.remove('drag-over');
  });
  container.addEventListener('drop', e => {
    container.querySelectorAll('.drag-over').forEach(x => x.classList.remove('drag-over'));
    const el = e.target.closest(`[${attrName}]`);
    const v = el?.getAttribute(attrName) || '';
    const targetId = v.startsWith('obj:') ? v.slice(4) : v;
    const srcId = dragId || e.dataTransfer?.getData('text/plain');
    dragId = null;
    if (!srcId || !targetId || srcId === targetId) return;
    e.preventDefault();
    mergeIntoGroup(srcId, targetId);
  });
}

function renderObjects() {
  if (!$('objList')) return;
  $('objList').innerHTML = V().objects.map(o => `<button class="objrow${selSet.has(o.id) && selSet.size > 1 ? ' multi-sel' : ''}" draggable="true" data-oid="${o.id}" aria-pressed="${isObjSelected(o.id)}" title="Click to select, double-click to edit name &amp; subject detail"><span class="sw" style="background:${escAttr(o.color)}"></span>${esc(o.label)}<span class="m">${MODELS[o.model] || o.model}${o.model === 'group' && o.children ? ` (${o.children.length})` : ''}</span></button>`).join('');
  bindDragToGroup($('objList'), 'data-oid');
  if ($('objMatchImg')) $('objMatchImg').hidden = !(AC.refs.length && AC.refs.some(r => r.subjects?.length));
  const o = objById(sel);
  const key = ['vid', o ? o.id + o.model + (o.pose || '') : sel === 'camera' ? 'cam' : 'none', selSet.size, AC.refs.length].join(':');
  if (key !== objPropsKey) {
    objPropsKey = key;
    if (sel === 'camera') {
      $('objProps').innerHTML = `<div class="sep"></div>
        <p class="hint">The camera's orbit, tilt, distance, roll and X / Y / Z position are in the Camera angle panel; focal length and sensor are in Camera &amp; lens. The camera can't be deleted.</p>
        <div class="row"><button class="btn ghost sm" id="openCamAngle" style="flex:none">Open Camera angle</button><button class="btn ghost sm" id="openCamLens" style="flex:none">Open Camera &amp; lens</button></div>`;
    } else if (!o) { $('objProps').innerHTML = ''; }
    else {
      const n = (k, label, step, min, max) => numField('op_' + k, label, `obj.${o.id}.${k}`, step, min, max, `data-ok="${k}"`);
      const poseMap = poseMapFor(o.model);
      const poseHtml = poseMap ? `<div class="field"><label for="op_pose">Pose (or right-click object)</label><select id="op_pose" data-ok="pose">${Object.entries(poseMap).map(([pk, pv]) => `<option value="${pk}">${pv.name}</option>`).join('')}</select></div>` : '';
      const scaleHtml = `<div class="field"><div class="labrow"><label for="op_sx">${kb(`obj.${o.id}.scale`, 'Scale')}Scale (X · Y · Z)</label></div><div class="grid3" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px"><input type="number" id="op_sx" data-ok="sx" step="0.05" min="0.05" max="20" title="Scale X" aria-label="Scale X"><input type="number" id="op_sy" data-ok="sy" step="0.05" min="0.05" max="20" title="Scale Y" aria-label="Scale Y"><input type="number" id="op_sz" data-ok="sz" step="0.05" min="0.05" max="20" title="Scale Z" aria-label="Scale Z"></div></div>`;
      const grpBtns = `<div class="row" style="gap:6px;flex-wrap:wrap">
        ${selSet.size >= 2 ? `<button class="btn ghost sm" id="objGroupBtn" style="flex:none">Group selected (${selSet.size})</button>` : ''}
        ${o.model === 'group' ? `<button class="btn ghost sm" id="objUngroupBtn" style="flex:none">Ungroup</button>` : ''}
        <button class="btn ghost sm" id="objEditDetBtn" style="flex:none">Subject Detail</button>
        <button class="btn ghost sm" id="objCopyBtn" style="flex:none">Copy</button>
        <button class="btn ghost sm" id="objDel" style="flex:none">Delete</button>
      </div>`;
      const centry = o.model === 'custom' ? CUSTOM.get(o.customId) : null;
      const customHtml = o.model === 'custom' ? `<div class="sep"></div>
        ${centry ? '' : '<p class="hint" style="color:var(--accent)">This uploaded model is not in memory any more (files are not stored). Upload it again to see it; its material details stay in the prompt.</p>'}
        <div class="grid2"><div class="field"><label for="op_clip">Animation clip</label><select id="op_clip" data-ok="clip"><option value="">None (bind pose)</option>${(centry?.clips || []).map(c => `<option value="${escAttr(c.name)}">${esc(c.name || 'clip')} · ${rnd(c.duration, 1)}s</option>`).join('')}</select></div>
          <div class="field"><label for="op_clipSpeed">Clip speed ×</label><input type="number" id="op_clipSpeed" data-ok="clipSpeed" step=".1" min=".1" max="5"></div></div>
        <p class="hint">${esc(o.modelInfo ? `${o.modelInfo.format} · ${o.modelInfo.triangles.toLocaleString('en-US')} triangles${o.modelInfo.rigged ? ` · rig ${o.modelInfo.bones} bones` : ''} · ${o.modelInfo.parts.length} parts with materials (sent to the prompt)` : '')}</p>` : '';
      $('objProps').innerHTML = `<div class="sep"></div>
        <div class="field"><label for="op_label">Name</label><input type="text" id="op_label" data-ok="label"></div>
        <div class="grid2"><div class="field"><label for="op_model">Model</label><select id="op_model" data-ok="model">${Object.entries(MODELS).filter(([k]) => (k !== 'group' || o.model === 'group') && (k !== 'custom' || o.model === 'custom')).map(([k, nm]) => `<option value="${k}">${nm}</option>`).join('')}</select></div>
          <div class="field"><label for="op_img">Image</label><select id="op_img" data-ok="img"><option value="-1">None</option>${AC.refs.map((r, i) => `<option value="${i}">Image ${i + 1}${r.alpha ? ' (PNG)' : ''}</option>`).join('')}</select></div></div>
        ${poseHtml}
        <div class="grid2">${n('h', 'Height m', .01, .01, 50)}${n('w', 'Width m', .01, .01, 50)}</div>
        <div class="grid2">${n('x', 'Position X', .05, -100, 100)}${n('z', 'Position Z', .05, -100, 100)}</div>
        <div class="grid2">${n('y', 'Lift Y', .05, 0, 50)}${n('ry', 'Rotation °', 1, -720, 720)}</div>
        <div class="grid2">${n('rx', 'Tilt (pitch) °', 1, -180, 180)}${n('rz', 'Roll (lean) °', 1, -180, 180)}</div>
        ${scaleHtml}
        ${customHtml}
        <div class="field"><div class="labrow"><label for="op_color">${kb(`obj.${o.id}.color`, 'Color')}Color</label></div><input type="color" id="op_color" data-ok="color"></div>
        ${grpBtns}`;
      ['op_model', 'op_img', 'op_pose'].forEach(id => { if ($(id)) AC.enhance($(id)); });
    }
  }
  syncObjProps();
}
function syncObjProps() {
  const set = (id, v) => { const el = $(id); if (el && document.activeElement !== el && !el.classList.contains('scrubbing')) el.value = v; };
  if (sel !== 'camera') {
    const o = objById(sel); if (!o || !$('op_label')) return;
    set('op_label', o.label); set('op_h', rnd(o.h, 3)); set('op_w', rnd(o.w, 3)); set('op_x', rnd(o.x, 3)); set('op_z', rnd(o.z, 3));
    set('op_y', rnd(Math.max(0, o.y || 0), 3)); set('op_ry', Math.round(o.ry));
    set('op_rx', Math.round(o.rx || 0)); set('op_rz', Math.round(o.rz || 0));
    set('op_sx', rnd(o.sx ?? 1, 2)); set('op_sy', rnd(o.sy ?? 1, 2)); set('op_sz', rnd(o.sz ?? 1, 2));
    set('op_color', o.color);
    if (!AC.refs[o.img]) o.img = -1;
    if ($('op_model')) { $('op_model').value = o.model; AC.refreshDD($('op_model')); }
    if ($('op_img')) { $('op_img').value = String(o.img); AC.refreshDD($('op_img')); }
    if ($('op_pose')) { $('op_pose').value = o.pose || 'standing'; AC.refreshDD($('op_pose')); }
    if ($('op_clip')) { $('op_clip').value = o.clip || ''; AC.refreshDD($('op_clip')); }
    set('op_clipSpeed', rnd(o.clipSpeed || 1, 2));
  }
}

$('objEditSave')?.addEventListener('click', saveObjEditBar);
$('objEditClose')?.addEventListener('click', closeObjEditBar);
$('objEditRename')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); saveObjEditBar(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeObjEditBar(); }
});
$('objEditDetail')?.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); closeObjEditBar(); }
});
$('tlSubjDetailBtn')?.addEventListener('click', () => {
  V().showSubjDetail = !V().showSubjDetail;
  if (V().showSubjDetail) {
    V().showTracks = false;
    V().showGraph = false;
    if (!sel || sel === 'camera') {
      const firstId = V().objects[0]?.id;
      if (firstId) selectObj(firstId, false);
    }
  }
  renderObjects(); buildTimeline(); AC.save();
  requestAnimationFrame(() => {
    renderVP();
    if (V().showSubjDetail) $('tlSubjDetailDesc')?.focus();
  });
});
$('tlSubjDetailList')?.addEventListener('click', e => {
  const b = e.target.closest('[data-tlsid]'); if (!b) return;
  selectObj(b.dataset.tlsid, false);
  renderObjects(); buildTimeline(); renderVP();
  $('tlSubjDetailDesc')?.focus();
});
$('tlSubjDetailSave')?.addEventListener('click', saveTlSubjDetail);
$('tlSubjDetailDesc')?.addEventListener('input', e => {
  const active = (sel && sel !== 'camera' ? objById(sel) : null) || V().objects[0];
  if (!active) return;
  const dets = V().subjDetails || (V().subjDetails = {});
  dets[active.id] = e.target.value;
  active.subjDesc = e.target.value;
});

$('objList').addEventListener('click', e => {
  const b = e.target.closest('[data-oid]'); if (!b) return;
  selectObj(b.dataset.oid, e.shiftKey);
  renderObjects(); buildTimeline(); AC.changed();
});
$('objList').addEventListener('dblclick', e => {
  const b = e.target.closest('[data-oid]'); if (!b) return;
  selectObj(b.dataset.oid, false);
  renderObjects(); buildTimeline();
  openObjEditBar(b.dataset.oid);
});
$('objProps').addEventListener('input', e => {
  const cp = e.target.dataset.cp;
  if (cp) {
    const v = parseFloat(e.target.value); if (!isFinite(v)) return;
    if (cp === 'az') AC.setAz(v); else if (cp === 'el') AC.setEl(v); else if (cp === 'dist') AC.setDist(v);
    else if (cp === 'roll') S.roll = clamp(v, -45, 45); else if (cp === 'focal') AC.setFocal(v); else if (cp === 'sensor') S.sensorW = clamp(v, 1, 100);
    AC.changed(); return;
  }
  const k = e.target.dataset.ok, o = objById(sel); if (!k || !o) return;
  if (k === 'label') {
    const old = o.label; o.label = e.target.value || old;
    const fs = focusSt();
    if (fs.target === old) fs.target = o.label;
    if (Array.isArray(fs.targets)) fs.targets = fs.targets.map(t => t === old ? o.label : t);
    if (isVideo()) (tracks().focus || []).forEach(kf => { if (kf.v === old) kf.v = o.label; });
    o.auto = false; buildTimeline(); syncVideoFocus();
  }
  else if (k === 'color') o.color = e.target.value;
  else if (k !== 'model' && k !== 'img' && k !== 'pose' && k !== 'clip') {
    const v = parseFloat(e.target.value);
    if (isFinite(v)) {
      o[k] = k === 'h' || k === 'w' ? Math.max(.01, v) : k === 'sx' || k === 'sy' || k === 'sz' ? clamp(v, .05, 20) : k === 'y' ? Math.max(0, v) : v;
      o.userMoved = true;
      if ((k === 'x' || k === 'z') && o.model === 'person') checkAutoSitOnChair(o, false);
    }
  }
  o.placed = true; AC.changed();
});
$('objProps').addEventListener('change', e => {
  const k = e.target.dataset.ok, o = objById(sel); if (!o) return;
  if (k === 'model') {
    o.model = e.target.value; o.w = rnd(widthFor(o.model, o.h), 3);
    if (hasPoseModel(o.model)) o.pose = 'standing';
    if (o.model === 'backdrop' && o.color === '#e85d2b') o.color = '#dcdedf';
    if (o.model === 'image' && o.img < 0 && AC.refs.length) o.img = 0;
    objPropsKey = ''; renderObjects(); AC.changed();
  }
  if (k === 'img') { o.img = +e.target.value; AC.changed(); }
  if (k === 'clip') { o.clip = e.target.value; renderVP(); AC.changed(); }
  if (k === 'pose') {
    o.pose = e.target.value; o.userPosed = true;
    applyPoseSideEffects(o);
    syncObjProps();
    if (isRiggedChar(o.model) && (o.pose === 'walking_still' || o.pose === 'running_still')) ensureLiveRigLoop();
    renderVP(); AC.changed();
  }
});
$('objProps').addEventListener('click', e => {
  if (e.target.closest('#openCamAngle')) { AC.showPanel('pAngle'); return; }
  if (e.target.closest('#openCamLens')) { AC.showPanel('pCam'); return; }
  if (e.target.closest('#objGroupBtn')) { groupSelectedObjects(); return; }
  if (e.target.closest('#objUngroupBtn')) { ungroupObject(sel); return; }
  if (e.target.closest('#objEditDetBtn')) { if (sel && sel !== 'camera') openObjEditBar(sel); return; }
  if (e.target.closest('#objCopyBtn')) { copySelectedObjects(); return; }
  if (!e.target.closest('#objDel')) return;
  deleteSelectedObjects();
});
$('objAddModel').innerHTML = Object.entries(MODELS).filter(([k]) => k !== 'group' && k !== 'custom').map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
$('objAddModel').value = 'person';
AC.refreshDD($('objAddModel'));
$('objAdd').addEventListener('click', () => {
  const m = $('objAddModel').value, n = V().objects.filter(o => o.model === m).length + 1;
  let img = -1;
  if (m === 'image' && AC.refs.length) {
    const used = new Set(V().objects.filter(o => o.model === 'image').map(o => o.img));
    img = AC.refs.findIndex((r, i) => !used.has(i)); if (img < 0) img = (n - 1) % AC.refs.length;
  }
  const baseName = MODELS[m].replace(/\s*\(.*\)/, '');
  const o = newObject(m, `${baseName} ${n}`, null, {placed:true, img});
  if (m === 'image' && AC.refs[img]?.img.naturalWidth) o.w = rnd(o.h * AC.refs[img].img.naturalWidth / AC.refs[img].img.naturalHeight, 3);
  const tg = targetAt(T); o.x = rnd(tg.x + (V().objects.length ? .55 * ((V().objects.length % 5) - 2) : 0), 2); o.z = rnd(tg.z, 2);
  V().objects.push(o); selectObj(o.id, false); objPropsKey = ''; vfOptsKey = ''; renderObjects(); buildTimeline(); syncVideoFocus(); AC.changed();
});

/* ---------- uploaded 3D models: FBX / OBJ (+MTL) / GLB / GLTF with textures, rig and animation clips ---------- */
const CUSTOM = new Map();   // customId -> {root, clips, size, center, min, info}
const LOADER_BASE = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/';
const scriptLoads = new Map();
function loadScriptOnce(rel) {
  const url = LOADER_BASE + rel;
  if (!scriptLoads.has(url)) scriptLoads.set(url, new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = url; s.async = false;
    s.onload = () => res();
    s.onerror = () => { scriptLoads.delete(url); s.remove(); rej(new Error(`Could not load ${rel}. Check your internet connection.`)); };
    document.head.appendChild(s);
  }));
  return scriptLoads.get(url);
}
async function ensureModelLoaders(ext) {
  const T = window.THREE;
  if (!T) throw new Error('3D engine is not available');
  if (ext === 'fbx' && !T.FBXLoader) {
    await loadScriptOnce('libs/fflate.min.js');
    await loadScriptOnce('curves/NURBSUtils.js').catch(() => {}); await loadScriptOnce('curves/NURBSCurve.js').catch(() => {});
    await loadScriptOnce('loaders/FBXLoader.js');
  }
  if ((ext === 'glb' || ext === 'gltf') && !T.GLTFLoader) await loadScriptOnce('loaders/GLTFLoader.js');
  if (ext === 'obj') {
    if (!T.OBJLoader) await loadScriptOnce('loaders/OBJLoader.js');
    if (!T.MTLLoader) await loadScriptOnce('loaders/MTLLoader.js');
  }
  if (!T.SkeletonUtils) await loadScriptOnce('utils/SkeletonUtils.js').catch(() => {});
  if (!T.TGALoader) await loadScriptOnce('loaders/TGALoader.js').catch(() => {});
}
const COLOR_NAMES = [['black', 0, 0, .1], ['dark grey', 0, 0, .28], ['grey', 0, 0, .5], ['light grey', 0, 0, .75], ['white', 0, 0, .95]];
function colorNameOf(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0, r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < .08) return COLOR_NAMES.reduce((a, c) => Math.abs(c[3] - l) < Math.abs(a[3] - l) ? c : a)[0];
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const tone = l < .28 ? 'dark ' : l > .72 ? 'light ' : '';
  const name = h < 15 || h >= 345 ? 'red' : h < 38 ? 'orange' : h < 65 ? 'yellow' : h < 90 ? 'lime green' : h < 160 ? 'green' : h < 195 ? 'teal' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink';
  return (h >= 15 && h < 38 && l < .35 ? 'brown' : tone + name);
}
// texture file names straight from the .mtl text (the textures may still be decoding when we describe the model)
function parseMtlTextures(text) {
  const out = new Map(); let cur = null;
  String(text).split(/\r?\n/).forEach(line => {
    const t = line.trim(); if (!t || t[0] === '#') return;
    const sp = t.split(/\s+/), key = sp[0].toLowerCase();
    if (key === 'newmtl') { cur = {}; out.set(t.slice(7).trim(), cur); return; }
    if (!cur) return;
    const file = (sp[sp.length - 1] || '').split(/[\\/]/).pop();
    if (key === 'map_kd') cur.map = file; else if (key === 'map_ks') cur.specularMap = file; else if (key === 'map_bump' || key === 'bump') cur.bumpMap = file;
    else if (key === 'norm') cur.normalMap = file; else if (key === 'map_d') cur.alphaMap = file; else if (key === 'map_ke') cur.emissiveMap = file;
  });
  return out;
}
function mtlTexName(mtlTex, matName, slot) { return mtlTex?.get(matName)?.[slot] || null; }
function texLabel(tex, urlNames) {
  if (!tex) return null;
  const src = tex.image?.currentSrc || tex.image?.src || '';
  return (urlNames && urlNames.get(src)) || (tex.name && !/^Texture::/.test(tex.name) ? tex.name : '') || 'embedded texture';
}
// human-readable material description (what is it made of / how does it look) for the AI prompt
function describeMat(m, urlNames, texSet, mtlTex) {
  const hex = m.color ? '#' + m.color.getHexString() : '#999999';
  const maps = [];
  [['map', 'color texture'], ['specularMap', 'specular map'], ['normalMap', 'normal map'], ['roughnessMap', 'roughness map'], ['metalnessMap', 'metalness map'], ['emissiveMap', 'emissive map'], ['aoMap', 'ambient occlusion map'], ['alphaMap', 'opacity map'], ['bumpMap', 'bump map']].forEach(([k, label]) => {
    if (m[k]) { const nm = mtlTexName(mtlTex, m.name, k) || texLabel(m[k], urlNames); maps.push(`${label}: ${nm}`); if (texSet) texSet.add(nm); }
  });
  const nm = (m.name || '').toLowerCase();
  const metal = m.metalness !== undefined ? m.metalness : (/chrome|metal|steel|iron|alum|gold|silver|copper|brass/.test(nm) ? .9 : 0);
  const rough = m.roughness !== undefined ? m.roughness : (m.shininess !== undefined ? clamp(1 - m.shininess / 150, .1, 1) : .6);
  const clear = (m.opacity !== undefined && m.opacity < .85) || m.transparent && !m.map || (m.transmission || 0) > .3 || /glass|window|windshield|visor|lens/.test(nm);
  let kind = 'matte plastic / painted surface';
  if (/skin|face|flesh/.test(nm) && !metal) kind = 'skin';
  else if (/hair|fur|beard|brow|lash/.test(nm)) kind = 'hair / fur';
  else if (/cloth|fabric|shirt|pants|jacket|dress|cotton|jeans|wool|cloak|cape/.test(nm)) kind = 'fabric / cloth';
  else if (/leather|shoe|boot|belt/.test(nm)) kind = 'leather';
  else if (/rubber|tire|tyre/.test(nm)) kind = 'rubber';
  else if (/wood|plank|bark/.test(nm)) kind = 'wood';
  else if (/stone|rock|concrete|brick/.test(nm)) kind = 'stone / concrete';
  else if (clear) kind = 'transparent glass / clear plastic';
  else if (metal > .65) kind = rough < .3 ? 'polished reflective metal' : 'brushed metal';
  else if (metal > .3) kind = 'metallic paint';
  else if (rough < .25) kind = 'glossy plastic / lacquer';
  else if (m.map) kind = 'textured surface (colors and pattern come from the color texture)';
  else if (rough > .8) kind = 'rough matte material';
  if (m.emissive && m.emissive.getHex() > 0x303030) kind += ', emits light (glowing)';
  return {name:m.name || 'material', type:m.type, color:hex, color_name:colorNameOf(hex), material:kind, metalness:rnd(metal, 2), roughness:rnd(rough, 2), opacity:rnd(m.opacity ?? 1, 2), textures:maps};
}
function describeImportedModel(root, clips, fileName, fmt, urlNames, mtlTex) {
  let tris = 0, bones = 0; const parts = [], seen = new Set(), texSet = new Set(), matCache = new Map();
  root.traverse(n => {
    if (n.isBone) bones++;
    if (!n.isMesh) return;
    const g = n.geometry; tris += g?.index ? g.index.count / 3 : (g?.attributes?.position?.count || 0) / 3;
    (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => {
      if (!m) return;
      let d = matCache.get(m.uuid); if (!d) { d = describeMat(m, urlNames, texSet, mtlTex); matCache.set(m.uuid, d); }
      const key = (n.name || '') + '|' + m.uuid; if (seen.has(key)) return; seen.add(key);
      parts.push({part:n.name || 'mesh', skinned:!!n.isSkinnedMesh, ...d});
    });
  });
  const clipTxt = clips.length ? `animation clips: ${clips.map(c => `${c.name || 'clip'} (${rnd(c.duration, 1)} s)`).join(', ')}` : 'no baked animation clips';
  const rigTxt = bones ? `rigged with a ${bones}-bone skeleton` : 'static mesh (no skeleton)';
  const shown = parts.slice(0, 24).map(p => `"${p.part}": ${p.material} (${p.color_name} ${p.color}, metalness ${p.metalness}, roughness ${p.roughness}${p.opacity < 1 ? ', opacity ' + p.opacity : ''}${p.textures.length ? ', ' + p.textures.join(', ') : ', no texture'})`);
  const summary = `Uploaded 3D model "${fileName}" (${fmt.toUpperCase()}), ${Math.round(tris).toLocaleString('en-US')} triangles, ${rigTxt}, ${clipTxt}, ${texSet.size} texture file${texSet.size === 1 ? '' : 's'}. `
    + `Parts and materials: ${shown.join('; ')}${parts.length > 24 ? `; and ${parts.length - 24} more parts` : ''}. Reproduce each part with exactly these materials, colors and finishes.`;
  return {file:fileName, format:fmt.toUpperCase(), triangles:Math.round(tris), rigged:bones > 0, bones, animations:clips.map(c => ({name:c.name || 'clip', seconds:rnd(c.duration, 2)})), textures:[...texSet], parts:parts.slice(0, 24), summary};
}
async function importModelFiles(fileList) {
  const files = [...fileList]; if (!files.length) return;
  const ext = f => (f.name.split('.').pop() || '').toLowerCase();
  const main = ['glb', 'gltf', 'fbx', 'obj'].map(x => files.find(f => ext(f) === x)).find(Boolean);
  if (!main) { AC.toast('Choose a .fbx, .obj, .glb or .gltf model (plus its textures)'); return; }
  if (!isVideo()) { AC.toast('Switch to Video & 3D mode first'); return; }
  const THREE = window.THREE, e = ext(main);
  AC.toast(`Loading ${main.name}…`);
  const urls = new Map(), urlNames = new Map();
  files.forEach(f => { const u = URL.createObjectURL(f); urls.set(f.name.toLowerCase(), u); urlNames.set(u, f.name); });
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(u => { const nm = decodeURIComponent(String(u).split('?')[0]).split(/[\\/]/).pop().toLowerCase(); return urls.get(nm) || u; });
  try {
    await ensureModelLoaders(e);
    if (THREE.TGALoader) manager.addHandler(/\.tga$/i, new THREE.TGALoader(manager));
    const mainUrl = urls.get(main.name.toLowerCase());
    const load = (Loader, url) => new Promise((res, rej) => new Loader(manager).load(url, res, undefined, err => rej(err instanceof Error ? err : new Error('File could not be read'))));
    let root, clips = [], mtlTex = null;
    if (e === 'fbx') { root = await load(THREE.FBXLoader, mainUrl); clips = root.animations || []; }
    else if (e === 'glb' || e === 'gltf') { const gl = await load(THREE.GLTFLoader, mainUrl); root = gl.scene; clips = gl.animations || []; }
    else {
      const mtl = files.find(f => ext(f) === 'mtl'); const ol = new THREE.OBJLoader(manager);
      if (mtl) mtlTex = parseMtlTextures(await mtl.text());
      if (mtl && THREE.MTLLoader) { const mats = await load(THREE.MTLLoader, urls.get(mtl.name.toLowerCase())); mats.preload(); ol.setMaterials(mats); }
      root = await new Promise((res, rej) => ol.load(mainUrl, res, undefined, rej));
    }
    const dead = []; root.traverse(n => { if (n.isLight || n.isCamera) dead.push(n); }); dead.forEach(n => n.parent && n.parent.remove(n));
    root.traverse(n => {
      if (!n.isMesh) return;
      if (!n.material) n.material = new THREE.MeshStandardMaterial({color:0xb0b0b0});
      (Array.isArray(n.material) ? n.material : [n.material]).forEach(m => {
        m.side = THREE.DoubleSide;
        ['map', 'emissiveMap'].forEach(k => { if (m[k]) { m[k].encoding = THREE.sRGBEncoding; m[k].needsUpdate = true; } });
        m.needsUpdate = true;
      });
    });
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    if (!isFinite(size.y) || size.y <= 0) throw new Error('The model has no visible geometry');
    const info = describeImportedModel(root, clips, main.name, e, urlNames, mtlTex);
    const customId = 'c' + Date.now().toString(36) + (++oid);
    CUSTOM.set(customId, {root, clips, size:size.clone(), center:center.clone(), min:box.min.clone(), info});
    const maxDim = Math.max(size.x, size.y, size.z), sc = 1.8 / maxDim, h = clamp(size.y * sc, .05, 25);
    const label = main.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Model';
    const o = newObject('custom', label, h, {placed:true, customId, modelInfo:info, clip:clips[0]?.name || '', clipSpeed:1, color:'#8e9aaf', auto:false});
    o.w = rnd(Math.max(.05, size.x * sc), 3);
    const tg = targetAt(T); o.x = rnd(tg.x + (V().objects.length ? .55 * ((V().objects.length % 5) - 2) : 0), 2); o.z = rnd(tg.z, 2);
    V().objects.push(o); selectObj(o.id, false); objPropsKey = ''; vfOptsKey = '';
    renderObjects(); buildTimeline(); syncVideoFocus(); AC.changed();
    AC.toast(`${label}: ${info.triangles.toLocaleString('en-US')} triangles${info.rigged ? ` · rig (${info.bones} bones)` : ''}${clips.length ? ` · ${clips.length} animation${clips.length > 1 ? 's' : ''}` : ''}`);
    return o;
  } catch (err) {
    console.error(err);
    AC.toast(`Could not load ${main.name}: ${err.message || 'unsupported file'}`);
  }
}
function updateCustomClip(o, cr, t) {
  const clip = o.clip ? cr.clips.find(c => c.name === o.clip) : null;
  if (!clip) { if (cr.cur) { cr.mixer.stopAllAction(); cr.cur = null; } return; }
  if (cr.cur !== clip.name) { cr.mixer.stopAllAction(); const a = cr.mixer.clipAction(clip); a.play(); cr.cur = clip.name; cr.action = a; }
  cr.action.time = clip.duration > 0 ? ((Math.max(0, t) * (o.clipSpeed || 1)) % clip.duration) : 0;
  cr.mixer.update(0);
}
$('objUpload')?.addEventListener('click', () => $('objUploadFile')?.click());
$('objUploadFile')?.addEventListener('change', e => { importModelFiles(e.target.files); e.target.value = ''; });
$('vpWrap')?.addEventListener('dragover', e => { if (isVideo() && e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
$('vpWrap')?.addEventListener('drop', e => { if (!isVideo() || !e.dataTransfer?.files?.length) return; e.preventDefault(); importModelFiles(e.dataTransfer.files); });
$('objMatchImg')?.addEventListener('click', () => {
  if (!AC.refs.length) { AC.toast('Add a reference image first'); return; }
  V().objects.forEach(o => { if (o.auto) { o.userMoved = false; o.userPosed = false; } });
  S.video.camMatchKey = null;
  syncObjectsFromSubjects();
  const m = computeImageMatch();
  if (!m) { AC.toast('No subjects were detected in the reference image yet'); return; }
  applyCameraMatch(m);
  objPropsKey = ''; vfOptsKey = ''; renderObjects(); buildTimeline(); syncVideoFocus(); AC.save(); AC.changed();
  AC.toast(`Camera matched to your image: ${m.az > 0 ? 'left' : m.az < 0 ? 'right' : 'front'} view ${Math.abs(Math.round(m.az))}°, tilt ${m.el}°, ${rnd(m.dist, 1)} m`);
});

/* ---------- Cinema 4D style timeline ---------- */
let selKey = null;
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
  // Always show Camera and every 3D object/group even before keyframes are added; other tracks (Focus) only appear once keyframed
  const alwaysGroups = new Set(['Camera', ...V().objects.map(o => 'obj:' + o.id)]);
  [...kFilter].forEach(g => { if (!counts.has(g) && !alwaysGroups.has(g)) kFilter.delete(g); });
  const order = ['Camera', ...(counts.has('Focus') ? ['Focus'] : []), ...V().objects.map(o => 'obj:' + o.id)];
  const icon = g => g === 'Camera' ? CAM_ICON : `<span class="sw${g.startsWith('obj:') ? '' : ' fp'}"${g.startsWith('obj:') ? ` style="background:${escAttr(objById(g.slice(4))?.color || '#888')}"` : ''}></span>`;
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  box.innerHTML = `<button class="kg" data-kg="" aria-pressed="${!kFilter.size && !sel}" title="Show and edit every keyframe">All${total ? `<b>${total}</b>` : ''}</button>`
    + order.map(g => {
      const cnt = counts.get(g) || 0;
      const oid = g.startsWith('obj:') ? g.slice(4) : '';
      const multiCls = oid && selSet.has(oid) && selSet.size > 1 ? ' multi-sel' : '';
      const isPressed = kFilter.has(g) || (oid && isObjSelected(oid)) || (g === 'Camera' && sel === 'camera');
      return `<button class="kg${multiCls}" ${oid ? 'draggable="true"' : ''} data-kg="${escAttr(g)}" aria-pressed="${isPressed}" title="${escAttr(groupName(g))} (Click to select for Record Keyframe, Shift+click to multi-select, right-click for menu)">${icon(g)}${esc(groupName(g))}${cnt ? `<b>${cnt}</b>` : ''}</button>`;
    }).join('');
  bindDragToGroup(box, 'data-kg');
  const recBtn = $('tlRec');
  if (recBtn) {
    const {objTargets, wantCam} = recordKeyTargets();
    const tName = [...(wantCam ? ['Camera'] : []), ...objTargets.map(o => o.label)].join(' + ') || 'Camera';
    recBtn.title = `Record keyframes for ${tName} at current frame`;
    recBtn.setAttribute('aria-label', `Record keyframes for ${tName}`);
  }
}
$('kGroups').addEventListener('click', e => {
  const b = e.target.closest('[data-kg]'); if (!b) return;
  const g = b.dataset.kg;
  if (!g) { kFilter.clear(); selectObj(null, false); }
  else {
    const oid = g.startsWith('obj:') ? g.slice(4) : null;
    if (oid && objById(oid)) {
      selectObj(oid, e.shiftKey);
      renderObjects();
    } else if (g === 'Camera') {
      selectObj('camera', false);
      renderObjects();
    }
    if (e.shiftKey) {
      kFilter.add(g);
    } else {
      kFilter.clear(); kFilter.add(g);
    }
  }
  selKey = null; buildTimeline(); AC.changed();
});
$('kGroups').addEventListener('dblclick', e => {
  const b = e.target.closest('[data-kg]'); if (!b) return;
  const g = b.dataset.kg || '';
  const oid = g.startsWith('obj:') ? g.slice(4) : null;
  if (oid && objById(oid)) {
    selectObj(oid, false);
    renderObjects(); buildTimeline();
    openObjEditBar(oid);
  }
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
  if ($('tlSubjDetail')) {
    $('tlSubjDetail').hidden = !V().showSubjDetail;
    $('tlSubjDetailBtn')?.setAttribute('aria-pressed', !!V().showSubjDetail);
    if (V().showSubjDetail) renderTlSubjDetail();
  }
  const drawerOpen = !!(V().showTracks || V().showGraph || V().showSubjDetail);
  if ($('vThree')) {
    const wasHidden = $('vThree').hidden;
    $('vThree').hidden = drawerOpen;
    if (wasHidden && !drawerOpen) requestAnimationFrame(() => AC.drawAll());
  }
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
function openObjCtx(x, y, targetObj) {
  closeCtx();
  const m = document.createElement('div'); m.className = 'ctx'; m.setAttribute('role', 'menu');
  const rows = [];
  if (targetObj) {
    rows.push(['lbl', 'C4D Transform Tool']);
    rows.push(['tool:move', (gizmoMode === 'move' ? '✓ ' : '') + 'Move (X, Y, Z)', 'E']);
    rows.push(['tool:rotate', (gizmoMode === 'rotate' ? '✓ ' : '') + 'Rotate (X, Y, Z)', 'R']);
    rows.push(['tool:scale', (gizmoMode === 'scale' ? '✓ ' : '') + 'Scale (X, Y, Z)', 'T']);
    rows.push(['sep']);
    const poseMap = poseMapFor(targetObj.model);
    if (poseMap) {
      rows.push(['lbl', `${MODELS[targetObj.model]} Pose`]);
      Object.entries(poseMap).forEach(([pk, pv]) => {
        rows.push(['pose:' + pk, (targetObj.pose === pk ? '✓ ' : '') + pv.name, '']);
      });
      rows.push(['sep']);
    }
    if (selSet.size >= 2) rows.push(['group', `Group Selected (${selSet.size})`, '']);
    if (targetObj.model === 'group') rows.push(['ungroup', `Ungroup "${targetObj.label}"`, '']);
    if (selSet.size >= 2 || targetObj.model === 'group') rows.push(['sep']);
    rows.push(['rename', 'Rename / Subject Detail…', '']);
    rows.push(['copy', selSet.size > 1 ? `Copy Selected (${selSet.size})` : 'Copy Object', 'Ctrl+C']);
    if (clipboardObjs.length) rows.push(['paste', 'Paste Object', 'Ctrl+V']);
    rows.push(['sep']);
    rows.push(['delete', selSet.size > 1 ? `Delete Selected (${selSet.size})` : 'Delete Object', 'Del']);
  } else {
    rows.push(['lbl', 'C4D Transform Tool']);
    rows.push(['tool:move', (gizmoMode === 'move' ? '✓ ' : '') + 'Move (X, Y, Z)', 'E']);
    rows.push(['tool:rotate', (gizmoMode === 'rotate' ? '✓ ' : '') + 'Rotate (X, Y, Z)', 'R']);
    rows.push(['tool:scale', (gizmoMode === 'scale' ? '✓ ' : '') + 'Scale (X, Y, Z)', 'T']);
    if (selSet.size >= 2 || clipboardObjs.length) rows.push(['sep']);
    if (selSet.size >= 2) rows.push(['group', `Group Selected (${selSet.size})`, '']);
    if (clipboardObjs.length) rows.push(['paste', 'Paste Object', 'Ctrl+V']);
  }
  if (!rows.length) return;
  m.innerHTML = rows.map(([id, n, k]) => id === 'sep' ? '<div class="sepl"></div>' : id === 'lbl' ? `<div style="padding:4px 10px;font-size:10px;font-weight:600;color:var(--muted);text-transform:uppercase">${esc(n)}</div>` : `<button role="menuitem" data-oce="${escAttr(id)}">${esc(n)}<span>${esc(k || '')}</span></button>`).join('');
  document.body.appendChild(m); ctxEl = m;
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, 8, innerWidth - r.width - 8) + 'px'; m.style.top = clamp(y, 8, innerHeight - r.height - 8) + 'px';
  m.addEventListener('click', e => {
    const b = e.target.closest('[data-oce]'); if (!b) return;
    const act = b.dataset.oce; closeCtx();
    if (act === 'tool:move') {
      gizmoMode = 'move'; renderVP(); AC.toast('Tool: Move (X, Y, Z)');
    } else if (act === 'tool:rotate') {
      gizmoMode = 'rotate'; renderVP(); AC.toast('Tool: Rotate (X, Y, Z)');
    } else if (act === 'tool:scale') {
      gizmoMode = 'scale'; renderVP(); AC.toast('Tool: Scale (X, Y, Z)');
    } else if (act.startsWith('pose:') && targetObj) {
      targetObj.pose = act.slice(5); targetObj.userPosed = true;
      applyPoseSideEffects(targetObj);
      if (isRiggedChar(targetObj.model) && (targetObj.pose === 'walking_still' || targetObj.pose === 'running_still')) ensureLiveRigLoop();
      objPropsKey = ''; renderObjects(); renderVP(); AC.save(); AC.changed();
      const pm = poseMapFor(targetObj.model);
      const pName = pm?.[targetObj.pose]?.name || targetObj.pose;
      AC.toast(`${targetObj.label}: ${pName}`);
    } else if (act === 'group') groupSelectedObjects();
    else if (act === 'ungroup' && targetObj) ungroupObject(targetObj.id);
    else if (act === 'rename' && targetObj) renameObjectModal(targetObj.id);
    else if (act === 'copy') copySelectedObjects();
    else if (act === 'paste') pasteCopiedObjects();
    else if (act === 'delete') deleteSelectedObjects();
  });
  m.querySelector('button')?.focus();
}
document.addEventListener('pointerdown', e => { if (ctxEl && !ctxEl.contains(e.target)) closeCtx(); }, true);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeCtx();
  if (!is3D() || e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (!e.ctrlKey && !e.metaKey && !e.altKey && sel && sel !== 'camera') {
    if (e.key.toLowerCase() === 'e') { gizmoMode = 'move'; renderVP(); AC.toast('Tool: Move (X, Y, Z)'); return; }
    if (e.key.toLowerCase() === 'r') { gizmoMode = 'rotate'; renderVP(); AC.toast('Tool: Rotate (X, Y, Z)'); return; }
    if (e.key.toLowerCase() === 't') { gizmoMode = 'scale'; renderVP(); AC.toast('Tool: Scale (X, Y, Z)'); return; }
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && sel && sel !== 'camera') {
    e.preventDefault(); copySelectedObjects(); return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboardObjs.length) {
    e.preventDefault(); pasteCopiedObjects(); return;
  }
  if (!isVideo() && (e.key === 'Delete' || e.key === 'Backspace') && sel && sel !== 'camera') {
    e.preventDefault(); deleteSelectedObjects(); return;
  }
  if (!isVideo() || !selKey) return;
  const ks = selectedKeys();
  if (e.key === 'F9') { e.preventDefault(); setEase(ks, e.shiftKey && (e.ctrlKey || e.metaKey) ? 'easeOut' : e.shiftKey ? 'easeIn' : 'easeInOut'); }
});
document.addEventListener('contextmenu', e => {
  const pk = e.target.closest('.pkey[data-pt]'), kf = e.target.closest('.kf[data-kpath]');
  if (pk || kf) {
    e.preventDefault();
    let keys;
    if (pk) { const t = +pk.dataset.pt; keys = fKeysAt(t); selKey = {t}; }
    else { const k = tracks()[kf.dataset.kpath]?.[+kf.dataset.ki]; keys = k ? [k] : []; selKey = k ? {path:kf.dataset.kpath, k} : null; }
    buildTimeline();
    if (keys.length) openCtx(e.clientX, e.clientY, keys);
    return;
  }
  if (!is3D()) return;
  // Right-click on object row, timeline group chip, Image 3D object bar chip, or 3D viewport object
  const objBtn = e.target.closest('[data-oid], [data-i3d], [data-kg]');
  if (objBtn) {
    const raw = objBtn.dataset.oid || objBtn.dataset.i3d || (objBtn.dataset.kg?.startsWith('obj:') ? objBtn.dataset.kg.slice(4) : '');
    const o = raw && raw !== 'camera' ? objById(raw) : null;
    if (o) {
      e.preventDefault();
      if (!isObjSelected(o.id)) { selectObj(o.id, e.shiftKey); renderObjects(); buildTimeline(); }
      openObjCtx(e.clientX, e.clientY, o);
      return;
    }
  }
  if (e.target.closest('#vpWrap') && !e.target.closest('button, input, select')) {
    e.preventDefault();
    const hit = raycastObjectAt(e.clientX, e.clientY);
    if (hit && !isObjSelected(hit.id)) { selectObj(hit.id, e.shiftKey); renderObjects(); buildTimeline(); }
    const activeObj = hit || (sel && sel !== 'camera' ? objById(sel) : null);
    openObjCtx(e.clientX, e.clientY, activeObj);
  }
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
const GCOL = ['#e85d2b', '#3f7cf6', '#3fb950', '#d4a72c', '#a371f7', '#e5484d', '#2bb3c0', '#f78fb3'], GP = 8;
const gShow = new Set();
let gMode = 'value', gGeo = null, gd = null;
const graphProps = () => props().filter(p => (p.kind === 'num' || p.kind === 'angle') && tracks()[p.path]?.length && inFilter(p.path));
function graphShown() {
  const all = graphProps();
  [...gShow].forEach(q => { if (!all.some(p => p.path === q)) gShow.delete(q); });
  return gShow.size ? all.filter(p => gShow.has(p.path)) : all;
}
function clampKeyV(path, v) {
  if (/\.(h|w)$/.test(path) || path === 'cam.dist') return Math.max(.01, v);
  if (/\.(sx|sy|sz)$/.test(path)) return clamp(v, .05, 20);
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
  const X = t => GP + t / dur * (w - GP * 2 - 1), tX = x => clamp((x - GP) / (w - GP * 2 - 1), 0, 1) * dur;
  const Y = (c, v) => pt + (1 - (v - c.lo) / (c.hi - c.lo)) * ph, vY = (c, y) => c.hi - (y - pt) / ph * (c.hi - c.lo);
  const keyV = (c, k) => gMode === 'value' ? k.v : c.pts[clamp(Math.round(k.t / dur * n), 0, n)][1];
  return {ctx, w, h, pt, pb, ph, curves, X, tX, Y, vY, keyV, hits:[]};
}
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
  ctx.textAlign = 'left'; ctx.fillStyle = C.muted;
  if (curves.length === 1) { const c = curves[0]; for (let i = 0; i <= 4; i++) ctx.fillText(gFmt(c, c.hi - (c.hi - c.lo) * i / 4), GP + 8, G.pt + G.ph * i / 4 + (i === 0 ? 6 : i === 4 ? -6 : 0)); }
  else { ctx.textAlign = 'right'; ctx.fillText(gMode === 'value' ? 'each curve scaled to fit' : 'speed, each curve scaled to fit', w - 4, 8); }
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
  let dx = x - gd.x0, dy = y - gd.y0;
  if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
  const dt = Math.round(dx / (G.w - 1) * dur * fps()) / fps(), moving = new Set(gd.moving.map(m => m.k));
  const ok = gd.moving.every(m => { const nt = clamp(snap(m.t0 + dt), 0, dur); return !m.keys.some(k => !moving.has(k) && Math.abs(k.t - nt) < frameDur() / 2); });
  gd.moving.forEach(m => {
    if (ok) m.k.t = clamp(snap(m.t0 + dt), 0, dur);
    if (gMode === 'value') { const rg = gd.ranges.get(m.c.p.path); m.k.v = clampKeyV(m.c.p.path, m.v0 - dy / G.ph * (rg.hi - rg.lo)); }
    delete m.k.m; delete m.k.mIn; delete m.k.mOut;
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
  V().showGraph = !V().showGraph; if (V().showGraph) { V().showTracks = false; V().showSubjDetail = false; }
  AC.save(); buildTimeline(); requestAnimationFrame(() => { renderVP(); drawGraph(); });
}
$('tlGraphBtn').addEventListener('click', toggleGraph);
function resetTimeline() {
  stop();
  S.video.tracks = {};
  S.video.duration = 5;
  S.video.fps = 24;
  S.video.loop = true;
  S.video.autokey = true;
  S.video.showTracks = false;
  S.video.showGraph = false;
  S.video.showSubjDetail = false;
  S.video.activePreset = null;
  S.video.activeAnimPreset = null;
  T = 0;
  selKey = null;
  kFilter.clear();
  gShow.clear();
  (V().objects || []).forEach(o => {
    o.y = 0; o.rx = 0; o.ry = 0; o.rz = 0; o.sx = 1; o.sy = 1; o.sz = 1;
    if (hasPoseModel(o.model)) o.pose = 'standing';
    o.userPosed = false;
  });
  $('tlLoop')?.setAttribute('aria-pressed', 'true');
  $('tlAuto')?.setAttribute('aria-pressed', 'true');
  objPropsKey = '';
  renderObjects();
  buildTimeline();
  renderPresets();
  renderAnimPresets();
  apply(0);
  AC.save();
  AC.changed();
  AC.toast('Timeline reset to default');
}
$('tlResetBtn')?.addEventListener('click', resetTimeline);
new ResizeObserver(() => drawGraph()).observe($('gWrap'));
['gProps', 'kGroups'].forEach(id => $(id).addEventListener('wheel', e => {
  const el = $(id); if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
  e.preventDefault(); el.scrollLeft += e.deltaY;
}, {passive:false}));

/* ---------- transport ---------- */
let rafPlay = 0, lastTs = 0;
const PLAY = '<path d="M4 2.5v11l9-5.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>', PAUSE = '<path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor"/>';
function play() {
  if (playing || !isVideo()) return;
  if (T >= V().duration - 1e-6) T = 0;
  playing = true; $('tlPlayIco').innerHTML = PAUSE; $('tlPlay').setAttribute('aria-pressed', 'true'); lastTs = performance.now();
  const step = ts => {
    if (!playing) return;
    let t = T + (ts - lastTs) / 1000; lastTs = ts;
    if (t > V().duration) {
      if (V().loop) t = 0;
      else { T = V().duration; apply(T); updateTimeUI(); stop(); return; }
    }
    T = t; apply(T);
    updateTimeUI();
    rafPlay = requestAnimationFrame(step);
  };
  rafPlay = requestAnimationFrame(step);
}
function stop() {
  if (!playing) return;
  playing = false; cancelAnimationFrame(rafPlay); $('tlPlayIco').innerHTML = PLAY; $('tlPlay').setAttribute('aria-pressed', 'false'); T = snap(T);
}
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
$('tlTracksBtn').addEventListener('click', () => { V().showTracks = !V().showTracks; if (V().showTracks) { V().showGraph = false; V().showSubjDetail = false; } AC.save(); buildTimeline(); requestAnimationFrame(() => renderVP()); });
$('tlFrame').addEventListener('change', e => { const f = parseInt(e.target.value, 10); if (isFinite(f)) { stop(); setTime(f / fps()); } });
$('tlFrame').addEventListener('input', e => { if (e.target.classList.contains('scrubbing')) { const f = parseInt(e.target.value, 10); if (isFinite(f)) { stop(); setTime(f / fps()); } } });
function setDuration(sec) {
  S.video.duration = rnd(clamp(sec, 1, 60), 3);
  Object.values(tracks()).forEach(keys => keys.forEach(k => { k.t = Math.min(k.t, S.video.duration); }));
  setTime(Math.min(T, S.video.duration)); buildTimeline(); AC.save(); AC.changed();
}
$('tlDurS').addEventListener('change', e => {
  const v = e.target.value.trim(), m = v.match(/^(\d+):(\d+(?:\.\d+)?)$/);
  const sec = m ? +m[1] * 60 + +m[2] : parseFloat(v.replace(',', '.'));
  if (isFinite(sec) && sec > 0) { setDuration(sec); AC.toast(`Video length ${tc(S.video.duration)}`); } else { e.target.value = tc(S.video.duration); AC.toast('Type seconds, like 8 or 0:12'); }
});
$('tlDurS').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('tlEndF').addEventListener('change', e => {
  const f = clamp(parseInt(e.target.value, 10) || endFrame(), fps(), 60 * fps());
  S.video.duration = rnd(f / fps(), 4);
  Object.values(tracks()).forEach(keys => keys.forEach(k => { k.t = Math.min(k.t, S.video.duration); }));
  setTime(Math.min(T, S.video.duration)); buildTimeline(); AC.save(); AC.changed();
});
document.addEventListener('keydown', e => {
  if (!isVideo() || e.target.closest('input, textarea, select, .dd-pop, [contenteditable]')) return;
  if (e.code === 'Space') { e.preventDefault(); playing ? stop() : play(); }
  else if (e.key === 'F3' && e.shiftKey) { e.preventDefault(); toggleGraph(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && selKey) { e.preventDefault(); $('kfDel').click(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && !selKey && sel && sel !== 'camera') { e.preventDefault(); deleteSelectedObjects(); }
  else if (e.key === 'ArrowRight' && e.altKey) { stop(); setTime(T + frameDur()); }
  else if (e.key === 'ArrowLeft' && e.altKey) { stop(); setTime(T - frameDur()); }
});
$('vpGuidesBtn').addEventListener('click', () => { V().guides = !V().guides; $('vpGuidesBtn').setAttribute('aria-pressed', V().guides); AC.save(); renderVP(); });
$('vpGround').addEventListener('click', () => { V().ground = V().ground === false; $('vpGround').setAttribute('aria-pressed', V().ground); AC.save(); renderVP(); });
$('vpPath').addEventListener('click', () => { V().path = !V().path; $('vpPath').setAttribute('aria-pressed', V().path); AC.save(); AC.drawAll(); });

/* ---------- export (PNG image / MP4 video) ---------- */
let dl = null;
const dlReady = (async () => { try { dl = window.claude ? await window.claude.use('downloads') : null; } catch (e) { dl = null; } return dl; })();
async function saveFile(filename, blob) {
  await dlReady;
  if (!dl) {
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
  R.renderer.domElement.toBlob(b => { renderVP(); if (b) saveFile('visionpilot-3d-reference.png', b); else AC.toast('Could not export the image'); }, 'image/png');
});
let exporting = false;
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
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42e028', 'avc1.42e01f']) {
    const cfg = {codec, width:w, height:h, bitrate:8e6, framerate:fps(), avc:{format:'avc'}};
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch (e) {}
  }
  return null;
}
/* yield to the event loop WITHOUT setTimeout – timers are throttled to ≥1 s in background tabs, which made export crawl */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
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
      while (enc.encodeQueueSize > 8 && !err) await new Promise(r => { enc.addEventListener('dequeue', r, {once:true}); setTimeout(r, 250); });
      if (performance.now() - lastUI > 80) { btn.textContent = `Exporting ${Math.round(f / n * 100)}%`; updateTimeUI(); await tick(); lastUI = performance.now(); }
    }
    btn.textContent = 'Finishing…';
    await enc.flush(); if (err) throw err;
  } finally { if (enc.state !== 'closed') enc.close(); }
  muxer.finalize();
  return new Blob([muxer.target.buffer], {type:'video/mp4'});
}
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

/* ---------- enter / leave video & Image 3D + 3D Focus Subject buttons ---------- */
let vfOptsKey = '';
function syncVideoFocus() {
  if (!is3D()) return;
  const fs = focusSt();
  if (!Array.isArray(fs.targets)) fs.targets = fs.target ? [fs.target] : [];
  $('vfOn').setAttribute('aria-checked', !!fs.on);
  $('vfMarkOn')?.setAttribute('aria-checked', !!fs.showMark);
  const objs = V().objects || [];
  const labels = objs.map(o => o.label);
  const key = ['vid', ...labels].join('|');
  if (key !== vfOptsKey) {
    vfOptsKey = key;
    $('vfTarget').innerHTML = '<option value="">Scene center (default)</option>'
      + labels.map(l => `<option value="${escAttr(l)}">${esc(l)}</option>`).join('');
  }
  fs.targets = fs.targets.filter(t => labels.includes(t));
  if (fs.target && !labels.includes(fs.target)) fs.target = fs.targets[0] || '';
  $('vfTarget').value = fs.on ? (fs.target || '') : '';
  AC.refreshDD($('vfTarget'));
  AC.setIfIdle($('vfNote'), fs.note || '');
  // Populate 3D Focus Subject buttons (multi-selectable, without close '×' buttons)
  const subjBox = $('vfSubjList');
  if (subjBox) {
    if (!objs.length) {
      subjBox.innerHTML = '<span class="hint">No 3D objects in scene yet.</span>';
    } else {
      subjBox.innerHTML = objs.map(o => {
        const pressed = fs.on && (fs.targets.includes(o.label) || fs.target === o.label);
        return `<button type="button" class="tog fsubj" data-vfsubj="${escAttr(o.label)}" aria-pressed="${pressed}" style="--sc:${escAttr(o.color)}"><i class="sdot" style="background:${escAttr(o.color)}"></i><span>${esc(o.label)}</span></button>`;
      }).join('');
    }
  }
  syncFocusXYZ();
}
$('vfSubjList')?.addEventListener('click', e => {
  const b = e.target.closest('[data-vfsubj]'); if (!b) return;
  const lbl = b.dataset.vfsubj, fs = focusSt();
  if (!Array.isArray(fs.targets)) fs.targets = fs.target ? [fs.target] : [];
  if (fs.targets.includes(lbl)) {
    fs.targets = fs.targets.filter(t => t !== lbl);
  } else {
    fs.targets.push(lbl);
  }
  if (fs.targets.length) {
    if (!fs.on) fs.showMark = true;
    fs.on = true;
    fs.target = fs.targets[fs.targets.length - 1];
  } else {
    fs.target = '';
  }
  syncVideoFocus();
  AC.changed();
});
$('vfOn')?.addEventListener('click', () => {
  const fs = focusSt();
  fs.on = !fs.on;
  if (fs.on) fs.showMark = true;
  else { fs.targets = []; fs.showMark = false; fs.pointPinned = false; }
  syncVideoFocus();
  AC.changed();
});
$('vfMarkOn')?.addEventListener('click', () => {
  const fs = focusSt();
  fs.showMark = !fs.showMark;
  syncVideoFocus();
  renderVP();
  AC.save();
});
$('vfTarget')?.addEventListener('change', e => {
  const fs = focusSt();
  fs.target = e.target.value;
  fs.targets = e.target.value ? [e.target.value] : [];
  fs.pointPinned = false;
  if (e.target.value) { if (!fs.on) fs.showMark = true; fs.on = true; }
  AC.changed();
});
$('vfNote')?.addEventListener('input', e => { focusSt().note = e.target.value; AC.changed(); });
function go() {
  AC.switchModeState?.('video');
  focusSt().showMark = true;
  AC.renderRefs?.();
  syncObjectsFromSubjects();
  AC.applyLayout();
  initThree();
  setVpViewMode(vpViewMode || 'orbit');
  $('tlLoop').setAttribute('aria-pressed', S.video.loop); $('tlAuto').setAttribute('aria-pressed', S.video.autokey !== false);
  $('vpGuidesBtn').setAttribute('aria-pressed', V().guides); $('vpPath').setAttribute('aria-pressed', V().path); $('vpGround').setAttribute('aria-pressed', V().ground !== false);
  objPropsKey = ''; vfOptsKey = ''; renderObjects(); buildTimeline(); renderPresets(); renderAnimPresets(); setTime(0);
  AC.changed();
  requestAnimationFrame(() => { renderVP(); AC.drawAll(); drawPower(); });
}
['vfX', 'vfY', 'vfZ'].forEach(id => $(id).addEventListener('input', () => {
  const v = ['vfX', 'vfY', 'vfZ'].map(i => parseFloat($(i).value)); if (!v.every(isFinite)) return;
  setFocusMarkerWorld(v[0], v[1], v[2], null, true);
  AC.changed();
}));
function syncFocusXYZ() {
  if (!is3D()) return;
  const fm = focusMarkerAt(T);
  ['vfX', 'vfY', 'vfZ'].forEach((id, i) => AC.setIfIdle($(id), rnd([fm.x, fm.y, fm.z][i], 2)));
}
hooks.enterVideo = () => { S.video.ready = true; go(); };
hooks.leaveVideo = () => { stop(); closeObjEditBar(); if ($('vThree')) $('vThree').hidden = false; };
hooks.onChange = () => autoKey();
hooks.keyToggle = path => keyToggle(path);
hooks.afterSync = () => { if (is3D()) { renderObjects(); syncVideoFocus(); if (isVideo()) { renderPresets(); renderAnimPresets(); } } updateTimeUI(); };
hooks.restored = () => {
  if (!V().objects.find(o => o.id === sel)) selectObj(V().objects[0]?.id || null, false);
  selKey = null; objPropsKey = '';
  if (is3D()) {
    initThree(); renderObjects(); if (isVideo()) { buildTimeline(); apply(T); }
    $('tlLoop').setAttribute('aria-pressed', !!S.video.loop); $('tlAuto').setAttribute('aria-pressed', S.video.autokey !== false);
    $('vpGuidesBtn').setAttribute('aria-pressed', !!V().guides); $('vpPath').setAttribute('aria-pressed', !!V().path); $('vpGround').setAttribute('aria-pressed', V().ground !== false);
  }
};
/* ---------- undo / redo (history lives in core.js) ---------- */
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
const VIEW_PREFS = ['loop', 'autokey', 'guides', 'ground', 'path', 'showTracks', 'showGraph'];
hooks.beforeRestore = st => { if (st.video && S.video) VIEW_PREFS.forEach(k => { if (k in S.video) st.video[k] = S.video[k]; else delete st.video[k]; }); };
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
hooks.extraTargets = () => is3D() ? V().objects.map(o => o.label) : [];
hooks.afterDock = () => { if (is3D()) { objPropsKey = ''; renderObjects(); if (isVideo()) { drawPower(); drawGraph(); } renderVP(); } };
hooks.refsChanged = () => {
  if (S.video) syncObjectsFromSubjectsFor(S.video);
  if (!is3D()) return;
  syncObjectsFromSubjects();
  objPropsKey = ''; vfOptsKey = '';
  renderObjects(); syncVideoFocus();
  if (isVideo()) buildTimeline();
  renderVP(); AC.drawAll();
};
hooks.themeChanged = () => { if (is3D()) { if (isVideo()) { drawPower(); drawGraph(); } renderVP(); } };
new ResizeObserver(() => { if (isVideo()) drawPower(); }).observe($('power'));

/* ---------- video prompt & Image 3D prompt ---------- */
function objPoseDescription(o) {
  const pm = poseMapFor(o.model);
  if (pm && o.pose && pm[o.pose]) return pm[o.pose].prompt;
  if (o.model === 'group' && Array.isArray(o.children)) {
    return `composite structure "${o.label}" built from ${o.children.length} shapes (${o.children.map(c => c.label || MODELS[c.model]).join(', ')})`;
  }
  return null;
}
function findActiveAnimPresetDef() {
  const id = S.video?.activeAnimPreset;
  if (!id) return null;
  for (const g of ANIM_PRESET_GROUPS) {
    const it = g.items.find(x => x.id === id);
    if (it) return it;
  }
  return null;
}
function describeSegment(t0, t1, cm) {
  const c0 = camAt(t0), c1 = camAt(t1), moves = [];
  const dAz = c1.az - c0.az, dEl = c1.el - c0.el, r = c1.dist / c0.dist, z = c1.focal / c0.focal, dRoll = c1.roll - c0.roll;
  const dolly = r < .93 ? 'in' : r > 1.07 ? 'out' : null, zoom = z > 1.07 ? 'in' : z < .93 ? 'out' : null;
  const secs = Math.max(t1 - t0, 1e-3), cmds = [], shotOf = c => AC.calc({dist:c.dist, focal:c.focal, sensorW:c.sensor}).shot.name.toLowerCase();
  if (Math.abs(dAz) >= 3) {
    const deg = Math.round(Math.abs(dAz)), right = dAz > 0, sp = Math.round(Math.abs(dAz) / secs);
    cmds.push(`camera arcs ${right ? 'RIGHT' : 'LEFT'} around the subject by ${deg}°`);
    moves.push(`the camera travels in an arc around the subject toward camera-${right ? 'right' : 'left'} by ${deg}° (${right ? 'counter-clockwise' : 'clockwise'} seen from above, about ${sp}° per second); on screen the background slides from ${right ? 'right to left' : 'left to right'} and the subject stays facing forward without spinning while the camera orbits around it`);
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
  const fp0 = (S.focus.on || S.focus.showMark || hasFocusPointKeys()) ? detect3DFocusPartAt(t0) : null;
  const fp1 = (S.focus.on || S.focus.showMark || hasFocusPointKeys()) ? detect3DFocusPartAt(t1) : null;
  if (fp0 && fp1 && fp0.fullLabel !== fp1.fullLabel) {
    cmds.push(`focus shifts from ${fp0.fullLabel} to ${fp1.fullLabel}`);
    moves.push(`the 3D Focus Marker shifts optical focus from ${fp0.fullLabel} (at ${rnd(t0, 2)}s, frame ${frameOf(t0)}) onto ${fp1.fullLabel} (at ${rnd(t1, 2)}s, frame ${frameOf(t1)})`);
  } else if (fp0 && (S.focus.on || S.focus.showMark)) {
    moves.push(`optical focus is locked on ${fp0.fullLabel}`);
  }
  const subj = [];
  V().objects.forEach(o => {
    const g = (k, t) => valueAt(`obj.${o.id}.${k}`, t, k === 'color' ? 'color' : 'num', o[k]);
    const dx = g('x', t1) - g('x', t0), dz = g('z', t1) - g('z', t0), dr = g('ry', t1) - g('ry', t0), dh = g('h', t1) / g('h', t0), dy = g('y', t1) - g('y', t0);
    const mv = Math.hypot(dx, dz);
    const isChar = isRiggedChar(o.model);
    const verb = isChar ? (mv / secs > 1.75 || o.pose === 'running_still' ? 'runs' : 'walks') : o.model === 'car' ? (Math.abs(dr) > 22 ? 'drifts with counter-steer and tire smoke' : 'drives') : 'moves';
    if (mv > .05) subj.push(`${o.label} ${verb} ${rnd(mv, 2)} m ${Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'to the right' : 'to the left') : (dz > 0 ? 'toward the front' : 'away, toward the back')}`);
    if (Math.abs(dr) >= 5) subj.push(`${o.label} turns ${Math.round(Math.abs(dr))}° ${dr > 0 ? 'to its left' : 'to its right'}`);
    if (Math.abs(dy) > .05) {
      if (isChar) subj.push(dy > 0 ? `${o.label} crouches in preparation and jumps upward ${rnd(Math.abs(dy), 2)} m${o.model === 'person' ? ' without spinning' : ', front legs reaching and tail streaming behind'}` : `${o.label} lands smoothly on the ground`);
      else if (o.model === 'car') subj.push(dy > 0 ? `${o.label} launches into the air ${rnd(Math.abs(dy), 2)} m with its nose raised and suspension hanging loose` : `${o.label} lands on all four wheels with a suspension bounce and keeps driving`);
      else subj.push(`${o.label} ${dy > 0 ? 'rises' : 'lowers'} ${rnd(Math.abs(dy), 2)} m`);
    }
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
  const cm = AC.common(), dur = S.video.duration;
  const times = [...new Set([0, ...allKeyTimes().filter(t => t > 0 && t < dur), dur].map(t => rnd(t, 4)))].sort((a, b) => a - b);
  const shots = []; for (let i = 0; i < times.length - 1; i++) if (times[i + 1] - times[i] > 1e-3) shots.push(describeSegment(times[i], times[i + 1], cm));
  const c0 = camAt(0), c1 = camAt(dur);
  const ang0 = AC.angleParts(cm, c0.az, c0.el), ang1 = AC.angleParts(cm, c1.az, c1.el);
  const objs = V().objects.map(o => ({
    label:o.label,
    proxy_model:o.model === 'group' ? `Group (${o.label})` : o.model === 'custom' ? `Uploaded 3D model (${o.modelInfo?.file || 'custom'})` : MODELS[o.model],
    pose:objPoseDescription(o) || undefined,
    model_3d:o.model === 'custom' && o.modelInfo ? {file:o.modelInfo.file, format:o.modelInfo.format, triangles:o.modelInfo.triangles, rig:o.modelInfo.rigged ? `${o.modelInfo.bones} bones` : 'none', animation_clip:o.clip || null, animations:o.modelInfo.animations, textures:o.modelInfo.textures,
      parts_and_materials:o.modelInfo.parts.map(p => ({part:p.part, material:p.material, color:`${p.color_name} (${p.color})`, metalness:p.metalness, roughness:p.roughness, opacity:p.opacity, textures:p.textures}))} : undefined,
    height_m:rnd(o.h, 2), width_m:rnd(o.w, 2),
    scale:{x:rnd(o.sx ?? 1, 2), y:rnd(o.sy ?? 1, 2), z:rnd(o.sz ?? 1, 2)},
    position_m:{x:rnd(o.x, 2), z:rnd(o.z, 2), lift:rnd(o.y, 2)},
    rotation_deg:Math.round(o.ry),
    reference_image:AC.refs[o.img] ? o.img + 1 : null,
    description:[o.subjDesc || AC.allSubjects().find(s => (s.name3d || s.label) === o.label)?.desc || objPoseDescription(o) || '', o.model === 'custom' ? o.modelInfo?.summary || '' : ''].filter(Boolean).join(' ') || null
  }));
  const keyframes = {};
  Object.entries(tracks()).forEach(([path, keys]) => {
    const p = props().find(x => x.path === path); if (!p) return;
    keyframes[`${groupName(p.group)} · ${p.name}`] = keys.map(k => ({frame:frameOf(k.t), time_s:rnd(k.t, 3), value:p.fmt(k.v), easing:EASES[k.e]?.name || k.e}));
  });
  const activeAnimDef = findActiveAnimPresetDef();
  const animPresetNote = activeAnimDef?.prompt ? `ANIMATION PRESET (${activeAnimDef.name}): ${activeAnimDef.prompt} ` : '';
  const moveSummary = shots.map(s => s.description).join(' ');
  const timing = shots.map(s => s.command).join('. ');
  const shot0 = AC.calc({dist:c0.dist, focal:c0.focal, sensorW:c0.sensor}).shot.name.toLowerCase(), shot1 = AC.calc({dist:c1.dist, focal:c1.focal, sensorW:c1.sensor}).shot.name.toLowerCase();
  const focusTargets = S.focus.on && Array.isArray(S.focus.targets) && S.focus.targets.length ? S.focus.targets : (S.focus.on && S.focus.target ? [S.focus.target] : []);
  const showOnlyLead = focusTargets.length ? `Show only ${joinList(focusTargets)} as the primary focal subject${focusTargets.length > 1 ? 's' : ''} in sharp focus. ` : '';
  const fpTimeline = (S.focus.on || S.focus.showMark || hasFocusPointKeys()) ? sampleFocusPartTimeline() : null;
  let focusPartNote = '';
  if (fpTimeline && fpTimeline.timeline.length) {
    if (fpTimeline.shifted) {
      const stepsTxt = fpTimeline.timeline.map((s, idx) =>
        `${idx === 0 ? 'starts focused on' : 'then shifts focus to'} ${s.fullLabel} at frame ${s.frame} (${s.t}s)`
      ).join(', ');
      const seqStr = fpTimeline.timeline.map(s => `${s.fullLabel} (frame ${s.frame}, ${s.t}s)`).join(' -> ');
      focusPartNote = `FOCUS MARKER PART TRACKING: The 3D Focus Marker ${stepsTxt} (ordered focus sequence: ${seqStr}). Pull camera focus smoothly across these exact parts in order. `;
    } else {
      const curFp = fpTimeline.current || fpTimeline.timeline[0];
      focusPartNote = `FOCUS MARKER TARGET PART: The focus is on ${curFp.fullLabel} (${curFp.partName} of ${curFp.objectLabel}); keep razor-sharp optical focus locked on ${curFp.fullLabel}. `;
    }
  }
  const refVideoAiInstruction = 'VIDEO GENERATION AI INSTRUCTION (ANALYZE & FOLLOW REFERENCE VIDEO): Analyze the attached exported 3D reference video (visionpilot-camera-reference.mp4) and detect all of its motion, animation, camera movement, camera angles, speed and timing, and what the subject is doing. Follow the reference video 100% exactly in motion, timing, and camera trajectory, using the attached reference image(s) and selected focus subject in place of the 3D model.';
  const customModels = V().objects.filter(o => o.model === 'custom' && o.modelInfo);
  const customModelText = customModels.map(o => `"${o.label}" — ${o.modelInfo.summary}${o.clip ? ` It plays the "${o.clip}" animation.` : ''}`).join(' ');
  const sceneNamesDesc = (V().objects.length ? `Scene elements: ${V().objects.map(o => `${o.label}${o.pose && hasPoseModel(o.model) ? ' (' + objPoseDescription(o) + ')' : ''}`).join(', ')}. ` : '')
    + (customModelText ? `UPLOADED 3D MODEL DETAILS (what each part is made of): ${customModelText} ` : '');
  const curFpInfo = fpTimeline?.current || fpTimeline?.timeline?.[0] || null;
  const activeAiModel = S.aiModel || 'visionpilot';
  const aiWorkflow = (activeAiModel !== 'visionpilot' && window.VPAIBridge?.buildWorkflowExplanation)
    ? window.VPAIBridge.buildWorkflowExplanation(activeAiModel, {
        isVideo: true,
        refDesc: S.subjDesc || '',
        focusOn: !!(S.focus.on || curFpInfo),
        focusMode: 'video_3d',
        focusTarget: focusTargets.length ? joinList(focusTargets) : (curFpInfo?.objectLabel || cm.focus?.target || cm.noun),
        pointedPart: curFpInfo?.partName || '',
        pointedWhere: curFpInfo?.fullLabel || '',
        focusDetail: focusPartNote.trim() || S.focus.desc || '',
        cameraSummary: `${timing}; starts at ${ang0.A.label.toLowerCase()}, ${ang0.E.label.toLowerCase()} (${shot0}) and ends at ${ang1.A.label.toLowerCase()}, ${ang1.E.label.toLowerCase()} (${shot1})`,
        videoFocusShifts: focusPartNote.trim()
      })
    : null;
  const master = (aiWorkflow ? `[${aiWorkflow.active_ai_model} AI Workflow] ` : '')
    + `ONE continuous ${dur}-second shot, ${cm.aspectStr}, no cuts. ${showOnlyLead}${focusPartNote}${animPresetNote}${refVideoAiInstruction} CAMERA MOTION (follow this exact timing and direction): ${timing}. `
    + `First frame: ${ang0.A.label.toLowerCase()}, ${ang0.E.label.toLowerCase()}, ${shot0}. Last frame: ${ang1.A.label.toLowerCase()}, ${ang1.E.label.toLowerCase()}, ${shot1}. `
    + `Subject: the exact same ${cm.subjRef} from the reference image${AC.refs.length > 1 ? 's' : ''}. ${sceneNamesDesc}`
    + (cm.action ? cm.action + ' ' : '')
    + (cm.composition ? 'All subjects from every reference image appear together in one scene. ' : '')
    + `Camera move in detail: ${moveSummary} `
    + `Shot on ${cm.body.name} with ${cm.lensName}. ${cm.dofPhrase}. `
    + (cm.detail ? `Zoom to Detail: ${cm.detail.part}${S.focus.target ? ' of ' + S.focus.target : ''} fills the frame when the camera is closest. ` : '')
    + (focusTargets.length ? `Show only ${joinList(focusTargets)} as the main subject${focusTargets.length > 1 ? 's' : ''}, kept centered and sharpest. ` : cm.focus ? `${cm.focus.target || 'The focus point'} is the main subject and stays centered and sharpest. ` : 'The camera always aims at the subject, which stays centered and in focus. ')
    + (aiWorkflow ? aiWorkflow.workflow_narrative + ' ' : '')
    + `Keep ${joinList(cm.preserve.slice(0, 4))} identical to the reference in every frame. The background turns with the camera and shows the scene from each new direction. `
    + 'The attached reference video is ONLY a camera-motion guide made with simple gray stand-in shapes: copy its camera path, timing, easing and framing, but never its look. '
    + 'The final video must be real live-action footage of the real subjects from the reference images, filmed with a real cinema camera: real skin with pores, real hair, real fabric and materials, natural light and motion. Not 3D, not CGI, not animation, not a game engine look. Smooth, stable, continuous camera motion with no cuts.'
    + (cm.keyTexts.length ? ' ' + cm.keyTexts.map(t => t.split(':')[0]).join('. ') + '.' : '');
  const detailed = [
    aiWorkflow ? aiWorkflow.workflow_narrative : '',
    `Use the attached reference image${AC.refs.length > 1 ? 's' : ''} as the single source of truth for the ${cm.subjRef}, and the attached camera reference video (visionpilot-camera-reference.mp4) only as the camera-motion and blocking guide. The gray shapes in that video are placeholders: never show them and never copy their 3D look. Film the real subjects as live-action footage.`,
    refVideoAiInstruction,
    showOnlyLead,
    focusPartNote,
    animPresetNote,
    sceneNamesDesc,
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
    ai_model:activeAiModel,
    ai_model_workflow:aiWorkflow || undefined,
    master_prompt:master,
    detailed_prompt:detailed,
    animation_preset:activeAnimDef ? {id:activeAnimDef.id, name:activeAnimDef.name, instruction:activeAnimDef.prompt || null} : null,
    duration_s:dur, fps:fps(), frames:endFrame(), aspect_ratio:cm.aspectStr,
    key_requirements:cm.keyTexts,
    reference_video:{file:'visionpilot-camera-reference.mp4', ai_model_instruction:refVideoAiInstruction, how_to_use:'Analyze this exported 3D reference video to detect all motion, animation, camera movement, camera angles, speed and timing, and what the subject is doing; follow it 100% faithfully using the reference image and selected subject in place of the 3D model', export_from:'VisionPilot viewer (Export video)'},
    reference_images:AC.refs.length ? AC.refs.map((r, i) => ({image:i + 1, file:r.name, transparent_png:r.alpha || undefined, subjects:cm.subs.filter(s => s.img === i).map(s => s.label)})) : [{image:1, file:null, note:'attach your reference image'}],
    composition:cm.composition || null,
    subjects:objs,
    camera_motion:{timeline:shots.map(s => s.command), rule:'one continuous take; follow each time range and direction exactly; no extra moves, no cuts'},
    shots,
    keyframes,
    focus_point:(cm.focus || curFpInfo) ? {
      target:focusTargets.length ? joinList(focusTargets) : (curFpInfo?.objectLabel || cm.focus?.target || 'custom point'),
      targets:focusTargets,
      pointed_part:curFpInfo?.partName || null,
      pointed_target:curFpInfo?.fullLabel || null,
      focus_shifts:fpTimeline?.timeline || [],
      focus_description:focusPartNote.trim() || null,
      show_only:focusTargets.length ? `Show only ${joinList(focusTargets)} as the primary focal subject` : undefined,
      note:cm.focus?.note || null,
      animated:!!(tracks().focus?.length || hasFocusPointKeys() || fpTimeline?.shifted),
      position_m:{x:rnd(focusMarkerAt(T).x, 2), y:rnd(focusMarkerAt(T).y, 2), z:rnd(focusMarkerAt(T).z, 2)}
    } : null,
    macro_detail:cm.detail ? {detail:cm.detail.part, of:cm.detail.of, approx_size_cm:cm.detail.size_cm} : null,
    camera:{...AC.cameraJSON(cm), start:shots[0]?.start || null, end:shots[shots.length - 1]?.end || null},
    depth_of_field:{enabled:S.dof, aperture:AC.apStr(cm.N), focus:'locked on the focus subject throughout, pulling focus when the target changes', background:cm.bgBlur},
    lighting:AC.lightingJSON(cm),
    background:{setting:cm.bgText, start_angle:ang0.bgView, end_angle:ang1.bgView, rule:'the background must move and change with the camera, never a static pasted backdrop'},
    style:{look:'real live-action footage', not:'3D render, CGI, animation, game engine, gray placeholder shapes', camera_look:cm.body.look},
    negative_prompt:cm.negative + ', 3D animation, rendered look, game engine, Unreal Engine look, gray placeholder shapes, mannequins, low-poly, smooth plastic faces, jittery camera, sudden jumps, jump cuts, flicker, morphing faces, warping, inconsistent identity between frames, frozen background'
  };
};

// 3D Still-Camera Image Prompt integration for Export Image (no timeline, no time indicators, no camera movement animations)
hooks.buildImg3DPromptData = () => {
  const objs = V().objects || [];
  const dets = V().subjDetails || {};
  const fs = focusSt() || {};
  const focusTargets = fs.on && Array.isArray(fs.targets) && fs.targets.length ? fs.targets : (fs.on && fs.target ? [fs.target] : []);
  const curFp3D = (fs.on || fs.showMark) ? detect3DFocusPartAt(T) : null;
  const fp3DTxt = curFp3D ? ` Focus Marker is pointing directly at ${curFp3D.fullLabel} (${curFp3D.partName} of ${curFp3D.objectLabel}).` : '';
  const focusOnlyText = focusTargets.length
    ? `FOCUS SUBJECT PRIORITY: Show only ${joinList(focusTargets)} as the primary hero focal subject${focusTargets.length > 1 ? 's' : ''} centered in the middle of the frame in razor-sharp focus, while non-selected elements sit in secondary positions.${fp3DTxt}`
    : (fp3DTxt ? `FOCUS MARKER TARGET:${fp3DTxt}` : '');
  const items = objs.map(o => {
    const userDetail = (dets[o.id] || o.subjDesc || '').trim();
    const modelTxt = o.model === 'custom' && o.modelInfo ? o.modelInfo.summary : '';
    const customDetail = [userDetail, modelTxt].filter(Boolean).join(' ');
    const poseTxt = objPoseDescription(o);
    const posDesc = `${o.x < -.25 ? 'left' : o.x > .25 ? 'right' : 'center'} (${rnd(o.x, 2)}m X, ${rnd(o.z, 2)}m Z, ${rnd(o.y, 2)}m lift)`;
    return {
      name:o.label,
      proxy_type:o.model === 'group' ? `Grouped structure (${o.label})` : o.model === 'custom' ? `Uploaded 3D model (${o.modelInfo?.file || 'custom'})` : MODELS[o.model],
      color_marker:o.color,
      pose:poseTxt || undefined,
      model_3d:modelTxt ? {file:o.modelInfo.file, rig:o.modelInfo.rigged ? `${o.modelInfo.bones} bones` : 'none', textures:o.modelInfo.textures, parts_and_materials:o.modelInfo.parts.map(p => `${p.part}: ${p.material}, ${p.color_name} ${p.color}${p.textures.length ? ', ' + p.textures.join(', ') : ''}`)} : undefined,
      is_focus_subject:focusTargets.includes(o.label),
      position_3d:{x:rnd(o.x, 2), y:rnd(o.y, 2), z:rnd(o.z, 2), rotation_deg:Math.round(o.ry), height_m:rnd(o.h, 2), width_m:rnd(o.w, 2), scale:{x:rnd(o.sx ?? 1, 2), y:rnd(o.sy ?? 1, 2), z:rnd(o.sz ?? 1, 2)}},
      spatial_placement:posDesc,
      subject_detail:customDetail || null,
      instruction:customDetail
        ? `Replace the ${o.color} 3D proxy "${o.label}" at ${posDesc}${poseTxt ? ' (' + poseTxt + ')' : ''} with a photorealistic real-world ${o.label}: ${customDetail}.`
        : `Render "${o.label}" (${poseTxt || MODELS[o.model]}) at ${posDesc} as a realistic real-world subject.`
    };
  });
  const masterPrefix = `Render a photorealistic real-world photograph guided by the exported 3D layout reference (visionpilot-3d-reference.png)${AC.refs.length ? ` and the attached real subject/object reference image${AC.refs.length > 1 ? 's' : ''}` : ''}.`;
  const masterDetails = items.length
    ? `3D SCENE BLOCKING (${items.length} placed element${items.length > 1 ? 's' : ''}): ${items.map(it => `${it.name}${it.subject_detail ? ' — ' + it.subject_detail : ''}${it.pose ? ' [' + it.pose + ']' : ''} at ${it.spatial_placement}`).join('; ')}.`
    : '';
  const guideInstruction = items.length
    ? `Use the exported 3D reference PNG (visionpilot-3d-reference.png) strictly as the spatial layout, pose, scale and perspective guide: replace every colored 3D proxy shape with its real-world photorealistic counterpart (and if a real reference photo of a person or object is attached, transfer that exact real person's face, body, clothing or product design onto the matching 3D proxy position and pose) — ${items.map(it => it.instruction).join(' ')}`
    : 'Use the exported 3D reference PNG (visionpilot-3d-reference.png) as the spatial camera and composition guide.';
  const focusLine = focusTargets.length
    ? `Show only ${joinList(focusTargets)} as the primary focal point${focusTargets.length > 1 ? 's' : ''} centered in the middle of the composition and locked in tack-sharp focus, while other scene objects frame the composition around ${joinList(focusTargets)}.${fp3DTxt}`
    : (fp3DTxt ? fp3DTxt.trim() : '');
  return {
    master_prefix:masterPrefix,
    master_details:masterDetails,
    summary_text:masterDetails,
    guide_instruction:guideInstruction,
    focus_line:focusLine,
    focus_text:focusOnlyText,
    composition_text:focusTargets.length
      ? `${focusOnlyText} ${masterDetails}`.trim()
      : (masterDetails || null),
    selected_focus_subject:focusTargets.length ? {
      selected:true,
      count:focusTargets.length,
      show_only:`Show only ${joinList(focusTargets)}`,
      targets:focusTargets,
      rule:'Selected 3D Focus Subject(s) are placed in the middle/center of the composition as the primary focal point(s)'
    } : null,
    scene_3d:{
      reference_png:'visionpilot-3d-reference.png',
      focus_subjects:focusTargets,
      show_only:focusTargets.length ? `Show only ${joinList(focusTargets)}` : null,
      objects:items
    }
  };
};

// Export Image prompt: uses the 3D still-camera image prompt system (no video timeline, no time indicators, no camera movement animations)
hooks.buildFramePrompt = () => {
  apply(T);
  return AC.buildImagePrompt({still:true, use3d:true});
};

/* ---------- Video Mode Camera-Movement Presets (#pPresets) ---------- */
const CAM_PRESETS = [
  {id:'orbit', name:'Orbit', build:(d, b) => ({'cam.az':[{t:0, v:b.az - 45, e:'easeInOut'}, {t:d, v:b.az + 45, e:'easeInOut'}], 'cam.el':[{t:0, v:10, e:'easeInOut'}, {t:d, v:10, e:'easeInOut'}]})},
  {id:'dollyzoom', name:'Dolly Zoom', build:(d, b) => ({'cam.dist':[{t:0, v:3.4, e:'easeInOut'}, {t:d, v:1.2, e:'easeInOut'}], 'cam.focal':[{t:0, v:85, e:'easeInOut'}, {t:d, v:24, e:'easeInOut'}]})},
  {id:'pan', name:'Pan (left/right)', build:(d, b) => ({'cam.az':[{t:0, v:-35, e:'easeInOut'}, {t:d, v:35, e:'easeInOut'}], 'cam.el':[{t:0, v:0, e:'easeInOut'}, {t:d, v:0, e:'easeInOut'}]})},
  {id:'tilt', name:'Tilt (up/down)', build:(d, b) => ({'cam.el':[{t:0, v:-25, e:'easeInOut'}, {t:d, v:28, e:'easeInOut'}]})},
  {id:'pushin', name:'Push-in', build:(d, b) => ({'cam.dist':[{t:0, v:Math.max(2.6, b.dist * 1.35), e:'easeInOut'}, {t:d, v:Math.max(.7, b.dist * .48), e:'easeInOut'}]})},
  {id:'pullout', name:'Pull-out', build:(d, b) => ({'cam.dist':[{t:0, v:Math.max(.7, b.dist * .5), e:'easeInOut'}, {t:d, v:Math.max(3.2, b.dist * 1.45), e:'easeInOut'}]})},
  {id:'crane', name:'Crane/Jib', build:(d, b) => ({'cam.el':[{t:0, v:-22, e:'easeInOut'}, {t:d, v:38, e:'easeInOut'}], 'cam.dist':[{t:0, v:2.8, e:'easeInOut'}, {t:d, v:2.2, e:'easeInOut'}], 'cam.az':[{t:0, v:b.az - 18, e:'easeInOut'}, {t:d, v:b.az + 18, e:'easeInOut'}]})},
  {id:'tracking', name:'Tracking Shot', build:(d, b) => ({'cam.az':[{t:0, v:-55, e:'linear'}, {t:d, v:55, e:'linear'}], 'cam.dist':[{t:0, v:2.6, e:'smooth'}, {t:d / 2, v:2.0, e:'smooth'}, {t:d, v:2.6, e:'smooth'}]})},
  {id:'arc', name:'Arc Shot', build:(d, b) => ({'cam.az':[{t:0, v:b.az - 60, e:'easeInOut'}, {t:d, v:b.az + 60, e:'easeInOut'}], 'cam.el':[{t:0, v:6, e:'smooth'}, {t:d / 2, v:16, e:'smooth'}, {t:d, v:6, e:'smooth'}], 'cam.dist':[{t:0, v:2.4, e:'smooth'}, {t:d / 2, v:1.85, e:'smooth'}, {t:d, v:2.4, e:'smooth'}]})},
  {id:'lowreveal', name:'Low-Angle Reveal', build:(d, b) => ({'cam.el':[{t:0, v:-34, e:'easeOut'}, {t:d, v:-8, e:'easeOut'}], 'cam.dist':[{t:0, v:1.5, e:'easeOut'}, {t:d, v:2.3, e:'easeOut'}], 'cam.az':[{t:0, v:-20, e:'easeOut'}, {t:d, v:20, e:'easeOut'}]})},
  {id:'handheld', name:'Handheld Shake', build:(d, b) => {
    const n = Math.max(6, Math.round(d * 3)), az = [], el = [], rl = [], ds = [];
    for (let i = 0; i <= n; i++) {
      const t = rnd(d * i / n, 3), s = Math.sin(i * 2.1), c = Math.cos(i * 1.7);
      az.push({t, v:rnd(b.az + s * 3.2, 2), e:'smooth'});
      el.push({t, v:rnd(b.el + c * 2.4, 2), e:'smooth'});
      rl.push({t, v:rnd(Math.sin(i * 2.9) * 2.2, 2), e:'smooth'});
      ds.push({t, v:rnd(b.dist * (1 + s * .03), 3), e:'smooth'});
    }
    return {'cam.az':az, 'cam.el':el, 'cam.roll':rl, 'cam.dist':ds};
  }},
  {id:'spin360', name:'360 Subject Spin', build:(d, b) => ({'cam.az':[{t:0, v:b.az, e:'linear'}, {t:d, v:b.az + 360, e:'linear'}]})}
];
function presetAccountKey() {
  const email = (hooks.authInfo?.()?.email || '').trim().toLowerCase();
  return 'vp-presets:' + (email || 'account');
}
function loadUserPresets() {
  try { return JSON.parse(localStorage.getItem(presetAccountKey()) || '[]') || []; } catch (e) { return []; }
}
function saveUserPresets(list) {
  try { localStorage.setItem(presetAccountKey(), JSON.stringify(list)); } catch (e) {}
}
const minVidPresetGroups = new Set();
function renderPresets() {
  const box = $('presetList'); if (!box) return;
  const custom = loadUserPresets();
  const minDef = minVidPresetGroups.has('__moves');
  let html = `<div class="pgroup${minDef ? ' min' : ''}"><button type="button" class="psep-btn" data-pgrp="__moves" aria-expanded="${!minDef}"><span>Camera Movements</span><i class="psep-arr">${minDef ? '▸' : '▾'}</i></button><div class="pgrid">`
    + CAM_PRESETS.map(p => `<button type="button" class="pitem" data-preset="${p.id}" aria-pressed="${S.video.activePreset === p.id}">${esc(p.name)}</button>`).join('')
    + `</div></div>`;
  if (custom.length) {
    const minC = minVidPresetGroups.has('__custom');
    html += `<div class="pgroup${minC ? ' min' : ''}"><button type="button" class="psep-btn" data-pgrp="__custom" aria-expanded="${!minC}"><span>Saved to account</span><i class="psep-arr">${minC ? '▸' : '▾'}</i></button><div class="pgrid">`
      + custom.map(c => `<div class="pitem-wrap"><button type="button" class="pitem custom" data-preset="${escAttr(c.id)}" aria-pressed="${S.video.activePreset === c.id}">${esc(c.name)}</button><button type="button" class="pdel" data-pdel="${escAttr(c.id)}" title="Delete preset" aria-label="Delete ${escAttr(c.name)}">×</button></div>`).join('')
      + `</div></div>`;
  }
  box.innerHTML = html;
}
function applyPreset(id) {
  stop();
  const d = S.video.duration, base = {az:signed(S.az), el:S.el, dist:S.dist, focal:S.focal};
  const def = CAM_PRESETS.find(p => p.id === id);
  let newTracks = null, name = '';
  if (def) {
    newTracks = def.build(d, base); name = def.name;
  } else {
    const cust = loadUserPresets().find(c => c.id === id);
    if (!cust) return;
    name = cust.name; newTracks = {};
    Object.entries(cust.tracks || {}).forEach(([path, ks]) => {
      newTracks[path] = ks.map(k => ({...k, t:snap(clamp((k.u ?? (k.t / (cust.dur || d))) * d, 0, d))}));
    });
  }
  Object.keys(tracks()).forEach(k => { if (k.startsWith('cam.')) delete tracks()[k]; });
  Object.entries(newTracks).forEach(([path, ks]) => { tracks()[path] = ks.map(k => ({...k, t:rnd(clamp(k.t, 0, d), 4)})); });
  S.video.activePreset = id;
  setTime(0); buildTimeline(); renderPresets(); AC.save(); AC.changed();
  play();
  AC.toast(`Preset: ${name}`);
}
$('presetList')?.addEventListener('click', e => {
  const grpBtn = e.target.closest('[data-pgrp]');
  if (grpBtn) {
    const g = grpBtn.dataset.pgrp;
    if (minVidPresetGroups.has(g)) minVidPresetGroups.delete(g); else minVidPresetGroups.add(g);
    renderPresets(); return;
  }
  const del = e.target.closest('[data-pdel]');
  if (del) {
    const id = del.dataset.pdel;
    saveUserPresets(loadUserPresets().filter(c => c.id !== id));
    if (S.video.activePreset === id) S.video.activePreset = null;
    renderPresets(); AC.toast('Custom preset deleted'); return;
  }
  const b = e.target.closest('[data-preset]'); if (!b) return;
  applyPreset(b.dataset.preset);
});
$('presetSave')?.addEventListener('click', () => {
  const auth = hooks.authInfo?.() || {};
  if (AC.GATED && !auth.signedIn && !localStorage.getItem('vp-token')) {
    AC.toast('Sign in to save custom presets to your account');
    hooks.signIn?.(); return;
  }
  const name = ($('presetName')?.value || '').trim();
  if (!name) { AC.toast('Type a preset name first'); $('presetName')?.focus(); return; }
  if (!isVideo()) {
    const id = 'iu_' + Date.now().toString(36);
    const prompt = `${name}: camera angle ${Math.round(signed(S.az))}° azimuth, ${Math.round(S.el)}° elevation, ${Math.round(S.focal)}mm lens at f/${S.aperture}.`;
    const list = AC.loadUserImgPresets ? AC.loadUserImgPresets() : [];
    list.push({id, name, az:signed(S.az), el:S.el, roll:S.roll, dist:S.dist, focal:S.focal, aperture:S.aperture, dof:S.dof, prompt});
    AC.saveUserImgPresets?.(list);
    S.imgPresetId = id; S.imgPresetPrompt = prompt;
    $('presetName').value = '';
    AC.renderImgPresets?.(); AC.changed();
    AC.toast(`Saved "${name}" to your account`);
    return;
  }
  const d = S.video.duration || 5, norm = {};
  let count = 0;
  Object.entries(tracks()).forEach(([path, ks]) => {
    if (!ks?.length) return;
    norm[path] = ks.map(k => ({...k, u:rnd(k.t / d, 4)})); count += ks.length;
  });
  if (!count) {
    norm['cam.az'] = [{t:0, u:0, v:0, e:'easeInOut'}, {t:d, u:1, v:signed(S.az), e:'easeInOut'}];
    norm['cam.el'] = [{t:0, u:0, v:0, e:'easeInOut'}, {t:d, u:1, v:S.el, e:'easeInOut'}];
    norm['cam.dist'] = [{t:0, u:0, v:2.4, e:'easeInOut'}, {t:d, u:1, v:S.dist, e:'easeInOut'}];
  }
  const list = loadUserPresets(), id = 'u_' + Date.now().toString(36);
  list.push({id, name, dur:d, tracks:norm});
  saveUserPresets(list);
  S.video.activePreset = id; $('presetName').value = '';
  renderPresets(); AC.save();
  AC.toast(`Saved "${name}" to your account`);
});

/* ---------- Video Mode Animation Presets (#pAnimPresets: Car drive/drift/360, Person walk/jump/run, Cat & Animal locomotion) ---------- */
function ensureAnimTarget(preferredModel) {
  const model = preferredModel || 'person';
  if (!AC.refs.length) {
    V().objects = V().objects.filter(x => x.model === model || (!x.auto && !x._fromPreset));
  }
  let o = sel && sel !== 'camera' ? objById(sel) : null;
  if (o && (!preferredModel || o.model === preferredModel)) return o;
  o = V().objects.find(x => x.model === preferredModel);
  if (o) { selectObj(o.id, false); return o; }
  // no object of this kind yet: add a fresh one (never convert a backdrop / chair / other model the user placed on purpose)
  const n = V().objects.filter(x => x.model === model).length + 1;
  const created = newObject(model, `${MODELS[model].replace(/\s*\(.*\)/, '')} ${n}`, null, model === 'car' ? {placed:true, _fromPreset:true, color:'#e03131'} : {placed:true, _fromPreset:true});
  V().objects.push(created);
  selectObj(created.id, false);
  return created;
}

function sampleAnimCurve(o, d, knotsOrSteps, fn) {
  const out = {};
  const uList = Array.isArray(knotsOrSteps)
    ? knotsOrSteps
    : Array.from({length: knotsOrSteps + 1}, (_, i) => i / knotsOrSteps);
  const eps = 1e-4;
  const propsDef = [
    ['x', 4, 'ex'],
    ['y', 4, 'ey'],
    ['z', 4, 'ez'],
    ['ry', 2, 'ery'],
    ['rx', 2, 'erx'],
    ['rz', 2, 'erz']
  ];
  for (let i = 0; i < uList.length; i++) {
    const u = clamp(uList[i], 0, 1), t = rnd(d * u, 4);
    const pt = fn(u, t) || {};
    const uIn = Math.max(0, u - eps), uOut = Math.min(1, u + eps);
    const ptIn = u > 0 ? (fn(uIn, d * uIn) || {}) : pt;
    const ptOut = u < 1 ? (fn(uOut, d * uOut) || {}) : pt;
    const eDef = pt.e || 'smooth';
    for (const [prop, prec, eKey] of propsDef) {
      if (pt[prop] === undefined) continue;
      const e = pt[eKey] || eDef;
      const dtIn = Math.max(1e-7, (u - uIn) * d);
      const dtOut = Math.max(1e-7, (uOut - u) * d);
      let mIn = u > 0 && ptIn[prop] !== undefined ? (pt[prop] - ptIn[prop]) / dtIn : 0;
      let mOut = u < 1 && ptOut[prop] !== undefined ? (ptOut[prop] - pt[prop]) / dtOut : 0;
      if (u <= 0) mIn = mOut;
      if (u >= 1) mOut = mIn;
      const kPath = `obj.${o.id}.${prop}`;
      (out[kPath] || (out[kPath] = [])).push({
        t,
        v: rnd(pt[prop], prec),
        mIn: rnd(mIn, 4),
        mOut: rnd(mOut, 4),
        e
      });
    }
  }
  return out;
}
function parabolicArcY(u, u0, u1, hPeak, u2 = 0, hBounce = 0) {
  if (u > u0 && u < u1) {
    const w = (u - u0) / (u1 - u0);
    return 4 * hPeak * w * (1 - w);
  }
  if (hBounce > 0 && u >= u1 && u < u2) {
    const w = (u - u1) / (u2 - u1);
    return 4 * hBounce * w * (1 - w);
  }
  return 0;
}

const ANIM_PRESET_GROUPS = [
  {
    id:'__person_anim',
    title:'Person & Locomotion',
    items:[
      {id:'walk_fwd', name:'Person Walking', model:'person',
        prompt:'The person faces right (90°) and walks smoothly toward the right side of the frame with natural articulated arm and leg stride.',
        apply:(d, o) => {
          o.pose = 'walking_still'; o.ry = 90;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:-2.0, e:'linear'}, {t:d, v:2.0, e:'linear'}],
            [`obj.${o.id}.z`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.y`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:90, e:'linear'}, {t:d, v:90, e:'linear'}]
          };
        }},
      {id:'person_run', name:'Person Running', model:'person',
        prompt:'The person faces right (90°) and runs dynamically toward the right side of the frame with full athletic sprint stride and forward torso lean.',
        apply:(d, o) => {
          o.pose = 'running_still'; o.ry = 90;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:-2.8, e:'easeInOut'}, {t:d, v:2.8, e:'easeInOut'}],
            [`obj.${o.id}.z`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.y`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:90, e:'linear'}, {t:d, v:90, e:'linear'}]
          };
        }},
      {id:'walk_cam', name:'Walk Toward Camera', model:'person',
        prompt:'The person walks directly forward toward the camera at a steady, natural pace.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 0;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.z`]:[{t:0, v:-2.0, e:'linear'}, {t:d, v:1.8, e:'linear'}],
            [`obj.${o.id}.y`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}]
          };
        }},
      {id:'walk_jump', name:'Walk & Jump', model:'person',
        prompt:'The person walks forward, crouches in anticipation, leaps high into the air over an obstacle, and lands cleanly.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 0;
          return sampleAnimCurve(o, d, [0, .34, .51, .68, 1], u => ({
            x: 0,
            z: -2.0 + 4.0 * u,
            y: parabolicArcY(u, .34, .68, .88),
            ry: 0
          }));
        }},
      {id:'jump_place', name:'Jump in Place', model:'person',
        prompt:'The person crouches in anticipation and jumps straight up in place, landing smoothly on the ground.',
        apply:(d, o) => {
          o.pose = 'standing';
          return sampleAnimCurve(o, d, [0, .24, .48, .72, 1], u => ({
            x: o.x || 0,
            z: o.z || 0,
            y: parabolicArcY(u, .24, .72, .95)
          }));
        }},
      {id:'spin_jump', name:'360 Spin Jump', model:'person',
        prompt:'The person jumps straight up in place and does NOT spin or rotate their body (person stays facing 0° forward); instead, the camera orbits a full 360° circle around the jumping person in one continuous bullet-time arc.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 0; o.x = 0; o.z = 0;
          const baseAz = signed(S.az);
          const tr = sampleAnimCurve(o, d, [0, .20, .49, .78, 1], u => ({
            x: 0,
            z: 0,
            y: parabolicArcY(u, .20, .78, .95),
            ry: 0
          }));
          tr['cam.az'] = [{t:0, v:baseAz, e:'easeInOut'}, {t:d, v:baseAz + 360, e:'easeInOut'}];
          return tr;
        }},
      {id:'walk_turn_wave', name:'Walk, Stop & Wave', model:'person',
        prompt:'The person walks forward to center frame, stops facing the camera, and waves warmly.',
        apply:(d, o) => {
          o.pose = 'waving';
          return sampleAnimCurve(o, d, [0, .28, .55, .6625, .775, .8875, 1], u => {
            const wWalk = clamp(u / .55, 0, 1);
            const zEase = 1 - Math.pow(1 - wWalk, 2.4);
            const wavePhase = u > .55 ? Math.sin(((u - .55) / .45) * Math.PI * 2) * 12 : 0;
            return {
              x: 0,
              z: -1.8 * (1 - zEase),
              y: 0,
              ry: wavePhase
            };
          });
        }},
      {id:'sprint_slide', name:'Sprint & Slide Stop', model:'person',
        prompt:'The person sprints across the scene from left to right and brakes into an athletic low slide-stop at center.',
        apply:(d, o) => {
          o.pose = 'running_still'; o.ry = 90;
          return sampleAnimCurve(o, d, [0, .24, .48, .63, .78, .86, 1], u => {
            const decel = 1 - Math.pow(1 - clamp(u / .78, 0, 1), 2.8);
            const turnW = clamp((u - .48) / .38, 0, 1);
            const turnS = turnW * turnW * (3 - 2 * turnW);
            return {
              x: -3.0 + 3.5 * decel,
              z: 0,
              y: 0,
              ry: 90 - 65 * turnS
            };
          });
        }},
      {id:'hero_landing', name:'Hero Leap & Land', model:'person',
        prompt:'The person leaps forward from elevated height and lands in a dramatic crouched hero landing at center stage.',
        apply:(d, o) => {
          o.pose = 'crouch_prep'; o.ry = 0;
          return sampleAnimCurve(o, d, [0, .28, .56, 1], u => {
            const w = clamp(u / .56, 0, 1);
            const zEase = 1 - Math.pow(1 - w, 2.2);
            const yFall = u < .56 ? 1.35 * (1 - w * w) : 0;
            return {
              x: 0,
              z: -2.2 * (1 - zEase),
              y: yFall,
              ry: 0
            };
          });
        }}
    ]
  },
  {
    id:'__car_anim',
    title:'Vehicles (Drive & Drift)',
    items:[
      {id:'car_drive', name:'Car Driving', model:'car',
        prompt:'The car drives smoothly forward through the scene with spinning wheels and natural suspension poise.',
        apply:(d, o) => sampleAnimCurve(o, d, 6, u => {
          const s = .15 * u + .85 * (u * u * (3 - 2 * u));
          return {x:0, z:-4.2 + 8.4 * s, y:0, ry:0};
        })},
      {id:'car_drift', name:'Car Drift', model:'car',
        prompt:'The car enters the corner at high speed, initiates an aggressive tail-out oversteer drift through the apex with counter-steered front wheels and tire smoke, and powers cleanly out of the corner.',
        apply:(d, o) => {
          // Smooth C-infinity cubic Bezier corner path + analytical tangent + smooth oversteer slip angle
          const P0 = [-3.5, -1.85], P1 = [-1.35, 1.45], P2 = [1.15, 1.38], P3 = [3.55, -.22];
          const bez = (s) => {
            const m = 1 - s, m2 = m * m, m3 = m2 * m, s2 = s * s, s3 = s2 * s;
            const x = m3 * P0[0] + 3 * m2 * s * P1[0] + 3 * m * s2 * P2[0] + s3 * P3[0];
            const z = m3 * P0[1] + 3 * m2 * s * P1[1] + 3 * m * s2 * P2[1] + s3 * P3[1];
            const dx = 3 * m2 * (P1[0] - P0[0]) + 6 * m * s * (P2[0] - P1[0]) + 3 * s2 * (P3[0] - P2[0]);
            const dz = 3 * m2 * (P1[1] - P0[1]) + 6 * m * s * (P2[1] - P1[1]) + 3 * s2 * (P3[1] - P2[1]);
            return {x, z, dx, dz};
          };
          return sampleAnimCurve(o, d, 8, u => {
            const s = clamp(u + .06 * Math.sin(Math.PI * u), 0, 1);
            const {x, z, dx, dz} = bez(s);
            const tanDeg = Math.atan2(dx, dz) * 180 / Math.PI;
            // Smooth oversteer slip angle peaking at 44 deg through the apex so the tail swings wide and nose points into the apex
            const slip = 44 * Math.pow(Math.sin(Math.PI * Math.pow(s, .88)), 1.35);
            return {x, z, y:0, ry:tanDeg + slip};
          });
        }},
      {id:'car_drift_360', name:'Car Drift 360', model:'car',
        prompt:'The car performs a full 360-degree circular donut drift around the center of the scene with continuous rear-wheel oversteer slip angle, counter-steered front wheels, and billowing tire smoke.',
        apply:(d, o) => {
          const R = 2.15;
          return sampleAnimCurve(o, d, 8, u => {
            const ang = u * Math.PI * 2;
            const x = Math.sin(ang) * R;
            const z = -Math.cos(ang) * R;
            // Tangent heading (90 - 360*u) minus 44° inward donut oversteer slip angle so the nose points inside the circle continuously
            const ry = 90 - u * 360 - 44;
            return {x, z, y:0, ry, ery:'linear'};
          });
        }},
      {id:'car_fig8', name:'Figure-8 Drift', model:'car',
        prompt:'The car links a left-hand drift seamlessly into a right-hand transition drift along an S-curve figure-8 path.',
        apply:(d, o) => sampleAnimCurve(o, d, 8, u => {
          const x = -3.5 + 7.0 * u;
          const z = 1.35 * Math.sin(u * Math.PI * 2);
          const dx = 7.0;
          const dz = 1.35 * Math.PI * 2 * Math.cos(u * Math.PI * 2);
          const tanDeg = Math.atan2(dx, dz) * 180 / Math.PI;
          // Smooth Scandinavian-flick oversteer transition from +40° right-hand drift into -40° left-hand drift
          const slip = 40 * Math.sin(u * Math.PI * 2);
          return {x, z, y:0, ry:tanDeg + slip};
        })},
      {id:'car_pass', name:'High-Speed Pass', model:'car',
        prompt:'The car rockets across the frame from left to right in a high-speed flyby.',
        apply:(d, o) => sampleAnimCurve(o, d, 4, u => {
          const s = .25 * u + .75 * (u * u * (3 - 2 * u));
          return {x:-5.5 + 11.0 * s, z:.4, y:0, ry:90};
        })},
      {id:'car_pullup', name:'Pull-Up & Stop', model:'car',
        prompt:'The car drives up from the background and brakes smoothly to a angled hero stop in the foreground.',
        apply:(d, o) => sampleAnimCurve(o, d, [0, .25, .515, .74, .78, 1], u => {
          const w = clamp(u / .74, 0, 1);
          const decel = 1 - Math.pow(1 - w, 3);
          const turnClamp = w * w * (3 - 2 * w);
          // Subtle nose brake-dive as the car decelerates to a halt, then settles level
          const dive = u < .78 ? 3.2 * Math.sin(clamp((u - .25) / .53, 0, 1) * Math.PI) : 0;
          return {
            x: .22 * turnClamp,
            z: -4.5 * (1 - decel),
            y: 0,
            ry: -20 * turnClamp,
            rx: dive
          };
        })},
      {id:'car_jturn', name:'J-Turn Spin', model:'car',
        prompt:'The car reverses rapidly, whips the nose 180 degrees in a stunt J-turn spin, and accelerates forward.',
        apply:(d, o) => sampleAnimCurve(o, d, [0, .14, .28, .45, .52, .62, .65, .78, 1], u => {
          // Smooth continuous +X momentum while whipping nose 180° from reverse (-90°) to forward (+90°)
          const x = -2.8 + 6.0 * (.22 * u + .78 * (u * u * (3 - 2 * u)));
          const whipW = clamp((u - .28) / .34, 0, 1);
          const whipS = whipW * whipW * (3 - 2 * whipW);
          const z = .38 * Math.sin(whipW * Math.PI);
          const ry = -90 + 180 * whipS + (u > .52 && u < .78 ? 8 * Math.sin(((u - .52) / .26) * Math.PI) : 0);
          return {x, z, y:0, ry};
        })},
      {id:'car_jump', name:'Car Jump', model:'car',
        prompt:'The car drives toward the right, hits a ramp and launches into the air with its nose raised and suspension hanging loose, soars across the frame, then lands on all four wheels with a suspension bounce and keeps driving.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 90;
          return sampleAnimCurve(o, d, [0, .32, .34, .49, .64, .66, .70, .76, .78, 1], u => {
            const x = -4.2 + 8.8 * u;
            const y = parabolicArcY(u, .34, .64, .95, .76, .09);
            let rx = 0;
            if (u >= .32 && u <= .66) {
              const w = (u - .32) / .34;
              rx = -17 * Math.sin(w * Math.PI) * (1 - .75 * w) + 9 * Math.pow(w, 2.2) * Math.sin(w * Math.PI);
            } else if (u > .66 && u < .78) {
              const w = (u - .66) / .12;
              rx = 4 * Math.sin(w * Math.PI);
            }
            return {x, z:0, y, ry:90, rx};
          });
        }},
      {id:'car_hop', name:'Car Hop (Bounce)', model:'car',
        prompt:'The car bounces on its suspension and hops straight up twice in place, landing level each time.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 35;
          return sampleAnimCurve(o, d, [0, .14, .28, .42, .44, .59, .74, 1], u => {
            const y1 = parabolicArcY(u, .14, .42, .56);
            const y2 = parabolicArcY(u, .44, .74, .76);
            const y = y1 + y2;
            const rx = y1 > 0 ? -6.5 * Math.sin(((u - .14) / .28) * Math.PI)
                     : y2 > 0 ? -9.0 * Math.sin(((u - .44) / .30) * Math.PI) : 0;
            return {x:0, z:0, y, ry:35, rx};
          });
        }}
    ]
  },
  {
    id:'__cat_anim',
    title:'Cat & Animals',
    items:[
      {id:'cat_walk', name:'Cat Walking', model:'cat',
        prompt:'The cat faces right and walks gracefully toward the right with a smooth 4-beat feline prowl and swaying tail.',
        apply:(d, o) => {
          o.pose = 'walking_still'; o.ry = 90;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:-1.6, e:'linear'}, {t:d, v:1.6, e:'linear'}],
            [`obj.${o.id}.z`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:90, e:'linear'}, {t:d, v:90, e:'linear'}]
          };
        }},
      {id:'cat_run', name:'Cat Running', model:'cat',
        prompt:'The cat faces right and bounds rapidly across the frame in an agile feline sprint.',
        apply:(d, o) => {
          o.pose = 'running_still'; o.ry = 90;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:-2.4, e:'easeInOut'}, {t:d, v:2.4, e:'easeInOut'}],
            [`obj.${o.id}.z`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:90, e:'linear'}, {t:d, v:90, e:'linear'}]
          };
        }},
      {id:'cat_pounce', name:'Cat Crouch & Pounce', model:'cat',
        prompt:'The cat crouches low in a hunting stance and springs forward in an agile mid-air pounce.',
        apply:(d, o) => {
          o.pose = 'pouncing'; o.ry = 0;
          return sampleAnimCurve(o, d, [0, .30, .32, .51, .70, .72, 1], u => {
            const w = clamp((u - .30) / .42, 0, 1);
            const s = w * w * (3 - 2 * w);
            return {
              x: 0,
              z: -1.2 + 2.3 * s,
              y: parabolicArcY(u, .32, .70, .58),
              ry: 0
            };
          });
        }},
      {id:'cat_jump', name:'Cat Jump', model:'cat',
        prompt:'The cat strolls forward, crouches low, springs up in an agile leap with front paws reaching and tail streaming behind, lands softly and walks on.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 90;
          return sampleAnimCurve(o, d, [0, .34, .50, .66, 1], u => ({
            x: -2.0 + 4.0 * u,
            z: 0,
            y: parabolicArcY(u, .34, .66, .85),
            ry: 90
          }));
        }},
      {id:'animal_walk', name:'Animal Walking', model:'animal',
        prompt:'The dog faces right and trots happily toward the right with articulated legs and wagging tail.',
        apply:(d, o) => {
          o.pose = 'walking_still'; o.ry = 90;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:-1.8, e:'linear'}, {t:d, v:1.8, e:'linear'}],
            [`obj.${o.id}.z`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:90, e:'linear'}, {t:d, v:90, e:'linear'}]
          };
        }},
      {id:'animal_run', name:'Animal Running', model:'animal',
        prompt:'The dog faces right and gallops energetically across the scene from left to right.',
        apply:(d, o) => {
          o.pose = 'running_still'; o.ry = 90;
          return {
            [`obj.${o.id}.x`]:[{t:0, v:-2.6, e:'easeInOut'}, {t:d, v:2.6, e:'easeInOut'}],
            [`obj.${o.id}.z`]:[{t:0, v:0, e:'linear'}, {t:d, v:0, e:'linear'}],
            [`obj.${o.id}.ry`]:[{t:0, v:90, e:'linear'}, {t:d, v:90, e:'linear'}]
          };
        }},
      {id:'animal_leap', name:'Animal Playful Leap', model:'animal',
        prompt:'The dog drops into a playful bow and leaps joyfully forward through the air.',
        apply:(d, o) => {
          o.pose = 'stretching'; o.ry = 90;
          return sampleAnimCurve(o, d, [0, .28, .30, .51, .72, .74, 1], u => {
            const w = clamp((u - .28) / .46, 0, 1);
            const s = w * w * (3 - 2 * w);
            return {
              x: -1.4 + 2.6 * s,
              z: 0,
              y: parabolicArcY(u, .30, .72, .70),
              ry: 90
            };
          });
        }},
      {id:'animal_jump', name:'Dog Jump (Forward)', model:'animal',
        prompt:'The dog trots forward, crouches, leaps over a gap with front legs reaching and tail streaming behind, lands and trots on.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 90;
          return sampleAnimCurve(o, d, [0, .34, .50, .66, 1], u => ({
            x: -2.4 + 4.8 * u,
            z: 0,
            y: parabolicArcY(u, .34, .66, .82),
            ry: 90
          }));
        }},
      {id:'animal_jump_place', name:'Dog Jump in Place', model:'animal',
        prompt:'The dog crouches and jumps straight up in place with excitement, tail wagging, and lands softly.',
        apply:(d, o) => {
          o.pose = 'standing'; o.ry = 35;
          return sampleAnimCurve(o, d, [0, .18, .32, .46, .50, .64, .78, 1], u => ({
            x: 0,
            z: 0,
            y: parabolicArcY(u, .18, .46, .70) + parabolicArcY(u, .50, .78, .72),
            ry: 35
          }));
        }}
    ]
  }
];

function animPresetAccountKey() {
  const email = (hooks.authInfo?.()?.email || '').trim().toLowerCase();
  return 'vp-anim-presets:' + (email || 'account');
}
function loadUserAnimPresets() {
  try { return JSON.parse(localStorage.getItem(animPresetAccountKey()) || '[]') || []; } catch (e) { return []; }
}
function saveUserAnimPresets(list) {
  try { localStorage.setItem(animPresetAccountKey(), JSON.stringify(list)); } catch (e) {}
}
const minAnimPresetGroups = new Set();
function renderAnimPresets() {
  const box = $('animPresetList'); if (!box) return;
  let html = ANIM_PRESET_GROUPS.map(grp => {
    const min = minAnimPresetGroups.has(grp.id);
    return `<div class="pgroup${min ? ' min' : ''}"><button type="button" class="psep-btn" data-apgrp="${grp.id}" aria-expanded="${!min}"><span>${esc(grp.title)}</span><i class="psep-arr">${min ? '▸' : '▾'}</i></button><div class="pgrid">`
      + grp.items.map(it => `<button type="button" class="pitem" data-apreset="${it.id}" aria-pressed="${S.video.activeAnimPreset === it.id}" title="${escAttr(it.prompt || it.name)}">${esc(it.name)}</button>`).join('')
      + `</div></div>`;
  }).join('');
  const custom = loadUserAnimPresets();
  if (custom.length) {
    const minC = minAnimPresetGroups.has('__custom_anim');
    html += `<div class="pgroup${minC ? ' min' : ''}"><button type="button" class="psep-btn" data-apgrp="__custom_anim" aria-expanded="${!minC}"><span>Saved to account</span><i class="psep-arr">${minC ? '▸' : '▾'}</i></button><div class="pgrid">`
      + custom.map(c => `<div class="pitem-wrap"><button type="button" class="pitem custom" data-apreset="${escAttr(c.id)}" aria-pressed="${S.video.activeAnimPreset === c.id}">${esc(c.name)}</button><button type="button" class="pdel" data-apdel="${escAttr(c.id)}" title="Delete preset">×</button></div>`).join('')
      + `</div></div>`;
  }
  box.innerHTML = html;
}
function applyAnimPreset(id) {
  if (!isVideo()) return;
  stop();
  const d = S.video.duration || 5;
  let found = null;
  for (const g of ANIM_PRESET_GROUPS) {
    const it = g.items.find(x => x.id === id);
    if (it) { found = it; break; }
  }
  if (found) {
    const o = ensureAnimTarget(found.model);
    o.rx = 0; o.rz = 0; o.y = 0; o._poseLift = false;
    if (found.model === 'car') {
      if (S.dist < 8.2) AC.setDist(8.8);
      if (S.el < 20) AC.setEl(24);
    } else if (S.dist < 4.2 && /walk|run|leap|pounce|jump/.test(id)) {
      AC.setDist(4.6);
    }
    const newTracks = found.apply(d, o);
    const touchesCam = Object.keys(newTracks).some(k => k.startsWith('cam.'));
    // camera tracks created by a previous animation preset (e.g. the 360 orbit) are removed; camera keys the user made themselves stay
    const oldCam = new Set(S.video.animCamPaths || []);
    Object.keys(tracks()).forEach(k => {
      if (k.startsWith(`obj.${o.id}.`)) delete tracks()[k];
      if ((touchesCam && k.startsWith('cam.')) || oldCam.has(k)) delete tracks()[k];
    });
    S.video.animCamPaths = Object.keys(newTracks).filter(k => k.startsWith('cam.'));
    Object.entries(newTracks).forEach(([path, ks]) => { tracks()[path] = ks.map(k => ({...k, t:rnd(clamp(k.t, 0, d), 4)})); });
    S.video.activeAnimPreset = id;
    objPropsKey = ''; vfOptsKey = '';
    setTime(0); renderObjects(); buildTimeline(); renderAnimPresets(); AC.save(); AC.changed();
    play();
    AC.toast(`Animation: ${found.name} (${o.label})`);
    return;
  }
  const cust = loadUserAnimPresets().find(c => c.id === id);
  if (!cust) return;
  const o = ensureAnimTarget(cust.model || null);
  Object.keys(tracks()).forEach(k => { if (k.startsWith(`obj.${o.id}.`)) delete tracks()[k]; });
  Object.entries(cust.tracks || {}).forEach(([propName, ks]) => {
    tracks()[`obj.${o.id}.${propName}`] = ks.map(k => ({...k, t:snap(clamp((k.u ?? (k.t / (cust.dur || d))) * d, 0, d))}));
  });
  S.video.activeAnimPreset = id;
  objPropsKey = ''; vfOptsKey = '';
  setTime(0); renderObjects(); buildTimeline(); renderAnimPresets(); AC.save(); AC.changed();
  play();
  AC.toast(`Animation: ${cust.name}`);
}
$('animPresetList')?.addEventListener('click', e => {
  const grpBtn = e.target.closest('[data-apgrp]');
  if (grpBtn) {
    const g = grpBtn.dataset.apgrp;
    if (minAnimPresetGroups.has(g)) minAnimPresetGroups.delete(g); else minAnimPresetGroups.add(g);
    renderAnimPresets(); return;
  }
  const del = e.target.closest('[data-apdel]');
  if (del) {
    const id = del.dataset.apdel;
    saveUserAnimPresets(loadUserAnimPresets().filter(c => c.id !== id));
    if (S.video.activeAnimPreset === id) S.video.activeAnimPreset = null;
    renderAnimPresets(); AC.toast('Custom animation preset deleted'); return;
  }
  const b = e.target.closest('[data-apreset]'); if (!b) return;
  applyAnimPreset(b.dataset.apreset);
});
$('animPresetSave')?.addEventListener('click', () => {
  const name = ($('animPresetName')?.value || '').trim();
  if (!name) { AC.toast('Type an animation preset name first'); $('animPresetName')?.focus(); return; }
  const o = (sel && sel !== 'camera' ? objById(sel) : null) || V().objects[0];
  if (!o) { AC.toast('Add an object first'); return; }
  const d = S.video.duration || 5, norm = {};
  let count = 0;
  ['x', 'y', 'z', 'ry', 'h', 'w', 'sx', 'sy', 'sz'].forEach(propName => {
    const ks = tracks()[`obj.${o.id}.${propName}`];
    if (ks?.length) { norm[propName] = ks.map(k => ({...k, u:rnd(k.t / d, 4)})); count += ks.length; }
  });
  if (!count) {
    norm.z = [{t:0, u:0, v:-1.5, e:'linear'}, {t:d, u:1, v:1.5, e:'linear'}];
  }
  const list = loadUserAnimPresets(), id = 'au_' + Date.now().toString(36);
  list.push({id, name, dur:d, model:o.model, tracks:norm});
  saveUserAnimPresets(list);
  S.video.activeAnimPreset = id; $('animPresetName').value = '';
  renderAnimPresets(); AC.save();
  AC.toast(`Saved "${name}" to Animation presets`);
});

/* ---------- boot ---------- */
// small read-only inspection hook (used by the automated viewport tests)
AC.vpTest = {R:() => R, setTime:t => setTime(t), time:() => T, objs:() => V().objects, stop:() => stop(), renderVP:sz => renderVP(sz), pathDist:(o, t) => pathDist(o, t), applyPreset:id => applyAnimPreset(id), preciseMinY, detect3DFocusPartAt, sampleFocusPartTimeline, focusMarkerAt, setFocusMarkerWorld};
renderPresets();
renderAnimPresets();
updateTimeUI();
if (S.app === 'video' && S.video.ready) go();
})();
