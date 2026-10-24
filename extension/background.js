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

// Track whether each provider tab has been started as a fresh new chat in this session
const freshChatStarted = {
  claude: false,
  gpt: false,
  gemini: false
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
  return /^https:\/\/(claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com)\//i.test(url);
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

chrome.tabs.onRemoved.addListener((tabId) => {
  knownVisionPilotTabIds.delete(tabId);
  for (const k of Object.keys(activeProviderTabIds)) {
    if (activeProviderTabIds[k] === tabId) {
      activeProviderTabIds[k] = null;
      freshChatStarted[k] = false;
    }
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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

// CHANGE 3: Put VisionPilot and the tabs for Claude, ChatGPT and Gemini together in one Chrome tab group,
// and open any missing tab inside that group.
async function ensureVisionPilotTabGroup(senderTabId = null, extraTabIds = []) {
  try {
    if (senderTabId) knownVisionPilotTabIds.add(senderTabId);

    const allTabs = await chrome.tabs.query({});
    const vpTabs = allTabs.filter((t) => isVisionPilotTab(t));
    const providerTabs = allTabs.filter((t) => t.id && isProviderUrl(t.url));

    // Determine target windowId (prefer senderTab's window, then first VisionPilot tab's window, then first provider tab's window)
    let targetWindowId = null;
    if (senderTabId) {
      const senderTab = allTabs.find((t) => t.id === senderTabId);
      if (senderTab && senderTab.windowId !== undefined) targetWindowId = senderTab.windowId;
    }
    if (targetWindowId === null && vpTabs.length > 0) {
      targetWindowId = vpTabs[0].windowId;
    }
    if (targetWindowId === null && providerTabs.length > 0) {
      targetWindowId = providerTabs[0].windowId;
    }

    const tabIdsSet = new Set();
    for (const t of vpTabs) {
      if (targetWindowId === null || t.windowId === targetWindowId) tabIdsSet.add(t.id);
    }
    for (const t of providerTabs) {
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

    // Find an existing valid groupId among these tabs or vpTabGroupId
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

    if (groupIdToUse === null) {
      for (const id of tabIds) {
        const t = allTabs.find((x) => x.id === id);
        if (t && typeof t.groupId === 'number' && t.groupId >= 0) {
          groupIdToUse = t.groupId;
          break;
        }
      }
    }

    if (groupIdToUse === null && chrome.tabGroups && typeof chrome.tabGroups.query === 'function') {
      try {
        const groups = await chrome.tabGroups.query(targetWindowId !== null ? { windowId: targetWindowId } : {});
        const existingVpGroup = groups.find((g) => /visionpilot/i.test(g.title || ''));
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

// Inject MAIN-world clipboard writeText + execCommand('copy') hook so clicking Copy buttons
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
        try {
          const origExecCommand = document.execCommand.bind(document);
          document.execCommand = function (cmd, showUI, val) {
            if (String(cmd).toLowerCase() === 'copy') {
              try {
                const sel = window.getSelection ? window.getSelection().toString() : '';
                if (sel && document.documentElement) {
                  document.documentElement.dataset.vpLastCopied = sel;
                }
              } catch (e) {}
            }
            return origExecCommand(cmd, showUI, val);
          };
        } catch (e) {}
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
  }

  let tab = null;
  try {
    const existingTabs = await chrome.tabs.query({ url: prov.matchUrls });
    if (existingTabs && existingTabs.length > 0) {
      // Reuse existing tab for this provider, preferring the tracked one or one in the same window
      tab =
        existingTabs.find((t) => t.id === activeProviderTabIds[model]) ||
        (targetWindowId !== undefined ? existingTabs.find((t) => t.windowId === targetWindowId) : null) ||
        existingTabs[0];

      console.log(`[VP Background] Reusing existing ${prov.name} tab (id=${tab.id}) and starting a fresh new chat: ${prov.newChatUrl}`);
      tab = await chrome.tabs.update(tab.id, {
        url: prov.newChatUrl,
        active: Boolean(options.focusTab)
      });
    } else {
      const createOpts = {
        url: prov.newChatUrl,
        active: Boolean(options.focusTab)
      };
      if (targetWindowId !== undefined) createOpts.windowId = targetWindowId;
      tab = await chrome.tabs.create(createOpts);
      console.log(`[VP Background] Created new ${prov.name} tab (id=${tab.id}) at ${prov.newChatUrl}`);
    }
  } catch (err) {
    return {
      ok: false,
      error: `Failed to open ${prov.name} tab: ${err?.message || err}`
    };
  }

  activeProviderTabIds[model] = tab.id;
  freshChatStarted[model] = true;

  // Put VisionPilot and all open Claude/ChatGPT/Gemini tabs (including this tab) into one Chrome tab group
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

  // If this provider hasn't started a fresh chat in this session yet, start a fresh chat even if an old tab was already open
  if (!freshChatStarted[model]) {
    return await ensureFreshProviderChatTab(model, { focusTab: false, senderTabId });
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
      // Ensure this newly adopted tab starts a fresh new chat and joins the tab group
      return await ensureFreshProviderChatTab(model, { focusTab: false, senderTabId });
    }
  }

  // If no tab is open at all, open a fresh new chat tab inside the group
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
    const result = await chrome.tabs.sendMessage(tabStatus.tabId, {
      type: 'VP_SITE_RUN_PROMPT',
      payload: { images, instruction, step: payload.step || '', refId, reqId },
      images,
      instruction,
      step: payload.step || ''
    });

    // If the provider tab was temporarily focused for clipboard reading, return focus to VisionPilot tab
    if (senderTabId) {
      try {
        await chrome.tabs.update(senderTabId, { active: true });
      } catch (e) {}
    }

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
    if (senderTabId) {
      try {
        await chrome.tabs.update(senderTabId, { active: true });
      } catch (e) {}
    }
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

// Cancel any in-flight requests and tell open AI tabs to stop generating
async function cancelPendingRequests(payload = {}) {
  cancelEpoch++;
  if (payload.refId) cancelledRefIds.add(payload.refId);
  if (payload.reqId) cancelledReqIds.add(payload.reqId);
  console.log('[VP Background] Cancelling pending AI requests:', payload);

  for (const model of Object.keys(PROVIDERS)) {
    const tabId = activeProviderTabIds[model];
    if (tabId) {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'VP_SITE_ABORT_PROMPT',
          refId: payload.refId || null,
          reqId: payload.reqId || null
        });
      } catch (e) {}
    }
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
  if (!msg) return false;

  // Content script requests temporary tab focus so clipboard can be read reliably (BUG 1)
  if (msg.type === 'VP_FOCUS_TAB_FOR_COPY') {
    (async () => {
      try {
        if (sender?.tab?.id) {
          await chrome.tabs.update(sender.tab.id, { active: true });
          await sleep(120);
        }
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: e?.message || String(e) });
      }
    })();
    return true;
  }

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

  if (msg.type !== 'VP_AI_BRIDGE_REQUEST') return false;

  (async () => {
    const payload = msg.payload || {};
    const action = payload.action || 'status';
    const model = payload.model || 'claude';
    const senderTabId = sender?.tab?.id || null;
    if (senderTabId) knownVisionPilotTabIds.add(senderTabId);

    if (action === 'cancel_requests') {
      const res = await cancelPendingRequests(payload);
      sendResponse(res);
      return;
    }

    if (action === 'connect_model') {
      const res = await ensureFreshProviderChatTab(model, {
        focusTab: Boolean(payload.focusTab),
        senderTabId
      });
      sendResponse(res);
      return;
    }

    if (action === 'run_prompt') {
      const res = await runProviderPrompt(model, payload, senderTabId);
      sendResponse(res);
      return;
    }

    if (action === 'open_login') {
      const prov = PROVIDERS[model];
      if (prov) {
        const res = await ensureFreshProviderChatTab(model, { focusTab: true, senderTabId });
        sendResponse({ ok: true, opened: prov.newChatUrl, tabId: res.tabId });
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
