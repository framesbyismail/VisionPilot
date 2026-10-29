// VisionPilot 4:3 Image Carousel (ads.js)
// Dynamically loads sequential images from /add/ (add/add_image_1.png, add/add_image_2.png, ...),
// auto-scrolls continuously, and locks onto a specific image when a pagination dot is selected.
(() => {
  const DEFAULT_ADD_IMAGES = [
    'add/add_image_1.png',
    'add/add_image_2.png',
    'add/add_image_3.png',
    'add/add_image_4.png'
  ];

  function normalizeSlides(input) {
    const raw =
      Array.isArray(input) && input.length
        ? input
        : Array.isArray(window.VP_AD_IMAGES) && window.VP_AD_IMAGES.length
        ? window.VP_AD_IMAGES
        : DEFAULT_ADD_IMAGES;
    return raw.map((item, idx) => {
      if (typeof item === 'string') {
        return {
          src: item,
          title: `VisionPilot Showcase ${idx + 1}`
        };
      }
      return {
        src: item.src || `add/add_image_${idx + 1}.png`,
        title: item.title || `VisionPilot Showcase ${idx + 1}`
      };
    });
  }

  // Probe sequential /add/add_image_N.png files beyond the initial set so any number of images in /add/ is supported
  function probeAdditionalSequentialImages(startIndex, onFound) {
    let idx = startIndex;
    const maxProbe = 50;
    const tryNext = () => {
      if (idx > maxProbe) return;
      const candidate = `add/add_image_${idx}.png`;
      const tester = new Image();
      tester.onload = () => {
        onFound({ src: candidate, title: `VisionPilot Showcase ${idx}` });
        idx++;
        tryNext();
      };
      tester.onerror = () => {
        // Stop probing at first missing sequential file
      };
      tester.src = candidate;
    };
    tryNext();
  }

  function initAdCarousel(container, options = {}) {
    if (!container) return null;
    if (container.__vpCarouselApi) return container.__vpCarouselApi;
    container.dataset.vpCarouselInit = '1';

    let slides = normalizeSlides(options.images);
    if (container.dataset.images) {
      try {
        const parsed = JSON.parse(container.dataset.images);
        if (Array.isArray(parsed) && parsed.length) slides = normalizeSlides(parsed);
      } catch (_) {
        const csv = container.dataset.images
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
        if (csv.length) slides = normalizeSlides(csv);
      }
    }

    const intervalMs = Number(options.intervalMs) || 1000;
    let currentIndex = 0;
    let lockedIndex = null;
    let timerId = null;

    function renderMarkup() {
      container.innerHTML = `
        <div class="vp-ad-shell">
          <div class="vp-ad-viewport" id="vpAdViewport">
            <div class="vp-ad-track" id="vpAdTrack">
              ${slides
                .map(
                  (s, i) => `
                <div class="vp-ad-slide" data-slide-index="${i}" aria-hidden="${i === currentIndex ? 'false' : 'true'}">
                  <img src="${s.src}" alt="${s.title}" draggable="false" loading="eager">
                </div>
              `
                )
                .join('')}
            </div>
          </div>
          <div class="vp-ad-controls">
            <div class="vp-ad-dots" id="vpAdDots" role="tablist" aria-label="Image carousel pagination">
              ${slides
                .map(
                  (s, i) => `
                <button type="button" class="vp-ad-dot${i === currentIndex ? ' active' : ''}${lockedIndex === i ? ' locked' : ''}" role="tab" aria-selected="${i === currentIndex ? 'true' : 'false'}" aria-pressed="${lockedIndex === i ? 'true' : 'false'}" aria-label="Select image ${i + 1}" title="Click to lock image ${i + 1}" data-dot-index="${i}">
                  <span class="vp-ad-dot-core"></span>
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        </div>
      `;
    }

    renderMarkup();

    function getElements() {
      return {
        track: container.querySelector('#vpAdTrack'),
        dotsWrap: container.querySelector('#vpAdDots'),
        dotBtns: [...container.querySelectorAll('.vp-ad-dot')],
        slideEls: [...container.querySelectorAll('.vp-ad-slide')]
      };
    }

    function goToSlide(idx) {
      const count = slides.length;
      if (!count) return;
      currentIndex = ((idx % count) + count) % count;
      const { track, dotBtns, slideEls } = getElements();
      if (track) {
        track.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;
      }
      dotBtns.forEach((btn, i) => {
        const active = i === currentIndex;
        const locked = lockedIndex === i;
        btn.classList.toggle('active', active);
        btn.classList.toggle('locked', locked);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
        btn.setAttribute('aria-pressed', locked ? 'true' : 'false');
      });
      slideEls.forEach((el, i) => {
        el.setAttribute('aria-hidden', i === currentIndex ? 'false' : 'true');
      });
    }

    function stopTimer() {
      if (timerId !== null) {
        clearInterval(timerId);
        timerId = null;
      }
    }

    function startTimer() {
      stopTimer();
      if (lockedIndex !== null || slides.length <= 1) return;
      timerId = window.setInterval(() => {
        if (lockedIndex === null) {
          goToSlide(currentIndex + 1);
        }
      }, intervalMs);
    }

    function selectAndLockDot(index) {
      const count = slides.length;
      if (!count) return;
      const normIdx = ((index % count) + count) % count;
      if (lockedIndex === normIdx) {
        // Clicking the already locked dot unlocks and resumes auto-scroll
        lockedIndex = null;
        goToSlide(normIdx);
        startTimer();
      } else {
        // Selecting a dot locks that image
        lockedIndex = normIdx;
        stopTimer();
        goToSlide(normIdx);
      }
    }

    function bindEvents() {
      const { dotsWrap } = getElements();
      if (!dotsWrap) return;
      dotsWrap.addEventListener('click', e => {
        const dot = e.target.closest('.vp-ad-dot');
        if (!dot) return;
        const idx = Number(dot.dataset.dotIndex);
        if (Number.isFinite(idx)) {
          selectAndLockDot(idx);
        }
      });
    }

    bindEvents();
    startTimer();

    // Dynamically discover any extra sequential images in /add/ (e.g. add_image_5.png, add_image_6.png, ...)
    if (!options.images && !container.dataset.images) {
      probeAdditionalSequentialImages(slides.length + 1, newSlide => {
        slides.push(newSlide);
        renderMarkup();
        bindEvents();
        goToSlide(currentIndex);
      });
    }

    const api = {
      goToSlide,
      selectAndLockDot,
      unlock() {
        lockedIndex = null;
        goToSlide(currentIndex);
        startTimer();
      },
      pause() {
        lockedIndex = currentIndex;
        stopTimer();
        goToSlide(currentIndex);
      },
      play() {
        lockedIndex = null;
        goToSlide(currentIndex);
        startTimer();
      },
      setImages(newImages) {
        slides = normalizeSlides(newImages);
        currentIndex = 0;
        lockedIndex = null;
        renderMarkup();
        bindEvents();
        goToSlide(0);
        startTimer();
      },
      getCurrentIndex: () => currentIndex,
      getLockedIndex: () => lockedIndex,
      isLocked: () => lockedIndex !== null,
      getSlideCount: () => slides.length,
      destroy() {
        stopTimer();
        delete container.__vpCarouselApi;
        delete container.dataset.vpCarouselInit;
      }
    };

    container.__vpCarouselApi = api;
    if (container.id === 'vpLoadingAdMount') {
      window.__vpLoadingAdCarousel = api;
    }
    return api;
  }

  function mountAdCarousel(target, options = {}) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    return initAdCarousel(el, options);
  }

  window.VisionPilotAdsCarousel = {
    init: initAdCarousel,
    mount: mountAdCarousel,
    DEFAULT_IMAGES: DEFAULT_ADD_IMAGES
  };
  window.VisionPilotAds = window.VisionPilotAdsCarousel;

  function bootStandalone() {
    document.querySelectorAll('[data-vp-ad-carousel]').forEach(el => {
      initAdCarousel(el);
    });
  }

  bootStandalone();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootStandalone, { once: true });
  }
})();
