// VisionPilot AI Bridge — Background Service Worker
// Connects open VisionPilot tabs (http, https, file://) with real Claude (claude.ai), ChatGPT (chatgpt.com), and Google Gemini (gemini.google.com) web sessions.

const PROVIDERS = {
  claude: {
    id: 'claude',
    name: 'Claude',
    homeUrl: 'https://claude.ai/new',
    matchUrl: 'https://claude.ai/*'
  },
  gpt: {
    id: 'gpt',
    name: 'GPT (ChatGPT)',
    homeUrl: 'https://chatgpt.com/',
    matchUrl: 'https://chatgpt.com/*'
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    homeUrl: 'https://gemini.google.com/app',
    matchUrl: 'https://gemini.google.com/*'
  }
};

async function injectIntoOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (/^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) continue;
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
  injectIntoOpenTabs();
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoOpenTabs();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url && !/^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) {
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    }).catch(() => {});
  }
});

// Check real browser login/session state on claude.ai, chatgpt.com, and gemini.google.com
async function checkProviderSession(model) {
  try {
    if (model === 'claude') {
      const res = await fetch('https://claude.ai/api/organizations', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (Array.isArray(data) && data.length > 0 && data[0].uuid) {
          return {
            loggedIn: true,
            provider: 'claude',
            account: data[0].name || 'Claude Account',
            orgId: data[0].uuid
          };
        }
      }
      const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
      return { loggedIn: tabs.length > 0, tabOpen: tabs.length > 0, provider: 'claude' };
    }

    if (model === 'gpt') {
      const res = await fetch('https://chatgpt.com/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && (data.accessToken || data.user)) {
          return {
            loggedIn: true,
            provider: 'gpt',
            account: data.user?.email || data.user?.name || 'ChatGPT Account',
            hasToken: Boolean(data.accessToken)
          };
        }
      }
      const tabs = await chrome.tabs.query({ url: ['https://chatgpt.com/*', 'https://chat.openai.com/*'] });
      return { loggedIn: tabs.length > 0, tabOpen: tabs.length > 0, provider: 'gpt' };
    }

    if (model === 'gemini') {
      const res = await fetch('https://gemini.google.com/app', {
        method: 'GET',
        credentials: 'include'
      });
      if (res.ok) {
        const html = await res.text().catch(() => '');
        const tokenMatch = html.match(/"SNlM0e":"([^"]+)"/);
        if (tokenMatch && tokenMatch[1]) {
          return {
            loggedIn: true,
            provider: 'gemini',
            account: 'Google Gemini Account',
            snlm0e: tokenMatch[1]
          };
        }
      }
      const tabs = await chrome.tabs.query({ url: 'https://gemini.google.com/*' });
      return { loggedIn: tabs.length > 0, tabOpen: tabs.length > 0, provider: 'gemini' };
    }
  } catch (e) {
    return { loggedIn: false, provider: model, error: String(e?.message || e) };
  }
  return { loggedIn: false, provider: model };
}

async function checkAllProviders() {
  const [claude, gpt, gemini] = await Promise.all([
    checkProviderSession('claude'),
    checkProviderSession('gpt'),
    checkProviderSession('gemini')
  ]);
  return { claude, gpt, gemini };
}

// Query an open provider tab if present to read live DOM response or inject prompt
async function queryProviderTab(model, promptText) {
  const prov = PROVIDERS[model];
  if (!prov) return null;
  try {
    const tabs = await chrome.tabs.query({ url: prov.matchUrl });
    if (!tabs || !tabs.length) return null;
    const tab = tabs[0];
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (prompt, modelId) => {
        const out = {
          connected: true,
          url: location.href,
          title: document.title,
          timestamp: Date.now(),
          model: modelId,
          lastResponse: ''
        };
        try {
          if (modelId === 'claude') {
            const msgs = document.querySelectorAll('[data-is-streaming="false"], .font-claude-message');
            if (msgs.length) out.lastResponse = msgs[msgs.length - 1].innerText.trim().slice(0, 600);
          } else if (modelId === 'gpt') {
            const msgs = document.querySelectorAll('[data-message-author-role="assistant"]');
            if (msgs.length) out.lastResponse = msgs[msgs.length - 1].innerText.trim().slice(0, 600);
          } else if (modelId === 'gemini') {
            const msgs = document.querySelectorAll('message-content, .model-response-text');
            if (msgs.length) out.lastResponse = msgs[msgs.length - 1].innerText.trim().slice(0, 600);
          }
        } catch (e) {}
        return out;
      },
      args: [promptText || '', model]
    });
    return results && results[0] ? results[0].result : null;
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  if (msg.type === 'VP_CHECK_PROVIDERS') {
    checkAllProviders().then(status => sendResponse({ ok: true, providers: status }));
    return true;
  }

  if (msg.type === 'VP_OPEN_PROVIDER_LOGIN') {
    const prov = PROVIDERS[msg.model];
    if (prov) {
      chrome.tabs.create({ url: prov.homeUrl, active: true });
      sendResponse({ ok: true, url: prov.homeUrl });
    } else {
      sendResponse({ ok: false });
    }
    return true;
  }

  if (msg.type === 'VP_POPUP_SELECT_MODEL') {
    (async () => {
      const model = msg.model || 'visionpilot';
      await chrome.storage.local.set({ vpActiveModel: model });
      await injectIntoOpenTabs();
      const tabs = await chrome.tabs.query({});
      let activatedCount = 0;
      for (const tab of tabs) {
        if (!tab.id || !tab.url || /^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) continue;
        try {
          await chrome.tabs.sendMessage(tab.id, { type: 'VP_ACTIVATE_MODEL', model });
          activatedCount++;
        } catch (e) {}
      }
      sendResponse({ ok: true, model, activatedCount });
    })();
    return true;
  }

  if (msg.type !== 'VP_AI_BRIDGE_REQUEST') return false;
  (async () => {
    const payload = msg.payload || {};
    const model = payload.model || 'claude';
    const action = payload.action || 'status';

    if (action === 'open_login') {
      const prov = PROVIDERS[model];
      if (prov) await chrome.tabs.create({ url: prov.homeUrl, active: true });
      sendResponse({ ok: true, opened: prov?.homeUrl });
      return;
    }

    if (action === 'check_session' || action === 'status') {
      const session = await checkProviderSession(model);
      sendResponse({
        installed: true,
        version: '1.1.0',
        model,
        session,
        models: ['visionpilot', 'claude', 'gpt', 'gemini']
      });
      return;
    }

    const [session, tabInfo] = await Promise.all([
      checkProviderSession(model),
      queryProviderTab(model, payload.prompt || '')
    ]);

    sendResponse({
      installed: true,
      version: '1.1.0',
      model,
      action,
      session,
      providerSessionConnected: Boolean(session?.loggedIn || tabInfo?.connected),
      sessionInfo: tabInfo || session || { connected: false, mode: 'extension-local-bridge' }
    });
  })();
  return true;
});
