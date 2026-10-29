// VisionPilot AI Bridge — Popup Controller (v2.0.0)
document.addEventListener('DOMContentLoaded', () => {
  const rows = document.querySelectorAll('.m-row[data-model]');
  const statusMsg = document.getElementById('statusMsg');
  const openVisionPilotBtn = document.getElementById('openVisionPilotBtn');

  if (openVisionPilotBtn) {
    openVisionPilotBtn.addEventListener('click', () => {
      statusMsg.textContent = 'Opening Vision Pilot…';
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ type: 'VP_OPEN_VISION_PILOT' }, (resp) => {
          if (resp && resp.ok) {
            window.close();
          }
        });
      }
    });
  }

  function highlightActive(modelId) {
    rows.forEach(r => {
      const isAct = r.dataset.model === modelId;
      r.classList.toggle('active', isAct);
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['vpActiveModel'], (res) => {
      highlightActive(res?.vpActiveModel || 'visionpilot');
    });
  } else {
    highlightActive('visionpilot');
  }

  // Check real open tab & login state for Claude, GPT, and Gemini
  if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
    chrome.runtime.sendMessage({ type: 'VP_CHECK_PROVIDERS' }, (res) => {
      const p = res?.providers || {};
      ['claude', 'gpt', 'gemini'].forEach(id => {
        const el = document.getElementById('st-' + id);
        if (!el) return;
        if (p[id]?.loggedIn) {
          el.textContent = 'Ready ✓';
          el.classList.add('ok');
        } else if (p[id]?.tabOpen) {
          el.textContent = 'Not Logged In';
          el.classList.remove('ok');
        } else {
          el.textContent = 'Tab Closed';
          el.classList.remove('ok');
        }
      });
    });
  }

  document.querySelectorAll('[data-login]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const model = btn.dataset.login;
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ type: 'VP_OPEN_PROVIDER_LOGIN', model });
      }
    });
  });

  rows.forEach(row => {
    row.addEventListener('click', () => {
      const model = row.dataset.model;
      highlightActive(model);
      statusMsg.textContent = `Switching VisionPilot to ${model.toUpperCase()}…`;
      if (typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.sendMessage === 'function') {
        chrome.runtime.sendMessage({ type: 'VP_POPUP_SELECT_MODEL', model }, (resp) => {
          if (resp && resp.activatedCount > 0) {
            statusMsg.textContent = `✓ Sent ${model.toUpperCase()} selection to VisionPilot tab.`;
          } else {
            statusMsg.textContent = `Open VisionPilot tab and click ${model.toUpperCase()} at the top bar.`;
          }
        });
      }
    });
  });
});
