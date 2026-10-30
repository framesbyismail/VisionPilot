// VisionPilot Service Worker (sw.js)
// Defines the files to cache and the serving rules for instant loading & offline support.

const CACHE_VERSION = 'v44';
const APP_CACHE_NAME = `visionpilot-app-${CACHE_VERSION}`;
// one model cache for every version: models are only downloaded again when version.json says they changed
const MODEL_CACHE_NAME = 'visionpilot-models';

// Core application files to pre-cache on Service Worker install
const CORE_ASSETS = [
  './',
  './index.html',
  './splash.html',
  './ads.html',
  './ads.js',
  './add/add_image_1.png',
  './add/add_image_2.png',
  './add/add_image_3.png',
  './add/add_image_4.png',
  './privacy.html',
  './style.css',
  './detect.js',
  './ai-bridge.js',
  './core.js',
  './video.js',
  './resize.js',
  './auth.js',
  './clip-text/clip-writer.js',
  './clip-text/clip-worker.js',
  './models/ort.min.js',
  './logo/visionpilot-app-icon.svg',
  './logo/visionpilot-icon-dark.svg',
  './logo/visionpilot-icon-light.svg',
  './logo/visionpilot-logo-dark.svg',
  './logo/visionpilot-logo-light.svg',
  './logo/visionpilot-logo-full-dark.svg',
  './logo/visionpilot-logo-full-light.svg',
  './logo/visionpilot-wordmark-dark.svg',
  './logo/visionpilot-wordmark-light.svg',
  './visionpilot-ai-bridge-extension.zip',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Heavy ONNX / WASM / ML model & tokenizer files cached with Cache-First rules
const MODEL_ASSET_PATHS = [
  '/models/ort.min.js',
  '/models/ort.webgpu.min.js',
  '/models/ort-wasm-simd-threaded.mjs',
  '/models/ort-wasm-simd-threaded.wasm',
  '/models/ort-wasm-simd-threaded.jsep.mjs',
  '/models/ort-wasm-simd-threaded.jsep.wasm',
  '/models/ort-wasm-simd-threaded.jspi.mjs',
  '/models/ort-wasm-simd-threaded.jspi.wasm',
  '/models/ort-wasm-simd-threaded.asyncify.mjs',
  '/models/ort-wasm-simd-threaded.asyncify.wasm',
  '/models/RealESRGAN_x4plus.onnx',
  '/models/realesr-general-x4v3.onnx',
  '/models/realesr-animevideov3.onnx',
  '/clip-text/transformers.min.js',
  '/clip-text/config.json',
  '/clip-text/tokenizer.json',
  '/clip-text/tokenizer_config.json',
  '/clip-text/special_tokens_map.json',
  '/clip-text/ort-wasm-simd.wasm',
  '/clip-text/ort-wasm-simd-threaded.wasm',
  '/clip-text/text_model_quantized.onnx',
  '/clip-image/config.json',
  '/clip-image/preprocessor_config.json',
  '/clip-image/vision_model_quantized.onnx',
  '/visionpilot-ai-bridge-extension.zip'
];

// External CDN libraries eligible for Cache-First caching
const CACHEABLE_CDN_HOSTS = new Set([
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net'
]);

// Dynamic API / Auth hosts that must always bypass the Service Worker cache
const BYPASS_HOSTS = new Set([
  'visionpilot-auth.ismailhossainn720.workers.dev',
  'image.pollinations.ai',
  'text.pollinations.ai',
  'gen.pollinations.ai',
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com'
]);

function isModelOrImmutableAsset(url) {
  const p = url.pathname.toLowerCase();
  if (/\.(onnx|wasm|svg|woff2?|ttf|otf)$/i.test(p)) return true;
  if (p.includes('/models/') || p.includes('/clip-image/')) return true;
  if (p.includes('/clip-text/') && !p.endsWith('clip-writer.js') && !p.endsWith('clip-worker.js')) return true;
  return MODEL_ASSET_PATHS.some(suffix => p.endsWith(suffix.toLowerCase()));
}

// version.json (made on GitHub by scripts/build-site.mjs) lists every file with its SHA-256.
// Whenever it changes, only the cached files whose hash changed are dropped, so an upload reaches everyone on their next visit
// and the big models are downloaded again only when they really changed.
const META_CACHE_NAME = 'visionpilot-meta';
const MANIFEST_KEY = './__vp-manifest.json';
let lastManifestCheck = 0;
let manifestSync = null;
let manifestKnown = false; // false where there is no version.json (local copy): app files are then refreshed in the background
const scopeUrl = () => new URL(self.registration.scope);
async function syncWithManifest({force = false} = {}) {
  if (manifestSync) return manifestSync;
  if (!force && Date.now() - lastManifestCheck < 30000) return 0;
  lastManifestCheck = Date.now();
  manifestSync = (async () => {
    try {
      const res = await fetch(new URL('version.json', scopeUrl()).href, {cache:'no-store'});
      if (!res.ok) return 0;
      const next = await res.json();
      if (!next || !next.files) return 0;
      const meta = await caches.open(META_CACHE_NAME);
      const prevRes = await meta.match(MANIFEST_KEY);
      const prev = prevRes ? await prevRes.json().catch(() => null) : null;
      manifestKnown = true;
      if (prev && prev.version === next.version) return 0;
      const changed = new Set();
      if (prev && prev.files) {
        Object.keys(next.files).forEach(f => { if (prev.files[f] !== next.files[f]) changed.add(f); });
        Object.keys(prev.files).forEach(f => { if (!(f in next.files)) changed.add(f); });
      }
      // no earlier list (first visit after this version): every app file is checked once, models are kept
      const appCache = await caches.open(APP_CACHE_NAME), modelCache = await caches.open(MODEL_CACHE_NAME);
      const base = scopeUrl().pathname;
      let dropped = 0;
      for (const cache of [appCache, modelCache]) {
        for (const req of await cache.keys()) {
          const u = new URL(req.url);
          if (u.origin !== self.location.origin) continue;
          const rel = decodeURIComponent(u.pathname.startsWith(base) ? u.pathname.slice(base.length) : u.pathname.replace(/^\//, '')) || 'index.html';
          const drop = prev ? changed.has(rel) || (rel === 'index.html' && changed.has('index.html')) : cache === appCache;
          if (drop) { await cache.delete(req); dropped++; }
        }
      }
      await meta.put(MANIFEST_KEY, new Response(JSON.stringify(next), {headers:{'content-type':'application/json'}}));
      return dropped;
    } catch (_) {
      return 0;
    } finally {
      manifestSync = null;
    }
  })();
  return manifestSync;
}
const withTimeout = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(undefined), ms))]);

// 1. Install: pre-cache core application shell files
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE_NAME);
      await Promise.allSettled(
        CORE_ASSETS.map(async assetUrl => {
          try {
            const req = new Request(assetUrl, { cache: 'no-cache' });
            const res = await fetch(req);
            if (res && (res.ok || res.type === 'opaque')) {
              await cache.put(assetUrl, res);
            }
          } catch (_) {
            // Ignore individual missing optional assets during install
          }
        })
      );
      await self.skipWaiting();
    })()
  );
});

// 2. Activate: clean up outdated app caches (the model cache is kept and moved over), take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const models = await caches.open(MODEL_CACHE_NAME);
      for (const key of keys) {
        if (key === APP_CACHE_NAME || key === MODEL_CACHE_NAME || key === META_CACHE_NAME || !key.startsWith('visionpilot-')) continue;
        // model caches from older versions: keep the downloaded models instead of fetching them again
        if (key.startsWith('visionpilot-models')) {
          const old = await caches.open(key);
          for (const req of await old.keys()) { const r = await old.match(req); if (r && !(await models.match(req))) await models.put(req, r); }
        }
        await caches.delete(key);
      }
      await self.clients.claim();
      await syncWithManifest({force:true});
    })()
  );
});

// Allow the page to trigger an immediate skipWaiting update
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 3. Fetch: rules for serving cached vs. network files
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET requests over http/https
  if (request.method !== 'GET') return;
  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Never intercept auth or AI generation API calls
  if (BYPASS_HOSTS.has(url.hostname)) return;

  const isSameOrigin = url.origin === self.location.origin;
  const isCacheableCdn = CACHEABLE_CDN_HOSTS.has(url.hostname);
  if (!isSameOrigin && !isCacheableCdn) return;
  // the update list itself always comes from the network
  if (isSameOrigin && url.pathname.endsWith('/version.json')) return;

  // Rule 0: the page itself: network first (an upload shows at once), the cached page when offline or the network is slow.
  // The update list is checked first, so the scripts the page asks for next are the new ones.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(APP_CACHE_NAME);
        const net = fetch(request).then(res => {
          if (res && res.status === 200 && res.type === 'basic') cache.put(request, res.clone()).catch(() => {});
          return res;
        }).catch(() => null);
        await withTimeout(syncWithManifest({force:true}), 2500);
        const res = await withTimeout(net, 4000);
        if (res) return res;
        const cached = await cache.match(request, { ignoreSearch: true }) || await cache.match('./index.html') || await cache.match('./');
        if (cached) return cached;
        return (await net) || new Response('Offline', { status: 503, statusText: 'Offline' });
      })()
    );
    return;
  }

  // Rule A: Cache-First for large ONNX/WASM models, icons, and immutable CDN libraries (Three.js, etc.)
  // (a model that changed on GitHub was already dropped by syncWithManifest, so it is downloaded fresh)
  if (isCacheableCdn || isModelOrImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MODEL_CACHE_NAME);
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;
        try {
          const networkRes = await fetch(request);
          if (networkRes && (networkRes.status === 200 || networkRes.type === 'opaque')) {
            cache.put(request, networkRes.clone()).catch(() => {});
          }
          return networkRes;
        } catch (err) {
          const fallback = await caches.match(request, { ignoreSearch: true });
          if (fallback) return fallback;
          throw err;
        }
      })()
    );
    return;
  }

  // Rule B: app files (HTML, CSS, JS): instant from the cache; files that changed on GitHub were already dropped,
  // anything not in the cache comes from the network and is kept
  event.respondWith(
    (async () => {
      const cache = await caches.open(APP_CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });
      if (cached) {
        if (!manifestKnown) {
          event.waitUntil(new Promise(r => setTimeout(r, 2200)).then(() => fetch(request)).then(res => {
            if (res && res.status === 200 && res.type === 'basic') return cache.put(request, res);
          }).catch(() => {}));
        }
        return cached;
      }
      try {
        const networkRes = await fetch(request);
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          cache.put(request, networkRes.clone()).catch(() => {});
        }
        return networkRes;
      } catch (_) {
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
