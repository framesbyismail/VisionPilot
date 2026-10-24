// VisionPilot AI Bridge — Background Service Worker
// Connects VisionPilot to logged-in Claude (claude.ai), GPT (chatgpt.com), and Gemini (gemini.google.com) sessions
const PROVIDER_URLS = {
  claude: 'https://claude.ai/*',
  gpt: 'https://chatgpt.com/*',
  gemini: 'https://gemini.google.com/*'
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ vpBridgeInstalled: true, vpActiveModel: 'visionpilot' });
});

async function queryProviderTab(model, promptText) {
  const urlPattern = PROVIDER_URLS[model];
  if (!urlPattern) return null;
  const tabs = await chrome.tabs.query({ url: urlPattern });
  if (!tabs || !tabs.length) return null;
  const tab = tabs[0];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (prompt) => {
        return {
          connected: true,
          url: location.href,
          title: document.title,
          timestamp: Date.now(),
          promptPreview: String(prompt || '').slice(0, 160)
        };
      },
      args: [promptText]
    });
    return results && results[0] ? results[0].result : null;
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'VP_AI_BRIDGE_REQUEST') return false;
  (async () => {
    const payload = msg.payload || {};
    const model = payload.model || 'claude';
    const action = payload.action || 'status';
    if (action === 'status') {
      sendResponse({
        installed: true,
        version: '1.0.0',
        models: ['visionpilot', 'claude', 'gpt', 'gemini']
      });
      return;
    }
    const sessionInfo = await queryProviderTab(model, payload.prompt || '');
    sendResponse({
      installed: true,
      model,
      action,
      sessionConnected: Boolean(sessionInfo && sessionInfo.connected),
      sessionInfo
    });
  })();
  return true;
});
