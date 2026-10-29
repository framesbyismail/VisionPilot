// VisionPilot sign-in: Google or GitHub through the Cloudflare Worker. Advanced mode needs a request and the owner's approval.
(() => {
const API = 'https://visionpilot-auth.ismailhossainn720.workers.dev';
const AC = window.AC, {$, esc, escAttr, hooks} = AC, KEY = 'vp-token', AFTER = 'vp-after-login';
const store = {get:k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set:(k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }};
const ICON = {
  google:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
  github:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>',
  check:'<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 6.5 2.5 2.5L10 3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
};

// coming back from Google/GitHub: the token arrives in the address (#vp_token=...)
let token = store.get(KEY), me = null, busy = false;
const m = location.hash.match(/vp_token=([^&]+)/);
if (m) { token = m[1]; store.set(KEY, token); history.replaceState(null, '', location.pathname + location.search); }

const menu = $('authMenu'), wrap = $('authM'), btn = $('authBtn');
const configured = !API.includes('YOUR-SUBDOMAIN');
const status = () => (me?.approved || AC.S?.mode === 'adv') ? 'Advanced mode' : me?.requested ? 'Normal mode · request sent' : 'Normal mode';
function makeInitialAvatarSvg(nameStr) {
  const clean = String(nameStr || 'U').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : clean.slice(0, 2).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1a7431"/><stop offset="100%" stop-color="#3fb950"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#g)"/><text x="32" y="34" text-anchor="middle" dominant-baseline="central" font-family="Inter,Segoe UI,sans-serif" font-size="25" font-weight="800" fill="#ffffff">${esc(initials)}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function render() {
  const isAdv = Boolean(AC.S?.mode === 'adv' || me?.approved);
  if (btn) {
    btn.classList.toggle('pro', !!me?.approved);
    btn.innerHTML = me ? `${me.picture ? `<img src="${escAttr(me.picture)}" alt="" referrerpolicy="no-referrer">` : ''}<span>${esc(me.name.split(' ')[0])}</span>` : '<span>Sign in</span>';
  }
  const userHead = $('vpDrawerUserHead');
  if (userHead) {
    userHead.classList.toggle('adv-active', isAdv);
  }
  const userPic = $('vpDrawerUserPic');
  const fallbackIco = $('vpDrawerUserFallbackIco');
  if (userPic) {
    if (me && (me.picture || me.name || me.email)) {
      const fallbackUrl = makeInitialAvatarSvg(me.name || me.email || 'User');
      userPic.onerror = () => {
        userPic.onerror = null;
        userPic.src = fallbackUrl;
      };
      userPic.src = me.picture || fallbackUrl;
      userPic.hidden = false;
      if (fallbackIco) fallbackIco.style.display = 'none';
    } else {
      userPic.hidden = true;
      userPic.removeAttribute('src');
      if (fallbackIco) fallbackIco.style.display = '';
    }
  }
  if ($('vpDrawerUserName')) {
    $('vpDrawerUserName').textContent = me ? (me.name || me.email || 'Account') : 'Sign in';
  }
  if ($('vpDrawerUserMode')) {
    $('vpDrawerUserMode').textContent = isAdv ? 'Advanced' : 'Normal';
  }
  if (menu) {
    menu.innerHTML = me
      ? `<div class="who"><strong>${esc(me.name)}</strong>${esc(me.email)}<br><span class="st${isAdv ? ' on' : ''}">${status()}</span></div>`
        + (isAdv ? '' : '<button type="button" data-act="adv">Get Advanced mode</button>') + '<button type="button" data-act="out">Sign out</button>'
      : `<div class="who"><strong>Guest User</strong>Sign in to sync your account<br><span class="st${isAdv ? ' on' : ''}">${isAdv ? 'Advanced mode' : 'Normal mode'}</span></div>`
        + `<button type="button" data-act="google">${ICON.google}Continue with Google</button><button type="button" data-act="github">${ICON.github}Continue with GitHub</button>`
        + (isAdv ? '' : '<button type="button" data-act="adv">Get Advanced mode</button>');
  }
}
// the buttons inside the "Advanced mode needed" panel
function advRender() {
  const acts = $('advActs'), st = $('advState');
  if (!acts || !st) return;
  if (!me) {
    acts.innerHTML = `<button type="button" data-adv="google">${ICON.google}Sign in with Google</button><button type="button" data-adv="github">${ICON.github}Sign in with GitHub</button>`;
    st.textContent = 'Sign in first, then send your request with one click.';
  } else if (me.approved) {
    acts.innerHTML = ''; st.textContent = 'Your account has Advanced mode.';
  } else if (me.requested) {
    acts.innerHTML = `<button type="button" disabled>${ICON.check}Request sent</button>`;
    st.textContent = `framesbyismail has your request (${me.email}). Advanced mode opens here by itself once it is approved.`;
  } else {
    acts.innerHTML = '<button type="button" class="go" data-adv="request">Request Advanced mode</button>';
    st.textContent = `Signed in as ${me.email}.`;
  }
}
const signIn = p => {
  if (!configured) { AC.toast('Sign-in is not set up yet'); return; }
  if (window.visionPilotDesktop?.isDesktop && typeof window.visionPilotDesktop.openExternalSignIn === 'function') {
    const returnUrl = `${location.origin}/api/auth-callback`;
    const authUrl = `${API}/login/${p}?return=${encodeURIComponent(returnUrl)}`;
    window.visionPilotDesktop.openExternalSignIn(authUrl);
    AC.toast('Browser opened for sign-in — will sync automatically once signed in');
    startDesktopAuthSyncPoll();
    return;
  }
  location.href = `${API}/login/${p}?return=${encodeURIComponent(location.href.split('#')[0])}`;
};
async function request() {
  if (busy || !me) return;
  busy = true; $('advActs').querySelector('[data-adv=request]')?.setAttribute('disabled', '');
  try {
    const r = await fetch(API + '/request', {method:'POST', headers:{authorization:'Bearer ' + token}});
    if (r.ok) { const d = await r.json(); if (d.approved) await refresh(); else { me.requested = true; AC.toast('Request sent to framesbyismail'); } }
    else AC.toast('Could not send the request. Try again.');
  } catch (e) { AC.toast('Could not send the request. Check the internet.'); }
  busy = false; render(); advRender(); poll();
}
$('advActs').addEventListener('click', e => {
  const a = e.target.closest('[data-adv]')?.dataset.adv; if (!a) return;
  if (a === 'request') request();
  else { store.set(AFTER, '1'); signIn(a); }   // open the panel again after the sign-in round trip
});

const open = v => { if (!wrap) return; wrap.classList.toggle('open', v); btn?.setAttribute('aria-expanded', v); };
btn?.addEventListener('click', () => open(!wrap.classList.contains('open')));
document.addEventListener('pointerdown', e => { if (wrap && !wrap.contains(e.target)) open(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
menu?.addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
  open(false);
  if (a === 'out') { token = null; me = null; store.set(KEY, null); store.set('vp-pro', null); AC.setPro(false); render(); AC.toast('Signed out'); return; }
  if (a === 'adv') { AC.needAdv(); return; }
  signIn(a);
});

// ask the Worker who this is and whether the owner approved them
async function refresh() {
  if (!token || !configured) { me = null; if (store.get('vp-pro') !== '1') AC.setPro(false); render(); return; }
  try {
    const r = await fetch(API + '/me', {headers:{authorization:'Bearer ' + token}});
    if (r.status === 401) { token = null; store.set(KEY, null); me = null; AC.setPro(false); }
    else if (r.ok) {
      const was = me?.approved; me = await r.json(); AC.setPro(me.approved);
      if (me.approved && was === false) { AC.hideAdv(); AC.toast('Advanced mode is open. Enjoy!'); }
      pushSharedSyncState();
    }
  } catch (e) { /* offline: keep the last known state */ }
  render(); advRender();
}
function pushSharedSyncState() {
  try {
    const payload = {
      token: token || null,
      user: me || null,
      pro: store.get('vp-pro') || null,
      history: store.get('vp_gen_history_v1') || null,
      settings: store.get('vp-v4') || null,
      updatedAt: Date.now()
    };
    window.dispatchEvent(new CustomEvent('vp-sync-state-push', { detail: payload }));
    fetch('http://127.0.0.1:45780/api/sync-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {}
}
async function pullSharedSyncState() {
  try {
    const resp = await fetch('http://127.0.0.1:45780/api/sync-state', { method: 'GET' });
    if (!resp || !resp.ok) return false;
    const data = await resp.json();
    if (!data) return false;
    let changed = false;
    if (data.token && data.token !== token) {
      token = data.token;
      store.set(KEY, token);
      changed = true;
    }
    if (data.user && (!me || me.email !== data.user.email)) {
      me = data.user;
      if (me.approved) AC.setPro(true);
      changed = true;
    }
    if (data.history && !store.get('vp_gen_history_v1')) {
      store.set('vp_gen_history_v1', data.history);
    }
    if (changed) {
      render();
      advRender();
      await refresh();
      return true;
    }
  } catch (e) {}
  return false;
}
let desktopSyncTimer = null;
function startDesktopAuthSyncPoll() {
  clearInterval(desktopSyncTimer);
  let tries = 0;
  desktopSyncTimer = setInterval(async () => {
    tries++;
    const got = await pullSharedSyncState();
    if (got || tries > 90) clearInterval(desktopSyncTimer);
  }, 2000);
}
if (window.visionPilotDesktop?.onAuthToken) {
  window.visionPilotDesktop.onAuthToken(newTok => {
    if (newTok && newTok !== token) {
      token = newTok;
      store.set(KEY, token);
      refresh();
      AC.toast('Account signed in & synced with browser!');
    }
  });
}
// while a request waits, check now and then so Advanced opens without a reload
let pollT;
function poll() {
  clearInterval(pollT);
  if (me?.requested && !me.approved) pollT = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 60000);
}
hooks.authInfo = () => ({signedIn:!!me, user:me, email:me?.email || '', requested:!!me?.requested});
hooks.signIn = () => {
  if (typeof window.toggleHistoryDrawer === 'function') window.toggleHistoryDrawer(true);
  const sec = $('vpDrawerUserSec'), body = $('vpDrawerUserBody');
  if (sec) sec.classList.remove('min');
  if (body) body.hidden = false;
  open(true);
};
hooks.advRender = () => { render(); advRender(); };
const prevAfterSync = hooks.afterSync;
hooks.afterSync = () => {
  prevAfterSync?.();
  render();
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && token) refresh(); });
render(); advRender();
// the loading screen waits for this: the sign-in backend has answered (or could not be reached)
const authSettled = () => { if (window.__vpAuthSettled) return; window.__vpAuthSettled = true; window.dispatchEvent(new Event('vp-auth-settled')); };
pullSharedSyncState().catch(() => {}).then(() => refresh()).then(() => {
  authSettled();
  if (token) pushSharedSyncState();
  poll();
  if (store.get(AFTER)) { store.set(AFTER, null); if (me && !me.approved) AC.needAdv(); }
}).catch(authSettled);
})();
