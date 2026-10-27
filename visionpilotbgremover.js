// VisionPilot Background Remover (visionpilotbgremover)
// Powered by MediaPipe Selfie Segmentation from ./visionpilotbackgroundremovermodel/
(() => {
  const MODEL_DIR = './visionpilotbackgroundremovermodel';
  let segmenter = null;
  let initPromise = null;

  async function initVisionPilotBgRemover() {
    if (segmenter) return segmenter;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        const vision = await import(`${MODEL_DIR}/vision_bundle.mjs`);
        const { ImageSegmenter } = vision;
        const fileset = {
          wasmLoaderPath: `${MODEL_DIR}/vision_wasm_internal.js`,
          wasmBinaryPath: `${MODEL_DIR}/vision_wasm_internal.wasm`
        };
        segmenter = await ImageSegmenter.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: `${MODEL_DIR}/selfie_segmenter.tflite`,
            delegate: 'GPU'
          },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: true
        });
        return segmenter;
      } catch (err) {
        initPromise = null;
        console.warn('visionpilotbgremover init fallback:', err?.message || err);
        return null;
      }
    })();
    return initPromise;
  }

  async function removeBackground(imgEl, bgColor = 'transparent') {
    const w = imgEl.naturalWidth || imgEl.width || 512;
    const h = imgEl.naturalHeight || imgEl.height || 512;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext('2d');

    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
    }

    const seg = await initVisionPilotBgRemover();
    if (!seg) {
      ctx.drawImage(imgEl, 0, 0, w, h);
      return outCanvas;
    }

    return new Promise(resolve => {
      seg.segment(imgEl, result => {
        const tmp = document.createElement('canvas');
        tmp.width = w;
        tmp.height = h;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(imgEl, 0, 0, w, h);
        const imgData = tctx.getImageData(0, 0, w, h);
        const px = imgData.data;
        const conf = result.confidenceMasks?.[0]?.getAsFloat32Array?.();
        const cat = result.categoryMask?.getAsUint8Array?.();

        if (conf && conf.length === w * h) {
          for (let i = 0; i < conf.length; i++) {
            const alpha = Math.max(0, Math.min(255, Math.round(conf[i] * 255)));
            px[i * 4 + 3] = Math.round((px[i * 4 + 3] * alpha) / 255);
          }
        } else if (cat && cat.length === w * h) {
          for (let i = 0; i < cat.length; i++) {
            if (cat[i] === 0) px[i * 4 + 3] = 0;
          }
        }

        tctx.putImageData(imgData, 0, 0);
        ctx.drawImage(tmp, 0, 0, w, h);
        resolve(outCanvas);
      });
    });
  }

  window.visionpilotbgremover = {
    modelDir: MODEL_DIR,
    init: initVisionPilotBgRemover,
    removeBackground
  };
})();
