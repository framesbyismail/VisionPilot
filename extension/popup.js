// VisionPilot AI Bridge Popup
document.addEventListener('DOMContentLoaded', () => {
  try {
    chrome.storage.local.set({ vpBridgeInstalled: true });
  } catch (e) {}
});
