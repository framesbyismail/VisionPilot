// VisionPilot AI Bridge — Real Browser Tab Bridge for Claude, ChatGPT & Gemini (v2.0.0)
// Zero API keys. Zero fake or mock responses. Uses only the logged-in web interfaces via the Chrome Extension.
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
      provider: 'Anthropic Claude Web',
      badge: '',
      color: '#d97757',
      requiresExt: true,
      url: 'https://claude.ai/new',
      desc: 'Real browser connection to your logged-in claude.ai tab'
    },
    gpt: {
      id: 'gpt',
      name: 'GPT',
      shortName: 'GPT',
      provider: 'OpenAI ChatGPT Web',
      badge: '',
      color: '#10a37f',
      requiresExt: true,
      url: 'https://chatgpt.com/',
      desc: 'Real browser connection to your logged-in chatgpt.com tab'
    },
    gemini: {
      id: 'gemini',
      name: 'Gemini',
      shortName: 'Gemini',
      provider: 'Google Gemini Web',
      badge: '',
      color: '#4285f4',
      requiresExt: true,
      url: 'https://gemini.google.com/app',
      desc: 'Real browser connection to your logged-in gemini.google.com tab'
    }
  };

  // Image Generation Models (PART 3: Nano Banana 2 inside Gemini & ChatGPT Image 2 / GPT Image 1.5 inside ChatGPT)
  const IMAGE_GEN_MODELS = {
    gemini: {
      id: 'gemini',
      provider: 'gemini',
      name: 'Nano Banana 2',
      subName: 'Gemini 2.5 Flash Image (Latest)',
      fullName: 'Nano Banana 2 (Gemini)',
      color: '#4285f4'
    },
    gpt: {
      id: 'gpt',
      provider: 'gpt',
      name: 'ChatGPT Image 2',
      subName: 'GPT Image 1.5 (Latest)',
      fullName: 'ChatGPT Image 2 · GPT Image 1.5 (ChatGPT)',
      color: '#10a37f'
    }
  };

  // Exact plain-language instructions required by VisionPilot (PART 1: More Specific Detail Prompts + 30-40 word limit)
  const STEP_1_REFERENCE_INSTRUCTION =
    'Look at this image and describe it in detail. Cover the location or setting, who or what the main subject is, and what else is around the main subject, such as other people, objects and background elements. For any product, state what the product is, its brand name, which company makes it, and its color, or state that the brand is not visible instead of guessing. Put your entire reply inside one code block, so that it appears in a copy box with a copy button. Inside the code block, write one short paragraph of plain text, with no title, no bullet points and no extra words. Write nothing outside the code block, no greeting and no explanation. Keep the description between 30 and 50 words, and never go over 50 words.';

  const STEP_2_SINGLE_FOCUS_INSTRUCTION =
    'The first image is the original photo. The second image is a screenshot with a marker showing the exact spot I am pointing at. ' +
    'Identify which person, object, animal, car, or product is at that marked spot, and describe the exact part and side using the real visual details from the first original image — never use vague words alone like "wheel", "eye", or "hand". ' +
    'Important: Never mention "green marker", "marker", "crosshair", or "target" anywhere in your answer; describe only the subject and its exact part directly. ' +
    'For a car, specify the exact part such as the front right wheel, front left wheel, rear right wheel, rear left wheel, window, or windshield. ' +
    'For a person, specify the right hand or left hand, right eye or left eye, right ear or left ear, mouth, or nose. ' +
    'For animals such as a cat or a dog, specify the eyes, mouth, nose, or the front right leg, front left leg, rear right leg, or rear left leg. ' +
    'Left and right always mean the subject\'s own left and right, and you must state this clearly, for example "the person\'s left eye". ' +
    'For products, state what the product is, its brand name, which company makes it, and its color, so it is clear that this color of product is the main subject; if the brand is not visible, say the brand is not visible instead of guessing. ' +
    'Put your entire reply inside one code block with a copy button, containing one short paragraph of plain text, and write nothing outside the code block. ' +
    'Keep the description between 30 and 40 words, never go over 40 words, and do not mention "green marker" in the reply.';

  const STEP_3_MULTI_FOCUS_INSTRUCTION =
    'The first image is the original. The second image is a screenshot with colored boxes, each labeled like Person 1, Person 2, Product 1 and Product 2. Match each colored box to its label and use the original image for real detail. ' +
    'When naming parts or sides of a car (front right wheel, front left wheel, rear right wheel, rear left wheel, window, windshield), a person (right hand or left hand, right eye or left eye, right ear or left ear, mouth, nose), or an animal (eyes, mouth, nose, front right leg, front left leg, rear right leg, rear left leg), left and right always mean the subject\'s own left and right, and you must say so, for example "the person\'s left eye". ' +
    'For products, state what the product is, its brand name, which company makes it, and its color, so it is clear that this color of product is the main subject; if the brand is not visible, say the brand is not visible instead of guessing. ' +
    'Give a separate code block for every labeled subject, in the same order as the labels, so each one has its own copy button. Inside each code block, write the label name first, then a colon, then a description of between 30 and 40 words, and never go over 40 words. Write nothing outside the code blocks.';

  // Clear any legacy fake localStorage flag from older versions
  try {
    localStorage.removeItem('vp-ai-ext-connected');
  } catch (e) {}

  let extInstalled = false;
  try {
    extInstalled = document.documentElement.getAttribute('data-vp-extension') === 'installed';
  } catch (e) {}

  let syncingReady = false;
  window.addEventListener('vp-ai-extension-ready', () => {
    extInstalled = true;
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
    } catch (e) {}
    if (!syncingReady && typeof window.syncAIModelUI === 'function') {
      syncingReady = true;
      try { window.syncAIModelUI(); } finally { syncingReady = false; }
    }
  });

  window.addEventListener('vp-ai-extension-select-model', (ev) => {
    const model = ev.detail && ev.detail.model;
    extInstalled = true;
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
    } catch (e) {}
    if (model && typeof window.selectAIModel === 'function') {
      window.selectAIModel(model);
    } else if (typeof window.syncAIModelUI === 'function') {
      window.syncAIModelUI();
    }
  });

  function pingExtension() {
    try {
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ping'));
    } catch (e) {}
  }

  pingExtension();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', pingExtension, { once: true });
  }
  window.addEventListener('load', pingExtension, { once: true });

  // Strict check: true when the Chrome Extension content script is active OR when running inside the Electron Desktop Software silent backend
  function isExtensionConnected() {
    if (window.visionPilotDesktop?.isDesktop && typeof window.visionPilotDesktop.runSilentAiBridge === 'function') {
      extInstalled = true;
      try { document.documentElement.setAttribute('data-vp-extension', 'installed'); } catch (e) {}
      return true;
    }
    try {
      if (document.documentElement.getAttribute('data-vp-extension') === 'installed') {
        extInstalled = true;
        return true;
      }
    } catch (e) {}
    return Boolean(extInstalled);
  }

  // Track active in-flight extension requests so clicking the cross button (CHANGE 2) cancels them immediately
  const pendingRequests = new Map();

  function cancelPendingRequests(refId = null) {
    console.log('[VP AI Bridge] Cancelling pending requests for refId:', refId || 'ALL');
    for (const [reqId, entry] of pendingRequests.entries()) {
      if (!refId || !entry.refId || entry.refId === refId) {
        entry.cancel();
        pendingRequests.delete(reqId);
      }
    }
    if (window.visionPilotDesktop?.isDesktop && typeof window.visionPilotDesktop.runSilentAiBridge === 'function') {
      window.visionPilotDesktop.runSilentAiBridge({ action: 'cancel_requests', refId: refId || null }).catch(() => {});
      return;
    }
    if (isExtensionConnected()) {
      try {
        const cancelReqId = 'vp_cancel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        window.dispatchEvent(new CustomEvent('vp-ai-extension-request', {
          detail: { action: 'cancel_requests', refId: refId || null, reqId: cancelReqId }
        }));
      } catch (e) {}
    }
  }

  // Send a message to the Chrome Extension content.js -> background.js (or silent Electron backend) and await the real result
  // No timeout while AI is generating (timeoutMs <= 0 or omitted for run_prompt / generate_image)
  // live stages from the extension / desktop app: reqId -> callback(stage)
  const progressHandlers = new Map();
  window.addEventListener('vp-ai-extension-progress', (ev) => { const d = ev.detail || {}; const h = progressHandlers.get(d.reqId); if (h) h(d.stage, d); });
  window.visionPilotDesktop?.onBridgeProgress?.((d) => { const h = d && progressHandlers.get(d.reqId); if (h) h(d.stage, d); });
  function sendExtensionRequest(payload, timeoutMs = 0, onProgress = null) {
    payload = { ...payload, reqId: payload.reqId || ('vp_req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)) };
    if (onProgress) progressHandlers.set(payload.reqId, onProgress);
    const done = (p) => p.finally(() => progressHandlers.delete(payload.reqId));
    if (window.visionPilotDesktop?.isDesktop && typeof window.visionPilotDesktop.runSilentAiBridge === 'function') {
      return done(window.visionPilotDesktop.runSilentAiBridge(payload));
    }
    return done(new Promise((resolve) => {
      if (!isExtensionConnected()) {
        resolve({
          ok: false,
          error: 'VisionPilot Chrome Extension is not installed or not active on this page.'
        });
        return;
      }
      const reqId = payload.reqId;
      const refId = payload.refId || null;
      let settled = false;

      const isGenerationAction =
        payload.action === 'run_prompt' || payload.action === 'generate_image';
      const effectiveTimeout = isGenerationAction ? 0 : Number(timeoutMs) || 0;

      const timer =
        effectiveTimeout > 0
          ? setTimeout(() => {
              if (settled) return;
              settled = true;
              pendingRequests.delete(reqId);
              window.removeEventListener('vp-ai-extension-response', onResp);
              resolve({
                ok: false,
                error: 'Could not reach the browser extension tab.'
              });
            }, effectiveTimeout)
          : null;

      function cancel() {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve({
          ok: false,
          cancelled: true,
          error: 'Request cancelled.'
        });
      }

      function onResp(ev) {
        const d = ev.detail || {};
        if (d.reqId !== reqId || settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        pendingRequests.delete(reqId);
        window.removeEventListener('vp-ai-extension-response', onResp);
        if (!d.ok) {
          resolve({
            ok: false,
            cancelled: Boolean(d.cancelled || d.data?.cancelled),
            error: d.error || d.data?.error || 'Extension request failed.'
          });
        } else {
          resolve(d.data || { ok: true });
        }
      }

      if (isGenerationAction) {
        pendingRequests.set(reqId, { reqId, refId, cancel });
      }

      window.addEventListener('vp-ai-extension-response', onResp);
      try {
        window.dispatchEvent(new CustomEvent('vp-ai-extension-request', {
          detail: { ...payload, reqId }
        }));
      } catch (err) {
        if (timer) clearTimeout(timer);
        pendingRequests.delete(reqId);
        window.removeEventListener('vp-ai-extension-response', onResp);
        resolve({
          ok: false,
          error: String(err && err.message ? err.message : err)
        });
      }
    }));
  }

  // Verify extension installation by round-trip ping to background worker
  async function verifyExtensionInstalled() {
    pingExtension();
    if (!isExtensionConnected()) {
      return { ok: false, error: 'Extension is not installed or not enabled in Chrome.' };
    }
    const resp = await sendExtensionRequest({ action: 'status' }, 4000);
    if (resp && resp.ok && resp.installed) {
      return { ok: true, version: resp.version };
    }
    return { ok: false, error: resp?.error || 'Could not reach VisionPilot extension background worker.' };
  }

  // Render the full uncropped, unzoomed original image to a PNG dataURL
  function renderOriginalImageDataUrl(imgEl) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      throw new Error('Reference image is not loaded yet.');
    }
    const maxDim = 1600;
    let w = imgEl.naturalWidth;
    let h = imgEl.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);
    return c.toDataURL('image/png');
  }

  // Render the full uncropped, unzoomed image with the green Focus Marker drawn at normalized (nx, ny)
  // Never sends a zoomed or cropped version, even when Zoom to Detail is on.
  function renderMarkerScreenshotDataUrl(imgEl, nx, ny) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      throw new Error('Reference image is not loaded yet.');
    }
    const maxDim = 1600;
    let w = imgEl.naturalWidth;
    let h = imgEl.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);

    const cx = Math.max(0, Math.min(w, nx * w));
    const cy = Math.max(0, Math.min(h, ny * h));
    const radius = Math.max(14, Math.round(Math.min(w, h) * 0.028));

    ctx.save();
    // Outer dark halo for contrast on any background
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.lineWidth = Math.max(4, Math.round(radius * 0.32));
    ctx.stroke();

    // Bright green Focus Marker ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(63, 185, 80, 0.22)';
    ctx.fill();
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = Math.max(3, Math.round(radius * 0.24));
    ctx.stroke();

    // Crosshair lines
    const arm = Math.round(radius * 1.45);
    ctx.beginPath();
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
    ctx.strokeStyle = '#3fb950';
    ctx.lineWidth = Math.max(2, Math.round(radius * 0.16));
    ctx.stroke();

    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, Math.round(radius * 0.22)), 0, Math.PI * 2);
    ctx.fillStyle = '#3fb950';
    ctx.fill();
    ctx.restore();

    return c.toDataURL('image/png');
  }

  // Render the full uncropped, unzoomed image with ONLY the colored labeled subject boxes (no focus marker)
  function renderLabeledBoxesScreenshotDataUrl(imgEl, subjects) {
    if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) {
      throw new Error('Reference image is not loaded yet.');
    }
    const maxDim = 1600;
    let w = imgEl.naturalWidth;
    let h = imgEl.naturalHeight;
    if (w > maxDim || h > maxDim) {
      const scale = maxDim / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(imgEl, 0, 0, w, h);

    const list = Array.isArray(subjects) ? subjects : [];
    const lineW = Math.max(3, Math.round(Math.min(w, h) * 0.005));
    const fontSize = Math.max(14, Math.round(Math.min(w, h) * 0.024));
    ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textBaseline = 'top';

    list.forEach((s, idx) => {
      const b = s.box || { x: 0.15, y: 0.1, w: 0.7, h: 0.8 };
      const color = s.color || s.uiColor || '#e85d2b';
      const label = s.label || `Subject ${idx + 1}`;
      const bx = Math.round(Math.max(0, Math.min(w - 10, b.x * w)));
      const by = Math.round(Math.max(0, Math.min(h - 10, b.y * h)));
      const bw = Math.round(Math.max(16, Math.min(w - bx, b.w * w)));
      const bh = Math.round(Math.max(16, Math.min(h - by, b.h * h)));

      ctx.save();
      // Subtle dark outer outline + colored box border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = lineW + 2;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.strokeStyle = color;
      ctx.lineWidth = lineW;
      ctx.strokeRect(bx, by, bw, bh);

      // Label pill at top-left of box
      const padX = Math.round(fontSize * 0.45);
      const padY = Math.round(fontSize * 0.25);
      const textW = Math.ceil(ctx.measureText(label).width);
      const pillW = textW + padX * 2;
      const pillH = fontSize + padY * 2;
      const pillX = bx;
      const pillY = by >= pillH + 2 ? by - pillH - 2 : by + 2;

      ctx.fillStyle = color;
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, pillX + padX, pillY + padY);
      ctx.restore();
    });

    return c.toDataURL('image/png');
  }

  // Open or reset a fresh new chat tab for the selected model (never reuses an old conversation)
  async function connectModel(modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      return { ok: true, model: 'visionpilot' };
    }
    if (!isExtensionConnected()) {
      return {
        ok: false,
        error: `Extension is not connected. Install and enable the VisionPilot Chrome Extension to use ${model.name}.`
      };
    }
    const res = await sendExtensionRequest({
      action: 'connect_model',
      model: model.id,
      focusTab: false
    }, 35000);
    return res;
  }

  // STEP 1: Upload reference image and get 30-50 word plain-text description from code block copy button
  async function runReferenceImageStep(ref, modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      throw new Error('No external AI model selected.');
    }
    if (!ref || !ref.img) {
      throw new Error('Reference image is missing.');
    }
    const originalDataUrl = renderOriginalImageDataUrl(ref.img);
    const res = await sendExtensionRequest({
      action: 'run_prompt',
      step: 'reference',
      refId: ref.id || null,
      model: model.id,
      images: [
        {
          dataUrl: originalDataUrl,
          name: 'reference-image.png',
          mimeType: 'image/png'
        }
      ],
      instruction: STEP_1_REFERENCE_INSTRUCTION
    }, 150000);

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Request cancelled.');
      err.cancelled = true;
      throw err;
    }
    if (!res || !res.ok) {
      throw new Error(res?.error || `${model.name} failed to describe the reference image.`);
    }
    const text = (Array.isArray(res.blocks) && res.blocks[0] ? res.blocks[0] : res.fullText || '').trim();
    if (!text) {
      throw new Error(`${model.name} returned an empty reference description.`);
    }
    return text;
  }

  // STEP 2: Focus Mode (Single Mode & Multiple Mode Marker) — send original image + screenshot with green marker
  // Never prepend any pre-guessed subject or part hint; send only the exact STEP_2_SINGLE_FOCUS_INSTRUCTION.
  async function runSingleFocusStep(ref, x, y, pointerHint, modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      throw new Error('No external AI model selected.');
    }
    if (!ref || !ref.img) {
      throw new Error('Reference image is missing.');
    }
    const originalDataUrl = renderOriginalImageDataUrl(ref.img);
    const markerDataUrl = renderMarkerScreenshotDataUrl(ref.img, x, y);

    const instruction = STEP_2_SINGLE_FOCUS_INSTRUCTION;

    const res = await sendExtensionRequest({
      action: 'run_prompt',
      step: 'single_focus',
      refId: ref.id || null,
      model: model.id,
      images: [
        {
          dataUrl: originalDataUrl,
          name: 'original-image.png',
          mimeType: 'image/png'
        },
        {
          dataUrl: markerDataUrl,
          name: 'focus-marker-screenshot.png',
          mimeType: 'image/png'
        }
      ],
      instruction
    }, 150000);

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Request cancelled.');
      err.cancelled = true;
      throw err;
    }
    if (!res || !res.ok) {
      throw new Error(res?.error || `${model.name} failed to describe the focus point.`);
    }
    let text = (Array.isArray(res.blocks) && res.blocks[0] ? res.blocks[0] : res.fullText || '').trim();
    if (!text) {
      throw new Error(`${model.name} returned an empty focus point description.`);
    }
    text = text
      .replace(/^(?:the\s+)?(?:bright\s+)?green\s+(?:focus\s+)?(?:marker|crosshair|target|circle|reticle)\s+(?:is\s+)?(?:pointing\s+(?:at|to)|points\s+(?:at|to)|selects|marks|highlights|is\s+placed\s+on|is\s+centered\s+on|is\s+on|shows|indicates)\s+/i, '')
      .replace(/\b(?:pointed\s+to|selected|marked|highlighted|indicated)\s+by\s+the\s+(?:bright\s+)?green\s+(?:focus\s+)?(?:marker|crosshair|target|circle|reticle)\s*,?\s*/gi, '')
      .replace(/\b(?:the\s+)?green\s+marker\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (text) text = text.charAt(0).toUpperCase() + text.slice(1);
    return text;
  }

  // Map a subject box hex color to a human-readable color name (e.g. "red", "blue", "orange")
  function boxColorNameFromHex(hex) {
    const raw = String(hex || '').trim().toLowerCase();
    const exactMap = {
      '#ff6b6b': 'red',
      '#e5484d': 'red',
      '#d93a40': 'red',
      '#4dabf7': 'blue',
      '#3f7cf6': 'blue',
      '#2563c9': 'blue',
      '#51cf66': 'green',
      '#3fb950': 'green',
      '#2f9e44': 'green',
      '#fcc419': 'yellow',
      '#cc5de8': 'purple',
      '#ff922b': 'orange',
      '#e85d2b': 'orange',
      '#20c997': 'teal',
      '#f06595': 'pink'
    };
    if (exactMap[raw]) return exactMap[raw];
    const m = raw.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m) return 'colored';
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    const palette = [
      { name: 'red', rgb: [255, 107, 107] },
      { name: 'blue', rgb: [77, 171, 247] },
      { name: 'green', rgb: [81, 207, 102] },
      { name: 'yellow', rgb: [252, 196, 25] },
      { name: 'purple', rgb: [204, 93, 232] },
      { name: 'orange', rgb: [255, 146, 43] },
      { name: 'teal', rgb: [32, 201, 151] },
      { name: 'pink', rgb: [240, 101, 149] }
    ];
    let best = 'colored';
    let bestDist = Infinity;
    for (const p of palette) {
      const d = (r - p.rgb[0]) ** 2 + (g - p.rgb[1]) ** 2 + (b - p.rgb[2]) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = p.name;
      }
    }
    return best;
  }

  // Strip optional box-color suffix from a subject label (e.g. "Product 1 blue box subject" -> "product 1")
  function stripColorBoxSuffix(normStr) {
    return String(normStr || '')
      .replace(/\b(?:red|blue|green|yellow|purple|orange|teal|pink|cyan|magenta|colored)\s+box(?:\s+subject)?\b/gi, '')
      .replace(/\bbox\s+subject\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // BUG 2 helper: Normalize subject labels by ignoring case, extra spaces, bold marks, backticks, and punctuation
  function normalizeSubjectLabel(raw) {
    return String(raw || '')
      .replace(/^(?:copy(?:\s+code)?|copied!?|plaintext|text|markdown)\s+/i, '')
      .replace(/^[`"'*#_~\-–—•\d.)\s[\]()]+/, '')
      .replace(/[`"'*#_~[\]().,:;!?\-–—]+$/g, '')
      .replace(/[*_`#~[\]().,:;!?\-–—]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Clean a raw code block string of any code fence or header artifact
  function cleanBlockString(str) {
    return String(str || '')
      .trim()
      .replace(/^```[a-z0-9_-]*\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .replace(/^(?:plaintext|text|markdown|copy\s*code|copy|copied!?)\s*\n+/i, '')
      .trim();
  }

  // Build the Multiple Mode instruction including VisionPilot's exact detected subject header names + box colors
  function buildMultiFocusInstruction(subs) {
    const items = (Array.isArray(subs) ? subs : []).map((s, idx) => {
      const label = s.label || `Subject ${idx + 1}`;
      const colorName = boxColorNameFromHex(s.color || s.uiColor);
      return {
        label,
        colorName,
        withBox: `${label} (${colorName} box subject)`
      };
    });
    if (!items.length) return STEP_3_MULTI_FOCUS_INSTRUCTION;
    const detectedListWithColors = items.map((it) => `${it.label} (${it.colorName} box)`).join(', ');
    const exactOrderLabels = items.map((it) => it.label).join(', ');
    const firstLabel = items[0].label;

    return (
      `The first image is the original. The second image is a screenshot with colored boxes around the subjects detected by VisionPilot. ` +
      `VisionPilot detected these exact subjects and colored boxes: ${detectedListWithColors}. ` +
      `For each listed subject (${detectedListWithColors}), locate its matching colored box and label in the second image, and describe that exact subject using the real detail from the first original image. ` +
      `When naming parts or sides of a car (front right wheel, front left wheel, rear right wheel, rear left wheel, window, windshield), a person (right hand or left hand, right eye or left eye, right ear or left ear, mouth, nose), or an animal (eyes, mouth, nose, front right leg, front left leg, rear right leg, rear left leg), left and right always mean the subject's own left and right, and you must say so, for example "the person's left eye". ` +
      `For products, state what the product is, its brand name, which company makes it, and its color, so it is clear that this color of product is the main subject; if the brand is not visible, say the brand is not visible instead of guessing. ` +
      `Give a separate code block for every detected subject in this exact order: ${exactOrderLabels}, so each one has its own copy button. ` +
      `Inside each code block, write the subject header name first (for example "${firstLabel}: "), then a description of between 30 and 40 words, and never go over 40 words. Write nothing outside the code blocks.`
    );
  }

  // STEP 3: Focus Mode (Multiple Mode) — send original image + screenshot with colored labeled boxes, click every copy button, match labels
  async function runMultiFocusStep(ref, subjects, modelId) {
    const model = AI_MODELS[modelId];
    if (!model || modelId === 'visionpilot') {
      throw new Error('No external AI model selected.');
    }
    if (!ref || !ref.img) {
      throw new Error('Reference image is missing.');
    }
    const subs = Array.isArray(subjects) ? subjects : [];
    if (!subs.length) {
      throw new Error('No detected subjects to label in Multiple Mode.');
    }

    const multiInstruction = buildMultiFocusInstruction(subs);

    console.log(
      `[VP MultiMode] Step 1: Preparing Multiple Mode request for ${model.name}. Target subjects (${subs.length}):`,
      subs.map((s) => ({
        key: s.key,
        label: s.label,
        normLabel: normalizeSubjectLabel(s.label),
        color: s.color || s.uiColor,
        colorName: boxColorNameFromHex(s.color || s.uiColor)
      })),
      'Instruction:',
      multiInstruction
    );

    const originalDataUrl = renderOriginalImageDataUrl(ref.img);
    const boxesDataUrl = renderLabeledBoxesScreenshotDataUrl(ref.img, subs);

    const subjectMetaList = subs.map((s, i) => ({
      index: i,
      key: s.key,
      label: s.label,
      normLabel: normalizeSubjectLabel(s.label),
      color: s.color || s.uiColor || '',
      colorName: boxColorNameFromHex(s.color || s.uiColor)
    }));

    const res = await sendExtensionRequest({
      action: 'run_prompt',
      step: 'multi_focus',
      refId: ref.id || null,
      model: model.id,
      expectedCount: subs.length,
      subjects: subjectMetaList,
      images: [
        {
          dataUrl: originalDataUrl,
          name: 'original-image.png',
          mimeType: 'image/png'
        },
        {
          dataUrl: boxesDataUrl,
          name: 'labeled-boxes-screenshot.png',
          mimeType: 'image/png'
        }
      ],
      instruction: multiInstruction
    }, 150000);

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Request cancelled.');
      err.cancelled = true;
      throw err;
    }

    console.log(`[VP MultiMode] Step 2: Received reply from ${model.name}:`, res);

    if (!res || !res.ok) {
      throw new Error(res?.error || `${model.name} failed to describe the multiple subjects.`);
    }

    const rawBlocks = Array.isArray(res.blocks)
      ? res.blocks.map((b) => cleanBlockString(b)).filter(Boolean)
      : [];

    console.log(`[VP MultiMode] Step 3: Extracted ${rawBlocks.length} raw code block(s):`, rawBlocks);

    if (!rawBlocks.length) {
      throw new Error(`${model.name} did not return code blocks for the labeled subjects.`);
    }

    // Expand any single code block that contains multiple labeled entries while preserving all continuation lines
    const subNormLabels = subs.map((s) => normalizeSubjectLabel(s.label));
    const isLineSubjectHeader = (line) => {
      const m = String(line || '').match(/^(?:[-*•]|\d+[.)])?\s*[*_\[\(`~"']*\s*([^:\n–—-]{1,65}?)\s*[*_\]\)`~"']*\s*(?::|-|–|—)\s*\S+/);
      if (!m) return false;
      const nl = stripColorBoxSuffix(normalizeSubjectLabel(m[1]));
      if (!nl) return false;
      if (subNormLabels.includes(nl)) return true;
      if (subNormLabels.some((sn) => sn && (nl.startsWith(sn) || sn.startsWith(nl)))) return true;
      return /^(?:person|people|man|woman|boy|girl|child|human|face|head|car|vehicle|truck|bus|bike|bicycle|motorcycle|dog|cat|animal|bird|horse|product|bottle|cup|phone|cell\s*phone|laptop|chair|couch|table|bag|backpack|shoe|watch|clock|book|box|item|object|subject|background|scene)(?:\s*#?\s*\d+)?$/i.test(nl);
    };

    const blocks = [];
    for (const rawBlock of rawBlocks) {
      const lines = rawBlock.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1) {
        const grouped = [];
        let currentEntry = [];
        let headerCount = 0;
        for (const line of lines) {
          if (isLineSubjectHeader(line)) {
            headerCount++;
            if (currentEntry.length) {
              grouped.push(currentEntry.join(' ').trim());
            }
            currentEntry = [line];
          } else if (currentEntry.length) {
            currentEntry.push(line);
          } else {
            currentEntry = [line];
          }
        }
        if (currentEntry.length) {
          grouped.push(currentEntry.join(' ').trim());
        }
        if (headerCount >= 2 && grouped.length >= 2) {
          console.log('[VP MultiMode] Split multi-subject block into', grouped.length, 'complete ordered entries (zero lines dropped).');
          blocks.push(...grouped);
          continue;
        }
      }
      blocks.push(rawBlock);
    }

    console.log(`[VP MultiMode] Step 4: Matching ${blocks.length} block(s) against ${subs.length} subject(s)...`);

    const byKey = {};
    const byLabel = {};
    const byNormLabel = {};
    const matchedItems = [];
    const usedSubKeys = new Set();

    blocks.forEach((blockText, idx) => {
      console.log(`[VP MultiMode] Inspecting block #${idx + 1}:`, blockText);

      // Extract label at start (supports colon, dash, or first line)
      let rawLabel = '';
      let descOnly = blockText;

      const colonMatch = blockText.match(/^([^\n:]{1,65}):\s*([\s\S]+)$/);
      const dashMatch = !colonMatch ? blockText.match(/^([^\n–—-]{1,55})\s+[–—-]\s+([\s\S]+)$/) : null;
      const lineMatch = (!colonMatch && !dashMatch) ? blockText.match(/^([^\n]{2,50})\n+([\s\S]+)$/) : null;

      const matchObj = colonMatch || dashMatch || lineMatch;
      if (matchObj) {
        rawLabel = matchObj[1].trim();
        descOnly = matchObj[2].trim();
      }

      const normLabelRaw = normalizeSubjectLabel(rawLabel);
      const normLabel = stripColorBoxSuffix(normLabelRaw);
      console.log(`[VP MultiMode] Block #${idx + 1} extracted label: "${rawLabel}" -> normalized: "${normLabel}" (rawNorm: "${normLabelRaw}")`);

      // 1. Exact normalized label match on unused subject first, then any subject
      let matchedSub = null;
      if (normLabel) {
        matchedSub =
          subs.find((s) => !usedSubKeys.has(s.key) && normalizeSubjectLabel(s.label) === normLabel) ||
          subs.find((s) => normalizeSubjectLabel(s.label) === normLabel);
      }

      // 2. Partial / prefix normalized match on unused subject first (e.g. "Person 1 (orange box)" matching "Person 1")
      if (!matchedSub && normLabel) {
        matchedSub =
          subs.find((s) => {
            if (usedSubKeys.has(s.key)) return false;
            const sn = normalizeSubjectLabel(s.label);
            return sn && (normLabel.startsWith(sn) || sn.startsWith(normLabel));
          }) ||
          subs.find((s) => {
            const sn = normalizeSubjectLabel(s.label);
            return sn && (normLabel.startsWith(sn) || sn.startsWith(normLabel));
          });
      }

      // 2b. Match by box color name if label mentions a color box (e.g. "blue box subject")
      if (!matchedSub && normLabelRaw) {
        matchedSub = subs.find((s) => {
          if (usedSubKeys.has(s.key)) return false;
          const cName = boxColorNameFromHex(s.color || s.uiColor);
          return cName && normLabelRaw.includes(`${cName} box`);
        });
      }

      // 3. Check if the full block text starts with any unused subject's normalized label
      if (!matchedSub) {
        const normFull = stripColorBoxSuffix(normalizeSubjectLabel(blockText.slice(0, 65)));
        matchedSub =
          subs.find((s) => {
            if (usedSubKeys.has(s.key)) return false;
            const sn = normalizeSubjectLabel(s.label);
            return sn && normFull.startsWith(sn);
          }) ||
          subs.find((s) => {
            const sn = normalizeSubjectLabel(s.label);
            return sn && normFull.startsWith(sn);
          });
        if (matchedSub && !rawLabel) {
          const stripRe = new RegExp(`^[\\s*_\\\`#[\\]()]*${matchedSub.label.replace(/\s+/g, '\\s+')}(?:\\s*\\(?[a-z]+\\s+box(?:\\s+subject)?\\)?)?[\\s*_\\\`#[\\]():–—.-]*`, 'i');
          descOnly = blockText.replace(stripRe, '').trim() || blockText;
        }
      }

      // 4. Fallback to positional subject index if not yet matched (strictly preserves original subject order)
      if (!matchedSub) {
        if (subs[idx] && !usedSubKeys.has(subs[idx].key)) {
          matchedSub = subs[idx];
          console.log(`[VP MultiMode] Block #${idx + 1} fell back to positional subject #${idx + 1}: ${matchedSub.label}`);
        } else {
          matchedSub = subs.find((s) => !usedSubKeys.has(s.key)) || subs[idx] || null;
        }
      }

      if (matchedSub) {
        usedSubKeys.add(matchedSub.key);
        // Clean any duplicate leading label or box-color suffix from descOnly without losing any body words
        const dupLabelRe = new RegExp(`^[\\s*_\\\`#[\\]()]*${matchedSub.label.replace(/\s+/g, '\\s+')}(?:\\s*\\(?[a-z]+\\s+box(?:\\s+subject)?\\)?)?[\\s*_\\\`#[\\]():–—.-]*`, 'i');
        const cleanDesc = descOnly
          .replace(dupLabelRe, '')
          .replace(/^(?:\(?[a-z]+\s+box(?:\s+subject)?\)?[\s:–—.-]*)/i, '')
          .trim() || descOnly.trim();
        const formatted = `${matchedSub.label}: ${cleanDesc}`;
        const normKey = normalizeSubjectLabel(matchedSub.label);

        byKey[matchedSub.key] = formatted;
        byLabel[matchedSub.label] = formatted;
        byNormLabel[normKey] = formatted;
        matchedItems.push({
          key: matchedSub.key,
          label: matchedSub.label,
          normLabel: normKey,
          color: matchedSub.color || matchedSub.uiColor || '',
          desc: cleanDesc,
          formatted
        });

        console.log(
          `[VP MultiMode] ✓ Matched block #${idx + 1} -> Subject "${matchedSub.label}" (key=${matchedSub.key}, color=${matchedSub.color || matchedSub.uiColor}):`,
          formatted
        );
      } else {
        console.warn(`[VP MultiMode] ✗ Could not match block #${idx + 1} to any subject:`, blockText);
      }
    });

    // Preserve the exact original subject order in matchedItems and orderedBlocks
    const subjectOrderIndex = new Map(subs.map((s, i) => [s.key, i]));
    matchedItems.sort((a, b) => (subjectOrderIndex.get(a.key) ?? 999) - (subjectOrderIndex.get(b.key) ?? 999));
    const orderedBlocks = matchedItems.length ? matchedItems.map((item) => item.formatted) : blocks;

    console.log('[VP MultiMode] Step 5: Completed matching in strict original order. Final byKey map:', byKey);

    return {
      blocks: orderedBlocks,
      byKey,
      byLabel,
      byNormLabel,
      matchedItems
    };
  }

  // Compute the exact aspect ratio of the main reference image (e.g. "16:9", "4:3", "3:2", "4:5", "1:1", "9:16")
  function getImageAspectRatioInfo(img) {
    const w = (img && (img.naturalWidth || img.width)) || 1024;
    const h = (img && (img.naturalHeight || img.height)) || 1024;
    const r = w / Math.max(1, h);
    const stdRatios = [
      ['1:1', 1 / 1],
      ['4:5', 4 / 5],
      ['5:4', 5 / 4],
      ['3:4', 3 / 4],
      ['4:3', 4 / 3],
      ['2:3', 2 / 3],
      ['3:2', 3 / 2],
      ['16:9', 16 / 9],
      ['9:16', 9 / 16],
      ['21:9', 21 / 9],
      ['6:5', 6 / 5]
    ];
    let best = stdRatios[0];
    let minDiff = Infinity;
    for (const item of stdRatios) {
      const d = Math.abs(r - item[1]);
      if (d < minDiff) {
        minDiff = d;
        best = item;
      }
    }
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(w, h) || 1;
    const exactRatio = `${Math.round(w / g)}:${Math.round(h / g)}`;
    const ratioLabel = minDiff < 0.04 ? best[0] : exactRatio;
    return {
      width: w,
      height: h,
      ratio: ratioLabel,
      exactRatio,
      orientation: w > h * 1.05 ? 'landscape' : h > w * 1.05 ? 'portrait' : 'square'
    };
  }

  // PART 4: Generate Image inside Gemini (Nano Banana 2) or ChatGPT (ChatGPT Image 2 / GPT Image 1.5) in a fresh new chat
  async function runImageGenerationStep(ref, promptObj, imgModelId) {
    const imgModel = IMAGE_GEN_MODELS[imgModelId] || IMAGE_GEN_MODELS.gemini;
    if (!isExtensionConnected()) {
      throw new Error(
        `Chrome Extension is not connected. Install and enable the VisionPilot Chrome Extension to generate images with ${imgModel.fullName}.`
      );
    }
    if (!ref || !ref.img) {
      throw new Error('Please upload a main reference image first before generating an image.');
    }

    const mainImageDataUrl = renderOriginalImageDataUrl(ref.img);
    const aspectInfo = getImageAspectRatioInfo(ref.img);
    const jsonPromptStr =
      typeof promptObj === 'string' && promptObj.trim()
        ? promptObj.trim()
        : JSON.stringify(promptObj || {}, null, 2);

    const instruction =
      `Generate a new photorealistic image using the attached main source image and the following VisionPilot JSON prompt. ` +
      `Keep the exact same aspect ratio as the attached main image (${aspectInfo.ratio}, ${aspectInfo.orientation}, ${aspectInfo.width}x${aspectInfo.height}). ` +
      `Follow every camera angle, subject, focus, lighting, and background setting in this JSON prompt:\n\n` +
      `${jsonPromptStr}`;

    const res = await sendExtensionRequest(
      {
        action: 'generate_image',
        step: 'generate_image',
        refId: ref.id || null,
        model: imgModel.provider,
        imageModelId: imgModel.id,
        imageModelName: imgModel.fullName,
        freshChat: true,
        aspectRatio: aspectInfo.ratio,
        width: aspectInfo.width,
        height: aspectInfo.height,
        images: [
          {
            dataUrl: mainImageDataUrl,
            name: 'main-source-image.png',
            mimeType: 'image/png'
          }
        ],
        instruction
      },
      240000
    );

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Image generation cancelled.');
      err.cancelled = true;
      throw err;
    }
    if (!res || !res.ok || !res.imageDataUrl) {
      throw new Error(
        res?.error || `${imgModel.fullName} failed to generate or return an image.`
      );
    }

    return {
      ok: true,
      imageDataUrl: res.imageDataUrl,
      mainImageDataUrl,
      promptText: jsonPromptStr,
      promptJson: jsonPromptStr,
      modelId: imgModel.id,
      modelName: imgModel.fullName,
      aspectRatio: aspectInfo.ratio,
      createdAt: Date.now()
    };
  }

  const REMOVE_BG_CHATGPT_PROMPT =
    'Accurately isolate the main subject (person or object) with 100% precision. Remove all background elements completely and return the isolated subject as a high-quality PNG image. Upscale the final output resolution to 4K.';

  // Remove Background via ChatGPT (uploads image in the exact same manner as generate_image and sends the 4K cutout prompt)
  async function runRemoveBackgroundStep(ref, opts = {}) {
    const imgModel = IMAGE_GEN_MODELS.gpt;
    if (!isExtensionConnected()) {
      throw new Error(
        'Chrome Extension is not connected. Install and enable the VisionPilot Chrome Extension to remove backgrounds with ChatGPT.'
      );
    }
    if (!ref || !ref.img) {
      throw new Error('Please upload or drop a reference image in Input first before removing the background.');
    }

    const mainImageDataUrl = renderOriginalImageDataUrl(ref.img);
    const aspectInfo = getImageAspectRatioInfo(ref.img);

    const res = await sendExtensionRequest(
      {
        action: 'generate_image',
        step: 'remove_background',
        refId: ref.id || null,
        model: 'gpt',
        imageModelId: 'gpt',
        imageModelName: imgModel.fullName,
        freshChat: true,
        aspectRatio: aspectInfo.ratio,
        width: aspectInfo.width,
        height: aspectInfo.height,
        images: [
          {
            dataUrl: mainImageDataUrl,
            name: 'main-source-image.png',
            mimeType: 'image/png'
          }
        ],
        instruction: REMOVE_BG_CHATGPT_PROMPT
      },
      240000,
      opts.onStage || null
    );

    if (res?.cancelled || ref.cancelled) {
      const err = new Error('Background removal cancelled.');
      err.cancelled = true;
      throw err;
    }
    if (!res || !res.ok || !res.imageDataUrl) {
      throw new Error(
        res?.error || 'ChatGPT failed to process or return the background-removed PNG image.'
      );
    }

    return {
      ok: true,
      imageDataUrl: res.imageDataUrl,
      mainImageDataUrl,
      promptText: REMOVE_BG_CHATGPT_PROMPT,
      modelId: 'gpt',
      modelName: 'ChatGPT Remove BG (4K PNG)',
      aspectRatio: aspectInfo.ratio,
      width: aspectInfo.width,
      height: aspectInfo.height,
      createdAt: Date.now()
    };
  }

  // Retry without generating again: pick up the image ChatGPT already made in the last image chat
  async function recoverRemovedBackground(opts = {}) {
    const res = await sendExtensionRequest({ action: 'recover_image', model: 'gpt' }, 60000, opts.onStage || null);
    if (!res || !res.ok || !res.imageDataUrl) throw new Error(res?.error || 'No finished image was found in ChatGPT.');
    return res;
  }

  // Minimal CRC32 + Uncompressed ZIP generator for downloading the real extension files
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
      const dataBytes = f.bytes instanceof Uint8Array ? f.bytes : enc.encode(f.content || '');
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

  // the zip the GitHub build makes from the extension folder (scripts/build-site.mjs): always complete
  async function downloadPrebuiltExtensionZip() {
    try {
      const res = await fetch('visionpilot-ai-bridge-extension.zip', { cache: 'no-store' });
      if (!res.ok) return false;
      const blob = await res.blob();
      if (blob.size < 1000) return false;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'visionpilot-ai-bridge-extension.zip';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
      return true;
    } catch (e) {
      return false;
    }
  }

  // every file the extension's manifest names (scripts, popup, icons), plus the popup's own files
  async function extensionFileNames() {
    const names = new Set(['manifest.json', 'popup.html', 'popup.js', 'visionpilot-app-icon.svg', 'visionpilot-icon-dark.svg']);
    try {
      const m = await fetch('extension/manifest.json', { cache: 'no-store' }).then(r => r.json());
      if (m.background && m.background.service_worker) names.add(m.background.service_worker);
      (m.content_scripts || []).forEach(cs => (cs.js || []).concat(cs.css || []).forEach(f => names.add(f)));
      if (m.action && m.action.default_popup) names.add(m.action.default_popup);
      [m.icons, m.action && m.action.default_icon].forEach(ic => { if (ic && typeof ic === 'object') Object.values(ic).forEach(f => names.add(f)); });
    } catch (e) {}
    return [...names];
  }

  async function downloadExtensionZip() {
    if (await downloadPrebuiltExtensionZip()) return;
    const fileNames = await extensionFileNames();
    const files = [];
    for (const name of fileNames) {
      try {
        const res = await fetch(`extension/${name}`, { cache: 'no-store' });
        if (res.ok) {
          if (name.endsWith('.png')) {
            const buf = await res.arrayBuffer();
            files.push({ name, bytes: new Uint8Array(buf) });
          } else {
            const content = await res.text();
            files.push({ name, content });
          }
        }
      } catch (e) {}
    }
    if (!files.length) {
      throw new Error('Could not load extension files to package ZIP.');
    }
    const blob = buildZipBlob(files);
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
  }

  window.VPAIBridge = {
    AI_MODELS,
    IMAGE_GEN_MODELS,
    STEP_1_REFERENCE_INSTRUCTION,
    STEP_2_SINGLE_FOCUS_INSTRUCTION,
    STEP_3_MULTI_FOCUS_INSTRUCTION,
    REMOVE_BG_CHATGPT_PROMPT,
    getModelInfo: (id) => AI_MODELS[id] || AI_MODELS.visionpilot,
    getImageModelInfo: (id) => IMAGE_GEN_MODELS[id] || IMAGE_GEN_MODELS.gemini,
    getImageAspectRatioInfo,
    boxColorNameFromHex,
    normalizeSubjectLabel,
    isExtensionConnected,
    verifyExtensionInstalled,
    cancelPendingRequests,
    connectModel,
    runReferenceImageStep,
    runSingleFocusStep,
    runMultiFocusStep,
    runImageGenerationStep,
    runRemoveBackgroundStep,
    recoverRemovedBackground,
    renderOriginalImageDataUrl,
    renderMarkerScreenshotDataUrl,
    renderLabeledBoxesScreenshotDataUrl,
    downloadExtensionZip
  };
})();
