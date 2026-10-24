// VisionPilot AI Bridge — Content Script
// Bridges VisionPilot web app <-> Chrome Extension Background Worker (Claude, GPT, Gemini)
(function () {
  if (window.__vpExtContentLoaded) {
    try {
      document.documentElement.setAttribute('data-vp-extension', 'installed');
      localStorage.setItem('vp-ai-ext-connected', '1');
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ready', {
        detail: { installed: true, version: '1.1.0', models: ['claude', 'gpt', 'gemini'] }
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
        document.documentElement.setAttribute('data-vp-extension-version', '1.1.0');
      }
      localStorage.setItem('vp-ai-ext-connected', '1');
      window.dispatchEvent(new CustomEvent('vp-ai-extension-ready', {
        detail: { installed: true, version: '1.1.0', models: ['claude', 'gpt', 'gemini'] }
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
  setTimeout(announceReady, 300);
  setTimeout(announceReady, 1200);

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
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'VP_AI_BRIDGE_REQUEST',
        payload: detail
      });
      window.dispatchEvent(new CustomEvent('vp-ai-extension-response', {
        detail: { reqId, ok: true, data: response }
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('vp-ai-extension-response', {
        detail: { reqId, ok: false, error: String(err && err.message ? err.message : err) }
      }));
    }
  });
})();
