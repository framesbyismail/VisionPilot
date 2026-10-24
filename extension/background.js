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
  }
};

const activeProviderTabIds = {
  claude: null,
  gpt: null,
  gemini: null
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isProviderUrl(url) {
  if (!url) return false;
  return /^https:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com)\//i.test(url);
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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url) {
    if (/^(chrome|edge|about|devtools|chrome-extension):/i.test(tab.url)) return;
    if (!isProviderUrl(tab.url)) {
      chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      }).catch(() => {});
    }
  }
});

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

// Inject MAIN-world clipboard writeText hook so clicking Copy buttons on background tabs
// stores the exact copied text in document.documentElement.dataset.vpLastCopied
async function injectProviderHelpers(tabId, scriptFile) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        if (window.__vpClipboardHookInstalled) return;
        window.__vpClipboardHookInstalled = true;
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            const origWriteText = navigator.clipboard.writeText.bind(navigator.clipboard);
            navigator.clipboard.writeText = async function (text) {
              try {
                if (document.documentElement) {
                  document.documentElement.dataset.vpLastCopied = String(text ?? '');
                }
              } catch (e) {}
              try {
                return await origWriteText(text);
              } catch (e) {
                return undefined;
              }
            };
          }
        } catch (e) {}
      }
    });
  } catch (e) {}

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [scriptFile]
  });
}

// Open or reuse the provider's tab, ALWAYS navigating to a fresh new chat URL
async function ensureFreshProviderChatTab(model, options = {}) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unknown AI model: ${model}` };
  }

  let tab = null;
  try {
    const existingTabs = await chrome.tabs.query({ url: prov.matchUrls });
    if (existingTabs && existingTabs.length > 0) {
      // Pick tracked tab if still open, otherwise first matching tab
      tab = existingTabs.find(t => t.id === activeProviderTabIds[model]) || existingTabs[0];
      // Always start a fresh new chat and never reuse an old conversation
      tab = await chrome.tabs.update(tab.id, {
        url: prov.newChatUrl,
        active: Boolean(options.focusTab)
      });
    } else {
      tab = await chrome.tabs.create({
        url: prov.newChatUrl,
        active: Boolean(options.focusTab)
      });
    }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to open ${prov.name} tab: ${err?.message || err}`
    };
  }

  activeProviderTabIds[model] = tab.id;

  try {
    await waitForTabComplete(tab.id, 25000);
  } catch (err) {
    return { ok: false, error: err?.message || `Timed out loading ${prov.name}.` };
  }

  // Wait for SPA hydration and check readiness up to ~6 seconds
  let lastResp = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(attempt === 0 ? 900 : 600);
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

// Get the currently open provider tab (or open a fresh one if none exists)
async function getOrOpenProviderTabForPrompt(model) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unknown AI model: ${model}` };
  }

  let tab = null;
  if (activeProviderTabIds[model]) {
    try {
      tab = await chrome.tabs.get(activeProviderTabIds[model]);
    } catch (e) {
      tab = null;
    }
  }

  if (!tab) {
    const existingTabs = await chrome.tabs.query({ url: prov.matchUrls });
    if (existingTabs && existingTabs.length > 0) {
      tab = existingTabs[0];
      activeProviderTabIds[model] = tab.id;
    }
  }

  // If no tab is open at all, open a fresh new chat tab
  if (!tab) {
    return await ensureFreshProviderChatTab(model, { focusTab: false });
  }

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

// Execute a real image + instruction prompt on the provider tab
async function runProviderPrompt(model, payload) {
  const prov = PROVIDERS[model];
  if (!prov) {
    return { ok: false, error: `Unsupported AI model: ${model}` };
  }

  const images = Array.isArray(payload.images) ? payload.images : [];
  const instruction = typeof payload.instruction === 'string' ? payload.instruction : '';

  if (!instruction.trim()) {
    return { ok: false, error: 'Instruction text is missing.' };
  }
  if (images.length === 0) {
    return { ok: false, error: 'No image provided to send to ' + prov.name + '.' };
  }

  // If caller requested a fresh chat before sending, or if no tab is ready
  const tabStatus = payload.freshChat
    ? await ensureFreshProviderChatTab(model, { focusTab: false })
    : await getOrOpenProviderTabForPrompt(model);

  if (!tabStatus.ok || !tabStatus.tabId) {
    return {
      ok: false,
      provider: model,
      error: tabStatus.error || `Failed to prepare ${prov.name} chat tab.`
    };
  }

  try {
    await injectProviderHelpers(tabStatus.tabId, prov.scriptFile);
    const result = await chrome.tabs.sendMessage(tabStatus.tabId, {
      type: 'VP_SITE_RUN_PROMPT',
      payload: { images, instruction },
      images,
      instruction
    });

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
        error: result.error || `${prov.name} failed to process the request.`
      };
    }
    if (!Array.isArray(result.blocks) || result.blocks.length === 0) {
      return {
        ok: false,
        provider: model,
        error: `${prov.name} replied without a copyable code block.`
      };
    }
    return {
      ok: true,
      provider: model,
      blocks: result.blocks,
      fullText: result.fullText || result.blocks.join('\n\n')
    };
  } catch (err) {
    return {
      ok: false,
      provider: model,
      error: `Error communicating with ${prov.name} tab: ${err?.message || err}`
    };
  }
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
  if (!msg) return false;

  if (msg.type === 'VP_CHECK_PROVIDERS') {
    (async () => {
      const [claude, gpt, gemini] = await Promise.all([
        checkOpenProviderStatus('claude'),
        checkOpenProviderStatus('gpt'),
        checkOpenProviderStatus('gemini')
      ]);
      sendResponse({ ok: true, providers: { claude, gpt, gemini } });
    })();
    return true;
  }

  if (msg.type === 'VP_OPEN_PROVIDER_LOGIN') {
    const prov = PROVIDERS[msg.model];
    if (prov) {
      chrome.tabs.create({ url: prov.newChatUrl, active: true });
      sendResponse({ ok: true, url: prov.newChatUrl });
    } else {
      sendResponse({ ok: false, error: 'Unknown provider' });
    }
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

  if (msg.type !== 'VP_AI_BRIDGE_REQUEST') return false;

  (async () => {
    const payload = msg.payload || {};
    const action = payload.action || 'status';
    const model = payload.model || 'claude';

    if (action === 'connect_model') {
      const res = await ensureFreshProviderChatTab(model, { focusTab: Boolean(payload.focusTab) });
      sendResponse(res);
      return;
    }

    if (action === 'run_prompt') {
      const res = await runProviderPrompt(model, payload);
      sendResponse(res);
      return;
    }

    if (action === 'open_login') {
      const prov = PROVIDERS[model];
      if (prov) {
        await chrome.tabs.create({ url: prov.newChatUrl, active: true });
        sendResponse({ ok: true, opened: prov.newChatUrl });
      } else {
        sendResponse({ ok: false, error: `Unknown model: ${model}` });
      }
      return;
    }

    // Basic extension installation ping
    sendResponse({
      ok: true,
      installed: true,
      version: '2.0.0',
      models: ['visionpilot', 'claude', 'gpt', 'gemini']
    });
  })();

  return true;
});
