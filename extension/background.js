// VisionPilot AI Bridge — Background Service Worker (v2.0.0)
// Real browser-tab automation for Claude (claude.ai), ChatGPT (chatgpt.com), and Gemini (gemini.google.com).
// Zero API keys, zero fake/mock responses.

const PROVIDERS = {
  claude: {
    id: 'claude',
    name: 'Claude',
    newChatUrl: 'https://claude.ai/new',
    matchUrls: ['https://claude.ai/*'],
    scriptFile: 'claude-content.js'
  },
  gpt: {
    id: 'gpt',
    name: 'ChatGPT',
    newChatUrl: 'https://chatgpt.com/',
    matchUrls: ['https://chatgpt.com/*', 'https://chat.openai.com/*'],
    scriptFile: 'chatgpt-content.js'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    newChatUrl: 'https://gemini.google.com/app',
    matchUrls: ['https://gemini.google.com/*'],
    scriptFile: 'gemini-content.js'
  },
  flow: {
    id: 'flow',
    name: 'Google Flow',
    newChatUrl: 'https://labs.google/fx/tools/flow',
    matchUrls: ['https://labs.google/*', 'https://flow.google.com/*', 'https://*.flow.google.com/*'],
    scriptFile: 'flow-content.js'
  }
};

// ---------- link to the VisionPilot desktop app (Windows / macOS / Linux) ----------
// The desktop app listens on this computer only (127.0.0.1). This browser keeps a connection to it, so the app can send
// prompts and image jobs that run here, in the browser where you are signed in to ChatGPT, Claude and Gemini.
const DESKTOP_PORT = 47821;
const desktopLink = { ws: null, connected: false, send: null, probing: false };
// Chrome writes "WebSocket connection ... failed: ERR_CONNECTION_REFUSED" to the extension Errors page every time a
// WebSocket fails, even inside try/catch. So first check quietly with fetch (a caught fetch failure is not logged) and
// only open the WebSocket when the desktop app is really listening. Any HTTP reply (the app answers 426) means it is up.
async function desktopAppListening() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    await fetch(`http://127.0.0.1:${DESKTOP_PORT}/vp-extension`, { method: 'GET', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
async function connectDesktop() {
  if (desktopLink.ws && desktopLink.ws.readyState <= 1) return;
  if (desktopLink.probing) return;
  desktopLink.probing = true;
  let up = false;
  try { up = await desktopAppListening(); } finally { desktopLink.probing = false; }
  if (!up) return; // desktop app is not running: stay silent, try again on the next alarm
  if (desktopLink.ws && desktopLink.ws.readyState <= 1) return;
  let ws;
  try { ws = new WebSocket(`ws://127.0.0.1:${DESKTOP_PORT}/vp-extension`); } catch (e) { return; }
  desktopLink.ws = ws;
  ws.onopen = () => {
    desktopLink.connected = true;
    desktopLink.send = (m) => { try { ws.send(JSON.stringify(m)); } catch (e) {} };
    desktopLink.send({ type: 'hello', version: chrome.runtime.getManifest().version, models: ['claude', 'gpt', 'gemini', 'flow'] });
  };
  ws.onmessage = async (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type === 'ping') { desktopLink.send?.({ type: 'pong' }); return; }
    if (m.type !== 'request' || !m.id) return;
    const result = await handleBridgeRequest({ ...(m.payload || {}), reqId: m.payload?.reqId || m.id }, null).catch((err) => ({ ok: false, error: err?.message || String(err) }));
    desktopLink.send?.({ type: 'response', id: m.id, result });
  };
  ws.onclose = ws.onerror = () => {
    desktopLink.connected = false;
    desktopLink.send = null;
    if (desktopLink.ws === ws) desktopLink.ws = null;
    setTimeout(connectDesktop, 2500);
  };
}
// Always reuse the user's already-open normal Chrome window (with their active profile/session data)
// instead of spawning a new blank browser window.
async function desktopWorkWindow() {
  try {
    const lastFocused = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (lastFocused && typeof lastFocused.id === 'number') return lastFocused.id;
  } catch (e) {}
  try {
    const allNormal = await chrome.windows.getAll({ windowTypes: ['normal'] });
    if (allNormal && allNormal.length > 0) return allNormal[0].id;
  } catch (e) {}
  return undefined;
}
// try now, on browser start, and every 30 s (a live connection also keeps this worker awake)
connectDesktop();
chrome.runtime.onStartup?.addListener(connectDesktop);
chrome.runtime.onInstalled?.addListener(connectDesktop);
try { chrome.alarms.create('vp-desktop-link', { periodInMinutes: 0.5 }); chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'vp-desktop-link') connectDesktop(); }); } catch (e) {}

const activeProviderTabIds = {
  claude: null,
  gpt: null,
  gemini: null,
  flow: null
};

// Track whether each provider tab has been started as a fresh new chat in this session
const freshChatStarted = {
  claude: false,
  gpt: false,
  gemini: false,
  flow: false
};

const knownVisionPilotTabIds = new Set();
let vpTabGroupId = null;

// Cancellation tracking for CHANGE 2 (Cross button cancels pending requests)
let cancelEpoch = 0;
const cancelledRefIds = new Set();
const cancelledReqIds = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isProviderUrl(url) {
  if (!url) return false;
  return /^https:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com|labs\.google|(?:[\w-]+\.)?flow\.google\.com)\//i.test(url);
}

function isVisionPilotTab(tab) {
  if (!tab || !tab.id) return false;
  if (knownVisionPilotTabIds.has(tab.id)) return true;
  const title = String(tab.title || '');
  const url = String(tab.url || '');
  if (/visionpilot/i.test(title) && !isProviderUrl(url)) return true;
  if (/visionpilot/i.test(url) && !isProviderUrl(url)) return true;
  return false;
}

async function injectVisionPilotContentScripts() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (/^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) continue;
      if (isProviderUrl(tab.url)) continue;
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      } catch (e) {}
    }
  } catch (e) {}
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ vpBridgeInstalled: true, vpActiveModel: 'visionpilot' });
  injectVisionPilotContentScripts();
});

chrome.runtime.onStartup.addListener(() => {
  injectVisionPilotContentScripts();
});

let ownedStateRestored = false;
async function saveOwnedTabState() {
  try {
    await chrome.storage.local.set({
      vpOwnedProviderTabIds: { ...activeProviderTabIds },
      vpOwnedTabGroupId: vpTabGroupId
    });
  } catch (e) {}
}

async function restoreOwnedTabState() {
  if (ownedStateRestored) return;
  ownedStateRestored = true;
  try {
    const st = await chrome.storage.local.get(['vpOwnedProviderTabIds', 'vpOwnedTabGroupId']);
    if (st && typeof st.vpOwnedTabGroupId === 'number' && st.vpOwnedTabGroupId >= 0 && vpTabGroupId === null) {
      vpTabGroupId = st.vpOwnedTabGroupId;
    }
    if (st && st.vpOwnedProviderTabIds && typeof st.vpOwnedProviderTabIds === 'object') {
      for (const k of Object.keys(activeProviderTabIds)) {
        if (!activeProviderTabIds[k] && st.vpOwnedProviderTabIds[k]) {
          try {
            const t = await chrome.tabs.get(st.vpOwnedProviderTabIds[k]);
            if (t && t.id && isProviderUrl(t.url)) {
              activeProviderTabIds[k] = t.id;
              freshChatStarted[k] = true;
            }
          } catch (e) {}
        }
      }
    }
  } catch (e) {}
}

async function getOwnedProviderTab(model) {
  await restoreOwnedTabState();
  const prov = PROVIDERS[model];
  if (!prov) return null;

  // For Google Flow, ALWAYS reuse any existing open Google Flow tab (especially the Visionpilot project tab)
  // rather than ever opening a duplicate Google Flow tab.
  if (model === 'flow') {
    try {
      const allTabs = await chrome.tabs.query({});
      const flowTabs = (allTabs || []).filter(
        (t) => t && t.id && /^https:\/\/(labs\.google\/fx\/tools\/flow|(?:[\w-]+\.)?flow\.google\.com)/i.test(t.url || '')
      );
      if (flowTabs.length > 0) {
        flowTabs.sort((a, b) => {
          const aScore = (/\/project\//i.test(a.url || '') ? 10 : 0) + (/visionpilot/i.test(a.title || '') ? 5 : 0);
          const bScore = (/\/project\//i.test(b.url || '') ? 10 : 0) + (/visionpilot/i.test(b.title || '') ? 5 : 0);
          return bScore - aScore;
        });
        const bestFlowTab = flowTabs[0];
        // Clean up any duplicate extra Google Flow tabs opened earlier so only 1 Flow tab remains
        if (flowTabs.length > 1) {
          for (let i = 1; i < flowTabs.length; i++) {
            try { await chrome.tabs.remove(flowTabs[i].id); } catch (e) {}
          }
        }
        activeProviderTabIds.flow = bestFlowTab.id;
        freshChatStarted.flow = true;
        await saveOwnedTabState();
        return bestFlowTab;
      }
    } catch (e) {}
  }

  if (activeProviderTabIds[model]) {
    try {
      const t = await chrome.tabs.get(activeProviderTabIds[model]);
      if (t && t.id) return t;
    } catch (e) {
      activeProviderTabIds[model] = null;
      freshChatStarted[model] = false;
    }
  }

  // Also check if a tab for this provider already exists inside our dedicated VisionPilot AI tab group
  if (typeof vpTabGroupId === 'number' && vpTabGroupId >= 0) {
    try {
      const groupedTabs = await chrome.tabs.query({ groupId: vpTabGroupId });
      const match = (groupedTabs || []).find((t) => {
        if (!t || !t.id || !t.url) return false;
        if (model === 'flow') return /^https:\/\/(labs\.google\/fx\/tools\/flow|(?:[\w-]+\.)?flow\.google\.com)/i.test(t.url);
        if (model === 'claude') return /^https:\/\/claude\.ai\//i.test(t.url);
        if (model === 'gpt') return /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(t.url);
        if (model === 'gemini') return /^https:\/\/gemini\.google\.com\//i.test(t.url);
        return false;
      });
      if (match) {
        activeProviderTabIds[model] = match.id;
        freshChatStarted[model] = true;
        await saveOwnedTabState();
        return match;
      }
    } catch (e) {}
  }

  return null;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  knownVisionPilotTabIds.delete(tabId);
  let changed = false;
  for (const k of Object.keys(activeProviderTabIds)) {
    if (activeProviderTabIds[k] === tabId) {
      activeProviderTabIds[k] = null;
      freshChatStarted[k] = false;
      changed = true;
    }
  }
  if (changed) saveOwnedTabState();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!desktopLink.connected) connectDesktop();
  if (changeInfo.status === 'complete' && tab?.url) {
    if (/^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) return;
    if (!isProviderUrl(tab.url)) {
      if (/visionpilot/i.test(tab.title || '') || /visionpilot/i.test(tab.url || '')) {
        knownVisionPilotTabIds.add(tabId);
      }
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).catch(() => {});
    }
  }
});

// Put VisionPilot and ONLY the provider tabs opened by VisionPilot into one dedicated Chrome tab group.
// Never pull in pre-existing ChatGPT, Gemini, Claude, or Flow tabs that the user already had open outside the group.
async function ensureVisionPilotTabGroup(senderTabId = null, extraTabIds = []) {
  try {
    await restoreOwnedTabState();
    if (senderTabId) knownVisionPilotTabIds.add(senderTabId);

    const allTabs = await chrome.tabs.query({});
    const vpTabs = allTabs.filter((t) => isVisionPilotTab(t));
    const ownedIds = Object.values(activeProviderTabIds).filter(Boolean);
    const ownedProviderTabs = allTabs.filter((t) => t.id && ownedIds.includes(t.id));

    // Determine target windowId (prefer senderTab's window, then first VisionPilot tab's window, then first owned provider tab's window)
    let targetWindowId = null;
    if (senderTabId) {
      const senderTab = allTabs.find((t) => t.id === senderTabId);
      if (senderTab && senderTab.windowId !== undefined) targetWindowId = senderTab.windowId;
    }
    if (targetWindowId === null && vpTabs.length > 0) {
      targetWindowId = vpTabs[0].windowId;
    }
    if (targetWindowId === null && ownedProviderTabs.length > 0) {
      targetWindowId = ownedProviderTabs[0].windowId;
    }

    const tabIdsSet = new Set();
    for (const t of vpTabs) {
      if (targetWindowId === null || t.windowId === targetWindowId) tabIdsSet.add(t.id);
    }
    for (const t of ownedProviderTabs) {
      if (targetWindowId === null || t.windowId === targetWindowId) tabIdsSet.add(t.id);
    }
    for (const id of extraTabIds) {
      if (!id) continue;
      const t = allTabs.find((x) => x.id === id);
      if (t && (targetWindowId === null || t.windowId === targetWindowId)) {
        tabIdsSet.add(id);
      }
    }

    const tabIds = Array.from(tabIdsSet);
    if (!tabIds.length) return null;

    // Find an existing valid groupId among our owned tabs or vpTabGroupId
    let groupIdToUse = null;
    if (typeof vpTabGroupId === 'number' && vpTabGroupId >= 0) {
      try {
        const g = await chrome.tabGroups.get(vpTabGroupId);
        if (g && (targetWindowId === null || g.windowId === targetWindowId)) {
          groupIdToUse = g.id;
        }
      } catch (e) {
        vpTabGroupId = null;
      }
    }

    if (groupIdToUse === null && chrome.tabGroups && typeof chrome.tabGroups.query === 'function') {
      try {
        const groups = await chrome.tabGroups.query(targetWindowId !== null ? { windowId: targetWindowId } : {});
        const existingVpGroup = groups.find((g) => /^visionpilot\s+ai$/i.test((g.title || '').trim()));
        if (existingVpGroup) groupIdToUse = existingVpGroup.id;
      } catch (e) {}
    }

    const groupOpts = groupIdToUse !== null
      ? { groupId: groupIdToUse, tabIds }
      : { tabIds };
    if (groupIdToUse === null && targetWindowId !== null) {
      groupOpts.createProperties = { windowId: targetWindowId };
    }

    const finalGroupId = await chrome.tabs.group(groupOpts);
    vpTabGroupId = finalGroupId;
    await saveOwnedTabState();

    if (chrome.tabGroups && typeof chrome.tabGroups.update === 'function') {
      try {
        await chrome.tabGroups.update(finalGroupId, {
          title: 'VisionPilot AI',
          color: 'orange',
          collapsed: false
        });
      } catch (e) {}
    }

    console.log('[VP Background] Grouped tabs in VisionPilot AI group (groupId=' + finalGroupId + '):', tabIds);
    return finalGroupId;
  } catch (err) {
    console.warn('[VP Background] Tab grouping warning:', err?.message || err);
    return null;
  }
}

// Wait for a tab to reach status === 'complete'
async function waitForTabComplete(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (!tab) throw new Error('AI tab was closed before loading completed.');
      if (tab.status === 'complete') return tab;
    } catch (e) {
      throw new Error('AI tab was closed or could not be accessed.');
    }
    await sleep(300);
  }
  return await chrome.tabs.get(tabId);
}

// Inject MAIN-world clipboard writeText + execCommand('copy') hook AND MAIN-world file attachment helper
async function injectProviderHelpers(tabId, scriptFile) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if (!window.__vpClipboardHookInstalled) {
          window.__vpClipboardHookInstalled = true;
          const recordCopiedText = (txt) => {
            try {
              const s = String(txt ?? '');
              if (s && document.documentElement) {
                document.documentElement.dataset.vpLastCopied = s;
              }
            } catch (e) {}
          };
          try {
            if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
              const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
              navigator.clipboard.writeText = async function (text) {
                recordCopiedText(text);
                try {
                  return await origWriteText(text);
                } catch (e) {
                  return undefined;
                }
              };
            }
          } catch (e) {}
          try {
            if (navigator.clipboard && typeof navigator.clipboard.write === 'function') {
              const origWrite = navigator.clipboard.write.bind(navigator.clipboard);
              navigator.clipboard.write = async function (items) {
                try {
                  if (Array.isArray(items)) {
                    for (const item of items) {
                      if (item && typeof item.getType === 'function' && item.types?.includes('text/plain')) {
                        const blob = await item.getType('text/plain');
                        if (blob && typeof blob.text === 'function') {
                          const t = await blob.text();
                          if (t) recordCopiedText(t);
                        }
                      }
                    }
                  }
                } catch (e) {}
                try {
                  return await origWrite(items);
                } catch (e) {
                  return undefined;
                }
              };
            }
          } catch (e) {}
          try {
            document.addEventListener(
              'copy',
              (ev) => {
                try {
                  if (ev.clipboardData && typeof ev.clipboardData.setData === 'function' && !ev.clipboardData.__vpHooked) {
                    const origSetData = ev.clipboardData.setData.bind(ev.clipboardData);
                    ev.clipboardData.__vpHooked = true;
                    ev.clipboardData.setData = function (format, data) {
                      if (/text\/plain|text/i.test(String(format || '')) && data) {
                        recordCopiedText(data);
                      }
                      return origSetData(format, data);
                    };
                  }
                  const sel = window.getSelection ? window.getSelection().toString() : '';
                  if (sel) recordCopiedText(sel);
                } catch (e) {}
              },
              true
            );
          } catch (e) {}
          try {
            const origExecCommand = document.execCommand.bind(document);
            document.execCommand = function (cmd, showUI, val) {
              if (String(cmd).toLowerCase() === 'copy') {
                try {
                  const sel = window.getSelection ? window.getSelection().toString() : '';
                  if (sel) recordCopiedText(sel);
                } catch (e) {}
              }
              return origExecCommand(cmd, showUI, val);
            };
          } catch (e) {}
        }

        if (!window.__vpMainWorldUploadInstalled) {
          window.__vpMainWorldUploadInstalled = true;
          window.addEventListener('vp-main-world-attach-files', (ev) => {
            try {
              const detail = ev.detail || {};
              const images = Array.isArray(detail.images) ? detail.images : [];
              const strategy = detail.strategy || 'input';
              if (!images.length) return;

              const files = images.map((img, i) => {
                const parts = String(img.dataUrl || '').split(',');
                const mimeMatch = (parts[0] || '').match(/:(.*?);/);
                const mime = (mimeMatch && mimeMatch[1]) || 'image/png';
                const bstr = atob(parts[1] || '');
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) u8arr[n] = bstr.charCodeAt(n);
                return new window.File([u8arr], img.name || `image-${i + 1}.png`, {
                  type: mime,
                  lastModified: Date.now()
                });
              });

              const dt = new window.DataTransfer();
              files.forEach((f) => dt.items.add(f));

              const editor =
                document.querySelector('#prompt-textarea') ||
                document.querySelector('div[contenteditable="true"][id="prompt-textarea"]') ||
                document.querySelector('form div[contenteditable="true"]') ||
                document.querySelector('div[contenteditable="true"]');

              const composer =
                (editor && (editor.closest('form') || editor.closest('[class*="composer" i]'))) ||
                document.querySelector('form') ||
                document.body;

              if (strategy === 'input') {
                let inputs = Array.from(composer.querySelectorAll('input[type="file"]'));
                if (!inputs.length) {
                  inputs = Array.from(document.querySelectorAll('input[type="file"]'));
                }
                inputs.sort((a, b) => {
                  const aScore = (a.multiple ? 2 : 0) + (/image/i.test(a.accept || '') ? 3 : 0);
                  const bScore = (b.multiple ? 2 : 0) + (/image/i.test(b.accept || '') ? 3 : 0);
                  return bScore - aScore;
                });
                const idx = typeof detail.inputIndex === 'number' ? detail.inputIndex : 0;
                const targetInput = inputs[idx] || inputs[0];
                if (targetInput) {
                  try {
                    targetInput.value = '';
                  } catch (e) {}
                  try {
                    targetInput.multiple = true;
                  } catch (e) {}
                  try {
                    if (targetInput._valueTracker && typeof targetInput._valueTracker.setValue === 'function') {
                      targetInput._valueTracker.setValue('');
                    }
                  } catch (e) {}
                  const nativeSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype,
                    'files'
                  )?.set;
                  if (nativeSetter) {
                    nativeSetter.call(targetInput, dt.files);
                  } else {
                    targetInput.files = dt.files;
                  }
                  targetInput.dispatchEvent(new window.Event('input', { bubbles: true, composed: true }));
                  targetInput.dispatchEvent(new window.Event('change', { bubbles: true, composed: true }));
                  return;
                }
              }

              if (strategy === 'paste' && editor) {
                editor.focus();
                const pasteEv = new window.ClipboardEvent('paste', {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  clipboardData: dt
                });
                try {
                  if (!pasteEv.clipboardData || !pasteEv.clipboardData.files || !pasteEv.clipboardData.files.length) {
                    Object.defineProperty(pasteEv, 'clipboardData', { value: dt, configurable: true });
                  }
                } catch (e) {}
                editor.dispatchEvent(pasteEv);
                return;
              }

              if (strategy === 'drop') {
                const dropTarget = editor || composer || document.body;
                for (const type of ['dragenter', 'dragover', 'drop']) {
                  const dropEv = new window.DragEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    composed: true,
                    dataTransfer: dt
                  });
                  try {
                    if (!dropEv.dataTransfer || !dropEv.dataTransfer.files || !dropEv.dataTransfer.files.length) {
                      Object.defineProperty(dropEv, 'dataTransfer', { value: dt, configurable: true });
                    }
                  } catch (e) {}
                  dropTarget.dispatchEvent(dropEv);
                }
              }
             } catch (err) {
               console.warn('[VP MAIN Upload] Error:', err);
             }
           });

          // MAIN-world generated image reader (converts blob: or page <img> into base64 dataUrl)
          window.addEventListener('vp-main-world-read-image', async (ev) => {
            try {
              const detail = ev.detail || {};
              const src = detail.src || '';
              if (!src) return;
              document.documentElement.dataset.vpExtractedImageDataUrl = '';

              // 1. Try fetch(src) in MAIN world (works for blob: URLs owned by the page and same-origin/CORS URLs)
              try {
                const resp = await window.fetch(src, { credentials: 'include' });
                if (resp.ok) {
                  const blob = await resp.blob();
                  const dataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(String(reader.result || ''));
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(blob);
                  });
                  if (dataUrl && dataUrl.startsWith('data:image/')) {
                    document.documentElement.dataset.vpExtractedImageDataUrl = dataUrl;
                    return;
                  }
                }
              } catch (e) {}

              // 2. Fallback: find matching <img> in DOM and draw to <canvas>
              const imgs = Array.from(document.querySelectorAll('img'));
              const matchImg = imgs.find((im) => im.currentSrc === src || im.src === src);
              if (matchImg && matchImg.naturalWidth > 0 && matchImg.naturalHeight > 0) {
                const c = document.createElement('canvas');
                c.width = matchImg.naturalWidth;
                c.height = matchImg.naturalHeight;
                const ctx = c.getContext('2d');
                ctx.drawImage(matchImg, 0, 0);
                const dUrl = c.toDataURL('image/png');
                if (dUrl && dUrl.startsWith('data:image/')) {
                  document.documentElement.dataset.vpExtractedImageDataUrl = dUrl;
                }
              }
            } catch (e) {}
          });
        }

        const installFlowTrustedSubmitPatch = () => {
          try {
            for (const winKey of Object.getOwnPropertyNames(window)) {
              if (!/^default_|AiSandbox/i.test(winKey)) continue;
              const ns = window[winKey];
              if (!ns || typeof ns !== 'object') continue;
              for (const prop of Object.getOwnPropertyNames(ns)) {
                try {
                  const cls = ns[prop];
                  if (typeof cls !== 'function' || !cls.prototype || typeof cls.prototype.submit !== 'function') continue;
                  const fnStr = Function.prototype.toString.call(cls.prototype.submit);
                  if (!fnStr.includes('isTrusted') && !fnStr.includes('.prompt.') && !fnStr.includes('.xh.emit')) continue;
                  if (!cls.prototype.submit.__vpWrapped) {
                    const origSubmit = cls.prototype.submit;
                    const wrappedSubmit = function (a) {
                      window.__vpFlowPromptBox = this;
                      const trustedEvent =
                        a && typeof a === 'object' && a.isTrusted === true
                          ? a
                          : {
                              isTrusted: true,
                              type: (a && a.type) || 'click',
                              target: (a && a.target) || null,
                              currentTarget: (a && a.currentTarget) || null,
                              preventDefault() {},
                              stopPropagation() {},
                              stopImmediatePropagation() {}
                            };
                      return origSubmit.call(this, trustedEvent);
                    };
                    wrappedSubmit.__vpWrapped = true;
                    cls.prototype.submit = wrappedSubmit;
                  }
                  for (const m of ['isDisabled', 'Le', 'Nk', 'clear']) {
                    if (typeof cls.prototype[m] === 'function' && !cls.prototype[m].__vpWrapped) {
                      const origM = cls.prototype[m];
                      const wrappedM = function (...args) {
                        window.__vpFlowPromptBox = this;
                        return origM.apply(this, args);
                      };
                      wrappedM.__vpWrapped = true;
                      cls.prototype[m] = wrappedM;
                    }
                  }
                } catch (e) {}
              }
            }
          } catch (e) {}
        };
        installFlowTrustedSubmitPatch();

        if (!window.__vpFlowMainHooksInstalled) {
          window.__vpFlowMainHooksInstalled = true;
          window.addEventListener('vp-main-world-type-prompt', (ev) => {
            try {
              installFlowTrustedSubmitPatch();
              const detail = ev?.detail || {};
              const text = String(detail.text || '');
              const target =
                document.querySelector('[aria-label="What do you want to create?"]') ||
                document.querySelector('div.ProseMirror[contenteditable="true"]') ||
                document.querySelector('div[contenteditable="true"][role="textbox"]') ||
                document.querySelector('textarea');
              if (!target) return;
              target.focus();

              const pmView =
                target.pmViewDesc?.view ||
                target.querySelector?.('*')?.pmViewDesc?.view ||
                target.__pmView;
              if (pmView && pmView.state && typeof pmView.dispatch === 'function') {
                const tr = pmView.state.tr.insertText(text, 0, pmView.state.doc.content.size);
                pmView.dispatch(tr);
                document.documentElement.dataset.vpPromptTypedMethod = 'pmView';
                return;
              }

              try {
                const sel = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(target);
                sel.removeAllRanges();
                sel.addRange(range);
              } catch (e) {}

              const dt = new window.DataTransfer();
              dt.setData('text/plain', text);
              const pasteEv = new window.ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                composed: true,
                clipboardData: dt
              });
              try {
                if (!pasteEv.clipboardData || !pasteEv.clipboardData.getData('text/plain')) {
                  Object.defineProperty(pasteEv, 'clipboardData', { value: dt, configurable: true });
                }
              } catch (e) {}
              target.dispatchEvent(pasteEv);
              if ((target.innerText || target.textContent || '').trim().includes(text.slice(0, 12))) {
                document.documentElement.dataset.vpPromptTypedMethod = 'mainPaste';
                return;
              }

              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(target);
              sel.removeAllRanges();
              sel.addRange(range);
              document.execCommand('insertText', false, text);
              document.documentElement.dataset.vpPromptTypedMethod = 'mainExecCommand';
            } catch (err) {
              document.documentElement.dataset.vpPromptTypedMethod = 'error:' + (err?.message || String(err));
            }
          });

          window.addEventListener('vp-main-world-submit-flow', () => {
            try {
              installFlowTrustedSubmitPatch();
              const boxEl = document.querySelector('flow-base-prompt-box');
              if (boxEl && !window.__vpFlowPromptBox) {
                try { boxEl.click(); } catch (e) {}
              }
              const sb = document.querySelector('button[aria-label="Start generation"]');
              if (sb && !sb.disabled && sb.getAttribute('aria-disabled') !== 'true') {
                sb.click();
              }
              setTimeout(() => {
                try {
                  const ed = document.querySelector('[aria-label="What do you want to create?"]') || document.querySelector('div.ProseMirror[contenteditable="true"]');
                  const remTxt = ed ? (ed.innerText || ed.textContent || '').trim() : '';
                  if (remTxt.length > 0 && window.__vpFlowPromptBox && typeof window.__vpFlowPromptBox.submit === 'function') {
                    window.__vpFlowPromptBox.submit({
                      isTrusted: true,
                      type: 'click',
                      preventDefault() {},
                      stopPropagation() {},
                      stopImmediatePropagation() {}
                    });
                  }
                } catch (e) {}
              }, 150);
            } catch (e) {}
          });
        }

        // MAIN-world Google Flow 2K / 4K upscale download interceptor (bypasses CSP via chrome.scripting world: 'MAIN')
        if (!window.__vpFlowDlHooked) {
          window.__vpFlowDlHooked = true;
          const blobMap = new Map();
          const emitCapturedUpscale = (dataUrl, url = '', nativeDownloadTriggered = true) => {
            if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return;
            try {
              document.documentElement.dataset.vpFlowUpscaleDataUrl = dataUrl;
              window.postMessage({
                __vpFlowUpscaleCaptured: true,
                dataUrl,
                url: url || '',
                nativeDownloadTriggered: Boolean(nativeDownloadTriggered)
              }, '*');
            } catch (_) {}
          };
          const readBlobToDataUrl = (blob, url = '', nativeDownloadTriggered = true) => {
            try {
              if (!blob || !(blob instanceof Blob) || blob.size < 15000) return;
              const reader = new FileReader();
              reader.onloadend = () => {
                if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
                  emitCapturedUpscale(reader.result, url, nativeDownloadTriggered);
                }
              };
              reader.readAsDataURL(blob);
            } catch (_) {}
          };

          const origCreateObjectURL = URL.createObjectURL.bind(URL);
          URL.createObjectURL = function (obj) {
            const objectUrl = origCreateObjectURL(obj);
            try {
              if (obj instanceof Blob && obj.size > 15000) {
                blobMap.set(objectUrl, obj);
                setTimeout(() => blobMap.delete(objectUrl), 120000);
                if (document.documentElement.dataset.vpFlowUpscaleWatching === 'true' || document.documentElement.dataset.vpFlowCapturingUpscale === 'true') {
                  readBlobToDataUrl(obj, objectUrl, true);
                }
              }
            } catch (_) {}
            return objectUrl;
          };

          const origA = HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click = function (...args) {
            try {
              const href = this && this.href ? String(this.href) : '';
              const isWatching = document.documentElement.dataset.vpFlowUpscaleWatching === 'true' || document.documentElement.dataset.vpFlowCapturingUpscale === 'true';
              if (href && (this.hasAttribute('download') || isWatching || /blob:|googleusercontent|storage\.googleapis|labs\.google|flow\.google/i.test(href))) {
                document.documentElement.dataset.vpFlowUpscaleUrl = href;
                if (isWatching) {
                  if (blobMap.has(href)) {
                    readBlobToDataUrl(blobMap.get(href), href, true);
                  } else if (href.startsWith('data:image/')) {
                    emitCapturedUpscale(href, href, true);
                  } else {
                    fetch(href)
                      .then(r => (r.ok ? r.blob() : null))
                      .then(b => { if (b) readBlobToDataUrl(b, href, true); })
                      .catch(() => {});
                  }
                }
              }
             } catch (_) {}
             return origA.apply(this, args);
           };
         }
       }
    });
  } catch (e) {}

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [scriptFile]
  });
}

// CHANGE 3: Open or reuse the provider's tab, ALWAYS navigating to a fresh new chat URL,
// and placing VisionPilot + Claude + ChatGPT + Gemini tabs together in one Chrome tab group.
async function ensureFreshProviderChatTab(model, options = {}) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unknown AI model: ${model}` };
  }

  const senderTabId = options.senderTabId || null;
  if (senderTabId) knownVisionPilotTabIds.add(senderTabId);

  let targetWindowId = undefined;
  if (senderTabId) {
    try {
      const sTab = await chrome.tabs.get(senderTabId);
      if (sTab && sTab.windowId !== undefined) targetWindowId = sTab.windowId;
    } catch (e) {}
  } else {
    // Request from the desktop app or popup: always reuse the user's open normal Chrome window
    targetWindowId = await desktopWorkWindow();
  }

  // For Google Flow ('flow'), reuse the stored Visionpilot project URL if available and NEVER reset an existing Flow project tab
  let targetUrl = prov.newChatUrl;
  if (model === 'flow') {
    try {
      const st = await chrome.storage.local.get(['vpFlowProjectUrl']);
      if (st?.vpFlowProjectUrl && /^https:\/\/(labs\.google\/fx\/tools\/flow|(?:[\w-]+\.)?flow\.google\.com)/i.test(st.vpFlowProjectUrl)) {
        targetUrl = st.vpFlowProjectUrl;
      }
    } catch (e) {}
  }

  let tab = null;
  try {
    tab = await getOwnedProviderTab(model);
    if (tab) {
      // Reuse our dedicated extension-owned tab for this provider inside the VisionPilot AI group
      if (model === 'flow' && /^https:\/\/(labs\.google\/fx\/tools\/flow|(?:[\w-]+\.)?flow\.google\.com)/i.test(tab.url || '')) {
        console.log(`[VP Background] Reusing existing Google Flow Visionpilot tab (id=${tab.id}) without opening a new tab or project: ${tab.url}`);
        if (options.focusTab) {
          tab = await chrome.tabs.update(tab.id, { active: true });
          if (tab.windowId !== undefined) {
            try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
          }
        }
      } else {
        console.log(`[VP Background] Reusing dedicated ${prov.name} group tab (id=${tab.id}) and navigating to: ${targetUrl}`);
        tab = await chrome.tabs.update(tab.id, {
          url: targetUrl,
          active: Boolean(options.focusTab)
        });
        if (options.focusTab && tab.windowId !== undefined) {
          try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
        }
      }
    } else {
      // Open a brand new tab dedicated to the VisionPilot AI group (never hijacking pre-existing user tabs)
      const createOpts = {
        url: targetUrl,
        active: Boolean(options.focusTab)
      };
      if (targetWindowId !== undefined) createOpts.windowId = targetWindowId;
      tab = await chrome.tabs.create(createOpts);
      if (options.focusTab && tab.windowId !== undefined) {
        try { await chrome.windows.update(tab.windowId, { focused: true }); } catch (e) {}
      }
      console.log(`[VP Background] Created new dedicated ${prov.name} group tab (id=${tab.id}) at ${targetUrl}`);
    }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to open ${prov.name} tab: ${err?.message || err}`
    };
  }

  activeProviderTabIds[model] = tab.id;
  await saveOwnedTabState();
  // keep the AI tab loaded while it works in the background
  try { await chrome.tabs.update(tab.id, { autoDiscardable: false }); } catch (e) {}
  freshChatStarted[model] = true;

  // Put VisionPilot and ONLY its dedicated group tabs into the VisionPilot AI tab group
  await ensureVisionPilotTabGroup(senderTabId, [tab.id]);

  try {
    await waitForTabComplete(tab.id, 25000);
  } catch (err) {
    return { ok: false, error: err?.message || `Timed out loading ${prov.name}.` };
  }

  // Wait for SPA hydration and check readiness up to ~6 seconds
  let lastResp = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(attempt === 0 ? 900 : 650);
    try {
      await injectProviderHelpers(tab.id, prov.scriptFile);
      const resp = await chrome.tabs.sendMessage(tab.id, { type: 'VP_SITE_CHECK_READY' });
      lastResp = resp;
      if (resp && resp.ok) {
        return {
          ok: true,
          provider: model,
          tabId: tab.id,
          url: resp.url || prov.newChatUrl
        };
      }
      if (resp && resp.error && /not logged in/i.test(resp.error) && attempt >= 1) {
        return {
          ok: false,
          provider: model,
          tabId: tab.id,
          error: resp.error
        };
      }
    } catch (err) {
      lastResp = { ok: false, error: err?.message || String(err) };
    }
  }

  return {
    ok: false,
    provider: model,
    tabId: tab.id,
    error: lastResp?.error || `${prov.name} chat interface is not ready or not logged in.`
  };
}

// Get the currently open provider tab (or open/reset a fresh one if not yet initialized in this session)
async function getOrOpenProviderTabForPrompt(model, senderTabId = null) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unknown AI model: ${model}` };
  }

  // If this provider hasn't started a fresh chat in this session yet, start a fresh chat in our dedicated group tab
  if (!freshChatStarted[model]) {
    return await ensureFreshProviderChatTab(model, { focusTab: false, senderTabId });
  }

  const tab = await getOwnedProviderTab(model);

  // If no dedicated group tab is open yet, open a fresh new chat tab inside the group
  if (!tab) {
    return await ensureFreshProviderChatTab(model, { focusTab: false, senderTabId });
  }

  await ensureVisionPilotTabGroup(senderTabId, [tab.id]);

  try {
    await waitForTabComplete(tab.id, 15000);
    await injectProviderHelpers(tab.id, prov.scriptFile);
    const ready = await chrome.tabs.sendMessage(tab.id, { type: 'VP_SITE_CHECK_READY' });
    if (!ready || !ready.ok) {
      return {
        ok: false,
        provider: model,
        tabId: tab.id,
        error: ready?.error || `${prov.name} is not ready or not logged in.`
      };
    }
    return { ok: true, provider: model, tabId: tab.id, url: ready.url };
  } catch (err) {
    return {
      ok: false,
      provider: model,
      error: `Could not reach ${prov.name} tab: ${err?.message || err}`
    };
  }
}

// Send a message to a provider tab with MV3 service-worker keep-alive and tab-close detection (no timeout while generating).
// A provider SPA can replace its content script after navigation; one quiet reinjection
// makes image/focus tasks recover without asking the user to reload the extension.
async function sendTabMessageUntilComplete(tabId, provName, message, scriptFile = '') {
  const sendOnce = () => new Promise((resolve, reject) => {
    let settled = false;
    const keepAliveTimer = setInterval(() => {
      chrome.tabs.get(tabId).catch(() => {});
    }, 15000);

    function cleanup() {
      clearInterval(keepAliveTimer);
      try {
        chrome.tabs.onRemoved.removeListener(onTabRemoved);
      } catch (e) {}
    }

    function onTabRemoved(closedTabId) {
      if (closedTabId !== tabId || settled) return;
      settled = true;
      cleanup();
      reject(new Error(`${provName} tab was closed before the reply finished.`));
    }

    try {
      chrome.tabs.onRemoved.addListener(onTabRemoved);
    } catch (e) {}

    chrome.tabs
      .sendMessage(tabId, message)
      .then((res) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(res);
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      });
  });
  try {
    return await sendOnce();
  } catch (err) {
    const text = String(err?.message || err || '');
    const canRecover = scriptFile && /receiving end|could not establish connection|context invalidated|message port/i.test(text);
    if (!canRecover) throw err;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: [scriptFile] });
      await sleep(450);
      return await sendOnce();
    } catch (retryErr) {
      throw retryErr;
    }
  }
}

// Execute a real image + instruction prompt on the provider tab
async function runProviderPrompt(model, payload, senderTabId = null) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unsupported AI model: ${model}` };
  }

  const reqEpoch = cancelEpoch;
  const reqId = payload.reqId || '';
  const refId = payload.refId || '';

  const isCancelledNow = () => {
    if (reqEpoch !== cancelEpoch) return true;
    if (reqId && cancelledReqIds.has(reqId)) return true;
    if (refId && cancelledRefIds.has(refId)) return true;
    return false;
  };

  const images = Array.isArray(payload.images) ? payload.images : [];
  const instruction = typeof payload.instruction === 'string' ? payload.instruction : '';

  if (!instruction.trim()) {
    return { ok: false, error: 'Instruction text is missing.' };
  }
  if (images.length === 0) {
    return { ok: false, error: 'No image provided to send to ' + prov.name + '.' };
  }

  console.log(`[VP Background] Starting ${payload.step || 'prompt'} on ${prov.name} (images=${images.length}, refId=${refId || 'n/a'})`);

  const tabStatus = payload.freshChat
    ? await ensureFreshProviderChatTab(model, { focusTab: false, senderTabId })
    : await getOrOpenProviderTabForPrompt(model, senderTabId);

  if (isCancelledNow()) {
    console.log(`[VP Background] Request cancelled before sending to ${prov.name} (refId=${refId})`);
    return { ok: false, cancelled: true, error: 'Request cancelled.' };
  }

  if (!tabStatus.ok || !tabStatus.tabId) {
    return {
      ok: false,
      provider: model,
      error: tabStatus.error || `Failed to prepare ${prov.name} chat tab.`
    };
  }

  try {
    await injectProviderHelpers(tabStatus.tabId, prov.scriptFile);
    const subjects = Array.isArray(payload.subjects) ? payload.subjects : [];
    const expectedCount = Number(payload.expectedCount) || subjects.length || 1;
    const result = await sendTabMessageUntilComplete(tabStatus.tabId, prov.name, {
      type: 'VP_SITE_RUN_PROMPT',
      payload: { images, instruction, step: payload.step || '', refId, reqId, subjects, expectedCount },
      images,
      instruction,
      step: payload.step || '',
      subjects,
      expectedCount
    }, prov.scriptFile);

    // Do NOT forcibly activate senderTabId so the user stays on whichever tab they are currently viewing

    if (isCancelledNow()) {
      console.log(`[VP Background] Discarding late reply from ${prov.name} because request was cancelled (refId=${refId})`);
      return { ok: false, cancelled: true, error: 'Request cancelled.' };
    }

    console.log(`[VP Background] Raw result from ${prov.name} content script:`, result);

    if (!result) {
      return {
        ok: false,
        provider: model,
        error: `No response received from ${prov.name} tab.`
      };
    }
    if (!result.ok) {
      return {
        ok: false,
        provider: model,
        cancelled: Boolean(result.cancelled),
        error: result.error || `${prov.name} failed to process the request.`
      };
    }
    if (!Array.isArray(result.blocks) || result.blocks.length === 0) {
      return {
        ok: false,
        provider: model,
        error: `${prov.name} replied without a copyable code block or text.`
      };
    }
    console.log(`[VP Background] Returning ${result.blocks.length} block(s) from ${prov.name} to VisionPilot:`, result.blocks);
    return {
      ok: true,
      provider: model,
      blocks: result.blocks,
      fullText: result.fullText || result.blocks.join('\n\n')
    };
  } catch (err) {
    if (isCancelledNow()) {
      return { ok: false, cancelled: true, error: 'Request cancelled.' };
    }
    return {
      ok: false,
      provider: model,
      error: `Error communicating with ${prov.name} tab: ${err?.message || err}`
    };
  }
}

// Fetch an image URL in the MV3 background service worker (bypasses CORS via <all_urls>) and return as a base64 dataUrl
// Read a generated image inside the AI tab itself (its own cookies, no CORS), and return it straight back.
// This replaces handing big images over through a page attribute, which gave up after ~1.4 s and lost 4K results.
async function readImageInPage(tabId, src) {
  if (!tabId || !src) return { ok: false, error: 'No image to read.' };
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      args: [src],
      func: async (s) => {
        const toDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onloadend = () => r(String(fr.result || '')); fr.onerror = () => r(''); fr.readAsDataURL(blob); });
        try {
          const resp = await fetch(s, { credentials: 'include' });
          if (resp.ok) { const d = await toDataUrl(await resp.blob()); if (d.startsWith('data:image/')) return { ok: true, dataUrl: d }; }
        } catch (e) {}
        const im = Array.from(document.images).find((i) => i.currentSrc === s || i.src === s);
        if (im) {
          try {
            if (!im.complete) await new Promise((r) => { im.onload = im.onerror = r; setTimeout(r, 8000); });
            const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
            c.getContext('2d').drawImage(im, 0, 0);
            const d = c.toDataURL('image/png'); if (d.startsWith('data:image/')) return { ok: true, dataUrl: d };
          } catch (e) {}
        }
         return { ok: false, error: 'The image is visible in the AI tab but could not be read.' };
       }
    });
    return res?.result || { ok: false, error: 'Reading the image failed.' };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// Tell the VisionPilot page what stage a request is at (shown as live status there)
const requestSenders = new Map(); // reqId -> VisionPilot tab id
function reportStage(reqId, stage, extra = {}) {
  const tabId = requestSenders.get(reqId);
  const msg = { type: 'VP_PROGRESS', reqId, stage, at: Date.now(), ...extra };
  if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  if (desktopLink.send) desktopLink.send(msg);
}

async function fetchImageAsDataUrl(imageUrl) {
  if (!imageUrl) {
    return { ok: false, error: 'Missing image URL.' };
  }
  if (String(imageUrl).startsWith('data:image/')) {
    return { ok: true, dataUrl: imageUrl };
  }
  try {
    const resp = await fetch(imageUrl, { credentials: 'include' });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status} while downloading generated image.` };
    }
    const contentType = resp.headers.get('content-type') || 'image/png';
    const mime = contentType.split(';')[0].trim() || 'image/png';
    const buf = await resp.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (!bytes.length) {
      return { ok: false, error: 'Downloaded image was empty.' };
    }
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    return { ok: true, dataUrl: `data:${mime};base64,${base64}` };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// Track extra parallel ChatGPT tabs opened when generating 2, 3, or 4 images simultaneously
let extraGptParallelTabIds = [];

async function ensureParallelChatGPTTabs(count, senderTabId = null) {
  const prov = PROVIDERS.gpt;
  const primaryStatus = await ensureFreshProviderChatTab('gpt', {
    focusTab: false,
    senderTabId
  });
  if (!primaryStatus.ok || !primaryStatus.tabId) {
    return { ok: false, error: primaryStatus.error || 'Failed to prepare primary ChatGPT tab.' };
  }

  const tabIds = [primaryStatus.tabId];
  let targetWindowId = undefined;
  try {
    const pTab = await chrome.tabs.get(primaryStatus.tabId);
    if (pTab && pTab.windowId !== undefined) targetWindowId = pTab.windowId;
  } catch (e) {}

  const validExistingExtras = [];
  for (const tid of extraGptParallelTabIds) {
    if (!tid || tid === primaryStatus.tabId) continue;
    try {
      const t = await chrome.tabs.get(tid);
      if (t && !t. discarded) validExistingExtras.push(t);
    } catch (e) {}
  }

  const neededExtras = Math.max(0, count - 1);
  const chosenExtraTabs = [];
  for (let i = 0; i < neededExtras; i++) {
    let eTab = validExistingExtras[i] || null;
    try {
      if (eTab) {
        eTab = await chrome.tabs.update(eTab.id, {
          url: prov.newChatUrl,
          active: false
        });
      } else {
        const createOpts = { url: prov.newChatUrl, active: false };
        if (targetWindowId !== undefined) createOpts.windowId = targetWindowId;
        eTab = await chrome.tabs.create(createOpts);
      }
      if (eTab && eTab.id) {
        try { await chrome.tabs.update(eTab.id, { autoDiscardable: false }); } catch (e) {}
        chosenExtraTabs.push(eTab.id);
        tabIds.push(eTab.id);
      }
    } catch (err) {
      console.warn(`[VP Background] Could not open extra ChatGPT tab #${i + 2}:`, err);
    }
  }

  extraGptParallelTabIds = chosenExtraTabs;
  await ensureVisionPilotTabGroup(senderTabId, tabIds);

  // Wait for all extra ChatGPT tabs to finish loading and hydrate in parallel
  await Promise.all(
    chosenExtraTabs.map(async (tid) => {
      try {
        await waitForTabComplete(tid, 25000);
        for (let attempt = 0; attempt < 5; attempt++) {
          await sleep(attempt === 0 ? 900 : 650);
          try {
            await injectProviderHelpers(tid, prov.scriptFile);
            const resp = await chrome.tabs.sendMessage(tid, { type: 'VP_SITE_CHECK_READY' });
            if (resp && resp.ok) break;
          } catch (_) {}
        }
      } catch (e) {}
    })
  );

  return { ok: true, tabIds };
}

// PART 4: Execute real Image Generation in a fresh new chat on Gemini (Nano Banana 2) or ChatGPT (ChatGPT Image 2)
async function runProviderImageGeneration(model, payload, senderTabId = null) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unsupported AI image provider: ${model}` };
  }

  const reqEpoch = cancelEpoch;
  const reqId = payload.reqId || '';
  const refId = payload.refId || '';

  const isCancelledNow = () => {
    if (reqEpoch !== cancelEpoch) return true;
    if (reqId && cancelledReqIds.has(reqId)) return true;
    if (refId && cancelledRefIds.has(refId)) return true;
    return false;
  };

  const images = Array.isArray(payload.images) ? payload.images : [];
  const instruction = typeof payload.instruction === 'string' ? payload.instruction : '';
  const imageCount = Math.max(1, Math.min(4, Number(payload.imageCount) || 1));

  if (!instruction.trim()) {
    return { ok: false, error: 'Image generation prompt is missing.' };
  }
  if (images.length === 0 && model !== 'flow') {
    return { ok: false, error: 'Main reference image is missing.' };
  }

  const resolveSingleImgUrlOnTab = async (targetTabId, itemDataUrl, itemUrl) => {
    if (itemDataUrl && String(itemDataUrl).startsWith('data:image/')) return itemDataUrl;
    if (!itemUrl) return '';
    if (targetTabId) {
      const inPage = await readImageInPage(targetTabId, itemUrl);
      if (inPage && inPage.ok && inPage.dataUrl) return inPage.dataUrl;
    }
    const fetched = await fetchImageAsDataUrl(itemUrl);
    if (fetched && fetched.ok && fetched.dataUrl) return fetched.dataUrl;
    return '';
  };

  // Multi-tab parallel ChatGPT image generation when imageCount > 1 (2, 3, or 4 images)
  if (model === 'gpt' && imageCount > 1) {
    console.log(`[VP Background] Starting Parallel ${imageCount}-Tab ChatGPT Image Generation...`);
    const prep = await ensureParallelChatGPTTabs(imageCount, senderTabId);
    if (isCancelledNow()) {
      return { ok: false, cancelled: true, error: 'Image generation cancelled.' };
    }
    if (!prep.ok || !Array.isArray(prep.tabIds) || !prep.tabIds.length) {
      return {
        ok: false,
        provider: model,
        error: prep.error || 'Failed to prepare parallel ChatGPT tabs for multi-image generation.'
      };
    }

    const tabIds = prep.tabIds;
    const slotImages = Array.from({ length: imageCount }, () => '');
    const slotErrors = [];

    await Promise.all(
      tabIds.map(async (tid, slotIdx) => {
        try {
          await injectProviderHelpers(tid, prov.scriptFile);
          const slotRes = await sendTabMessageUntilComplete(tid, `${prov.name} #${slotIdx + 1}`, {
            type: 'VP_SITE_GENERATE_IMAGE',
            payload: {
              images,
              instruction,
              aspectRatio: payload.aspectRatio || '16:9',
              width: payload.width || 1408,
              height: payload.height || 792,
              imageCount: 1,
              slotIndex: slotIdx,
              imageModelName: payload.imageModelName || prov.name,
              refId,
              reqId
            }
          }, prov.scriptFile);

          if (isCancelledNow()) return;

          if (!slotRes || !slotRes.ok) {
            const errMsg = slotRes?.error || `ChatGPT tab #${slotIdx + 1} failed to generate an image.`;
            const isLimit = Boolean(slotRes?.limitReached) || /limit|quota|rate.?limit|plus|upgrade|too many/i.test(errMsg);
            const errObj = { index: slotIdx, error: errMsg, limitReached: isLimit };
            slotErrors.push(errObj);
            reportStage(reqId, 'gpt_slot_error', {
              index: slotIdx,
              totalCount: imageCount,
              limitReached: isLimit,
              error: errMsg
            });
            return;
          }

          const dUrl = await resolveSingleImgUrlOnTab(tid, slotRes.imageDataUrl || '', slotRes.imageUrl || '');
          if (dUrl && String(dUrl).startsWith('data:image/')) {
            slotImages[slotIdx] = dUrl;
            reportStage(reqId, 'flow_image_ready', {
              index: slotIdx,
              totalCount: imageCount,
              imageDataUrl: dUrl
            });
          } else {
            const errMsg = 'ChatGPT finished without returning a readable image.';
            const errObj = { index: slotIdx, error: errMsg, limitReached: false };
            slotErrors.push(errObj);
            reportStage(reqId, 'gpt_slot_error', {
              index: slotIdx,
              totalCount: imageCount,
              limitReached: false,
              error: errMsg
            });
          }
        } catch (err) {
          if (isCancelledNow()) return;
          const errMsg = err?.message || String(err);
          const isLimit = Boolean(err?.limitReached) || /limit|quota|rate.?limit|plus|upgrade|too many/i.test(errMsg);
          const errObj = { index: slotIdx, error: errMsg, limitReached: isLimit };
          slotErrors.push(errObj);
          reportStage(reqId, 'gpt_slot_error', {
            index: slotIdx,
            totalCount: imageCount,
            limitReached: isLimit,
            error: errMsg
          });
        }
      })
    );

    if (isCancelledNow()) {
      return { ok: false, cancelled: true, error: 'Image generation cancelled.' };
    }

    const validImages = slotImages.filter(Boolean);
    const anyLimit = slotErrors.some((s) => s && s.limitReached);

    if (validImages.length === 0) {
      return {
        ok: false,
        provider: model,
        limitReached: anyLimit,
        slotErrors,
        error: slotErrors[0]?.error || 'ChatGPT Image Limit Reached.'
      };
    }

    lastImageJob = {
      model,
      tabId: tabIds[0],
      imageUrl: '',
      images: validImages,
      at: Date.now()
    };

    return {
      ok: true,
      provider: model,
      imageDataUrl: validImages[0],
      images: validImages,
      slotImages,
      slotErrors,
      limitReached: anyLimit
    };
  }

  console.log(
    `[VP Background] Starting Image Generation on ${prov.name} (${payload.imageModelName || model}), aspect=${payload.aspectRatio || 'auto'}`
  );

  // Start a fresh new chat for image generation (or reuse the existing Visionpilot project tab in Google Flow without switching focus)
  const tabStatus = await ensureFreshProviderChatTab(model, {
    focusTab: false,
    senderTabId
  });

  if (isCancelledNow()) {
    return { ok: false, cancelled: true, error: 'Image generation cancelled.' };
  }

  if (!tabStatus.ok || !tabStatus.tabId) {
    return {
      ok: false,
      provider: model,
      error: tabStatus.error || `Failed to prepare fresh ${prov.name} chat tab for image generation.`
    };
  }

  try {
    await injectProviderHelpers(tabStatus.tabId, prov.scriptFile);
    const result = await sendTabMessageUntilComplete(tabStatus.tabId, prov.name, {
      type: 'VP_SITE_GENERATE_IMAGE',
      payload: {
        images,
        instruction,
        aspectRatio: payload.aspectRatio || '16:9',
        width: payload.width || 1408,
        height: payload.height || 792,
        imageCount,
        imageModelName: payload.imageModelName || prov.name,
        refId,
        reqId
      }
    }, prov.scriptFile);

    if (isCancelledNow()) {
      return { ok: false, cancelled: true, error: 'Image generation cancelled.' };
    }

    if (!result || !result.ok) {
      const errMsg = result?.error || `${prov.name} failed to generate the image.`;
      const isLimit = Boolean(result?.limitReached) || /limit|quota|rate.?limit|plus|upgrade|too many/i.test(errMsg);
      return {
        ok: false,
        provider: model,
        limitReached: isLimit,
        error: errMsg
      };
    }

    const resolveSingleImgUrl = (itemDataUrl, itemUrl) =>
      resolveSingleImgUrlOnTab(tabStatus.tabId, itemDataUrl, itemUrl);

    const finalImages = [];
    if (Array.isArray(result.images) && result.images.length > 0) {
      reportStage(reqId, 'reading');
      for (let i = 0; i < result.images.length; i++) {
        const entry = result.images[i];
        const dUrl = typeof entry === 'string'
          ? await resolveSingleImgUrl(entry.startsWith('data:image/') ? entry : '', entry.startsWith('data:image/') ? '' : entry)
          : await resolveSingleImgUrl(entry?.imageDataUrl || '', entry?.imageUrl || entry?.src || '');
        if (dUrl) finalImages.push(dUrl);
      }
    }

    let finalDataUrl = finalImages[0] || result.imageDataUrl || '';
    if (!finalDataUrl && result.imageUrl) {
      reportStage(reqId, 'reading');
      finalDataUrl = await resolveSingleImgUrl('', result.imageUrl);
      if (finalDataUrl && finalImages.length === 0) finalImages.push(finalDataUrl);
    }

    lastImageJob = {
      model,
      tabId: tabStatus.tabId,
      imageUrl: result.imageUrl || '',
      images: finalImages,
      at: Date.now()
    };

    if (!finalDataUrl || !String(finalDataUrl).startsWith('data:image/')) {
      return {
        ok: false,
        provider: model,
        error: `${prov.name} did not return a valid generated image.`
      };
    }

    return {
      ok: true,
      provider: model,
      imageDataUrl: finalDataUrl,
      images: finalImages.length > 0 ? finalImages : [finalDataUrl]
    };
  } catch (err) {
    if (isCancelledNow()) {
      return { ok: false, cancelled: true, error: 'Image generation cancelled.' };
    }
    return {
      ok: false,
      provider: model,
      error: `Error generating image with ${prov.name}: ${err?.message || err}`
    };
  }
}

// Upscale a Nano Banana 2.1 image in Google Flow (2K or 4K download), or signal fallback to local VisionPilot 4K upscale
async function runFlowImageUpscale(payload, senderTabId = null) {
  const prov = PROVIDERS.flow;
  const ownedTab = await getOwnedProviderTab('flow');
  let tabId = ownedTab?.id || activeProviderTabIds.flow || (lastImageJob?.model === 'flow' ? lastImageJob.tabId : null);
  if (!tabId) {
    try {
      const tabs = await chrome.tabs.query({ url: prov.matchUrls });
      if (tabs && tabs.length > 0) tabId = tabs[0].id;
    } catch (e) {}
  }
  if (!tabId) {
    return { ok: false, fallbackToLocal: true, error: 'No active Google Flow session found.' };
  }

  let capturedDownloadDataUrl = '';
  const watchedDownloadIds = new Set();
  const tryReadDownloadItem = async (downloadId) => {
    try {
      const items = await chrome.downloads.search({ id: downloadId });
      const item = items && items[0];
      if (!item) return;
      if (item.filename && item.state === 'complete') {
        const fileUrl = 'file:///' + String(item.filename).replace(/\\/g, '/').replace(/^\/+/, '');
        const fileRes = await fetchImageAsDataUrl(fileUrl);
        if (fileRes && fileRes.ok && fileRes.dataUrl) {
          capturedDownloadDataUrl = fileRes.dataUrl;
        }
      }
      if (!capturedDownloadDataUrl) {
        const candidateUrl = item.finalUrl || item.url || '';
        if (candidateUrl && /^https?:/i.test(candidateUrl)) {
          const urlRes = await fetchImageAsDataUrl(candidateUrl);
          if (urlRes && urlRes.ok && urlRes.dataUrl) {
            capturedDownloadDataUrl = urlRes.dataUrl;
          }
        }
      }
      if (capturedDownloadDataUrl && tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: 'VP_FLOW_DOWNLOAD_CAPTURED',
          imageDataUrl: capturedDownloadDataUrl
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const onDownloadCreated = (item) => {
    try {
      if (!item || typeof item.id !== 'number') return;
      const u = `${item.finalUrl || ''} ${item.url || ''} ${item.referrer || ''} ${item.filename || ''}`;
      if (/labs\.google|flow\.google|googleusercontent|storage\.googleapis|blob:|_2K|_4K|upscale/i.test(u) || item.byExtensionId === chrome.runtime.id || !item.byExtensionId) {
        watchedDownloadIds.add(item.id);
        if (item.state === 'complete') {
          tryReadDownloadItem(item.id);
        }
      }
    } catch (_) {}
  };

  const onDownloadChanged = (delta) => {
    try {
      if (!delta || typeof delta.id !== 'number') return;
      if (watchedDownloadIds.has(delta.id) && (delta.state?.current === 'complete' || delta.filename?.current)) {
        tryReadDownloadItem(delta.id);
      }
    } catch (_) {}
  };

  try {
    if (chrome.downloads && chrome.downloads.onCreated && chrome.downloads.onChanged) {
      chrome.downloads.onCreated.addListener(onDownloadCreated);
      chrome.downloads.onChanged.addListener(onDownloadChanged);
    }
  } catch (_) {}

  const cleanupDlListeners = () => {
    try {
      if (chrome.downloads && chrome.downloads.onCreated && chrome.downloads.onChanged) {
        chrome.downloads.onCreated.removeListener(onDownloadCreated);
        chrome.downloads.onChanged.removeListener(onDownloadChanged);
      }
    } catch (_) {}
  };

  try {
    await injectProviderHelpers(tabId, prov.scriptFile);
    const res = await sendTabMessageUntilComplete(tabId, prov.name, {
      type: 'VP_SITE_UPSCALE_FLOW_IMAGE',
      payload: {
        scaleFactor: Number(payload.scaleFactor) === 4 ? 4 : 2,
        resolution: payload.resolution || (Number(payload.scaleFactor) === 4 ? '4K' : '2K'),
        imageIndex: Number(payload.imageIndex) || 0,
        srcDataUrl: payload.srcDataUrl || '',
        reqId: payload.reqId || ''
      }
    }, prov.scriptFile);
    cleanupDlListeners();

    if ((!res || !res.ok) && !capturedDownloadDataUrl) {
      return {
        ok: false,
        fallbackToLocal: true,
        error: res?.error || 'Google Flow 2K/4K download not available; falling back to VisionPilot upscale.'
      };
    }
    let dataUrl = (res && res.imageDataUrl) || capturedDownloadDataUrl || '';
    if (!dataUrl && res && res.imageUrl) {
      const inPage = await readImageInPage(tabId, res.imageUrl);
      if (inPage && inPage.ok) dataUrl = inPage.dataUrl;
      if (!dataUrl) {
        const fetched = await fetchImageAsDataUrl(res.imageUrl);
        if (fetched && fetched.ok) dataUrl = fetched.dataUrl;
      }
    }
    if (!dataUrl || !String(dataUrl).startsWith('data:')) {
      return { ok: false, fallbackToLocal: true, error: 'Google Flow upscale image could not be read.' };
    }
    if (!dataUrl.startsWith('data:image/')) {
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx > 0) {
        const b64 = dataUrl.slice(commaIdx + 1);
        const mime = b64.startsWith('/9j/') ? 'image/jpeg' : b64.startsWith('UklGR') ? 'image/webp' : 'image/png';
        dataUrl = `data:${mime};base64,${b64}`;
      }
    }
    return {
      ok: true,
      provider: 'flow',
      imageDataUrl: dataUrl,
      nativeDownloadTriggered: true
    };
  } catch (err) {
    cleanupDlListeners();
    if (capturedDownloadDataUrl && capturedDownloadDataUrl.startsWith('data:')) {
      return {
        ok: true,
        provider: 'flow',
        imageDataUrl: capturedDownloadDataUrl,
        nativeDownloadTriggered: true
      };
    }
    return { ok: false, fallbackToLocal: true, error: err?.message || String(err) };
  }
}

// Cancel any in-flight requests and tell open AI tabs to stop generating
async function cancelPendingRequests(payload = {}) {
  cancelEpoch++;
  if (payload.refId) cancelledRefIds.add(payload.refId);
  if (payload.reqId) cancelledReqIds.add(payload.reqId);
  console.log('[VP Background] Cancelling pending AI requests:', payload);

  const allTabsToAbort = new Set([
    ...Object.values(activeProviderTabIds).filter(Boolean),
    ...extraGptParallelTabIds.filter(Boolean)
  ]);
  for (const tabId of allTabsToAbort) {
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'VP_SITE_ABORT_PROMPT',
        refId: payload.refId || null,
        reqId: payload.reqId || null
      });
    } catch (e) {}
  }
  return { ok: true, cancelled: true };
}

// Check open tabs for popup status display (without faking login)
async function checkOpenProviderStatus(model) {
  const prov = PROVIDERS[model];
  if (!prov) return { loggedIn: false, provider: model };
  try {
    const tabs = await chrome.tabs.query({ url: prov.matchUrls });
    if (!tabs || tabs.length === 0) {
      return { loggedIn: false, tabOpen: false, provider: model };
    }
    const tab = tabs[0];
    await injectProviderHelpers(tab.id, prov.scriptFile);
    const resp = await chrome.tabs.sendMessage(tab.id, { type: 'VP_SITE_CHECK_READY' });
    return {
      loggedIn: Boolean(resp && resp.ok),
      tabOpen: true,
      provider: model,
      error: resp?.error || null
    };
  } catch (e) {
    return { loggedIn: false, provider: model, error: e?.message || String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!desktopLink.connected) connectDesktop();
  if (!msg) return false;

  // Never switch away from the VisionPilot tab when working in the background.
  // The MAIN-world clipboard/execCommand hook and DOM selection fallback work without activating the AI tab.
  if (msg.type === 'VP_FOCUS_TAB_FOR_COPY') {
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'VP_FETCH_IMAGE_AS_DATAURL') {
    (async () => {
      const res = await fetchImageAsDataUrl(msg.url);
      sendResponse(res);
    })();
    return true;
  }

  if (msg.type === 'VP_CHECK_PROVIDERS') {
    (async () => {
      const [claude, gpt, gemini, flow] = await Promise.all([
        checkOpenProviderStatus('claude'),
        checkOpenProviderStatus('gpt'),
        checkOpenProviderStatus('gemini'),
        checkOpenProviderStatus('flow')
      ]);
      sendResponse({ ok: true, providers: { claude, gpt, gemini, flow } });
    })();
    return true;
  }

  if (msg.type === 'VP_FLOW_PROGRESS') {
    (async () => {
      try {
        const reqId = msg.reqId || '';
        const flowTabId = sender?.tab?.id || activeProviderTabIds.flow;
        let dataUrl = msg.imageDataUrl || '';
        if (!dataUrl && msg.imageUrl && flowTabId) {
          const inPage = await readImageInPage(flowTabId, msg.imageUrl);
          if (inPage && inPage.ok) dataUrl = inPage.dataUrl;
        }
        if (!dataUrl && msg.imageUrl) {
          const fetched = await fetchImageAsDataUrl(msg.imageUrl);
          if (fetched && fetched.ok) dataUrl = fetched.dataUrl;
        }
        if (reqId && dataUrl && dataUrl.startsWith('data:image/')) {
          reportStage(reqId, 'flow_image_ready', {
            index: Number(msg.index) || 0,
            totalCount: Number(msg.totalCount) || 1,
            imageDataUrl: dataUrl
          });
        }
      } catch (e) {}
    })();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === 'VP_OPEN_VISION_PILOT') {
    // Only open or focus the VisionPilot web tab when the user explicitly clicks the button in the extension popup.
    // Never automatically switch to or open the VisionPilot web tab from background events, content scripts, or popups/dialogs.
    if (!msg.userInitiatedFromPopup || sender?.tab) {
      sendResponse({ ok: false, ignored: true });
      return false;
    }
    (async () => {
      try {
        const tabs = await chrome.tabs.query({});
        const vpTab = tabs.find(t => isVisionPilotTab(t));
        if (vpTab && vpTab.id) {
          await chrome.tabs.update(vpTab.id, { active: true });
          if (vpTab.windowId !== undefined) {
            await chrome.windows.update(vpTab.windowId, { focused: true });
          }
          const stored = await chrome.storage.local.get(['vpLastUrl']);
          if (!stored.vpLastUrl && vpTab.url) {
            await chrome.storage.local.set({ vpLastUrl: vpTab.url });
          }
          sendResponse({ ok: true, tabId: vpTab.id, url: vpTab.url });
          return;
        }
        const stored = await chrome.storage.local.get(['vpLastUrl']);
        let targetUrl = stored?.vpLastUrl || 'https://framesbyismail.github.io/VisionPilot/';
        try {
          const pingResp = await fetch('http://127.0.0.1:45780/api/sync-state', { method: 'GET' });
          if (pingResp && pingResp.ok) {
            targetUrl = 'http://127.0.0.1:45780/index.html';
          }
        } catch (e) {}
        const created = await chrome.tabs.create({ url: targetUrl, active: true });
        if (created?.id) knownVisionPilotTabIds.add(created.id);
        sendResponse({ ok: true, tabId: created?.id || null, url: targetUrl });
      } catch (err) {
        sendResponse({ ok: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (msg.type === 'VP_SYNC_STATE') {
    (async () => {
      try {
        const incoming = msg.state || {};
        // the desktop app signs in with the same account when it is linked
        if (incoming.token && desktopLink.send) desktopLink.send({ type: 'auth', token: incoming.token, user: incoming.user || null, pro: incoming.pro || null });
        const cur = await chrome.storage.local.get(['vpSyncedState']);
        const merged = Object.assign({}, cur?.vpSyncedState || {}, incoming, { updatedAt: Date.now() });
        await chrome.storage.local.set({ vpSyncedState: merged });
        try {
          await fetch('http://127.0.0.1:45780/api/sync-state', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(merged)
          });
        } catch (e) {}
        sendResponse({ ok: true, state: merged });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

  if (msg.type === 'VP_OPEN_PROVIDER_LOGIN') {
    (async () => {
      const prov = PROVIDERS[msg.model];
      if (prov) {
        const res = await ensureFreshProviderChatTab(msg.model, { focusTab: true });
        sendResponse({ ok: true, url: prov.newChatUrl, tabId: res.tabId });
      } else {
        sendResponse({ ok: false, error: 'Unknown provider' });
      }
    })();
    return true;
  }

  if (msg.type === 'VP_POPUP_SELECT_MODEL') {
    (async () => {
      const model = msg.model || 'visionpilot';
      await chrome.storage.local.set({ vpActiveModel: model });
      await injectVisionPilotContentScripts();
      const tabs = await chrome.tabs.query({});
      let activatedCount = 0;
      for (const tab of tabs) {
        if (!tab.id || !tab.url || /^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) continue;
        if (isProviderUrl(tab.url)) continue;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'VP_ACTIVATE_MODEL', model });
          activatedCount++;
        } catch (e) {}
      }
      sendResponse({ ok: true, model, activatedCount });
    })();
    return true;
  }

  // the AI chat tab reports how far it got (shown live in VisionPilot)
  if (msg.type === 'VP_STAGE') {
    if (msg.reqId) reportStage(msg.reqId, msg.stage, msg.extra || {});
    return false;
  }

  if (msg.type !== 'VP_AI_BRIDGE_REQUEST') return false;

  const payload = msg.payload || {};
  const senderTabId = sender?.tab?.id || null;
  if (senderTabId) knownVisionPilotTabIds.add(senderTabId);
  handleBridgeRequest(payload, senderTabId).then(sendResponse, (err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});

// One request from VisionPilot (the website through content.js, or the desktop app through the local link)
async function handleBridgeRequest(payload, senderTabId = null) {
  const action = payload.action || 'status';
  const model = payload.model || 'claude';
  if (payload.reqId && senderTabId) requestSenders.set(payload.reqId, senderTabId);
  try {
    if (action === 'cancel_requests') return await cancelPendingRequests(payload);
    if (action === 'connect_model') return await ensureFreshProviderChatTab(model, { focusTab: false, senderTabId });
    if (action === 'run_prompt') return await runProviderPrompt(model, payload, senderTabId);
    if (action === 'generate_image') {
      reportStage(payload.reqId, 'opening');
      return await runProviderImageGeneration(model, payload, senderTabId);
    }
    if (action === 'upscale_flow_image') {
      return await runFlowImageUpscale(payload, senderTabId);
    }
    if (action === 'reload_extension') {
      setTimeout(() => { try { chrome.runtime.reload(); } catch (e) {} }, 150);
      return { ok: true, reloading: true };
    }
    if (action === 'open_external_url' && payload.url) {
      const targetWindowId = await desktopWorkWindow();
      const createOpts = { url: payload.url, active: true };
      if (targetWindowId !== undefined) createOpts.windowId = targetWindowId;
      const t = await chrome.tabs.create(createOpts);
      if (t?.windowId !== undefined) {
        try { await chrome.windows.update(t.windowId, { focused: true }); } catch (e) {}
      }
      return { ok: true, opened: payload.url, tabId: t?.id || null };
    }
    // Retry without generating again: pick up the image ChatGPT already made in the last image chat
    if (action === 'recover_image') return await recoverLastImage(payload.reqId);
    if (action === 'open_login') {
      const prov = PROVIDERS[model];
      if (!prov) return { ok: false, error: `Unknown model: ${model}` };
      const res = await ensureFreshProviderChatTab(model, { focusTab: true, senderTabId });
      return { ok: true, opened: prov.newChatUrl, tabId: res.tabId };
    }
    // Basic extension installation ping
    return { ok: true, installed: true, version: chrome.runtime.getManifest().version, models: ['visionpilot', 'claude', 'gpt', 'gemini', 'flow'], desktopLinked: desktopLink.connected };
  } finally {
    if (payload.reqId) setTimeout(() => requestSenders.delete(payload.reqId), 60000);
  }
}

let lastImageJob = null;
async function recoverLastImage(reqId) {
  const job = lastImageJob;
  if (!job || !job.tabId) return { ok: false, error: 'There is no earlier image chat to pick the image up from.' };
  reportStage(reqId, 'reading');
  let src = job.imageUrl;
  try {
    const found = await chrome.tabs.sendMessage(job.tabId, { type: 'VP_SITE_FIND_LAST_IMAGE' });
    // the chat data gives the file itself (e.g. a PNG the code tool made); otherwise the page shows its address
    if (found?.ok && found.dataUrl) return { ok: true, imageDataUrl: found.dataUrl, recovered: true };
    if (found?.ok && found.src) src = found.src;
  } catch (e) {}
  if (!src) return { ok: false, error: 'ChatGPT has not shown an image in that chat yet.' };
  const r = await readImageInPage(job.tabId, src);
  if (r.ok) return { ok: true, imageDataUrl: r.dataUrl, recovered: true };
  const f = await fetchImageAsDataUrl(src);
  return f.ok ? { ok: true, imageDataUrl: f.dataUrl, recovered: true } : { ok: false, error: r.error || f.error };
}
