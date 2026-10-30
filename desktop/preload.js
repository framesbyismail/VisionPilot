// Vision Pilot desktop — what the page can use (window.visionPilotDesktop)
const {contextBridge, ipcRenderer} = require('electron');
const listen = (ch, cb) => { if (typeof cb !== 'function') return () => {}; const l = (_e, m) => cb(m); ipcRenderer.on(ch, l); return () => ipcRenderer.removeListener(ch, l); };

contextBridge.exposeInMainWorld('visionPilotDesktop', {
  isDesktop: true,
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('vp:get-version'),
  siteVersion: () => ipcRenderer.invoke('vp:site-version'),
  checkForUpdates: () => ipcRenderer.invoke('vp:check-updates'),
  openExternalSignIn: url => ipcRenderer.invoke('vp:open-external-signin', url),
  // AI jobs go to the Vision Pilot extension in the user's main Chrome
  runSilentAiBridge: payload => ipcRenderer.invoke('vp:silent-ai-bridge', payload),
  extensionLinkStatus: () => ipcRenderer.invoke('vp:ext-status'),
  onBridgeProgress: cb => listen('vp:bridge-progress', cb),
  onUpdateStatus: cb => listen('vp:update-status', cb),
  onAuthToken: cb => listen('vp:auth-token', cb),
  // the page's real loading steps drive the splash bar, and it says when it is ready
  loadProgress: (pct, label) => ipcRenderer.send('vp:load-progress', pct, label),
  appReady: () => ipcRenderer.send('vp:app-ready')
});
