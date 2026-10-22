/* VisionPilot — core: state, controls, rig views, references, focus point, lighting rig, docking, image prompt */
(() => {
const $ = id => document.getElementById(id);
const rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const norm360 = a => ((a % 360) + 360) % 360;
const signed = a => { a = norm360(a); return a > 180 ? a - 360 : a; };
const rnd = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const joinList = a => a.length < 2 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => esc(s).replace(/"/g, '&quot;');

/* ---------- day / night ---------- */
const root = document.documentElement;
function initialMode() {
  try { const m = localStorage.getItem('anglecraft-mode'); if (m === 'day' || m === 'night') return m; } catch (e) {}
  const t = root.getAttribute('data-theme');
  if (t === 'dark') return 'night';
  if (t === 'light') return 'day';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
}
root.setAttribute('data-mode', initialMode());

/* ---------- data ---------- */
const BODIES = [
  {id:'iphone17pro', group:'Smartphone', name:'Apple iPhone 17 Pro', sensorW:9.8, crop:3.67, kind:'phone', mount:'iphone', sensorName:'1/1.28" main sensor',
   look:'iPhone 17 Pro photo look: crisp computational HDR, natural Apple color science'},
  {id:'pixel10pro', group:'Smartphone', name:'Google Pixel 10 Pro', sensorW:9.6, crop:3.75, kind:'phone', mount:'pixel', sensorName:'1/1.31" main sensor',
   look:'Google Pixel look: HDR+ contrast, crisp detail, true-to-life color'},
  {id:'sony-a7iv', group:'Sony Alpha (mirrorless)', name:'Sony α7 IV', sensorW:35.9, crop:1, kind:'ff', mount:'sony', sensorName:'Full-frame 33MP',
   look:'Sony full-frame mirrorless: clean detail, natural color, smooth tonal roll-off'},
  {id:'sony-a1ii', group:'Sony Alpha (mirrorless)', name:'Sony α1 II', sensorW:35.9, crop:1, kind:'ff', mount:'sony', sensorName:'Full-frame 50MP stacked',
   look:'Sony flagship 50MP full-frame: very high resolution, fine micro-detail'},
  {id:'sony-fx3', group:'Sony Alpha (mirrorless)', name:'Sony FX3 (Cinema Line)', sensorW:35.6, crop:1, kind:'ff', mount:'sony', sensorName:'Full-frame 12MP cinema',
   look:'Sony FX3 cinema look: cinematic color, soft highlight roll-off, wide dynamic range'},
  {id:'canon-r5ii', group:'Canon EOS R (mirrorless)', name:'Canon EOS R5 Mark II', sensorW:36, crop:1, kind:'ff', mount:'canon', sensorName:'Full-frame 45MP stacked',
   look:'Canon EOS R5 Mark II: 45MP full-frame detail, warm Canon color science, pleasing skin tones'},
  {id:'canon-r6ii', group:'Canon EOS R (mirrorless)', name:'Canon EOS R6 Mark II', sensorW:35.9, crop:1, kind:'ff', mount:'canon', sensorName:'Full-frame 24MP',
   look:'Canon full-frame: warm natural color, smooth skin tones, clean shadows'},
  {id:'canon-r7', group:'Canon EOS R (mirrorless)', name:'Canon EOS R7 (APS-C)', sensorW:22.3, crop:1.6, kind:'apsc', mount:'canon', sensorName:'APS-C 32MP',
   look:'Canon APS-C 32MP: crisp detail, 1.6× crop field of view'},
  {id:'custom', group:'Other', name:'Custom / CG camera', sensorW:36, crop:1, kind:'custom', mount:'any', sensorName:'Custom film gate',
   look:'neutral high-end camera rendering'}
];
const LENSES = {
  iphone:[{id:'ip13',name:'0.5× Ultra Wide · 13 mm eq.',eq:13,ap:2.2},{id:'ip24',name:'1× Main · 24 mm eq.',eq:24,ap:1.78},
          {id:'ip48',name:'2× · 48 mm eq.',eq:48,ap:1.78},{id:'ip100',name:'4× Telephoto · 100 mm eq.',eq:100,ap:2.8}],
  pixel:[{id:'px12',name:'0.5× Ultra Wide · 12 mm eq.',eq:12,ap:1.7},{id:'px24',name:'1× Main · 24 mm eq.',eq:24,ap:1.68},
         {id:'px48',name:'2× · 48 mm eq.',eq:48,ap:1.68},{id:'px113',name:'5× Telephoto · 113 mm eq.',eq:113,ap:2.8}],
  sony:[{id:'s1635',name:'Sony FE 16-35mm f/2.8 GM II',min:16,max:35,ap:2.8},{id:'s2470',name:'Sony FE 24-70mm f/2.8 GM II',min:24,max:70,ap:2.8},
        {id:'s50',name:'Sony FE 50mm f/1.2 GM',min:50,max:50,ap:1.2},{id:'s85',name:'Sony FE 85mm f/1.4 GM II',min:85,max:85,ap:1.4},
        {id:'s90m',name:'Sony FE 90mm f/2.8 Macro G OSS',min:90,max:90,ap:2.8,macro:true},{id:'s135',name:'Sony FE 135mm f/1.8 GM',min:135,max:135,ap:1.8},
        {id:'s70200',name:'Sony FE 70-200mm f/2.8 GM OSS II',min:70,max:200,ap:2.8}],
  canon:[{id:'c1535',name:'Canon RF 15-35mm F2.8 L IS USM',min:15,max:35,ap:2.8},{id:'c2470',name:'Canon RF 24-70mm F2.8 L IS USM',min:24,max:70,ap:2.8},
         {id:'c50',name:'Canon RF 50mm F1.2 L USM',min:50,max:50,ap:1.2},{id:'c85',name:'Canon RF 85mm F1.2 L USM',min:85,max:85,ap:1.2},
         {id:'c100m',name:'Canon RF 100mm F2.8 L Macro IS USM',min:100,max:100,ap:2.8,macro:true},{id:'c70200',name:'Canon RF 70-200mm F2.8 L IS USM Z',min:70,max:200,ap:2.8}],
  any:[]
};
const APERTURES = [1.2,1.4,1.8,2,2.8,4,5.6,8,11,16,22];
const FOCAL_PRESETS = [[15,'Super Wide (15 mm)'],[25,'Wide Angle (25 mm)'],[35,'Classic (35 mm)'],[50,'Normal Lens (50 mm)'],[80,'Portrait (80 mm)'],[100,'Macro (100 mm)'],[135,'Tele (135 mm)'],[300,'Super Tele (300 mm)']];
const SENSOR_PRESETS = [[4.8,'8 mm (4.8 mm)'],[9.6,'16 mm (9.6 mm)'],[22,'35 mm Movie (22.0 mm)'],[36,'35 mm Photo (36.0 mm)'],[52.5,'70 mm (52.5 mm)']];
// r = visible frame height / subject height (closest first)
const SHOTS = [
  {name:'Macro', r:.05, p:'macro shot of one tiny detail (an eye, skin texture, a ring or watch face) filling the frame', o:'macro shot of one tiny detail (texture, edge, logo, corner or button) filling the frame'},
  {name:'Extreme Close-Up', r:.12, p:'extreme close-up on the eyes and fine facial detail', o:'extreme close-up of a single feature, texture or material'},
  {name:'Close-Up', r:.25, p:'close-up of the face, chin to forehead', o:'tight close-up, part of the subject fills the whole frame'},
  {name:'Medium Close-Up', r:.4, p:'head and shoulders', o:'close framing, the subject fills the frame with its edges slightly cropped'},
  {name:'Medium Shot', r:.62, p:'from the waist up', o:'the main body of the subject fills the frame with light cropping'},
  {name:'Medium Wide', r:.85, p:'from the knees up (cowboy shot)', o:'almost the whole subject in frame with tight edges'},
  {name:'Full Shot', r:1.25, p:'full body, head to toe with a little space around', o:'the entire subject fully in frame with comfortable margins (hero shot)'},
  {name:'Wide', r:2.2, p:'full body with plenty of surrounding environment', o:'subject smaller in frame with generous surrounding space'},
  {name:'Extreme Wide', r:5, p:'subject small within a vast environment (establishing shot)', o:'subject small within a large environment (establishing shot)'}
];
const NSH = SHOTS.length - 1;
const SUBJ = {
  person:{noun:'person', poss:"the person's", cm:175, fp:.28, preserve:['face and facial features','identity','expression','hairstyle and hair color','skin tone','body proportions','outfit, fabrics and accessories'],
    neg:'different face, changed identity, altered facial features, extra fingers, extra limbs, deformed hands, plastic skin'},
  product:{noun:'product', poss:"the product's", cm:30, fp:.8, preserve:['exact shape and proportions','materials and surface finish','colors','logos, labels and printed text','branding details','every design feature'],
    neg:'warped logo, misspelled or changed label text, altered shape, wrong materials, extra parts, melted edges'},
  object:{noun:'object', poss:"the object's", cm:50, fp:.8, preserve:['shape and proportions','colors','materials and textures','any text or logos'],
    neg:'altered shape, wrong materials, extra parts'},
  animal:{noun:'animal', poss:"the animal's", cm:60, fp:1.3, preserve:['species and breed features','fur, feather or skin pattern and colors','markings','eyes and face','proportions'],
    neg:'different breed, wrong markings, extra legs, deformed anatomy'},
  car:{noun:'car', poss:"the car's", cm:150, fp:2.9, preserve:['exact car model and body design','paint color and finish','badges, grille, lights and wheels','license plate area','proportions'],
    neg:'different car model, warped wheels, wrong badges, distorted body panels, melted reflections'},
  phone:{noun:'phone', poss:"the phone's", cm:16, fp:.5, preserve:['exact phone model, shape and thickness','camera module layout','colors and finish','buttons and ports','logo and screen content'],
    neg:'wrong camera layout, extra lenses, bent body, warped logo, changed screen content'},
  vehicle:{noun:'vehicle', poss:"the vehicle's", cm:150, fp:2.9, preserve:['model and body design','paint color and finish','badges, lights and wheels','proportions'],
    neg:'different car model, warped wheels, wrong badges, distorted body panels'},
  auto:{noun:'main subject', poss:"the subject's", cm:100, fp:.6, preserve:['shape and proportions','colors','materials and textures','identity of the subject','any text or logos'],
    neg:'altered subject, changed identity'}
};
const TYPE_NAME = {person:'Person', product:'Product', object:'Object', animal:'Animal', car:'Car', phone:'Phone', vehicle:'Vehicle', auto:'Subject'};
const PRESETS = [
  ['Front',0,0],['Front-Right 3/4',45,10],['Right Side',90,0],['Back-Right 3/4',135,10],['Back',180,0],
  ['Back-Left 3/4',225,10],['Left Side',270,0],['Front-Left 3/4',315,10],['Low Angle',20,-30],['High Angle',20,40],['Top-Down',0,89],["Worm's-eye",0,-80]
];
const LIGHT = {
  match:'Keep the lighting consistent with the reference: same light quality, direction relative to the subject and color temperature, with highlights, reflections and shadows recalculated correctly for the new camera angle.',
  studio:'Soft, even studio lighting: large key softbox at 45°, gentle fill, subtle rim light, clean soft shadows.',
  golden:'Warm golden-hour sunlight from a low angle, soft long shadows, warm rim light on the subject.',
  lowkey:'Dramatic low-key lighting: one hard key light, deep shadows, strong contrast, dark surroundings.',
  overcast:'Soft overcast daylight: diffuse, shadowless, even illumination with natural colors.'
};
// light rig roles; angle 0 = front of the subject, + = right of the front camera
const ROLES = [
  {id:'key', name:'Key light', color:'#e85d2b'},
  {id:'fill', name:'Fill light', color:'#7db8ff'},
  {id:'rim', name:'Rim / back light', color:'#f2d24b'},
  {id:'hair', name:'Hair light', color:'#c084fc'},
  {id:'kicker', name:'Kicker', color:'#3fb950'},
  {id:'bg', name:'Background light', color:'#9aa0a6'}
];
const roleName = id => ROLES.find(r => r.id === id)?.name || id;
// each light: [angle, height, power %, kelvin, hardness 0-100]
const LIGHTS = {
  person:[
    {id:'3point', name:'3-point classic', text:'the standard portrait rig: a key light at 45°, a softer fill on the opposite side and a rim light behind for separation', L:{key:[45,35,100,5600,40], fill:[-45,15,45,5600,15], rim:[155,40,70,6000,55]}},
    {id:'4point', name:'4-point (with background)', text:'3-point rig plus a background light that lifts the backdrop behind the subject', L:{key:[45,35,100,5600,40], fill:[-45,15,45,5600,15], rim:[155,40,70,6000,55], bg:[180,10,60,5600,20]}},
    {id:'rembrandt', name:'Rembrandt', text:'key light high and 45° to the side, a small triangle of light on the shadow-side cheek, moody painterly contrast', L:{key:[45,45,100,5000,45], fill:[-40,10,20,5000,15]}},
    {id:'butterfly', name:'Butterfly / Paramount', text:'key light straight in front and high, a small butterfly shadow under the nose, glamorous; reflector fill below and a hair light', L:{key:[0,50,100,5600,40], fill:[0,-15,35,5600,10], hair:[180,60,50,5600,40]}},
    {id:'loop', name:'Loop', text:'key light 30° to the side, a small loop shadow from the nose, natural and flattering', L:{key:[30,35,100,5400,35], fill:[-40,10,40,5400,15], hair:[170,60,40,5600,40]}},
    {id:'split', name:'Split', text:'key light at 90° to the side, exactly half the face lit, dramatic', L:{key:[90,5,100,5200,55]}},
    {id:'clamshell', name:'Clamshell beauty', text:'large soft key above the camera and a fill from below the chin, even beauty light with bright catchlights', L:{key:[0,40,100,5600,15], fill:[0,-25,60,5600,10], bg:[180,5,50,5600,10]}},
    {id:'broad', name:'Broad', text:'key light on the side of the face turned toward the camera, open and friendly', L:{key:[-40,30,100,5400,35], fill:[45,10,35,5400,15], rim:[150,35,50,6000,50]}},
    {id:'short', name:'Short', text:'key light on the side of the face turned away from the camera, slimming and sculpted', L:{key:[40,30,100,5200,40], fill:[-45,10,30,5200,15], rim:[-150,35,50,6000,50]}},
    {id:'rimkick', name:'Rim + kicker', text:'two back lights outline the hair and shoulders with bright edges against a dark background', L:{rim:[150,25,100,6000,60], kicker:[-135,15,70,6000,60], fill:[0,10,20,5600,10]}},
    {id:'cross', name:'Cross lighting', text:'two hard lights from opposite back-front diagonals, sculpted edges and texture on both sides', L:{key:[60,30,100,5600,55], rim:[-120,30,90,5600,55]}},
    {id:'highkey', name:'High-key', text:'bright, even, very soft light with minimal shadows on a white background, clean and airy', L:{key:[10,30,100,6000,10], fill:[-30,10,80,6000,5], bg:[180,0,100,6000,10]}},
    {id:'lowkey', name:'Low-key', text:'one hard key light with deep shadows and a dark background, high-contrast cinematic mood', L:{key:[70,30,100,4800,75], rim:[160,30,40,4800,60]}},
    {id:'ring', name:'Ring light', text:'ring light around the lens, almost shadowless frontal light with ring-shaped catchlights', L:{key:[0,2,100,5600,20]}}
  ],
  product:[
    {id:'prod3', name:'Product 3-point', text:'soft key from the front-side, gentle fill and a rim light that traces the edges', L:{key:[45,45,100,5600,25], fill:[-60,20,40,5600,15], rim:[170,30,80,6000,40]}},
    {id:'topsoft', name:'Overhead softbox', text:'large softbox directly above with a little front fill, soft even top light and a gentle contact shadow', L:{key:[0,75,100,5600,15], fill:[0,10,30,5600,10]}},
    {id:'gradient', name:'Gradient sweep', text:'a light behind the product paints a smooth gradient on the backdrop, the product glows against it', L:{bg:[180,20,100,5600,20], key:[30,40,60,5600,20]}},
    {id:'darkfield', name:'Dark-field rim', text:'two lights behind on a black background outline the shape with bright edges, ideal for glass and glossy products', L:{rim:[150,10,100,6000,50], kicker:[-150,10,100,6000,50]}},
    {id:'brightfield', name:'Bright-field backlight', text:'a bright white backlight shines through the product, crisp dark outlines, ideal for glass and liquids', L:{bg:[180,0,100,6000,10], fill:[0,10,20,6000,10]}},
    {id:'tent', name:'Light tent', text:'fully diffused light from front and both sides, shadowless e-commerce look with true colors', L:{key:[0,45,100,5600,0], fill:[-90,20,80,5600,0], kicker:[90,20,80,5600,0]}},
    {id:'hardshadow', name:'Hard light & shadow', text:'a single hard sun-like light casts crisp graphic shadows, bold editorial style', L:{key:[60,35,100,5200,90]}},
    {id:'strip', name:'Strip lights', text:'two tall strip softboxes on both sides draw clean long specular lines on glossy surfaces', L:{key:[100,15,100,5800,30], kicker:[-100,15,100,5800,30]}},
    {id:'glow', name:'Backlit glow', text:'warm backlight makes liquids and translucent parts glow, with a soft front fill', L:{rim:[170,20,100,3800,30], fill:[0,15,40,5600,15]}}
  ],
  outdoor:[
    {id:'golden', name:'Golden hour', text:'low warm sun shortly before sunset, long soft shadows and a warm glowing rim, cool sky fill', L:{key:[120,8,100,3200,40], fill:[-60,40,30,7500,0]}},
    {id:'bluehour', name:'Blue hour', text:'cool deep-blue twilight ambient light with warm practical lights in the scene', L:{fill:[0,40,70,9000,0], key:[60,10,50,3000,30]}},
    {id:'overcast', name:'Overcast', text:'cloudy sky as a giant softbox, even shadowless daylight and natural colors', L:{key:[0,70,100,6500,0]}},
    {id:'noon', name:'Harsh midday sun', text:'high hard sun with short dark shadows and strong contrast, ground bounce fill', L:{key:[20,80,100,5600,95], fill:[0,-20,20,5600,10]}},
    {id:'sunsetback', name:'Backlit sunset', text:'sun directly behind the subject, glowing rim, lens flare and a soft bounce fill on the face', L:{rim:[180,6,100,3000,50], fill:[0,10,35,4500,10]}},
    {id:'window', name:'Window light', text:'soft directional daylight from a large window to the side, gentle falloff, white bounce fill', L:{key:[70,15,100,5800,20], fill:[-70,10,25,5800,5]}},
    {id:'neon', name:'Night neon', text:'night city with colorful neon signs as key and rim lights, wet reflective surfaces', L:{key:[-70,10,100,8000,45], rim:[140,15,80,2800,45]}},
    {id:'fog', name:'Foggy morning', text:'soft hazy morning light diffused by fog, low contrast and atmospheric depth', L:{key:[30,25,100,7000,5]}}
  ]
};
const BG = {
  keep:'Keep the same environment and background as the reference, re-projected correctly for the new viewpoint (perspective, horizon and parallax must match the camera angle).',
  studio:'Clean seamless light-grey studio backdrop with a soft floor shadow.',
  white:'Pure white seamless background (#FFFFFF), soft natural contact shadow, e-commerce style.',
  black:'Pure black background with subtle edge light separating the subject.',
  garage:'Clean modern automotive garage with a polished concrete floor, overhead LED light strips and realistic reflections on the body panels.',
  outdoor:'Open scenic outdoor road and natural sky with a true horizon and realistic road reflections matching the camera angle.',
  showroom:'Sleek luxury automotive showroom with glossy floor reflections, soft architectural lighting and clean background depth.',
  street:'Urban city street with realistic asphalt pavement, buildings in soft depth-of-field and natural street reflections.',
  track:'Motorsport race track asphalt with curbing and open stadium or sky background matching the camera perspective.',
  desk:'Clean minimalist wooden and matte desk surface with soft natural daylight and realistic contact shadows.',
  tech:'Modern stone or brushed-aluminum tech tabletop with subtle ambient reflections and a clean out-of-focus background.',
  cafe:'Natural café tabletop outdoors with warm daylight and a soft bokeh background.',
  podium:'Minimalist geometric stone podium on a clean studio set with soft architectural shadows.',
  counter:'Polished marble countertop with subtle surface reflection and a soft lifestyle background blur.',
  lifestyle:'Warm natural wood tabletop in a sunlit room with a soft out-of-focus interior background.',
  tabletop:'Clean neutral tabletop surface with a natural contact shadow and soft background falloff.',
  outdoor_nat:'Natural outdoor environment with a realistic ground plane, daylight and depth.',
  park:'Lush green park lawn with natural sunlight and soft trees in the background.',
  nature:'Natural outdoor trail and woodland setting with realistic ground texture and soft depth of field.',
  home:'Warm, lived-in home interior with soft window daylight and natural floor texture.'
};
// Category-specific background options sit on top of the generic options; Person keeps only the generic options.
const BG_GENERIC = [
  ['keep', 'Keep reference background', false],
  ['studio', 'Seamless grey studio', true],
  ['white', 'Pure white (e-commerce)', true],
  ['black', 'Pure black', true]
];
const BG_BY_TYPE = {
  person:[],
  auto:[],
  car:[['garage', 'Garage', true], ['outdoor', 'Outdoor', true], ['showroom', 'Luxury showroom', true], ['street', 'City street', true], ['track', 'Race track', true]],
  vehicle:[['outdoor', 'Outdoor', true], ['garage', 'Garage', true], ['street', 'City street', true], ['showroom', 'Showroom', true]],
  phone:[['desk', 'Minimalist desk', true], ['tech', 'Tech surface', true], ['cafe', 'Outdoor / café table', true]],
  product:[['podium', 'Pedestal / podium', true], ['counter', 'Marble countertop', true], ['lifestyle', 'Lifestyle tabletop', true]],
  object:[['tabletop', 'Clean tabletop', true], ['outdoor_nat', 'Outdoor natural setting', true]],
  animal:[['park', 'Outdoor park / grass', true], ['nature', 'Natural habitat / forest', true], ['home', 'Cozy indoor home', true]]
};
const KEYS = [
  {id:'4k', name:'Upscale to 4K', text:'Upscale to 4K (3840 px long edge), ultra-sharp, high-resolution detail'},
  {id:'face', name:'Face 100% same', text:'Face 100% same as the reference: identical facial features, identity, skin tone and expression', when:['person','auto'],
   group:'Every face 100% same as the reference: identical facial features, identity, skin tone and expression for each person'},
  {id:'product', name:'Product 100% same', text:'Product 100% same as the reference: identical shape, proportions, materials, colors, logo and label text', when:['product','object','vehicle','car','phone','auto'],
   group:'Every product 100% same as the reference: identical shape, proportions, materials, colors, logo and label text for each one'},
  {id:'char', name:'Character 100% same', text:'Character 100% same: full character consistency with the reference, no redesign',
   group:'Every character 100% same: full consistency for each subject, no redesign, no swapped identities'},
  {id:'outfit', name:'Same outfit & colors', text:'Same outfit, colors, textures and accessories as the reference'},
  {id:'logo', name:'Exact text & logo', text:'Keep all text, logos and labels exactly as in the reference, correctly spelled and undistorted'},
  {id:'real', name:'Ultra realistic', text:'Ultra realistic, true-to-life materials and lighting, no AI artifacts, no plastic look'},
  {id:'detail', name:'Fine detail', text:'Fine micro-detail: skin pores, fabric weave, material texture and edges fully preserved'},
  {id:'photo', name:'Real photo, not 3D', text:'Real photograph of the real subject shot on a real camera: true-to-life skin, hair, fabric and materials. Not a 3D render, not CGI, not a game, cartoon or illustration look'},
  {id:'skin', name:'Natural skin & hair', text:'Natural skin texture with visible pores and tiny imperfections, real individual hair strands, no airbrushed, waxy or plastic skin', when:['person','auto']},
  {id:'anatomy', name:'Correct anatomy', text:'Correct anatomy: natural hands with five fingers, real body proportions and a natural pose', when:['person','animal','auto']},
  {id:'light', name:'Natural light & shadows', text:'Physically correct light: real shadows, contact shadows and reflections that match the scene'},
  {id:'sharp', name:'Sharp focus', text:'Tack-sharp focus on the main subject with natural lens rendering'},
  {id:'clean', name:'No text / watermark', text:'No added text, captions, logos or watermarks'},
  {id:'live', name:'Live-action footage', text:'Live-action footage filmed with a real cinema camera: real people and objects in a real place, natural motion and physics, subtle film grain. Absolutely not 3D animation, CGI or a game engine look', video:true},
  {id:'consist', name:'Same identity every frame', text:'Faces, outfits and product details stay exactly the same in every frame, no morphing, warping or flicker', video:true},
  {id:'nocut', name:'No Video Cut', text:'One single continuous shot from the first frame to the last: no cuts, no scene changes, no transitions, no jump cuts, no new camera angles', video:true},
  // video mode only, but used by both the Video and the Frame prompt (frameText for the still)
  {id:'refguide', name:'Reference Video / Frame', video:true, both:true,
   text:'Reference video is the motion master: reproduce its camera movement exactly, with the same path, direction, speed, timing, easing, framing and subject placement from the first frame to the last, and follow its subject motion and blocking beat for beat. Treat the reference video strictly as a movement guide: never copy its look, stand-in shapes, textures or colors, and never add, skip, reverse or soften any camera move',
   frameText:'Reference frame is the composition master: match its exact camera angle, camera height, distance, lens perspective, framing, and the subject\'s position, scale and pose inside the frame. Treat the reference frame strictly as a composition guide: never copy its look, stand-in shapes, textures or colors, and do not shift, crop or re-frame the shot'},
  {id:'mblur', name:'Natural motion blur', text:'Natural motion blur on fast movement and during camera moves, like a real 180° shutter, sharp when still', video:true},
  {id:'stable', name:'Smooth stabilized camera', text:'Smooth, stabilized camera movement like a gimbal, dolly or crane, no handheld shake unless asked', video:true},
  {id:'physics', name:'Real physics', text:'Realistic physics: hair, clothes, liquids and objects move naturally with weight, inertia and follow-through', video:true},
  {id:'speed', name:'Real-time speed', text:'Real-time speed: no unwanted slow motion, time-lapse or speed ramps', video:true},
  {id:'cine', name:'Cinematic 24 fps', text:'Cinematic 24 fps cadence with natural film motion, no frame interpolation or soap-opera smoothness', video:true},
  {id:'parallax', name:'Correct parallax', text:'Correct parallax and depth while the camera moves: near and far layers shift naturally, background never looks flat or pasted', video:true}
];
const VIEW_TEXT = {front:'front view, eye level', back:'back view', left:'left side view', right:'right side view', top:'top-down view', 'three-quarter':'three-quarter view'};
// Famous camera shot presets for Image Mode (inspired by https://super3.github.io/camera-prompts/)
const IMG_PRESETS = [
  {id:'eye_level', group:'Angles & Orientations', name:'Eye-Level Shot', az:0, el:0, roll:0, shotIdx:5, focal:50, aperture:2.8, dof:true,
   prompt:'Eye-level shot: camera positioned at the subject\'s eye height, creating a neutral, natural perspective that establishes equality and realism.'},
  {id:'low_angle', group:'Angles & Orientations', name:'Low-Angle Hero', az:18, el:-28, roll:0, shotIdx:6, focal:28, aperture:2.8, dof:true,
   prompt:'Low-angle shot: camera positioned below eye level, looking up at the subject. Creates a sense of power, dominance, and monumentality; subject appears larger and more imposing against the background.'},
  {id:'high_angle', group:'Angles & Orientations', name:'High-Angle Shot', az:20, el:36, roll:0, shotIdx:6, focal:35, aperture:4, dof:true,
   prompt:'High-angle shot: camera positioned above eye level, looking down at the subject, creating an overview perspective.'},
  {id:'worms_eye', group:'Angles & Orientations', name:"Worm's-Eye View", az:0, el:-72, roll:0, shotIdx:6, focal:18, aperture:4, dof:false,
   prompt:'Worm\'s-eye perspective: camera close to ground level looking sharply upward, creating exaggerated scale and emphasizing height and dominance of the subject.'},
  {id:'birds_eye', group:'Angles & Orientations', name:"Bird's-Eye / Top-Down", az:0, el:82, roll:0, shotIdx:6, focal:35, aperture:5.6, dof:false,
   prompt:'Top-down bird\'s-eye perspective: camera positioned directly above the subject pointing downward, emphasizing spatial layout, arrangement, and graphic composition.'},
  {id:'three_quarter', group:'Angles & Orientations', name:'Three-Quarter Angle', az:42, el:8, roll:0, shotIdx:5, focal:50, aperture:2, dof:true,
   prompt:'Three-quarter angle shot: camera positioned at a 45-degree angle to the subject, showing both front and side for natural depth, dimensionality, and flattering perspective.'},
  {id:'dutch_angle', group:'Angles & Orientations', name:'Dutch Angle / Tilt', az:24, el:-12, roll:16, shotIdx:5, focal:35, aperture:2.8, dof:true,
   prompt:'Dutch angle (tilted composition): camera intentionally rolled on its axis, creating a slanted horizon and dynamic diagonal energy in the frame.'},
  {id:'extreme_closeup', group:'Framing & Distance', name:'Extreme Close-Up', az:0, el:0, roll:0, shotIdx:1, focal:85, aperture:1.8, dof:true,
   prompt:'Extreme close-up shot: camera frames very tight on a specific detail, creating intense intimacy, emphasis, and dramatic focus.'},
  {id:'closeup_headshot', group:'Framing & Distance', name:'Close-Up / Headshot', az:10, el:2, roll:0, shotIdx:2, focal:85, aperture:1.4, dof:true,
   prompt:'Close-up headshot: camera tightly frames the subject at close range, maximizing facial/surface detail and emotional intimacy.'},
  {id:'medium_shot', group:'Framing & Distance', name:'Medium Waist-Up Shot', az:15, el:0, roll:0, shotIdx:4, focal:50, aperture:2, dof:true,
   prompt:'Medium shot: camera frames the subject from the waist up, balancing expression and detail with body language and posture.'},
  {id:'cowboy_shot', group:'Framing & Distance', name:'Cowboy Shot (Mid-Thigh)', az:20, el:-6, roll:0, shotIdx:5, focal:35, aperture:2.8, dof:true,
   prompt:'Cowboy shot (medium-long shot): camera frames the subject from mid-thigh upward, emphasizing stance, readiness, and strong physical presence.'},
  {id:'full_body', group:'Framing & Distance', name:'Full-Body Shot', az:12, el:0, roll:0, shotIdx:6, focal:35, aperture:2.8, dof:true,
   prompt:'Full body shot: camera framing captures the entire subject from top to bottom within the frame, showing complete physical presence and posture.'},
  {id:'extreme_wide', group:'Framing & Distance', name:'Extreme Wide Shot', az:25, el:10, roll:0, shotIdx:8, focal:20, aperture:8, dof:false,
   prompt:'Extreme wide establishing shot: camera positioned far from the subject, showing the vast environment and emphasizing grand scale and context.'},
  {id:'portrait_lens', group:'Lens & Composition', name:'Portrait Lens Bokeh', az:20, el:4, roll:0, shotIdx:3, focal:85, aperture:1.2, dof:true,
   prompt:'Portrait-lens shot: shallow depth of field with the subject tack-sharp against a softly melted bokeh background for clean subject isolation.'},
  {id:'macro_lens', group:'Lens & Composition', name:'Macro-Lens Detail', az:10, el:12, roll:0, shotIdx:0, focal:100, aperture:2.8, dof:true,
   prompt:'Macro-lens shot: extreme close-range composition revealing microscopic textures and fine surface details with minimal depth of field.'},
  {id:'anamorphic', group:'Lens & Composition', name:'Anamorphic Cinema', az:30, el:-5, roll:0, shotIdx:5, focal:40, aperture:2, dof:true,
   prompt:'Anamorphic cinema lens shot: widescreen theatrical perspective with characteristic oval bokeh and cinematic depth.'},
  {id:'ultra_wide', group:'Lens & Composition', name:'Ultra-Wide Perspective', az:20, el:-18, roll:0, shotIdx:6, focal:15, aperture:2.8, dof:false,
   prompt:'Ultra-wide lens shot: expanded field of view with dramatic spatial exaggeration and immersive perspective.'},
  {id:'rule_of_thirds', group:'Lens & Composition', name:'Rule-of-Thirds Shot', az:35, el:5, roll:0, shotIdx:5, focal:50, aperture:2.2, dof:true,
   prompt:'Rule-of-thirds composition: subject positioned along the 3x3 grid intersections for a balanced, natural, visually pleasing arrangement.'},
  {id:'symmetrical', group:'Lens & Composition', name:'Symmetrical Centered', az:0, el:0, roll:0, shotIdx:6, focal:35, aperture:4, dof:false,
   prompt:'Centered symmetrical shot: subject positioned in the exact center of the frame with balanced mirrored geometry and formal harmony.'}
];
// panels that can be docked in each mode; Presets sits as a tab beside Output just like Camera angle & Camera & lens
const DOCKABLE = {image:['pRef', 'pAngle', 'pCam', 'pLight', 'pOutput', 'pPresets', 'pPrompt'], video:['pRef', 'pObjects', 'pAngle', 'pCam', 'pLight', 'pOutput', 'pPresets', 'pPrompt']};
const DOCK_COLS = {image:{L:'iLeft', R:'iRight'}, video:{L:'vLeft', R:'vRight'}};
const DEFAULT_DOCK = mode => mode === 'video' ? {
  L:[{tabs:['pRef', 'pObjects'], active:'pRef'}, {tabs:['pAngle', 'pCam'], active:'pAngle'}, {tabs:['pLight'], active:'pLight'}],
  R:[{tabs:['pOutput', 'pPresets'], active:'pOutput'}, {tabs:['pPrompt'], active:'pPrompt'}]
} : {
  L:[{tabs:['pRef'], active:'pRef'}, {tabs:['pAngle', 'pCam'], active:'pAngle'}, {tabs:['pLight'], active:'pLight'}],
  R:[{tabs:['pOutput', 'pPresets'], active:'pOutput'}, {tabs:['pPrompt'], active:'pPrompt'}]
};

/* ---------- state ---------- */
function rigFrom(setup) {
  const out = {};
  ROLES.forEach(r => { const l = setup.L[r.id]; out[r.id] = l ? {on:true, az:norm360(l[0]), el:l[1], pow:l[2], k:l[3], hard:l[4]} : {on:false, az:r.id === 'bg' ? 180 : 0, el:20, pow:50, k:5600, hard:30}; });
  return out;
}
const DEF_FOCUS = () => ({
  on:false, mode:'single', img:0, x:.5, y:.5, target:'', note:'',
  detail:false, detailCm:6, desc:'', descPinned:false, singleActive:false, singleKey:'', zoom:1, zoomV2:true, vzoom:3, zoomLocked:false,
  multiSel:'', multiEditOpen:false, multiEdits:{}, subjectItems:[], activeSubj:'', activeSubjs:[], lastPointKey:''
});
const DEF = {app:'image', mode:'normal', az:35, el:12, dist:2.4, roll:0, bodyId:'sony-a7iv', lensId:'s2470', focal:35, sensorW:35.9, aperture:2.8, dof:true,
  offX:0, offY:0, subjType:'person', count:1, types:[], subjCm:175, subjColor:'#e85d2b', subjDesc:'', descPinned:false, descUserEdited:false, refView:'front', refBg:0,
  aspect:'4:5', aspectCustom:'', light:'match', lightCustom:'', bg:'keep', bgCustom:'', extra:'', customKeys:[],
  imgPresetId:'', imgPresetPrompt:'',
  keys:['4k','face','product','char','outfit','logo','real','detail','photo','skin','anatomy','light','sharp','clean','live','consist','mblur','stable','physics','speed','cine','parallax','nocut','refguide'], keysV2:true, keysV3:true, keysV4:true, keysV5:true,
  focus:DEF_FOCUS(),
  lightOn:false, lightCat:'person', lightSetup:'3point', lights:rigFrom(LIGHTS.person[0]), lightSel:'key',
  min:{}, docks:{image:DEFAULT_DOCK('image'), video:DEFAULT_DOCK('video')},
  modeStates:{},
  video:{ready:false, duration:5, fps:24, objects:[], tracks:{}, guides:true, path:true, ground:true, loop:true, autokey:true, showTracks:false,
    focus:{on:false, target:'', note:'', pos:[0, .9, 0]}}};
const MODE_KEYS = ['mode', 'az', 'el', 'dist', 'roll', 'bodyId', 'lensId', 'focal', 'sensorW', 'aperture', 'dof',
  'offX', 'offY', 'subjType', 'count', 'types', 'subjCm', 'subjColor', 'subjDesc', 'descPinned', 'descUserEdited', 'descEn', 'descSrc',
  'refView', 'refBg', 'aspect', 'aspectCustom', 'light', 'lightCustom', 'bg', 'bgCustom', 'extra', 'customKeys', 'keys',
  'focus', 'lightOn', 'lightCat', 'lightSetup', 'lights', 'lightSel', 'imgPresetId', 'imgPresetPrompt'];
const refsByMode = {image:[], video:[]};
let S = JSON.parse(JSON.stringify(DEF));
try {
  const saved = JSON.parse(localStorage.getItem('anglecraft-v1') || 'null');
  if (saved) {
    S = {...S, ...saved};
    S.focus = {...DEF_FOCUS(), ...(saved.focus || {})};
    if (!saved.focus?.zoomV2) { S.focus.zoom = 1; S.focus.zoomV2 = true; }
    S.focus.zoom = clamp(+S.focus.zoom || 1, 1, 8);
    if (!Array.isArray(S.focus.activeSubjs)) S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
    S.video = {...JSON.parse(JSON.stringify(DEF.video)), ...(saved.video || {})};
    S.video.focus = {...DEF.video.focus, ...(saved.video?.focus || {})};
    S.min = saved.min || {};
    S.modeStates = saved.modeStates || {};
    if (!saved.lights) { S.lightSetup = DEF.lightSetup; S.lightCat = 'person'; S.lights = rigFrom(LIGHTS.person[0]); }
    if (!saved.docks) S.docks = {image:DEFAULT_DOCK('image'), video:DEFAULT_DOCK('video')};
    delete S.dock;
    ['keyAz', 'keyEl', 'lightK', 'lightHard'].forEach(k => delete S[k]);
    Object.keys(S.video.tracks || {}).forEach(k => { if (k.startsWith('light.')) delete S.video.tracks[k]; });
  }
} catch (e) {}
S.refView = 'front';
if (!S.keysV5) { S.keys = [...new Set([...S.keys, 'refguide'])]; S.keysV5 = true; }
if (!S.keysV4) { S.keys = [...new Set([...S.keys, 'nocut'])]; S.keysV4 = true; }
if (!S.keysV3) { S.keys = [...new Set([...S.keys, 'mblur', 'stable', 'physics', 'speed', 'cine', 'parallax'])]; S.keysV3 = true; }
if (!S.keysV2) { S.keys = [...new Set([...S.keys, 'photo', 'skin', 'anatomy', 'light', 'sharp', 'clean', 'live', 'consist'])]; S.keysV2 = true; }
function snapshotMode(m = S.app) {
  S.modeStates = S.modeStates || {};
  const snap = {};
  MODE_KEYS.forEach(k => { if (S[k] !== undefined) snap[k] = JSON.parse(JSON.stringify(S[k])); });
  S.modeStates[m] = snap;
  refsByMode[m] = refs.slice();
}
function switchModeState(nextApp) {
  if (S.app === nextApp) return;
  snapshotMode(S.app);
  S.app = nextApp;
  const src = S.modeStates?.[nextApp] || DEF;
  MODE_KEYS.forEach(k => {
    const val = src[k] !== undefined ? src[k] : DEF[k];
    if (val !== undefined) S[k] = JSON.parse(JSON.stringify(val));
  });
  S.focus = {...DEF_FOCUS(), ...(S.focus || {})};
  refs.splice(0, refs.length, ...(refsByMode[nextApp] || []));
  bgTypeKey = ''; lensKey = ''; apKey = ''; setupKey = ''; focusKey = ''; keysKey = ''; refBgKey = '';
}
const save = () => {
  try {
    S.modeStates = S.modeStates || {};
    const snap = {};
    MODE_KEYS.forEach(k => { if (S[k] !== undefined) snap[k] = S[k]; });
    S.modeStates[S.app] = snap;
    localStorage.setItem('anglecraft-v1', JSON.stringify(S));
  } catch (e) {}
};

/* reference images live only in memory: [{id, file, src, img, name, status, subjects:[{type,desc,cm}], view, alpha}] */
const refs = [];

const getBody = () => BODIES.find(b => b.id === S.bodyId) || BODIES[2];
function lensesFor(body) {
  const base = (LENSES[body.mount] || []).map(l => body.kind === 'phone' ? {...l, min:l.eq / body.crop, max:l.eq / body.crop} : l);
  const mainAp = body.kind === 'phone' ? base[1].ap : 1.2;
  base.push({id:'manual', name: body.kind === 'phone' ? 'Digital zoom (custom focal)' : 'Custom focal length', min:1, max:2000, ap:mainAp});
  return base;
}
const getLens = () => { const ls = lensesFor(getBody()); return ls.find(l => l.id === S.lensId) || ls[ls.length - 1]; };
function aperturesFor() {
  const lens = getLens();
  if (getBody().kind === 'phone') return [lens.ap];
  return APERTURES.filter(a => a >= lens.ap - 1e-6);
}
const detailActive = () => S.focus.on && S.focus.detail;

/* ---------- access: Normal mode for everyone, Advanced mode = signed in (Google/GitHub) + approved by the owner ----------
   Only active on the web build (<html data-gated>, with auth.js on the page); everywhere else everything stays open. */
const GATED = document.documentElement.hasAttribute('data-gated');
const LOCKED_PANELS = ['pLight', 'pCam'];
let PRO = !GATED || (() => { try { return localStorage.getItem('vp-pro') === '1'; } catch (e) { return false; } })();
// put every Advanced-only setting back to its Normal value
function enforce() {
  if (PRO) return;
  S.mode = 'normal'; S.lightOn = false;
  S.light = 'match'; S.bg = 'keep';
}
// the one "Advanced mode needed" panel every locked control uses; auth.js fills in the sign-in / request buttons
function needAdv(what) {
  $('advMsg').textContent = (what ? what + ' is part of Advanced mode. ' : '')
    + 'Advanced mode opens Video, Lighting, Camera & lens, Focus point, Extra notes and every background and lighting preset. Send a request and framesbyismail will give you access.';
  hooks.advRender?.();
  $('advPop').classList.add('show');
}
function hideAdv() { $('advPop').classList.remove('show'); }
$('advClose').addEventListener('click', hideAdv);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideAdv(); });
function setPro(v) {
  v = !GATED || !!v;
  try { localStorage.setItem('vp-pro', v ? '1' : '0'); } catch (e) {}
  if (v === PRO) return;
  PRO = v;
  if (!PRO && S.app === 'video') { hooks.leaveVideo?.(); S.app = 'image'; }
  enforce(); applyLayout(); changed();
}
document.body.classList.toggle('gated', GATED);
function detailShot(ratio) {
  if (ratio < .7) return {name:'Macro detail', text:'extreme macro: the detail overflows the frame, showing micro texture'};
  if (ratio < 1.5) return {name:'Detail insert', text:'insert shot: the detail fills the whole frame'};
  if (ratio < 3.5) return {name:'Close detail', text:'close detail shot: the detail is the clear center with a little surrounding context'};
  return null;
}
function calc(over) {
  const st = over ? {...S, ...over} : S;
  const body = getBody(), f = st.focal, sW = st.sensorW;
  const sH = body.kind === 'phone' ? sW * .75 : sW / 1.5;
  const eq = f * 36 / sW;
  const hfov = deg(2 * Math.atan(sW / (2 * f))), vfov = deg(2 * Math.atan(sH / (2 * f)));
  const subjH = st.subjCm / 100;
  const visH = st.dist * sH / f, ratio = visH / subjH;
  let shotIdx = 0, best = 1e9;
  SHOTS.forEach((s, i) => { const d = Math.abs(Math.log(ratio / s.r)); if (d < best) { best = d; shotIdx = i; } });
  const N = st.aperture, c = Math.hypot(sW, sH) / 1500, s = st.dist * 1000;
  const H = f * f / (N * c) + f;
  const near = s * (H - f) / (H + s - 2 * f) / 1000;
  const far = s < H ? s * (H - f) / (H - s) / 1000 : Infinity;
  const dShot = detailActive() ? detailShot(visH / (S.focus.detailCm / 100)) : null;
  return {sW, sH, eq, hfov, vfov, subjH, ratio, shotIdx, shot:SHOTS[shotIdx], near, far, dShot, visH,
    fp: subjH * SUBJ[st.subjType].fp * (st.count > 1 ? st.count ** .7 : 1)};
}
const distForShot = i => { const k = calc(); return clamp(SHOTS[i].r * k.subjH * S.focal / k.sH, DMIN, DMAX); };

/* ---------- setters ---------- */
const DMIN = .02, DMAX = 80;
const setAz = a => { S.az = norm360(a); };
const setEl = e => { S.el = clamp(e, -89.5, 89.5); };
const setDist = d => { S.dist = clamp(d, DMIN, DMAX); };
function setBody(id) {
  S.bodyId = id; const body = getBody();
  if (body.kind !== 'custom') S.sensorW = body.sensorW;
  const ls = lensesFor(body);
  S.lensId = body.kind === 'custom' ? 'manual' : ls[1].id;
  applyLens();
}
function applyLens() {
  const lens = getLens(), body = getBody();
  if (lens.id !== 'manual') S.focal = lens.min === lens.max ? lens.min : clamp(S.focal, lens.min, lens.max);
  if (body.kind === 'phone') S.aperture = lens.ap;
  else S.aperture = S.dof ? lens.ap : Math.max(8, lens.ap);
}
function setFocal(f) {
  if (!isFinite(f)) return;
  S.focal = clamp(f, 1, 2000);
  const lens = getLens();
  if (S.focal < lens.min - .05 || S.focal > lens.max + .05) {
    const m = lensesFor(getBody()).find(l => l.id !== 'manual' && S.focal >= l.min - .05 && S.focal <= l.max + .05);
    S.lensId = m ? m.id : 'manual';
    if (S.aperture < getLens().ap) S.aperture = getLens().ap;
  }
}
function setSensor(w) {
  if (!isFinite(w) || w <= 0) return;
  S.sensorW = clamp(w, 1, 100);
  if (getBody().kind !== 'custom') { S.bodyId = 'custom'; S.lensId = 'manual'; }
}
function setDof(on) {
  S.dof = on; const lens = getLens();
  if (getBody().kind !== 'phone') S.aperture = on ? lens.ap : Math.max(8, lens.ap);
}

/* ---------- custom dropdowns (rounded list, green highlight) ---------- */
const DD = new Map();
let ddOpen = null;
const CHEV = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const LOCK = '<svg class="lk" viewBox="0 0 12 12" aria-hidden="true"><rect x="2.5" y="5.5" width="7" height="5" rx="1" fill="currentColor"/><path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>';
const CHECK = '<svg class="ck" viewBox="0 0 12 12" aria-hidden="true"><path d="m2 6.5 2.5 2.5L10 3.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
function enhance(sel) {
  if (DD.has(sel)) return;
  const wrap = document.createElement('div'); wrap.className = 'dd';
  sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel); sel.classList.add('dd-native'); sel.tabIndex = -1;
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'dd-btn';
  btn.id = (sel.id || 'sel' + DD.size) + 'Dd';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  if (sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
  btn.innerHTML = '<span class="t"></span>' + CHEV;
  wrap.appendChild(btn);
  if (sel.id) document.querySelectorAll(`label[for="${sel.id}"]`).forEach(l => { l.htmlFor = btn.id; });
  btn.addEventListener('click', () => ddOpen && ddOpen.sel === sel ? closeDD() : openDD(sel));
  btn.addEventListener('keydown', e => { if (['ArrowDown', 'ArrowUp'].includes(e.key) && !ddOpen) { e.preventDefault(); openDD(sel); } });
  DD.set(sel, {wrap, btn});
  refreshDD(sel);
}
function refreshDD(sel) {
  const d = DD.get(sel); if (!d) return;
  const o = sel.selectedOptions[0];
  d.btn.querySelector('.t').textContent = o ? o.textContent : '';
  d.btn.classList.toggle('is-custom', !!o && o.classList.contains('c'));
  d.btn.disabled = sel.disabled;
}
function openDD(sel) {
  closeDD();
  const d = DD.get(sel); if (!d || sel.disabled) return;
  const pop = document.createElement('div'); pop.className = 'dd-pop'; pop.setAttribute('role', 'listbox');
  const items = [];
  const addOpt = o => {
    const it = document.createElement('div'), locked = !PRO && o.hasAttribute('data-adv');
    it.className = 'dd-opt' + (o.classList.contains('c') ? ' c' : '') + (locked ? ' locked' : ''); it.setAttribute('role', 'option');
    it.setAttribute('aria-selected', o.selected ? 'true' : 'false'); it.dataset.v = o.value;
    if (locked) it.setAttribute('aria-disabled', 'true');
    it.innerHTML = `<span>${esc(o.textContent)}</span>${locked ? LOCK : CHECK}`;
    it.addEventListener('click', () => pick(o.value));
    it.addEventListener('mousemove', () => setAct(items.indexOf(it)));
    pop.appendChild(it); items.push(it);
  };
  [...sel.children].forEach(ch => {
    if (ch.tagName === 'OPTGROUP') {
      const g = document.createElement('div'); g.className = 'dd-group'; g.textContent = ch.label; pop.appendChild(g);
      [...ch.children].forEach(addOpt);
    } else addOpt(ch);
  });
  document.body.appendChild(pop);
  const r = d.btn.getBoundingClientRect();
  const width = Math.max(r.width, 170);
  pop.style.width = width + 'px';
  pop.style.left = clamp(r.left, 8, innerWidth - width - 8) + 'px';
  const below = innerHeight - r.bottom - 12, above = r.top - 12;
  if (below < 220 && above > below) { pop.style.bottom = (innerHeight - r.top + 4) + 'px'; pop.style.maxHeight = Math.min(300, above) + 'px'; }
  else { pop.style.top = (r.bottom + 4) + 'px'; pop.style.maxHeight = Math.min(300, below) + 'px'; }
  let act = Math.max(0, items.findIndex(i => i.getAttribute('aria-selected') === 'true'));
  function setAct(i) { items.forEach(x => x.classList.remove('act')); act = clamp(i, 0, items.length - 1); items[act]?.classList.add('act'); }
  function pick(v) {
    closeDD();
    if (!PRO && [...sel.options].find(o => o.value === v)?.hasAttribute('data-adv')) { needAdv(`"${[...sel.options].find(o => o.value === v).textContent.replace('…', '')}"`); d.btn.focus(); return; }
    if (sel.value !== v) { sel.value = v; sel.dispatchEvent(new Event('change', {bubbles:true})); }
    refreshDD(sel); d.btn.focus();
  }
  items[act]?.scrollIntoView({block:'nearest'});
  const onKey = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAct(act + 1); items[act].scrollIntoView({block:'nearest'}); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAct(act - 1); items[act].scrollIntoView({block:'nearest'}); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (items[act]) pick(items[act].dataset.v); }
    else if (e.key === 'Escape' || e.key === 'Tab') { closeDD(); if (e.key === 'Escape') d.btn.focus(); }
  };
  const onDown = e => { if (!pop.contains(e.target) && !d.btn.contains(e.target)) closeDD(); };
  const onScroll = e => { if (!pop.contains(e.target)) closeDD(); };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', closeDD);
  d.btn.setAttribute('aria-expanded', 'true');
  ddOpen = {sel, pop, cleanup:() => {
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', closeDD);
    d.btn.setAttribute('aria-expanded', 'false');
  }};
}
function closeDD() { if (!ddOpen) return; ddOpen.cleanup(); ddOpen.pop.remove(); ddOpen = null; }

/* ---------- drag left / right on any number box to change it ---------- */
(() => {
  let sc = null;
  document.addEventListener('pointerdown', e => {
    const inp = e.target.closest?.('input[type=number]');
    if (!inp || inp.disabled || document.activeElement === inp || e.button !== 0) return;
    e.preventDefault();
    const st = parseFloat(inp.step) || 1;
    sc = {inp, x0:e.clientX, v0:parseFloat(inp.value) || 0, step:st, moved:false, id:e.pointerId};
    try { inp.setPointerCapture(e.pointerId); } catch (er) {}
  });
  document.addEventListener('pointermove', e => {
    if (!sc) return;
    const dx = e.clientX - sc.x0;
    if (!sc.moved && Math.abs(dx) < 3) return;
    sc.moved = true; sc.inp.classList.add('scrubbing');
    const mul = e.shiftKey ? 10 : e.altKey ? .1 : 1;
    const min = sc.inp.min !== '' ? parseFloat(sc.inp.min) : -Infinity, max = sc.inp.max !== '' ? parseFloat(sc.inp.max) : Infinity;
    const dec = (String(sc.step).split('.')[1] || '').length + (e.altKey ? 1 : 0);
    const v = clamp(sc.v0 + Math.round(dx / 3) * sc.step * mul, min, max);
    const s = v.toFixed(dec);
    if (sc.inp.value !== s) { sc.inp.value = s; sc.inp.dispatchEvent(new Event('input', {bubbles:true})); sc.inp.dispatchEvent(new Event('change', {bubbles:true})); }
  });
  const up = () => {
    if (!sc) return;
    const {inp, moved} = sc; sc = null; inp.classList.remove('scrubbing');
    if (!moved) { inp.focus(); inp.select?.(); }
  };
  document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
})();

/* ---------- UI build ---------- */
function buildStatic() {
  const groups = {};
  BODIES.forEach(b => (groups[b.group] = groups[b.group] || []).push(b));
  $('body').innerHTML = Object.entries(groups).map(([g, bs]) => `<optgroup label="${g}">${bs.map(b => `<option value="${b.id}"${b.kind === 'custom' ? ' class="c"' : ''}>${b.name}</option>`).join('')}</optgroup>`).join('');
  $('focalPreset').innerHTML = '<option value="" class="c">Custom (mm)</option>' + FOCAL_PRESETS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('sensorPreset').innerHTML = '<option value="" class="c">Custom (mm)</option>' + SENSOR_PRESETS.map(([v, n]) => `<option value="${v}">${n}</option>`).join('');
  $('presets').innerHTML = PRESETS.map(([n], i) => `<button class="tog" data-p="${i}" aria-pressed="false">${n}</button>`).join('');
  $('shot').max = NSH;
}
let lensKey = '', apKey = '', setupKey = '', focusKey = '', refBgKey = '', bgTypeKey = '';
function renderBgOpts() {
  const t = S.subjType || 'person';
  if (bgTypeKey !== t) {
    bgTypeKey = t;
    const spec = BG_BY_TYPE[t] || [];
    const opt = ([v, n, adv, cust]) => `<option value="${v}"${cust ? ' class="c"' : ''}${adv ? ' data-adv' : ''}>${n}</option>`;
    const allOpts = [...spec, ...BG_GENERIC, ['custom', 'Custom…', true, true]];
    $('bg').innerHTML = allOpts.map(opt).join('');
    if (!allOpts.some(([v]) => v === S.bg)) S.bg = 'keep';
  }
  $('bg').value = S.bg;
}
function fill(el) { const p = (el.value - el.min) / (el.max - el.min) * 100; el.style.setProperty('--p', p + '%'); }
const setIfIdle = (el, v) => { if (el && document.activeElement !== el && !el.classList.contains('scrubbing')) el.value = v; };
const distToSlider = d => 1000 * Math.log(d / DMAX) / Math.log(DMIN / DMAX);
const sliderToDist = v => DMAX * (DMIN / DMAX) ** (v / 1000);
const apStr = N => 'f/' + (+N.toFixed(2));
const mStr = v => v === Infinity ? '∞' : v < 1 ? Math.round(v * 1000) / 10 + ' cm' : rnd(v, 2) + ' m';
const hardName = h => h < 25 ? 'Very soft' : h < 45 ? 'Soft' : h < 65 ? 'Medium' : h < 85 ? 'Hard' : 'Very hard';

function syncUI() {
  const k = calc(), body = getBody(), lens = getLens();
  document.body.classList.toggle('adv', S.mode === 'adv');
  document.body.classList.toggle('pro', PRO);
  document.body.classList.toggle('video', S.app === 'video');
  $('modeNormal').setAttribute('aria-pressed', S.mode !== 'adv'); $('modeAdv').setAttribute('aria-pressed', S.mode === 'adv');
  $('appImage').setAttribute('aria-pressed', S.app !== 'video'); $('appVideo').setAttribute('aria-pressed', S.app === 'video');
  $('promptKind').textContent = promptLabel();
  const sa = signed(S.az);
  $('rot').value = Math.round(sa); $('rotV').textContent = Math.round(sa) + '°';
  $('tilt').value = Math.round(S.el); $('tiltV').textContent = Math.round(S.el) + '°';
  $('shot').value = NSH - k.shotIdx; $('shotV').textContent = k.dShot ? k.dShot.name : k.shot.name;
  $('az').value = Math.round(norm360(S.az)); $('azV').textContent = Math.round(norm360(S.az)) + '°';
  $('el').value = Math.round(S.el); $('elV').textContent = Math.round(S.el) + '°';
  $('dist').value = Math.round(distToSlider(S.dist)); $('distV').textContent = S.dist < 1 ? Math.round(S.dist * 100) + ' cm' : rnd(S.dist, 2).toFixed(2) + ' m';
  $('roll').value = Math.round(S.roll); $('rollV').textContent = Math.round(S.roll) + '°';
  document.querySelectorAll('#presets button').forEach(b => {
    const [, a, e] = PRESETS[+b.dataset.p];
    b.setAttribute('aria-pressed', Math.abs(signed(S.az - a)) < 1 && Math.abs(S.el - e) < 1);
  });
  $('body').value = S.bodyId;
  const ls = lensesFor(body);
  if (lensKey !== body.id) { $('lens').innerHTML = ls.map(l => `<option value="${l.id}"${l.id === 'manual' ? ' class="c"' : ''}>${l.name}</option>`).join(''); lensKey = body.id; }
  $('lens').value = lens.id;
  const aps = aperturesFor();
  if (apKey !== aps.join()) { $('aperture').innerHTML = aps.map(a => `<option value="${a}">${apStr(a)}</option>`).join(''); apKey = aps.join(); }
  $('aperture').value = String(aps.includes(S.aperture) ? S.aperture : aps[0]);
  $('dofBtn').setAttribute('aria-pressed', S.dof);
  $('dofBtn').innerHTML = `DOF Blur<span class="sub">${S.dof ? (body.kind === 'phone' ? 'Portrait' : 'On') : 'Off'}</span>`;
  $('roEq').textContent = Math.round(k.eq) + ' mm · ' + apStr(S.aperture);
  $('roShot').textContent = k.dShot ? k.dShot.name : k.shot.name;
  $('roDof').textContent = mStr(k.near) + ' → ' + mStr(k.far);
  setIfIdle($('focal'), rnd(S.focal, 1));
  const fp = FOCAL_PRESETS.find(([v]) => Math.abs(v - S.focal) < .05); $('focalPreset').value = fp ? fp[0] : '';
  setIfIdle($('sensor'), rnd(S.sensorW, 1));
  const sp = SENSOR_PRESETS.find(([v]) => Math.abs(v - S.sensorW) < .05); $('sensorPreset').value = sp ? sp[0] : '';
  $('eq35').textContent = Math.round(k.eq) + ' mm';
  $('fovH').textContent = k.hfov.toFixed(2) + '°'; $('fovV').textContent = k.vfov.toFixed(2) + '°';
  $('focusD').textContent = mStr(S.dist) + ' · locked on ' + (S.focus.on && S.focus.target ? S.focus.target : 'subject');
  setIfIdle($('offX'), S.offX); setIfIdle($('offY'), S.offY);
  $('subjType').value = S.subjType; setIfIdle($('subjCount'), S.count); setIfIdle($('subjCm'), S.subjCm); setIfIdle($('subjColor'), S.subjColor || '#e85d2b'); setIfIdle($('subjDesc'), S.subjDesc);
  $('aspect').value = S.aspect; $('light').value = S.light; renderBgOpts();
  $('bgAdd').hidden = S.bg !== 'custom'; $('lightAdd').hidden = S.light !== 'custom' || S.lightOn;
  $('bgCustom').hidden = S.bg !== 'custom'; setIfIdle($('bgCustom'), S.bgCustom); setIfIdle($('extra'), S.extra);
  $('aspectCustom').hidden = S.aspect !== 'custom'; setIfIdle($('aspectCustom'), S.aspectCustom);
  $('lightCustom').hidden = S.light !== 'custom' || S.lightOn; setIfIdle($('lightCustom'), S.lightCustom);
  $('light').disabled = S.lightOn; if ($('lightNote')) $('lightNote').hidden = true;
  $('descPin').setAttribute('aria-pressed', S.descPinned);
  $('descPin').textContent = S.descPinned ? '✓ In prompt' : 'Add to prompt';
  $('descPin').title = S.descPinned ? 'Click to remove the description from the prompt' : 'Click to keep this description in the prompt';
  renderKeys();
  renderImgPresets();
  renderRefBg();
  syncFocus();
  syncLight();
  document.querySelectorAll('input[type=range]').forEach(fill);
  DD.forEach((d, sel) => refreshDD(sel));
  $('globeRO').textContent = `AZ ${Math.round(sa)}° · EL ${Math.round(S.el)}° · ${mStr(S.dist)}`;
  document.querySelectorAll('.view[id], .card.has-sw[id]').forEach(p => p.classList.toggle('min', !!S.min[p.id] && !p.closest('.tgroup')));
  syncCamXYZ();
  hooks.afterSync?.();
  fitPrompt();
}

const shortNote = t => t.length > 28 ? t.slice(0, 26).trim() + '…' : t;
// video mode: these two lead the key prompt list (they do not exist in image mode at all)
const VIDEO_FIRST = ['refguide', 'nocut'];
function keyList() {
  const list = KEYS.filter(k => !k.video || S.app === 'video');
  return S.app === 'video' ? [...VIDEO_FIRST.map(id => list.find(k => k.id === id)).filter(Boolean), ...list.filter(k => !VIDEO_FIRST.includes(k.id))] : list;
}
let keysKey = '';
function renderKeys() {
  const key = JSON.stringify(S.customKeys) + S.app + (S.descPinned ? '|' + S.subjDesc : '');
  if (key !== keysKey) { requestAnimationFrame(() => fitPrompt?.());
    keysKey = key;
    $('keys').innerHTML = keyList().map(k => `<button class="tog" data-k="${k.id}" aria-pressed="false">${k.name}</button>`).join('')
      + (S.descPinned && S.subjDesc.trim() ? `<button class="tog extra" data-k="__desc" aria-pressed="true" title="${escAttr(S.subjDesc.trim())}">${esc(shortNote('Subject: ' + S.subjDesc.trim()))}<span class="del" data-del="__desc" role="button" aria-label="Remove the subject description from the prompt" title="Remove from prompt">×</span></button>` : '')
      + S.customKeys.map(c => `<button class="tog extra y" data-k="${c.id}" aria-pressed="false" title="${escAttr(c.text)}">${esc(shortNote(c.text))}`
        + `<span class="del" data-del="${c.id}" role="button" aria-label="Delete note" title="Delete note">×</span></button>`).join('');
  }
  document.querySelectorAll('#keys button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === '__desc' || S.keys.includes(b.dataset.k)));
}

/* ---------- Image Mode Camera Presets (https://super3.github.io/camera-prompts/) ---------- */
function imgPresetStorageKey() {
  const u = hooks.authInfo?.()?.user;
  return 'anglecraft-img-presets-' + (u?.email ? u.email.toLowerCase() : 'local');
}
function loadUserImgPresets() {
  try { return JSON.parse(localStorage.getItem(imgPresetStorageKey()) || '[]'); } catch (e) { return []; }
}
function saveUserImgPresets(list) {
  try { localStorage.setItem(imgPresetStorageKey(), JSON.stringify(list)); } catch (e) {}
}
const minPresetGroups = new Set();
function renderImgPresets() {
  const box = $('imgPresetList'); if (!box) return;
  const groups = {};
  IMG_PRESETS.forEach(p => (groups[p.group] = groups[p.group] || []).push(p));
  const custom = loadUserImgPresets();
  let html = Object.entries(groups).map(([g, ps]) => {
    const min = minPresetGroups.has(g);
    return `<div class="pgroup${min ? ' min' : ''}"><button type="button" class="psep-btn" data-pgrp="${escAttr(g)}" aria-expanded="${!min}"><span>${esc(g)}</span><i class="psep-arr">${min ? '▸' : '▾'}</i></button><div class="pgrid">`
      + ps.map(p => `<button type="button" class="pitem" data-ipreset="${escAttr(p.id)}" aria-pressed="${S.imgPresetId === p.id}" title="${escAttr(p.prompt)}">${esc(p.name)}</button>`).join('')
      + `</div></div>`;
  }).join('');
  if (custom.length) {
    const min = minPresetGroups.has('__custom');
    html += `<div class="pgroup${min ? ' min' : ''}"><button type="button" class="psep-btn" data-pgrp="__custom" aria-expanded="${!min}"><span>Saved to account</span><i class="psep-arr">${min ? '▸' : '▾'}</i></button><div class="pgrid">`
      + custom.map(c => `<div class="pitem-wrap"><button type="button" class="pitem custom" data-ipreset="${escAttr(c.id)}" aria-pressed="${S.imgPresetId === c.id}" title="${escAttr(c.prompt || c.name)}">${esc(c.name)}</button><button type="button" class="pdel" data-ipdel="${escAttr(c.id)}" title="Delete preset" aria-label="Delete ${escAttr(c.name)}">×</button></div>`).join('')
      + `</div></div>`;
  }
  box.innerHTML = html;
  const activeDef = IMG_PRESETS.find(p => p.id === S.imgPresetId) || custom.find(c => c.id === S.imgPresetId);
  if ($('imgPresetDesc')) $('imgPresetDesc').textContent = activeDef ? activeDef.prompt : 'Select a famous camera shot preset to set the camera & lens and enrich the prompt.';
}
function applyImgPreset(id) {
  if (S.imgPresetId === id) {
    S.imgPresetId = ''; S.imgPresetPrompt = '';
    changed(); toast('Camera preset cleared'); return;
  }
  const p = IMG_PRESETS.find(x => x.id === id) || loadUserImgPresets().find(x => x.id === id);
  if (!p) return;
  S.imgPresetId = p.id;
  S.imgPresetPrompt = p.prompt || `${p.name} camera shot.`;
  if (isFinite(p.az)) setAz(p.az);
  if (isFinite(p.el)) setEl(p.el);
  if (isFinite(p.roll)) S.roll = p.roll;
  if (isFinite(p.focal)) setFocal(p.focal);
  if (isFinite(p.aperture)) S.aperture = p.aperture;
  if (p.dof !== undefined) S.dof = !!p.dof;
  if (isFinite(p.dist)) setDist(p.dist);
  else if (isFinite(p.shotIdx)) setDist(distForShot(p.shotIdx));
  changed();
  toast(`Preset: ${p.name}`);
}

/* ---------- change pipeline ---------- */
const hooks = {};
// camera world position = aim point + orbit offset
function camWorldNow() {
  const T = rigTarget(), a = rad(S.az), e = rad(S.el);
  return {x:T.x + Math.sin(a) * Math.cos(e) * S.dist, y:T.y + Math.sin(e) * S.dist, z:T.z + Math.cos(a) * Math.cos(e) * S.dist};
}
function syncCamXYZ() { const p = camWorldNow(); setIfIdle($('camX'), rnd(p.x, 2)); setIfIdle($('camY'), rnd(p.y, 2)); setIfIdle($('camZ'), rnd(p.z, 2)); }
function setCamXYZ(x, y, z) {
  const T = rigTarget(), dx = x - T.x, dy = y - T.y, dz = z - T.z, d = Math.hypot(dx, dy, dz);
  if (!(d > 1e-4)) return;
  setDist(d); setEl(deg(Math.asin(clamp(dy / d, -1, 1)))); if (Math.hypot(dx, dz) > 1e-4) setAz(deg(Math.atan2(dx, dz)));
}
['camX', 'camY', 'camZ'].forEach(id => $(id).addEventListener('input', () => {
  const v = ['camX', 'camY', 'camZ'].map(i => parseFloat($(i).value));
  if (v.every(isFinite)) { setCamXYZ(...v); changed(); }
}));

/* ---------- undo / redo (Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z) ---------- */
const hist = {stack:[], i:-1, timer:0, restoring:false};
// tell the UI (timeline undo / redo buttons) what is possible; a queued change counts as undoable
function histUI() { hooks.histChanged?.(hist.i > 0 || !!hist.timer, hist.i < hist.stack.length - 1); }
function snapshot() {
  hist.timer = 0;
  const j = JSON.stringify(S);
  // skip identical states, and states that only differ in values the timeline recomputes (scrubbing, playback)
  if (hist.stack[hist.i] === j || (hist.i >= 0 && hooks.histSame?.(hist.stack[hist.i], j))) { histUI(); return; }
  hist.stack = hist.stack.slice(0, hist.i + 1); hist.stack.push(j);
  if (hist.stack.length > 120) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  histUI();
}
function queueSnapshot() { if (hist.restoring) return; clearTimeout(hist.timer); hist.timer = setTimeout(snapshot, 350); histUI(); }
function restore(j) {
  hist.restoring = true;
  const v = JSON.parse(j);
  hooks.beforeRestore?.(v);
  Object.keys(S).forEach(k => delete S[k]); Object.assign(S, v);
  hooks.restored?.();
  if ((document.body.classList.contains('video') ? 'video' : 'image') !== S.app) applyLayout(); else { renderDock(); afterLayout(); }
  changed();
  setTimeout(() => { hist.restoring = false; }, 0);
}
function flushSnapshot() { if (hist.timer) { clearTimeout(hist.timer); snapshot(); } }
function undo() {
  if (hooks.historyBlocked?.()) return;
  flushSnapshot();
  if (hist.i > 0) { hist.i--; restore(hist.stack[hist.i]); toast('Undo'); } else toast('Nothing to undo');
  histUI();
}
function redo() {
  if (hooks.historyBlocked?.()) return;
  flushSnapshot();
  if (hist.i < hist.stack.length - 1) { hist.i++; restore(hist.stack[hist.i]); toast('Redo'); } else toast('Nothing to redo');
  histUI();
}
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (e.target.closest?.('input[type=text], textarea, [contenteditable]')) return;
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
});
let rafId = 0, lastObj = null, quiet = false;
function changed() {
  enforce();
  if (!quiet) { hooks.onChange?.(); queueSnapshot(); }
  save();
  if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; syncUI(); drawAll(); hooks.render?.(); });
  if (lastObj) { $('status').textContent = 'Settings changed · generate again'; $('status').classList.add('stale'); }
}
// apply values without treating them as user edits (used by the timeline)
function applyQuiet(fn) { quiet = true; try { fn(); } finally { quiet = false; } changed(); }

/* ---------- reference images + AI detection ---------- */
function sampleThumb() {
  const c = document.createElement('canvas'); c.width = c.height = 160; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 160); gr.addColorStop(0, '#4b5563'); gr.addColorStop(1, '#1f2937');
  g.fillStyle = gr; g.fillRect(0, 0, 160, 160);
  g.fillStyle = '#e5c9a8'; g.beginPath(); g.arc(80, 58, 24, 0, 7); g.fill();
  g.fillStyle = '#d6b48a'; g.beginPath(); g.ellipse(80, 150, 52, 62, 0, Math.PI, 0); g.fill();
  g.fillStyle = '#3b2a20'; g.beginPath(); g.arc(80, 50, 25, Math.PI * 1.05, Math.PI * 1.95); g.fill();
  return c.toDataURL();
}
const SAMPLE_SRC = sampleThumb();
const sampleImg = new Image(); sampleImg.onload = () => drawAll(); sampleImg.src = SAMPLE_SRC;
function currentThumb() {
  const r = (S.focus.on && refs[S.focus.img]) || refs[0];
  return r && r.img.complete && r.img.naturalWidth ? r.img : sampleImg;
}
const FOCUS_PALETTE = ['#e85d2b', '#3fb950', '#3f7cf6', '#d4a72c', '#a371f7', '#2bb3c0', '#f78fb3', '#f97316', '#22c55e', '#60a5fa'];
// global numbering: Person 1, Person 2, Product 1 … across every reference image
function allSubjects() {
  const counts = {}, out = [];
  refs.forEach((r, ri) => (r.subjects.length ? r.subjects : [{type:S.subjType, desc:'', cm:S.subjCm}]).forEach((s, si) => {
    const t = s.type || 'auto'; counts[t] = (counts[t] || 0) + 1;
    const label = `${TYPE_NAME[t]} ${counts[t]}`;
    const uiColor = s.uiColor || FOCUS_PALETTE[out.length % FOCUS_PALETTE.length];
    out.push({...s, type:t, label, uiColor, key:`img${ri}_s${si}`, img:ri, idx:si});
  }));
  if (!refs.length) {
    for (let i = 0; i < S.count; i++) {
      const t = S.types[i] || S.subjType; counts[t] = (counts[t] || 0) + 1;
      const label = `${TYPE_NAME[t]} ${counts[t]}`;
      const uiColor = FOCUS_PALETTE[i % FOCUS_PALETTE.length];
      const w = Math.min(.62, .75 / Math.max(1, S.count)), x = clamp((i + .5) / Math.max(1, S.count) - w / 2, .05, .95 - w);
      const box = {x, y:.12, w, h:.76};
      out.push({
        type:t, desc:`${label} (${TYPE_NAME[t].toLowerCase()}), front view`,
        detail:`${label}: ${TYPE_NAME[t].toLowerCase()} in frame, front-facing view, approx ${S.subjCm} cm.`,
        cm:S.subjCm, label, uiColor, box, boxes:[box], key:`def_s${i}`, img:-1, idx:i
      });
    }
  }
  return out;
}
function updateAutoDescription(force = false) {
  if (!refs.length) return;
  if (S.descUserEdited && !force) return;
  const r = refs[S.focus.img] || refs[0];
  if (r?.det && window.VPDetect?.buildSceneParagraph) {
    const isMulti = S.focus.on && S.focus.mode === 'multi';
    const selectedKey = isMulti ? (S.focus.multiSel || '') : '';
    const para = window.VPDetect.buildSceneParagraph(r.det, {isMulti, selectedKey, customSubjects:currentImgSubjects()});
    if (para) {
      S.subjDesc = para;
      setIfIdle($('subjDesc'), S.subjDesc);
      return;
    }
  }
  const all = allSubjects();
  const withDesc = all.filter(s => s.desc);
  if (withDesc.length) {
    S.subjDesc = all.length > 1 ? withDesc.map(s => `${s.label}: ${s.desc}.`).join(' ') : (all[0].detail || all[0].desc || '');
    setIfIdle($('subjDesc'), S.subjDesc);
  } else if (refs.every(x => x.status === 'fail')) {
    S.subjDesc = '';
    setIfIdle($('subjDesc'), '');
  }
}
function applySummary(forceDesc = false) {
  if (!refs.length) return;
  const all = allSubjects();
  const main = all.reduce((a, s) => (s.area || 0) > (a.area || 0) ? s : a, all[0]);
  S.count = all.length; S.types = all.map(s => s.type); S.subjType = main.type;
  if (main.color) S.subjColor = main.color;
  const hs = all.map(s => s.cm).filter(h => isFinite(h) && h > 0);
  S.subjCm = hs.length ? Math.round(Math.max(...hs)) : SUBJ[S.subjType].cm;
  updateAutoDescription(forceDesc);
  S.refView = refs[0].view || 'front';
  if (S.refBg >= refs.length) S.refBg = 0;
  if (S.focus.img >= refs.length) S.focus.img = 0;
  // Auto-populate single-mode detail if empty
  if (!S.focus.desc && main) {
    S.focus.desc = main.detail || `${main.label}: ${main.desc || TYPE_NAME[main.type]}`;
    S.focus.lastPointKey = main.key;
  }
}

let sampleFn = null;
const sampleReady = (async () => { try { sampleFn = window.claude ? await window.claude.use('sample') : null; } catch (e) { sampleFn = null; } return sampleFn; })();
async function canSeeImages() {
  await sampleReady;
  if (!sampleFn) return false;
  try { const lim = await sampleFn.limits(); return !!lim.images; } catch (e) { return false; }
}
function setDetect() { /* #detect text stays hidden per user request */ }
const DETECT_PROMPT = 'This image is a reference photo for an AI tool that re-renders the same subjects from a new camera angle. '
  + 'Identify every main subject (people, products, animals, vehicles or objects that are the focus; ignore background items). Reply with only one JSON object, no other text: '
  + '{"count": number of main subjects, '
  + '"subjects": [one entry per main subject, left to right: {"type": one of "person","product","phone","car","object","animal","vehicle","other" (use "phone" for any mobile phone and "car" for any car), '
  + '"description": English description in at most 20 words (what it is, key colors, materials, clothing or branding, and its position such as "on the left"), '
  + '"height_cm": realistic real-world height in centimeters (number)}], '
  + '"view": which side of the main subject faces the camera, one of "front","back","left","right","top","three-quarter"}.';
const TYPE_MAP = {person:'person', product:'product', phone:'phone', smartphone:'phone', car:'car', object:'object', animal:'animal', vehicle:'vehicle', other:'auto'};
const queue = [];
let busyDetect = false, detectFailMsg = '';
async function runQueue() {
  if (busyDetect) return;
  busyDetect = true;
  while (queue.length) {
    const ref = queue.shift();
    if (!refs.includes(ref)) continue;
    await detectRef(ref);
  }
  busyDetect = false;
}
function mapDetSubjects(det) {
  return (det?.subjects || []).slice(0, 20).map((s, idx) => ({
    type:s.type, category:s.category || (window.VPDetect?.categoryOf ? window.VPDetect.categoryOf(s.type) : 'Product/Object'),
    cls:s.cls, subtype:s.subtype || '', desc:s.desc, detail:s.detail, richSentence:s.richSentence || '',
    angle:s.angle, pose:s.pose, finish:s.finish, condition:s.condition,
    position:s.position, horiz:s.horiz, vert:s.vert, depth:s.depth, cm:s.cm, color:s.color || null, colorName:s.colorName || null,
    uiColor:s.uiColor || FOCUS_PALETTE[idx % FOCUS_PALETTE.length],
    box:s.box || {x:.15, y:.1, w:.7, h:.8},
    boxes:s.boxes && s.boxes.length ? s.boxes : [s.box || {x:.15, y:.1, w:.7, h:.8}],
    parts:s.parts || null, partNames:s.partNames || null, area:(s.box?.w || .5) * (s.box?.h || .5)
  }));
}
function setDescLoading(loading) {
  const st = $('descStatus');
  if (!st) return;
  if (loading) st.innerHTML = '<span class="spin"></span> Analyzing image details…';
  else if (st.textContent.includes('Analyzing')) st.textContent = '';
}
async function detectRef(ref, opts = {}) {
  ref.status = 'busy';
  setDescLoading(true);
  renderRefs();
  try {
    if (!window.VPDetect) throw new Error('detector script missing');
    await ref.ready;
    if (!refs.includes(ref)) { setDescLoading(false); return; }
    const det = await window.VPDetect.analyze(ref.img);
    window.VPDetectLoaded = true;
    if (!refs.includes(ref)) { setDescLoading(false); return; }
    ref.det = det;
    ref.subjects = mapDetSubjects(det);
    ref.view = VIEW_TEXT[det.view] ? det.view : 'front';
    ref.status = 'ok';
  } catch (e) {
    console.warn('Local detection failed', e);
    if (await canSeeImages()) return detectRefAI(ref, opts);
    ref.status = 'fail';
    ref.subjects = [];
    detectFailMsg = 'Could not run the detector. Set the subject type below.';
  }
  setDescLoading(false);
  if (ref.status === 'ok') applySummary(!!opts.forceDesc);
  else if (!S.descUserEdited && refs.every(x => x.status === 'fail')) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
  focusKey = ''; renderRefs(); hooks.refsChanged?.(); changed();
}
async function detectRefAI(ref, opts = {}) {
  if (!(await canSeeImages())) {
    ref.status = 'fail'; setDescLoading(false);
    if (!S.descUserEdited && refs.every(x => x.status === 'fail')) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
    renderRefs(); hooks.refsChanged?.(); changed(); return;
  }
  ref.status = 'busy'; setDescLoading(true); renderRefs();
  try {
    const r = await sampleFn.json(DETECT_PROMPT, {images:[ref.file], modelTier:'quick'});
    if (!refs.includes(ref)) { setDescLoading(false); return; }
    const subs = (Array.isArray(r?.subjects) ? r.subjects : [r]).filter(x => x && typeof x === 'object').slice(0, 20);
    if (!subs.length) throw {code:'invalid_json'};
    ref.subjects = subs.map((x, idx) => {
      const t = TYPE_MAP[String(x.type || '').toLowerCase()] || 'auto';
      const h = Number(x.height_cm);
      const desc = String(x.description || '').trim().slice(0, 200);
      const w = Math.min(.65, .8 / Math.max(1, subs.length)), bx = clamp((idx + .5) / subs.length - w / 2, .04, .96 - w);
      const box = {x:bx, y:.1, w, h:.8};
      return {type:t, desc, detail:desc, cm: isFinite(h) && h > 0 ? Math.round(clamp(h, 1, 5000)) : SUBJ[t].cm,
        uiColor:FOCUS_PALETTE[idx % FOCUS_PALETTE.length], box, boxes:[box], area:w * .8};
    });
    const v = String(r?.view || '').toLowerCase(); ref.view = VIEW_TEXT[v] ? v : 'front';
    ref.status = 'ok';
  } catch (e) {
    ref.status = 'fail';
  }
  setDescLoading(false);
  if (ref.status === 'ok') applySummary(!!opts.forceDesc);
  else if (!S.descUserEdited && refs.every(x => x.status === 'fail')) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
  focusKey = ''; renderRefs(); hooks.refsChanged?.(); changed();
}
function renderRefs() {
  const subs = allSubjects();
  $('refGrid').innerHTML = refs.map((r, i) => {
    const labs = subs.filter(s => s.img === i).map(s => s.label).join(', ');
    return `<div class="reftile"><img src="${r.src}" alt="Reference ${i + 1}"><span class="num">${i + 1}</span>`
      + `<button class="x" data-rm="${r.id}" aria-label="Remove image ${i + 1}" title="Remove image"><svg viewBox="0 0 12 12"><path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`
      + (r.status === 'busy' ? '<span class="busy"><span class="spin"></span></span>' : '')
      + `<span class="lab" title="${escAttr(labs)}">${esc(r.status === 'busy' ? 'Detecting…' : labs || 'Subject')}${r.alpha ? ' · PNG' : ''}</span></div>`;
  }).join('') + `<label class="addtile" id="addTile" for="file"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${refs.length ? 'Add more' : 'Add images'}</label>`;
  const add = $('addTile');
  ['dragenter', 'dragover'].forEach(t => add.addEventListener(t, e => { e.preventDefault(); add.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => add.addEventListener(t, e => { e.preventDefault(); add.classList.remove('over'); }));
  add.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  renderRefBg(true);
  focusKey = ''; syncFocus();
}
// does a PNG/WebP actually use transparency? (sampled)
function hasAlpha(img) {
  try {
    const c = document.createElement('canvas'), w = c.width = Math.min(64, img.naturalWidth), h = c.height = Math.min(64, img.naturalHeight);
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
  } catch (e) {}
  return false;
}
let refId = 0;
function addFiles(list) {
  const arr = [...(list || [])].filter(Boolean);
  const files = arr.filter(f => f.type && f.type.startsWith('image/'));
  if (!files.length) { toast('Choose image files (JPG, PNG or WebP)'); return; }
  // New image upload allows AI auto-description to populate #subjDesc (Part 7), without auto-pinning
  S.descUserEdited = false;
  S.focus.desc = '';
  setDescLoading(true);
  files.slice(0, 12).forEach(file => {
    const ref = {id:'r' + (++refId), file, src:'', img:new Image(), name:file.name || `pasted-${refId}.png`, status:'wait', subjects:[], view:'front', alpha:false};
    ref.ready = new Promise((res, rej) => { ref.img.addEventListener('load', res, {once:true}); ref.img.addEventListener('error', rej, {once:true}); });
    ref.ready.catch(() => {});
    refs.push(ref);
    const fr = new FileReader();
    fr.onload = () => {
      ref.src = fr.result;
      ref.img.onload = () => { ref.alpha = /png|webp|gif/i.test(file.type) && hasAlpha(ref.img); renderRefs(); drawAll(); hooks.refsChanged?.(); };
      ref.img.src = fr.result; renderRefs();
    };
    fr.readAsDataURL(file);
    queue.push(ref);
  });
  renderRefs(); runQueue();
}
function removeRef(id) {
  const i = refs.findIndex(r => r.id === id); if (i < 0) return;
  refs.splice(i, 1);
  if (Array.isArray(S.focus.subjectItems)) {
    S.focus.subjectItems = S.focus.subjectItems.filter(it => it.img !== i).map(it => it.img > i ? {...it, img:it.img - 1} : it);
    S.focus.activeSubjs = (Array.isArray(S.focus.activeSubjs) ? S.focus.activeSubjs : []).filter(k => S.focus.subjectItems.some(it => it.key === k));
    S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
    if (!S.focus.activeSubjs.length) { S.focus.target = ''; S.focus.singleActive = false; }
  }
  S.focus.multiEdits = {}; S.focus.multiSel = ''; S.focus.multiEditOpen = false;
  if (S.focus.img >= refs.length) S.focus.img = Math.max(0, refs.length - 1);
  if (S.refBg >= refs.length) S.refBg = 0;
  if (!refs.length) {
    S.count = 1; S.types = []; S.refView = 'front';
    S.focus.subjectItems = []; S.focus.activeSubj = ''; S.focus.activeSubjs = []; S.focus.target = ''; S.focus.singleActive = false;
    if (!S.descUserEdited) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
  } else applySummary();
  renderRefs(); hooks.refsChanged?.(); changed();
  if (!busyDetect) runQueue();
}
function renderRefBg(force) {
  const key = refs.length + ':' + S.refBg;
  $('refBgField').hidden = refs.length < 2;
  if (key === refBgKey && !force) return;
  refBgKey = key;
  $('refBg').innerHTML = refs.map((r, i) => `<option value="${i}">Image ${i + 1}</option>`).join('') + '<option value="-1">Output background setting</option>';
  $('refBg').value = String(S.refBg);
  refreshDD($('refBg'));
}

/* ---------- focus point (Single Mode + Multiple Mode + Focus Subject) ---------- */
function currentImgSubjects() {
  const all = allSubjects();
  const list = refs.length ? all.filter(s => s.img === S.focus.img) : all;
  return list.map((s, idx) => {
    const key = s.key || `img${S.focus.img}_s${idx}`;
    const subjHex = s.color || null;
    const color = s.uiColor || FOCUS_PALETTE[idx % FOCUS_PALETTE.length];
    const box = s.box || {x:.15, y:.1, w:.7, h:.8};
    const boxes = s.boxes && s.boxes.length ? s.boxes : [box];
    const category = s.category || (window.VPDetect?.categoryOf ? window.VPDetect.categoryOf(s.type) : 'Product/Object');
    const baseDetail = s.detail || (s.desc ? `${s.label} (${category}): ${s.desc}.` : `${s.label} (${category}), approx ${s.cm || SUBJ[s.type]?.cm || 100} cm.`);
    const edited = S.focus.multiEdits && S.focus.multiEdits[key];
    return {...s, key, subjHex, color, category, box, boxes, baseDetail, detail: edited !== undefined ? edited : baseDetail};
  });
}
function selectMultiSubject(key, toggleIfSame = true, openEditor = true) {
  const subs = currentImgSubjects();
  if (toggleIfSame && S.focus.multiSel === key && (!openEditor || S.focus.multiEditOpen)) {
    S.focus.multiSel = '';
    S.focus.multiEditOpen = false;
  } else {
    S.focus.multiSel = key;
    S.focus.multiEditOpen = openEditor;
    S.focus.on = true;
    const sel = subs.find(s => s.key === key);
    if (sel) {
      S.focus.target = sel.label;
      S.focus.x = clamp((sel.box?.x || .15) + (sel.box?.w || .7) / 2, 0, 1);
      S.focus.y = clamp((sel.box?.y || .1) + (sel.box?.h || .8) / 2, 0, 1);
    }
  }
  focusKey = '';
  changed();
}
function syncFocus() {
  S.focus.mode = S.focus.mode === 'multi' ? 'multi' : 'single';
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.subjectItems = Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : [];
  if (!Array.isArray(S.focus.activeSubjs)) {
    S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
  }
  S.focus.activeSubjs = S.focus.activeSubjs.filter(k => S.focus.subjectItems.some(it => it.key === k));
  S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
  S.focus.zoom = clamp(+S.focus.zoom || 1, 1, 8);
  $('pFocus').classList.toggle('off', !S.focus.on);
  $('focusOn').setAttribute('aria-checked', S.focus.on);
  $('detailOn').setAttribute('aria-checked', !!S.focus.detail); $('detailRow').hidden = !S.focus.detail;
  $('detailZoom').setAttribute('aria-pressed', !!S.focus.zoomLocked);
  setIfIdle($('detailCm'), S.focus.detailCm);
  $('fZoom').value = S.focus.zoom; $('fZoomV').textContent = S.focus.zoom + '×';
  setIfIdle($('focusDesc'), S.focus.desc);
  const isMulti = S.focus.mode === 'multi';
  $('fModeSingle').setAttribute('aria-pressed', !isMulti);
  $('fModeMulti').setAttribute('aria-pressed', isMulti);
  $('focusSinglePane').hidden = isMulti;
  $('focusMultiPane').hidden = !isMulti;
  $('focusBoxes').hidden = !isMulti;
  const singleOn = !!(S.focus.on && !isMulti && S.focus.singleActive && S.focus.desc.trim());
  $('focusIntoSubjSingle').setAttribute('aria-pressed', singleOn);
  $('focusIntoSubjSingle').textContent = singleOn ? '✓ In Subject' : 'Into Subject';
  const imgSubs = currentImgSubjects();
  const key = refs.map(r => r.id + r.status).join() + '|' + S.focus.img + '|' + S.subjType + '|' + S.count + '|'
    + imgSubs.map(s => s.key + s.label + s.color + s.detail).join() + '|' + S.focus.mode + '|' + S.focus.multiSel + '|'
    + (S.focus.multiEditOpen ? '1' : '0') + '|' + (S.focus.singleActive ? '1' : '0') + '|'
    + JSON.stringify(S.focus.subjectItems) + '|' + JSON.stringify(S.focus.activeSubjs);
  if (key !== focusKey) {
    focusKey = key;
    $('focusTabs').innerHTML = refs.length > 1 ? refs.map((r, i) => `<button data-fimg="${i}" aria-pressed="${i === S.focus.img}">Image ${i + 1}</button>`).join('') : '';
    const r = refs[S.focus.img];
    const wantSrc = r ? r.src : SAMPLE_SRC;
    if ($('focusPic').getAttribute('src') !== wantSrc) $('focusPic').src = wantSrc;
    if ($('focusHint')) $('focusHint').textContent = isMulti
      ? 'Click a subject button or bounding box to make it the Main Subject and edit its details.'
      : 'Click or drag on the image to aim the focus point.';
    // Multiple Mode: individual subject buttons below Focus Detail
    $('focusDetList').innerHTML = imgSubs.map(s => {
      const isSelected = S.focus.multiSel === s.key || (!S.focus.multiSel && isMulti && S.focus.activeSubjs.includes(s.key));
      return `<button type="button" class="tog fdet-btn" data-fdet="${escAttr(s.key)}" aria-pressed="${isSelected}" style="--sc:${escAttr(s.color)}" title="${escAttr(s.label + ' (' + s.category + ') — click to select as Main Subject')}"><i class="sdot" style="background:${escAttr(s.color)}"></i><span>${esc(s.label)}</span></button>`;
    }).join('');
    const selSub = imgSubs.find(s => s.key === S.focus.multiSel);
    $('focusMultiEditWrap').hidden = !(selSub && S.focus.multiEditOpen);
    if (selSub && S.focus.multiEditOpen) {
      $('focusMultiEditLbl').textContent = `${selSub.label} (${selSub.category}) — Main Subject details`;
      setIfIdle($('focusMultiText'), selSub.detail);
    }
    // Focus Subject subsection: individual colored buttons with × remove (supports independent multiple selection)
    if (S.focus.subjectItems.length) {
      $('focusSubjList').innerHTML = S.focus.subjectItems.map(item =>
        `<button type="button" class="tog fsubj" data-fsub="${escAttr(item.key)}" aria-pressed="${S.focus.activeSubjs.includes(item.key)}" style="--sc:${escAttr(item.color)}" title="${escAttr(item.detail || item.label)}"><i class="sdot" style="background:${escAttr(item.color)}"></i><span>${esc(item.label)}</span><span class="del" data-fsubdel="${escAttr(item.key)}" role="button" aria-label="Remove ${escAttr(item.label)}" title="Remove">×</span></button>`
      ).join('');
    } else {
      $('focusSubjList').innerHTML = '<span class="hint fsubj-empty">Use "Into Subject" above to add subjects here.</span>';
    }
  }
  placeMark();
}
// Preview zoom: works independently without requiring Zoom to Detail (Macro) to be enabled
let fz = {tx:0, ty:0, z:1}, focusDrag = false;
function fitFocusPic() {
  const box = $('focusImg'), img = $('focusPic'), pFocus = $('pFocus');
  if (!box || !img) return;
  if (pFocus && window.innerWidth > 820) {
    const bh = box.offsetHeight;
    if (bh > 0) {
      const w43 = Math.round(bh * 4 / 3) + 'px';
      if (pFocus.style.getPropertyValue('--fbox-w') !== w43) pFocus.style.setProperty('--fbox-w', w43);
    }
  } else if (pFocus && pFocus.style.getPropertyValue('--fbox-w')) {
    pFocus.style.removeProperty('--fbox-w');
  }
  const hasRef = Boolean(refs[S.focus.img]);
  const nw = img.naturalWidth || 0, nh = img.naturalHeight || 0;
  if (!hasRef || !nw || !nh) {
    if (img.hasAttribute('data-fit')) img.removeAttribute('data-fit');
    return;
  }
  const bw = box.clientWidth || 392, bh = box.clientHeight || 294;
  const wantFit = (nw / nh) >= (bw / bh) - 1e-4 ? 'width' : 'height';
  if (img.dataset.fit !== wantFit) img.dataset.fit = wantFit;
}
function previewZoom() {
  const img = $('focusPic');
  if (focusDrag) return;
  const W = img.clientWidth, H = img.clientHeight;
  const z = clamp(+S.focus.zoom || 1, 1, 8);
  if (!S.focus.on || z <= 1 || !W) fz = {tx:0, ty:0, z:1};
  else {
    fz = {z, tx:clamp(W / 2 - S.focus.x * W * z, W - W * z, 0), ty:clamp(H / 2 - S.focus.y * H * z, H - H * z, 0)};
  }
  img.style.transformOrigin = '0 0';
  img.style.transform = fz.z === 1 ? '' : `translate(${fz.tx}px, ${fz.ty}px) scale(${fz.z})`;
}
function placeBoxes() {
  const img = $('focusPic'), wrap = $('focusBoxes');
  if (!wrap) return;
  if (S.focus.mode !== 'multi' || !img.clientWidth || !img.clientHeight) { wrap.hidden = true; return; }
  wrap.hidden = false;
  const subs = currentImgSubjects();
  const ox = img.offsetLeft + fz.tx, oy = img.offsetTop + fz.ty, W = img.clientWidth * fz.z, H = img.clientHeight * fz.z;
  wrap.innerHTML = subs.map(s => (s.boxes || [s.box]).map((b, bi) => {
    const l = Math.round(ox + clamp(b.x, 0, .98) * W), t = Math.round(oy + clamp(b.y, 0, .98) * H);
    const w = Math.max(14, Math.round(clamp(b.w, .04, 1 - b.x) * W)), h = Math.max(14, Math.round(clamp(b.h, .04, 1 - b.y) * H));
    const isAct = S.focus.multiSel === s.key || (Array.isArray(S.focus.activeSubjs) && S.focus.activeSubjs.includes(s.key));
    const tagStyle = t < 15 ? ';--tag-top:2px' : '';
    return `<div class="fbox${isAct ? ' act' : ''}" data-fdet="${escAttr(s.key)}" title="${escAttr(s.label + ' (' + s.category + ')')}" style="left:${l}px;top:${t}px;width:${w}px;height:${h}px;--sc:${escAttr(s.color)}${tagStyle}">${bi === 0 ? `<span class="fbox-tag">${esc(s.label)}</span>` : ''}</div>`;
  }).join('')).join('');
}
function placeMark() {
  fitFocusPic();
  const img = $('focusPic'), m = $('focusMark');
  if (!img.clientWidth) { m.hidden = true; return; }
  previewZoom();
  placeBoxes();
  m.hidden = S.focus.mode === 'multi';
  m.style.left = (img.offsetLeft + fz.tx + S.focus.x * img.clientWidth * fz.z) + 'px';
  m.style.top = (img.offsetTop + fz.ty + S.focus.y * img.clientHeight * fz.z) + 'px';
}
let identifyCtl = null;
const FOCUS_HINT = 'Click or drag on the image to aim the focus point.';
function syncActiveSingleItem() {
  if (!S.focus.singleActive || !Array.isArray(S.focus.subjectItems)) return;
  const it = S.focus.subjectItems.find(x => x.key === S.focus.singleKey || x.isSinglePoint);
  if (it) {
    it.detail = (S.focus.desc || '').trim();
    it.x = S.focus.x;
    it.y = S.focus.y;
    if (S.focus.target) it.label = S.focus.target;
  }
}
// image mode: what is under the focus point? (local detector: subject + part + angle + position + color)
async function identifyAt(ref, x, y) {
  const subs = currentImgSubjects();
  if (window.VPDetect && ref?.det) {
    const info = window.VPDetect.pointInfo(ref.det, x, y);
    if (info) {
      const s = subs[info.index] || subs[0];
      if (s) { S.focus.target = s.label; S.focus.lastPointKey = s.key; }
      S.focus.note = info.part === 'background area' || info.part === 'background' ? 'background area' : info.part;
      S.focus.desc = info.fullDetail || (S.focus.note === 'background area'
        ? `Background area at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top${info.colorName ? ' (' + info.colorName + ')' : ''}.`
        : `${s ? s.label + ' — ' : ''}${cap(info.part)}${info.colorName ? ` (${info.colorName})` : ''}, ${info.where}.`);
      if (info.sizeCm && S.focus.detail) S.focus.detailCm = clamp(info.sizeCm, .5, 200);
      S.focus.detailAuto = info.sizeCm || null;
      if (S.focus.zoomLocked && S.focus.detail) zoomToDetail();
      syncActiveSingleItem();
      focusKey = '';
      changed(); return;
    }
  }
  if (subs.length) {
    const s = subs[0];
    S.focus.target = s.label;
    S.focus.lastPointKey = s.key;
    S.focus.note = `spot at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`;
    S.focus.desc = `${s.label} at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%: ${s.detail || s.desc || TYPE_NAME[s.type]}`;
    syncActiveSingleItem();
    focusKey = '';
    changed();
  }
}
// drag the focus point in Single Mode; in Multiple Mode clicking an outline box selects that subject as Main Subject
{
  const box = $('focusImg'), img = $('focusPic'); let on = false;
  const setFrom = e => {
    const b = box.getBoundingClientRect(), W = img.clientWidth * fz.z, H = img.clientHeight * fz.z;
    const left = b.left + box.clientLeft + img.offsetLeft + fz.tx, top = b.top + box.clientTop + img.offsetTop + fz.ty;
    S.focus.x = clamp((e.clientX - left) / W, 0, 1); S.focus.y = clamp((e.clientY - top) / H, 0, 1);
    placeMark();
  };
  box.addEventListener('pointerdown', e => {
    if (!S.focus.on || e.button !== 0) return;
    if (S.focus.mode === 'multi') {
      const fb = e.target.closest?.('[data-fdet]');
      if (fb) selectMultiSubject(fb.dataset.fdet, true, true);
      return;
    }
    e.preventDefault(); on = true; focusDrag = true; box.classList.add('dragging'); box.setPointerCapture(e.pointerId); setFrom(e);
  });
  box.addEventListener('pointermove', e => { if (on) setFrom(e); });
  const end = () => {
    if (!on) return; on = false; focusDrag = false; box.classList.remove('dragging'); changed();
    const ref = refs[S.focus.img]; identifyAt(ref, S.focus.x, S.focus.y);
  };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('dragstart', e => e.preventDefault());
}

/* ---------- lighting rig ---------- */
const getSetup = () => (LIGHTS[S.lightCat] || LIGHTS.person).find(l => l.id === S.lightSetup) || LIGHTS[S.lightCat][0];
const onLights = () => ROLES.filter(r => S.lights[r.id]?.on).map(r => ({...r, ...S.lights[r.id]}));
function syncLight() {
  $('pLight').classList.toggle('off', !S.lightOn);
  $('lightOn').setAttribute('aria-checked', S.lightOn);
  document.querySelectorAll('#lightCat button').forEach(b => b.setAttribute('aria-pressed', b.dataset.cat === S.lightCat));
  if (setupKey !== S.lightCat) {
    setupKey = S.lightCat;
    $('lightSetups').innerHTML = LIGHTS[S.lightCat].map(l => `<button class="tog" data-ls="${l.id}" aria-pressed="false">${l.name}</button>`).join('');
  }
  document.querySelectorAll('#lightSetups button').forEach(b => b.setAttribute('aria-pressed', b.dataset.ls === S.lightSetup));
  const st = getSetup(), n = onLights().length;
  $('lightDesc').textContent = st ? `${cap(st.text)}. ${n} light${n === 1 ? '' : 's'} on.` : '';
  $('lightRoles').innerHTML = ROLES.map(r => `<button class="role${S.lights[r.id].on ? ' on' : ''}" data-role="${r.id}" aria-pressed="${r.id === S.lightSel}" style="--c:${r.color}"><i></i>${r.name.replace(' light', '')}</button>`).join('');
  const L = S.lights[S.lightSel];
  $('lightSelName').textContent = roleName(S.lightSel);
  $('lightRoleOn').setAttribute('aria-checked', L.on);
  $('lkAz').value = Math.round(signed(L.az)); $('lkAzV').textContent = Math.round(signed(L.az)) + '°';
  $('lkEl').value = Math.round(L.el); $('lkElV').textContent = Math.round(L.el) + '°';
  $('lkPow').value = L.pow; $('lkPowV').textContent = Math.round(L.pow) + '%';
  $('lkK').value = L.k; $('lkKV').textContent = Math.round(L.k) + ' K';
  $('lkHard').value = L.hard; $('lkHardV').textContent = hardName(L.hard);
  drawDial();
}
function kelvinRGB(K) {
  const t = K / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * (t - 60) ** -.1332; g = 288.12 * (t - 60) ** -.0755; b = 255; }
  return [r, g, b].map(v => Math.round(clamp(v, 0, 255)));
}
let dialGeom = null;
const dialPos = (L, g) => { const a = rad(L.az), r = g.R * (1 - clamp(L.el, -30, 90) / 135); return [g.cx + Math.sin(a) * r, g.cy + Math.cos(a) * r]; };
function drawDial() {
  const c = $('lightDial'); if (!c || !C.fg) return;
  const {ctx, w, h} = fit(c);
  if (w < 40 || h < 40) return;
  const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 12;
  dialGeom = {cx, cy, R};
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  [1, .66, .33].forEach(f => { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, 7); ctx.stroke(); });
  ctx.fillStyle = C.muted; ctx.font = '9px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('FRONT', cx, cy + R + 7);
  ctx.fillStyle = C.fg; ctx.fillRect(cx - 6, cy - 6, 12, 12);
  const ca = rad(S.az), cr = R * .95;
  const camX = cx + Math.sin(ca) * cr, camY = cy + Math.cos(ca) * cr;
  drawCam(ctx, camX, camY, Math.atan2(cy - camY, cx - camX), 3.2, false);
  ROLES.forEach(r => {
    const L = S.lights[r.id]; if (!L.on && r.id !== S.lightSel) return;
    const [lx, ly] = dialPos(L, dialGeom), [kr, kg, kb] = kelvinRGB(L.k);
    ctx.globalAlpha = L.on ? 1 : .35;
    ctx.strokeStyle = `rgba(${kr},${kg},${kb},.7)`; ctx.setLineDash([3, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(cx, cy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = `rgb(${kr},${kg},${kb})`; ctx.strokeStyle = r.color; ctx.lineWidth = r.id === S.lightSel ? 3 : 2;
    ctx.beginPath(); ctx.arc(lx, ly, 4 + L.pow / 100 * 4, 0, 7); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
  });
}
function lightPhrase(L, camAz) {
  const rel = signed(L.az - camAz), ar = Math.abs(rel);
  const side = ar < 25 ? 'close to the camera axis (frontal)'
    : ar > 135 ? 'behind the subject, facing the camera'
    : `on camera-${rel > 0 ? 'right' : 'left'}${ar > 75 ? ' at the side' : ', angled toward the subject'}`;
  const ht = L.el > 60 ? 'high above' : L.el > 25 ? 'above head height' : L.el > 8 ? 'slightly above eye level' : L.el > -8 ? 'at eye level' : 'below the subject';
  const temp = L.k < 3500 ? 'warm tungsten' : L.k < 4800 ? 'warm neutral' : L.k < 6300 ? 'neutral daylight' : 'cool blue';
  const q = L.hard < 25 ? 'very soft and diffused' : L.hard < 45 ? 'soft' : L.hard < 65 ? 'medium-hard' : 'hard with crisp shadows';
  return `${side}, ${ht}, ${Math.round(L.pow)}% power, ${temp} (${Math.round(L.k)} K), ${q}`;
}
function rigText(camAz) {
  const st = getSetup(), ls = onLights();
  if (!ls.length) return `${st.name} lighting with every light switched off: rely on ambient light only.`;
  const key = S.lights.key.on ? S.lights.key : null, fill = S.lights.fill.on ? S.lights.fill : null;
  const ratio = key && fill && fill.pow > 0 ? ` Key-to-fill ratio about ${rnd(key.pow / fill.pow, 1)}:1.` : '';
  return `${st.name} lighting (${ls.length}-light setup): ${st.text}. ` + ls.map(l => `${l.name}: ${lightPhrase(l, camAz)}.`).join(' ') + ratio
    + ' Highlights, shadows and reflections must match this rig from the new camera angle.';
}

/* ---------- drawing ---------- */
const C = {};
function readTokens() {
  const cs = getComputedStyle(root);
  ['bg','panel','panel-2','line','fg','muted','accent','accent-ink','rig','ax-x','ax-y','ax-z','grid','grid-2','green'].forEach(n => C[n] = cs.getPropertyValue('--' + n).trim());
}
function fit(c) {
  const r = c.getBoundingClientRect(), d = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  const ctx = c.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
  return {ctx, w:r.width, h:r.height};
}
function drawThumb(ctx, x, y, w, h, r, img) {
  img = img || currentThumb();
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  if (img.complete && img.naturalWidth) {
    const ia = img.naturalWidth / img.naturalHeight, ba = w / h;
    let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    if (ia > ba) { sw = sh * ba; sx = (img.naturalWidth - sw) / 2; } else { sh = sw / ba; sy = (img.naturalHeight - sh) / 2; }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  } else { ctx.fillStyle = C.fg; ctx.fillRect(x, y, w, h); }
  ctx.restore();
  ctx.strokeStyle = C.fg; ctx.globalAlpha = .5; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.stroke(); ctx.globalAlpha = 1;
}
function drawCam(ctx, x, y, ang, u, reels, alpha = 1) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
  ctx.fillStyle = C.panel; ctx.strokeStyle = C.rig; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.rect(-2.5 * u, -.85 * u, 1.75 * u, 1.7 * u); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-.75 * u, -.4 * u); ctx.lineTo(0, -.75 * u); ctx.lineTo(0, .75 * u); ctx.lineTo(-.75 * u, .4 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
  if (reels) { [-2.05, -1.2].forEach(cx => { ctx.beginPath(); ctx.arc(cx * u, -1.35 * u, .48 * u, 0, 7); ctx.fill(); ctx.stroke(); }); }
  ctx.restore();
}
function drawFrustum(ctx, x, y, ux, uy, len, half) {
  const t = Math.tan(half), px = -uy, py = ux;
  const ex = x + ux * len, ey = y + uy * len;
  ctx.beginPath(); ctx.moveTo(x, y);
  ctx.lineTo(ex + px * len * t, ey + py * len * t); ctx.lineTo(ex - px * len * t, ey - py * len * t); ctx.closePath();
  ctx.fillStyle = C.rig; ctx.globalAlpha = .08; ctx.fill(); ctx.globalAlpha = .9;
  ctx.strokeStyle = C.rig; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.globalAlpha = .6; ctx.stroke(); ctx.globalAlpha = 1;
}
function drawArrow(ctx, h, active) {
  ctx.save(); ctx.translate(h.x, h.y);
  ctx.fillStyle = C.accent; ctx.globalAlpha = active ? 1 : .92;
  ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  ctx.rotate(Math.atan2(h.uy, h.ux)); ctx.fillStyle = C['accent-ink'];
  ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -4.5); ctx.lineTo(-3, 4.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function niceStep(t) { return [.005,.01,.02,.05,.1,.2,.25,.5,1,2,5,10,20,50].find(s => s >= t) || 100; }
function drawGrid(ctx, w, h, cx, cy, s, axH, axV, axHy = cy, axVx = cx) {
  const step = niceStep(32 / s), px = step * s;
  ctx.lineWidth = 1;
  for (let i = -Math.ceil(axVx / px); i <= Math.ceil((w - axVx) / px); i++) {
    ctx.strokeStyle = i % 5 ? C.grid : C['grid-2']; const x = Math.round(axVx + i * px) + .5;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = -Math.ceil(axHy / px); i <= Math.ceil((h - axHy) / px); i++) {
    ctx.strokeStyle = i % 5 ? C.grid : C['grid-2']; const y = Math.round(axHy + i * px) + .5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }
  ctx.globalAlpha = .75; ctx.lineWidth = 1.2;
  ctx.strokeStyle = axH; ctx.beginPath(); ctx.moveTo(0, Math.round(axHy) + .5); ctx.lineTo(w, Math.round(axHy) + .5); ctx.stroke();
  ctx.strokeStyle = axV; ctx.beginPath(); ctx.moveTo(Math.round(axVx) + .5, 0); ctx.lineTo(Math.round(axVx) + .5, h); ctx.stroke();
  ctx.globalAlpha = 1;
  return step;
}
const fmtStep = s => s < 1 ? Math.round(s * 1000) / 10 + ' cm' : s + ' m';
// the camera always aims at this world point (subject center, or the focused object in video mode)
function rigTarget() { return hooks.target?.() || {x:0, y:calc().subjH / 2, z:0}; }

/* globe */
const gC = $('globe');
function drawGlobe() {
  const {ctx, w, h} = fit(gC);
  if (w < 40 || h < 40) return;
  const cx = w / 2, cy = h / 2 + 4, R = Math.min(w, h) * .38;
  const p = rad(18), cp = Math.cos(p), sp = Math.sin(p);
  const P = (x, y, z) => [cx + x * R, cy - (y * cp - z * sp) * R, y * sp + z * cp];
  function curve(fn, t0, t1, n, color, wf, wb, aF, aB, dash) {
    const pts = []; for (let i = 0; i <= n; i++) pts.push(P(...fn(t0 + (t1 - t0) * i / n)));
    ctx.strokeStyle = color; ctx.setLineDash(dash || []);
    for (const front of [false, true]) {
      ctx.beginPath(); ctx.lineWidth = front ? wf : wb; ctx.globalAlpha = front ? aF : aB;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[i + 1];
        if ((a[2] + b[2] >= 0) === front) { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.setLineDash([]);
  }
  ctx.strokeStyle = C.muted; ctx.globalAlpha = .55; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  [-60, -30, 0, 30, 60].forEach(la => { const l = rad(la);
    curve(t => [Math.cos(l) * Math.sin(t), Math.sin(l), Math.cos(l) * Math.cos(t)], 0, Math.PI * 2, 72, C.muted, 1, 1, la === 0 ? .7 : .45, .14); });
  for (let lo = 0; lo < 180; lo += 30) { const l = rad(lo);
    curve(t => [Math.cos(t) * Math.sin(l), Math.sin(t), Math.cos(t) * Math.cos(l)], 0, Math.PI * 2, 72, C.muted, 1, 1, .45, .14); }
  const az = rad(S.az), el = rad(S.el);
  const sa = rad(signed(S.az));
  curve(t => [Math.sin(t), 0, Math.cos(t)], 0, sa, 48, C.accent, 2.4, 1.4, .95, .35);
  curve(t => [Math.cos(t) * Math.sin(az), Math.sin(t), Math.cos(t) * Math.cos(az)], 0, el, 32, C.accent, 2.4, 1.4, .95, .35);
  curve(t => [Math.cos(el) * Math.sin(t), Math.sin(el), Math.cos(el) * Math.cos(t)], 0, Math.PI * 2, 72, C.accent, 1, 1, .4, .12, [4, 4]);
  ctx.font = '500 10px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  [['FRONT', 0, 1.16], ['RIGHT', 1.2, 0], ['BACK', 0, -1.16], ['LEFT', -1.2, 0]].forEach(([t, x, z]) => {
    const q = P(x, 0, z); ctx.fillStyle = C.muted; ctx.globalAlpha = q[2] >= 0 ? .95 : .4; ctx.fillText(t, q[0], q[1]); });
  ctx.globalAlpha = 1;
  const cam = P(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  const ang = Math.atan2(cy - cam[1], cx - cam[0]);
  const behind = cam[2] < 0, u = 6.5 * (1 + .25 * cam[2]);
  const line = () => { ctx.strokeStyle = C.fg; ctx.globalAlpha = behind ? .4 : .9; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cam[0], cam[1]); ctx.stroke(); ctx.globalAlpha = 1; };
  const ts = Math.min(54, R * .45);
  if (behind) { line(); drawCam(ctx, cam[0], cam[1], ang, u, false, .55); }
  drawThumb(ctx, cx - ts / 2, cy - ts / 2, ts, ts, 10);
  if (!behind) { line(); drawCam(ctx, cam[0], cam[1], ang, u, false, 1); }
}

/* top & side views share an interaction model; both are centered on the camera target */
const views = {
  top: {c:$('top'), handles:[], cam:null, frozen:null},
  side:{c:$('side'), handles:[], cam:null, frozen:null}
};
function drawTop() {
  const v = views.top, {ctx, w, h} = fit(v.c), k = calc(), T = rigTarget();
  if (w < 40 || h < 40) return;
  const cx = w / 2, cy = h / 2, el = rad(S.el), hd = S.dist * Math.cos(el), az = rad(S.az);
  const ext = hooks.sceneExtent?.('top') ?? k.fp * .75;
  const s = v.frozen ?? (Math.min(w, h) / 2 - 48) / Math.max(hd, ext, .05);
  Object.assign(v, {cx, cy, s, T});
  const step = drawGrid(ctx, w, h, cx, cy, s, C['ax-x'], C['ax-z'], cy + T.z * s, cx - T.x * s);
  $('topScale').textContent = `grid ${fmtStep(step)} · ${mStr(hd)}`;
  if (hooks.drawTopScene?.(ctx, v)) { /* video scene drawn */ }
  else {
    const sz = Math.max(16, k.fp * s);
    drawThumb(ctx, cx - sz / 2, cy - sz / 2, sz, sz, 3);
    ctx.fillStyle = C.fg; ctx.beginPath(); ctx.moveTo(cx - 5, cy + sz / 2 + 4); ctx.lineTo(cx + 5, cy + sz / 2 + 4); ctx.lineTo(cx, cy + sz / 2 + 10); ctx.fill();
  }
  const px = cx + Math.sin(az) * hd * s, py = cy + Math.cos(az) * hd * s;
  let ux = cx - px, uy = cy - py, L = Math.hypot(ux, uy);
  if (L < 1) { ux = -Math.sin(az); uy = -Math.cos(az); } else { ux /= L; uy /= L; }
  drawFrustum(ctx, px, py, ux, uy, Math.max(L, 40), rad(k.hfov / 2));
  drawCam(ctx, px, py, Math.atan2(uy, ux), 7, false);
  const rx = -uy, ry = ux;
  v.cam = {x:px, y:py};
  v.handles = [
    {dir:'fwd', x:px + ux * 32, y:py + uy * 32, ux, uy},
    {dir:'back', x:px - ux * 38, y:py - uy * 38, ux:-ux, uy:-uy},
    {dir:'right', x:px + rx * 28 - ux * 10, y:py + ry * 28 - uy * 10, ux:rx, uy:ry},
    {dir:'left', x:px - rx * 28 - ux * 10, y:py - ry * 28 - uy * 10, ux:-rx, uy:-ry}
  ];
  v.handles.forEach(hd2 => drawArrow(ctx, hd2, drag && drag.view === v && drag.dir === hd2.dir));
}
function drawSide() {
  const v = views.side, {ctx, w, h} = fit(v.c), k = calc(), T = rigTarget();
  if (w < 40 || h < 40) return;
  const cx = w / 2 + 20, cy = h / 2, el = rad(S.el);
  const hd = S.dist * Math.cos(el), hy = S.dist * Math.sin(el);
  const ext = hooks.sceneExtent?.('side') ?? k.subjH * .6;
  const s = v.frozen ?? (Math.min(w, h) / 2 - 48) / Math.max(S.dist, ext, .05);
  Object.assign(v, {cx, cy, s, T});
  const groundY = cy + T.y * s;
  const step = drawGrid(ctx, w, h, cx, cy, s, C['ax-z'], C['ax-y'], groundY);
  $('sideScale').textContent = `grid ${fmtStep(step)} · height ${hy >= 0 ? '+' : '-'}${mStr(Math.abs(hy))}`;
  if (hooks.drawSideScene?.(ctx, v)) { /* video scene drawn */ }
  else {
    const sw = Math.max(12, k.fp * s), sh = Math.max(16, k.subjH * s);
    drawThumb(ctx, cx - sw / 2, groundY - sh, sw, sh, 3);
  }
  const px = cx - hd * s, py = cy - hy * s;
  let ux = cx - px, uy = cy - py; const L = Math.hypot(ux, uy); ux /= L || 1; uy /= L || 1;
  drawFrustum(ctx, px, py, ux, uy, Math.max(L, 40), rad(k.vfov / 2));
  drawCam(ctx, px, py, Math.atan2(uy, ux), 7, true);
  const upx = uy, upy = -ux;
  v.cam = {x:px, y:py};
  v.handles = [
    {dir:'fwd', x:px + ux * 32, y:py + uy * 32, ux, uy},
    {dir:'back', x:px - ux * 40, y:py - uy * 40, ux:-ux, uy:-uy},
    {dir:'up', x:px + upx * 30 - ux * 10, y:py + upy * 30 - uy * 10, ux:upx, uy:upy},
    {dir:'down', x:px - upx * 26 - ux * 10, y:py - upy * 26 - uy * 10, ux:-upx, uy:-upy}
  ];
  v.handles.forEach(hd2 => drawArrow(ctx, hd2, drag && drag.view === v && drag.dir === hd2.dir));
}
function drawAll() { readTokens(); drawGlobe(); drawTop(); drawSide(); drawDial(); }

/* ---------- rig interaction (no scroll-zoom here: in video mode the camera view zooms) ---------- */
const STEP = {
  top:{fwd:() => setDist(S.dist * .93), back:() => setDist(S.dist / .93), left:() => setAz(S.az - 3), right:() => setAz(S.az + 3)},
  side:{fwd:() => setDist(S.dist * .93), back:() => setDist(S.dist / .93), up:() => setEl(S.el + 3), down:() => setEl(S.el - 3)}
};
function applyDrag(view, kind, dir, x, y) {
  if (view === views.top) {
    const wx = (x - view.cx) / view.s, wz = (y - view.cy) / view.s, ce = Math.max(Math.cos(rad(S.el)), .15);
    if (kind === 'body') { setAz(deg(Math.atan2(wx, wz))); setDist(Math.max(DMIN, Math.hypot(wx, wz)) / ce); }
    else if (dir === 'fwd' || dir === 'back') { const a = rad(S.az); setDist(Math.max(DMIN, wx * Math.sin(a) + wz * Math.cos(a)) / ce); }
    else setAz(deg(Math.atan2(wx, wz)));
  } else {
    const hx = Math.max(.001, (view.cx - x) / view.s), hy = (view.cy - y) / view.s;
    if (kind === 'body') { setDist(Math.hypot(hx, hy)); setEl(deg(Math.atan2(hy, hx))); }
    else if (dir === 'fwd' || dir === 'back') { const e = rad(S.el); setDist(Math.max(DMIN, hx * Math.cos(e) + hy * Math.sin(e))); }
    else setEl(deg(Math.atan2(hy, hx)));
  }
}
let drag = null;
function local(e, c) { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function hit(view, x, y) {
  const hnd = view.handles.find(h => Math.hypot(h.x - x, h.y - y) < 13);
  if (hnd) return {kind:'arrow', dir:hnd.dir};
  if (view.cam && Math.hypot(view.cam.x - x, view.cam.y - y) < 20) return {kind:'body'};
  return null;
}
for (const [name, view] of Object.entries(views)) {
  const c = view.c;
  c.addEventListener('pointerdown', e => {
    const [x, y] = local(e, c), h = hit(view, x, y);
    if (!h) return;
    c.setPointerCapture(e.pointerId);
    drag = {view, name, ...h, x0:x, y0:y, moved:false, repeated:false};
    view.frozen = view.s;
    if (h.kind === 'arrow') drag.timer = setTimeout(() => { drag && (drag.iv = setInterval(() => { drag.repeated = true; STEP[name][h.dir](); changed(); }, 60)); }, 350);
    changed();
  });
  c.addEventListener('pointermove', e => {
    const [x, y] = local(e, c);
    if (!drag || drag.view !== view) { const h = hit(view, x, y); c.style.cursor = h ? (h.kind === 'body' ? 'grab' : 'pointer') : 'default'; return; }
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 4) { drag.moved = true; clearTimeout(drag.timer); clearInterval(drag.iv); }
    if (drag.moved) { c.style.cursor = 'grabbing'; applyDrag(view, drag.kind, drag.dir, x, y); changed(); }
  });
  const end = () => {
    if (!drag || drag.view !== view) return;
    clearTimeout(drag.timer); clearInterval(drag.iv);
    if (drag.kind === 'arrow' && !drag.moved && !drag.repeated) STEP[name][drag.dir]();
    drag = null; view.frozen = null; changed();
  };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  c.addEventListener('keydown', e => {
    const m = name === 'top' ? {ArrowUp:'fwd', ArrowDown:'back', ArrowLeft:'left', ArrowRight:'right'} : {ArrowUp:'up', ArrowDown:'down', ArrowLeft:'back', ArrowRight:'fwd'};
    if (m[e.key]) { e.preventDefault(); STEP[name][m[e.key]](); changed(); }
  });
}
let gd = null;
gC.addEventListener('pointerdown', e => { gC.setPointerCapture(e.pointerId); gd = {x:e.clientX, y:e.clientY}; gC.style.cursor = 'grabbing'; });
gC.addEventListener('pointermove', e => { if (!gd) return; setAz(S.az + (e.clientX - gd.x) * .6); setEl(S.el - (e.clientY - gd.y) * .5); gd = {x:e.clientX, y:e.clientY}; changed(); });
const gEnd = () => { gd = null; gC.style.cursor = 'grab'; }; gC.style.cursor = 'grab';
gC.addEventListener('pointerup', gEnd); gC.addEventListener('pointercancel', gEnd);
const ORBIT = {left:() => setAz(S.az - 5), right:() => setAz(S.az + 5), up:() => setEl(S.el + 5), down:() => setEl(S.el - 5)};
gC.addEventListener('keydown', e => {
  const m = {ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down'}[e.key];
  if (m) { e.preventDefault(); ORBIT[m](); changed(); }
  if (e.key === '+' || e.key === '=') { setDist(S.dist * .93); changed(); }
  if (e.key === '-') { setDist(S.dist / .93); changed(); }
});
document.querySelectorAll('.orb').forEach(b => {
  let t, iv, rep = false; const dir = b.dataset.orbit;
  const stop = () => { clearTimeout(t); clearInterval(iv); };
  b.addEventListener('pointerdown', () => { rep = false; t = setTimeout(() => { iv = setInterval(() => { rep = true; ORBIT[dir](); changed(); }, 60); }, 350); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
  b.addEventListener('click', () => { if (!rep) { ORBIT[dir](); changed(); } rep = false; });
});
// light dial: drag any light around the subject
{
  const c = $('lightDial'); let on = false;
  const move = e => {
    if (!dialGeom) return;
    const [x, y] = local(e, c), dx = x - dialGeom.cx, dy = y - dialGeom.cy, L = S.lights[S.lightSel];
    L.az = norm360(deg(Math.atan2(dx, dy)));
    L.el = clamp(Math.round((1 - Math.min(Math.hypot(dx, dy) / dialGeom.R, 1)) * 135), -30, 90);
    changed();
  };
  c.addEventListener('pointerdown', e => {
    if (!S.lightOn || !dialGeom) return;
    const [x, y] = local(e, c);
    let best = null, bd = 16;
    ROLES.forEach(r => { const L = S.lights[r.id]; if (!L.on && r.id !== S.lightSel) return; const [lx, ly] = dialPos(L, dialGeom), d = Math.hypot(lx - x, ly - y); if (d < bd) { bd = d; best = r.id; } });
    if (best) S.lightSel = best;
    on = true; c.setPointerCapture(e.pointerId); move(e);
  });
  c.addEventListener('pointermove', e => { if (on) move(e); });
  ['pointerup', 'pointercancel'].forEach(t => c.addEventListener(t, () => { on = false; }));
}

/* ---------- control bindings ---------- */
const on = (id, ev, fn) => $(id).addEventListener(ev, e => { fn(e.target.value, e); changed(); });
document.querySelectorAll('[data-reset]').forEach(b => b.addEventListener('click', () => {
  // camera only: position + camera body/lens settings; subject, output and custom options stay
  setAz(0); setEl(0); S.roll = 0; S.offX = 0; S.offY = 0;
  S.bodyId = DEF.bodyId; S.sensorW = DEF.sensorW; S.lensId = DEF.lensId; S.focal = DEF.focal; S.aperture = DEF.aperture; S.dof = DEF.dof;
  setDist(distForShot(6));
  changed(); toast('Camera reset: front view, eye level, default camera');
}));
$('resetCustom').addEventListener('click', () => {
  Object.assign(S, {subjType:DEF.subjType, count:refs.length ? S.count : 1, types:refs.length ? S.types : [], subjCm:DEF.subjCm, subjColor:DEF.subjColor, subjDesc:'', descPinned:false, descUserEdited:false,
    aspect:DEF.aspect, aspectCustom:'', light:DEF.light, lightCustom:'', bg:DEF.bg, bgCustom:'', extra:'', customKeys:[], keys:[...DEF.keys], refBg:0,
    focus:DEF_FOCUS(), lightOn:false, lightCat:'person', lightSetup:DEF.lightSetup, lights:rigFrom(LIGHTS.person[0]), lightSel:'key'});
  if (refs.length) applySummary(true);
  changed(); toast('Custom options reset');
});
$('descPin').addEventListener('click', () => {
  if (!S.descPinned && !S.subjDesc.trim()) { toast('Write a description first'); return; }
  S.descPinned = !S.descPinned; changed();
  toast(S.descPinned ? 'Description added to the prompt' : 'Description removed from the prompt');
  if (S.descPinned) translateDesc();
});
$('subjDesc').addEventListener('change', () => { if (S.descPinned) translateDesc(); });
// any language in, English out (the original is kept in the box)
async function translateDesc() {
  const raw = S.subjDesc.trim(), st = $('descStatus');
  if (!raw || !/[^\x00-\x7F]/.test(raw)) { S.descEn = ''; S.descSrc = ''; st.textContent = ''; return; }
  if (S.descSrc === raw && S.descEn) { st.textContent = 'English: ' + shortNote(S.descEn); return; }
  await sampleReady;
  if (!sampleFn) { st.textContent = 'Translation is not available here, so the text goes into the prompt as written.'; return; }
  st.innerHTML = '<span class="spin"></span> Translating to English…';
  try {
    const r = await sampleFn('Translate this description of a photo or video scene into clear, natural English. Keep every detail: who the subject is, what they are doing, pose, expression and what is around them. Reply with only the English text.\n\n' + raw, {modelTier:'quick'});
    if (S.subjDesc.trim() !== raw) return;
    S.descEn = r.text.trim().slice(0, 1200); S.descSrc = raw; st.textContent = 'English: ' + shortNote(S.descEn); st.title = S.descEn; changed();
  } catch (e) { st.textContent = 'Could not translate, so the text goes into the prompt as written.'; }
}
function addCustomKey(text, kind) {
  const id = 'x' + Date.now().toString(36);
  S.customKeys = [...S.customKeys, {id, text:text.slice(0, 500), kind}]; S.keys = [...S.keys, id];
  changed(); toast('Added to key prompts');
}
$('bgAdd').addEventListener('click', () => { const t = S.bgCustom.trim(); if (!t) { toast('Describe the background first'); return; } addCustomKey('Background: ' + t, 'bg'); });
$('lightAdd').addEventListener('click', () => { const t = S.lightCustom.trim(); if (!t) { toast('Describe the lighting first'); return; } addCustomKey('Lighting: ' + t, 'light'); });
$('extraAdd').addEventListener('click', () => {
  const text = $('extra').value.trim();
  if (!text) { toast('Write a note first'); return; }
  const id = 'x' + Date.now().toString(36);
  S.customKeys = [...S.customKeys, {id, text:text.slice(0, 500)}]; S.keys = [...S.keys, id];
  S.extra = ''; $('extra').value = '';
  changed(); toast('Added to key prompts');
});
$('themeBtn').addEventListener('click', () => {
  const m = root.getAttribute('data-mode') === 'night' ? 'day' : 'night';
  root.setAttribute('data-mode', m);
  try { localStorage.setItem('anglecraft-mode', m); } catch (e) {}
  drawAll(); hooks.themeChanged?.();
});
$('modeNormal').onclick = () => { S.mode = 'normal'; renderDock(); afterLayout(); changed(); };
$('modeAdv').onclick = () => { if (!PRO) return needAdv(); S.mode = 'adv'; renderDock(); afterLayout(); changed(); };
$('appImage').onclick = () => { if (S.app === 'image') return; hooks.leaveVideo?.(); switchModeState('image'); applyLayout(); renderRefs(); changed(); };
$('appVideo').onclick = () => { if (!PRO) return needAdv('Video mode'); if (S.app === 'video') return; hooks.enterVideo ? hooks.enterVideo() : toast('Video mode could not load'); };
on('rot', 'input', v => setAz(+v));
on('tilt', 'input', v => setEl(+v));
on('shot', 'input', v => setDist(distForShot(NSH - +v)));
on('az', 'input', v => setAz(+v));
on('el', 'input', v => setEl(+v));
on('dist', 'input', v => setDist(sliderToDist(+v)));
on('roll', 'input', v => { S.roll = +v; });
$('presets').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const [, a, el] = PRESETS[+b.dataset.p]; setAz(a); setEl(el); changed(); });
$('keys').addEventListener('click', e => {
  const del = e.target.closest('[data-del]');
  if (del && del.dataset.del === '__desc') { S.descPinned = false; changed(); toast('Description removed from the prompt'); return; }
  if (e.target.closest('[data-k="__desc"]')) return;
  if (del) { const id = del.dataset.del; S.customKeys = S.customKeys.filter(c => c.id !== id); S.keys = S.keys.filter(x => x !== id); changed(); return; }
  const b = e.target.closest('button'); if (!b) return; const id = b.dataset.k;
  S.keys = S.keys.includes(id) ? S.keys.filter(x => x !== id) : [...S.keys, id]; changed(); });
$('imgPresetList')?.addEventListener('click', e => {
  const grpBtn = e.target.closest('[data-pgrp]');
  if (grpBtn) {
    const g = grpBtn.dataset.pgrp;
    if (minPresetGroups.has(g)) minPresetGroups.delete(g); else minPresetGroups.add(g);
    renderImgPresets(); requestAnimationFrame(fitPrompt); return;
  }
  const del = e.target.closest('[data-ipdel]');
  if (del) {
    const id = del.dataset.ipdel;
    saveUserImgPresets(loadUserImgPresets().filter(c => c.id !== id));
    if (S.imgPresetId === id) { S.imgPresetId = ''; S.imgPresetPrompt = ''; }
    changed(); toast('Custom preset deleted'); return;
  }
  const b = e.target.closest('[data-ipreset]'); if (!b) return;
  applyImgPreset(b.dataset.ipreset);
});
on('body', 'change', v => setBody(v));
on('lens', 'change', v => { S.lensId = v; applyLens(); });
on('aperture', 'change', v => { S.aperture = +v; if (getBody().kind !== 'phone') S.dof = S.aperture <= 4; });
$('dofBtn').onclick = () => { setDof(!S.dof); changed(); };
on('focal', 'change', v => { setFocal(+v); if (S.focus.zoomLocked && S.focus.detail) zoomToDetail(); });
on('focalPreset', 'change', v => { if (v) { setFocal(+v); if (S.focus.zoomLocked && S.focus.detail) zoomToDetail(); } });
on('sensor', 'change', v => setSensor(+v));
on('sensorPreset', 'change', v => { if (v) setSensor(+v); });
on('offX', 'change', v => { S.offX = clamp(+v || 0, -50, 50); });
on('offY', 'change', v => { S.offY = clamp(+v || 0, -50, 50); });
on('subjType', 'change', v => {
  S.subjType = v;
  S.subjCm = SUBJ[v].cm;
  S.types = Array(Math.max(1, S.count)).fill(v);
  refs.forEach(r => {
    if (r.det && window.VPDetect?.retype) {
      window.VPDetect.retype(r.det, v);
      r.subjects = mapDetSubjects(r.det);
      r.view = VIEW_TEXT[r.det.view] ? r.det.view : 'front';
    } else if (r.subjects?.length) {
      r.subjects.forEach((s, i) => {
        s.type = v; s.cm = SUBJ[v].cm;
        s.desc = `${TYPE_NAME[v]} ${i + 1} (${TYPE_NAME[v].toLowerCase()})`;
        s.detail = `${TYPE_NAME[v]} ${i + 1}: ${s.desc}, approx ${SUBJ[v].cm} cm.`;
      });
    } else {
      r.subjects = [{type:v, desc:'', cm:SUBJ[v].cm}];
    }
  });
  S.focus.multiEdits = {};
  const newSubs = currentImgSubjects();
  // Reload any transferred Focus Subject items so their labels and details reflect the new subject type
  if (Array.isArray(S.focus.subjectItems) && S.focus.subjectItems.length) {
    S.focus.subjectItems = S.focus.subjectItems.map((it, idx) => {
      const m = newSubs.find(s => s.key === it.key) || newSubs[idx] || newSubs[0];
      return m ? {...it, key:m.key, label:m.label, color:m.color, detail:m.detail} : it;
    });
  }
  const newCat = (v === 'person' || v === 'animal') ? 'person' : 'product';
  if (S.lightCat !== newCat) { S.lightCat = newCat; pickSetup(LIGHTS[newCat][0].id); }
  const ref = refs[S.focus.img];
  if (ref) identifyAt(ref, S.focus.x, S.focus.y);
  else if (newSubs[0]) { S.focus.desc = newSubs[0].detail; if (S.focus.target) S.focus.target = newSubs[0].label; }
  if (S.focus.activeSubj && Array.isArray(S.focus.subjectItems)) {
    const act = S.focus.subjectItems.find(it => it.key === S.focus.activeSubj);
    if (act) S.focus.target = act.label;
  }
  updateAutoDescription(false);
  focusKey = '';
  renderRefs();
  hooks.subjTypeChanged?.(v);
});
on('subjCount', 'change', v => { S.count = Math.round(clamp(+v || 1, 1, 20)); S.types = S.types.slice(0, S.count); focusKey = ''; });
on('subjCm', 'change', v => { if (+v > 0) S.subjCm = clamp(+v, 1, 5000); });
on('subjColor', 'input', v => { S.subjColor = v; hooks.subjColorChanged?.(v); });
on('subjDesc', 'input', v => { S.subjDesc = v; S.descUserEdited = true; });
on('aspect', 'change', v => { S.aspect = v; });
on('light', 'change', v => { S.light = v; });
on('bg', 'change', v => { S.bg = v; });
on('bgCustom', 'input', v => { S.bgCustom = v; });
on('aspectCustom', 'input', v => { S.aspectCustom = v; });
on('lightCustom', 'input', v => { S.lightCustom = v; });
on('extra', 'input', v => { S.extra = v; });
on('refBg', 'change', v => { S.refBg = +v; });
$('file').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
$('refGrid').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { e.preventDefault(); removeRef(b.dataset.rm); } });
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (files.length) addFiles(files);
});
// Focus point (Image Mode): Single Mode, Multiple Mode, Focus Detail & Focus Subject
$('focusOn').addEventListener('click', () => {
  S.focus.on = !S.focus.on;
  updateAutoDescription(false);
  focusKey = '';
  changed();
});
$('focusTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-fimg]'); if (!b) return;
  S.focus.img = +b.dataset.fimg; S.focus.multiSel = ''; S.focus.multiEditOpen = false;
  updateAutoDescription(false);
  focusKey = ''; changed();
});
$('focusPic').addEventListener('load', placeMark);
$('focusModeBar').addEventListener('click', e => {
  const b = e.target.closest('[data-fmode]'); if (!b) return;
  S.focus.mode = b.dataset.fmode === 'multi' ? 'multi' : 'single';
  S.focus.on = true;
  updateAutoDescription(false);
  focusKey = ''; changed();
});
on('focusDesc', 'input', v => {
  S.focus.desc = v;
  syncActiveSingleItem();
  focusKey = '';
});
// Single Mode -> "Into Subject": toggles the pointed detail as the active center-of-frame Focus Subject (turns green when active)
$('focusIntoSubjSingle').addEventListener('click', () => {
  const subs = currentImgSubjects();
  const s = subs.find(x => x.key === S.focus.lastPointKey) || subs[0] || {
    key:`pt_${Date.now().toString(36)}`, label:`${TYPE_NAME[S.subjType] || 'Subject'} 1`,
    color:FOCUS_PALETTE[0], detail:''
  };
  if (!Array.isArray(S.focus.activeSubjs)) {
    S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
  }
  if (S.focus.singleActive) {
    S.focus.singleActive = false;
    S.focus.activeSubjs = S.focus.activeSubjs.filter(x => x !== S.focus.singleKey && x !== s.key);
    S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
    if (!S.focus.activeSubjs.length) S.focus.target = '';
    focusKey = ''; changed();
    toast('Focus point center instruction turned off');
    return;
  }
  const detail = ($('focusDesc').value || S.focus.desc || s.detail || '').trim();
  if (!detail) { toast('Click a spot on the image or write a detail first'); return; }
  S.focus.desc = detail;
  S.focus.subjectItems = Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : [];
  const singleKey = s.key || 'single_pt';
  const existing = S.focus.subjectItems.findIndex(it => it.key === singleKey || it.isSinglePoint);
  const item = {
    key:singleKey, label:s.label, type:s.type || S.subjType, category:s.category || null, subtype:s.subtype || '',
    color:s.color, subjHex:s.subjHex || null, colorName:s.colorName || null, secColorName:s.secColorName || null,
    desc:s.desc || '', detail, richSentence:s.richSentence || '',
    angle:s.angle || '', pose:s.pose || '', finish:s.finish || '', condition:s.condition || '',
    position:s.position || '', horiz:s.horiz || '', vert:s.vert || '', depth:s.depth || '',
    cm:s.cm || S.subjCm, box:s.box || null, partNames:s.partNames || null,
    x:S.focus.x, y:S.focus.y, img:S.focus.img, isSinglePoint:true
  };
  if (existing >= 0) S.focus.subjectItems[existing] = item;
  else S.focus.subjectItems.push(item);
  S.focus.singleKey = singleKey;
  S.focus.singleActive = true;
  if (!S.focus.activeSubjs.includes(singleKey)) S.focus.activeSubjs.push(singleKey);
  S.focus.activeSubj = singleKey;
  S.focus.target = s.label;
  S.focus.on = true;
  focusKey = ''; changed();
  toast(`${s.label} focus point active as center of frame`);
});
// Multiple Mode -> "Reset" button: clears current detections and re-runs AI detection from scratch on the current image
$('focusMultiReset')?.addEventListener('click', async () => {
  const btn = $('focusMultiReset');
  const ref = refs[S.focus.img];
  S.focus.multiSel = '';
  S.focus.multiEditOpen = false;
  S.focus.multiEdits = {};
  S.focus.activeSubj = '';
  S.focus.activeSubjs = [];
  S.focus.target = '';
  S.focus.singleActive = false;
  S.focus.subjectItems = (Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : []).filter(it => it.img !== S.focus.img);
  S.descUserEdited = false;
  if (!ref) {
    focusKey = ''; syncFocus(); placeBoxes(); changed();
    toast('Detection reset');
    return;
  }
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Resetting…';
  ref.det = null;
  ref.subjects = [];
  ref.status = 'busy';
  focusKey = ''; renderRefs(); syncFocus(); placeBoxes();
  try {
    await detectRef(ref, {forceDesc:true});
    toast('Re-ran AI detection on current image');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
    focusKey = ''; syncFocus(); placeBoxes(); changed();
  }
});
// Multiple Mode -> click subject button to select as Main Subject & open editable detail box, "Done" to save & minimize
$('focusDetList').addEventListener('click', e => {
  const b = e.target.closest('[data-fdet]'); if (!b) return;
  selectMultiSubject(b.dataset.fdet, true, true);
});
$('focusMultiText').addEventListener('input', e => {
  if (!S.focus.multiSel) return;
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEdits[S.focus.multiSel] = e.target.value;
  if (Array.isArray(S.focus.subjectItems)) {
    const it = S.focus.subjectItems.find(x => x.key === S.focus.multiSel);
    if (it) it.detail = e.target.value.trim();
  }
  changed();
});
$('focusMultiDone').addEventListener('click', () => {
  if (!S.focus.multiSel) return;
  const k = S.focus.multiSel, val = ($('focusMultiText').value || '').trim();
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEdits[k] = val;
  if (Array.isArray(S.focus.subjectItems)) {
    const it = S.focus.subjectItems.find(x => x.key === k);
    if (it && val) it.detail = val;
  }
  S.focus.multiEditOpen = false;
  focusKey = ''; changed();
  toast('Subject details saved');
});
// Multiple Mode -> "Into Subject": transfers all detected subjects and their saved details into Focus Subject
$('focusIntoSubjMulti').addEventListener('click', () => {
  if (S.focus.multiSel && S.focus.multiEditOpen && $('focusMultiText')) {
    S.focus.multiEdits = S.focus.multiEdits || {};
    S.focus.multiEdits[S.focus.multiSel] = ($('focusMultiText').value || '').trim();
  }
  const subs = currentImgSubjects();
  if (!subs.length) { toast('No subjects detected'); return; }
  const otherImgs = (Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : []).filter(it => it.img !== S.focus.img && !subs.some(s => s.key === it.key));
  const curItems = subs.map(s => {
    const cx = clamp((s.box?.x || .15) + (s.box?.w || .7) / 2, 0, 1);
    const cy = clamp((s.box?.y || .1) + (s.box?.h || .8) / 2, 0, 1);
    return {
      key:s.key, label:s.label, type:s.type || S.subjType, category:s.category || null, subtype:s.subtype || '',
      color:s.color, subjHex:s.subjHex || null, colorName:s.colorName || null, secColorName:s.secColorName || null,
      desc:s.desc || '', detail:s.detail, richSentence:s.richSentence || '',
      angle:s.angle || '', pose:s.pose || '', finish:s.finish || '', condition:s.condition || '',
      position:s.position || '', horiz:s.horiz || '', vert:s.vert || '', depth:s.depth || '',
      cm:s.cm || S.subjCm, box:s.box || null, partNames:s.partNames || null,
      x:cx, y:cy, img:S.focus.img
    };
  });
  S.focus.subjectItems = [...otherImgs, ...curItems];
  S.focus.multiEditOpen = false;
  S.focus.on = true; focusKey = ''; changed();
  toast(`Transferred ${subs.length} subject${subs.length > 1 ? 's' : ''} to Focus Subject`);
});
// Focus Subject -> click subject button(s) to independently toggle selection and include ONLY selected subjects' saved details in the main JSON prompt
$('focusSubjList').addEventListener('click', e => {
  const refreshJsonIfReady = () => {
    if (lastObj && S.app !== 'video') {
      try {
        lastObj = buildImagePrompt();
        $('json').innerHTML = hl(JSON.stringify(lastObj, null, 2));
        $('status').textContent = 'Up to date';
        $('status').classList.remove('stale');
      } catch (err) {}
    }
  };
  if (!Array.isArray(S.focus.activeSubjs)) {
    S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
  }
  const del = e.target.closest('[data-fsubdel]');
  if (del) {
    e.stopPropagation();
    const k = del.dataset.fsubdel;
    S.focus.subjectItems = (S.focus.subjectItems || []).filter(it => it.key !== k);
    S.focus.activeSubjs = S.focus.activeSubjs.filter(x => x !== k);
    S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
    if (!S.focus.activeSubjs.length) S.focus.target = '';
    if (S.focus.singleKey === k) S.focus.singleActive = false;
    if (S.focus.multiSel === k) { S.focus.multiSel = ''; S.focus.multiEditOpen = false; }
    focusKey = ''; changed(); refreshJsonIfReady();
    toast('Removed from Focus Subject'); return;
  }
  const b = e.target.closest('[data-fsub]'); if (!b) return;
  const k = b.dataset.fsub;
  const item = (S.focus.subjectItems || []).find(it => it.key === k);
  if (!item) return;
  const idx = S.focus.activeSubjs.indexOf(k);
  if (idx >= 0) {
    S.focus.activeSubjs.splice(idx, 1);
    S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
    const lastItem = (S.focus.subjectItems || []).find(it => it.key === S.focus.activeSubj);
    S.focus.target = lastItem ? lastItem.label : '';
    if (S.focus.mode === 'single' && (item.isSinglePoint || item.key === S.focus.singleKey)) S.focus.singleActive = false;
    if (S.focus.multiSel === k) { S.focus.multiSel = S.focus.activeSubj; S.focus.multiEditOpen = false; }
    focusKey = ''; changed(); refreshJsonIfReady();
    toast(`${item.label} unselected from Main Prompt`);
  } else {
    S.focus.activeSubjs.push(k);
    S.focus.activeSubj = k;
    S.focus.on = true;
    S.focus.target = item.label;
    if (S.focus.mode === 'single' && (item.isSinglePoint || item.key === S.focus.singleKey)) S.focus.singleActive = true;
    if (S.focus.mode === 'multi') S.focus.multiSel = k;
    if (isFinite(item.x)) S.focus.x = item.x;
    if (isFinite(item.y)) S.focus.y = item.y;
    focusKey = ''; changed(); refreshJsonIfReady();
    toast(`${item.label} details active in Main Prompt`);
  }
});
function toggleMacro() {
  S.focus.detail = !S.focus.detail;
  if (S.focus.detail) { S.focus.on = true; if (S.focus.detailAuto) S.focus.detailCm = clamp(S.focus.detailAuto, .5, 200); zoomToDetail(); }
  else S.focus.zoomLocked = false;
  changed();
}
$('detailOn').addEventListener('click', toggleMacro);
on('detailCm', 'change', v => { if (+v > 0) S.focus.detailCm = clamp(+v, .5, 200); if (S.focus.zoomLocked && S.focus.detail) zoomToDetail(); });
on('fZoom', 'input', v => { S.focus.zoom = clamp(+v, 1, 8); if (S.focus.zoom > 1) S.focus.on = true; });
function zoomToDetail(z) { const k = calc(), m = z ? 3 / clamp(+z, 1, 8) : 1; setDist(1.15 * m * (S.focus.detailCm / 100) * S.focal / k.sH); }
$('detailZoom').addEventListener('click', () => {
  S.focus.zoomLocked = !S.focus.zoomLocked;
  if (S.focus.zoomLocked) { S.focus.on = true; S.focus.detail = true; zoomToDetail(); toast('Zoom to detail locked'); }
  else toast('Zoom to detail unlocked');
  changed();
});
// lighting
$('lightOn').addEventListener('click', () => { if (!PRO) return needAdv('Lighting'); S.lightOn = !S.lightOn; changed(); });
$('lightCat').addEventListener('click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  S.lightCat = b.dataset.cat; pickSetup(LIGHTS[S.lightCat][0].id); changed();
});
function pickSetup(id) {
  const st = LIGHTS[S.lightCat].find(l => l.id === id); if (!st) return;
  S.lightSetup = id; S.lights = rigFrom(st);
  S.lightSel = ROLES.find(r => S.lights[r.id].on)?.id || 'key';
}
$('lightSetups').addEventListener('click', e => { const b = e.target.closest('[data-ls]'); if (!b || !S.lightOn) return; pickSetup(b.dataset.ls); changed(); });
$('lightRoles').addEventListener('click', e => { const b = e.target.closest('[data-role]'); if (!b) return; S.lightSel = b.dataset.role; changed(); });
$('lightRoleOn').addEventListener('click', () => { const L = S.lights[S.lightSel]; L.on = !L.on; changed(); });
on('lkAz', 'input', v => { S.lights[S.lightSel].az = norm360(+v); });
on('lkEl', 'input', v => { S.lights[S.lightSel].el = +v; });
on('lkPow', 'input', v => { S.lights[S.lightSel].pow = +v; });
on('lkK', 'input', v => { S.lights[S.lightSel].k = +v; });
on('lkHard', 'input', v => { S.lights[S.lightSel].hard = +v; });
// Cinema 4D style keyframe buttons next to properties (active in video mode)
document.addEventListener('click', e => { const b = e.target.closest('.kb[data-kp]'); if (!b) return; e.preventDefault(); e.stopPropagation(); hooks.keyToggle?.(b.dataset.kp); }, true);
// minimize a panel by clicking its title (image mode)
document.addEventListener('click', e => {
  const t = e.target.closest('.view .vtag'); if (!t) return;
  const p = t.closest('.view'); S.min[p.id] = !S.min[p.id]; save(); syncUI();
  requestAnimationFrame(() => { drawAll(); placeMark(); });
});

/* ---------- prompt parts ---------- */
function azInfo(az, noun, possN) {
  const a = signed(az), absA = Math.abs(Math.round(a)), side = a > 0 ? 'right' : 'left';
  let label;
  if (absA <= 10) label = 'Front view';
  else if (absA <= 35) label = `Front view, slight ${side} angle`;
  else if (absA <= 60) label = `Front-${side} three-quarter view`;
  else if (absA <= 110) label = `${cap(side)} side view (profile)`;
  else if (absA <= 150) label = `Back-${side} three-quarter view`;
  else label = 'Back view';
  const phrase = absA <= 3 ? `camera directly in front of the ${noun}` : `camera orbited ${absA}° to the ${side} of ${possN} front (${label.toLowerCase()})`;
  return {a, absA, side, label, phrase};
}
function elInfo(elv, noun, possN) {
  const el = Math.round(elv), absE = Math.abs(el);
  let label, phrase;
  if (el >= 75) { label = "Bird's-eye / top-down"; phrase = `camera directly above, looking straight down (${el}°)`; }
  else if (el >= 45) { label = 'Steep high angle'; phrase = `camera far above, looking steeply down at ${el}°`; }
  else if (el >= 15) { label = 'High angle'; phrase = `camera above the ${noun}, tilted down ${el}°`; }
  else if (el >= 5) { label = 'Slightly high angle'; phrase = `camera slightly above, tilted down ${el}°`; }
  else if (el > -5) { label = 'Eye level'; phrase = `camera at eye level with ${possN} center, level horizon`; }
  else if (el > -15) { label = 'Slightly low angle'; phrase = `camera slightly below, tilted up ${absE}°`; }
  else if (el > -45) { label = 'Low angle'; phrase = `camera below the ${noun}, looking up ${absE}° (heroic, powerful feel)`; }
  else if (el > -75) { label = 'Steep low angle'; phrase = `camera far below, looking steeply up at ${absE}°`; }
  else { label = "Worm's-eye view"; phrase = `camera at ground level, looking straight up (${absE}°)`; }
  return {el, absE, label, phrase};
}
function lensCharFor(eq, macro) {
  let t;
  if (eq < 20) t = 'ultra-wide perspective: strong depth exaggeration, near parts look larger, slight edge stretching';
  else if (eq < 30) t = 'wide-angle perspective with noticeable depth and environmental context';
  else if (eq < 45) t = 'natural documentary perspective close to human vision, mild depth';
  else if (eq < 65) t = 'normal-lens perspective with very natural proportions';
  else if (eq < 110) t = 'short-telephoto portrait perspective: flattering compression, no distortion';
  else if (eq < 200) t = 'telephoto compression: background looks closer and larger, flattened depth';
  else t = 'super-telephoto: extreme compression, background pulled very close';
  return macro ? t + ', macro-level fine detail' : t;
}
// Builds structured reference-identification, compositional-priority, and identity-preservation instructions when subject button(s) in Focus Subject (#focusSubjList) are selected
function buildSelectedFocusSubjectInfo(activeItem, allSubs, selectedItems = []) {
  if (!activeItem) return null;
  const curSubs = currentImgSubjects();
  const liveSub = curSubs.find(s => s.key === activeItem.key)
    || allSubs.find(s => s.key === activeItem.key)
    || allSubs.find(s => s.label === activeItem.label && s.img === activeItem.img)
    || null;
  const sub = {...(liveSub || {}), ...activeItem};
  const editedMulti = S.focus.multiEdits && S.focus.multiEdits[activeItem.key];
  const savedDetail = (
    (editedMulti !== undefined && String(editedMulti).trim()) ? String(editedMulti).trim()
    : (activeItem.isSinglePoint && S.focus.desc && S.focus.desc.trim()) ? S.focus.desc.trim()
    : (activeItem.detail || liveSub?.detail || liveSub?.desc || `${sub.label} (${sub.category || TYPE_NAME[sub.type] || 'Subject'})`)
  ).trim();
  const cleanDetail = savedDetail.replace(/\.\s*$/, '');
  const imgIdx = isFinite(sub.img) && sub.img >= 0 ? sub.img : S.focus.img;
  const refObj = refs[imgIdx] || refs[0] || null;
  const coSelectedSubs = (Array.isArray(selectedItems) ? selectedItems : [])
    .filter(s => s && s.key !== sub.key && s.label !== sub.label && (refs.length ? (isFinite(s.img) ? s.img : S.focus.img) === imgIdx : true));
  const allSelectedLabels = (Array.isArray(selectedItems) && selectedItems.length ? selectedItems : [sub]).map(s => s.label);
  const selectedNamesStr = joinList(allSelectedLabels);

  const b = sub.box || liveSub?.box || {
    x: clamp((isFinite(sub.x) ? sub.x : .5) - .15, 0, .7),
    y: clamp((isFinite(sub.y) ? sub.y : .5) - .2, 0, .6),
    w: .3,
    h: .4
  };
  const cxPct = Math.round(clamp(isFinite(sub.x) ? sub.x : (b.x + b.w / 2), 0, 1) * 100);
  const cyPct = Math.round(clamp(isFinite(sub.y) ? sub.y : (b.y + b.h / 2), 0, 1) * 100);
  const leftPct = Math.round(clamp(b.x, 0, 1) * 100);
  const topPct = Math.round(clamp(b.y, 0, 1) * 100);
  const rightPct = Math.round(clamp(b.x + b.w, 0, 1) * 100);
  const bottomPct = Math.round(clamp(b.y + b.h, 0, 1) * 100);
  const widthPct = Math.max(1, rightPct - leftPct);
  const heightPct = Math.max(1, bottomPct - topPct);

  const horizZone = sub.horiz || (cxPct < 36 ? 'on the left side of the frame' : cxPct > 64 ? 'on the right side of the frame' : 'in the horizontal center of the frame');
  const vertZone = sub.vert || (cyPct < 36 ? 'in the upper portion' : cyPct > 66 ? 'in the lower portion' : 'vertically centered');
  const depthZone = sub.depth || 'foreground/midground';
  const originalPosSummary = `Located ${horizZone}, ${vertZone} (${depthZone}), centered at ${cxPct}% from the left edge and ${cyPct}% from the top edge of reference image ${imgIdx + 1} (bounding region spanning ${leftPct}%–${rightPct}% horizontally and ${topPct}%–${bottomPct}% vertically).`;

  const partSummary = sub.partNames && Object.keys(sub.partNames).length
    ? Object.entries(sub.partNames).map(([k, v]) => `${k}: ${v}`).join(', ')
    : '';
  const visualTraitsList = [
    cleanDetail,
    sub.category ? `category: ${sub.category}` : '',
    sub.subtype ? `type: ${sub.subtype}` : '',
    sub.colorName ? `primary color: ${sub.colorName}${sub.subjHex ? ' (' + sub.subjHex + ')' : ''}` : '',
    sub.secColorName ? `secondary/trim color: ${sub.secColorName}` : '',
    partSummary ? `garment/feature colors (${partSummary})` : '',
    sub.pose ? `pose/framing: ${sub.pose}` : '',
    sub.angle ? `orientation: ${sub.angle}` : '',
    sub.finish ? `surface finish: ${sub.finish}` : '',
    sub.condition ? `condition: ${sub.condition}` : '',
    isFinite(sub.cm) ? `approx real-world scale: ${sub.cm} cm` : ''
  ].filter(Boolean);
  const visualCharacteristics = visualTraitsList.join('; ');

  let relativeLocation;
  if (coSelectedSubs.length) {
    const relPhrases = coSelectedSubs.map(o => {
      const ob = o.box || {x:.5, y:.5, w:.2, h:.2};
      const ox = Math.round((isFinite(o.x) ? o.x : (ob.x + ob.w / 2)) * 100);
      const oy = Math.round((isFinite(o.y) ? o.y : (ob.y + ob.h / 2)) * 100);
      const dx = cxPct - ox;
      const hRel = Math.abs(dx) < 8 ? 'horizontally aligned with' : dx < 0 ? 'to the left of' : 'to the right of';
      return `${hRel} ${o.label} (at ${ox}% from left, ${oy}% from top)`;
    });
    relativeLocation = `In reference image ${imgIdx + 1}, ${sub.label} is positioned ${joinList(relPhrases)}, occupying ${horizZone} (${leftPct}%–${rightPct}% horizontal span).`;
  } else {
    relativeLocation = `In reference image ${imgIdx + 1}, ${sub.label} occupies ${horizZone}, ${vertZone} (${leftPct}%–${rightPct}% horizontal span, ${topPct}%–${bottomPct}% vertical span).`;
  }

  const sceneMeta = refObj?.det?.sceneMeta || null;
  const surroundingParts = [
    sceneMeta?.bgSentence ? sceneMeta.bgSentence.replace(/\.\s*$/, '') : '',
    sceneMeta?.lightSentence ? sceneMeta.lightSentence.replace(/\.\s*$/, '') : ''
  ].filter(Boolean);
  const surroundingContext = surroundingParts.length
    ? surroundingParts.join('. ') + '.'
    : `Positioned within the reference scene environment of reference image ${imgIdx + 1} with matching ambient lighting and spatial perspective.`;

  const subjTypeKey = sub.type && SUBJ[sub.type] ? sub.type : S.subjType;
  const preserveAttrs = SUBJ[subjTypeKey]?.preserve || SUBJ.auto.preserve;
  const focalInstruction = allSelectedLabels.length > 1
    ? `Make ${sub.label} (${cleanDetail}) a primary focal point of the generated image alongside ${joinList(coSelectedSubs.map(s => s.label))}. Anchor the camera framing, optical focus plane, and primary lighting emphasis on ${selectedNamesStr}.`
    : `Make ${sub.label} (${cleanDetail}) the primary focal point and central hero of the generated image. Center and anchor the camera framing, optical focus plane, and primary lighting emphasis on ${sub.label}.`;
  const compAdjustment = `Adjust and build the overall image composition around ${selectedNamesStr}: any unselected people or objects in the reference scene may move to secondary supporting positions (toward the background or periphery) or become less prominent with softer focus falloff, while the overall composition is built around ${selectedNamesStr}.`;
  const preserveInstruction = `Preserve ${sub.label}'s identity and defining visual details from the reference image as closely as possible: keep the exact same ${joinList(preserveAttrs)}, specifically maintaining ${cleanDetail}. Never swap or blend ${sub.label}'s identity or visual features with any other subject.`;

  const promptBlock = `SELECTED FOCUS SUBJECT (${sub.label}${sub.category ? ' · ' + sub.category : ''}): ${cleanDetail}. `
    + `REFERENCE IDENTIFICATION: Locate and identify ${sub.label} in reference image ${imgIdx + 1} by its visual characteristics (${visualCharacteristics}), its original position (${originalPosSummary.replace(/\.\s*$/, '')}), its relative location (${relativeLocation.replace(/\.\s*$/, '')}), and its surrounding context (${surroundingContext.replace(/\.\s*$/, '')}). `
    + `COMPOSITIONAL PRIORITY: ${focalInstruction} ${compAdjustment} `
    + `IDENTITY & VISUAL DETAIL PRESERVATION: ${preserveInstruction}`;

  return {
    selected: true,
    key: sub.key,
    img: imgIdx,
    label: sub.label,
    type: sub.type === 'auto' ? 'other' : (sub.type || S.subjType),
    category: sub.category || null,
    saved_detailed_description: savedDetail,
    reference_identification: {
      reference_image: imgIdx + 1,
      visual_characteristics: visualCharacteristics,
      original_position: {
        summary: originalPosSummary,
        horizontal_zone: horizZone,
        vertical_zone: vertZone,
        depth_plane: depthZone,
        center_pct: {x: cxPct, y: cyPct},
        bounding_box_pct: {left: leftPct, top: topPct, right: rightPct, bottom: bottomPct, width: widthPct, height: heightPct}
      },
      relative_location: relativeLocation,
      surrounding_context: surroundingContext
    },
    composition_priority: {
      role: 'primary_focal_point',
      primary_focal_point_instruction: focalInstruction,
      composition_adjustment: compAdjustment
    },
    identity_and_detail_preservation: {
      defining_visual_details: savedDetail,
      preserve_attributes: preserveAttrs,
      instruction: preserveInstruction
    },
    prompt_block: promptBlock
  };
}
// everything that does not depend on one particular camera angle; opts.still = a single frame of the video (no motion keys)
function common(opts = {}) {
  const k = calc(), body = getBody(), lens = getLens(), T = SUBJ[S.subjType];
  const subs = allSubjects();
  // When one or more subject buttons in Focus Subject (#focusSubjList) are selected, include ONLY those selected subjects and their saved details in the Main Prompt
  const activeSubjKeys = Array.isArray(S.focus.activeSubjs)
    ? S.focus.activeSubjs
    : (S.focus.activeSubj ? [S.focus.activeSubj] : []);
  const activeFocusSubjs = (S.app !== 'video' && S.focus.on && Array.isArray(S.focus.subjectItems))
    ? S.focus.subjectItems.filter(it => activeSubjKeys.includes(it.key))
    : [];
  const selectedFocusSubjInfos = activeFocusSubjs.map(it => buildSelectedFocusSubjectInfo(it, subs, activeFocusSubjs)).filter(Boolean);
  const selectedFocusSubjInfo = selectedFocusSubjInfos[0] || null;
  const hasSelectedFocusSubjs = selectedFocusSubjInfos.length > 0;
  const n = hasSelectedFocusSubjs ? selectedFocusSubjInfos.length : S.count, group = n > 1;
  const PLURAL = {person:'people', product:'products', object:'objects', animal:'animals', car:'cars', phone:'phones', vehicle:'vehicles', auto:'subjects'};
  const selTypes = hasSelectedFocusSubjs ? selectedFocusSubjInfos.map(x => x.type) : S.types;
  const mixed = new Set(selTypes).size > 1;
  const primaryType = hasSelectedFocusSubjs && !mixed && SUBJ[selectedFocusSubjInfos[0].type] ? selectedFocusSubjInfos[0].type : S.subjType;
  const TSel = SUBJ[primaryType] || T;
  const noun = group ? `group of ${n} ${mixed ? 'subjects' : PLURAL[primaryType]}` : TSel.noun;
  const possN = group ? "the group's" : TSel.poss;
  const preserve = group
    ? [`the exact number of subjects (${n})`, "each subject's identity and appearance", 'their positions, spacing and arrangement relative to each other', ...TSel.preserve]
    : TSel.preserve;
  const isPerson = primaryType === 'person' && !group, isPhone = body.kind === 'phone';
  const rawDesc = S.subjDesc.trim();
  const desc = S.descPinned ? (S.descEn && S.descSrc === rawDesc ? S.descEn : rawDesc) : '';
  const subjRef = noun;
  const activeFocusSubj = activeFocusSubjs[activeFocusSubjs.length - 1] || null;
  const isImgFocus = S.app !== 'video' && S.focus.on;
  const isMultiFocus = isImgFocus && S.focus.mode === 'multi';
  const isSingleFocus = isImgFocus && S.focus.mode === 'single';
  const curImgSubs = isImgFocus ? currentImgSubjects() : [];
  const multiSelKey = (!hasSelectedFocusSubjs && isMultiFocus && !(Array.isArray(S.focus.subjectItems) && S.focus.subjectItems.length))
    ? (S.focus.multiSel || '')
    : '';
  const multiMainSubj = multiSelKey ? (curImgSubs.find(s => s.key === multiSelKey) || null) : null;
  const multiOtherSubjs = multiMainSubj ? curImgSubs.filter(s => s.key !== multiMainSubj.key) : [];
  const singleCenterActive = isSingleFocus && !!(S.focus.singleActive || activeFocusSubj);
  const liveSingleDesc = isSingleFocus ? (S.focus.desc || activeFocusSubj?.detail || S.focus.note || '').trim() : '';
  const focusSubjText = hasSelectedFocusSubjs
    ? selectedFocusSubjInfos.map(info => info.prompt_block).join(' ')
    : isMultiFocus
    ? (multiMainSubj?.detail ? `Focus subject details (${multiMainSubj.label}): ${multiMainSubj.detail.replace(/\.\s*$/, '')}.` : '')
    : (singleCenterActive && liveSingleDesc ? `Focus point details (${activeFocusSubj?.label || S.focus.target || 'selected focus point'}): ${liveSingleDesc.replace(/\.\s*$/, '')}.` : '');
  const imgPresetText = (S.app !== 'video' && S.imgPresetPrompt) ? S.imgPresetPrompt : '';
  const actionParts = [
    desc ? `Scene and action (main instruction, follow it exactly): ${desc.replace(/\s*\n\s*/g, '; ')}.` : '',
    focusSubjText
  ].filter(Boolean);
  const action = actionParts.join(' ');
  const aspectStr = S.aspect === 'custom' ? (S.aspectCustom.trim() || '4:5') : S.aspect;
  const customNotes = PRO ? S.customKeys.filter(c => S.keys.includes(c.id)).map(c => c.text) : [];
  const keyTexts = KEYS.filter(x => S.keys.includes(x.id) && (!x.video || (S.app === 'video' && (!opts.still || x.both))) && (!x.when || x.when.includes(S.subjType) || (mixed && x.id !== 'logo')))
    .map(x => opts.still && x.frameText ? x.frameText : group && x.group ? x.group : x.text).concat(customNotes);
  const bgFromImage = refs.length > 1 && S.refBg >= 0 && refs[S.refBg];
  const bgMode = bgFromImage ? 'keep' : S.bg;
  const alphaRefs = refs.map((r, i) => r.alpha ? i + 1 : 0).filter(Boolean);
  let bgText = bgFromImage
    ? `Use the environment and background from reference image ${S.refBg + 1} for the whole scene, re-projected correctly for the new viewpoint (perspective, horizon and parallax must match the camera angle).`
    : S.bg === 'custom' ? (S.bgCustom.trim() || 'Custom background as described by the user.') : BG[S.bg];
  if (alphaRefs.length) bgText += ` Reference image${alphaRefs.length > 1 ? 's' : ''} ${alphaRefs.join(', ')} ${alphaRefs.length > 1 ? 'are' : 'is a'} transparent PNG cut-out${alphaRefs.length > 1 ? 's' : ''}: use only the subject, never the empty or checkerboard area as background.`;
  const promptSubs = hasSelectedFocusSubjs ? activeFocusSubjs : subs;
  const composition = refs.length > 1
    ? `Combine every subject from the ${refs.length} reference images into one single, natural ${S.app === 'video' ? 'scene' : 'photo'}: `
      + promptSubs.map(s => `${s.label} (from image ${(isFinite(s.img) ? s.img : 0) + 1}${s.desc ? ', ' + s.desc : ''})`).join('; ')
      + '. Place them together at a believable scale and spacing, lit by the same light, with consistent shadows, reflections and perspective.'
    : '';
  const selectedLabelsJoined = hasSelectedFocusSubjs ? selectedFocusSubjInfos.map(x => x.label).join(', ') : '';
  const selectedDetailsJoined = hasSelectedFocusSubjs ? selectedFocusSubjInfos.map(x => `${x.label}: ${x.saved_detailed_description.replace(/\.\s*$/, '')}`).join('; ') : '';
  const focusTargetLabel = hasSelectedFocusSubjs
    ? selectedLabelsJoined
    : isMultiFocus ? (multiMainSubj?.label || '') : (activeFocusSubj?.label || S.focus.target);
  const focusSub = S.focus.on ? subs.find(s => s.label === focusTargetLabel) : null;
  const note = S.focus.note.trim();
  const fDesc = hasSelectedFocusSubjs
    ? selectedDetailsJoined
    : isMultiFocus
    ? (multiMainSubj?.detail ? multiMainSubj.detail.trim() : '')
    : (singleCenterActive ? liveSingleDesc : (activeFocusSubj?.detail ? activeFocusSubj.detail.trim() : ''));
  const detail = detailActive() ? {
    part: note || fDesc || 'the pointed detail', of: focusTargetLabel || 'the subject', size_cm: S.focus.detailCm, shot: k.dShot,
    text: `Macro / detail shot: zoom in on ${note || 'the pointed detail'}${focusTargetLabel ? ` of ${focusTargetLabel}` : ''} (about ${S.focus.detailCm} cm in size)`
      + (fDesc ? ` — ${fDesc.replace(/\.$/, '')}` : '')
      + ` — ${k.dShot ? k.dShot.text : 'the detail is the center of attention'}. Use a macro-lens look: razor-thin plane of focus on the detail, creamy falloff, micro texture visible, and keep the detail's exact design, material and any text identical to the reference.`
  } : null;
  let focus = null;
  if (S.app === 'video') {
    if (S.focus.on) {
      focus = {
        target: S.focus.target || null, note: note || null, detail_description: null,
        image: refs.length ? S.focus.img + 1 : null,
        point_pct: {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)},
        text: `Main subject and focus point: ${S.focus.target || `the point ${Math.round(S.focus.x * 100)}% from the left and ${Math.round(S.focus.y * 100)}% from the top of reference image ${S.focus.img + 1}`}`
          + (note ? ` — specifically ${note}` : focusSub?.desc ? ` (${focusSub.desc})` : '')
          + '. This is the hero: keep it at the center of the frame and in the sharpest focus; the camera aims at it and moves around it. Other subjects are secondary.'
      };
    }
  } else if (hasSelectedFocusSubjs) {
    const selNames = joinList(selectedFocusSubjInfos.map(x => x.label));
    const selCats = [...new Set(selectedFocusSubjInfos.map(x => x.category).filter(Boolean))].join(', ');
    const selText = `MAIN FOCUS SUBJECT${selectedFocusSubjInfos.length > 1 ? 'S' : ''} (mandatory composition rule): ${selNames} (${selectedDetailsJoined}) ${selectedFocusSubjInfos.length > 1 ? 'are the primary focal points and central heroes' : 'is the SOLE main subject and hero'} of the shot. Place ${selNames} in the center of the camera frame, tack-sharp, well-lit, and rendered with full micro-detail, while any unselected elements in the scene move to secondary positions or become softly out of focus so nothing competes with ${selNames}.`;
    focus = {
      mode: S.focus.mode === 'multi' ? 'multiple' : 'single',
      target: selectedLabelsJoined,
      category: selCats || null,
      note: note || null,
      detail_description: selectedDetailsJoined || null,
      image: refs.length ? S.focus.img + 1 : null,
      point_pct: {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)},
      text: selText,
      master_line: `${selNames} (${selectedDetailsJoined}) ${selectedFocusSubjInfos.length > 1 ? 'are the primary focal points and heroes' : 'is the SOLE main subject and hero'} of the shot: placed centered in the frame, tack-sharp, and well-lit, while any unselected elements remain secondary and softly out of focus. `
    };
  } else if (isMultiFocus && multiMainSubj) {
    const othersLabelStr = multiOtherSubjs.length
      ? multiOtherSubjs.map(s => `${s.label}${s.category ? ' [' + s.category + ']' : ''}`).join(', ')
      : 'all other people or objects in the scene';
    const mainCleanDesc = (multiMainSubj.detail || '').trim().replace(/\.\s*$/, '');
    const multiText = `MAIN SUBJECT & HERO FOCUS (mandatory composition rule): ${multiMainSubj.label}${multiMainSubj.category ? ' (' + multiMainSubj.category + ')' : ''}${mainCleanDesc ? ' — ' + mainCleanDesc : ''} is the SOLE main subject and hero of the shot. Place ${multiMainSubj.label} directly in the center of the camera frame, tack-sharp, well-lit, and rendered with full micro-detail. NON-FOCUS ELEMENTS: ${othersLabelStr} must NOT be the focus — render them softly blurred and out of focus with shallow depth-of-field bokeh falloff, pushed toward the background or edges of the frame, or kept partially out of the camera frame so nothing competes visually with ${multiMainSubj.label}.`;
    focus = {
      mode: 'multiple',
      target: multiMainSubj.label,
      category: multiMainSubj.category || null,
      note: note || null,
      detail_description: mainCleanDesc || null,
      non_focus_subjects: multiOtherSubjs.map(s => s.label),
      image: refs.length ? S.focus.img + 1 : null,
      point_pct: {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)},
      text: multiText,
      master_line: `${multiMainSubj.label}${mainCleanDesc ? ' (' + mainCleanDesc + ')' : ''} is the SOLE main subject and hero of the shot: placed dead-center in the frame, tack-sharp, and well-lit, while ${othersLabelStr} must NOT be the focus — keep them softly blurred/out of focus, pushed to the edges or background, or partially out of the camera frame so nothing competes with ${multiMainSubj.label}. `
    };
  } else if (singleCenterActive) {
    const cleanSingle = liveSingleDesc.replace(/\.\s*$/, '');
    const ptStr = `${Math.round(S.focus.x * 100)}% from left, ${Math.round(S.focus.y * 100)}% from top${refs.length ? ` of reference image ${S.focus.img + 1}` : ''}`;
    const singleHeroLabel = cleanSingle || note || focusTargetLabel || 'the selected focus point';
    const singleText = `CENTER OF FRAME & MAIN FOCUS (mandatory composition rule): Place the exact selected focus point (${ptStr}) — ${singleHeroLabel} — directly in the center of the camera frame, tack-sharp and clearly in focus as the hero of the shot. Keep the rest of the image and surrounding areas secondary and softly out of focus so nothing competes with this selected point.`;
    focus = {
      mode: 'single',
      target: focusTargetLabel || 'Selected Focus Point',
      note: note || null,
      detail_description: cleanSingle || null,
      image: refs.length ? S.focus.img + 1 : null,
      point_pct: {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)},
      text: singleText,
      master_line: `Place the exact selected focus point — ${singleHeroLabel} — directly in the center of the frame, sharp and clearly in focus as the hero of the shot, while the rest of the image stays secondary and softly out of focus. `
    };
  }
  const lightText = S.lightOn ? rigText(S.az)
    : S.light === 'custom' ? (S.lightCustom.trim() ? `Lighting: ${S.lightCustom.trim()}.` : LIGHT.match) : LIGHT[S.light];
  const eq = Math.round(k.eq), N = S.aperture;
  const lensName = lens.id === 'manual' ? `${eq}mm-equivalent lens` : lens.name;
  const lensChar = lensCharFor(eq, lens.macro || !!detail);
  const fNoun = detail ? detail.part : focus && focus.target ? focus.target : noun;
  const depth = k.far - k.near;
  let bgBlur;
  if (!S.dof) bgBlur = 'deep focus, background clearly readable';
  else if (isPhone) bgBlur = 'portrait-mode background blur, natural gradual falloff around the subject edges';
  else if (k.far === Infinity) bgBlur = 'mild softening only, background mostly readable';
  else if (depth < .15 * k.subjH + .05) bgBlur = 'very shallow focus, background melts into smooth creamy bokeh';
  else if (depth < .6 * k.subjH + .2) bgBlur = 'shallow focus, soft blurred background with round bokeh highlights';
  else bgBlur = 'moderate background softness, environment still recognizable';
  const dofPhrase = !S.dof ? `Deep depth of field at ${apStr(N)}: the ${noun} and background are both sharp`
    : isPhone ? `Portrait mode: the ${fNoun} is tack sharp with natural synthetic background blur`
    : `Shallow depth of field at ${apStr(N)}: focus locked on the ${fNoun}, ${bgBlur}`;
  const negative = `${T.neg}${group ? ', missing subject, extra subject, merged subjects, swapped positions' : ''}, unchanged background from the reference, background not matching the camera angle, subject off-center, cropped subject, duplicated subject, wrong camera angle, mismatched perspective, inconsistent lighting, distorted proportions, blurry subject, out-of-focus subject, low resolution, artifacts, watermark, text overlay, 3D render, CGI, computer graphics, video game look, cartoon, anime, illustration, clay, doll-like, mannequin, plastic skin, waxy skin, airbrushed skin, over-smoothed skin, uncanny valley${alphaRefs.length ? ', checkerboard background, transparent-pixel artifacts' : ''}`;
  return {action, k, body, lens, T, n, group, mixed, noun, possN, preserve, isPerson, isPhone, desc, subjRef, aspectStr, customNotes, keyTexts, subs,
    bgMode, bgText, composition, focus, detail, activeFocusSubj, activeFocusSubjs, selectedFocusSubjInfo, selectedFocusSubjInfos, hasSelectedFocusSubjs, multiMainSubj, multiOtherSubjs, singleCenterActive, imgPresetText, lightText, eq, N, lensName, lensChar, bgBlur, dofPhrase, negative,
    refView: VIEW_TEXT[S.refView] || VIEW_TEXT.front};
}
// angle-specific wording for one camera position
function angleParts(cm, az, elv) {
  const A = azInfo(az, cm.noun, cm.possN), E = elInfo(elv, cm.noun, cm.possN);
  const ca = Math.cos(rad(A.a)), sa = Math.sin(rad(A.a)), el = E.el;
  const vis = [];
  if (ca > .34) vis.push(cm.isPerson ? 'the face and front of the body' : `${cm.possN} front`);
  if (ca < -.34) vis.push(cm.isPerson ? 'the back of the head and body' : `${cm.possN} back`);
  if (sa > .34) vis.push(`${cm.possN} left side`);
  if (sa < -.34) vis.push(`${cm.possN} right side`);
  if (el > 20) vis.push(cm.isPerson ? 'the top of the head and shoulders' : `${cm.possN} top surface`);
  if (el < -20) vis.push(cm.isPerson ? 'the underside of the chin' : `${cm.possN} underside`);
  const hidden = [];
  if (ca < .34) hidden.push(cm.isPerson ? 'the back and sides of the head, hair and outfit' : `${cm.possN} back and sides`);
  if (E.absE > 20) hidden.push(el > 0 ? 'the top' : 'the underside');
  let bgView;
  const opp = A.a > 0 ? 'left' : 'right';
  if (cm.bgMode !== 'keep') {
    bgView = ['studio', 'white', 'black'].includes(cm.bgMode)
      ? `The seamless backdrop stays behind the ${cm.noun} from the new angle, with the floor and shadow re-drawn for this viewpoint.`
      : `The background is re-composed for the new angle: the camera sees the part of the described setting that lies behind the ${cm.noun} in this new direction, with correct perspective and parallax.`;
  } else if (A.absA <= 15) bgView = 'The background stays the same as in the reference, shifted slightly by parallax for the new camera position.';
  else if (A.absA <= 70) bgView = `The background turns with the camera: it now shows the ${opp} part of the reference background and continues past its ${opp} edge, with the horizon and vanishing points re-drawn for the new angle.`;
  else if (A.absA <= 110) bgView = `The background turns with the camera by about ${A.absA}°: it now shows the area to the ${opp} of the original frame, which was not visible in the reference. Extend the same location consistently: same architecture or landscape, materials, colors, time of day and lighting.`;
  else bgView = 'The camera now looks the opposite way, so the background is the part of the location that was behind the original camera and not visible in the reference. Build it consistently with the same place, style, materials, time of day and lighting.';
  if (el >= 35) bgView += ` Seen from above, most of the background is the ${cm.bgMode === 'keep' ? 'floor or ground' : 'floor'} around the ${cm.noun}.`;
  else if (el <= -35) bgView += ` Seen from below, most of the background is ${cm.bgMode === 'keep' ? 'sky or ceiling' : 'the upper backdrop'}.`;
  bgView += ' Never paste the reference background unchanged behind the re-angled subject.';
  return {A, E, vis, hidden, bgView, ca};
}

/* ---------- image prompt ---------- */
function buildImagePrompt(opts = {}) {
  const cm = common(opts), {k, body, noun, possN, group, n, subjRef, aspectStr, keyTexts, isPerson} = cm;
  const ang = angleParts(cm, S.az, S.el), {A, E} = ang;
  const elR = rad(S.el), hd = S.dist * Math.cos(elR), hy = S.dist * Math.sin(elR);
  const shotName = cm.detail && k.dShot ? k.dShot.name : k.shot.name;
  const shotDesc = cm.detail && k.dShot ? `${k.dShot.text} — ${cm.detail.part}${S.focus.target ? ' of ' + S.focus.target : ''}` : isPerson ? k.shot.p : k.shot.o;
  const roll = S.roll ? ` Dutch tilt of ${Math.abs(Math.round(S.roll))}° to the ${S.roll > 0 ? 'right' : 'left'}.` : '';
  const shift = (S.offX || S.offY) ? ` Lens shift ${S.offX}% horizontal, ${S.offY}% vertical.` : '';
  const selInfos = cm.selectedFocusSubjInfos || [];
  const hasSelFocus = selInfos.length > 0;
  const selLabelsStr = hasSelFocus ? joinList(selInfos.map(x => x.label)) : '';
  const selDetailsStr = hasSelFocus ? selInfos.map(x => `${x.label}: ${x.saved_detailed_description}`).join(' | ') : '';
  const groupLine = hasSelFocus
    ? (selInfos.length > 1
      ? `Selected focus subjects (${selInfos.length}): ${selLabelsStr}. Include and prioritize all ${selInfos.length} selected subjects (${selDetailsStr}) as the primary focal points of the composition, while any unselected elements remain secondary.`
      : `${selInfos[0].label} (${selInfos[0].saved_detailed_description}) is the primary focal point and central hero of the composition, while any unselected elements remain secondary.`)
    : cm.multiMainSubj
    ? `Although ${n} objects/people were detected in the reference, ${cm.multiMainSubj.label} is the ONLY main subject: frame ${cm.multiMainSubj.label} dead-center, sharp and well-lit, while all other detected elements (${cm.multiOtherSubjs.map(s => s.label).join(', ') || 'secondary elements'}) are softly blurred/out of focus, pushed to the background or frame edges, or kept partially out of frame so nothing competes.`
    : group ? `There are exactly ${n} subjects. Keep all ${n} in frame with the same arrangement${refs.length > 1 ? '' : ' as the reference'}; from this angle their order, overlap and spacing change naturally with the viewpoint.` : '';
  const master = `Re-photograph the exact same ${subjRef} from the reference image${refs.length > 1 ? 's' : ''} from a new camera angle: ${A.phrase}, ${E.phrase}. `
    + (cm.imgPresetText ? cm.imgPresetText + ' ' : '')
    + (cm.action ? cm.action + ' ' : '')
    + (cm.composition ? 'All subjects from every reference image appear together in one photo. ' : '')
    + (cm.detail ? `${shotName}: zoom in on ${cm.detail.part}${S.focus.target ? ' of ' + S.focus.target : ''}, which fills the frame. ` : `${shotName}: ${shotDesc}. `)
    + `Shot on ${body.name} with ${cm.lensName} at ${cm.eq}mm, ${apStr(cm.N)}. ${cm.dofPhrase}. `
    + (cm.focus && !cm.detail ? (cm.focus.master_line || `${cm.focus.target || 'The focus point'}${cm.focus.detail_description ? ' (' + cm.focus.detail_description + ')' : cm.focus.note ? ' (' + cm.focus.note + ')' : ''} is the main subject, centered and sharpest. `) : !cm.detail ? `The camera points straight at the ${noun}, which stays centered in frame and in sharp focus. ` : '')
    + `Keep ${joinList(cm.preserve.slice(0, 4))} identical to the reference. `
    + (cm.bgMode === 'keep' && A.absA > 15 ? 'The background turns with the camera and shows the scene from this new direction. ' : '')
    + `Real photograph shot on a real camera, not a 3D render, not CGI, not a cartoon: true-to-life skin, hair, fabric and materials. Photorealistic, ${aspectStr} aspect ratio.`
    + (keyTexts.length ? ' ' + keyTexts.map(t => t.split(':')[0]).join('. ') + '.' : '');
  const detailed = [
    `Use the attached reference image${refs.length > 1 ? 's' : ` (shot as a ${cm.refView})`} as the single source of truth for the ${subjRef}. Keep the same real ${noun} and photograph it again from a new viewpoint, exactly as a real camera standing there would see it. Real photograph shot on a real camera, not a 3D render, not CGI, not a cartoon.`,
    cm.imgPresetText, cm.action, cm.composition, groupLine, cm.focus?.text || '', cm.detail?.text || '',
    `Camera position: ${A.phrase}; ${E.phrase}. The lens is ${mStr(S.dist)} from ${cm.focus?.target ? cm.focus.target + "'s" : possN} ${cm.detail ? cm.detail.part : 'center'} (${mStr(hd)} horizontally, ${mStr(Math.abs(hy))} ${hy >= 0 ? 'above' : 'below'} it) and aimed straight at it, so it stays locked in the center of the frame.${roll}`,
    ang.vis.length && !cm.detail ? `From this viewpoint the camera sees ${joinList(ang.vis)}.${ang.ca < -.34 && isPerson ? ' The face is turned away from the camera.' : ''}` : '',
    ang.hidden.length && !cm.detail ? `Show ${joinList(ang.hidden)} realistically and consistently with the visible design in the reference. Do not invent new features.` : '',
    `Framing: ${shotName}, ${shotDesc}.${shift}`,
    `Camera: ${body.name} (${body.sensorName}), ${cm.lensName}, ${rnd(S.focal, 1)}mm (${cm.eq}mm full-frame equivalent), horizontal field of view ${rnd(k.hfov, 1)}°. ${cap(cm.lensChar)}.`,
    `${cm.dofPhrase}.`,
    cm.lightText,
    `Do not change the ${noun}: keep ${joinList(cm.preserve)} exactly as in the reference.`,
    cm.bgText, ang.bgView,
    keyTexts.length ? 'Key requirements: ' + keyTexts.join('. ') + '.' : '',
    `${cap(body.look)}. Photorealistic, high detail, ${aspectStr} aspect ratio.`
  ].filter(Boolean).join(' ');
  const selectedSubjectBlock = hasSelFocus ? (
    selInfos.length === 1 ? {
      selected: true,
      count: 1,
      label: selInfos[0].label,
      type: selInfos[0].type,
      category: selInfos[0].category,
      saved_detailed_description: selInfos[0].saved_detailed_description,
      reference_identification: selInfos[0].reference_identification,
      composition_priority: selInfos[0].composition_priority,
      identity_and_detail_preservation: selInfos[0].identity_and_detail_preservation,
      selected_subjects: selInfos.map(x => ({
        label: x.label,
        type: x.type,
        category: x.category,
        saved_detailed_description: x.saved_detailed_description,
        reference_identification: x.reference_identification,
        composition_priority: x.composition_priority,
        identity_and_detail_preservation: x.identity_and_detail_preservation
      }))
    } : {
      selected: true,
      count: selInfos.length,
      label: selInfos.map(x => x.label).join(', '),
      type: cm.mixed ? 'mixed' : selInfos[0].type,
      category: [...new Set(selInfos.map(x => x.category).filter(Boolean))].join(', ') || null,
      saved_detailed_description: selDetailsStr,
      reference_identification: selInfos.map(x => ({
        label: x.label,
        ...x.reference_identification
      })),
      composition_priority: {
        role: 'primary_focal_points',
        primary_focal_point_instruction: selInfos.map(x => x.composition_priority.primary_focal_point_instruction).join(' '),
        composition_adjustment: selInfos[0].composition_priority.composition_adjustment
      },
      identity_and_detail_preservation: {
        defining_visual_details: selDetailsStr,
        preserve_attributes: cm.preserve,
        instruction: selInfos.map(x => x.identity_and_detail_preservation.instruction).join(' ')
      },
      selected_subjects: selInfos.map(x => ({
        label: x.label,
        type: x.type,
        category: x.category,
        saved_detailed_description: x.saved_detailed_description,
        reference_identification: x.reference_identification,
        composition_priority: x.composition_priority,
        identity_and_detail_preservation: x.identity_and_detail_preservation
      }))
    }
  ) : null;
  return {
    prompt_type: cm.detail ? 'camera_angle_macro_detail' : 'camera_angle_rerender',
    master_prompt: master,
    detailed_prompt: detailed,
    camera_preset: S.imgPresetId ? {id: S.imgPresetId, prompt: S.imgPresetPrompt} : null,
    key_requirements: keyTexts,
    output_resolution: S.keys.includes('4k') ? '4K (3840 px long edge)' : 'native',
    reference_images: refs.length ? refs.map((r, i) => ({
      image: i + 1,
      file: r.name,
      transparent_png: r.alpha || undefined,
      subjects: hasSelFocus
        ? selInfos.filter(s => s.img === i).map(s => s.label)
        : cm.subs.filter(s => s.img === i).map(s => s.label),
      role: 'identity and design reference'
    })) : [{image: 1, file: null, note: 'attach your reference image'}],
    composition: hasSelFocus
      ? [cm.composition, ...selInfos.map(x => x.composition_priority.primary_focal_point_instruction), selInfos[0].composition_priority.composition_adjustment].filter(Boolean).join(' ')
      : (cm.composition || null),
    selected_focus_subject: selectedSubjectBlock,
    subject: {
      count: hasSelFocus ? selInfos.length : n,
      type: group && cm.mixed ? 'mixed' : S.subjType === 'auto' ? 'other' : S.subjType,
      subjects: hasSelFocus
        ? selInfos.map(s => ({
            label: s.label,
            type: s.type,
            category: s.category || null,
            description: s.saved_detailed_description,
            original_position: s.reference_identification.original_position.summary,
            is_selected_focus_subject: true
          }))
        : cm.subs.map(s => ({
            label: s.label,
            type: s.type === 'auto' ? 'other' : s.type,
            category: s.category || null,
            description: s.desc || null,
            original_position: s.position || s.horiz || null,
            is_selected_focus_subject: false
          })),
      main_subject: hasSelFocus
        ? {
            label: selInfos.map(x => x.label).join(', '),
            category: [...new Set(selInfos.map(x => x.category).filter(Boolean))].join(', ') || null,
            details: selDetailsStr,
            rule: 'primary focal point(s): placed in the center of the frame, sharp, well lit, clearly the hero(es) of the shot'
          }
        : cm.multiMainSubj ? {label: cm.multiMainSubj.label, category: cm.multiMainSubj.category || null, details: cm.multiMainSubj.detail || null, rule: 'sole focus: placed in the center of the frame, sharp, well lit, clearly the hero of the shot'} : null,
      non_focus_subjects: hasSelFocus ? null : (cm.multiMainSubj ? cm.multiOtherSubjs.map(s => ({label: s.label, category: s.category || null, rule: 'NOT the focus: softly blurred or out of focus, pushed to the edges or background, or kept partially out of the camera frame so nothing competes with the main subject'})) : null),
      selected_focus_subject: selectedSubjectBlock || (cm.multiMainSubj ? {label: cm.multiMainSubj.label, details: cm.multiMainSubj.detail} : null),
      description: cm.desc ? (group ? cm.desc.split(/\s*\n\s*/).filter(Boolean) : cm.desc) : null,
      approx_height_cm: S.subjCm,
      preserve: cm.preserve,
      placement: hasSelFocus ? `${selLabelsStr} ${selInfos.length > 1 ? 'are the primary focal points and compositional anchors' : 'is the primary focal point and compositional anchor'}; any unselected people and objects move to secondary, less prominent positions around ${selLabelsStr}` : cm.multiMainSubj ? `${cm.multiMainSubj.label} centered in frame as sole hero; all other objects pushed to edges/background or partially out of frame` : cm.singleCenterActive ? 'selected focus point placed in the exact center of the frame as main focus' : 'centered in frame; the camera always looks at the subject center',
      focus: hasSelFocus ? `primary focal point locked on ${selLabelsStr} (${selDetailsStr}); unselected elements less prominent` : cm.multiMainSubj ? `tack-sharp focus locked exclusively on ${cm.multiMainSubj.label}; other objects softly blurred` : cm.singleCenterActive ? `sharp focus locked on the selected focus point (${cm.focus?.detail_description || cm.focus?.target}); rest of image secondary/softly out of focus` : 'sharp focus locked on the subject'
    },
    focus_point: cm.focus ? {mode: cm.focus.mode || 'default', target: cm.focus.target, category: cm.focus.category || undefined, note: cm.focus.note, detail_description: cm.focus.detail_description || null, non_focus_subjects: cm.focus.non_focus_subjects || undefined, image: cm.focus.image, point_pct: cm.focus.point_pct, rule: cm.focus.text || 'this subject is the hero: centered and sharpest'} : null,
    macro_detail: cm.detail ? {detail: cm.detail.part, of: cm.detail.of, approx_size_cm: cm.detail.size_cm, shot: k.dShot?.name || 'detail', look: 'macro lens, razor-thin focus, micro texture'} : null,
    camera_angle: {
      azimuth_deg: Math.round(A.a), azimuth_view: A.label,
      elevation_deg: E.el, elevation_view: E.label,
      roll_dutch_deg: Math.round(S.roll),
      distance_m: rnd(S.dist, 3), horizontal_distance_m: rnd(hd, 3), height_vs_subject_center_m: rnd(hy, 3),
      camera_pitch_deg: -E.el, look_at: cm.detail ? cm.detail.part : cm.focus?.target || 'subject_center',
      visible_sides: ang.vis
    },
    framing: {
      shot_scale: shotName, description: shotDesc,
      subject_fills_frame_height_pct: cm.detail ? null : Math.round(Math.min(100, 100 / k.ratio)),
      visible_frame_height_cm: rnd(k.visH * 100, 1),
      aspect_ratio: aspectStr,
      lens_shift_pct: {x: S.offX, y: S.offY}
    },
    camera: cameraJSON(cm),
    depth_of_field: {
      enabled: S.dof, mode: cm.isPhone && S.dof ? 'portrait_mode' : S.dof ? 'optical_shallow' : 'deep_focus',
      aperture: apStr(cm.N), focus_distance_m: rnd(S.dist, 3), focus_on: cm.detail ? cm.detail.part : cm.focus?.target || 'subject',
      sharp_zone_m: {near: rnd(k.near, 3), far: k.far === Infinity ? 'infinity' : rnd(k.far, 3)},
      background: cm.bgBlur
    },
    lighting: lightingJSON(cm),
    background: {setting: cm.bgText, from_this_angle: ang.bgView, rule: 'the background must change with the camera angle, never reuse the reference background unchanged'},
    style: {look: 'photorealistic', camera_look: body.look, quality: 'high detail, sharp, natural textures'},
    notes: cm.customNotes.length ? cm.customNotes : null,
    negative_prompt: cm.negative
  };
}
function cameraJSON(cm) {
  const {k, body} = cm;
  return {
    body: body.name,
    sensor: {name: body.sensorName, width_mm: rnd(k.sW, 1), height_mm: rnd(k.sH, 1), crop_factor: rnd(36 / k.sW, 2)},
    lens: cm.lensName,
    focal_length_mm: rnd(S.focal, 1), focal_length_35mm_equiv: cm.eq,
    field_of_view_deg: {horizontal: rnd(k.hfov, 1), vertical: rnd(k.vfov, 1)},
    aperture: apStr(cm.N),
    perspective: cm.lensChar
  };
}
function lightingJSON(cm) {
  if (!S.lightOn) return cm.lightText;
  const st = getSetup();
  return {setup: st.name, category: S.lightCat, description: st.text,
    lights: onLights().map(l => ({role: l.name, angle_from_front_deg: Math.round(signed(l.az)), height_deg: Math.round(l.el), power_pct: Math.round(l.pow),
      color_temperature_k: Math.round(l.k), quality: hardName(l.hard).toLowerCase(), position_vs_camera: lightPhrase(l, S.az).split(',')[0]})),
    summary: cm.lightText};
}

/* ---------- generate / copy ---------- */
const hl = json => esc(json).replace(/("(?:\\.|[^"\\])*")(\s*:)?|(-?\b\d+(?:\.\d+)?\b)|\b(true|false|null)\b/g,
  (m, str, colon, num, kw) => str ? (colon ? `<span class="k">${str}</span>${colon}` : `<span class="s">${str}</span>`)
    : num ? `<span class="n">${num}</span>` : `<span class="b">${kw}</span>`);
const GEN_LABEL = '<svg viewBox="0 0 18 18" aria-hidden="true"><path d="M3 15 12 6m-2-3 1-2 1 2 2 1-2 1-1 2-1-2-2-1zM14 10l.6-1.2L16 8l-1.4-.8L14 6l-.6 1.2L12 8l1.4.8z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>Generate Prompt';
function showEmpty() {
  const what = S.app === 'video' ? '<b>Video</b> or <b>Frame</b>' : '<b>Generate Prompt</b>';
  $('json').innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3H6a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2"/></svg>'
    + `<span>Set the camera, then press ${what}.<br>Your JSON prompt will appear here.</span></div>`;
}
// kind: 'image' (image mode), 'video' (whole video with motion) or 'frame' (the current frame only, no motion)
let lastKind = 'image';
const promptLabel = () => S.app !== 'video' ? 'Image prompt' : lastKind === 'frame' && lastObj ? 'Frame prompt' : 'Video prompt';
function generate(kind) {
  kind = S.app === 'video' ? (kind === 'frame' ? 'frame' : 'video') : 'image';
  const btn = $(kind === 'video' ? 'genVideo' : kind === 'frame' ? 'genFrame' : 'genBtn');
  if (document.querySelector('#pPrompt .btn.busy')) return;
  const keepX = window.scrollX, keepY = window.scrollY, label = btn.innerHTML;
  const hold = () => window.scrollTo(keepX, keepY);
  btn.classList.add('busy'); btn.innerHTML = '<span class="spin"></span>' + (kind === 'image' ? 'Generating…' : '');
  $('json').innerHTML = '<div class="empty"><span class="spin" style="width:22px;height:22px"></span>Building your prompt…</div>';
  setTimeout(() => {
    try {
      lastObj = kind === 'video' && hooks.buildVideoPrompt ? hooks.buildVideoPrompt()
        : kind === 'frame' && hooks.buildFramePrompt ? hooks.buildFramePrompt() : buildImagePrompt();
      lastKind = kind;
      $('json').innerHTML = hl(JSON.stringify(lastObj, null, 2));
      $('status').textContent = 'Up to date'; $('status').classList.remove('stale');
    } catch (e) {
      console.error(e); lastObj = null;
      $('json').innerHTML = '<div class="empty">Could not build the prompt. Check the settings and try again.</div>';
    }
    $('promptKind').textContent = promptLabel();
    $('json').scrollTop = 0;
    btn.classList.remove('busy'); btn.innerHTML = label;
    hold(); requestAnimationFrame(hold);
  }, 100);
  hold();
}
$('genBtn').innerHTML = GEN_LABEL;
$('genBtn').onclick = () => generate('image');
$('genVideo').onclick = () => generate('video');
$('genFrame').onclick = () => generate('frame');
async function copyText(text, el) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (e) {
    const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    toast('Copy was blocked. The text is selected: press Ctrl+C');
  }
}
$('copyBtn').onclick = () => { if (!lastObj) { toast('Generate a prompt first'); return; } copyText(JSON.stringify(lastObj, null, 2), $('json')); };
$('copyMaster').onclick = () => { if (!lastObj) { toast('Generate a prompt first'); return; } copyText(lastObj.master_prompt, $('json')); };
let tt;
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2200); }
function resetPrompt() { lastObj = null; showEmpty(); $('status').textContent = 'Not generated yet'; $('status').classList.remove('stale'); }

/* ---------- layout: dockable tabbed panels in both modes ---------- */
function place(parent, ids) { ids.forEach(id => { const el = $(id); if (el) parent.appendChild(el); }); }
const panelName = id => $(id)?.dataset.name || id;
const mode = () => S.app === 'video' ? 'video' : 'image';
function dockOf(m = mode()) {
  S.docks = S.docks || {};
  const cols = Object.keys(DOCK_COLS[m]);
  let d = S.docks[m];
  if (!d || cols.some(c => !Array.isArray(d[c])) || Object.keys(d).some(c => !cols.includes(c))) d = DEFAULT_DOCK(m);
  const seen = new Set();
  cols.forEach(c => {
    d[c] = d[c].map(g => ({tabs:(g.tabs || []).filter(id => DOCKABLE[m].includes(id) && !seen.has(id) && seen.add(id)), active:g.active, collapsed:!!g.collapsed}))
      .filter(g => g.tabs.length);
    d[c].forEach(g => {
      if (S.mode !== 'adv' && g.active === 'pCam') g.active = g.tabs.find(id => id !== 'pCam') || g.tabs[0];
      if (!g.tabs.includes(g.active)) g.active = g.tabs[0];
    });
  });
  let missing = DOCKABLE[m].filter(id => !seen.has(id));
  if (missing.includes('pPresets')) {
    let outGrp = null;
    cols.forEach(c => d[c].forEach(g => { if (g.tabs.includes('pOutput')) outGrp = g; }));
    if (outGrp) { outGrp.tabs.push('pPresets'); missing = missing.filter(id => id !== 'pPresets'); }
  }
  if (missing.length) d[cols[cols.length - 1]].push({tabs:missing, active:missing[0]});
  return (S.docks[m] = d);
}
let dragPid = null;
function renderDock() {
  const m = mode(), d = dockOf(m), hold = $('vHold');
  [...new Set([...DOCKABLE.image, ...DOCKABLE.video])].forEach(id => hold.appendChild($(id)));
  Object.entries(DOCK_COLS[m]).forEach(([col, boxId]) => {
    const box = $(boxId); [...box.children].forEach(ch => ch.remove());
    const zone = gi => { const z = document.createElement('div'); z.className = 'dropzone'; z.dataset.col = col; z.dataset.gi = gi; return z; };
    box.appendChild(zone(0));
    d[col].forEach((g, gi) => {
      const singleSw = g.tabs.length === 1 && $(g.active)?.classList.contains('has-sw');
      const el = document.createElement('div'); el.className = 'tgroup' + (g.collapsed ? ' collapsed' : '') + (singleSw ? ' single-sw' : ''); el.dataset.col = col; el.dataset.gi = gi;
      const bar = document.createElement('div'); bar.className = 'tabbar'; bar.setAttribute('role', 'tablist');
      g.tabs.forEach(id => {
        const isCamLocked = id === 'pCam' && (S.mode !== 'adv' || !PRO);
        const isLocked = isCamLocked || (!PRO && LOCKED_PANELS.includes(id));
        const t = document.createElement('button'); t.type = 'button'; t.className = 'tab' + (isLocked ? ' locked' : ''); t.draggable = !isCamLocked; t.dataset.pid = id;
        t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', id === g.active ? 'true' : 'false');
        t.innerHTML = esc(panelName(id)) + (isCamLocked ? LOCK : '');
        t.title = isCamLocked ? 'Camera & lens is available in Advanced mode' : id === g.active ? 'Click to minimize or open · drag onto another panel to join it, or between panels to move it' : 'Click to show · drag to move';
        bar.appendChild(t);
      });
      const st = $(g.active)?.querySelector('.shead .tag');
      if (st) { st.draggable = true; st.dataset.pid = g.active; }
      el.append(bar, $(g.active)); box.appendChild(el); box.appendChild(zone(gi + 1));
    });
  });
}
function movePanel(pid, col, gi, asTab) {
  const d = dockOf();
  let srcCol, srcGi;
  Object.keys(d).forEach(c => d[c].forEach((g, i) => { if (g.tabs.includes(pid)) { srcCol = c; srcGi = i; } }));
  if (srcCol === undefined || !d[col]) return;
  if (asTab && srcCol === col && srcGi === gi) return;
  const src = d[srcCol][srcGi];
  src.tabs = src.tabs.filter(t => t !== pid);
  if (src.active === pid) src.active = src.tabs[0];
  if (!src.tabs.length) { d[srcCol].splice(srcGi, 1); if (srcCol === col && srcGi < gi) gi--; }
  if (asTab) { const g = d[col][gi]; if (g) { g.tabs.push(pid); g.active = pid; g.collapsed = false; } }
  else d[col].splice(gi, 0, {tabs:[pid], active:pid});
  renderDock(); afterLayout(); changed();
}
function showPanel(pid) {
  const d = dockOf();
  Object.values(d).forEach(groups => groups.forEach(g => { if (g.tabs.includes(pid)) { g.active = pid; g.collapsed = false; } }));
  renderDock(); afterLayout(); save();
  requestAnimationFrame(() => $(pid)?.scrollIntoView({block:'nearest', behavior:'smooth'}));
}
function afterLayout() { requestAnimationFrame(() => { drawAll(); placeMark(); hooks.render?.(); hooks.afterDock?.(); fitPrompt(); }); }
// tabs & in-box section headers (.shead): click to switch or minimize/expand with no restriction in Normal mode; toggles inside .shead handle their own click
document.addEventListener('click', e => {
  if (e.target.closest('.switch')) return;
  const sh = e.target.closest('.shead');
  if (sh) {
    const grp = sh.closest('.tgroup');
    if (grp) {
      const g = dockOf()[grp.dataset.col]?.[+grp.dataset.gi]; if (!g) return;
      g.collapsed = !g.collapsed; renderDock(); afterLayout(); changed(); return;
    }
    const card = sh.closest('.card[id]');
    if (card) { S.min[card.id] = !S.min[card.id]; save(); syncUI(); requestAnimationFrame(() => { drawAll(); placeMark(); }); return; }
  }
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.dataset.pid === 'pCam' && (S.mode !== 'adv' || !PRO)) { needAdv('Camera & lens'); return; }
  const grp = t.closest('.tgroup'), g = dockOf()[grp.dataset.col]?.[+grp.dataset.gi]; if (!g) return;
  if (g.active === t.dataset.pid) g.collapsed = !g.collapsed; else { g.active = t.dataset.pid; g.collapsed = false; }
  renderDock(); afterLayout(); changed();
});
document.addEventListener('dragstart', e => {
  const t = e.target.closest?.('.tab, .shead .tag[data-pid]'); if (!t) return;
  if (t.dataset.pid === 'pCam' && (S.mode !== 'adv' || !PRO)) { e.preventDefault(); return; }
  dragPid = t.dataset.pid; t.classList.add('dragging'); document.body.classList.add('dragging-tab');
  e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragPid);
});
document.addEventListener('dragend', () => { dragPid = null; document.body.classList.remove('dragging-tab'); document.querySelectorAll('.over').forEach(x => x.classList.remove('over')); document.querySelectorAll('.tab.dragging').forEach(x => x.classList.remove('dragging')); });
document.addEventListener('dragover', e => {
  if (!dragPid) return;
  const z = e.target.closest?.('.tgroup, .dropzone'); document.querySelectorAll('.over').forEach(x => x !== z && x.classList.remove('over'));
  if (z) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; z.classList.add('over'); }
});
document.addEventListener('drop', e => {
  if (!dragPid) return;
  const z = e.target.closest?.('.tgroup, .dropzone'); if (!z) return;
  e.preventDefault();
  const pid = dragPid; dragPid = null; document.body.classList.remove('dragging-tab'); z.classList.remove('over');
  movePanel(pid, z.dataset.col, +z.dataset.gi, z.classList.contains('tgroup'));
});
$('resetLayout').addEventListener('click', () => { S.docks[mode()] = DEFAULT_DOCK(mode()); renderDock(); afterLayout(); changed(); toast('Layout reset'); $('resetLayout').blur(); });
let armT = 0;
$('resetAll').addEventListener('click', () => {
  const b = $('resetAll');
  if (!b.classList.contains('armed')) {
    b.classList.add('armed'); b.firstChild.textContent = 'Click again to erase everything';
    clearTimeout(armT); armT = setTimeout(() => { b.classList.remove('armed'); b.firstChild.textContent = 'Full reset'; }, 3500);
    return;
  }
  try { localStorage.removeItem('anglecraft-v1'); } catch (e) {}
  location.reload();
});

// height of the top bar, so the video workspace can fill exactly the rest of the screen
function measureNav() { const n = document.querySelector('.nav'); if (n) root.style.setProperty('--navh', Math.ceil(n.getBoundingClientRect().height + 10) + 'px'); }
// in both image and video mode the prompt box takes the room under Output so its bottom aligns with Top & Front views (or Timeline)
function fitPrompt() {
  const pre = $('json'), card = $('pPrompt'), col = $(S.app === 'video' ? 'vRight' : 'iRight');
  pre.style.height = '';
  if (!col.contains(card) || innerWidth < 1251 || card.closest('.tgroup')?.classList.contains('collapsed')) return;
  const refEl = S.app === 'video' ? $('pTimeline') : $('pairViews');
  const refRect = refEl?.getBoundingClientRect();
  const targetBottom = (refRect && refRect.height > 20) ? (refRect.bottom - 1) : (col.getBoundingClientRect().bottom - 12);
  const extra = card.getBoundingClientRect().height - pre.offsetHeight;
  const space = targetBottom - card.getBoundingClientRect().top;
  pre.style.height = clamp(Math.floor(space - extra), 80, 520) + 'px';
}
window.addEventListener('resize', () => { measureNav(); fitPrompt(); });
document.fonts?.ready.then(() => { measureNav(); fitPrompt(); });
function applyLayout() {
  measureNav();
  const video = S.app === 'video';
  document.body.classList.toggle('video', video);
  if (video) { place($('vThree'), ['pOrbit', 'pTop', 'pSide']); place($('iTools'), ['pFocus']); }
  else { $('iCenter').prepend($('pOrbit')); place($('orbitSide'), ['pTop', 'pSide']); place($('pairViews'), ['pFocus']); }
  renderDock();
  resetPrompt();
  syncUI();
  afterLayout();
}

/* ---------- boot ---------- */
readTokens();
buildStatic();
document.querySelectorAll('select').forEach(enhance);
renderRefs();
if (S.app === 'video' && (!S.video.ready || !PRO)) S.app = 'image';
enforce();
showEmpty();
const ro = new ResizeObserver(() => { drawAll(); placeMark(); });
['globe', 'top', 'side', 'lightDial', 'focusImg', 'focusPic'].forEach(id => ro.observe($(id)));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawAll(); hooks.themeChanged?.(); });
applyLayout();
syncUI();
drawAll();
snapshot();

window.AC = {S, DEF, refs, $, rad, deg, clamp, norm360, signed, rnd, cap, joinList, esc, escAttr, hl, mStr,
  BODIES, SUBJ, SHOTS, KEYS, LIGHTS, ROLES, TYPE_NAME, IMG_PRESETS, C, hooks,
  calc, getBody, getLens, setAz, setEl, setDist, setFocal, distForShot, allSubjects, currentThumb, sampleImg, onLights,
  changed, applyQuiet, syncUI, drawAll, readTokens, fit, drawCam, drawArrow, drawThumb, toast, enhance, refreshDD,
  common, angleParts, azInfo, elInfo, lensCharFor, lightPhrase, rigText, cameraJSON, lightingJSON, getSetup, kelvinRGB, apStr, hardName, buildImagePrompt,
  applyLayout, switchModeState, renderRefs, renderImgPresets, loadUserImgPresets, saveUserImgPresets, resetPrompt, save, views, DMIN, DMAX, showPanel, rigTarget, setIfIdle, undo, redo,
  isPro:() => PRO, setPro, needAdv, hideAdv, GATED};
document.dispatchEvent(new Event('ac-ready'));
})();
