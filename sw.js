// VisionPilot Service Worker (sw.js)
// Defines the files to cache and the serving rules for instant loading & offline support.

const CACHE_VERSION = 'v40';
const APP_CACHE_NAME = `visionpilot-app-${CACHE_VERSION}`;
const MODEL_CACHE_NAME = `visionpilot-models-${CACHE_VERSION}`;

// Core application files to pre-cache on Service Worker install
const CORE_ASSETS = [
  './',
  './index.html',
  './splash.html',
  './privacy.html',
  './style.css',
  './visionpilotbgremover.js',
  './detect.js',
  './ai-bridge.js',
  './core.js',
  './video.js',
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
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Heavy ONNX / WASM / ML model & tokenizer files cached with Cache-First rules
const MODEL_ASSET_PATHS = [
  '/visionpilotbackgroundremovermodel/vision_bundle.mjs',
  '/visionpilotbackgroundremovermodel/vision_wasm_internal.js',
  '/visionpilotbackgroundremovermodel/vision_wasm_internal.wasm',
  '/visionpilotbackgroundremovermodel/selfie_segmenter.tflite',
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

// 1. Install: pre-cache core application shell files
self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_CACHE_NAME);
      await Promise.allSettled(
        CORE_ASSETS.map(async assetUrl => {
          try {
            const req = new Request(assetUrl, { cache: 'default' });
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

// 2. Activate: clean up outdated caches and take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map(key => {
          if (key !== APP_CACHE_NAME && key !== MODEL_CACHE_NAME && key.startsWith('visionpilot-')) {
            return caches.delete(key);
          }
          return undefined;
        })
      );
      await self.clients.claim();
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

  // Rule A: Cache-First for large ONNX/WASM models, icons, and immutable CDN libraries (Three.js, etc.)
  if (isCacheableCdn || isModelOrImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(MODEL_CACHE_NAME);
        const cached = await cache.match(request, { ignoreSearch: true }) || await caches.match(request, { ignoreSearch: true });
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

  // Rule B: Instant Cache-First with deferred background revalidation for core app shell (HTML, CSS, JS)
  // Serves cached response in <2ms with zero startup network contention
  event.respondWith(
    (async () => {
      const cache = await caches.open(APP_CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true });

      if (cached) {
        // Defer background revalidation so initial page render & scripts run at full speed
        event.waitUntil(
          new Promise(resolve => setTimeout(resolve, 2200)).then(() =>
            fetch(request)
              .then(networkRes => {
                if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
                  return cache.put(request, networkRes.clone());
                }
              })
              .catch(() => {})
          )
        );
        return cached;
      }

      try {
        const networkRes = await fetch(request);
        if (networkRes && networkRes.status === 200 && networkRes.type === 'basic') {
          cache.put(request, networkRes.clone()).catch(() => {});
        }
        return networkRes;
      } catch (_) {
        if (request.mode === 'navigate') {
          const indexFallback = await cache.match('./index.html') || await cache.match('./');
          if (indexFallback) return indexFallback;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});
