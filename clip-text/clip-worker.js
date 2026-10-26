/* VisionPilot — Local VisionPilot AI Web Worker
 * Loads Transformers.js + local quantized VisionPilot AI Text & Vision models strictly from local folders.
 * Remote models are disabled. Runs in a Web Worker with WebGPU when available and WASM fallback.
 */
import {
  env,
  AutoTokenizer,
  VisionPilotAITextModel,
  AutoProcessor,
  VisionPilotAIVisionModel,
  RawImage
} from './transformers.min.js';

const WORKER_DIR = new URL('./', self.location.href).href;
const ROOT_DIR = new URL('../', self.location.href).href;
const DEFAULT_TEXT_DIR = WORKER_DIR.slice(ROOT_DIR.length).replace(/^\/+|\/+$/g, '');
const DEFAULT_IMAGE_DIR = DEFAULT_TEXT_DIR.replace(/-text$/, '-image');

// Strictly local model loading only — no remote hosts or external links
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.remoteHost = '';
env.localModelPath = ROOT_DIR;

if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = WORKER_DIR;
  // Single WASM thread inside Web Worker prevents CPU thread contention so main-thread UI and loading animations stay 60fps
  env.backends.onnx.wasm.numThreads = 1;
}

// Intercept worker fetch to enforce local-only loading and report byte progress
const nativeFetch = self.fetch.bind(self);
self.fetch = async function localVisionPilotAIFetch(input, init) {
  let urlStr = typeof input === 'string' ? input : (input && input.url) || String(input);
  // Rewrite any /onnx/ subpath to direct folder path if needed
  urlStr = urlStr.replace(/\/onnx\//g, '/');

  const resolved = new URL(urlStr, ROOT_DIR);
  if (resolved.origin !== self.location.origin && resolved.protocol !== 'blob:' && resolved.protocol !== 'data:') {
    throw new Error('External network access is disabled for local VisionPilot AI models.');
  }

  const res = await nativeFetch(resolved.href, init);
  if (!res.ok) return res;

  const isModelFile = resolved.pathname.endsWith('.onnx');
  const total = Number(res.headers.get('content-length')) || 0;
  if (!isModelFile || !total || !res.body) return res;

  const fileName = resolved.pathname.split('/').pop();
  const reader = res.body.getReader();
  let loaded = 0;
  let lastEmit = 0;

  const stream = new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        self.postMessage({
          type: 'progress',
          stage: 'download',
          file: fileName,
          loaded: total,
          total,
          percent: 100,
          message: `Loading VisionPilot AI model (${fileName})… 100%`
        });
        controller.close();
        return;
      }
      loaded += value.byteLength;
      const now = Date.now();
      if (now - lastEmit > 160 || loaded === total) {
        lastEmit = now;
        const pct = Math.min(100, Math.round((loaded / total) * 100));
        self.postMessage({
          type: 'progress',
          stage: 'download',
          file: fileName,
          loaded,
          total,
          percent: pct,
          message: `Loading VisionPilot AI model (${fileName})… ${pct}%`
        });
      }
      controller.enqueue(value);
    }
  });

  return new Response(stream, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers
  });
};

/* ---------- Candidate Word / Phrase Banks for VisionPilot AI Zero-Shot Scoring ---------- */
const PROMPT_BANKS = {
  subjects: [
    { id: 'multiple_phones', word: 'smartphones', noun: 'smartphones', category: 'phone', text: 'a product photo of multiple smartphones standing side by side' },
    { id: 'phone_closeup', word: 'smartphone', noun: 'smartphone', category: 'phone', text: 'a close-up macro product photo of a smartphone side edge and buttons' },
    { id: 'phone', word: 'smartphone', noun: 'smartphone', category: 'phone', text: 'a product photo of a modern smartphone or mobile phone' },
    { id: 'food_and_product', word: 'plated food and packaged product bag', noun: 'product', category: 'product_food', text: 'a commercial food advertisement showing a plate of cooked rice next to a standing packaged product bag' },
    { id: 'product_bag', word: 'packaged product bag', noun: 'packaged product bag', category: 'product', text: 'a commercial product photo of a standing sealed pouch or packaged bag' },
    { id: 'product_container', word: 'packaged product container', noun: 'packaged product', category: 'product', text: 'a commercial product photo of a bottle, box, or retail package' },
    { id: 'food_plate', word: 'plate of cooked rice and food', noun: 'plate of food', category: 'food', text: 'a close-up photo of a ceramic plate or bowl of cooked white rice garnished with herbs and fried onions' },
    { id: 'family_dining', word: 'woman, young boy, and young girl at a dining table', noun: 'group of people', category: 'family', text: 'an indoor photo of a smiling woman serving rice to a young boy and a young girl at a dining table with bowls of food' },
    { id: 'woman', word: 'woman', noun: 'woman', category: 'person', text: 'a photo of an adult woman' },
    { id: 'man', word: 'man', noun: 'man', category: 'person', text: 'a photo of an adult man' },
    { id: 'boy', word: 'young boy', noun: 'boy', category: 'person', text: 'a photo of a young boy child' },
    { id: 'girl', word: 'young girl', noun: 'girl', category: 'person', text: 'a photo of a young girl child' },
    { id: 'baby', word: 'baby', noun: 'baby', category: 'person', text: 'a photo of a baby or infant' },
    { id: 'elderly', word: 'elderly person', noun: 'elderly person', category: 'person', text: 'a photo of an elderly person' },
    { id: 'group', word: 'group of people', noun: 'group of people', category: 'person', text: 'a photo of a group of people together' },
    { id: 'car', word: 'car', noun: 'car', category: 'car', text: 'a photo of a car, sedan, sports car, SUV, or automobile' },
    { id: 'cat', word: 'cat', noun: 'cat', category: 'animal', text: 'a photo of a domestic cat' },
    { id: 'dog', word: 'dog', noun: 'dog', category: 'animal', text: 'a photo of a dog' },
    { id: 'animal', word: 'animal', noun: 'animal', category: 'animal', text: 'a photo of an animal in focus' },
    { id: 'building', word: 'building', noun: 'building', category: 'building', text: 'a photo of a building or architectural structure' },
    { id: 'landscape', word: 'landscape', noun: 'landscape', category: 'landscape', text: 'a photo of an outdoor scenic landscape' }
  ],

  colors: [
    { id: 'mint_orange_grey', word: 'mint green, warm copper-orange, and charcoal gray', text: 'objects in mint green, warm orange-gold, and dark charcoal gray colors' },
    { id: 'copper_orange', word: 'warm copper-orange', text: 'a warm metallic copper-orange and bronze color tone' },
    { id: 'mint_green', word: 'pastel mint green', text: 'a soft pastel mint green or seafoam green color' },
    { id: 'charcoal_gray', word: 'dark charcoal gray', text: 'a dark matte charcoal gray or graphite color' },
    { id: 'white_orange', word: 'white and bright orange', text: 'a clean white and bright orange color scheme with dark accents' },
    { id: 'white_golden', word: 'fluffy white and golden-brown', text: 'fluffy white grains with golden-brown and green garnish accents' },
    { id: 'white_beige', word: 'white and warm beige', text: 'clean white and warm beige or cream fabric tones' },
    { id: 'white_purple', word: 'white with subtle lavender-purple trim', text: 'clean white fabric with subtle purple or lavender trim detail' },
    { id: 'white', word: 'clean white', text: 'a bright clean white color' },
    { id: 'black', word: 'deep black', text: 'a deep black color' },
    { id: 'brown', word: 'rich dark brown', text: 'a rich dark brown wood or earth tone' },
    { id: 'blue', word: 'vibrant blue', text: 'a vibrant blue color' },
    { id: 'red', word: 'crimson red', text: 'a bold crimson red color' },
    { id: 'yellow_gold', word: 'warm golden yellow', text: 'a warm golden yellow color' }
  ],

  materials_clothing: [
    { id: 'phone_rear_triple', forCat: 'phone', word: 'matte metallic casings with raised square dual-lens camera modules', text: 'sleek matte smartphone bodies featuring raised rectangular camera modules and optical lenses' },
    { id: 'phone_side_metal', forCat: 'phone', word: 'a brushed metallic side rail with tactile physical buttons and a raised camera bump', text: 'a slim brushed metallic smartphone frame showing side buttons and a raised camera housing' },
    { id: 'pouch_and_plate', forCat: 'product_food', word: 'a glazed ceramic plate of garnished rice beside a matte printed stand-up pouch', text: 'a ceramic plate of steaming rice with herbs beside a printed stand-up retail pouch package' },
    { id: 'printed_pouch', forCat: 'product', word: 'matte printed stand-up pouch packaging with an architectural sketch and dark patterned base', text: 'a printed stand-up product pouch with an orange header band, architectural line art, and a dark geometric bottom border' },
    { id: 'rice_plate', forCat: 'food', word: 'fluffy cooked white rice on a gold-rimmed ceramic plate with fried onion and herb garnish', text: 'cooked white rice piled on a ceramic plate topped with crispy fried onions and fresh green herbs' },
    { id: 'curry_bowl', forCat: 'food', word: 'glazed ceramic serving bowls filled with savory cooked dishes on a wooden tabletop', text: 'round ceramic bowls filled with savory curry, vegetables, and rice on a dining table' },
    { id: 'kurti_dupatta', forCat: 'person', word: 'an embroidered white tunic outfit with a draped beige scarf', text: 'a woman wearing a white patterned kurti tunic with a beige dupatta scarf draped over her shoulder' },
    { id: 'boy_polo', forCat: 'person', word: 'a crisp white short-sleeve collared polo shirt', text: 'a young boy wearing a clean white short-sleeve collared polo shirt' },
    { id: 'girl_tunic', forCat: 'person', word: 'a white long-sleeve tunic top with subtle lavender embroidery trim', text: 'a young girl wearing a white tunic top with subtle purple stitched trim along the neckline' },
    { id: 'casual_wear', forCat: 'person', word: 'tailored casual clothing with natural fabric folds', text: 'a person wearing neat casual everyday clothing with soft fabric texture' },
    { id: 'car_body', forCat: 'car', word: 'glossy painted automotive bodywork with glass windows and alloy wheels', text: 'a car exterior with glossy paint, windshield glass, and alloy wheels' },
    { id: 'animal_fur', forCat: 'animal', word: 'a soft natural fur coat with fine whisker and eye detail', text: 'an animal with soft natural fur texture, clear eyes, and whiskers' }
  ],

  poses: [
    { id: 'three_upright', forCat: 'phone', word: 'standing upright side by side in a rear-facing lineup', text: 'three smartphones standing upright side by side facing the camera' },
    { id: 'diagonal_profile', forCat: 'phone', word: 'tilted diagonally in a close-up side-profile view', text: 'an object angled diagonally in a tight macro side-profile view' },
    { id: 'product_still_life', forCat: 'product_food', word: 'arranged in a front-facing commercial tabletop composition', text: 'a plated dish in the left foreground paired with an upright product package on the right' },
    { id: 'upright_package', forCat: 'product', word: 'standing upright in a front-facing commercial view', text: 'a vertical product package standing upright on a flat surface' },
    { id: 'serving_at_table', forCat: 'family', word: 'standing on the left leaning gently forward while serving rice onto a plate for two seated children', text: 'a smiling mother standing beside a dining table serving rice with a spoon to a seated boy and girl' },
    { id: 'standing_serving', forCat: 'person', word: 'standing and leaning slightly forward while serving rice with a spoon', text: 'a woman standing beside a table holding a serving spoon over a plate' },
    { id: 'seated_holding_plate', forCat: 'person', word: 'seated at the dining table holding a plate with both hands', text: 'a young child seated at a dining table holding a plate of rice' },
    { id: 'seated_at_table', forCat: 'person', word: 'seated comfortably at the dining table facing slightly left', text: 'a young girl seated at a wooden dining table looking toward the food being served' },
    { id: 'eye_level_front', forCat: 'any', word: 'positioned in a balanced eye-level view', text: 'a subject captured from a balanced eye-level camera perspective' }
  ],

  expressions: [
    { id: 'warm_smiling', word: 'warm, joyful smiling expressions', text: 'people smiling warmly and happily together' },
    { id: 'woman_smiling', word: 'a warm, affectionate smile', text: 'a woman looking down with a warm, happy smile' },
    { id: 'child_smiling', word: 'a cheerful, eager smile', text: 'a child looking at food with a happy, cheerful smile' },
    { id: 'calm_neutral', word: 'a calm, natural expression', text: 'a person with a calm, relaxed facial expression' }
  ],

  settings_lighting_bg: [
    {
      id: 'dark_brown_studio',
      setting: 'a controlled dark studio product environment',
      lighting: 'soft directional studio key and rim lighting with clean specular highlights',
      bg: 'a seamless dark brown gradient backdrop and glossy reflective tabletop surface',
      text: 'a dark brown studio background with a reflective dark surface and soft studio rim lighting'
    },
    {
      id: 'sunlit_marble_ad',
      setting: 'a sunlit commercial tabletop setting',
      lighting: 'warm directional sunlight casting soft diagonal window shadows',
      bg: 'a polished beige marble surface against a warm cream wall with promotional typography',
      text: 'a sunlit beige wall with diagonal window light shadows, promotional text, and a marble table surface'
    },
    {
      id: 'bright_dining_room',
      setting: 'a bright modern home dining room around a dark wooden table set with bowls of food',
      lighting: 'soft, warm natural window daylight blended with gentle indoor ambient illumination',
      bg: 'large glass windows, sheer curtains, framed wall art, and lush indoor potted plants',
      text: 'a bright modern living and dining room with large windows, curtains, framed artwork, indoor plants, and a wooden dining table'
    },
    {
      id: 'clean_studio',
      setting: 'a clean indoor commercial studio setting',
      lighting: 'balanced, diffused studio lighting with gentle shadow falloff',
      bg: 'a smooth, uncluttered neutral background',
      text: 'a clean studio photo with balanced lighting and a plain neutral background'
    }
  ],

  car_views: [
    { id: 'car_front_left', text: 'a car angled with its front headlights and bumper on the left side and rear trunk on the right side' },
    { id: 'car_front_right', text: 'a car angled with its front headlights and bumper on the right side and rear trunk on the left side' },
    { id: 'car_straight_front', text: 'the straight front view of a car showing both front headlights, front grille, and front windshield' },
    { id: 'car_rear_view', text: 'the back rear view of a car showing red taillights, rear trunk lid, and rear bumper' }
  ],

  focus_parts: [
    // Phone parts
    { id: 'phone_cam_module', cat: 'phone', text: 'a close-up of a smartphone rear camera module with circular optical lenses and flash ring' },
    { id: 'phone_side_buttons', cat: 'phone', text: 'a macro close-up of a smartphone metallic side frame and raised volume and power buttons' },
    { id: 'phone_rear_body', cat: 'phone', text: 'the smooth matte rear body panel of a smartphone' },

    // Packaged product & food parts
    { id: 'pouch_top_orange', cat: 'product', text: 'the bright orange top header seal band of a packaged product pouch' },
    { id: 'pouch_building_art', cat: 'product', text: 'an architectural sketch illustration printed on the white front panel of a packaged product bag' },
    { id: 'pouch_label_text', cat: 'product', text: 'printed typography and logo emblem on the lower front panel of a white product package' },
    { id: 'pouch_dark_base', cat: 'product', text: 'the dark brown geometric patterned bottom border of a standing product pouch' },
    { id: 'rice_plate_food', cat: 'food', text: 'fluffy cooked white rice garnished with fried onions and green herbs on a ceramic plate' },
    { id: 'table_curry_bowl', cat: 'food', text: 'a ceramic bowl of curry or cooked food resting on a dark wooden dining table' },
    { id: 'promo_text_wall', cat: 'bg', text: 'decorative promotional headline text on a warm sunlit cream background wall' },

    // Person parts (head, hair, eyes, nose, mouth, ear, left/right hand, arm, chest, leg, foot)
    { id: 'person_hair', cat: 'person', text: 'a close-up of dark hair on the top of a person head' },
    { id: 'person_face_eyes', cat: 'person', text: 'a close-up of a person face, eyes, and eyebrows' },
    { id: 'person_nose_mouth', cat: 'person', text: 'a close-up of a person nose, mouth, lips, and warm smile' },
    { id: 'person_ear', cat: 'person', text: 'a close-up of the side of a person head and ear' },
    { id: 'person_hand_fingers', cat: 'person', text: 'a close-up of a human hand, fingers, palm, and wrist' },
    { id: 'person_hand_spoon', cat: 'person', text: 'a person hand holding a spoon or plate over a dining table' },
    { id: 'person_arm_sleeve', cat: 'person', text: 'a close-up of a person arm, forearm, elbow, and shirt sleeve' },
    { id: 'person_clothing', cat: 'person', text: 'white fabric clothing with subtle embroidery and folds on a person shoulder and chest torso' },
    { id: 'person_leg', cat: 'person', text: 'a close-up of a person leg, knee, thigh, or trousers' },
    { id: 'person_foot', cat: 'person', text: 'a close-up of a person foot, ankle, or shoe on the ground' },

    // Car parts (wheel, headlight, side window, windshield, rear window, rear section/taillight, front hood/grille, side door)
    { id: 'car_wheel', cat: 'car', text: 'a close-up of a car rubber tire and metallic alloy wheel rim inside a wheel arch' },
    { id: 'car_headlight', cat: 'car', text: 'a close-up of a bright automotive front headlight lamp and lens on a car' },
    { id: 'car_side_window', cat: 'car', text: 'a close-up of a car side door glass window and window frame pillar' },
    { id: 'car_windshield', cat: 'car', text: 'a close-up of a car sloped front windshield glass above the hood' },
    { id: 'car_rear_window', cat: 'car', text: 'a close-up of a car rear back window glass above the trunk' },
    { id: 'car_taillight_rear', cat: 'car', text: 'a close-up of a car rear section, red taillight lamp, trunk lid, and rear bumper' },
    { id: 'car_front_grille_hood', cat: 'car', text: 'a close-up of a car front hood, radiator grille, and front bumper' },
    { id: 'car_door_panel', cat: 'car', text: 'a close-up of a painted car side door panel and exterior mirror' },

    // Animal parts
    { id: 'animal_eyes_face', cat: 'animal', text: 'a close-up of an animal face, eyes, and ears' },
    { id: 'animal_nose_mouth', cat: 'animal', text: 'a close-up of an animal nose, whiskers, and mouth' },
    { id: 'animal_leg_paw', cat: 'animal', text: 'a close-up of an animal leg and paw' }
  ]
};

let modelState = {
  ready: false,
  loadingPromise: null,
  tokenizer: null,
  textModel: null,
  processor: null,
  visionModel: null,
  bankEmbeddings: {}
};

function l2Normalize(arr) {
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) sumSq += arr[i] * arr[i];
  const inv = sumSq > 1e-12 ? 1 / Math.sqrt(sumSq) : 1;
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) out[i] = arr[i] * inv;
  return out;
}

function dotSim(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

async function encodeTexts(texts) {
  const inputs = modelState.tokenizer(texts, { padding: true, truncation: true });
  const { text_embeds } = await modelState.textModel(inputs);
  const dims = text_embeds.dims; // [batch, dim]
  const batch = dims[0];
  const dim = dims[1];
  const data = text_embeds.data;
  const results = [];
  for (let b = 0; b < batch; b++) {
    const slice = data.subarray(b * dim, (b + 1) * dim);
    results.push(l2Normalize(slice));
  }
  return results;
}

async function encodeRgbaPatch(rgbaObj) {
  const rawImg = new RawImage(new Uint8ClampedArray(rgbaObj.data), rgbaObj.width, rgbaObj.height, 4);
  const visionInputs = await modelState.processor(rawImg);
  const { image_embeds } = await modelState.visionModel(visionInputs);
  return l2Normalize(image_embeds.data);
}

function scoreAgainstBank(imgVec, bankName, temp = 90) {
  const items = PROMPT_BANKS[bankName] || [];
  const vecs = modelState.bankEmbeddings[bankName] || [];
  if (!items.length || !vecs.length) return [];
  const rawScores = items.map((item, idx) => ({
    ...item,
    sim: dotSim(imgVec, vecs[idx])
  }));
  const maxSim = Math.max(...rawScores.map(x => x.sim));
  let expSum = 0;
  const withExp = rawScores.map(x => {
    const e = Math.exp((x.sim - maxSim) * temp);
    expSum += e;
    return { ...x, _e: e };
  });
  return withExp
    .map(x => ({ ...x, prob: expSum > 0 ? x._e / expSum : 0 }))
    .sort((a, b) => b.sim - a.sim);
}

async function ensureModelsLoaded(textDir = DEFAULT_TEXT_DIR, imageDir = DEFAULT_IMAGE_DIR) {
  if (modelState.ready) return modelState;
  if (modelState.loadingPromise) return modelState.loadingPromise;

  modelState.loadingPromise = (async () => {
    self.postMessage({
      type: 'progress',
      stage: 'init',
      percent: 5,
      message: 'Initializing VisionPilot AI engine…'
    });

    const cleanTextDir = String(textDir || DEFAULT_TEXT_DIR).replace(/^\/+|\/+$/g, '');
    const cleanImageDir = String(imageDir || DEFAULT_IMAGE_DIR).replace(/^\/+|\/+$/g, '');

    modelState.tokenizer = await AutoTokenizer.from_pretrained(cleanTextDir, {
      local_files_only: true
    });
    self.postMessage({
      type: 'progress',
      stage: 'init',
      percent: 20,
      message: 'Loading VisionPilot AI text model…'
    });

    modelState.textModel = await VisionPilotAITextModel.from_pretrained(cleanTextDir, {
      quantized: true,
      local_files_only: true
    });

    self.postMessage({
      type: 'progress',
      stage: 'init',
      percent: 55,
      message: 'Loading VisionPilot AI vision model…'
    });

    modelState.processor = await AutoProcessor.from_pretrained(cleanImageDir, {
      local_files_only: true
    });

    modelState.visionModel = await VisionPilotAIVisionModel.from_pretrained(cleanImageDir, {
      quantized: true,
      local_files_only: true
    });

    self.postMessage({
      type: 'progress',
      stage: 'init',
      percent: 82,
      message: 'Caching VisionPilot AI vocabulary embeddings…'
    });

    // Precompute and cache normalized embeddings for every candidate phrase bank
    const bankNames = Object.keys(PROMPT_BANKS);
    for (let i = 0; i < bankNames.length; i++) {
      const name = bankNames[i];
      const texts = PROMPT_BANKS[name].map(item => item.text);
      modelState.bankEmbeddings[name] = await encodeTexts(texts);
      await new Promise(r => setTimeout(r, 0));
    }

    modelState.ready = true;
    self.postMessage({
      type: 'progress',
      stage: 'ready',
      percent: 100,
      message: 'VisionPilot AI ready'
    });
    return modelState;
  })();

  try {
    return await modelState.loadingPromise;
  } catch (err) {
    modelState.loadingPromise = null;
    throw err;
  }
}

let cancelledUpToId = 0;

self.onmessage = async (e) => {
  const msg = e.data || {};
  const { id, action, payload } = msg;
  if (action === 'cancel') {
    cancelledUpToId = Math.max(cancelledUpToId, Number(msg.upToId) || 0);
    return;
  }
  if (!id) return;

  try {
    await ensureModelsLoaded(payload?.textDir || DEFAULT_TEXT_DIR, payload?.imageDir || DEFAULT_IMAGE_DIR);
    if (id <= cancelledUpToId) {
      self.postMessage({ id, ok: false, cancelled: true, error: 'Cancelled' });
      return;
    }

    if (action === 'warmup') {
      self.postMessage({ id, ok: true, result: { ready: true } });
      return;
    }

    if (action === 'score_patches') {
      // payload.patches: Array of { key, width, height, data }
      const patches = Array.isArray(payload?.patches) ? payload.patches : [];
      const customTexts = Array.isArray(payload?.customTexts) ? payload.customTexts : [];
      let customVecs = null;
      if (customTexts.length) {
        customVecs = await encodeTexts(customTexts);
      }

      const out = {};
      for (let i = 0; i < patches.length; i++) {
        if (id <= cancelledUpToId) {
          self.postMessage({ id, ok: false, cancelled: true, error: 'Cancelled' });
          return;
        }
        const p = patches[i];
        if (patches.length > 1) {
          self.postMessage({
            type: 'progress',
            stage: 'scoring',
            percent: Math.round(((i + 1) / patches.length) * 100),
            message: payload.progressLabel || `VisionPilot AI scoring image region ${i + 1} of ${patches.length}…`
          });
        }
        await new Promise(r => setTimeout(r, 0));
        const imgVec = await encodeRgbaPatch(p);
        const bankScores = {};
        for (const bankName of Object.keys(PROMPT_BANKS)) {
          bankScores[bankName] = scoreAgainstBank(imgVec, bankName).slice(0, 6).map(x => ({
            id: x.id,
            word: x.word,
            noun: x.noun,
            category: x.category,
            setting: x.setting,
            lighting: x.lighting,
            bg: x.bg,
            cat: x.cat,
            forCat: x.forCat,
            sim: Number(x.sim.toFixed(4)),
            prob: Number(x.prob.toFixed(4))
          }));
        }
        let customScores = [];
        if (customVecs && customVecs.length) {
          const sims = customTexts.map((t, idx) => ({ text: t, sim: dotSim(imgVec, customVecs[idx]) }));
          const maxS = Math.max(...sims.map(x => x.sim));
          let sumE = 0;
          const exps = sims.map(x => { const ex = Math.exp((x.sim - maxS) * 90); sumE += ex; return { ...x, _e: ex }; });
          customScores = exps
            .map(x => ({ text: x.text, sim: Number(x.sim.toFixed(4)), prob: Number((x._e / (sumE || 1)).toFixed(4)) }))
            .sort((a, b) => b.sim - a.sim);
        }
        out[p.key || `p${i}`] = { bankScores, customScores };
      }

      self.postMessage({ id, ok: true, result: out });
      return;
    }

    throw new Error('Unknown VisionPilot AI worker action: ' + action);
  } catch (err) {
    self.postMessage({
      id,
      ok: false,
      error: err?.message || String(err)
    });
  }
};
