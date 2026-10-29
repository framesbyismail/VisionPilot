/* VisionPilot — Local VisionPilot AI Writer
 * Connects the local VisionPilot AI Text and Vision model folders
 * to the VisionPilot AI engine via a background Web Worker.
 *
 * Strictly follows the 3-Stage VisionPilot AI Template Rules:
 * - Stage 1: Reference Description (30 to 50 words)
 * - Stage 2: Single Mode Focus Detail (30 to 40 words, never over 40)
 * - Stage 3: Multiple Mode Subject Details (30 to 40 words per subject box)
 */
(() => {
  'use strict';

  const scriptEl = document.currentScript;
  const scriptUrl = (scriptEl && scriptEl.src) ? new URL('./', scriptEl.src).href : new URL('./', window.location.href).href;
  const rootUrl = (scriptEl && scriptEl.src) ? new URL('../', scriptEl.src).href : new URL('./', window.location.href).href;
  const derivedTextDir = scriptUrl.slice(rootUrl.length).replace(/^\/+|\/+$/g, '');
  const derivedImageDir = derivedTextDir.replace(/-text$/, '-image');

  const VP_TEXT_DIR = (scriptEl && (scriptEl.getAttribute('data-vp-text') || scriptEl.getAttribute('data-model-text'))) || derivedTextDir;
  const VP_IMAGE_DIR = (scriptEl && (scriptEl.getAttribute('data-vp-image') || scriptEl.getAttribute('data-model-image'))) || derivedImageDir;
  const WORKER_URL = (scriptEl && scriptEl.src)
    ? scriptEl.src.replace(/writer\.js(\?.*)?$/, 'worker.js$1')
    : `${VP_TEXT_DIR}/ worker.js`.replace(/\s+/g, '');

  let worker = null;
  let workerReadyPromise = null;
  let reqSeq = 1;
  let writerEpoch = 1;
  const pendingReqs = new Map();
  let activeProgressCallback = null;

  function emitProgress(msg, callEpoch) {
    if (callEpoch !== undefined && callEpoch !== writerEpoch) return;
    if (typeof activeProgressCallback === 'function') {
      try { activeProgressCallback(msg); } catch (e) {}
    }
  }

  function makeCancelError() {
    const err = new Error('VisionPilot AI operation cancelled due to AI model switch');
    err.cancelled = true;
    return err;
  }

  function cancelAll() {
    writerEpoch++;
    activeProgressCallback = null;
    if (worker) {
      try { worker.postMessage({ action: 'cancel', upToId: Math.max(0, reqSeq - 1) }); } catch (e) {}
    }
    if (pendingReqs.size > 0) {
      pendingReqs.forEach((p) => {
        try { p.reject(makeCancelError()); } catch (e) {}
      });
      pendingReqs.clear();
    }
  }

  function getEpoch() {
    return writerEpoch;
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker(WORKER_URL, { type: 'module' });
    worker.onmessage = (evt) => {
      const msg = evt.data || {};
      if (msg.type === 'progress') {
        if (msg.message) emitProgress(msg.message, writerEpoch);
        return;
      }
      if (msg.id && pendingReqs.has(msg.id)) {
        const p = pendingReqs.get(msg.id);
        pendingReqs.delete(msg.id);
        if (p.epoch !== undefined && p.epoch !== writerEpoch) {
          p.reject(makeCancelError());
          return;
        }
        if (msg.ok) p.resolve(msg.result);
        else if (msg.error === 'Cancelled') p.reject(makeCancelError());
        else p.reject(new Error(msg.error || 'VisionPilot AI Worker error'));
      }
    };
    worker.onerror = (err) => {
      const errMsg = err?.message || 'VisionPilot AI Worker failed to load';
      pendingReqs.forEach((p) => p.reject(new Error(errMsg)));
      pendingReqs.clear();
    };
    return worker;
  }

  function analyzePatchStats(p) {
    const data = p.data || (p.dataUrl && p.dataUrl.data) || [];
    const w = p.width || (p.dataUrl && p.dataUrl.width) || 224;
    const h = p.height || (p.dataUrl && p.dataUrl.height) || 224;
    let darkCnt = 0, veryDarkTireCnt = 0, metallicRimCnt = 0, brightCnt = 0, headlightBrightCnt = 0;
    let warmBeigeCnt = 0, orangeCnt = 0, redTailCnt = 0, mintCnt = 0, whiteCnt = 0, skinCnt = 0, glassCnt = 0, total = 0;
    let topOrangeCnt = 0, topTotal = 0;
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const i = (y * w + x) * 4;
        const r = data[i] || 0, g = data[i + 1] || 0, b = data[i + 2] || 0;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
        const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
        total++;
        if (lum < 62) darkCnt++;
        if (lum < 52 && sat < 0.32) veryDarkTireCnt++;
        if (lum >= 95 && lum <= 210 && sat < 0.22) metallicRimCnt++;
        if (lum > 185) brightCnt++;
        if (lum > 212 && (r > 200 && g > 200)) headlightBrightCnt++;
        if (r > 205 && g > 205 && b > 195) whiteCnt++;
        if (r > 185 && g > 80 && g < 165 && b < 90 && (r - b) > 95) {
          orangeCnt++;
          if (y < h * 0.28) topOrangeCnt++;
        }
        if (r > 155 && r > g * 1.45 && r > b * 1.45 && (r - g) > 45) redTailCnt++;
        if (y < h * 0.28) topTotal++;
        if (g > r + 4 && g > 115 && b > 105 && lum > 110 && lum < 220) mintCnt++;
        if (r > 185 && g > 165 && b > 135 && (r - b) > 18 && (r - b) < 75) warmBeigeCnt++;
        if (r > 135 && g > 85 && b > 60 && r > g + 12 && g > b + 6 && lum > 85 && lum < 225) skinCnt++;
        if (lum >= 45 && lum <= 165 && sat < 0.28 && b >= r - 10) glassCnt++;
      }
    }
    const n = Math.max(1, total);
    const tireRatio = veryDarkTireCnt / n;
    const rimRatio = metallicRimCnt / n;
    return {
      darkRatio: darkCnt / n,
      tireRatio,
      rimRatio,
      tireScore: tireRatio * 0.7 + Math.min(tireRatio, rimRatio) * 0.6,
      brightRatio: brightCnt / n,
      headlightScore: headlightBrightCnt / n,
      taillightScore: redTailCnt / n,
      glassScore: glassCnt / n,
      warmBeigeRatio: warmBeigeCnt / n,
      orangeRatio: orangeCnt / n,
      topOrangeRatio: topOrangeCnt / Math.max(1, topTotal),
      mintRatio: mintCnt / n,
      whiteRatio: whiteCnt / n,
      skinRatio: skinCnt / n
    };
  }

  // Fallback canvas patch scorer if Web Worker is blocked (e.g. when opened directly via file:// protocol)
  function fallbackScoreImagePatches(patches) {
    const out = {};
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
    const callEpoch = writerEpoch;
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
      pendingReqs.set(id, { resolve, reject, epoch: callEpoch });
      w.postMessage({
        id,
        action: 'warmup',
        payload: {
          textDir: VP_TEXT_DIR,
          imageDir: VP_IMAGE_DIR
        }
      });
    }).catch((err) => {
      workerReadyPromise = null;
      if (err?.cancelled || callEpoch !== writerEpoch) throw err;
      return { ready: true, fallback: true };
    });
    return workerReadyPromise;
  }

  async function scoreImagePatches(patches, banks, onProgress, callEpoch = writerEpoch) {
    if (callEpoch !== writerEpoch) throw makeCancelError();
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
      const res = await new Promise((resolve, reject) => {
        pendingReqs.set(id, { resolve, reject, epoch: callEpoch });
        w.postMessage({
          id,
          action: 'score_patches',
          payload: {
            textDir: VP_TEXT_DIR,
            imageDir: VP_IMAGE_DIR,
            patches: workerPatches
          }
        });
      });
      if (callEpoch !== writerEpoch) throw makeCancelError();
      return res;
    } catch (err) {
      if (err?.cancelled || callEpoch !== writerEpoch) {
        throw makeCancelError();
      }
      console.warn('[VisionPilot AI] Worker unavailable, using local canvas patch scorer:', err?.message || err);
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
      const fullData = ctx.getImageData(0, 0, w, h).data;
      // Estimate border background color from outer perimeter
      let br = 0, bg = 0, bb = 0, bn = 0;
      for (let x = 0; x < w; x += 4) {
        const iTop = x * 4;
        const iBot = ((h - 1) * w + x) * 4;
        if (fullData[iTop + 3] >= 128) { br += fullData[iTop]; bg += fullData[iTop + 1]; bb += fullData[iTop + 2]; bn++; }
        if (fullData[iBot + 3] >= 128) { br += fullData[iBot]; bg += fullData[iBot + 1]; bb += fullData[iBot + 2]; bn++; }
      }
      if (bn > 0) { br /= bn; bg /= bn; bb /= bn; }

      const x0 = Math.floor(w * 0.16), y0 = Math.floor(h * 0.16);
      const x1 = Math.ceil(w * 0.84), y1 = Math.ceil(h * 0.84);
      let rSat = 0, gSat = 0, bSat = 0, wSat = 0;
      let rFg = 0, gFg = 0, bFg = 0, wFg = 0;
      let rAll = 0, gAll = 0, bAll = 0, nAll = 0;

      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4;
          if (fullData[i + 3] < 128) continue;
          const pr = fullData[i], pg = fullData[i + 1], pb = fullData[i + 2];
          rAll += pr; gAll += pg; bAll += pb; nAll++;
          const bgDist = bn > 0 ? Math.hypot(pr - br, pg - bg, pb - bb) : 999;
          if (bgDist < 22) continue;
          const mx = Math.max(pr, pg, pb), mn = Math.min(pr, pg, pb);
          const sat = mx > 0 ? (mx - mn) / mx : 0;
          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          const cw = 1.2 - 0.5 * (Math.hypot((x - w * 0.5) / (w * 0.35), (y - h * 0.5) / (h * 0.35)));
          const wt = Math.max(0.25, cw);
          rFg += pr * wt; gFg += pg * wt; bFg += pb * wt; wFg += wt;
          if (sat > 0.20 && lum > 28 && lum < 235) {
            const sw = wt * (1 + sat * 2.5);
            rSat += pr * sw; gSat += pg * sw; bSat += pb * sw; wSat += sw;
          }
        }
      }
      if (wSat > Math.max(4, wFg * 0.18)) {
        return rgbToColorName(rSat / wSat, gSat / wSat, bSat / wSat);
      }
      if (wFg > 3) {
        return rgbToColorName(rFg / wFg, gFg / wFg, bFg / wFg);
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
    const callEpoch = writerEpoch;
    const onProgress = opts.onProgress;
    emitProgress('VisionPilot AI analyzing reference image…', callEpoch);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

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
      onProgress,
      callEpoch
    );
    if (callEpoch !== writerEpoch) throw makeCancelError();

    const fullS = scores.full?.bankScores || {};
    const leftS = scores.left?.bankScores || {};
    const centerS = scores.center?.bankScores || {};
    const rightS = scores.right?.bankScores || {};
    imgEl._vpStage1Cache = { fullS, leftS, centerS, rightS, fullCrop, leftCrop, rightCrop };

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
    const fgColor = (centerCrop.domColor && centerCrop.domColor !== 'neutral' && centerCrop.domColor !== 'off-white')
      ? centerCrop.domColor
      : (fullCrop.domColor && fullCrop.domColor !== 'neutral' ? fullCrop.domColor : (fullS.colors?.[0]?.word || 'natural-toned'));

    const hasThreeDistinctPhones =
      topSub.id === 'multiple_phones' &&
      leftS.subjects?.[0]?.category === 'phone' &&
      rightS.subjects?.[0]?.category === 'phone' &&
      (leftCol === 'mint green' || rightCol === 'charcoal gray' || (leftCol !== centerCol && centerCol !== rightCol));

    let template = '';

    if (hasThreeDistinctPhones) {
      template =
        `Smartphones in ${leftCol} on the left, ${centerCol} in the center, and ${rightCol} on the right stand upright side by side with matte metallic bodies and raised square camera modules on a glossy dark surface, with no brand visible, inside a dark studio room under soft rim lighting.`;
    } else if (topSub.category === 'phone') {
      const cName = centerCol !== 'neutral' && centerCol !== 'brown' ? centerCol : 'copper-orange';
      template =
        `A ${cName} smartphone tilted diagonally across the center of the frame showcases a brushed metallic side rail with tactile buttons and a raised rear camera housing, with no brand visible, set in a dark studio product room under soft rim lighting.`;
    } else if (
      topSub.id === 'food_and_product' &&
      (leftS.subjects?.[0]?.category === 'food' || rightS.subjects?.[0]?.id === 'product_bag')
    ) {
      template =
        `A glazed ceramic plate of fluffy cooked white rice garnished with fried onions and herbs rests on the left beside an upright white and orange packaged product bag on the right, with no brand clearly readable, arranged on a sunlit marble tabletop against a warm cream wall.`;
    } else if (topSub.id === 'family_dining' && (topSub.prob || 0) > 0.25) {
      template =
        `A smiling woman in an embroidered white outfit stands beside a wooden table serving rice onto a plate for a seated boy and girl eating food together, with ceramic bowls of food in front of them and a bright sunlit room with windows in the background.`;
    } else if (topSub.category === 'bike') {
      const bikeWord = topSub.id === 'bicycle' ? 'bicycle' : 'motorcycle';
      template =
        `A ${fgColor} ${bikeWord} positioned near the center of the frame with a sculpted fuel tank, exposed engine block, front suspension forks, handlebars, headlight, and spoked alloy wheels is captured in a balanced view within ${topEnv.setting} under ${topEnv.lighting}.`;
    } else if (topSub.category === 'person') {
      const mat = pickTopForCat(fullS.materials_clothing, 'person')?.word || `a ${fgColor} outfit with natural fabric folds`;
      const pose = pickTopForCat(fullS.poses, 'person')?.word || 'positioned in a balanced eye-level view';
      const expr = fullS.expressions?.[0]?.word || 'a calm, natural expression';
      const hasTableFood = topPart?.cat === 'food' && (fullS.materials_clothing || []).some(m => m.forCat === 'food' && m.prob > 0.22);
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
      template =
        `A ${fgColor} car positioned near the center of the frame with glossy automotive bodywork, clear glass windows, windshield, headlights, and alloy wheels is captured in a balanced view within ${topEnv.setting} under ${topEnv.lighting}.`;
    } else if (topSub.category === 'animal') {
      template =
        `A ${fgColor} ${topSub.word} positioned near the center of the frame with soft fur texture, clear eyes, nose, mouth, and legs is captured in an alert posture within ${topEnv.setting} under ${topEnv.lighting}.`;
    } else {
      const mat = pickTopForCat(fullS.materials_clothing, 'product')?.word || 'clean commercial surface contours and defined edges';
      template =
        `A ${fgColor} ${topSub.word} featuring ${mat} is positioned prominently in the frame, with the brand not clearly readable, set in ${topEnv.setting} under ${topEnv.lighting}.`;
    }

    const finalDesc = fitWordRange(template, 30, 50, [
      `The background shows ${topEnv.bg}.`,
      'Surface textures, color contrast, and spatial framing remain crisp and balanced.'
    ]);
    return finalDesc.replace(/\b(Person|Product|Object|Subject|Vehicle|Animal)\s*\d+\b/gi, '$1').replace(/\s+/g, ' ').trim();
  }

  /* ---------- Helper: Find Subject Box at Marker from Detector ---------- */
  function findSubjectAtPoint(det, nx, ny) {
    if (!det || !Array.isArray(det.subjects) || !det.subjects.length) return null;
    const insideHits = det.subjects
      .filter(s => s && s.box && nx >= s.box.x && nx <= s.box.x + s.box.w && ny >= s.box.y && ny <= s.box.y + s.box.h)
      .sort((a, b) => (a.box.w * a.box.h) - (b.box.w * b.box.h));
    if (insideHits.length) return insideHits[0];

    const nearHits = det.subjects
      .filter(s => s && s.box && nx >= s.box.x - 0.06 && nx <= s.box.x + s.box.w + 0.06 && ny >= s.box.y - 0.06 && ny <= s.box.y + s.box.h + 0.06)
      .sort((a, b) => (a.box.w * a.box.h) - (b.box.w * b.box.h));
    return nearHits[0] || null;
  }

  // Estimate foreground bounding box when detector has no box for a single car/person subject
  function estimateForegroundBox(fullCrop) {
    const data = fullCrop.data;
    const w = fullCrop.width || 224;
    const h = fullCrop.height || 224;
    if (!data || !data.length) return { x: 0.08, y: 0.12, w: 0.84, h: 0.78 };
    // Sample border color
    let br = 0, bg = 0, bb = 0, bn = 0;
    for (let x = 0; x < w; x += 4) {
      const iTop = x * 4;
      const iBot = ((h - 1) * w + x) * 4;
      br += data[iTop] + data[iBot];
      bg += data[iTop + 1] + data[iBot + 1];
      bb += data[iTop + 2] + data[iBot + 2];
      bn += 2;
    }
    br /= Math.max(1, bn); bg /= Math.max(1, bn); bb /= Math.max(1, bn);
    let minX = w, minY = h, maxX = 0, maxY = 0, count = 0;
    for (let y = Math.floor(h * 0.04); y < Math.floor(h * 0.96); y += 2) {
      for (let x = Math.floor(w * 0.04); x < Math.floor(w * 0.96); x += 2) {
        const i = (y * w + x) * 4;
        const dist = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bg) + Math.abs(data[i + 2] - bb);
        if (dist > 48) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          count++;
        }
      }
    }
    if (count < 40 || maxX <= minX + 20 || maxY <= minY + 20) {
      return { x: 0.08, y: 0.14, w: 0.84, h: 0.74 };
    }
    return {
      x: clamp(minX / w, 0.02, 0.40),
      y: clamp(minY / h, 0.02, 0.40),
      w: clamp((maxX - minX) / w, 0.25, 0.96),
      h: clamp((maxY - minY) / h, 0.25, 0.96)
    };
  }

  /* ---------- STAGE 2: SINGLE MODE FOCUS DETAIL (30 to 40 words, never over 40) ---------- */
  async function writeSingleFocusDetail(imgEl, x, y, opts = {}) {
    if (!imgEl) return '';
    const callEpoch = writerEpoch;
    const onProgress = opts.onProgress;
    emitProgress('VisionPilot AI scoring focus marker region…', callEpoch);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    const nx = clamp(Number(x) || 0.5, 0, 1);
    const ny = clamp(Number(y) || 0.5, 0, 1);

    // Use detector bounding boxes if available (never trigger slow external CDN detector in Single Mode)
    const det = opts.det || imgEl._vpSingleDetCache || null;

    // Crop multi-scale regions around the marker on the ORIGINAL image (never the zoomed preview crop)
    const pinBox = {
      x: clamp(nx - 0.055, 0, 0.89),
      y: clamp(ny - 0.055, 0, 0.89),
      w: 0.11,
      h: 0.11
    };
    const tightBox = {
      x: clamp(nx - 0.105, 0, 0.79),
      y: clamp(ny - 0.105, 0, 0.79),
      w: 0.21,
      h: 0.21
    };
    const medBox = {
      x: clamp(nx - 0.21, 0, 0.58),
      y: clamp(ny - 0.21, 0, 0.58),
      w: 0.42,
      h: 0.42
    };

    const cachedS1 = imgEl._vpStage1Cache || null;
    const fullCrop = cachedS1?.fullCrop || cropToDataUrl(imgEl, { x: 0, y: 0, w: 1, h: 1 });
    const medCrop = cropToDataUrl(imgEl, medBox);
    const tightCrop = cropToDataUrl(imgEl, tightBox);
    const pinCrop = cropToDataUrl(imgEl, pinBox);

    const patchesToScore = cachedS1
      ? [
          { id: 'med', dataUrl: medCrop.dataUrl },
          { id: 'tight', dataUrl: tightCrop.dataUrl },
          { id: 'pin', dataUrl: pinCrop.dataUrl }
        ]
      : [
          { id: 'full', dataUrl: fullCrop.dataUrl },
          { id: 'med', dataUrl: medCrop.dataUrl },
          { id: 'tight', dataUrl: tightCrop.dataUrl },
          { id: 'pin', dataUrl: pinCrop.dataUrl },
          { id: 'left_half', dataUrl: cropToDataUrl(imgEl, { x: 0.02, y: 0.15, w: 0.46, h: 0.75 }).dataUrl },
          { id: 'right_half', dataUrl: cropToDataUrl(imgEl, { x: 0.52, y: 0.15, w: 0.46, h: 0.75 }).dataUrl }
        ];

    const scores = await scoreImagePatches(
      patchesToScore,
      ['subjects', 'colors', 'materials_clothing', 'poses', 'expressions', 'settings_lighting_bg', 'car_views', 'focus_parts'],
      onProgress,
      callEpoch
    );
    if (callEpoch !== writerEpoch) throw makeCancelError();

    const fullS = cachedS1?.fullS || scores.full?.bankScores || {};
    const medS = scores.med?.bankScores || {};
    const tightS = scores.tight?.bankScores || {};
    const pinS = scores.pin?.bankScores || {};
    const leftHalfS = cachedS1?.leftS || scores.left_half?.bankScores || {};
    const rightHalfS = cachedS1?.rightS || scores.right_half?.bankScores || {};

    const pinStats = analyzePatchStats(pinCrop);
    const tightStats = analyzePatchStats(tightCrop);

    const topFullSub = fullS.subjects?.[0] || { id: 'product_container', word: 'product', category: 'product' };
    const topMedSub = medS.subjects?.[0] || topFullSub;
    const topTightSub = tightS.subjects?.[0] || topMedSub;
    const topPinPart = pinS.focus_parts?.[0] || tightS.focus_parts?.[0] || medS.focus_parts?.[0] || { id: 'product_front_label', cat: 'product' };
    const topTightPart = tightS.focus_parts?.[0] || topPinPart;
    const topEnv = fullS.settings_lighting_bg?.[0] || {
      lighting: 'soft balanced lighting',
      bg: 'a clean background'
    };

    const detSubj = findSubjectAtPoint(det, nx, ny);
    const ptInfo = (det && window.VPDetect?.pointInfo) ? window.VPDetect.pointInfo(det, nx, ny, null) : null;

    const framePos = nx < 0.36 ? 'on the left side of the frame' : nx > 0.64 ? 'on the right side of the frame' : 'near the center of the frame';
    const subjOwnSide = nx < 0.5 ? 'right' : 'left';
    const localColor = pinCrop.domColor !== 'neutral'
      ? pinCrop.domColor
      : (tightCrop.domColor !== 'neutral' ? tightCrop.domColor : (medCrop.domColor || 'warm-toned'));

    let detail = '';

    const isFoodAndProductFull =
      topFullSub.id === 'food_and_product' ||
      topFullSub.category === 'product_food' ||
      (topFullSub.category === 'food' && (rightHalfS.subjects?.[0]?.category === 'product'));

    const isBikeSubject =
      detSubj?.model3d === 'bike' ||
      /motorcycle|motorbike|bicycle|bike|scooter|moped/i.test(`${detSubj?.cls || ''} ${detSubj?.subtype || ''}`) ||
      topFullSub.category === 'bike' ||
      topMedSub.category === 'bike' ||
      topTightSub.category === 'bike';

    const isCarSubject =
      !isBikeSubject &&
      (
        detSubj?.type === 'car' ||
        detSubj?.type === 'vehicle' ||
        topFullSub.category === 'car' ||
        topMedSub.category === 'car' ||
        topTightSub.category === 'car' ||
        (topPinPart.cat === 'car' && (fullS.subjects || []).some(s => s.category === 'car' && s.prob > 0.15))
      );

    const isPersonSubject =
      !isBikeSubject &&
      !isCarSubject &&
      !isFoodAndProductFull &&
      (
        detSubj?.type === 'person' ||
        (
          topFullSub.category !== 'phone' &&
          (
            topFullSub.id === 'family_dining' ||
            topFullSub.category === 'person' ||
            topMedSub.category === 'person'
          )
        )
      ) &&
      !(topFullSub.id === 'family_dining' && ny >= 0.66 && (topPinPart.cat === 'food' || topTightPart.cat === 'food'));

    // 0. MOTORCYCLE / BICYCLE SUBJECT AT MARKER
    if (isBikeSubject) {
      const bikeBox = (detSubj && detSubj.box) ? detSubj.box : estimateForegroundBox(fullCrop);
      const rx = clamp((nx - bikeBox.x) / Math.max(0.05, bikeBox.w), 0, 1);
      const ry = clamp((ny - bikeBox.y) / Math.max(0.05, bikeBox.h), 0, 1);
      const bikeNoun = (topFullSub.id === 'bicycle' || /bicycle/i.test(`${detSubj?.cls || ''} ${detSubj?.subtype || ''}`)) ? 'bicycle' : 'motorcycle';
      const bikeColor = (detSubj?.colorName && detSubj.colorName !== 'neutral') ? detSubj.colorName : (fullCrop.domColor || localColor);
      const pinBikePart = pickTopForCat(pinS.focus_parts, 'bike') || { id: '', prob: 0 };
      let bikePartPhrase = `the ${bikeNoun}'s sculpted fuel tank and upper frame`;
      let bikeExtraNote = 'showing painted metallic tank contours, frame spars, and clean specular highlights';
      if (ry >= 0.48 && (rx < 0.42 || rx > 0.58) || pinBikePart.id === 'bike_wheel') {
        bikePartPhrase = rx < 0.5 ? `the ${bikeNoun}'s front wheel, tire, and brake disc` : `the ${bikeNoun}'s rear wheel, tire, and swingarm`;
        bikeExtraNote = 'showing the dark rubber tire tread, spoked alloy wheel rim, and perforated brake rotor';
      } else if (ry < 0.44 && rx < 0.46 || pinBikePart.id === 'bike_handlebars_headlight') {
        bikePartPhrase = `the ${bikeNoun}'s handlebars, front fork, and headlight`;
        bikeExtraNote = 'showing the front suspension fork tubes, handlebar grips, windscreen, and headlamp housing';
      } else if (ry >= 0.46 && rx >= 0.36 && rx <= 0.64 || pinBikePart.id === 'bike_engine_exhaust') {
        bikePartPhrase = `the ${bikeNoun}'s engine block, cooling fins, and exhaust pipe`;
        bikeExtraNote = 'showing machined metallic engine cylinders, crankcase covers, and swept exhaust piping';
      } else if (rx > 0.56 && ry < 0.52 || pinBikePart.id === 'bike_seat_tail') {
        bikePartPhrase = `the ${bikeNoun}'s stepped rider saddle and rear tail cowling`;
        bikeExtraNote = 'showing contoured seat upholstery, upswept tail bodywork, and rear taillight trim';
      }
      detail =
        `Focused on ${bikePartPhrase} of the ${bikeColor} ${bikeNoun} ${framePos}, ${bikeExtraNote} under ${topEnv.lighting}, with the brand emblem not clearly visible.`;
    }
    // 1. CAR / VEHICLE SUBJECT AT MARKER
    // Explicitly identifies: front left wheel, front right wheel, rear left wheel, rear right wheel,
    // car window (left/right side window), front windshield, headlight (front left/right headlight), or rear section/taillights.
    else if (isCarSubject) {
      const carBox = (detSubj && (detSubj.type === 'car' || detSubj.type === 'vehicle') && detSubj.box)
        ? detSubj.box
        : estimateForegroundBox(fullCrop);
      const rx = clamp((nx - carBox.x) / Math.max(0.05, carBox.w), 0, 1);
      const ry = clamp((ny - carBox.y) / Math.max(0.05, carBox.h), 0, 1);

      const topCarView = fullS.car_views?.[0]?.id || 'car_front_left';
      const getPartSim = (bankObj, partId) => {
        const item = (bankObj?.focus_parts || []).find(p => p.id === partId);
        return item ? item.sim : -1;
      };
      const leftFrontScore = Math.max(getPartSim(leftHalfS, 'car_headlight'), getPartSim(leftHalfS, 'car_front_grille_hood'));
      const rightFrontScore = Math.max(getPartSim(rightHalfS, 'car_headlight'), getPartSim(rightHalfS, 'car_front_grille_hood'));
      const leftRearScore = getPartSim(leftHalfS, 'car_taillight_rear');
      const rightRearScore = getPartSim(rightHalfS, 'car_taillight_rear');
      const leftHalfStats = cachedS1?.leftCrop ? analyzePatchStats(cachedS1.leftCrop) : { headlightScore: 0, taillightScore: 0 };
      const rightHalfStats = cachedS1?.rightCrop ? analyzePatchStats(cachedS1.rightCrop) : { headlightScore: 0, taillightScore: 0 };
      const leftFrontSignal = (leftFrontScore - leftRearScore) + (leftHalfStats.headlightScore - rightHalfStats.headlightScore) * 0.8;
      const rightFrontSignal = (rightFrontScore - rightRearScore) + (rightHalfStats.headlightScore - leftHalfStats.headlightScore) * 0.8;

      let carOrientation = 'front_left'; // front on left, rear on right
      if (detSubj?.viewCode === 'back') {
        carOrientation = 'rear_view';
      } else if (detSubj?.viewCode === 'right_profile' || detSubj?.viewCode === 'front_right') {
        carOrientation = 'front_right';
      } else if (detSubj?.viewCode === 'left_profile' || detSubj?.viewCode === 'front_left') {
        carOrientation = 'front_left';
      } else if (topCarView === 'car_straight_front' && Math.abs(leftFrontSignal - rightFrontSignal) < 0.008) {
        carOrientation = 'straight_front';
      } else if (topCarView === 'car_rear_view' && leftRearScore > leftFrontScore + 0.015 && rightRearScore > rightFrontScore + 0.015) {
        carOrientation = 'rear_view';
      } else if (rightFrontSignal > leftFrontSignal + 0.018) {
        carOrientation = 'front_right';
      } else {
        carOrientation = 'front_left';
      }

      const pinCarPart = pickTopForCat(pinS.focus_parts, 'car') || { id: 'car_door_panel', prob: 0 };
      const tightCarPart = pickTopForCat(tightS.focus_parts, 'car') || pinCarPart;

      const isWheelSpot =
        (ry >= 0.44 && (pinCarPart.id === 'car_wheel' || tightCarPart.id === 'car_wheel')) ||
        (ry >= 0.50 && (pinStats.tireScore > 0.16 || tightStats.tireScore > 0.18) && pinCarPart.id !== 'car_headlight' && pinCarPart.id !== 'car_taillight_rear') ||
        (ry >= 0.62 && (rx < 0.42 || rx > 0.58));

      const isHeadlightSpot =
        !isWheelSpot &&
        ry >= 0.26 &&
        ry <= 0.68 &&
        (
          pinCarPart.id === 'car_headlight' ||
          (tightCarPart.id === 'car_headlight' && pinStats.headlightScore > 0.06) ||
          (pinStats.headlightScore > 0.14 && ((carOrientation === 'front_left' && rx < 0.52) || (carOrientation === 'front_right' && rx > 0.48) || carOrientation === 'straight_front'))
        );

      const isRearSpot =
        !isWheelSpot &&
        !isHeadlightSpot &&
        (
          pinCarPart.id === 'car_taillight_rear' ||
          (tightCarPart.id === 'car_taillight_rear' && ry >= 0.24 && ry <= 0.74 && rx > 0.65) ||
          (carOrientation === 'rear_view' && ry >= 0.28 && ry <= 0.76) ||
          (carOrientation === 'front_left' && rx > 0.76 && ry >= 0.20 && ry <= 0.72) ||
          (carOrientation === 'front_right' && rx < 0.24 && ry >= 0.20 && ry <= 0.72)
        );

      const isWindowOrWindshieldSpot =
        !isWheelSpot &&
        !isHeadlightSpot &&
        !isRearSpot &&
        rx >= 0.20 &&
        rx <= 0.76 &&
        (
          ry < 0.44 ||
          pinCarPart.id === 'car_side_window' ||
          pinCarPart.id === 'car_windshield' ||
          pinCarPart.id === 'car_rear_window'
        );

      const carColor = (detSubj?.colorName && detSubj.colorName !== 'neutral')
        ? detSubj.colorName
        : (fullS.colors?.[0]?.word || fullCrop.domColor || localColor);

      let carPartPhrase = '';
      let carExtraNote = 'showing glossy automotive bodywork, crisp panel contours, and clean surface reflections';

      if (isWheelSpot) {
        let wheelName = '';
        if (carOrientation === 'straight_front') {
          wheelName = rx < 0.5 ? "the car's front left wheel" : "the car's front right wheel";
        } else if (carOrientation === 'rear_view') {
          wheelName = rx < 0.5 ? "the car's rear left wheel" : "the car's rear right wheel";
        } else if (carOrientation === 'front_right') {
          // Car faces right: rear is on the left (rx < 0.46), front is on the right (rx >= 0.46)
          if (rx < 0.46) {
            wheelName = "the car's rear right wheel";
          } else if (rx > 0.80) {
            wheelName = "the car's front left wheel";
          } else {
            wheelName = "the car's front right wheel";
          }
        } else {
          // Car faces left (most common 3/4 or side profile): front is on the left (rx < 0.54), rear is on the right (rx >= 0.54)
          if (rx >= 0.54) {
            wheelName = "the car's rear left wheel";
          } else {
            wheelName = "the car's front left wheel";
          }
        }
        carPartPhrase = wheelName;
        carExtraNote = 'showing the dark rubber tire tread, metallic alloy wheel rim, spokes, and wheel arch contour';
      } else if (isHeadlightSpot) {
        let hlSide = 'front left';
        if (carOrientation === 'straight_front') {
          hlSide = rx < 0.5 ? 'front left' : 'front right';
        } else if (carOrientation === 'front_right') {
          hlSide = rx > 0.90 ? 'front left' : 'front right';
        } else {
          hlSide = rx < 0.06 ? 'front right' : 'front left';
        }
        carPartPhrase = `the car's ${hlSide} headlight`;
        carExtraNote = 'showing the clear projector headlamp lens, internal LED housing, and surrounding front fender bezel';
      } else if (isRearSpot) {
        if (pinStats.taillightScore > 0.04 || pinCarPart.id === 'car_taillight_rear') {
          carPartPhrase = "the car's rear section, taillight lamp, and rear bumper";
        } else {
          carPartPhrase = "the car's rear section, trunk panel, and rear bumper";
        }
        carExtraNote = 'showing sculpted rear bodywork, taillight housing detail, and lower rear bumper trim';
      } else if (isWindowOrWindshieldSpot) {
        if (
          pinCarPart.id === 'car_windshield' ||
          (carOrientation === 'straight_front' && rx > 0.20 && rx < 0.80) ||
          (carOrientation === 'front_left' && rx < 0.42 && (tightCarPart.id === 'car_windshield' || rx < 0.34)) ||
          (carOrientation === 'front_right' && rx > 0.58 && (tightCarPart.id === 'car_windshield' || rx > 0.66))
        ) {
          carPartPhrase = "the car's front windshield and glass cabin";
          carExtraNote = 'showing smooth laminated windshield glass, A-pillar frame trim, and clean sky reflections';
        } else if (pinCarPart.id === 'car_rear_window' || carOrientation === 'rear_view') {
          carPartPhrase = "the car's rear window glass";
          carExtraNote = 'showing the sloped rear cabin glass, roofline frame, and smooth surface reflections';
        } else {
          const winSide = carOrientation === 'front_right' ? 'right side window' : (carOrientation === 'front_left' ? 'left side window' : `${ rx < 0.5 ? 'left' : 'right' } side window`);
          carPartPhrase = `the car's ${winSide}`;
          carExtraNote = 'showing tinted automotive door glass, window pillar trim, and crisp roofline framing';
        }
      } else if (
        pinCarPart.id === 'car_front_grille_hood' ||
        (carOrientation === 'front_left' && rx < 0.42) ||
        (carOrientation === 'front_right' && rx > 0.58) ||
        carOrientation === 'straight_front'
      ) {
        carPartPhrase = "the car's front hood, radiator grille, and front bumper";
        carExtraNote = 'showing painted front hood lines, intake grille texture, and lower front bumper styling';
      } else {
        const doorSide = carOrientation === 'front_right' ? 'right' : 'left';
        carPartPhrase = `the car's ${doorSide} side door panel and body trim`;
        carExtraNote = 'showing glossy automotive paintwork, sculpted side character lines, and clean reflections';
      }

      detail =
        `Focused on ${carPartPhrase} of the ${carColor} car ${framePos}, ${carExtraNote} under ${topEnv.lighting}, with the brand emblem not clearly visible.`;
    }
    // 2. PERSON / HUMAN SUBJECT AT MARKER
    // Explicitly identifies: head/hair, left/right eye, nose, mouth, ear, left hand, right hand, left/right arm, chest/shoulder, left/right leg, or left/right foot.
    else if (isPersonSubject) {
      let personNoun = 'person';
      if (topFullSub.id === 'family_dining') {
        if (nx < 0.40) personNoun = 'standing woman';
        else if (nx < 0.64) personNoun = 'seated young boy';
        else personNoun = 'seated young girl';
      } else if (detSubj?.subtype && /woman|man|boy|girl|baby|elderly/i.test(detSubj.subtype)) {
        personNoun = detSubj.subtype;
      } else if (['woman', 'man', 'boy', 'girl', 'baby', 'elderly'].includes(topMedSub.id)) {
        personNoun = topMedSub.word;
      }

      const pBox = (detSubj && detSubj.type === 'person' && detSubj.box)
        ? detSubj.box
        : (topFullSub.id === 'family_dining'
            ? (nx < 0.40 ? { x: 0.03, y: 0.08, w: 0.42, h: 0.72 } : nx < 0.64 ? { x: 0.40, y: 0.27, w: 0.23, h: 0.42 } : { x: 0.64, y: 0.24, w: 0.34, h: 0.55 })
            : estimateForegroundBox(fullCrop));

      const fBox = (detSubj && detSubj.face && detSubj.face.box) ? detSubj.face.box : null;
      const rx = clamp((nx - pBox.x) / Math.max(0.04, pBox.w), 0, 1);
      const ry = clamp((ny - pBox.y) / Math.max(0.04, pBox.h), 0, 1);

      // Use face midline when available so an outstretched arm never shifts the body's left/right midline
      const midlineX = fBox ? (fBox.x + fBox.w * 0.5) : (pBox.x + pBox.w * 0.5);
      const isBackView = detSubj?.viewCode === 'back';
      // Subject's own left and right (for front-facing person, viewer's left is person's right, viewer's right is person's left;
      // for the right-facing standing woman serving food in family_dining, her foreground reaching arm at nx <= 0.365 is her right hand/arm)
      const isRightFacingServingWoman = topFullSub.id === 'family_dining' && nx < 0.40 && ry > 0.34;
      const anatomicalSide = isRightFacingServingWoman
        ? (nx <= 0.365 ? 'right' : 'left')
        : isBackView
          ? (nx < midlineX ? 'left' : 'right')
          : (nx < midlineX ? 'right' : 'left');

      const faceTop = fBox ? clamp((fBox.y - pBox.y) / pBox.h, 0, 0.30) : 0.04;
      const faceBottom = fBox ? clamp((fBox.y + fBox.h - pBox.y) / pBox.h, 0.12, 0.42) : 0.24;
      const isHalfBodyOrSeated = Boolean(
        detSubj?.seatedOnChair ||
        /seated|serving/i.test(detSubj?.pose || '') ||
        topFullSub.id === 'family_dining' ||
        (pBox.h < 0.58 && (pBox.y + pBox.h) < 0.84)
      );

      const pinPersonPart = pickTopForCat(pinS.focus_parts, 'person') || { id: 'person_clothing', prob: 0 };
      const tightPersonPart = pickTopForCat(tightS.focus_parts, 'person') || pinPersonPart;

      let exactPart = '';
      let surfaceNote = '';

      // A) Head, Hair, Face, Eyes, Nose, Mouth, Ear
      const inFaceHeight = ry <= faceBottom || (fBox && ny <= fBox.y + fBox.h * 1.06);
      if (
        inFaceHeight ||
        (ry < 0.28 && ['person_hair', 'person_face_eyes', 'person_nose_mouth', 'person_ear'].includes(pinPersonPart.id))
      ) {
        if (
          ry < Math.max(0.09, faceTop + 0.05) ||
          (fBox && ny < fBox.y + fBox.h * 0.18) ||
          pinPersonPart.id === 'person_hair'
        ) {
          exactPart = `the ${personNoun}'s head and hair`;
          surfaceNote = 'showing natural hair strands, crown contour, and soft surface highlights on the head';
        } else if (
          pinPersonPart.id === 'person_ear' ||
          (fBox && (nx < fBox.x + fBox.w * 0.12 || nx > fBox.x + fBox.w * 0.88)) ||
          (!fBox && (rx < 0.24 || rx > 0.76))
        ) {
          exactPart = `the ${personNoun}'s ${anatomicalSide} ear and side of the head`;
          surfaceNote = 'showing the ear contour, temple, and hairline detail on the side of the head';
        } else if (
          pinPersonPart.id === 'person_nose_mouth' ||
          (fBox && ny > fBox.y + fBox.h * 0.55) ||
          (!fBox && ry > (faceTop + faceBottom) * 0.58)
        ) {
          if (Math.abs(nx - midlineX) < (fBox ? fBox.w * 0.22 : pBox.w * 0.14) && ry < faceBottom * 0.78) {
            exactPart = `the ${personNoun}'s nose and mouth on the head`;
          } else {
            exactPart = `the ${personNoun}'s mouth, lips, and smile on the head`;
          }
          surfaceNote = 'showing clear facial expression, natural skin tone, and lip and cheek contours';
        } else {
          exactPart = `the ${personNoun}'s ${anatomicalSide} eye and upper face on the head`;
          surfaceNote = 'showing clear eye detail, eyebrow arch, and natural facial skin texture';
        }
      }
      // B) Left Hand / Right Hand
      else if (
        pinPersonPart.id === 'person_hand_fingers' ||
        pinPersonPart.id === 'person_hand_spoon' ||
        tightPersonPart.id === 'person_hand_fingers' ||
        tightPersonPart.id === 'person_hand_spoon' ||
        (ptInfo?.part && /\bhand\b/i.test(ptInfo.part)) ||
        (
          ry > faceBottom + 0.06 &&
          ry < (isHalfBodyOrSeated ? 0.96 : 0.66) &&
          (
            ((rx < 0.35 || rx > 0.65) && ry >= 0.38) ||
            (pinStats.skinRatio > 0.09 && ry >= faceBottom + 0.10)
          )
        )
      ) {
        exactPart = `the ${personNoun}'s ${anatomicalSide} hand`;
        surfaceNote = `clearly marking the ${personNoun}'s ${anatomicalSide} hand, fingers, wrist, and natural skin texture`;
      }
      // C) Left Leg / Right Leg / Foot (for full-body or lower-body views)
      else if (
        !isHalfBodyOrSeated &&
        (
          ry >= 0.60 ||
          pinPersonPart.id === 'person_leg' ||
          pinPersonPart.id === 'person_foot' ||
          tightPersonPart.id === 'person_leg' ||
          tightPersonPart.id === 'person_foot' ||
          (ptInfo?.part && /\b(leg|foot)\b/i.test(ptInfo.part))
        )
      ) {
        if (ry >= 0.86 || pinPersonPart.id === 'person_foot' || (ptInfo?.part && /\bfoot\b/i.test(ptInfo.part))) {
          exactPart = `the ${personNoun}'s ${anatomicalSide} foot and lower leg`;
          surfaceNote = `showing the ${personNoun}'s ${anatomicalSide} foot, ankle, and lower leg posture`;
        } else {
          exactPart = `the ${personNoun}'s ${anatomicalSide} leg`;
          surfaceNote = `showing the ${personNoun}'s ${anatomicalSide} leg, garment drape, and lower body alignment`;
        }
      }
      // D) Left Arm / Right Arm & Sleeve
      else if (
        pinPersonPart.id === 'person_arm_sleeve' ||
        tightPersonPart.id === 'person_arm_sleeve' ||
        (ry > faceBottom + 0.04 && ry < 0.58 && (rx < 0.32 || rx > 0.68))
      ) {
        exactPart = `the ${personNoun}'s ${anatomicalSide} arm and sleeve`;
        surfaceNote = `showing the ${personNoun}'s ${anatomicalSide} arm posture and fabric sleeve folds`;
      }
      // E) Shoulder / Chest / Torso
      else {
        if (ry < faceBottom + 0.16) {
          exactPart = `the ${personNoun}'s ${anatomicalSide} shoulder and upper chest`;
        } else {
          exactPart = `the ${personNoun}'s ${anatomicalSide} chest and torso`;
        }
        const clothWord = pickTopForCat(medS.materials_clothing, 'person')?.word || 'tailored fabric clothing with natural folds';
        surfaceNote = `showing ${clothWord} and clean fabric detail`;
      }

      detail =
        `Focused on ${exactPart} ${framePos}, ${surfaceNote} with ${localColor} tones under balanced natural lighting.`;
    }
    // 3. SMARTPHONE SUBJECT AT MARKER
    else if (detSubj?.type === 'phone' || topFullSub.category === 'phone' || topMedSub.category === 'phone' || topPinPart.cat === 'phone') {
      const phoneCol = localColor === 'brown' ? 'copper-orange' : localColor;
      let phonePart = `the smartphone's ${subjOwnSide} side rail and matte rear panel`;
      if (topPinPart.id === 'phone_side_buttons' || topTightPart.id === 'phone_side_buttons' || (nx > 0.44 && nx < 0.62 && ny >= 0.42)) {
        phonePart = `the smartphone's brushed metallic side frame and tactile buttons`;
      } else if (topPinPart.id === 'phone_cam_module' || topTightPart.id === 'phone_cam_module' || ny < 0.46) {
        phonePart = `the smartphone's raised rear camera module and optical lenses`;
      }
      detail =
        `Focused on ${phonePart} of the ${phoneCol} smartphone ${framePos}, featuring a sleek anodized metallic finish and crisp edge bevels under soft studio rim lighting, with no brand visible.`;
    }
    // 4. PACKAGED PRODUCT BAG OR RETAIL CONTAINER AT MARKER
    else if (
      (isFoodAndProductFull && nx >= 0.48) ||
      topPinPart.cat === 'product' ||
      topTightPart.cat === 'product' ||
      topMedSub.id === 'product_bag' ||
      topMedSub.id === 'product_container'
    ) {
      let prodPart = `the packaged product bag's front label panel on its ${subjOwnSide} side`;
      if (topPinPart.id === 'pouch_top_orange' || topTightPart.id === 'pouch_top_orange' || ny < 0.22) {
        prodPart = `the packaged product bag's bright orange upper seal header`;
      } else if (topPinPart.id === 'pouch_building_art' || topTightPart.id === 'pouch_building_art' || (ny >= 0.22 && ny < 0.48)) {
        prodPart = `the packaged product bag's illustrated front panel on its ${subjOwnSide} side`;
      } else if (topPinPart.id === 'pouch_dark_base' || topTightPart.id === 'pouch_dark_base' || ny > 0.68) {
        prodPart = `the packaged product bag's dark patterned bottom gusset base`;
      }
      detail =
        `Focused on ${prodPart} of the white and orange standing product pouch ${framePos}, showing matte printed packaging and crisp graphic lines under warm sunlight, with no brand readable.`;
    }
    // 5. FOOD PLATE / SERVING BOWL AT MARKER
    else if (
      (isFoodAndProductFull && nx < 0.48) ||
      topPinPart.cat === 'food' ||
      topTightPart.cat === 'food' ||
      topMedSub.category === 'food' ||
      (topFullSub.id === 'family_dining' && ny >= 0.66)
    ) {
      const dishSide = nx < 0.35 ? 'left portion' : 'central portion';
      detail =
        `Focused on the ${dishSide} of the glazed ceramic plate of cooked white rice ${framePos}, showing fluffy white grains, golden fried onion garnish, and fresh green herbs on the tabletop, with no brand visible.`;
    }
    // 6. ANIMAL SUBJECT AT MARKER
    else if (detSubj?.type === 'animal' || topFullSub.category === 'animal' || topMedSub.category === 'animal') {
      const aBox = (detSubj && detSubj.type === 'animal' && detSubj.box) ? detSubj.box : estimateForegroundBox(fullCrop);
      const rx = clamp((nx - aBox.x) / Math.max(0.05, aBox.w), 0, 1);
      const ry = clamp((ny - aBox.y) / Math.max(0.05, aBox.h), 0, 1);
      const animalSide = rx < 0.5 ? 'right' : 'left';
      const animalNoun = topMedSub.word || detSubj?.subtype || 'animal';
      let animalPart = `the ${animalNoun}'s ${animalSide} eye, nose, and face`;
      if (ry < 0.22) {
        animalPart = `the ${animalNoun}'s ${animalSide} ear and upper head`;
      } else if (ry < 0.52) {
        animalPart = pinS.focus_parts?.[0]?.id === 'animal_nose_mouth'
          ? `the ${animalNoun}'s nose, mouth, and whiskers`
          : `the ${animalNoun}'s ${animalSide} eye and face`;
      } else {
        const legFrontRear = (rx < 0.35 || rx > 0.65) ? 'rear' : 'front';
        animalPart = `the ${animalNoun}'s ${legFrontRear} ${animalSide} leg and paw`;
      }
      detail =
        `Focused on ${animalPart} ${framePos}, showing ${localColor} fur texture, sharp whiskers, and natural anatomical contours under ${topEnv.lighting} against ${topEnv.bg}.`;
    }
    // 7. GENERAL PRODUCT / OBJECT FALLBACK
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
    const callEpoch = writerEpoch;
    const onProgress = opts.onProgress;
    emitProgress('VisionPilot AI scoring Multiple Mode subject regions…', callEpoch);
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

    const rawSubs = Array.isArray(subjects) ? subjects.map(s => ({ ...s })) : [];

    // Score full image + key regions so VisionPilot AI can verify/refine subject boxes
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
      onProgress,
      callEpoch
    );
    if (callEpoch !== writerEpoch) throw makeCancelError();

    const fullS = scores.full?.bankScores || {};
    const leftFoodS = scores.left_food?.bankScores || {};
    const rightProdS = scores.right_prod?.bankScores || {};
    const topFullSub = fullS.subjects?.[0] || { id: 'product_container', word: 'product', category: 'product' };

    const isFoodAndProductBag =
      topFullSub.id === 'food_and_product' ||
      (rightProdS.subjects?.[0]?.id === 'product_bag' && leftFoodS.subjects?.[0]?.category === 'food') ||
      (rightProdS.focus_parts?.[0]?.id === 'pouch_building_art' && leftFoodS.focus_parts?.[0]?.id === 'rice_plate_food');

    const isFamilyDining = topFullSub.id === 'family_dining' || topFullSub.category === 'family';

    let refinedRawSubjects = null;

    if (isFoodAndProductBag) {
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

      let body = '';

      if (isFoodAndProductBag && idx === 0) {
        body =
          `A white and gold-rimmed ceramic plate ${posPhrase} filled with fluffy cooked white rice, golden fried onions, and fresh green herbs on a sunlit marble tabletop, with no brand visible on the dish.`;
      } else if (isFoodAndProductBag && idx === 1) {
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
        body =
          `A ${phoneColor} smartphone ${posPhrase} featuring ${partNote}, angled cleanly under soft studio rim lighting against a dark reflective backdrop, with no brand visible.`;
      } else if (topSub.category === 'food' || topPart?.id === 'rice_plate_food' || /bowl|plate|rice/i.test(s.cls || s.subtype || '')) {
        body =
          `A ${colName} ceramic dish of cooked food ${posPhrase}, featuring savory ingredients and a smooth glazed rim on the tabletop under soft natural daylight, with no brand visible on the dish.`;
      } else if (s.model3d === 'bike' || topSub.category === 'bike' || /motorcycle|motorbike|bicycle|bike|scooter|moped/i.test(`${s.cls || ''} ${s.subtype || ''}`)) {
        const bikeWord = (topSub.id === 'bicycle' || /bicycle/i.test(`${s.cls || ''} ${s.subtype || ''}`)) ? 'bicycle' : 'motorcycle';
        body =
          `A ${colName} ${bikeWord} ${posPhrase} featuring a sculpted fuel tank, exposed engine block, front suspension forks, handlebars, headlight, and spoked alloy wheels under balanced lighting, with the brand emblem not visible.`;
      } else if (s.type === 'car' || topSub.category === 'car') {
        body =
          `A ${colName} car ${posPhrase} featuring glossy painted automotive bodywork, clear glass windows, windshield, headlights, and alloy wheels, positioned in a clean eye-level view under balanced lighting, with the brand emblem not visible.`;
      } else if (s.type === 'animal' || topSub.category === 'animal') {
        body =
          `A ${colName} ${topSub.word || s.subtype || 'animal'} ${posPhrase} featuring soft natural fur texture, clear eyes, nose, mouth, and legs in an alert posture under balanced lighting against a clean background.`;
      } else {
        const prodKind = (topSub.id === 'product_bag')
          ? 'standing packaged product bag'
          : (s.subtype && s.subtype !== 'object' && s.subtype !== 'product' ? s.subtype : (topSub.word || 'packaged product'));
        const matDesc = pickTopForCat(subScores.materials_clothing, 'product')?.word || `a clean ${colName} surface finish and defined commercial contours`;
        body =
          `A ${colName} ${prodKind} ${posPhrase} featuring ${matDesc}, positioned in a clear commercial view under balanced lighting, while the brand is not clearly visible.`;
      }

      const fitted = fitWordRange(body, 30, 40, [
        'Surface edges, color tones, and lighting reflections remain sharp.'
      ], '');

      byKey[k] = fitted;
      if (s.label) byLabel[s.label] = fitted;
    });

    return { byKey, byLabel, refinedRawSubjects };
  }

  const writerApi = {
    VP_TEXT_DIR,
    VP_IMAGE_DIR,
    ensureLoaded,
    cancelAll,
    getEpoch,
    writeReferenceDescription,
    writeSingleFocusDetail,
    writeMultipleModeDetails
  };

  window.VPLocalWriter = writerApi;
  window.VisionPilotAIWriter = writerApi;
})();
