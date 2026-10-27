// VisionPilot AI Bridge — VisionPilot Page Content Script (v2.0.0)
// Forwards real image + instruction requests between VisionPilot and the extension background service worker.
(function () {
  if (window.__vpExtContentLoaded) {
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute('data-vp-extension', 'installed');
        document.documentElement.setAttribute('data-vp-extension-version', '2.0.0');
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && location.href.startsWith('http')) {
        try { chrome.storage.local.set({ vpLastUrl: location.href }); } catch (e) {}
      }
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ready', {
        detail: { installed: true, version: '2.0.0', models: ['claude', 'gpt', 'gemini'] }
      }));
    } catch (e) {}
    return;
  }
  window.__vpExtContentLoaded = true;

  let announcing = false;
  function announceReady() {
    if (announcing) return;
    announcing = true;
    try {
      if (document.documentElement) {
        document.documentElement.setAttribute('data-vp-extension', 'installed');
        document.documentElement.setAttribute('data-vp-extension-version', '2.0.0');
      }
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && location.href.startsWith('http')) {
        try { chrome.storage.local.set({ vpLastUrl: location.href }); } catch (e) {}
      }
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ready', {
        detail: { installed: true, version: '2.0.0', models: ['claude', 'gpt', 'gemini'] }
      }));
    } catch (e) {} finally {
      announcing = false;
    }
  }

  announceReady();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceReady, { once: true });
  }
  window.addEventListener('load', announceReady, { once: true });

  window.addEventListener('vp-ai-extension-ping', () => {
    announceReady();
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return false;
      if (msg.type === 'VP_PING_CONTENT') {
        announceReady();
        sendResponse({ ok: true, isVisionPilot: Boolean(document.getElementById('aiModelBtn')) });
        return true;
      }
      if (msg.type === 'VP_ACTIVATE_MODEL' && msg.model) {
        announceReady();
        window.dispatchEvent(new CustomEvent('vp-ai-extension-select-model', {
          detail: { model: msg.model }
        }));
        sendResponse({ ok: true, model: msg.model });
        return true;
      }
      return false;
    });
  }

  window.addEventListener('vp-ai-extension-request', async (ev) => {
    const detail = ev.detail || {};
    const reqId = detail.reqId;
    if (!reqId) return;
    console.log('[VP Content] Forwarding request to background:', detail.action, detail.step || '', reqId);
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'VP_AI_BRIDGE_REQUEST',
        payload: detail
      });
      console.log('[VP Content] Received response from background for', reqId, ':', response);
      if (!response || response.ok === false) {
        window.dispatchEvent(new CustomEvent('vp-ai-extension-response', {
          detail: {
            reqId,
            ok: false,
            cancelled: Boolean(response?.cancelled),
            error: response?.error || 'Extension failed to complete request.',
            data: response || null
          }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('vp-ai-extension-response', {
          detail: { reqId, ok: true, data: response }
        }));
      }
    } catch (err) {
      console.warn('[VP Content] Error communicating with background for', reqId, ':', err);
      window.dispatchEvent(new CustomEvent('vp-ai-extension-response', {
        detail: { reqId, ok: false, error: String(err && err.message ? err.message : err) }
      }));
    }
  });
})();
