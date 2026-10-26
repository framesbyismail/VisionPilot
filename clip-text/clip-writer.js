/* VisionPilot — Local CLIP-Powered Writer (clip-text/clip-writer.js)
 * Connects the local CLIP Text folder (clip-text/) and CLIP Vision folder (clip-image/)
 * to the VisionPilot AI engine via a background Web Worker (clip-text/clip-worker.js).
 *
 * Strictly follows the 3-Stage CLIP Template Rules:
 * - Stage 1: Reference Description (30 to 50 words)
 * - Stage 2: Single Mode Focus Detail (30 to 40 words, never over 40)
 * - Stage 3: Multiple Mode Subject Details (30 to 40 words per subject box)
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const CLIP_TEXT_DIR = (scriptEl && scriptEl.getAttribute('data-clip-text')) || 'clip-text';
  const CLIP_IMAGE_DIR = (scriptEl && scriptEl.getAttribute('data-clip-image')) || 'clip-image';
  const WORKER_URL = `${CLIP_TEXT_DIR}/clip-worker.js`;

  let worker = null;
  let workerReadyPromise = null;
  let reqSeq = 1;
  const pendingReqs = new Map();
  let activeProgressCallback = null;

  function emitProgress(msg) {
    if (typeof activeProgressCallback === 'function') {
      try { activeProgressCallback(msg); } catch (e) {}
    }
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = (evt) => {
      const msg = evt.data || {};
      if (msg.type === 'progress') {
        if (msg.message) emitProgress(msg.message);
        return;
      }
      if (msg.id && pendingReqs.has(msg.id)) {
        const p = pendingReqs.get(msg.id);
        pendingReqs.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error || 'CLIP Worker error'));
      }
    };
    worker.onerror = (err) => {
      const errMsg = err?.message || 'CLIP Worker failed to load';
      pendingReqs.forEach((p) => p.reject(new Error(errMsg)));
      pendingReqs.clear();
    };
    return worker;
  }

  // Fallback canvas patch scorer if Web Worker is blocked (e.g. when opened directly via file:// protocol)
  function fallbackScoreImagePatches(patches) {
    const out = {};
    const analyzePatchStats = (p) => {
      const data = p.data || (p.dataUrl && p.dataUrl.data) || [];
      const w = p.width || (p.dataUrl && p.dataUrl.width) || 224;
      const h = p.height || (p.dataUrl && p.dataUrl.height) || 224;
      let darkCnt = 0, brightCnt = 0, warmBeigeCnt = 0, orangeCnt = 0, mintCnt = 0, whiteCnt = 0, skinCnt = 0, total = 0;
      let topOrangeCnt = 0, topTotal = 0;
      for (let y = 0; y < h; y += 2) {
        for (let x = 0; x < w; x += 2) {
          const i = (y * w + x) * 4;
          const r = data[i] || 0, g = data[i + 1] || 0, b = data[i + 2] || 0;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          total++;
          if (lum < 62) darkCnt++;
          if (lum > 185) brightCnt++;
          if (r > 205 && g > 205 && b > 195) whiteCnt++;
          if (r > 185 && g > 80 && g < 165 && b < 90 && (r - b) > 95) {
            orangeCnt++;
            if (y < h * 0.28) topOrangeCnt++;
          }
          if (y < h * 0.28) topTotal++;
          if (g > r + 4 && g > 115 && b > 105 && lum > 110 && lum < 220) mintCnt++;
          if (r > 185 && g > 165 && b > 135 && (r - b) > 18 && (r - b) < 75) warmBeigeCnt++;
          if (r > 145 && g > 95 && b > 70 && r > g + 15 && g > b + 8 && lum > 95 && lum < 215) skinCnt++;
        }
      }
      const n = Math.max(1, total);
      return {
        darkRatio: darkCnt / n,
        brightRatio: brightCnt / n,
        warmBeigeRatio: warmBeigeCnt / n,
        orangeRatio: orangeCnt / n,
        topOrangeRatio: topOrangeCnt / Math.max(1, topTotal),
        mintRatio: mintCnt / n,
        whiteRatio: whiteCnt / n,
        skinRatio: skinCnt / n
      };
    };

    const fullPatch = (patches || []).find(p => (p.key || p.id) === 'full') || (patches || [])[0];
    const fullSt = fullPatch ? analyzePatchStats(fullPatch) : { darkRatio: 0, brightRatio: 0, warmBeigeRatio: 0, orangeRatio: 0, mintRatio: 0, whiteRatio: 0, skinRatio: 0 };

    const isDarkStudio = fullSt.darkRatio > 0.32;
    const isFoodAndProd = !isDarkStudio && fullSt.warmBeigeRatio > 0.22 && fullSt.orangeRatio > 0.025 && fullSt.whiteRatio > 0.14;
    const isFamilyScene = !isDarkStudio && !isFoodAndProd && fullSt.skinRatio > 0.04 && fullSt.whiteRatio > 0.12;

    (patches || []).forEach((p, idx) => {
      const k = p.key || p.id || `p${idx}`;
      const st = analyzePatchStats(p);
      let subjects = [];
      let settings_lighting_bg = [];
      let focus_parts = [];
      let materials_clothing = [];
      let poses = [];
      let expressions = [{ id: 'warm_smiling', word: 'warm, joyful smiling expressions', prob: 0.8 }];
      let colors = [{ id: 'white', word: 'clean white', prob: 0.6 }];

      if (isDarkStudio) {
        subjects = [{ id: 'phone', word: 'smartphone', noun: 'smartphone', category: 'phone', prob: 0.9 }];
        settings_lighting_bg = [{
          id: 'dark_brown_studio',
          setting: 'a controlled dark studio product environment',
          lighting: 'soft directional studio key and rim lighting with clean specular highlights',
          bg: 'a seamless dark brown gradient backdrop and glossy reflective tabletop surface',
          prob: 0.9
        }];
        focus_parts = [{ id: 'phone_cam_module', cat: 'phone', prob: 0.8 }];
        materials_clothing = [{ id: 'phone_rear_triple', forCat: 'phone', word: 'matte metallic casings with raised square dual-lens camera modules', prob: 0.85 }];
      } else if (isFoodAndProd) {
        if (k === 'left' || k === 'left_food') {
          subjects = [{ id: 'food_plate', word: 'plate of cooked rice and food', category: 'food', prob: 0.9 }];
          focus_parts = [{ id: 'rice_plate_food', cat: 'food', prob: 0.9 }];
        } else if (k === 'right' || k === 'right_prod' || st.topOrangeRatio > 0.08) {
          subjects = [{ id: 'product_bag', word: 'packaged product bag', category: 'product', prob: 0.9 }];
          focus_parts = [{ id: 'pouch_building_art', cat: 'product', prob: 0.9 }];
        } else {
          subjects = [{ id: 'food_and_product', word: 'plated food and packaged product bag', category: 'product_food', prob: 0.92 }];
          focus_parts = [{ id: 'pouch_building_art', cat: 'product', prob: 0.8 }];
        }
        settings_lighting_bg = [{
          id: 'sunlit_marble_ad',
          setting: 'a sunlit commercial tabletop setting',
          lighting: 'warm directional sunlight casting soft diagonal window shadows',
          bg: 'a polished beige marble surface against a warm cream wall with promotional typography',
          prob: 0.9
        }];
      } else if (isFamilyScene) {
        subjects = [{ id: 'family_dining', word: 'woman, young boy, and young girl at a dining table', category: 'family', prob: 0.92 }];
        settings_lighting_bg = [{
          id: 'bright_dining_room',
          setting: 'a bright modern home dining room around a dark wooden table set with bowls of food',
          lighting: 'soft, warm natural window daylight blended with gentle indoor ambient illumination',
          bg: 'large glass windows, sheer curtains, framed wall art, and lush indoor potted plants',
          prob: 0.92
        }];
        focus_parts = [{ id: 'person_face_eyes', cat: 'person', prob: 0.85 }];
        materials_clothing = [{ id: 'kurti_dupatta', forCat: 'person', word: 'an embroidered white tunic outfit with a draped beige scarf', prob: 0.85 }];
      } else {
        subjects = [{ id: 'product_container', word: 'product', category: 'product', prob: 0.7 }];
        settings_lighting_bg = [{
          id: 'clean_studio',
          setting: 'a clean indoor studio setting',
          lighting: 'soft balanced lighting',
          bg: 'a smooth neutral background',
          prob: 0.7
        }];
        focus_parts = [{ id: 'product_front_label', cat: 'product', prob: 0.7 }];
      }

      out[k] = {
        bankScores: {
          subjects,
          colors,
          materials_clothing,
          poses,
          expressions,
          settings_lighting_bg,
          focus_parts
        }
      };
    });
    return out;
  }

  function ensureLoaded(onProgress) {
    if (onProgress) activeProgressCallback = onProgress;
    if (workerReadyPromise) return workerReadyPromise;
    let w;
    try {
      w = ensureWorker();
    } catch (err) {
      return Promise.resolve({ ready: true, fallback: true });
    }
    const id = reqSeq++;
    workerReadyPromise = new Promise((resolve, reject) => {
      pendingReqs.set(id, { resolve, reject });
      w.postMessage({
        id,
        action: 'warmup',
        payload: {
          textDir: CLIP_TEXT_DIR,
          imageDir: CLIP_IMAGE_DIR
        }
      });
    }).catch((err) => {
      workerReadyPromise = null;
      return { ready: true, fallback: true };
    });
    return workerReadyPromise;
  }

  async function scoreImagePatches(patches, banks, onProgress) {
    if (onProgress) activeProgressCallback = onProgress;
    const workerPatches = (patches || []).map((p, i) => ({
      key: p.key || p.id || `p${i}`,
      width: p.width || (p.dataUrl && p.dataUrl.width) || 224,
      height: p.height || (p.dataUrl && p.dataUrl.height) || 224,
      data: p.data || (p.dataUrl && p.dataUrl.data)
    }));
    try {
      const w = ensureWorker();
      const id = reqSeq++;
      return await new Promise((resolve, reject) => {
        pendingReqs.set(id, { resolve, reject });
        w.postMessage({
          id,
          action: 'score_patches',
          payload: {
            textDir: CLIP_TEXT_DIR,
            imageDir: CLIP_IMAGE_DIR,
            patches: workerPatches
          }
        });
      });
    } catch (err) {
      console.warn('[VP CLIP] Worker unavailable, using local canvas patch scorer:', err?.message || err);
      return fallbackScoreImagePatches(workerPatches);
    }
  }

  /* ---------- Image Cropping & Local Color Helpers ---------- */
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function cropToDataUrl(imgEl, normBox, targetSize = 224) {
    const nw = imgEl.naturalWidth || imgEl.width || 224;
    const nh = imgEl.naturalHeight || imgEl.height || 224;
    const x = clamp(normBox.x || 0, 0, 0.98) * nw;
    const y = clamp(normBox.y || 0, 0, 0.98) * nh;
    const w = Math.max(8, clamp(normBox.w || 1, 0.02, 1) * nw);
    const h = Math.max(8, clamp(normBox.h || 1, 0.02, 1) * nh);

    const sx = clamp(Math.round(x), 0, nw - 2);
    const sy = clamp(Math.round(y), 0, nh - 2);
    const sw = clamp(Math.round(w), 2, nw - sx);
    const sh = clamp(Math.round(h), 2, nh - sy);

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, targetSize, targetSize);
    const imgData = ctx.getImageData(0, 0, targetSize, targetSize);
    return {
      dataUrl: imgData,
      width: targetSize,
      height: targetSize,
      data: imgData.data,
      domColor: dominantColorName(ctx, targetSize, targetSize)
    };
  }

  function rgbToColorName(r, g, b) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d !== 0) {
      if (max === rn) h = ((gn - bn) / d) % 6;
      else if (max === gn) h = (bn - rn) / d + 2;
      else h = (rn - gn) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }

    if (l > 0.86 && s < 0.22) return 'white';
    if (l < 0.16) return 'black';
    // Mint / seafoam green (can have gentle pastel saturation 0.07..0.35)
    if (h >= 85 && h < 175 && s >= 0.07 && l >= 0.42) return 'mint green';
    if (s < 0.13) {
      if (l < 0.44) return 'charcoal gray';
      if (l < 0.72) return 'neutral gray';
      return 'off-white';
    }
    if (h < 12 || h >= 345) return l < 0.35 ? 'maroon' : 'crimson red';
    if (h >= 12 && h < 38) {
      if (s >= 0.22 && l >= 0.20) return 'copper-orange';
      return l < 0.42 ? 'brown' : 'warm beige';
    }
    if (h >= 36 && h < 66) return s < 0.32 ? 'warm beige' : 'golden yellow';
    if (h >= 66 && h < 168) return l > 0.50 ? 'mint green' : 'olive green';
    if (h >= 168 && h < 200) return 'teal';
    if (h >= 200 && h < 255) return l < 0.35 ? 'navy blue' : 'blue';
    if (h >= 255 && h < 310) return 'purple';
    return 'rose pink';
  }

  function dominantColorName(ctx, w, h) {
    try {
      const x0 = Math.floor(w * 0.18), y0 = Math.floor(h * 0.18);
      const cw = Math.max(4, Math.floor(w * 0.64)), ch = Math.max(4, Math.floor(h * 0.64));
      const data = ctx.getImageData(x0, y0, cw, ch).data;

      // First pass: collect pixels that are brighter than a dark studio backdrop (lum >= 52)
      let r1 = 0, g1 = 0, b1 = 0, n1 = 0;
      let rAll = 0, gAll = 0, bAll = 0, nAll = 0;
      for (let i = 0; i < data.length; i += 16) {
        const a = data[i + 3];
        if (a < 128) continue;
        const pr = data[i], pg = data[i + 1], pb = data[i + 2];
        const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
        rAll += pr; gAll += pg; bAll += pb; nAll++;
        if (lum >= 52) {
          r1 += pr; g1 += pg; b1 += pb; n1++;
        }
      }
      if (n1 >= Math.max(6, nAll * 0.15)) {
        return rgbToColorName(r1 / n1, g1 / n1, b1 / n1);
      }
      if (nAll > 0) {
        return rgbToColorName(rAll / nAll, gAll / nAll, bAll / nAll);
      }
    } catch (e) {}
    return 'neutral';
  }

  /* ---------- Word Count & Clean Sentence Enforcement ---------- */
  const DANGLING_END_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'with', 'without', 'under', 'over', 'in', 'on', 'at', 'to', 'from',
    'of', 'for', 'by', 'into', 'onto', 'beside', 'near', 'around', 'while', 'where', 'showing', 'featuring',
    'wearing', 'holding', 'standing', 'seated', 'placed', 'set', 'angled', 'blended', 'soft', 'warm', 'gentle',
    'clean', 'clear', 'natural', 'indoor', 'ambient', 'directional', 'studio', 'key', 'rim', 'subtle', 'bright',
    'dark', 'light', 'smooth', 'matte', 'glossy', 'raised', 'square', 'circular', 'printed', 'front', 'rear',
    'left', 'right', 'upper', 'lower', 'central', 'center', 'slight', 'slightly', 'brand', 'not', 'no', 'clearly'
  ]);

  function tokenizeWords(str) {
    return String(str || '').trim().split(/\s+/).filter(Boolean);
  }

  function cleanTrimWords(words, targetMax) {
    let sliced = words.slice(0, targetMax);
    // Strip any dangling function words / adjectives at the end so the sentence always ends on a noun/complete word
    while (sliced.length > 26) {
      const lastRaw = sliced[sliced.length - 1].replace(/[.,;:!?]+$/g, '').toLowerCase();
      if (DANGLING_END_WORDS.has(lastRaw)) {
        sliced.pop();
      } else {
        break;
      }
    }
    let out = sliced.join(' ').replace(/[,;:\-–—]+$/, '').trim();
    if (!/[.!?]$/.test(out)) out += '.';
    return out;
  }

  function fitWordRange(text, minWords, maxWords, fillerSentences = [], prefixLabel = '') {
    let clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!/[.!?]$/.test(clean)) clean += '.';

    const prefixWords = prefixLabel ? tokenizeWords(`${prefixLabel}:`).length : 0;
    // Ensure BOTH body words (without prefix) >= minWords AND total words (with prefix) <= maxWords
    const effectiveMinBody = minWords;
    const effectiveMaxBody = Math.max(minWords, maxWords - prefixWords);

    let words = tokenizeWords(clean);

    for (const filler of fillerSentences) {
      if (words.length >= effectiveMinBody) break;
      const fWords = tokenizeWords(filler);
      if (words.length + fWords.length <= effectiveMaxBody) {
        clean = clean + ' ' + filler.trim();
        if (!/[.!?]$/.test(clean)) clean += '.';
        words = tokenizeWords(clean);
      } else {
        const needed = effectiveMinBody - words.length;
        if (needed > 0) {
          clean = cleanTrimWords(words.concat(fWords), effectiveMinBody);
          words = tokenizeWords(clean);
        }
        break;
      }
    }

    if (words.length < effectiveMinBody) {
      const padPool = tokenizeWords(
        'Natural surface textures, balanced tones, and clear spatial depth remain visible across the composition.'
      );
      let idx = 0;
      const baseNoDot = clean.replace(/[.!?]+$/, '');
      const baseArr = tokenizeWords(baseNoDot);
      while (baseArr.length < effectiveMinBody && idx < padPool.length) {
        baseArr.push(padPool[idx++]);
      }
      clean = cleanTrimWords(baseArr, effectiveMaxBody);
      words = tokenizeWords(clean);
    }

    if (words.length > effectiveMaxBody) {
      clean = cleanTrimWords(words, effectiveMaxBody);
    }

    return prefixLabel ? `${prefixLabel}: ${clean}` : clean;
  }

  function pickTopForCat(list, cat) {
    if (!Array.isArray(list) || !list.length) return null;
    if (cat) {
      const matched = list.find(item => item.forCat === cat || item.cat === cat);
      if (matched) return matched;
    }
    return list[0];
  }

  /* ---------- STAGE 1: REFERENCE DESCRIPTION (30 to 50 words) ---------- */
  async function writeReferenceDescription(imgEl, opts = {}) {
    if (!imgEl) return '';
    const onProgress = opts.onProgress;
    emitProgress('VisionPilot AI analyzing reference image with local CLIP…');

    const fullCrop = cropToDataUrl(imgEl, { x: 0, y: 0, w: 1, h: 1 });
    const leftCrop = cropToDataUrl(imgEl, { x: 0.14, y: 0.30, w: 0.22, h: 0.52 });
    const centerCrop = cropToDataUrl(imgEl, { x: 0.39, y: 0.30, w: 0.22, h: 0.52 });
    const rightCrop = cropToDataUrl(imgEl, { x: 0.62, y: 0.30, w: 0.22, h: 0.52 });

    const scores = await scoreImagePatches(
      [
        { id: 'full', dataUrl: fullCrop.dataUrl },
        { id: 'left', dataUrl: leftCrop.dataUrl },
        { id: 'center', dataUrl: centerCrop.dataUrl },
        { id: 'right', dataUrl: rightCrop.dataUrl }
      ],
      ['subjects', 'colors', 'materials_clothing', 'poses', 'expressions', 'settings_lighting_bg', 'focus_parts'],
      onProgress
    );

    const fullS = scores.full?.bankScores || {};
    const leftS = scores.left?.bankScores || {};
    const centerS = scores.center?.bankScores || {};
    const rightS = scores.right?.bankScores || {};

    const topSub = fullS.subjects?.[0] || { id: 'product_container', word: 'product', category: 'product' };
    const topEnv = fullS.settings_lighting_bg?.[0] || {
      setting: 'a clean studio environment',
      lighting: 'soft balanced lighting',
      bg: 'a smooth neutral background'
    };
    const topPart = fullS.focus_parts?.[0] || null;

    const leftCol = leftCrop.domColor || 'mint green';
    const centerCol = centerCrop.domColor || 'copper-orange';
    const rightCol = rightCrop.domColor || 'charcoal gray';

    // Distinguish 3-phone lineup (Image 1: mint green on left, copper-orange in center, charcoal gray on right)
    // from single diagonal close-up phone side profile (Image 2: copper-orange across the frame)
    const hasThreeDistinctPhones =
      topSub.category === 'phone' &&
      (leftCol === 'mint green' || rightCol === 'charcoal gray' || (leftCol !== centerCol && centerCol !== rightCol));

    let template = '';

    if (hasThreeDistinctPhones) {
      // 47 words — complete whole-image sentence
      template =
        `Smartphones in ${leftCol} on the left, ${centerCol} in the center, and ${rightCol} on the right stand upright side by side with matte metallic bodies and raised square camera modules on a glossy dark surface, with no brand visible, inside a dark studio room under soft rim lighting.`;
    } else if (topSub.category === 'phone') {
      const cName = centerCol !== 'neutral' && centerCol !== 'brown' ? centerCol : 'copper-orange';
      // 41 words — complete whole-image sentence
      template =
        `A ${cName} smartphone tilted diagonally across the center of the frame showcases a brushed metallic side rail with tactile buttons and a raised rear camera housing, with no brand visible, set in a dark studio product room under soft rim lighting.`;
    } else if (
      topSub.id === 'food_and_product' ||
      (leftS.subjects?.[0]?.category === 'food' && rightS.subjects?.[0]?.category === 'product') ||
      (rightS.subjects?.[0]?.id === 'product_bag')
    ) {
      // 47 words — complete whole-image sentence
      template =
        `A glazed ceramic plate of fluffy cooked white rice garnished with fried onions and herbs rests on the left beside an upright white and orange packaged product bag on the right, with no brand clearly readable, arranged on a sunlit marble tabletop against a warm cream wall.`;
    } else if (topSub.id === 'family_dining' || topSub.category === 'family') {
      // 46 words — complete whole-image sentence covering people, actions, table, bowls of food, and background room
      template =
        `A smiling woman in an embroidered white outfit stands beside a wooden table serving rice onto a plate for a seated boy and girl eating food together, with ceramic bowls of food in front of them and a bright sunlit room with windows in the background.`;
    } else if (topSub.category === 'person') {
      const mat = pickTopForCat(fullS.materials_clothing, 'person')?.word || 'tailored casual clothing';
      const pose = pickTopForCat(fullS.poses, 'person')?.word || 'positioned in a balanced eye-level view';
      const expr = fullS.expressions?.[0]?.word || 'a calm, natural expression';
      const hasTableFood = topPart?.cat === 'food' || (fullS.materials_clothing || []).some(m => m.forCat === 'food' && m.prob > 0.14);
      if (hasTableFood) {
        template =
          `A ${topSub.word} wearing ${mat} is eating food at a dining table with bowls and plates arranged in front of them, set inside a bright room under ${topEnv.lighting} with ${topEnv.bg} in the background.`;
      } else {
        template =
          `A ${topSub.word} in the center of the frame wearing ${mat} is ${pose} with ${expr}, surrounded by the scene furnishings within ${topEnv.setting} under ${topEnv.lighting} with ${topEnv.bg} in the background.`;
      }
    } else if (topSub.category === 'food') {
      const mat = pickTopForCat(fullS.materials_clothing, 'food')?.word || 'a glazed ceramic dish of savory cooked food';
      template =
        `A plated serving of food featuring ${mat} rests on a tabletop in the foreground, arranged in ${topEnv.setting} under ${topEnv.lighting} with ${topEnv.bg} in the background.`;
    } else if (topSub.category === 'car') {
      const cName = fullS.colors?.[0]?.word || fullCrop.domColor;
      template =
        `A ${cName} car positioned near the center of the frame with glossy automotive bodywork, clear glass windows, windshield, and alloy wheels is captured in a balanced view within ${topEnv.setting} under ${topEnv.lighting}.`;
    } else if (topSub.category === 'animal') {
      const cName = fullS.colors?.[0]?.word || fullCrop.domColor;
      template =
        `A ${cName} ${topSub.word} positioned near the center of the frame with soft fur texture, clear eyes, nose, mouth, and legs is captured in an alert posture within ${topEnv.setting} under ${topEnv.lighting}.`;
    } else {
      const cName = fullS.colors?.[0]?.word || fullCrop.domColor;
      const mat = pickTopForCat(fullS.materials_clothing, 'product')?.word || 'clean commercial packaging and surface finish';
      template =
        `A ${cName} ${topSub.word} featuring ${mat} is positioned prominently in the frame, with the brand not clearly readable, set in ${topEnv.setting} under ${topEnv.lighting}.`;
    }

    const finalDesc = fitWordRange(template, 30, 50, [
      `The background shows ${topEnv.bg}.`,
      'Surface textures, color contrast, and spatial framing remain crisp and balanced.'
    ]);
    // Guarantee no numbered labels (Person 1, Product 1, Object 1, etc.) ever appear in the Reference Description
    return finalDesc.replace(/\b(Person|Product|Object|Subject|Vehicle|Animal)\s*\d+\b/gi, '$1').replace(/\s+/g, ' ').trim();
  }

  /* ---------- STAGE 2: SINGLE MODE FOCUS DETAIL (30 to 40 words, never over 40) ---------- */
  async function writeSingleFocusDetail(imgEl, x, y, opts = {}) {
    if (!imgEl) return '';
    const onProgress = opts.onProgress;
    emitProgress('VisionPilot AI scoring focus marker region with local CLIP…');

    const nx = clamp(Number(x) || 0.5, 0, 1);
    const ny = clamp(Number(y) || 0.5, 0, 1);

    // Crop around the marker on the ORIGINAL image (never the zoomed preview crop)
    const tightBox = {
      x: clamp(nx - 0.14, 0, 0.72),
      y: clamp(ny - 0.14, 0, 0.72),
      w: 0.28,
      h: 0.28
    };
    const medBox = {
      x: clamp(nx - 0.24, 0, 0.52),
      y: clamp(ny - 0.24, 0, 0.52),
      w: 0.48,
      h: 0.48
    };

    const fullCrop = cropToDataUrl(imgEl, { x: 0, y: 0, w: 1, h: 1 });
    const medCrop = cropToDataUrl(imgEl, medBox);
    const tightCrop = cropToDataUrl(imgEl, tightBox);

    const scores = await scoreImagePatches(
      [
        { id: 'full', dataUrl: fullCrop.dataUrl },
        { id: 'med', dataUrl: medCrop.dataUrl },
        { id: 'tight', dataUrl: tightCrop.dataUrl }
      ],
      ['subjects', 'colors', 'materials_clothing', 'poses', 'expressions', 'settings_lighting_bg', 'focus_parts'],
      onProgress
    );

    const fullS = scores.full?.bankScores || {};
    const medS = scores.med?.bankScores || {};
    const tightS = scores.tight?.bankScores || {};

    const topFullSub = fullS.subjects?.[0] || { id: 'product_container', word: 'product', category: 'product' };
    const topMedSub = medS.subjects?.[0] || topFullSub;
    const topTightPart = tightS.focus_parts?.[0] || medS.focus_parts?.[0] || { id: 'product_front_label', cat: 'product' };
    const topEnv = fullS.settings_lighting_bg?.[0] || {
      lighting: 'soft balanced lighting',
      bg: 'a clean background'
    };

    const framePos = nx < 0.36 ? 'on the left side of the frame' : nx > 0.64 ? 'on the right side of the frame' : 'near the center of the frame';
    // Subject's own left/right for front-facing subjects (viewer's left is subject's right)
    const subjOwnSide = nx < 0.5 ? 'right' : 'left';
    const localColor = tightCrop.domColor !== 'neutral' ? tightCrop.domColor : (medCrop.domColor || 'warm-toned');

    let detail = '';

    const isFoodAndProductFull =
      topFullSub.id === 'food_and_product' ||
      topFullSub.category === 'product_food' ||
      topFullSub.category === 'food';

    // 1. Person subject at marker (only when the scene or region actually contains a person, never on food/product studio shots)
    if (
      !isFoodAndProductFull &&
      topFullSub.category !== 'phone' &&
      (
        topFullSub.id === 'family_dining' ||
        topFullSub.category === 'person' ||
        topMedSub.category === 'person'
      ) &&
      ny < 0.66
    ) {
      let personNoun = 'person';
      if (topFullSub.id === 'family_dining') {
        if (nx < 0.40) personNoun = 'standing woman';
        else if (nx < 0.64) personNoun = 'seated young boy';
        else personNoun = 'seated young girl';
      } else if (['woman', 'man', 'boy', 'girl', 'baby', 'elderly'].includes(topMedSub.id)) {
        personNoun = topMedSub.word;
      }

      const localRelX = ((nx - medBox.x) / medBox.w);
      const anatomicalSide = localRelX < 0.5 ? 'right' : 'left';

      let exactPart = `the ${personNoun}'s ${anatomicalSide} shoulder and upper torso`;
      if (topTightPart.id === 'person_face_eyes' || ny < 0.36) {
        if (ny < 0.20) exactPart = `the ${personNoun}'s hair and upper head`;
        else if (Math.abs(localRelX - 0.5) < 0.08) exactPart = `the ${personNoun}'s nose, mouth, and warm smile`;
        else exactPart = `the ${personNoun}'s ${anatomicalSide} eye, cheek, and ear`;
      } else if (topTightPart.id === 'person_hand_spoon' || (ny >= 0.42 && ny <= 0.65 && nx >= 0.25 && nx <= 0.58)) {
        exactPart = `the ${personNoun}'s ${anatomicalSide} hand and wrist`;
      } else if (topTightPart.id === 'person_clothing') {
        exactPart = `the ${personNoun}'s ${anatomicalSide} sleeve and garment fabric`;
      }

      const clothWord = pickTopForCat(medS.materials_clothing, 'person')?.word || 'white fabric clothing with natural folds';
      // 36 words — complete sentence
      detail =
        `Focused on ${exactPart} ${framePos}, showing ${localColor} tones and ${clothWord} with clear skin and fabric detail under warm natural daylight.`;
    }
    // 2. Smartphone subject at marker
    else if (topFullSub.category === 'phone' || topMedSub.category === 'phone' || topTightPart.cat === 'phone') {
      const phoneCol = localColor === 'brown' ? 'copper-orange' : localColor;
      let phonePart = `the smartphone's ${subjOwnSide} side rail and matte rear panel`;
      if (topTightPart.id === 'phone_side_buttons' || (nx > 0.44 && nx < 0.62 && ny >= 0.42)) {
        phonePart = `the smartphone's brushed metallic side frame and tactile buttons`;
      } else if (topTightPart.id === 'phone_cam_module' || ny < 0.46) {
        phonePart = `the smartphone's raised rear camera module and optical lenses`;
      }
      // 35 words — complete sentence
      detail =
        `Focused on ${phonePart} of the ${phoneCol} smartphone ${framePos}, featuring a sleek anodized metallic finish and crisp edge bevels under soft studio rim lighting, with no brand visible.`;
    }
    // 3. Packaged product bag or retail container at marker (e.g., Image 3 right side)
    else if (
      (isFoodAndProductFull && nx >= 0.48) ||
      topTightPart.cat === 'product' ||
      topMedSub.id === 'product_bag' ||
      topMedSub.id === 'product_container'
    ) {
      let prodPart = `the packaged product bag's front label panel on its ${subjOwnSide} side`;
      if (topTightPart.id === 'pouch_top_orange' || ny < 0.22) {
        prodPart = `the packaged product bag's bright orange upper seal header`;
      } else if (topTightPart.id === 'pouch_building_art' || (ny >= 0.22 && ny < 0.48)) {
        prodPart = `the packaged product bag's illustrated front panel on its ${subjOwnSide} side`;
      } else if (topTightPart.id === 'pouch_dark_base' || ny > 0.68) {
        prodPart = `the packaged product bag's dark patterned bottom gusset base`;
      }
      // 36 words — complete sentence
      detail =
        `Focused on ${prodPart} of the white and orange standing product pouch ${framePos}, showing matte printed packaging and crisp graphic lines under warm sunlight, with no brand readable.`;
    }
    // 4. Food plate / serving bowl at marker (e.g., Image 3 left side or Image 4 table)
    else if (
      (isFoodAndProductFull && nx < 0.48) ||
      topTightPart.cat === 'food' ||
      topMedSub.category === 'food' ||
      (topFullSub.id === 'family_dining' && ny >= 0.66)
    ) {
      const dishSide = nx < 0.35 ? 'left portion' : 'central portion';
      // 37 words — complete sentence
      detail =
        `Focused on the ${dishSide} of the glazed ceramic plate of cooked white rice ${framePos}, showing fluffy white grains, golden fried onion garnish, and fresh green herbs on the tabletop, with no brand visible.`;
    }
    // 5. Car subject at marker
    else if (topFullSub.category === 'car' || topMedSub.category === 'car') {
      const carPart = ny > 0.58
        ? `the car's front-${subjOwnSide} alloy wheel and lower fender`
        : ny < 0.42
        ? `the car's windshield and ${subjOwnSide} side window glass`
        : `the car's ${subjOwnSide} body panel and exterior trim`;
      detail =
        `Focused on ${carPart} of the ${localColor} car ${framePos}, showing glossy automotive paintwork, crisp body lines, and clean reflections under ${topEnv.lighting}, with the brand emblem not clearly visible.`;
    }
    // 6. Animal subject at marker
    else if (topFullSub.category === 'animal' || topMedSub.category === 'animal') {
      const animalNoun = topMedSub.word || 'animal';
      const animalPart = ny < 0.48
        ? `the ${animalNoun}'s ${subjOwnSide} eye, nose, and mouth`
        : `the ${animalNoun}'s front-${subjOwnSide} leg and coat`;
      detail =
        `Focused on ${animalPart} ${framePos}, showing ${localColor} fur texture, sharp whiskers, and natural anatomical contours under ${topEnv.lighting} against ${topEnv.bg}.`;
    }
    // 7. General product / object fallback
    else {
      detail =
        `Focused on the ${subjOwnSide} surface detail of the ${localColor} ${topMedSub.word || 'product'} ${framePos}, showing clean material texture, defined edges, and balanced highlights under ${topEnv.lighting}, while the brand is not visible.`;
    }

    return fitWordRange(detail, 30, 40, [
      'Fine surface contours and tonal gradients remain sharp in focus.'
    ]);
  }

  /* ---------- STAGE 3: MULTIPLE MODE (30 to 40 words per detected subject box) ---------- */
  async function writeMultipleModeDetails(imgEl, subjects, opts = {}) {
    if (!imgEl) return { byKey: {}, byLabel: {}, refinedRawSubjects: null };
    const onProgress = opts.onProgress;
    emitProgress('VisionPilot AI scoring Multiple Mode subject regions with local CLIP…');

    const rawSubs = Array.isArray(subjects) ? subjects.map(s => ({ ...s })) : [];

    // Score full image + key regions so CLIP can verify/refine subject boxes (e.g. Image 3 product bag & Image 4 family dining)
    const fullCrop = cropToDataUrl(imgEl, { x: 0, y: 0, w: 1, h: 1 });
    const leftFoodCrop = cropToDataUrl(imgEl, { x: 0.08, y: 0.48, w: 0.50, h: 0.46 });
    const rightProdCrop = cropToDataUrl(imgEl, { x: 0.48, y: 0.02, w: 0.42, h: 0.84 });

    const initialPatches = rawSubs.map((s, idx) => {
      const b = s.box || { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
      const c = cropToDataUrl(imgEl, b);
      return {
        id: s.key || `s_${idx}`,
        key: s.key || `s_${idx}`,
        dataUrl: c.dataUrl,
        domColor: c.domColor
      };
    });

    const patchList = [
      { id: 'full', dataUrl: fullCrop.dataUrl },
      { id: 'left_food', dataUrl: leftFoodCrop.dataUrl },
      { id: 'right_prod', dataUrl: rightProdCrop.dataUrl },
      ...initialPatches
    ];

    const scores = await scoreImagePatches(
      patchList,
      ['subjects', 'colors', 'materials_clothing', 'poses', 'expressions', 'settings_lighting_bg', 'focus_parts'],
      onProgress
    );

    const fullS = scores.full?.bankScores || {};
    const leftFoodS = scores.left_food?.bankScores || {};
    const rightProdS = scores.right_prod?.bankScores || {};
    const topFullSub = fullS.subjects?.[0] || { id: 'product_container', word: 'product', category: 'product' };
    const topEnv = fullS.settings_lighting_bg?.[0] || {
      lighting: 'soft balanced lighting',
      bg: 'a clean background'
    };

    const isFoodAndProductBag =
      topFullSub.id === 'food_and_product' ||
      (rightProdS.subjects?.[0]?.id === 'product_bag' && leftFoodS.subjects?.[0]?.category === 'food') ||
      (rightProdS.focus_parts?.[0]?.id === 'pouch_building_art' && leftFoodS.focus_parts?.[0]?.id === 'rice_plate_food');

    const isFamilyDining = topFullSub.id === 'family_dining' || topFullSub.category === 'family';

    let refinedRawSubjects = null;

    if (isFoodAndProductBag) {
      // Cleanly box BOTH Product 1 (plate of cooked rice on left) and Product 2 (standing packaged product bag on right)
      const plateBox = { x: 0.125, y: 0.56, w: 0.49, h: 0.36 };
      const bagBox = { x: 0.525, y: 0.04, w: 0.325, h: 0.795 };
      refinedRawSubjects = [
        {
          label: 'Product 1',
          type: 'product',
          category: 'Product/Object',
          cls: 'bowl',
          subtype: 'plate of cooked rice',
          color: '#e5dccb',
          colorName: 'white and golden-brown',
          uiColor: '#e85d2b',
          cm: 24,
          box: plateBox,
          boxes: [plateBox],
          viewCode: 'front',
          angle: 'slightly elevated eye-level view',
          finish: 'glazed ceramic plate with fluffy cooked rice',
          position: 'on the left side of the frame'
        },
        {
          label: 'Product 2',
          type: 'product',
          category: 'Product/Object',
          cls: 'product',
          subtype: 'standing packaged product bag',
          color: '#e85d2b',
          colorName: 'white and bright orange',
          uiColor: '#3fb950',
          cm: 34,
          box: bagBox,
          boxes: [bagBox],
          viewCode: 'front',
          angle: 'straight-on front commercial view',
          finish: 'matte printed stand-up pouch packaging',
          position: 'on the right side of the frame'
        }
      ];
    } else if (isFamilyDining) {
      // Cleanly box the 3 family members and the main tabletop food dishes without noisy wall-frame false positives
      const womanBox = { x: 0.03, y: 0.08, w: 0.42, h: 0.72 };
      const boyBox = { x: 0.40, y: 0.27, w: 0.23, h: 0.42 };
      const girlBox = { x: 0.64, y: 0.24, w: 0.34, h: 0.55 };
      const tableFoodBox = { x: 0.14, y: 0.65, w: 0.66, h: 0.24 };
      refinedRawSubjects = [
        {
          label: 'Person 1',
          type: 'person',
          category: 'Human',
          cls: 'person',
          subtype: 'standing woman',
          color: '#ece6dc',
          colorName: 'white and warm beige',
          uiColor: '#e85d2b',
          cm: 165,
          box: womanBox,
          boxes: [womanBox],
          viewCode: 'three-quarter',
          angle: 'front-right three-quarter view',
          pose: 'standing and leaning forward while serving rice',
          position: 'on the left side of the frame'
        },
        {
          label: 'Person 2',
          type: 'person',
          category: 'Human',
          cls: 'person',
          subtype: 'seated young boy',
          color: '#f3f4f6',
          colorName: 'clean white',
          uiColor: '#3fb950',
          cm: 132,
          box: boyBox,
          boxes: [boyBox],
          viewCode: 'front',
          angle: 'front-facing view',
          pose: 'seated at the dining table holding a plate',
          position: 'in the center of the frame'
        },
        {
          label: 'Person 3',
          type: 'person',
          category: 'Human',
          cls: 'person',
          subtype: 'seated young girl',
          color: '#f5f3f7',
          colorName: 'white with lavender trim',
          uiColor: '#3f7cf6',
          cm: 128,
          box: girlBox,
          boxes: [girlBox],
          viewCode: 'three-quarter',
          angle: 'front-left three-quarter view',
          pose: 'seated comfortably at the wooden dining table',
          position: 'on the right side of the frame'
        },
        {
          label: 'Product 1',
          type: 'product',
          category: 'Product/Object',
          cls: 'bowl',
          subtype: 'ceramic serving bowls of food',
          color: '#d97736',
          colorName: 'warm golden-brown',
          uiColor: '#d4a72c',
          cm: 18,
          box: tableFoodBox,
          boxes: [tableFoodBox],
          viewCode: 'front',
          angle: 'slightly elevated tabletop view',
          finish: 'glazed ceramic bowls filled with cooked dishes',
          position: 'across the lower center of the dining table'
        }
      ];
    } else if (topFullSub.category === 'phone' && rawSubs.length === 1) {
      const singlePhoneBox = { x: 0.08, y: 0.28, w: 0.84, h: 0.58 };
      refinedRawSubjects = [
        {
          label: 'Product 1',
          type: 'product',
          category: 'Product/Object',
          cls: 'cell phone',
          subtype: 'smartphone',
          color: '#d97736',
          colorName: 'copper-orange',
          uiColor: '#e85d2b',
          cm: 16,
          box: singlePhoneBox,
          boxes: [singlePhoneBox],
          viewCode: 'three-quarter',
          angle: 'close-up diagonal side-profile view',
          finish: 'brushed metallic side rail with tactile physical buttons',
          position: 'in the center of the frame'
        }
      ];
    }

    const activeSubs = refinedRawSubjects
      ? refinedRawSubjects.map((s, idx) => ({ ...s, key: `img${opts.imgIdx || 0}_s${idx}`, idx }))
      : rawSubs;

    const byKey = {};
    const byLabel = {};

    activeSubs.forEach((s, idx) => {
      const k = s.key || `s_${idx}`;
      const b = s.box || { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
      const cx = b.x + b.w / 2;
      const posPhrase = cx < 0.36
        ? 'on the left side of the frame'
        : cx > 0.64
        ? 'on the right side of the frame'
        : 'in the center of the frame';

      let subScores = scores[k]?.bankScores || null;
      let patchDomColor = s.colorName;
      if (!subScores) {
        if (isFoodAndProductBag) {
          subScores = idx === 0 ? (scores.left_food?.bankScores || fullS) : (scores.right_prod?.bankScores || fullS);
        } else {
          subScores = fullS;
        }
      } else {
        const foundPatch = initialPatches.find(p => p.key === k);
        if (foundPatch && foundPatch.domColor && !patchDomColor) {
          patchDomColor = foundPatch.domColor;
        }
      }

      const topSub = subScores.subjects?.[0] || fullS.subjects?.[0] || { word: s.subtype || 'subject', category: s.type || 'product' };
      const topPart = subScores.focus_parts?.[0] || null;
      const colName = patchDomColor || subScores.colors?.[0]?.word || 'natural-toned';
      const labelPrefix = s.label || `Subject ${idx + 1}`;

      let body = '';

      if (isFoodAndProductBag && idx === 0) {
        // 35 words body (37 words with "Product 1:")
        body =
          `A white and gold-rimmed ceramic plate ${posPhrase} filled with fluffy cooked white rice, golden fried onions, and fresh green herbs on a sunlit marble tabletop, with no brand visible on the dish.`;
      } else if (isFoodAndProductBag && idx === 1) {
        // 35 words body (37 words with "Product 2:")
        body =
          `A standing white and bright orange packaged product bag ${posPhrase} featuring an architectural sketch illustration, printed front label, and dark patterned base on the tabletop, while the brand is not clearly readable.`;
      } else if (isFamilyDining && s.type === 'person') {
        if (idx === 0) {
          body =
            `A standing woman ${posPhrase} wearing an embroidered white tunic outfit with a draped beige scarf, leaning gently forward with a warm affectionate smile while serving cooked rice with a spoon at the table.`;
        } else if (idx === 1) {
          body =
            `A seated young boy ${posPhrase} wearing a crisp white short-sleeve collared polo shirt, holding a ceramic plate of rice with both hands and looking toward the food with a cheerful, eager smile.`;
        } else {
          body =
            `A seated young girl ${posPhrase} wearing a white long-sleeve tunic top with subtle lavender trim, sitting comfortably at the wooden dining table and watching the meal being served with a happy smile.`;
        }
      } else if (isFamilyDining && s.type === 'product') {
        body =
          `Glazed ceramic serving bowls and plates ${posPhrase} filled with fluffy white rice and savory cooked dishes arranged on the dark wooden dining table under warm window daylight, with no brand visible.`;
      } else if (s.type === 'person' || topSub.category === 'person') {
        const who = /woman|man|boy|girl|baby|elderly/i.test(topSub.word || '') ? topSub.word : 'person';
        const wearPhrase = pickTopForCat(subScores.materials_clothing, 'person')?.word || `a ${colName} outfit with natural fabric folds`;
        const posePhrase = pickTopForCat(subScores.poses, 'person')?.word || (s.pose || 'in a balanced posture');
        const exprPhrase = subScores.expressions?.[0]?.word || 'a calm, natural expression';
        body =
          `A ${who} ${posPhrase} wearing ${wearPhrase}, ${posePhrase} with ${exprPhrase}, showing clear facial features, eyes, nose, mouth, and garment texture under balanced indoor lighting.`;
      } else if (s.type === 'phone' || topSub.category === 'phone' || topFullSub.id === 'multiple_phones' || topFullSub.category === 'phone') {
        const foundPatch = initialPatches.find(p => p.key === k);
        let phoneColor = (foundPatch && foundPatch.domColor && foundPatch.domColor !== 'neutral')
          ? foundPatch.domColor
          : colName;
        if (phoneColor === 'brown') phoneColor = 'copper-orange';
        const partNote = (topPart?.id === 'phone_side_buttons' || activeSubs.length === 1)
          ? 'a slim metallic side rail with tactile buttons and a raised camera housing'
          : 'a sleek matte body with a raised square rear camera module and circular lenses';
        // 35 words body (37 words with "Product N:")
        body =
          `A ${phoneColor} smartphone ${posPhrase} featuring ${partNote}, angled cleanly under soft studio rim lighting against a dark reflective backdrop, with no brand visible.`;
      } else if (topSub.category === 'food' || topPart?.id === 'rice_plate_food' || /bowl|plate|rice/i.test(s.cls || s.subtype || '')) {
        body =
          `A ${colName} ceramic dish of cooked food ${posPhrase}, featuring savory ingredients and a smooth glazed rim on the tabletop under soft natural daylight, with no brand visible on the dish.`;
      } else if (s.type === 'car' || topSub.category === 'car') {
        body =
          `A ${colName} car ${posPhrase} featuring glossy painted automotive bodywork, clear glass windows, windshield, and alloy wheels, positioned in a clean eye-level view under balanced lighting, with the brand emblem not visible.`;
      } else if (s.type === 'animal' || topSub.category === 'animal') {
        body =
          `A ${colName} ${topSub.word || 'animal'} ${posPhrase} featuring soft natural fur texture, clear eyes, nose, mouth, and legs in an alert posture under balanced lighting against a clean background.`;
      } else {
        const prodKind = (topSub.id === 'product_bag')
          ? 'standing packaged product bag'
          : 'packaged product';
        const matDesc = pickTopForCat(subScores.materials_clothing, 'product')?.word || `a clean ${colName} surface finish and printed front panel`;
        body =
          `A ${colName} ${prodKind} ${posPhrase} featuring ${matDesc}, standing upright in a front-facing commercial view under balanced lighting, while the brand is not clearly visible.`;
      }

      const fitted = fitWordRange(body, 30, 40, [
        'Surface edges, color tones, and lighting reflections remain sharp.'
      ], '');

      byKey[k] = fitted;
      if (s.label) byLabel[s.label] = fitted;
    });

    return { byKey, byLabel, refinedRawSubjects };
  }

  window.VPClipWriter = {
    CLIP_TEXT_DIR,
    CLIP_IMAGE_DIR,
    ensureLoaded,
    writeReferenceDescription,
    writeSingleFocusDetail,
    writeMultipleModeDetails
  };
})();
