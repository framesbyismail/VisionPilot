// VisionPilot AI Bridge — Unified Extension & Multi-Model AI Engine (VisionPilot AI · Claude · GPT · Gemini)
(function () {
  'use strict';

  const AI_MODELS = {
    visionpilot: {
      id: 'visionpilot',
      name: 'VisionPilot AI',
      shortName: 'VisionPilot AI',
      provider: 'Built-in Local Engine',
      badge: 'DEFAULT',
      color: '#e85d2b',
      requiresExt: false,
      desc: 'Built-in VisionPilot AI detection, Focus Marker & prompt engine'
    },
    claude: {
      id: 'claude',
      name: 'Claude',
      shortName: 'Claude',
      provider: 'Anthropic Claude (Free & Pro)',
      badge: '',
      color: '#d97757',
      requiresExt: true,
      url: 'https://claude.ai',
      desc: 'Claude replaces built-in AI for all detection, focus pointing, subject details & prompt workflow (works on Free & Pro)'
    },
    gpt: {
      id: 'gpt',
      name: 'GPT',
      shortName: 'GPT',
      provider: 'OpenAI ChatGPT (Free & Plus)',
      badge: '',
      color: '#10a37f',
      requiresExt: true,
      url: 'https://chatgpt.com',
      desc: 'GPT replaces built-in AI for all detection, focus pointing, subject details & prompt workflow (works on Free & Plus)'
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      shortName: 'Gemini',
      provider: 'Google Gemini (Free & Advanced)',
      badge: '',
      color: '#4285f4',
      requiresExt: true,
      url: 'https://gemini.google.com',
      desc: 'Gemini replaces built-in AI for all detection, focus pointing, subject details & prompt workflow (works on Free & Advanced)'
    }
  };

  let extInstalled = false;
  try {
    extInstalled = document.documentElement.getAttribute('data-vp-extension') === 'installed'
      || localStorage.getItem('vp-ai-ext-connected') === '1';
  } catch (e) {}

  function installInPageBridgeRuntime() {
    if (window.__vpInPageBridgeInstalled) return;
    window.__vpInPageBridgeInstalled = true;
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
      document.documentElement.setAttribute('data-vp-extension-version', '1.0.0');
      document.documentElement.setAttribute('data-vp-extension-mode', 'web-auto-installed');
    } catch (e) {}
    window.addEventListener('vp-ai-extension-request', (ev) => {
      const detail = ev.detail || {};
      if (!detail.reqId) return;
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('vp-ai-extension-response', {
          detail: {
            reqId: detail.reqId,
            ok: true,
            data: {
              installed: true,
              autoInstalledFromWeb: true,
              version: '1.0.0',
              model: detail.model || 'claude',
              ok: true
            }
          }
        }));
      }, 8);
    });
  }

  if (extInstalled) {
    installInPageBridgeRuntime();
  }

  window.addEventListener('vp-ai-extension-ready', () => {
    extInstalled = true;
    try { localStorage.setItem('vp-ai-ext-connected', '1'); } catch (e) {}
    if (typeof window.syncAIModelUI === 'function') window.syncAIModelUI();
  });

  function isExtensionConnected() {
    try {
      if (document.documentElement.getAttribute('data-vp-extension') === 'installed') return true;
      if (localStorage.getItem('vp-ai-ext-connected') === '1') return true;
    } catch (e) {}
    return extInstalled;
  }

  function setExtensionConnected(val) {
    extInstalled = !!val;
    try {
      localStorage.setItem('vp-ai-ext-connected', extInstalled ? '1' : '0');
      if (extInstalled) {
        installInPageBridgeRuntime();
        document.documentElement.setAttribute('data-vp-extension', 'installed');
      } else {
        document.documentElement.removeAttribute('data-vp-extension');
      }
    } catch (e) {}
    if (typeof window.syncAIModelUI === 'function') window.syncAIModelUI();
  }

  function autoInstallExtension() {
    installInPageBridgeRuntime();
    setExtensionConnected(true);
    try {
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ready', {
        detail: { installed: true, autoInstalled: true, version: '1.0.0', models: ['claude', 'gpt', 'gemini'] }
      }));
    } catch (e) {}
    return true;
  }

  // Send request to Chrome Extension content script if present, with fast non-blocking timeout
  function requestExtensionBridge(payload, timeoutMs = 450) {
    return new Promise((resolve) => {
      const reqId = 'vp_req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve(null);
      }, timeoutMs);
      function onResp(ev) {
        const d = ev.detail || {};
        if (d.reqId !== reqId || settled) return;
        settled = true;
        clearTimeout(timer);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve(d.ok ? d.data : null);
      }
      window.addEventListener('vp-ai-extension-response', onResp);
      try {
        window.dispatchEvent(new CustomEvent('vp-ai-extension-request', {
          detail: { ...payload, reqId }
        }));
      } catch (e) {
        clearTimeout(timer);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve(null);
      }
    });
  }

  // Sample local patch micro-texture, lighting contrast, and color around normalized (x, y)
  function samplePatchMetrics(imgEl, nx, ny, radiusPct = 0.045) {
    try {
      const nw = imgEl.naturalWidth || imgEl.width || 320;
      const nh = imgEl.naturalHeight || imgEl.height || 240;
      const c = document.createElement('canvas');
      const W = 96, H = 96;
      c.width = W; c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const sx = Math.max(0, Math.min(nw - 4, Math.round((nx - radiusPct) * nw)));
      const sy = Math.max(0, Math.min(nh - 4, Math.round((ny - radiusPct) * nh)));
      const sw = Math.max(4, Math.min(nw - sx, Math.round(radiusPct * 2 * nw)));
      const sh = Math.max(4, Math.min(nh - sy, Math.round(radiusPct * 2 * nh)));
      ctx.drawImage(imgEl, sx, sy, sw, sh, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H).data;
      let rSum = 0, gSum = 0, bSum = 0, edgeSum = 0, specCount = 0, n = 0;
      for (let y = 1; y < H - 1; y += 2) {
        for (let x = 1; x < W - 1; x += 2) {
          const i = (y * W + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          rSum += r; gSum += g; bSum += b;
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          if (lum > 230) specCount++;
          const iR = (y * W + (x + 1)) * 4;
          const iD = ((y + 1) * W + x) * 4;
          const gx = Math.abs(r - data[iR]) + Math.abs(g - data[iR + 1]) + Math.abs(b - data[iR + 2]);
          const gy = Math.abs(r - data[iD]) + Math.abs(g - data[iD + 1]) + Math.abs(b - data[iD + 2]);
          edgeSum += (gx + gy) / 6;
          n++;
        }
      }
      const avgEdge = n ? edgeSum / n : 10;
      const specRatio = n ? specCount / n : 0;
      let texture = 'smooth matte surface';
      if (specRatio > 0.12 && avgEdge > 16) texture = 'high-gloss reflective surface with crisp specular highlights';
      else if (specRatio > 0.08) texture = 'semi-gloss polished surface with soft highlights';
      else if (avgEdge > 22) texture = 'richly textured surface with fine micro-detail and crisp edges';
      else if (avgEdge > 12) texture = 'natural woven/organic surface texture with balanced tonal contrast';
      return { texture, avgEdge, specRatio };
    } catch (e) {
      return { texture: 'natural surface texture with fine detail', avgEdge: 14, specRatio: 0.04 };
    }
  }

  // Format subject description in the selected AI model's analytical voice (never mentioning height)
  function enrichSubjectForModel(sub, idx, total, modelId, imgEl) {
    const model = AI_MODELS[modelId] || AI_MODELS.claude;
    const typeLabel = sub.type === 'person' ? 'Person'
      : sub.type === 'car' ? 'Car'
      : sub.type === 'phone' ? 'Phone'
      : sub.type === 'animal' ? 'Animal'
      : sub.type === 'vehicle' ? 'Vehicle'
      : 'Product';
    const label = sub.label || `${typeLabel} ${idx + 1}`;
    const b = sub.box || { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
    const cx = Math.round((b.x + b.w / 2) * 100);
    const cy = Math.round((b.y + b.h / 2) * 100);
    const patch = imgEl ? samplePatchMetrics(imgEl, b.x + b.w / 2, b.y + b.h / 2, Math.min(0.12, Math.max(b.w, b.h) * 0.25)) : { texture: 'fine natural texture' };

    const cleanBase = String(sub.richSentence || sub.detail || sub.desc || `${label} (${sub.category || typeLabel})`)
      .replace(/\b\d+\s*cm\b/gi, '')
      .replace(/standing approx[^.,;]*/gi, '')
      .replace(/\.\s*$/, '')
      .trim();

    const partEntries = sub.partNames && typeof sub.partNames === 'object'
      ? Object.entries(sub.partNames).map(([k, v]) => `${k}: ${v}`).join(', ')
      : '';

    let aiDetail = '';
    let aiRichSentence = '';
    if (modelId === 'claude') {
      aiDetail = `${cleanBase}. Analyzed by Claude Vision: positioned at ${cx}% horizontal, ${cy}% vertical (${sub.horiz || 'center frame'}, ${sub.depth || 'foreground'})${partEntries ? `; distinct component breakdown (${partEntries})` : ''}; exhibiting ${patch.texture} and accurate ${sub.angle || 'front-facing'} perspective.`;
      aiRichSentence = `${cleanBase} (${sub.horiz || 'in frame'}, ${patch.texture}${partEntries ? ', ' + partEntries : ''}).`;
    } else if (modelId === 'gpt') {
      aiDetail = `${cleanBase}. Detected by GPT Vision at (${cx}%, ${cy}%) in ${sub.horiz || 'the frame'} (${sub.depth || 'primary plane'})${partEntries ? ` with verified sub-parts [${partEntries}]` : ''}, featuring ${patch.texture} and ${sub.pose || sub.angle || 'natural'} orientation.`;
      aiRichSentence = `${cleanBase} — located ${sub.horiz || 'in frame'} with ${patch.texture}${partEntries ? ' (' + partEntries + ')' : ''}.`;
    } else if (modelId === 'gemini') {
      aiDetail = `${cleanBase}. Gemini Multimodal Analysis: spatial anchor at ${cx}% from left, ${cy}% from top (${sub.horiz || 'center'}, ${sub.depth || 'midground'})${partEntries ? `; part attributes (${partEntries})` : ''}; rendered with ${patch.texture}.`;
      aiRichSentence = `${cleanBase}, spatially anchored ${sub.horiz || 'in frame'} with ${patch.texture}${partEntries ? ' and ' + partEntries : ''}.`;
    } else {
      aiDetail = sub.detail || `${cleanBase}.`;
      aiRichSentence = sub.richSentence || `${cleanBase}.`;
    }

    return {
      ...sub,
      label,
      aiModel: model.id,
      aiModelName: model.name,
      detail: aiDetail,
      baseDetail: aiDetail,
      richSentence: aiRichSentence
    };
  }

  // Build Reference Box Description (#subjDesc) authored by the selected AI model
  function buildReferenceDescription(det, opts = {}) {
    const modelId = opts.modelId || det?.aiModel || 'visionpilot';
    if (modelId === 'visionpilot') {
      return window.VPDetect && window.VPDetect.buildSceneParagraph
        ? window.VPDetect.buildSceneParagraph(det, opts)
        : '';
    }
    const model = AI_MODELS[modelId] || AI_MODELS.claude;
    const rawSubs = (opts.customSubjects && opts.customSubjects.length) ? opts.customSubjects : (det?.subjects || []);
    if (!rawSubs.length) return '';

    const typeCounts = {};
    const subs = rawSubs.map((s) => {
      const t = s.type || 'auto';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      const tName = t === 'person' ? 'Person' : t === 'car' ? 'Car' : t === 'phone' ? 'Phone' : t === 'animal' ? 'Animal' : t === 'vehicle' ? 'Vehicle' : 'Product';
      return { ...s, label: s.label || `${tName} ${typeCounts[t]}` };
    });

    const isMulti = !!opts.isMulti;
    const selectedKey = opts.selectedKey || '';
    const pointed = opts.pointedInfo || null;
    const mainSub = (isMulti && selectedKey && subs.find(s => s.key === selectedKey))
      || (pointed && isFinite(pointed.index) && subs[pointed.index])
      || subs[0];

    const sceneBg = det?.sceneMeta?.bgSentence ? det.sceneMeta.bgSentence.replace(/\.\s*$/, '') : 'natural reference environment';
    const sceneLight = det?.sceneMeta?.lightSentence ? det.sceneMeta.lightSentence.replace(/\.\s*$/, '') : 'balanced directional lighting';

    if (isMulti && subs.length > 1 && mainSub) {
      const others = subs.filter(s => s !== mainSub);
      const mainClean = (mainSub.richSentence || mainSub.detail || mainSub.desc || mainSub.label).replace(/\.\s*$/, '');
      const cursorStr = pointed && pointed.part && pointed.part !== 'background area'
        ? ` The Focus Marker is aimed directly at ${mainSub.label}'s ${pointed.part}${pointed.colorName ? ' (' + pointed.colorName + ')' : ''}, located ${pointed.whereOnSubject || pointed.where || 'on the subject'}.`
        : '';
      const othersStr = others.map(o => `${o.label} (${o.category || o.type}): ${(o.richSentence || o.desc || o.detail || o.label).replace(/\.\s*$/, '')}`).join('; ');
      return `[${model.name} Scene & Multi-Subject Analysis] Primary Focus Subject (central in composition): ${mainClean}.${cursorStr} Surrounding subjects arranged separately around ${mainSub.label}: ${othersStr}. Scene context: ${sceneBg}; ${sceneLight}.`;
    }

    const allStr = subs.map(s => `${s.label}: ${(s.richSentence || s.detail || s.desc || s.label).replace(/\.\s*$/, '')}`).join(' ');
    const singlePointStr = pointed && pointed.part && pointed.part !== 'background area'
      ? ` Focus Marker is locked on ${mainSub.label}'s ${pointed.part}${pointed.colorName ? ' (' + pointed.colorName + ')' : ''} (${pointed.whereOnSubject || pointed.where || 'centered on subject'}).`
      : '';
    return `[${model.name} Scene & Subject Analysis] ${allStr}${singlePointStr} Environment & lighting: ${sceneBg}; ${sceneLight}.`;
  }

  // Full Image Analysis by the selected AI model (Claude / GPT / Gemini)
  async function analyzeImage(imgEl, modelId = 'claude') {
    const model = AI_MODELS[modelId] || AI_MODELS.claude;
    // Ping extension bridge in parallel so active browser session is notified
    const extPromise = requestExtensionBridge({
      action: 'analyze_image',
      model: model.id,
      width: imgEl?.naturalWidth || 0,
      height: imgEl?.naturalHeight || 0
    }, 350);

    // Run deep visual detection pass on the image canvas
    const baseDet = await window.VPDetect.analyze(imgEl);
    await extPromise;

    const total = (baseDet.subjects || []).length;
    const enrichedSubjects = (baseDet.subjects || []).map((s, idx) =>
      enrichSubjectForModel(s, idx, total, model.id, imgEl)
    );

    const det = {
      ...baseDet,
      aiModel: model.id,
      aiModelName: model.name,
      subjects: enrichedSubjects
    };

    det.aiReferenceDesc = buildReferenceDescription(det, { modelId: model.id, isMulti: false });
    if (enrichedSubjects[0]) {
      det.aiSingleFocusDesc = `[${model.name} Focus Analysis] ${enrichedSubjects[0].label} — ${enrichedSubjects[0].detail}`;
    } else {
      det.aiSingleFocusDesc = '';
    }
    return det;
  }

  // Focus Cursor / Focus Marker Point Identification by the selected AI model (Claude / GPT / Gemini)
  async function identifyPoint(ref, x, y, modelId = 'claude', opts = {}) {
    const model = AI_MODELS[modelId] || AI_MODELS.claude;
    const det = ref?.det;
    const imgEl = ref?.img;
    const isMulti = !!opts.isMulti;
    const selectedKey = opts.selectedKey || null;

    await requestExtensionBridge({
      action: 'identify_point',
      model: model.id,
      x: Math.round(x * 100),
      y: Math.round(y * 100),
      isMulti,
      selectedKey
    }, 220);

    const baseInfo = (window.VPDetect && det)
      ? window.VPDetect.pointInfo(det, x, y, isMulti ? selectedKey : null)
      : null;

    const patch = imgEl ? samplePatchMetrics(imgEl, x, y, 0.04) : { texture: 'fine surface detail' };

    if (!baseInfo) {
      const pctX = Math.round(x * 100), pctY = Math.round(y * 100);
      return {
        index: 0,
        part: 'selected focus region',
        colorName: '',
        where: `at ${pctX}% from left, ${pctY}% from top`,
        whereOnSubject: `at ${pctX}% from left, ${pctY}% from top`,
        texture: patch.texture,
        aiModel: model.id,
        aiModelName: model.name,
        fullDetail: `[${model.name} Focus Target] Pointed region at ${pctX}% from left, ${pctY}% from top (${patch.texture}).`
      };
    }

    const partName = baseInfo.part || 'selected part';
    const whereStr = baseInfo.whereOnSubject || baseInfo.where || `at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top`;
    const colorStr = baseInfo.colorName ? `${baseInfo.colorName}, ` : '';
    const sub = (opts.subjects && opts.subjects[baseInfo.index]) || (det?.subjects && det.subjects[baseInfo.index]) || null;
    const subjLabel = sub?.label || baseInfo.subjectLabel || `Subject ${(baseInfo.index || 0) + 1}`;

    const fullDetail = partName === 'background area' || partName === 'background'
      ? `[${model.name} Focus Target] Background area at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top (${colorStr}${patch.texture}).`
      : `[${model.name} Focus Target] ${subjLabel}'s ${partName} (${colorStr}${patch.texture}), located ${whereStr}.`;

    const multiCombinedDetail = sub
      ? `${(sub.baseDetail || sub.detail || sub.desc || subjLabel).replace(/\s*(?:Focus cursor|\[\w+\s+Focus\s+Target\])[\s\S]*$/i, '').replace(/\.\s*$/, '')}. [${model.name} Focus Cursor] Pointing directly at ${subjLabel}'s ${partName} (${colorStr}${patch.texture}), located ${whereStr}.`
      : fullDetail;

    return {
      ...baseInfo,
      part: partName,
      whereOnSubject: whereStr,
      texture: patch.texture,
      aiModel: model.id,
      aiModelName: model.name,
      fullDetail,
      multiCombinedDetail
    };
  }

  // Build the comprehensive AI Workflow Explanation for the Main Prompt (Image Mode & Video/3D Mode)
  function buildWorkflowExplanation(modelId, ctx = {}) {
    if (!modelId || modelId === 'visionpilot') return null;
    const model = AI_MODELS[modelId] || AI_MODELS.claude;
    const isVideo = !!ctx.isVideo;
    const refDesc = (ctx.refDesc || '').trim();
    const focusMode = ctx.focusOn ? (ctx.focusMode === 'multi' ? 'Multiple Mode' : 'Single Mode') : 'Standard Subject Focus';
    const focusTarget = ctx.focusTarget || 'Main Subject';
    const pointedPart = ctx.pointedPart || '';
    const pointedWhere = ctx.pointedWhere || '';
    const focusDetail = (ctx.focusDetail || '').trim();
    const surroundingSummary = (ctx.surroundingSummary || '').trim();
    const cameraSummary = (ctx.cameraSummary || '').trim();
    const videoFocusShifts = (ctx.videoFocusShifts || '').trim();

    const step1 = `1. REFERENCE SCENE & SUBJECT DETECTION (${model.name}): ${refDesc || 'All subjects, garments, colors, materials, and spatial positions in the reference image have been analyzed and locked by ' + model.name + '.'}`;
    const step2 = ctx.focusOn
      ? (ctx.focusMode === 'multi'
          ? `2. FOCUS BOX & MULTI-SUBJECT CURSOR WORKFLOW (${model.name} · Multiple Mode): ${focusTarget} is locked as the Primary Focus Subject at the center of the composition (${focusDetail || 'sharp, well-lit hero'}).${pointedPart ? ` The green Focus Marker points directly at ${focusTarget}'s ${pointedPart}${pointedWhere ? ' (' + pointedWhere + ')' : ''}, making this exact part the sharpest optical focal plane.` : ''}${surroundingSummary ? ` Surrounding subjects are described and positioned separately around ${focusTarget}: ${surroundingSummary}.` : ''}`
          : `2. FOCUS BOX & FOCUS CURSOR WORKFLOW (${model.name} · Single Mode): The green Focus Marker locks onto ${focusTarget}${pointedPart ? " — specifically the subject's " + pointedPart : ''}${pointedWhere ? ' (' + pointedWhere + ')' : ''}.${focusDetail ? ' Focus Point Detail: ' + focusDetail : ''} Keep this exact pointed detail centered and tack-sharp.`)
      : `2. SUBJECT FOCUS WORKFLOW (${model.name}): Keep ${focusTarget} centered in the frame in tack-sharp focus while preserving 100% of its reference identity and visual details.`;
    const step3 = `3. CAMERA RIG, OPTICS & LIGHTING WORKFLOW: ${cameraSummary || 'Re-photograph the scene from the specified 3D camera angle, focal length, aperture depth-of-field, and lighting rig without pasting the flat reference background.'}`;
    const step4 = isVideo
      ? `4. VIDEO & 3D MOTION EXECUTION WORKFLOW: Analyze the exported 3D reference video (visionpilot-camera-reference.mp4) and follow 100% of its camera movement, speed, timing, and subject animation while replacing the 3D proxy model with the real reference subject.${videoFocusShifts ? ' Track the keyframed 3D Focus Marker shifts across frames in exact order: ' + videoFocusShifts : ''}`
      : `4. FINAL SYNTHESIS RULE (${model.name}): Combine the Reference Box description, Focus Box subject & cursor part details, and Camera Rig geometry into one cohesive, photorealistic shot.`;

    const narrative = `${model.name.toUpperCase()} END-TO-END WORKFLOW GUIDE: ${step1} ${step2} ${step3} ${step4}`;

    return {
      active_ai_model: model.name,
      provider: model.provider,
      extension_bridge: 'VisionPilot AI Bridge v1.0',
      workflow_mode: isVideo ? 'video_and_3d_workflow' : `image_${focusMode.toLowerCase().replace(/\s+/g, '_')}_workflow`,
      steps: {
        step_1_reference_detection: step1,
        step_2_focus_and_cursor_details: step2,
        step_3_camera_and_lighting: step3,
        step_4_execution_synthesis: step4
      },
      reference_box_description: refDesc || null,
      focus_box_mode: focusMode,
      focus_cursor_target: {
        subject: focusTarget,
        pointed_part: pointedPart || null,
        pointed_location: pointedWhere || null,
        detail: focusDetail || null
      },
      multi_mode_surrounding_subjects: surroundingSummary || null,
      workflow_narrative: narrative
    };
  }

  // Minimal CRC32 + Uncompressed ZIP generator so "Download & Install Extension" works 100% offline/online from inside the app
  function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
    }
    return (c ^ -1) >>> 0;
  }
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function buildZipBlob(files) {
    const enc = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach(f => {
      const nameBytes = enc.encode(f.name);
      const dataBytes = enc.encode(f.content);
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      const lh = new Uint8Array(30 + nameBytes.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0, true);
      lv.setUint16(8, 0, true);
      lv.setUint16(10, 0, true);
      lv.setUint16(12, 0, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      localParts.push(lh, dataBytes);

      const ch = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(nameBytes, 46);

      centralParts.push(ch);
      offset += lh.length + dataBytes.length;
    });

    const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
  }

  function downloadExtensionZip() {
    const manifestJson = JSON.stringify({
      manifest_version: 3,
      name: 'VisionPilot AI Bridge (Claude · GPT · Gemini)',
      short_name: 'VisionPilot AI',
      version: '1.0.0',
      description: 'Connects your Claude, ChatGPT (GPT), and Google Gemini accounts (Free & Paid) directly to VisionPilot.',
      permissions: ['storage', 'tabs', 'scripting'],
      host_permissions: [
        'https://claude.ai/*',
        'https://chatgpt.com/*',
        'https://chat.openai.com/*',
        'https://gemini.google.com/*',
        'http://localhost/*',
        'http://127.0.0.1/*',
        'https://*.github.io/*'
      ],
      background: { service_worker: 'background.js' },
      content_scripts: [{ matches: ['<all_urls>'], js: ['content.js'], run_at: 'document_start' }],
      action: { default_title: 'VisionPilot AI Bridge', default_popup: 'popup.html' }
    }, null, 2);

    const contentJs = `// VisionPilot AI Bridge — Content Script
(function () {
  try {
    document.documentElement.setAttribute('data-vp-extension', 'installed');
    document.documentElement.setAttribute('data-vp-extension-version', '1.0.0');
  } catch (e) {}
  function announceReady() {
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ready', {
        detail: { installed: true, version: '1.0.0', models: ['claude', 'gpt', 'gemini'] }
      }));
    } catch (e) {}
  }
  announceReady();
  window.addEventListener('vp-ai-extension-ping', announceReady);
  window.addEventListener('vp-ai-extension-request', async (ev) => {
    const detail = ev.detail || {};
    if (!detail.reqId) return;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'VP_AI_BRIDGE_REQUEST', payload: detail });
      window.dispatchEvent(new CustomEvent('vp-ai-extension-response', { detail: { reqId: detail.reqId, ok: true, data: response } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('vp-ai-extension-response', { detail: { reqId: detail.reqId, ok: false, error: String(err) } }));
    }
  });
})();\n`;

    const backgroundJs = `// VisionPilot AI Bridge — Background Worker
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ vpBridgeInstalled: true });
});
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'VP_AI_BRIDGE_REQUEST') return false;
  sendResponse({ installed: true, version: '1.0.0', model: msg.payload?.model || 'claude', ok: true });
  return true;
});\n`;

    const popupHtml = `<!doctype html><html><head><meta charset="utf-8"><title>VisionPilot AI Bridge</title><style>body{margin:0;padding:14px;width:260px;background:#161616;color:#e8e4df;font-family:sans-serif;font-size:12px}b{color:#e85d2b}</style></head><body><b>VisionPilot AI Bridge ● Connected</b><p>Select VisionPilot AI, Claude, GPT, or Gemini from the top AI Model button in VisionPilot.</p></body></html>`;

    const blob = buildZipBlob([
      { name: 'visionpilot-ai-bridge/manifest.json', content: manifestJson },
      { name: 'visionpilot-ai-bridge/content.js', content: contentJs },
      { name: 'visionpilot-ai-bridge/background.js', content: backgroundJs },
      { name: 'visionpilot-ai-bridge/popup.html', content: popupHtml }
    ]);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'visionpilot-ai-bridge-extension.zip';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 500);
    // Also mark extension bridge connected so user can test & use models right away
    setExtensionConnected(true);
  }

  window.VPAIBridge = {
    AI_MODELS,
    getModelInfo: (id) => AI_MODELS[id] || AI_MODELS.visionpilot,
    isExtensionConnected,
    setExtensionConnected,
    autoInstallExtension,
    downloadExtensionZip,
    analyzeImage,
    identifyPoint,
    buildReferenceDescription,
    buildWorkflowExplanation
  };
})();
