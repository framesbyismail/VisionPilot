// VisionPilot sign-in: Google or GitHub through the Cloudflare Worker. Advanced mode needs the owner's approval.
(() => {
const API = 'https://visionpilot-auth.ismailhossainn720.workers.dev';
const AC = window.AC, {$, esc, escAttr, hooks} = AC, KEY = 'vp-token';
const store = {get:() => { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
  set:v => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} }};
const ICON = {
  google:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h6a5.1 5.1 0 0 1-2.2 3.4v2.8h3.6c2-1.9 3.2-4.7 3.2-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7H2.1a11 11 0 0 0 0 10l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>',
  github:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .5a11.5 11.5 0 0 0-3.6 22.4c.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.2c0 .3.2.7.8.6A11.5 11.5 0 0 0 12 .5z"/></svg>'
};

// coming back from Google/GitHub: the token arrives in the address (#vp_token=...)
let token = store.get(), me = null;
const m = location.hash.match(/vp_token=([^&]+)/);
if (m) { token = m[1]; store.set(token); history.replaceState(null, '', location.pathname + location.search); }

const menu = $('authMenu'), wrap = $('authM'), btn = $('authBtn');
const configured = !API.includes('YOUR-SUBDOMAIN');
function render() {
  btn.classList.toggle('pro', !!me?.approved);
  btn.innerHTML = me ? `${me.picture ? `<img src="${escAttr(me.picture)}" alt="" referrerpolicy="no-referrer">` : ''}<span>${esc(me.name.split(' ')[0])}</span>` : '<span>Sign in</span>';
  menu.innerHTML = me
    ? `<div class="who"><strong>${esc(me.name)}</strong>${esc(me.email)}<br><span class="st${me.approved ? ' on' : ''}">${me.approved ? 'Advanced mode' : 'Normal mode · waiting for approval'}</span></div>`
      + (me.admin ? '<button type="button" data-act="admin">Approve users</button>' : '') + '<button type="button" data-act="out">Sign out</button>'
    : `<button type="button" data-act="google">${ICON.google}Continue with Google</button><button type="button" data-act="github">${ICON.github}Continue with GitHub</button>`;
}
const open = v => { wrap.classList.toggle('open', v); btn.setAttribute('aria-expanded', v); };
btn.addEventListener('click', () => open(!wrap.classList.contains('open')));
document.addEventListener('pointerdown', e => { if (!wrap.contains(e.target)) open(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
menu.addEventListener('click', e => {
  const a = e.target.closest('[data-act]')?.dataset.act; if (!a) return;
  open(false);
  if (a === 'out') { token = null; me = null; store.set(null); AC.setPro(false); render(); AC.toast('Signed out'); return; }
  if (a === 'admin') { window.open(API + '/admin', '_blank', 'noopener'); return; }
  if (!configured) { AC.toast('Sign-in is not set up yet'); return; }
  location.href = `${API}/login/${a}?return=${encodeURIComponent(location.href.split('#')[0])}`;
});

// ask the Worker who this is and whether the owner approved them
async function refresh() {
  if (!token || !configured) { me = null; AC.setPro(false); render(); return; }
  try {
    const r = await fetch(API + '/me', {headers:{authorization:'Bearer ' + token}});
    if (r.status === 401) { token = null; store.set(null); me = null; AC.setPro(false); }
    else if (r.ok) { me = await r.json(); AC.setPro(me.approved); }
  } catch (e) { /* offline: keep the last known state */ }
  render();
}
hooks.authInfo = () => ({signedIn:!!me, email:me?.email || ''});
hooks.signIn = () => { open(true); btn.focus(); };
// pick up an approval without a reload when the person comes back to the tab
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && token) refresh(); });
render();
refresh();
})();
