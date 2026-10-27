// VisionPilot 4:3 Ad Box Carousel (ads.js)
// Supports any number of images, 1000ms auto-rotation, smooth slide transitions,
// clickable & draggable glowing dot navigation, and manual pause/resume.
(() => {
  const DEFAULT_IMAGES = [
    { src: 'image1.jpg', title: 'Direct Claude, ChatGPT & Gemini Simultaneously', badge: 'AI DIRECTOR' },
    { src: 'image2.jpg', title: '3D Camera Rig, Path Memory & Pose Keyframing', badge: '3D & MOTION' },
    { src: 'image3.jpg', title: 'Smart Image Detection & Precision Focus Pointing', badge: 'VISION AI' },
    { src: 'image4.jpg', title: 'In-Browser 4K Upscaler & Instant Background Remover', badge: 'LOCAL ENGINE' }
  ];

  function normalizeSlides(input) {
    const raw = Array.isArray(input) && input.length ? input : (window.VP_AD_IMAGES || DEFAULT_IMAGES);
    return raw.map((item, idx) => {
      if (typeof item === 'string') {
        return { src: item, title: `VisionPilot Showcase ${idx + 1}`, badge: `SLIDE ${idx + 1}` };
      }
      return {
        src: item.src || `image${idx + 1}.jpg`,
        title: item.title || `VisionPilot Showcase ${idx + 1}`,
        badge: item.badge || `SLIDE ${idx + 1}`
      };
    });
  }

  function initAdCarousel(container, options = {}) {
    if (!container || container.dataset.vpCarouselInit === '1') return null;
    container.dataset.vpCarouselInit = '1';

    let slides = normalizeSlides(options.images);
    if (container.dataset.images) {
      try {
        const parsed = JSON.parse(container.dataset.images);
        if (Array.isArray(parsed) && parsed.length) slides = normalizeSlides(parsed);
      } catch (_) {
        const csv = container.dataset.images.split(',').map(s => s.trim()).filter(Boolean);
        if (csv.length) slides = normalizeSlides(csv);
      }
    }

    const intervalMs = Number(options.intervalMs) || 1000;
    let currentIndex = 0;
    let isPaused = false;
    let timerId = null;
    let isDraggingDots = false;

    container.innerHTML = `
      <div class="vp-ad-shell">
        <div class="vp-ad-viewport" id="vpAdViewport">
          <div class="vp-ad-track" id="vpAdTrack">
            ${slides.map((s, i) => `
              <div class="vp-ad-slide" data-slide-index="${i}" aria-hidden="${i === 0 ? 'false' : 'true'}">
                <img src="${s.src}" alt="${s.title}" draggable="false" loading="eager">
                <div class="vp-ad-caption">
                  <span class="vp-ad-badge">${s.badge}</span>
                  <strong class="vp-ad-title">${s.title}</strong>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="vp-ad-controls">
          <div class="vp-ad-dots" id="vpAdDots" role="tablist" aria-label="Ad slide navigation">
            ${slides.map((s, i) => `
              <button type="button" class="vp-ad-dot${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-label="Go to slide ${i + 1}" data-dot-index="${i}">
                <span class="vp-ad-dot-core"></span>
              </button>
            `).join('')}
          </div>
          <button type="button" class="vp-ad-pause-btn" id="vpAdPauseBtn" aria-pressed="false" title="Pause / Resume carousel">
            <span class="vp-ad-pause-ico" id="vpAdPauseIco">❚❚</span>
            <span class="vp-ad-pause-lbl" id="vpAdPauseLbl">Auto · 1s</span>
          </button>
        </div>
      </div>
    `;

    const track = container.querySelector('#vpAdTrack');
    const dotsWrap = container.querySelector('#vpAdDots');
    const dotBtns = [...container.querySelectorAll('.vp-ad-dot')];
    const slideEls = [...container.querySelectorAll('.vp-ad-slide')];
    const pauseBtn = container.querySelector('#vpAdPauseBtn');
    const pauseIco = container.querySelector('#vpAdPauseIco');
    const pauseLbl = container.querySelector('#vpAdPauseLbl');
    const viewport = container.querySelector('#vpAdViewport');

    function goToSlide(idx) {
      const count = slides.length;
      if (!count) return;
      currentIndex = ((idx % count) + count) % count;
      if (track) {
        track.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;
      }
      dotBtns.forEach((btn, i) => {
        const active = i === currentIndex;
        btn.classList.toggle('active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      slideEls.forEach((el, i) => {
        el.setAttribute('aria-hidden', i === currentIndex ? 'false' : 'true');
      });
    }

    function updatePauseUI() {
      if (!pauseBtn) return;
      pauseBtn.setAttribute('aria-pressed', isPaused ? 'true' : 'false');
      pauseBtn.classList.toggle('paused', isPaused);
      if (pauseIco) pauseIco.textContent = isPaused ? '▶' : '❚❚';
      if (pauseLbl) pauseLbl.textContent = isPaused ? 'Paused' : 'Auto · 1s';
    }

    function startTimer() {
      stopTimer();
      if (isPaused || slides.length <= 1) return;
      timerId = window.setInterval(() => {
        if (!isPaused && !isDraggingDots) {
          goToSlide(currentIndex + 1);
        }
      }, intervalMs);
    }

    function stopTimer() {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function setPaused(paused) {
      isPaused = Boolean(paused);
      updatePauseUI();
      if (isPaused) stopTimer();
      else startTimer();
    }

    // Click or drag across dots to navigate manually
    function pickDotFromClientX(clientX) {
      if (!dotsWrap || !dotBtns.length) return;
      let bestIdx = currentIndex;
      let bestDist = Infinity;
      dotBtns.forEach((btn, i) => {
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const d = Math.abs(clientX - cx);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      });
      if (bestIdx !== currentIndex) {
        goToSlide(bestIdx);
      }
    }

    dotBtns.forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = Number(btn.dataset.dotIndex);
        if (Number.isFinite(idx)) {
          goToSlide(idx);
          if (!isPaused) startTimer();
        }
      });
    });

    if (dotsWrap) {
      dotsWrap.addEventListener('pointerdown', e => {
        isDraggingDots = true;
        try { dotsWrap.setPointerCapture(e.pointerId); } catch (_) {}
        pickDotFromClientX(e.clientX);
      });
      dotsWrap.addEventListener('pointermove', e => {
        if (!isDraggingDots) return;
        pickDotFromClientX(e.clientX);
      });
      const endDotDrag = () => {
        if (!isDraggingDots) return;
        isDraggingDots = false;
        if (!isPaused) startTimer();
      };
      dotsWrap.addEventListener('pointerup', endDotDrag);
      dotsWrap.addEventListener('pointercancel', endDotDrag);
    }

    // Swipe / drag support on the 4:3 viewport itself
    let swipeStartX = null;
    if (viewport) {
      viewport.addEventListener('pointerdown', e => {
        if (e.target.closest('#vpAdPauseBtn')) return;
        swipeStartX = e.clientX;
      });
      viewport.addEventListener('pointerup', e => {
        if (swipeStartX === null) return;
        const dx = e.clientX - swipeStartX;
        swipeStartX = null;
        if (Math.abs(dx) > 28) {
          goToSlide(currentIndex + (dx < 0 ? 1 : -1));
          if (!isPaused) startTimer();
        }
      });
    }

    if (pauseBtn) {
      pauseBtn.addEventListener('click', e => {
        e.stopPropagation();
        setPaused(!isPaused);
      });
    }

    startTimer();

    return {
      goToSlide,
      setPaused,
      isPaused: () => isPaused,
      getCurrentIndex: () => currentIndex,
      getSlideCount: () => slides.length,
      destroy: () => stopTimer()
    };
  }

  const api = {
    init: initAdCarousel,
    mount: (target, opts) => {
      const el = typeof target === 'string' ? document.querySelector(target) : target;
      return initAdCarousel(el, opts);
    },
    DEFAULT_IMAGES
  };
  window.VisionPilotAdsCarousel = api;
  window.VisionPilotAds = api;

  const mountAll = () => {
    document.querySelectorAll('[data-vp-ad-carousel]').forEach(el => {
      initAdCarousel(el);
    });
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountAll, { once: true });
  } else {
    mountAll();
  }
})();
