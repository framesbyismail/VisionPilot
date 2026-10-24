// VisionPilot AI Bridge — Content Script
// Bridges VisionPilot web app <-> Chrome Extension Background Worker (Claude, GPT, Gemini)
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
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announceReady, { once: true });
  }

  window.addEventListener('vp-ai-extension-ping', () => {
    announceReady();
  });

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
