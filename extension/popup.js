// VisionPilot AI Bridge — Popup Controller
document.addEventListener('DOMContentLoaded', () => {
  const rows = document.querySelectorAll('.m-row[data-model]');
  const statusMsg = document.getElementById('statusMsg');

  function highlightActive(modelId) {
    rows.forEach(r => {
      const isAct = r.dataset.model === modelId;
      r.classList.toggle('active', isAct);
    });
  }

  chrome.storage.local.get(['vpActiveModel'], (res) => {
    highlightActive(res?.vpActiveModel || 'visionpilot');
  });

  // Check real browser login state for Claude, GPT, and Gemini
  chrome.runtime.sendMessage({ type: 'VP_CHECK_PROVIDERS' }, (res) => {
    const p = res?.providers || {};
    ['claude', 'gpt', 'gemini'].forEach(id => {
      const el = document.getElementById('st-' + id);
      if (!el) return;
      if (p[id]?.loggedIn) {
        el.textContent = 'Logged In ✓';
        el.classList.add('ok');
      } else {
        el.textContent = 'Bridge Ready';
      }
    });
  });

  document.querySelectorAll('[data-login]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const model = btn.dataset.login;
      chrome.runtime.sendMessage({ type: 'VP_OPEN_PROVIDER_LOGIN', model });
    });
  });

  rows.forEach(row => {
    row.addEventListener('click', () => {
      const model = row.dataset.model;
      highlightActive(model);
      statusMsg.textContent = `Switching VisionPilot to ${model.toUpperCase()}…`;
      chrome.runtime.sendMessage({ type: 'VP_POPUP_SELECT_MODEL', model }, (resp) => {
        if (resp && resp.activatedCount > 0) {
          statusMsg.textContent = `✓ ${model.toUpperCase()} is now active in your VisionPilot tab!`;
        } else {
          statusMsg.textContent = `✓ ${model.toUpperCase()} saved as active model. Refresh your VisionPilot tab if needed.`;
        }
      });
    });
  });
});
