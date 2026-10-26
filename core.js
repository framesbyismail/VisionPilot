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
  {id:'iphone18pro', group:'Smartphone', name:'Apple iPhone 18 Pro', sensorW:9.8, crop:3.67, kind:'phone', mount:'iphone', sensorName:'1/1.28" main sensor',
   look:'iPhone 18 Pro photo look: crisp computational HDR, natural Apple color science'},
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
  // video mode only, but used by both the Video and the Image prompt (frameText for the still)
  {id:'refguide', name:'Reference Video / Image', video:true, both:true,
   text:'Reference video is the motion master: reproduce its camera movement exactly, with the same path, direction, speed, timing, easing, framing and subject placement from the first frame to the last, and follow its subject motion and blocking beat for beat. Treat the reference video strictly as a movement guide: never copy its look, stand-in shapes, textures or colors, and never add, skip, reverse or soften any camera move',
   frameText:'Reference image is the composition master: match its exact camera angle, camera height, distance, lens perspective, framing, and the subject\'s position, scale and pose inside the frame. Treat the reference image strictly as a composition guide: never copy its look, stand-in shapes, textures or colors, and do not shift, crop or re-frame the shot'},
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
let S = null;
// panels that can be docked in each mode; Presets sits as a tab beside Output, Animation presets beside Presets in Video & 3D, Object beside Reference in Video & 3D, Upscale beside Reference/Object
const DOCKABLE = {image:['pRef', 'pImgUpscale', 'pAngle', 'pCam', 'pLight', 'pOutput', 'pPresets', 'pPrompt'], video:['pRef', 'pObjects', 'pVidUpscale', 'pAngle', 'pCam', 'pLight', 'pOutput', 'pPresets', 'pAnimPresets', 'pPrompt']};
const dockableFor = m => m === 'video' ? DOCKABLE.video : DOCKABLE.image;
const DOCK_COLS = {image:{L:'iLeft', R:'iRight'}, video:{L:'vLeft', R:'vRight'}};
const DEFAULT_DOCK = mode => mode === 'video' ? {
  L:[{tabs:['pRef', 'pObjects', 'pVidUpscale'], active:'pRef'}, {tabs:['pAngle', 'pCam'], active:'pAngle'}, {tabs:['pLight'], active:'pLight'}],
  R:[{tabs:['pOutput', 'pPresets', 'pAnimPresets'], active:'pOutput'}, {tabs:['pPrompt'], active:'pPrompt'}]
} : {
  L:[{tabs:['pRef', 'pImgUpscale'], active:'pRef'}, {tabs:['pAngle', 'pCam'], active:'pAngle'}, {tabs:['pLight'], active:'pLight'}],
  R:[{tabs:['pOutput', 'pPresets'], active:'pOutput'}, {tabs:['pPrompt'], active:'pPrompt'}]
};

/* ---------- state ---------- */
function rigFrom(setup) {
  const out = {};
  ROLES.forEach(r => { const l = setup.L[r.id]; out[r.id] = l ? {on:true, az:norm360(l[0]), el:l[1], pow:l[2], k:l[3], hard:l[4]} : {on:false, az:r.id === 'bg' ? 180 : 0, el:20, pow:50, k:5600, hard:30}; });
  return out;
}
const DEF_FOCUS = () => ({
  on:false, showMark:true, mode:'single', img:0, x:.5, y:.5, target:'', note:'', where:'',
  detail:false, detailCm:6, desc:'', descPinned:false, singleActive:false, singleKey:'', zoom:1, zoomV2:true, vzoom:3, zoomLocked:false,
  multiSel:'', multiEditOpen:true, multiEdits:{}, multiPart:'', multiWhere:'', multiPartColor:'',
  subjectItems:[], activeSubj:'', activeSubjs:[], lastPointKey:''
});
const DEF = {app:'image', mode:'normal', aiModel:'visionpilot', az:35, el:12, dist:2.4, roll:0, bodyId:'iphone18pro', lensId:'ip24', focal:24 / 3.67, sensorW:9.8, aperture:1.78, dof:true, camDefV2:true,
  offX:0, offY:0, subjType:'person', count:1, types:[], subjCm:175, subjColor:'#e85d2b', subjDesc:'', descPinned:false, descPinnedAt:0, descUserEdited:false, refView:'front', refBg:0,
  aspect:'4:5', aspectCustom:'', light:'match', lightCustom:'', bg:'keep', bgCustom:'', bgPinned:'', extra:'', customKeys:[],
  imgPresetId:'', imgPresetPrompt:'',
  keys:['4k','face','product','char','outfit','logo','real','detail','photo','skin','anatomy','light','sharp','clean','live','consist','mblur','stable','physics','speed','cine','parallax','nocut','refguide'], keysV2:true, keysV3:true, keysV4:true, keysV5:true,
  focus:DEF_FOCUS(),
  lightOn:false, lightCat:'person', lightSetup:'3point', lights:rigFrom(LIGHTS.person[0]), lightSel:'key',
  min:{}, docks:{image:DEFAULT_DOCK('image'), video:DEFAULT_DOCK('video')},
  modeStates:{},
  video:{ready:true, duration:5, fps:24, objects:[], tracks:{}, guides:true, path:true, ground:true, loop:true, autokey:true, showTracks:false,
    subjDetails:{},
    focus:{on:false, showMark:false, target:'', targets:[], note:'', pos:[0, .9, 0]}}};
const MODE_KEYS = ['az', 'el', 'dist', 'roll', 'bodyId', 'lensId', 'focal', 'sensorW', 'aperture', 'dof',
  'offX', 'offY', 'subjType', 'count', 'types', 'subjCm', 'subjColor', 'subjDesc', 'descPinned', 'descPinnedAt', 'descUserEdited', 'descEn', 'descSrc',
  'refView', 'refBg', 'aspect', 'aspectCustom', 'light', 'lightCustom', 'bg', 'bgCustom', 'bgPinned', 'extra', 'customKeys', 'keys',
  'focus', 'lightOn', 'lightCat', 'lightSetup', 'lights', 'lightSel', 'imgPresetId', 'imgPresetPrompt'];
const refsByMode = {image:[], video:[]};
S = JSON.parse(JSON.stringify(DEF));
try {
  const saved = JSON.parse(localStorage.getItem('anglecraft-v1') || 'null');
  if (saved) {
    S = {...S, ...saved};
    if (S.bodyId === 'iphone17pro') S.bodyId = 'iphone18pro';
    if (!saved.camDefV2) {
      S.bodyId = DEF.bodyId;
      S.lensId = DEF.lensId;
      S.focal = DEF.focal;
      S.sensorW = DEF.sensorW;
      S.aperture = DEF.aperture;
      S.dof = DEF.dof;
      S.camDefV2 = true;
    }
    if (!['visionpilot', 'claude', 'gpt', 'gemini'].includes(S.aiModel)) S.aiModel = 'visionpilot';
    // Reference images live only in memory; clear stale per-image descriptions from previous sessions on fresh load
    S.subjDesc = '';
    S.descUserEdited = false;
    S.focus = {...DEF_FOCUS(), ...(saved.focus || {}), desc:'', multiEdits:{}, multiMarkerText:'', subjectItems:[], activeSubjs:[], activeSubj:'', target:'', singleActive:false};
    if (S.focus.mode === 'multi') S.focus.showMark = false;
    else if (saved.focus?.showMark === undefined) S.focus.showMark = true;
    S.focus.multiEditOpen = true;
    if (!saved.focus?.zoomV2) { S.focus.zoom = 1; S.focus.zoomV2 = true; }
    S.focus.zoom = clamp(+S.focus.zoom || 1, 1, 8);
    if (!Array.isArray(S.focus.activeSubjs)) S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
    S.video = {...JSON.parse(JSON.stringify(DEF.video)), ...(saved.video || {}), ready:true};
    S.video.subjDetails = {...(saved.img3d?.subjDetails || {}), ...(saved.video?.subjDetails || {})};
    S.video.focus = {...DEF.video.focus, ...(saved.video?.focus || {})};
    // 3D Mode Point 3: Focus Marker must be OFF by default
    if (!saved.video?.focus?.focusMarkV4) {
      S.video.focus.showMark = false;
      S.video.focus.on = false;
      S.video.focus.target = '';
      S.video.focus.targets = [];
      S.video.focus.focusMarkV4 = true;
    }
    if (!Array.isArray(S.video.focus.targets)) S.video.focus.targets = S.video.focus.target ? [S.video.focus.target] : [];
    delete S.img3d;
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
  const defForMode = nextApp === 'video' ? {...DEF, aspect: '16:9'} : DEF;
  const src = S.modeStates?.[nextApp] || defForMode;
  MODE_KEYS.forEach(k => {
    const val = src[k] !== undefined ? src[k] : defForMode[k];
    if (val !== undefined) S[k] = JSON.parse(JSON.stringify(val));
  });
  if (nextApp === 'video' && !S.modeStates?.video?.aspect) {
    S.aspect = '16:9';
  }
  S.focus = {...DEF_FOCUS(), ...(S.focus || {})};
  if (nextApp === 'video') {
    S.focus.showMark = false;
    if (S.video?.focus) S.video.focus.showMark = false;
  }
  const targetRefs = (refsByMode[nextApp] && refsByMode[nextApp].length) ? refsByMode[nextApp] : refs.slice();
  refs.splice(0, refs.length, ...targetRefs);
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

const getBody = () => BODIES.find(b => b.id === S.bodyId) || BODIES[0];
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
  if (!PRO) {
    S.mode = 'normal'; S.lightOn = false; S.focus.on = false;
    S.light = 'match'; S.bg = 'keep';
  } else if (S.mode !== 'adv') {
    S.focus.on = false; S.lightOn = false;
  }
}
// If the user has Advanced mode (PRO) and clicks an off/locked control while in Normal mode, automatically switch to Advanced mode
function ensureAdvMode(what) {
  if (!PRO) {
    needAdv(what);
    return false;
  }
  if (S.mode !== 'adv') {
    S.mode = 'adv';
    document.body.classList.add('adv');
    if ($('modeNormal')) $('modeNormal').hidden = true;
    if ($('modeAdv')) $('modeAdv').disabled = true;
    renderDock();
    afterLayout();
    toast('Advanced mode enabled');
  }
  return true;
}
// the one "Advanced mode needed" panel every locked control uses; auth.js fills in the sign-in / request buttons
function needAdv(what) {
  $('advMsg').textContent = (what ? what + ' is part of Advanced mode. ' : '')
    + 'Advanced mode opens Video & 3D, Lighting, Camera & lens, Focus point, Extra notes, 4x/4K Upscaling and every background and lighting preset. Send a request and framesbyismail will give you access.';
  hooks.advRender?.();
  if ($('advPopBackdrop')) $('advPopBackdrop').hidden = false;
  $('advPop').classList.add('show');
}
function hideAdv() {
  $('advPop').classList.remove('show');
  if ($('advPopBackdrop')) $('advPopBackdrop').hidden = true;
}
$('advClose').addEventListener('click', hideAdv);
$('advPopBackdrop')?.addEventListener('click', hideAdv);
document.addEventListener('keydown', e => { if (e.key === 'Escape') hideAdv(); });

// Normal mode user reminder: every 15 minutes, show the centered Advanced Mode prompt window
const ADV_REMINDER_INTERVAL_MS = 15 * 60 * 1000;
function triggerNormalModeAdvReminder() {
  if (S.mode !== 'adv') {
    needAdv('Upgrade to Advanced Mode');
  }
}
setInterval(triggerNormalModeAdvReminder, ADV_REMINDER_INTERVAL_MS);
window.__triggerAdvReminderForTest = triggerNormalModeAdvReminder;
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
    const it = document.createElement('div'), locked = (S.mode !== 'adv' || !PRO) && o.hasAttribute('data-adv');
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
    const optEl = [...sel.options].find(o => o.value === v);
    if (optEl?.hasAttribute('data-adv') && S.mode !== 'adv') {
      if (!ensureAdvMode(`"${optEl.textContent.replace('…', '')}"`)) { d.btn.focus(); return; }
    }
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
  const isAdv = S.mode === 'adv';
  document.body.classList.toggle('adv', isAdv);
  document.body.classList.toggle('pro', PRO);
  document.body.classList.toggle('video', S.app === 'video');
  if ($('modeNormal')) {
    $('modeNormal').setAttribute('aria-pressed', !isAdv);
    $('modeNormal').hidden = isAdv;
  }
  if ($('modeAdv')) {
    $('modeAdv').setAttribute('aria-pressed', isAdv);
    $('modeAdv').setAttribute('aria-disabled', isAdv ? 'true' : 'false');
    $('modeAdv').tabIndex = isAdv ? -1 : 0;
  }
  if ($('vpDrawerUserMode')) {
    $('vpDrawerUserMode').textContent = isAdv ? 'Advanced' : 'Normal';
  }
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
  $('dofBtn').innerHTML = `DOF Blur<span class="sub">${S.dof ? 'On' : 'Off'}</span>`;
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
  syncAIModelUI();
  document.querySelectorAll('input[type=range]').forEach(fill);
  DD.forEach((d, sel) => refreshDD(sel));
  $('globeRO').textContent = `AZ ${Math.round(sa)}° · EL ${Math.round(S.el)}° · ${mStr(S.dist)}`;
  if (S.app !== 'video' && S.min?.pFocus) delete S.min.pFocus;
  document.querySelectorAll('.view[id], .card.has-sw[id]').forEach(p => p.classList.toggle('min', !!(S.min[p.id] && !(p.id === 'pFocus' && S.app !== 'video') && !(S.app === 'video' && p.closest('#vThree'))) && !p.closest('.tgroup')));
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
  const key = JSON.stringify(S.customKeys) + S.app + (S.descPinned ? '|' + S.subjDesc + '|' + (S.descPinnedAt || 0) : '');
  if (key !== keysKey) { requestAnimationFrame(() => fitPrompt?.());
    keysKey = key;
    const topItems = [];
    if (S.descPinned && S.subjDesc.trim()) {
      topItems.push({
        at: S.descPinnedAt || 1,
        html: `<button class="tog extra" data-k="__desc" aria-pressed="true" title="${escAttr(S.subjDesc.trim())}">${esc(shortNote('Subject: ' + S.subjDesc.trim()))}<span class="del" data-del="__desc" role="button" aria-label="Remove the subject description from the prompt" title="Remove from prompt"><svg class="vp-x-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>`
      });
    }
    S.customKeys.forEach((c, idx) => {
      topItems.push({
        at: c.addedAt || (S.customKeys.length - idx),
        html: `<button class="tog extra y" data-k="${c.id}" aria-pressed="false" title="${escAttr(c.text)}">${esc(shortNote(c.text))}`
          + `<span class="del" data-del="${c.id}" role="button" aria-label="Delete note" title="Delete note"><svg class="vp-x-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>`
      });
    });
    topItems.sort((a, b) => (b.at || 0) - (a.at || 0));
    $('keys').innerHTML = topItems.map(x => x.html).join('')
      + keyList().map(k => `<button class="tog" data-k="${k.id}" aria-pressed="false">${k.name}</button>`).join('');
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
      + custom.map(c => `<div class="pitem-wrap"><button type="button" class="pitem custom" data-ipreset="${escAttr(c.id)}" aria-pressed="${S.imgPresetId === c.id}" title="${escAttr(c.prompt || c.name)}">${esc(c.name)}</button><button type="button" class="pdel" data-ipdel="${escAttr(c.id)}" title="Delete preset" aria-label="Delete ${escAttr(c.name)}"><svg class="vp-x-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>`).join('')
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
let rafId = 0, bgPromptTimer = 0, saveTimer = 0, lastObj = null, bgImagePromptObj = null, quiet = false;
function queueSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = 0;
    save();
  }, 140);
}
window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    save();
  }
});
function changed() {
  enforce();
  if (typeof syncScaleButtonsLockState === 'function') syncScaleButtonsLockState();
  if (!quiet) { hooks.onChange?.(); queueSnapshot(); }
  queueSave();
  if (!rafId) rafId = requestAnimationFrame(() => {
    rafId = 0;
    syncUI();
    drawAll();
    hooks.render?.();
    if (S.app !== 'video') {
      clearTimeout(bgPromptTimer);
      bgPromptTimer = setTimeout(() => {
        try { bgImagePromptObj = buildImagePrompt(); } catch (e) {}
      }, 160);
    }
    if (typeof syncImageUpscalerUI === 'function') syncImageUpscalerUI();
  });
  if (lastObj) { $('status').textContent = 'Settings changed · generate again'; $('status').classList.add('stale'); }
}
// apply values without treating them as user edits (used by the timeline)
function applyQuiet(fn) { quiet = true; try { fn(); changed(); } finally { quiet = false; } }

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
  refs.forEach((r, ri) => ((r.subjects && r.subjects.length) ? r.subjects : (r.det?.subjects?.length ? r.det.subjects : [{type:S.subjType, desc:'', cm:S.subjCm}])).forEach((s, si) => {
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
        detail:`${label}: ${TYPE_NAME[t].toLowerCase()} in frame, front-facing view.`,
        cm:S.subjCm, label, uiColor, box, boxes:[box], key:`def_s${i}`, img:-1, idx:i
      });
    }
  }
  return out;
}
let lastAIError = '';
let aiBusyMsg = '';
let aiConnectedOk = false;
let aiModelSessionEpoch = 1;

function cancelAllRunningAIWork() {
  aiModelSessionEpoch++;
  if (window.VPLocalWriter?.cancelAll) {
    try { window.VPLocalWriter.cancelAll(); } catch (e) {}
  }
  queue.length = 0;
  busyDetect = false;
  refs.forEach((r) => {
    if (!r) return;
    r._vpRefPromise = null;
    if (r.status === 'busy') r.status = 'ok';
  });
  if (typeof setFocusDetailLoading === 'function') setFocusDetailLoading(false);
  setDescLoading(false);
  renderRefs();
}

function stripNumberedSubjectLabels(text) {
  return String(text || '')
    .replace(/\b(Person|Product|Object|Subject|Vehicle|Animal)\s*\d+\s*:\s*/gi, 'A $1 ')
    .replace(/\b(Person|Product|Object|Subject|Vehicle|Animal)\s*\d+\b/gi, '$1')
    .replace(/\s*\[(Human|Product\/Object|Animal|Vehicle)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureVpRefDesc(ref, opts = {}) {
  const myEpoch = aiModelSessionEpoch;
  if ((S.aiModel || 'visionpilot') !== 'visionpilot') return '';
  if (!ref || ref.cancelled || !refs.includes(ref) || !window.VPLocalWriter?.writeReferenceDescription) return '';
  if (ref.vpRefDesc && !opts.forceRegen) return ref.vpRefDesc;
  if (!ref._vpRefPromise || opts.forceRegen) {
    ref._vpRefPromise = (async () => {
      try {
        await ref.ready;
      } catch (e) {}
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) return '';
      const raw = await window.VPLocalWriter.writeReferenceDescription(ref.img, {
        onProgress: (msg) => {
          if (myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === 'visionpilot' && typeof opts.onProgress === 'function') {
            opts.onProgress(msg);
          }
        }
      });
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) return '';
      const clean = stripNumberedSubjectLabels(raw);
      if (!ref.cancelled && refs.includes(ref) && clean) {
        ref.vpRefDesc = clean;
      }
      return clean;
    })().finally(() => {
      ref._vpRefPromise = null;
    });
  }
  return ref._vpRefPromise;
}

function updateAutoDescription(force = false) {
  if (S.descUserEdited && !force) return;
  const activeModel = S.aiModel || 'visionpilot';
  const myEpoch = aiModelSessionEpoch;
  const r = refs[S.focus.img] || refs[0];

  // When an external AI model (Claude / GPT / Gemini) is active, NEVER use local VisionPilot AI descriptions.
  // Only paste the real reply received from the external AI tab.
  if (activeModel !== 'visionpilot') {
    if (r?.aiRefDesc) {
      S.subjDesc = r.aiRefDesc;
      setIfIdle($('subjDesc'), S.subjDesc);
    } else if (force) {
      S.subjDesc = '';
      setIfIdle($('subjDesc'), '');
    }
    return;
  }

  if (!refs.length || !r) {
    if (force) {
      S.subjDesc = '';
      setIfIdle($('subjDesc'), '');
    }
    return;
  }

  // Always use the whole-image Stage 1 VisionPilot AI Reference Description (never mention Person 1, 2, Product 1, 2, Object 1, 2)
  if (r.vpRefDesc) {
    const clean = stripNumberedSubjectLabels(r.vpRefDesc);
    S.subjDesc = clean;
    setIfIdle($('subjDesc'), S.subjDesc);
    return;
  }

  if (window.VPLocalWriter?.writeReferenceDescription) {
    ensureVpRefDesc(r).then((vpText) => {
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot') return;
      if (vpText && (!S.descUserEdited || force) && (refs[S.focus.img] === r || refs[0] === r)) {
        S.subjDesc = vpText;
        setIfIdle($('subjDesc'), S.subjDesc);
      }
    }).catch(() => {});
    return;
  }

  if (r?.det && window.VPDetect?.buildSceneParagraph) {
    const para = stripNumberedSubjectLabels(window.VPDetect.buildSceneParagraph(r.det, { customSubjects: currentImgSubjects() }));
    if (para) {
      S.subjDesc = para;
      setIfIdle($('subjDesc'), S.subjDesc);
    }
  }
}
function applySummary(forceDesc = false) {
  if (!refs.length) return;
  if (S.refBg >= refs.length) S.refBg = 0;
  if (S.focus.img >= refs.length) S.focus.img = 0;

  const activeModel = S.aiModel || 'visionpilot';
  const rCur = refs[S.focus.img] || refs[0];

  // When Single Mode is active, built-in image detection is OFF
  if (S.focus.mode !== 'multi') {
    updateAutoDescription(forceDesc);
    if (activeModel !== 'visionpilot') {
      if (rCur?.aiSingleFocusDesc) {
        S.focus.desc = rCur.aiSingleFocusDesc;
        setIfIdle($('focusDesc'), S.focus.desc);
      } else if (forceDesc) {
        S.focus.desc = '';
        setIfIdle($('focusDesc'), '');
      }
    } else if (rCur?.vpSingleFocusDesc) {
      S.focus.desc = rCur.vpSingleFocusDesc;
      setIfIdle($('focusDesc'), S.focus.desc);
    }
    return;
  }

  const all = allSubjects();
  const main = all.reduce((a, s) => (s.area || 0) > (a.area || 0) ? s : a, all[0]);
  if (main) {
    S.count = all.length; S.types = all.map(s => s.type); S.subjType = main.type;
    if (main.color) S.subjColor = main.color;
    const hs = all.map(s => s.cm).filter(h => isFinite(h) && h > 0);
    S.subjCm = hs.length ? Math.round(Math.max(...hs)) : SUBJ[S.subjType].cm;
  }
  updateAutoDescription(forceDesc);
  S.refView = refs[0].view || 'front';

  if (activeModel !== 'visionpilot') {
    // External AI mode: only populate from real external AI replies, never from VisionPilot's local detector
    if (rCur?.aiSingleFocusDesc) {
      S.focus.desc = rCur.aiSingleFocusDesc;
      setIfIdle($('focusDesc'), S.focus.desc);
    } else if (forceDesc) {
      S.focus.desc = '';
      setIfIdle($('focusDesc'), '');
    }
    if (rCur?.aiMultiEdits) {
      S.focus.multiEdits = {...(S.focus.multiEdits || {}), ...rCur.aiMultiEdits};
      if (S.focus.multiSel && $('focusMultiText') && S.focus.multiEdits[S.focus.multiSel]) {
        setIfIdle($('focusMultiText'), S.focus.multiEdits[S.focus.multiSel]);
      }
    }
    return;
  }

  // Built-in VisionPilot AI mode (Multiple Mode)
  if (rCur?.vpMultiEdits) {
    S.focus.multiEdits = {...(S.focus.multiEdits || {}), ...rCur.vpMultiEdits};
  }
  if (forceDesc) {
    S.focus.multiEdits = S.focus.multiEdits || {};
    all.forEach(s => {
      if ((forceDesc && !rCur?.vpMultiEdits?.[s.key]) || !S.focus.multiEdits[s.key]) {
        S.focus.multiEdits[s.key] = rCur?.vpMultiEdits?.[s.key] || s.detail || s.desc || s.label;
      }
    });
    if (S.focus.multiSel && $('focusMultiText') && S.focus.multiEdits[S.focus.multiSel]) {
      setIfIdle($('focusMultiText'), S.focus.multiEdits[S.focus.multiSel]);
    }
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
  if (typeof syncFocusLockState === 'function') syncFocusLockState();
  while (queue.length) {
    const ref = queue.shift();
    if (!refs.includes(ref)) continue;
    await detectRef(ref);
  }
  busyDetect = false;
  if (typeof syncFocusLockState === 'function') syncFocusLockState();
}
function mapDetSubjects(det) {
  const counts = {};
  return (det?.subjects || []).slice(0, 20).map((s, idx) => {
    const t = s.type || 'auto';
    counts[t] = (counts[t] || 0) + 1;
    const label = s.label || `${TYPE_NAME[t] || 'Subject'} ${counts[t]}`;
    return {
      label,
      type:s.type, category:s.category || (window.VPDetect?.categoryOf ? window.VPDetect.categoryOf(s.type) : 'Product/Object'),
      cls:s.cls, subtype:s.subtype || '', desc:s.desc, detail:s.detail, richSentence:s.richSentence || '',
      angle:s.angle, pose:s.pose, finish:s.finish, condition:s.condition,
      position:s.position, horiz:s.horiz, vert:s.vert, depth:s.depth, cm:s.cm, color:s.color || null, colorName:s.colorName || null,
      uiColor:s.uiColor || FOCUS_PALETTE[idx % FOCUS_PALETTE.length],
      box:s.box || {x:.15, y:.1, w:.7, h:.8},
      boxes:s.boxes && s.boxes.length ? s.boxes : [s.box || {x:.15, y:.1, w:.7, h:.8}],
      parts:s.parts || null, partNames:s.partNames || null, area:(s.box?.w || .5) * (s.box?.h || .5),
      model3d:s.model3d || null, name3d:s.name3d || null, pose3d:s.pose3d || null, viewCode:s.viewCode || 'front', facing:s.facing || '',
      seatedOnChair:!!s.seatedOnChair, pos3d:s.pos3d || null, scale3d:s.scale3d || null
    };
  });
}
function renderLiveAIStatus() {
  const st = $('descStatus');
  if (!st) return;
  const activeId = S.aiModel || 'visionpilot';
  const info = window.VPAIBridge?.getModelInfo ? window.VPAIBridge.getModelInfo(activeId) : {name:'VisionPilot AI', color:'#e85d2b'};
  if (aiBusyMsg) {
    st.innerHTML = `<span class="spin"></span> ${esc(aiBusyMsg)}`;
  } else if (lastAIError && activeId !== 'visionpilot') {
    st.innerHTML = `<span class="ai-live-pill err" style="--aic:#ef4444;border-color:#ef4444;color:#fca5a5"><i></i><b>${esc(info.name)} Error:</b> ${esc(lastAIError)}</span>`;
  } else if (activeId !== 'visionpilot' && aiConnectedOk) {
    st.innerHTML = `<span class="ai-live-pill" style="--aic:${info.color || '#3fb950'}"><i></i><b>${esc(info.name)} Connected</b> — Live Browser Session</span>`;
  } else if (activeId === 'visionpilot' && S.focus.mode === 'multi' && refs.length && refs.some(r => r.status === 'ok' && r.det)) {
    st.innerHTML = `<span class="ai-live-pill vp"><i></i><b>VisionPilot AI</b> — Built-in detector active</span>`;
  } else {
    st.textContent = '';
  }
  const isBusy = Boolean(aiBusyMsg) || refs.some(r => r.status === 'busy');
  const spinHtml = isBusy ? ' <span class="spin ai-tag-spin" aria-hidden="true"></span>' : '';
  const fLbl = document.querySelector('label[for="focusDesc"]');
  if (fLbl) {
    fLbl.innerHTML = (activeId !== 'visionpilot' || isBusy)
      ? `Focus point detail <span class="ai-focus-tag" style="--aic:${info.color || '#e85d2b'}">● ${esc(info.name)}${spinHtml}</span>`
      : 'Focus point detail';
  }
  const fmLbl = document.querySelector('#focusMultiPane > .labrow > .lbl');
  if (fmLbl) {
    fmLbl.innerHTML = (activeId !== 'visionpilot' || isBusy)
      ? `Focus Detail <span class="ai-focus-tag" style="--aic:${info.color || '#e85d2b'}">● ${esc(info.name)}${spinHtml}</span>`
      : 'Focus Detail';
  }
}
function setDescLoading(loading, customMsg = '') {
  aiBusyMsg = loading ? (customMsg || 'Analyzing image details…') : '';
  renderLiveAIStatus();
  if (typeof syncFocusLockState === 'function') syncFocusLockState();
}
async function detectRef(ref, opts = {}) {
  if (!ref || ref.cancelled || !refs.includes(ref)) return;
  const myEpoch = aiModelSessionEpoch;
  const activeModel = S.aiModel || 'visionpilot';
  const info = window.VPAIBridge?.getModelInfo ? window.VPAIBridge.getModelInfo(activeModel) : {name:activeModel};
  const shouldRunBuiltInDetection = S.focus.mode === 'multi' || Boolean(opts.forMultiMode);

  // When Single Mode is ON and no external AI model needs to run, built-in image detection stays OFF
  if (!shouldRunBuiltInDetection) {
    ref.status = 'busy';
    if (typeof syncFocusLockState === 'function') syncFocusLockState();
    try {
      await ref.ready;
    } catch (e) {}
    if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
      if (ref) ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      if (typeof syncFocusLockState === 'function') syncFocusLockState();
      return;
    }
    ref.det = null;
    ref.subjects = [];

    if (activeModel !== 'visionpilot' && !opts.skipRefStep && window.VPAIBridge?.runReferenceImageStep) {
      ref.status = 'busy';
      renderRefs();
      setDescLoading(true, `Uploading reference image to ${info.name} & waiting for reply…`);
      try {
        const replyText = await window.VPAIBridge.runReferenceImageStep(ref, activeModel);
        if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
          if (ref) ref.status = 'ok';
          if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
          if (typeof syncFocusLockState === 'function') syncFocusLockState();
          return;
        }
        ref.status = 'ok';
        lastAIError = '';
        aiConnectedOk = true;
        ref.aiRefDesc = replyText;
        S.subjDesc = replyText;
        if ($('subjDesc')) $('subjDesc').value = replyText;
        toast(`${info.name} reference description pasted`);
      } catch (aiErr) {
        if (aiErr?.cancelled || myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
          if (ref) ref.status = 'ok';
          if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
          if (typeof syncFocusLockState === 'function') syncFocusLockState();
          return;
        }
        ref.status = 'ok';
        const errMsg = aiErr?.message || String(aiErr);
        lastAIError = errMsg;
        toast(`${info.name} Error: ${errMsg}`);
      }
    } else if (activeModel === 'visionpilot' && (!opts.skipRefStep || !ref.vpRefDesc) && window.VPLocalWriter?.writeReferenceDescription) {
      ref.status = 'busy';
      renderRefs();
      setDescLoading(true, 'VisionPilot AI analyzing reference image…');
      try {
        const vpText = await ensureVpRefDesc(ref, {
          forceRegen: Boolean(opts.forceDesc && !opts.skipRefStep),
          onProgress: (msg) => {
            if (myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === 'visionpilot') {
              setDescLoading(true, msg);
            }
          }
        });
        if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) {
          if (ref) ref.status = 'ok';
          if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
          if (typeof syncFocusLockState === 'function') syncFocusLockState();
          return;
        }
        if (vpText && (!S.descUserEdited || opts.forceDesc)) {
          S.subjDesc = vpText;
          if ($('subjDesc')) $('subjDesc').value = vpText;
        }
        if (myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === 'visionpilot' && S.focus.on && S.focus.mode === 'single' && refs[S.focus.img] === ref && !ref.vpSingleFocusDesc) {
          await identifyAt(ref, S.focus.x, S.focus.y);
        }
        ref.status = 'ok';
      } catch (vpErr) {
        if (!vpErr?.cancelled) console.warn('[VisionPilot AI Stage 1] Error:', vpErr);
        ref.status = 'ok';
      }
    } else {
      ref.status = 'ok';
    }
    if (myEpoch === aiModelSessionEpoch) setDescLoading(false);
    focusKey = ''; renderRefs(); hooks.refsChanged?.(); changed();
    if (typeof syncFocusLockState === 'function') syncFocusLockState();
    return;
  }

  const hasCachedBase = Boolean(ref.det && Array.isArray(ref.det._rawSubjects || ref.det.subjects) && (ref.det._rawSubjects || ref.det.subjects).length);

  ref.status = 'busy';
  setDescLoading(true, activeModel !== 'visionpilot' && !opts.skipRefStep ? `Sending reference image to ${info.name}…` : 'Analyzing image details…');
  renderRefs();

  try {
    if (!window.VPDetect) throw new Error('detector script missing');
    await ref.ready;
    if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
      if (ref) ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      if (typeof syncFocusLockState === 'function') syncFocusLockState();
      return;
    }

    // 1. Run local detector (ONLY when Multiple Mode is ON) to find subject bounding boxes (Person 1, Person 2, Product 1...)
    let det;
    if (hasCachedBase && ref.det._rawSubjects) {
      det = {
        ...ref.det,
        aiModel: 'visionpilot',
        aiModelName: 'VisionPilot AI',
        subjects: ref.det._rawSubjects.map(s => ({...s}))
      };
      if (ref.det._px) Object.defineProperty(det, '_px', {value:ref.det._px, enumerable:false, configurable:true});
    } else {
      det = await window.VPDetect.analyze(ref.img);
      if (det && Array.isArray(det.subjects)) {
        det._rawSubjects = det.subjects.map(s => ({...s}));
      }
    }
    window.VPDetectLoaded = true;
    if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
      if (ref) ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      if (typeof syncFocusLockState === 'function') syncFocusLockState();
      return;
    }
    ref.det = det;
    ref.subjects = mapDetSubjects(det);
    ref.view = VIEW_TEXT[det.view] ? det.view : 'front';
    syncHiddenSubjectTextboxes(currentImgSubjects());

    // 2. STEP ONE: When an external AI model (Claude / GPT / Gemini) is selected, immediately upload the reference image
    // with the exact Step 1 instruction, click the copy button on the reply, and paste into #subjDesc.
    if (activeModel !== 'visionpilot' && !opts.skipRefStep && window.VPAIBridge?.runReferenceImageStep) {
      ref.status = 'busy';
      renderRefs();
      setDescLoading(true, `Uploading reference image to ${info.name} & waiting for reply…`);
      try {
        const replyText = await window.VPAIBridge.runReferenceImageStep(ref, activeModel);
        if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
          if (ref) ref.status = 'ok';
          if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
          if (typeof syncFocusLockState === 'function') syncFocusLockState();
          return;
        }
        ref.status = 'ok';
        lastAIError = '';
        aiConnectedOk = true;
        ref.aiRefDesc = replyText;
        S.subjDesc = replyText;
        if ($('subjDesc')) $('subjDesc').value = replyText;
        toast(`${info.name} reference description pasted`);
      } catch (aiErr) {
        if (aiErr?.cancelled || myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
          if (ref) ref.status = 'ok';
          if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
          if (typeof syncFocusLockState === 'function') syncFocusLockState();
          return;
        }
        ref.status = 'ok';
        const errMsg = aiErr?.message || String(aiErr);
        lastAIError = errMsg;
        toast(`${info.name} Error: ${errMsg}`);
      }
    } else if (activeModel === 'visionpilot' && (!opts.skipRefStep || !ref.vpRefDesc) && window.VPLocalWriter?.writeReferenceDescription) {
      ref.status = 'busy';
      renderRefs();
      setDescLoading(true, 'VisionPilot AI analyzing reference image…');
      try {
        const vpText = await ensureVpRefDesc(ref, {
          forceRegen: Boolean(opts.forceDesc && !opts.skipRefStep),
          onProgress: (msg) => {
            if (myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === 'visionpilot') {
              setDescLoading(true, msg);
            }
          }
        });
        if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) {
          if (ref) ref.status = 'ok';
          if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
          if (typeof syncFocusLockState === 'function') syncFocusLockState();
          return;
        }
        ref.status = 'ok';
        if (vpText && (!S.descUserEdited || opts.forceDesc)) {
          S.subjDesc = vpText;
          if ($('subjDesc')) $('subjDesc').value = vpText;
        }
      } catch (vpErr) {
        if (!vpErr?.cancelled) console.warn('[VisionPilot AI Stage 1] Error:', vpErr);
        ref.status = 'ok';
      }
    } else {
      ref.status = 'ok';
    }
  } catch (e) {
    if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
      if (ref) ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      if (typeof syncFocusLockState === 'function') syncFocusLockState();
      return;
    }
    console.warn('Local detection failed', e);
    if (await canSeeImages()) return detectRefAI(ref, opts);
    ref.status = 'fail';
    ref.subjects = [];
    detectFailMsg = 'Could not run the detector. Set the subject type below.';
  }
  if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
    if (ref) ref.status = 'ok';
    if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
    if (typeof syncFocusLockState === 'function') syncFocusLockState();
    return;
  }

  const willRunFollowupMulti = !opts.skipFollowup && !ref.cancelled && refs.includes(ref) && S.focus.on && S.focus.mode === 'multi' && refs[S.focus.img] === ref;
  if (!willRunFollowupMulti) {
    setDescLoading(false);
  }
  if (ref.status === 'ok') applySummary(!!opts.forceDesc);
  else if (!S.descUserEdited && refs.every(x => x.status === 'fail')) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
  focusKey = ''; renderRefs(); hooks.refsChanged?.(); changed();

  // If Multiple Mode is selected for this image, run Step 3 automatically (external AI or local VisionPilot AI writer)
  if (willRunFollowupMulti && myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === activeModel) {
    await runMultiModeAIStep(ref);
  }
  if (typeof syncFocusLockState === 'function') syncFocusLockState();
}
async function detectRefAI(ref, opts = {}) {
  if (ref.cancelled || !refs.includes(ref)) return;
  if (!(await canSeeImages())) {
    ref.status = 'fail'; setDescLoading(false);
    if (!S.descUserEdited && refs.every(x => x.status === 'fail')) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
    renderRefs(); hooks.refsChanged?.(); changed(); return;
  }
  ref.status = 'busy'; setDescLoading(true); renderRefs();
  try {
    const r = await sampleFn.json(DETECT_PROMPT, {images:[ref.file], modelTier:'quick'});
    if (ref.cancelled || !refs.includes(ref)) { setDescLoading(false); return; }
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
  if (ref.cancelled || !refs.includes(ref)) { setDescLoading(false); return; }
  setDescLoading(false);
  if (ref.status === 'ok') applySummary(!!opts.forceDesc);
  else if (!S.descUserEdited && refs.every(x => x.status === 'fail')) { S.subjDesc = ''; setIfIdle($('subjDesc'), ''); }
  focusKey = ''; renderRefs(); hooks.refsChanged?.(); changed();
}
function renderRefs() {
  $('refGrid').innerHTML = refs.map((r, i) => {
    const labs = `Image ${i + 1}`;
    return `<div class="reftile"><img src="${r.src}" alt="Reference ${i + 1}"><span class="num">${i + 1}</span>`
      + `<button type="button" class="x" data-rm="${r.id}" aria-label="Remove image ${i + 1}" title="Remove image"><svg viewBox="0 0 12 12"><path d="m2 2 8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>`
      + (r.status === 'busy' ? '<span class="busy"><span class="spin"></span></span>' : '')
      + `<span class="lab" title="${escAttr(labs)}">${esc(r.status === 'busy' ? 'Detecting…' : labs || 'Subject')}${r.alpha ? ' · PNG' : ''}</span></div>`;
  }).join('') + `<label class="addtile" id="addTile" for="file"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>${refs.length ? 'Add more' : 'Add images'}</label>`;
  const add = $('addTile');
  ['dragenter', 'dragover'].forEach(t => add.addEventListener(t, e => { e.preventDefault(); add.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => add.addEventListener(t, e => { e.preventDefault(); add.classList.remove('over'); }));
  add.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  renderRefBg(true);
  focusKey = ''; syncFocus();
  if (typeof syncFocusLockState === 'function') syncFocusLockState();
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
function autoSelectAspectFromImage(img) {
  if (!img || !(img.naturalWidth || img.width) || !(img.naturalHeight || img.height)) return;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const r = w / Math.max(1, h);
  const std = [
    ['1:1', 1 / 1],
    ['4:5', 4 / 5],
    ['3:4', 3 / 4],
    ['2:3', 2 / 3],
    ['3:2', 3 / 2],
    ['16:9', 16 / 9],
    ['9:16', 9 / 16],
    ['6:5', 6 / 5],
    ['21:9', 21 / 9]
  ];
  let best = std[0];
  let minDiff = Infinity;
  for (const item of std) {
    const d = Math.abs(r - item[1]);
    if (d < minDiff) {
      minDiff = d;
      best = item;
    }
  }
  if (minDiff < 0.055) {
    S.aspect = best[0];
    S.aspectCustom = '';
  } else {
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const g = gcd(w, h) || 1;
    const rw = Math.round(w / g);
    const rh = Math.round(h / g);
    if (rw > 64 || rh > 64) {
      S.aspect = best[0];
      S.aspectCustom = '';
    } else {
      S.aspect = 'custom';
      S.aspectCustom = `${rw}:${rh}`;
    }
  }
  if ($('aspect')) {
    $('aspect').value = S.aspect;
    refreshDD($('aspect'));
  }
  if ($('aspectCustom')) {
    $('aspectCustom').hidden = S.aspect !== 'custom';
    $('aspectCustom').value = S.aspectCustom;
  }
}
function getAspectSizeInfo(ratioStr) {
  const cleanRatio = (ratioStr || '4:5').trim();
  const stdPx = {
    '1:1': [1024, 1024],
    '4:5': [1024, 1280],
    '3:4': [1080, 1440],
    '2:3': [1024, 1536],
    '3:2': [1536, 1024],
    '16:9': [1920, 1080],
    '9:16': [1080, 1920],
    '6:5': [1200, 1000],
    '21:9': [2520, 1080]
  };
  let [rw, rh] = [4, 5];
  const m = cleanRatio.match(/^(\d+(?:\.\d+)?)\s*[:/×x]\s*(\d+(?:\.\d+)?)$/i);
  if (m) {
    rw = Math.max(1, parseFloat(m[1]));
    rh = Math.max(1, parseFloat(m[2]));
  }
  const targetR = rw / rh;
  const mainImg = (refs[S.focus?.img] || refs[0])?.img;
  const imgW = mainImg && (mainImg.naturalWidth || mainImg.width);
  const imgH = mainImg && (mainImg.naturalHeight || mainImg.height);
  let pxW = 1024, pxH = 1280;
  if (imgW && imgH) {
    const imgR = imgW / Math.max(1, imgH);
    if (Math.abs(imgR - targetR) < 0.06) {
      pxW = imgW;
      pxH = imgH;
    } else {
      const longEdge = Math.max(imgW, imgH, 1024);
      if (targetR >= 1) {
        pxW = longEdge;
        pxH = Math.max(1, Math.round(longEdge / targetR));
      } else {
        pxH = longEdge;
        pxW = Math.max(1, Math.round(longEdge * targetR));
      }
    }
  } else if (stdPx[cleanRatio]) {
    [pxW, pxH] = stdPx[cleanRatio];
  } else {
    if (targetR >= 1) {
      pxW = 1280;
      pxH = Math.max(1, Math.round(1280 / targetR));
    } else {
      pxH = 1280;
      pxW = Math.max(1, Math.round(1280 * targetR));
    }
  }
  const sizePx = `${pxW}×${pxH} px`;
  return {
    ratio: cleanRatio,
    width: pxW,
    height: pxH,
    sizePx,
    full: `${cleanRatio} (${sizePx})`
  };
}
function addFiles(list) {
  const arr = [...(list || [])].filter(Boolean);
  const files = arr.filter(f => f.type && f.type.startsWith('image/'));
  if (!files.length) { toast('Choose image files (JPG, PNG or WebP)'); return; }
  batchFolderState = null;
  // New image upload allows AI auto-description to populate #subjDesc (Part 7), without auto-pinning
  S.descUserEdited = false;
  S.focus.desc = '';
  setDescLoading(true);
  files.slice(0, 12).forEach(file => {
    const ref = {id:'r' + (++refId), file, src:'', img:new Image(), name:file.name || `pasted-${refId}.png`, status:'wait', subjects:[], view:'front', alpha:false, cancelled:false};
    ref.ready = new Promise((res, rej) => { ref.img.addEventListener('load', res, {once:true}); ref.img.addEventListener('error', rej, {once:true}); });
    ref.ready.catch(() => {});
    refs.push(ref);
    const fr = new FileReader();
    fr.onload = () => {
      if (ref.cancelled) return;
      ref.src = fr.result;
      ref.img.onload = () => {
        if (ref.cancelled) return;
        ref.alpha = /png|webp|gif/i.test(file.type) && hasAlpha(ref.img);
        if (refs[0] === ref || refs.length === 1) {
          autoSelectAspectFromImage(ref.img);
        }
        renderRefs(); drawAll(); hooks.refsChanged?.(); changed();
      };
      ref.img.src = fr.result; renderRefs();
    };
    fr.readAsDataURL(file);
    queue.push(ref);
  });
  renderRefs(); runQueue();
}
// CHANGE 2: Clicking the cross removes the image, stops loading immediately, and cancels any pending AI request so no late reply is pasted afterwards.
function removeRef(id) {
  const i = refs.findIndex(r => r.id === id);
  if (i < 0) return;
  const removedRef = refs[i];
  removedRef.cancelled = true;
  removedRef.status = 'cancelled';

  // Remove from pending detection queue
  for (let qi = queue.length - 1; qi >= 0; qi--) {
    if (queue[qi].id === id) queue.splice(qi, 1);
  }

  // Cancel any in-flight AI Bridge request for this image
  try {
    window.VPAIBridge?.cancelPendingRequests?.(id);
  } catch (e) {}

  refs.splice(i, 1);
  if (!refs.some(r => r.status === 'busy')) {
    busyDetect = false;
    setDescLoading(false);
    lastAIError = '';
  }

  if (Array.isArray(S.focus.subjectItems)) {
    S.focus.subjectItems = S.focus.subjectItems.filter(it => it.img !== i).map(it => it.img > i ? {...it, img:it.img - 1} : it);
    S.focus.activeSubjs = (Array.isArray(S.focus.activeSubjs) ? S.focus.activeSubjs : []).filter(k => S.focus.subjectItems.some(it => it.key === k));
    S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
    if (!S.focus.activeSubjs.length) { S.focus.target = ''; S.focus.singleActive = false; }
  }
  S.focus.multiEdits = {}; S.focus.multiSel = ''; S.focus.multiEditOpen = true;
  if ($('focusMultiText')) $('focusMultiText').value = '';
  if ($('focusHiddenSubjBoxes')) $('focusHiddenSubjBoxes').innerHTML = '';

  if (S.focus.img >= refs.length) S.focus.img = Math.max(0, refs.length - 1);
  if (S.refBg >= refs.length) S.refBg = 0;
  if (!refs.length) {
    S.count = 1; S.types = []; S.refView = 'front';
    S.focus.desc = '';
    if ($('focusDesc')) $('focusDesc').value = '';
    S.focus.subjectItems = []; S.focus.activeSubj = ''; S.focus.activeSubjs = []; S.focus.target = ''; S.focus.singleActive = false;
    if (!S.descUserEdited) {
      S.subjDesc = '';
      if ($('subjDesc')) $('subjDesc').value = '';
    }
  } else {
    applySummary();
  }
  renderRefs(); hooks.refsChanged?.(); changed();
  if (!busyDetect && queue.length) runQueue();
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
function normalizeSubjLabelForMatch(raw) {
  if (window.VPAIBridge?.normalizeSubjectLabel) {
    return window.VPAIBridge.normalizeSubjectLabel(raw);
  }
  return String(raw || '')
    .replace(/^[`"'*#_~\-–—•\d.)\s[\]()]+/, '')
    .replace(/[`"'*#_~[\]().,:;!?\-–—]+$/g, '')
    .replace(/[*_`#~[\]().,:;!?\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function currentImgSubjects() {
  if (S.focus.mode !== 'multi') return [];
  const all = allSubjects();
  const list = refs.length ? all.filter(s => s.img === S.focus.img) : all;
  const activeModel = S.aiModel || 'visionpilot';
  return list.map((s, idx) => {
    const key = s.key || `img${S.focus.img}_s${idx}`;
    const subjHex = s.color || null;
    const color = s.uiColor || FOCUS_PALETTE[idx % FOCUS_PALETTE.length];
    const box = s.box || {x:.15, y:.1, w:.7, h:.8};
    const boxes = s.boxes && s.boxes.length ? s.boxes : [box];
    const category = s.category || (window.VPDetect?.categoryOf ? window.VPDetect.categoryOf(s.type) : 'Product/Object');
    const baseDetail = activeModel !== 'visionpilot'
      ? ''
      : (s.detail || (s.desc ? `${s.label} (${category}): ${s.desc}.` : `${s.label} (${category}).`));
    const edited = S.focus.multiEdits && S.focus.multiEdits[key];
    return {...s, key, subjHex, color, category, box, boxes, baseDetail, detail: edited !== undefined ? edited : baseDetail};
  });
}

// CHANGE 1 & CHANGE 4: Maintain a hidden text box (<textarea hidden>) for every subject (plus Marker when active), matched by name and color
function syncHiddenSubjectTextboxes(imgSubs) {
  const wrap = $('focusHiddenSubjBoxes');
  if (!wrap) return;
  const subs = Array.isArray(imgSubs) ? imgSubs : currentImgSubjects();
  const isMulti = S.focus.mode === 'multi';
  const items = [];
  if (isMulti && S.focus.showMark) {
    items.push({
      key: '__marker',
      label: 'Marker',
      normLabel: 'marker',
      color: '#3fb950',
      value: (S.focus.multiEdits && S.focus.multiEdits['__marker']) || ''
    });
  }
  subs.forEach(s => {
    items.push({
      key: s.key,
      label: s.label,
      normLabel: normalizeSubjLabelForMatch(s.label),
      color: s.color,
      value: (S.focus.multiEdits && S.focus.multiEdits[s.key] !== undefined)
        ? S.focus.multiEdits[s.key]
        : (s.detail || '')
    });
  });

  // Update or create hidden textareas
  const existing = new Map();
  Array.from(wrap.querySelectorAll('textarea[data-subj-key]')).forEach(ta => {
    existing.set(ta.dataset.subjKey, ta);
  });

  const keepKeys = new Set(items.map(it => it.key));
  existing.forEach((ta, k) => {
    if (!keepKeys.has(k)) ta.remove();
  });

  items.forEach(it => {
    let ta = existing.get(it.key);
    if (!ta) {
      ta = document.createElement('textarea');
      ta.hidden = true;
      ta.className = 'vp-hidden-subj-box';
      ta.id = 'vpHiddenSubj_' + it.key;
      wrap.appendChild(ta);
    }
    ta.dataset.subjKey = it.key;
    ta.dataset.subjName = it.label;
    ta.dataset.subjNormName = it.normLabel;
    ta.dataset.subjColor = it.color;
    if (ta.value !== it.value) {
      ta.value = it.value;
    }
  });
}

function setHiddenSubjectBoxText(subOrKey, text, colorHint = '') {
  const wrap = $('focusHiddenSubjBoxes');
  const subs = currentImgSubjects();
  syncHiddenSubjectTextboxes(subs);
  if (!wrap) return null;

  const rawKey = typeof subOrKey === 'object' && subOrKey ? subOrKey.key : String(subOrKey || '');
  const rawName = typeof subOrKey === 'object' && subOrKey ? subOrKey.label : String(subOrKey || '');
  const normName = normalizeSubjLabelForMatch(rawName);
  const wantColor = (typeof subOrKey === 'object' && subOrKey ? subOrKey.color : colorHint) || '';

  const allTas = Array.from(wrap.querySelectorAll('textarea[data-subj-key]'));
  let matchedTa =
    allTas.find(ta => ta.dataset.subjKey === rawKey) ||
    (normName ? allTas.find(ta => ta.dataset.subjNormName === normName) : null) ||
    (wantColor ? allTas.find(ta => (ta.dataset.subjColor || '').toLowerCase() === wantColor.toLowerCase()) : null);

  if (matchedTa) {
    matchedTa.value = text;
    const key = matchedTa.dataset.subjKey;
    S.focus.multiEdits = S.focus.multiEdits || {};
    S.focus.multiEdits[key] = text;
    console.log(
      `[VP HiddenBox] Filled hidden box for "${matchedTa.dataset.subjName}" (key=${key}, color=${matchedTa.dataset.subjColor}):`,
      text
    );
    return key;
  }
  return null;
}

function getHiddenSubjectBoxText(key) {
  if (!key) return '';
  const wrap = $('focusHiddenSubjBoxes');
  if (wrap) {
    const ta = wrap.querySelector(`textarea[data-subj-key="${CSS.escape ? CSS.escape(key) : key}"]`);
    if (ta && ta.value) return ta.value;
  }
  return (S.focus.multiEdits && S.focus.multiEdits[key]) || '';
}

function selectMultiSubject(key, toggleIfSame = true) {
  const subs = currentImgSubjects();
  if (toggleIfSame && S.focus.multiSel === key) {
    S.focus.multiSel = '';
    S.focus.multiPart = '';
    S.focus.multiWhere = '';
    S.focus.multiPartColor = '';
  } else {
    const prevKey = S.focus.multiSel;
    S.focus.multiSel = key;
    S.focus.multiEditOpen = true;
    S.focus.on = true;
    if (prevKey !== key) {
      S.focus.multiPart = '';
      S.focus.multiWhere = '';
      S.focus.multiPartColor = '';
    }
    if (key === '__marker') {
      S.focus.target = 'Marker';
    } else {
      const sel = subs.find(s => s.key === key);
      if (sel) {
        S.focus.target = sel.label;
        if (!S.focus.showMark) {
          S.focus.x = clamp((sel.box?.x || .15) + (sel.box?.w || .7) / 2, 0, 1);
          S.focus.y = clamp((sel.box?.y || .1) + (sel.box?.h || .8) / 2, 0, 1);
        }
      }
    }
  }
  updateAutoDescription(false);
  focusKey = '';
  changed();
}
function syncFocus() {
  S.focus.mode = S.focus.mode === 'multi' ? 'multi' : 'single';
  if (S.focus.showMark === undefined) S.focus.showMark = S.app === 'video' ? false : (S.focus.mode !== 'multi');
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEditOpen = true;
  S.focus.subjectItems = Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : [];
  if (!Array.isArray(S.focus.activeSubjs)) {
    S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
  }
  S.focus.activeSubjs = S.focus.activeSubjs.filter(k => S.focus.subjectItems.some(it => it.key === k));
  S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
  S.focus.zoom = clamp(+S.focus.zoom || 1, 1, 8);
  $('pFocus').classList.toggle('off', !S.focus.on);
  $('focusOn').setAttribute('aria-checked', S.focus.on);
  if ($('focusMarkOn')) $('focusMarkOn').setAttribute('aria-checked', String(!!S.focus.showMark));
  $('detailOn').setAttribute('aria-checked', !!S.focus.detail); $('detailRow').hidden = !S.focus.detail;
  $('detailZoom').setAttribute('aria-pressed', !!S.focus.zoomLocked);
  setIfIdle($('detailCm'), S.focus.detailCm);
  $('fZoom').value = S.focus.zoom; $('fZoomV').textContent = S.focus.zoom + '×';
  setIfIdle($('focusDesc'), S.focus.desc);
  const isMulti = S.focus.mode === 'multi';
  if ($('focusImg')) {
    $('focusImg').classList.toggle('marker-active', Boolean(isMulti && S.focus.showMark));
  }
  // If marker was turned off while '__marker' was selected, clear selection so placeholder shows
  if (isMulti && !S.focus.showMark && S.focus.multiSel === '__marker') {
    S.focus.multiSel = '';
  }
  $('fModeSingle').setAttribute('aria-pressed', !isMulti);
  $('fModeMulti').setAttribute('aria-pressed', isMulti);
  $('focusSinglePane').hidden = isMulti;
  $('focusMultiPane').hidden = !isMulti;
  $('focusBoxes').hidden = !isMulti;
  const singleOn = !!(S.focus.on && !isMulti && S.focus.singleActive && S.focus.desc.trim());
  $('focusIntoSubjSingle').setAttribute('aria-pressed', singleOn);
  $('focusIntoSubjSingle').textContent = singleOn ? '✓ In Subject' : 'Into Subject';
  const imgSubs = currentImgSubjects();
  syncHiddenSubjectTextboxes(imgSubs);
  const markerDescVal = (S.focus.multiEdits && S.focus.multiEdits['__marker']) || '';
  const key = refs.map(r => r.id + r.status).join() + '|' + S.focus.img + '|' + S.subjType + '|' + S.count + '|'
    + imgSubs.map(s => s.key + s.label + s.color + s.detail).join() + '|' + markerDescVal + '|' + S.focus.mode + '|' + S.focus.multiSel + '|'
    + (S.focus.showMark ? '1' : '0') + '|' + (S.focus.multiPart || '') + '|'
    + (S.focus.singleActive ? '1' : '0') + '|'
    + JSON.stringify(S.focus.subjectItems) + '|' + JSON.stringify(S.focus.activeSubjs);
  if (key !== focusKey) {
    focusKey = key;
    const tabCount = refs.length;
    $('focusTabs').innerHTML = tabCount > 0
      ? Array.from({length: tabCount}, (_, i) =>
          `<button type="button" data-fimg="${i}" aria-pressed="${i === S.focus.img}">Image ${i + 1}</button>`
        ).join('')
      : '';
    const r = refs[S.focus.img];
    const wantSrc = r ? r.src : SAMPLE_SRC;
    if ($('focusPic').getAttribute('src') !== wantSrc) $('focusPic').src = wantSrc;
    if ($('focusHint')) $('focusHint').textContent = isMulti
      ? 'Click any colored subject box or button below to inspect or edit its details.'
      : 'Click or drag the green Focus Marker on the image to aim the focus point.';
    // CHANGE 4: When Focus Marker is ON in Multiple Mode, render a glowing Marker button at the very front of the subject buttons row, before Person 1 and Product 1
    const markerBtnHtml = (isMulti && S.focus.showMark)
      ? `<button type="button" class="tog fdet-btn marker-glow" data-fdet="__marker" aria-pressed="${S.focus.multiSel === '__marker'}" style="--sc:#3fb950" title="Focus Marker — move the green marker on the image and select to see its detail"><i class="sdot marker-dot"></i><span>Marker</span></button>`
      : '';
    // Multiple Mode: row of subject buttons at the top
    $('focusDetList').innerHTML = markerBtnHtml + imgSubs.map(s => {
      const isSelected = S.focus.multiSel === s.key;
      return `<button type="button" class="tog fdet-btn" data-fdet="${escAttr(s.key)}" aria-pressed="${isSelected}" style="--sc:${escAttr(s.color)}" title="${escAttr(s.label + ' (' + s.category + ') — click to see its detail')}"><i class="sdot" style="background:${escAttr(s.color)}"></i><span>${esc(s.label)}</span></button>`;
    }).join('');

    // CHANGE 1: The visible text box below must ALWAYS be visible and never minimize or collapse,
    // with the placeholder "Select a subject to see its detail" when nothing is selected.
    if ($('focusMultiEditWrap')) $('focusMultiEditWrap').hidden = false;
    if ($('focusMultiText')) {
      $('focusMultiText').placeholder = 'Select a subject to see its detail';
      if (S.focus.multiSel === '__marker' && S.focus.showMark) {
        const mText = getHiddenSubjectBoxText('__marker');
        setIfIdle($('focusMultiText'), mText);
      } else {
        const selSub = imgSubs.find(s => s.key === S.focus.multiSel);
        if (selSub) {
          const sText = getHiddenSubjectBoxText(selSub.key) || selSub.detail || '';
          setIfIdle($('focusMultiText'), sText);
        } else {
          $('focusMultiText').value = '';
        }
      }
    }

    // Focus Subject subsection: individual colored buttons with × remove (supports independent multiple selection).
    // If the Marker button (__marker) is present, it is always placed at the very front before all other subjects.
    if (S.focus.subjectItems.length) {
      const orderedItems = [
        ...S.focus.subjectItems.filter(it => it.key === '__marker' || it.isMarker),
        ...S.focus.subjectItems.filter(it => it.key !== '__marker' && !it.isMarker)
      ];
      $('focusSubjList').innerHTML = orderedItems.map(item => {
        const isMarkerItem = item.key === '__marker' || item.isMarker;
        const glowCls = isMarkerItem ? ' marker-glow' : '';
        const dotCls = isMarkerItem ? 'sdot marker-dot' : 'sdot';
        const dotStyle = isMarkerItem ? '' : ` style="background:${escAttr(item.color)}"`;
        return `<button type="button" class="tog fsubj${glowCls}" data-fsub="${escAttr(item.key)}" aria-pressed="${S.focus.activeSubjs.includes(item.key)}" style="--sc:${escAttr(item.color || '#3fb950')}" title="${escAttr(item.detail || item.label)}"><i class="${dotCls}"${dotStyle}></i><span>${esc(item.label)}</span><span class="del" data-fsubdel="${escAttr(item.key)}" role="button" aria-label="Remove ${escAttr(item.label)}" title="Remove"><svg class="vp-x-ico" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5 9.5 9.5M9.5 2.5 2.5 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></span></button>`;
      }).join('');
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
      const w43 = Math.min(392, Math.round(bh * 4 / 3)) + 'px';
      if (pFocus.style.getPropertyValue('--fbox-w') !== w43) pFocus.style.setProperty('--fbox-w', w43);
    }
  } else if (pFocus && pFocus.style.getPropertyValue('--fbox-w')) {
    pFocus.style.removeProperty('--fbox-w');
  }
  const shead = pFocus?.querySelector(':scope > .shead');
  const refBox = (!($('focusMultiPane')?.hidden) ? $('focusMultiPane') : $('focusSinglePane')) || $('focusModeBar');
  if (shead && refBox && S.app !== 'video') {
    const shRect = shead.getBoundingClientRect();
    const boxRect = refBox.getBoundingClientRect();
    if (shRect.width > 0 && boxRect.width > 0) {
      const wantPadR = Math.max(8, Math.round(shRect.right - boxRect.right));
      if (shead.style.paddingRight !== wantPadR + 'px') shead.style.paddingRight = wantPadR + 'px';
    }
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
  m.hidden = !S.focus.on || !S.focus.showMark;
  m.style.left = (img.offsetLeft + fz.tx + S.focus.x * img.clientWidth * fz.z) + 'px';
  m.style.top = (img.offsetTop + fz.ty + S.focus.y * img.clientHeight * fz.z) + 'px';
}
let identifyCtl = null;
const FOCUS_HINT = 'Click or drag on the image to aim the focus point.';
function syncActiveSingleItem() {
  if (!Array.isArray(S.focus.subjectItems)) return;
  const it = S.focus.subjectItems.find(x => x.key === '__marker' || x.isMarker || x.key === S.focus.singleKey || x.isSinglePoint);
  if (it) {
    const cleanText = (S.focus.desc || '').trim();
    it.key = '__marker';
    it.label = 'Marker';
    it.color = '#3fb950';
    it.isMarker = true;
    it.isSinglePoint = true;
    it.detail = cleanText;
    it.desc = cleanText;
    it.x = S.focus.x;
    it.y = S.focus.y;
    S.focus.multiEdits = S.focus.multiEdits || {};
    S.focus.multiEdits['__marker'] = cleanText;
    S.focus.multiMarkerText = cleanText;
  }
}
// STEP THREE: Multiple Mode — runs external AI (Claude / GPT / Gemini) or local VisionPilot AI writer
// and fills each subject's hidden text box with a 30-to-40-word description.
async function runMultiModeAIStep(ref) {
  const myEpoch = aiModelSessionEpoch;
  const activeModel = S.aiModel || 'visionpilot';
  if (!ref || ref.cancelled || !refs.includes(ref)) return;

  if (activeModel === 'visionpilot') {
    if (!window.VPLocalWriter?.writeMultipleModeDetails || !ref.img) return;
    await ref.ready;
    if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) return;

    if ((!ref.subjects || !ref.subjects.length) && window.VPDetect) {
      try {
        const det = await window.VPDetect.analyze(ref.img);
        if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) return;
        ref.det = det;
        ref.subjects = mapDetSubjects(det);
      } catch (e) {}
    }

    let subs = currentImgSubjects();
    syncHiddenSubjectTextboxes(subs);
    ref.status = 'busy';
    renderRefs();
    setFocusDetailLoading(true);
    setDescLoading(true, 'VisionPilot AI scoring subject boxes…');
    try {
      const res = await window.VPLocalWriter.writeMultipleModeDetails(ref.img, subs, {
        det: ref.det,
        imgIdx: S.focus.img,
        onProgress: (msg) => {
          if (myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === 'visionpilot') {
            setDescLoading(true, msg);
          }
        }
      });
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) {
        if (ref) ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        return;
      }

      if (res.refinedRawSubjects && Array.isArray(res.refinedRawSubjects) && res.refinedRawSubjects.length) {
        if (ref.det) {
          ref.det.subjects = res.refinedRawSubjects.map(s => ({ ...s }));
          ref.det._rawSubjects = res.refinedRawSubjects.map(s => ({ ...s }));
        }
        ref.subjects = mapDetSubjects(ref.det || { subjects: res.refinedRawSubjects });
        applySummary(false);
        subs = currentImgSubjects();
        syncHiddenSubjectTextboxes(subs);
      }

      ref.status = 'ok';
      S.focus.multiEdits = S.focus.multiEdits || {};
      ref.vpMultiEdits = ref.vpMultiEdits || {};

      subs.forEach((s) => {
        const desc = res.byKey?.[s.key] || res.byLabel?.[s.label] || '';
        if (desc) {
          S.focus.multiEdits[s.key] = desc;
          ref.vpMultiEdits[s.key] = desc;
          setHiddenSubjectBoxText(s, desc, s.color);
          if (ref.subjects && ref.subjects[s.idx]) {
            ref.subjects[s.idx].detail = desc;
          }
          if (Array.isArray(S.focus.subjectItems)) {
            const it = S.focus.subjectItems.find(item => item.key === s.key);
            if (it) it.detail = desc;
          }
        }
      });

      if (S.focus.on) {
        if (S.focus.multiSel && S.focus.multiEdits[S.focus.multiSel] && $('focusMultiText')) {
          $('focusMultiText').value = S.focus.multiEdits[S.focus.multiSel];
        } else if (!S.focus.multiSel && $('focusMultiText')) {
          $('focusMultiText').value = '';
        }
      }
    } catch (vpErr) {
      if (!vpErr?.cancelled) console.warn('[VisionPilot AI Stage 3] Error:', vpErr);
      ref.status = 'ok';
    } finally {
      if (myEpoch === aiModelSessionEpoch) {
        setFocusDetailLoading(false);
        if (refs.includes(ref) && ref.status === 'busy') ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        focusKey = '';
        renderRefs();
        syncFocus();
        placeBoxes();
        changed();
      }
    }
    return;
  }

  if (!window.VPAIBridge?.runMultiFocusStep) return;
  const info = window.VPAIBridge.getModelInfo(activeModel);

  console.log(`[VP Core MultiMode] Starting Multiple Mode step with ${info.name} for ref ${ref.id}`);

  if (!ref.img) {
    const errMsg = `Upload a reference image before running ${info.name} Multiple Mode.`;
    lastAIError = errMsg;
    renderLiveAIStatus();
    toast(errMsg);
    return;
  }

  await ref.ready;
  if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) return;

  // Ensure local subject bounding boxes exist before building the colored boxes screenshot
  if ((!ref.subjects || !ref.subjects.length) && window.VPDetect) {
    try {
      const det = await window.VPDetect.analyze(ref.img);
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) return;
      ref.det = det;
      ref.subjects = mapDetSubjects(det);
    } catch (e) {}
  }

  const subs = currentImgSubjects();
  console.log('[VP Core MultiMode] Subjects on current image:', subs.map(s => ({ key: s.key, label: s.label, color: s.color })));

  if (!subs.length) {
    const errMsg = 'No subjects detected on the reference image for Multiple Mode.';
    lastAIError = errMsg;
    renderLiveAIStatus();
    toast(errMsg);
    return;
  }

  syncHiddenSubjectTextboxes(subs);
  ref.status = 'busy';
  renderRefs();
  setFocusDetailLoading(true);
  setDescLoading(true, `Sending original image + labeled boxes screenshot to ${info.name}…`);
  try {
    const res = await window.VPAIBridge.runMultiFocusStep(ref, subs, activeModel);
    if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
      if (ref) ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      return;
    }
    ref.status = 'ok';
    lastAIError = '';
    aiConnectedOk = true;
    S.focus.multiEdits = S.focus.multiEdits || {};
    ref.aiMultiEdits = ref.aiMultiEdits || {};

    let filledCount = 0;
    subs.forEach((s, idx) => {
      const normSubLabel = normalizeSubjLabelForMatch(s.label);
      const desc =
        res.byKey?.[s.key] ||
        res.byLabel?.[s.label] ||
        (normSubLabel && res.byNormLabel ? res.byNormLabel[normSubLabel] : '') ||
        (res.blocks && res.blocks[idx] ? `${s.label}: ${res.blocks[idx].replace(/^[^:\n]{1,40}:\s*/, '')}` : '');

      if (desc) {
        filledCount++;
        S.focus.multiEdits[s.key] = desc;
        ref.aiMultiEdits[s.key] = desc;
        setHiddenSubjectBoxText(s, desc, s.color);
        if (ref.subjects && ref.subjects[s.idx]) {
          ref.subjects[s.idx].detail = desc;
        }
        if (Array.isArray(S.focus.subjectItems)) {
          const it = S.focus.subjectItems.find(item => item.key === s.key);
          if (it) it.detail = desc;
        }
        console.log(`[VP Core MultiMode] ✓ Filled subject box for "${s.label}" (key=${s.key}, color=${s.color}):`, desc);
      } else {
        console.warn(`[VP Core MultiMode] ✗ No description matched for subject "${s.label}" (key=${s.key})`);
      }
    });

    // CHANGE 1: If Focus is ON and a subject is currently selected, show its text in the visible box below;
    // if Focus was turned OFF while waiting, keep it stored in the backend without forcing the front UI.
    if (S.focus.on) {
      if (S.focus.multiSel && S.focus.multiEdits[S.focus.multiSel] && $('focusMultiText')) {
        $('focusMultiText').value = S.focus.multiEdits[S.focus.multiSel];
      } else if (!S.focus.multiSel && $('focusMultiText')) {
        $('focusMultiText').value = '';
      }
      toast(`${info.name} filled descriptions for ${filledCount} labeled subject(s)`);
    }
  } catch (err) {
    if (err?.cancelled || myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
      if (ref) ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      return;
    }
    ref.status = 'ok';
    const errMsg = err?.message || String(err);
    lastAIError = errMsg;
    console.error('[VP Core MultiMode] Error:', errMsg);
    toast(`${info.name} Error: ${errMsg}`);
  } finally {
    if (myEpoch === aiModelSessionEpoch) {
      setFocusDetailLoading(false);
      if (refs.includes(ref) && ref.status === 'busy') ref.status = 'ok';
      if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
      focusKey = '';
      renderRefs();
      syncFocus();
      changed();
    }
  }
}

// image mode: what is under the focus point? (VisionPilot built-in AI or connected Claude / GPT / Gemini AI)
async function identifyAt(ref, x, y) {
  if (!ref || ref.cancelled || !refs.includes(ref)) return;
  const myEpoch = aiModelSessionEpoch;
  const subs = currentImgSubjects();
  const isMulti = S.focus.mode === 'multi';
  const activeModel = S.aiModel || 'visionpilot';

  // External AI Model (Claude, ChatGPT, Gemini): real browser automation only, zero fake fallback
  if (activeModel !== 'visionpilot') {
    // CHANGE 4: In Multiple Mode, only send when the Focus Marker is turned ON and moved by the user
    if (isMulti && !S.focus.showMark) {
      return;
    }
    const infoModel = window.VPAIBridge?.getModelInfo ? window.VPAIBridge.getModelInfo(activeModel) : {name: activeModel};
    if (!ref || !ref.img) {
      const errMsg = `Upload a reference image before using the Focus Marker with ${infoModel.name}.`;
      lastAIError = errMsg;
      renderLiveAIStatus();
      toast(errMsg);
      return;
    }

    if (!isMulti) {
      S.focus.target = 'Marker';
      S.focus.lastPointKey = '__marker';
    }
    const ptInfo = (isMulti && window.VPDetect && ref.det)
      ? window.VPDetect.pointInfo(ref.det, x, y, null)
      : null;
    const partName = (ptInfo && ptInfo.part && ptInfo.part !== 'background area' && ptInfo.part !== 'background')
      ? ptInfo.part
      : 'background area';
    S.focus.note = partName;
    S.focus.where = ptInfo?.whereOnSubject || ptInfo?.where || `at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top`;

    ref.status = 'busy';
    renderRefs();
    setFocusDetailLoading(true);
    setDescLoading(true, `Sending original image + marker screenshot to ${infoModel.name}…`);
    try {
      const replyText = await window.VPAIBridge.runSingleFocusStep(ref, x, y, '', activeModel);
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
        if (ref) ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        return;
      }
      ref.status = 'ok';
      lastAIError = '';
      aiConnectedOk = true;

      if (isMulti) {
        // CHANGE 4: In Multiple Mode, the reply fills the Marker button's text, which shows in the box below when the Marker button is selected
        S.focus.multiEdits = S.focus.multiEdits || {};
        S.focus.multiEdits['__marker'] = replyText;
        S.focus.multiMarkerText = replyText;
        ref.aiMultiMarkerDesc = replyText;
        setHiddenSubjectBoxText({ key: '__marker', label: 'Marker', color: '#3fb950' }, replyText, '#3fb950');
        if (Array.isArray(S.focus.subjectItems)) {
          const mIt = S.focus.subjectItems.find(it => it.key === '__marker' || it.isMarker);
          if (mIt) {
            mIt.detail = replyText;
            mIt.desc = replyText;
            mIt.x = x;
            mIt.y = y;
          }
        }
        if (S.focus.on && S.focus.multiSel === '__marker' && $('focusMultiText')) {
          $('focusMultiText').value = replyText;
        }
        if (S.focus.on) toast(`${infoModel.name} marker detail pasted`);
      } else {
        // Single Mode: Focus Point Detail is the Marker's detail (always saved in backend; only shown on front UI if Focus is still ON)
        ref.aiSingleFocusDesc = replyText;
        S.focus.multiEdits = S.focus.multiEdits || {};
        S.focus.multiEdits['__marker'] = replyText;
        S.focus.multiMarkerText = replyText;
        if (S.focus.on) {
          S.focus.desc = replyText;
          if ($('focusDesc')) $('focusDesc').value = replyText;
          if (S.focus.zoomLocked && S.focus.detail) zoomToDetail();
          syncActiveSingleItem();
          toast(`${infoModel.name} focus point detail pasted`);
        }
      }
    } catch (err) {
      if (err?.cancelled || myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== activeModel || ref.cancelled || !refs.includes(ref)) {
        if (ref) ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        return;
      }
      ref.status = 'ok';
      const errMsg = err?.message || String(err);
      lastAIError = errMsg;
      toast(`${infoModel.name} Error: ${errMsg}`);
    } finally {
      if (myEpoch === aiModelSessionEpoch) {
        setFocusDetailLoading(false);
        if (refs.includes(ref) && ref.status === 'busy') ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        focusKey = '';
        renderRefs();
        syncFocus();
        changed();
      }
    }
    return;
  }

  // Built-in VisionPilot AI writer (Stage 2: Single Mode Focus Detail & Multiple Mode Marker Detail, 30 to 40 words)
  if (isMulti && !S.focus.showMark) {
    return;
  }
  if (window.VPLocalWriter?.writeSingleFocusDetail && ref?.img) {
    if (!isMulti) {
      S.focus.target = 'Marker';
      S.focus.lastPointKey = '__marker';
    }
    const ptInfo = (window.VPDetect && ref.det)
      ? window.VPDetect.pointInfo(ref.det, x, y, null)
      : null;
    S.focus.note = (ptInfo && ptInfo.part && ptInfo.part !== 'background area' && ptInfo.part !== 'background')
      ? ptInfo.part
      : 'focus region';
    S.focus.where = ptInfo?.whereOnSubject || ptInfo?.where || `at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top`;

    ref.status = 'busy';
    renderRefs();
    setFocusDetailLoading(true);
    setDescLoading(true, 'VisionPilot AI scoring focus region…');
    try {
      await ref.ready;
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) {
        if (ref) ref.status = 'ok';
        return;
      }
      const vpDetail = await window.VPLocalWriter.writeSingleFocusDetail(ref.img, x, y, {
        det: ref.det,
        onProgress: (msg) => {
          if (myEpoch === aiModelSessionEpoch && (S.aiModel || 'visionpilot') === 'visionpilot') {
            setDescLoading(true, msg);
          }
        }
      });
      if (myEpoch !== aiModelSessionEpoch || (S.aiModel || 'visionpilot') !== 'visionpilot' || ref.cancelled || !refs.includes(ref)) {
        if (ref) ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        return;
      }
      ref.status = 'ok';
      if (isMulti) {
        S.focus.multiEdits = S.focus.multiEdits || {};
        S.focus.multiEdits['__marker'] = vpDetail;
        S.focus.multiMarkerText = vpDetail;
        ref.vpMultiMarkerDesc = vpDetail;
        setHiddenSubjectBoxText({ key: '__marker', label: 'Marker', color: '#3fb950' }, vpDetail, '#3fb950');
        if (Array.isArray(S.focus.subjectItems)) {
          const mIt = S.focus.subjectItems.find(it => it.key === '__marker' || it.isMarker);
          if (mIt) {
            mIt.detail = vpDetail;
            mIt.desc = vpDetail;
            mIt.x = x;
            mIt.y = y;
          }
        }
        if (S.focus.on && S.focus.multiSel === '__marker' && $('focusMultiText')) {
          $('focusMultiText').value = vpDetail;
        }
      } else {
        ref.vpSingleFocusDesc = vpDetail;
        S.focus.multiEdits = S.focus.multiEdits || {};
        S.focus.multiEdits['__marker'] = vpDetail;
        S.focus.multiMarkerText = vpDetail;
        if (S.focus.on) {
          S.focus.desc = vpDetail;
          if ($('focusDesc')) $('focusDesc').value = vpDetail;
          if (S.focus.zoomLocked && S.focus.detail) zoomToDetail();
          syncActiveSingleItem();
        }
      }
    } catch (vpErr) {
      if (!vpErr?.cancelled) console.warn('[VisionPilot AI Stage 2] Error:', vpErr);
      ref.status = 'ok';
    } finally {
      if (myEpoch === aiModelSessionEpoch) {
        setFocusDetailLoading(false);
        if (refs.includes(ref) && ref.status === 'busy') ref.status = 'ok';
        if (!refs.some(r => r.status === 'busy')) setDescLoading(false);
        focusKey = '';
        renderRefs();
        syncFocus();
        changed();
      }
    }
    return;
  }

  // Fallback if VPLocalWriter is unavailable
  if (!isMulti) {
    S.focus.target = 'Marker';
    S.focus.lastPointKey = '__marker';
    S.focus.where = `at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top`;
    syncActiveSingleItem();
    focusKey = '';
    changed();
    return;
  }

  if (window.VPDetect && ref?.det) {
    const info = window.VPDetect.pointInfo(ref.det, x, y, null);
    if (info) {
      if (isMulti) {
        if (!S.focus.showMark) return;
        const s = subs[info.index] || subs[0];
        const partName = info.part === 'background area' || info.part === 'background' ? 'background area' : info.part;
        const whereStr = info.whereOnSubject || info.where || `at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`;
        S.focus.multiPart = partName;
        S.focus.multiWhere = whereStr;
        S.focus.multiPartColor = info.colorName || '';
        S.focus.note = partName;
        S.focus.where = whereStr;
        const markerDetail = info.fullDetail || (partName === 'background area'
          ? `Background area at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top${info.colorName ? ' (' + info.colorName + ')' : ''}.`
          : `${s ? s.label + ' — ' : ''}${cap(partName)}${info.colorName ? ` (${info.colorName})` : ''}, ${whereStr}.`);
        S.focus.multiEdits = S.focus.multiEdits || {};
        S.focus.multiEdits['__marker'] = markerDetail;
        S.focus.multiMarkerText = markerDetail;
        setHiddenSubjectBoxText({ key: '__marker', label: 'Marker', color: '#3fb950' }, markerDetail, '#3fb950');
        if (Array.isArray(S.focus.subjectItems)) {
          const mIt = S.focus.subjectItems.find(it => it.key === '__marker' || it.isMarker);
          if (mIt) {
            mIt.detail = markerDetail;
            mIt.desc = markerDetail;
            mIt.x = x;
            mIt.y = y;
          }
        }
        if (S.focus.multiSel === '__marker' && $('focusMultiText')) {
          $('focusMultiText').value = markerDetail;
        }
        updateAutoDescription(false);
        focusKey = '';
        changed();
        return;
      }
      const s = subs[info.index] || subs[0];
      if (s) { S.focus.target = s.label; S.focus.lastPointKey = s.key; }
      S.focus.note = info.part === 'background area' || info.part === 'background' ? 'background area' : info.part;
      S.focus.where = info.whereOnSubject || info.where || '';
      S.focus.desc = info.fullDetail || (S.focus.note === 'background area'
        ? `Background area at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top${info.colorName ? ' (' + info.colorName + ')' : ''}.`
        : `${s ? s.label + ' — ' : ''}${cap(info.part)}${info.colorName ? ` (${info.colorName})` : ''}, ${info.whereOnSubject || info.where}.`);
      setIfIdle($('focusDesc'), S.focus.desc);
      if (S.focus.zoomLocked && S.focus.detail) zoomToDetail();
      syncActiveSingleItem();
      updateAutoDescription(false);
      focusKey = '';
      changed(); return;
    }
  }
  if (subs.length) {
    const s = subs[0];
    S.focus.target = s.label;
    S.focus.lastPointKey = s.key;
    S.focus.note = `spot at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%`;
    S.focus.where = `at ${Math.round(x * 100)}% from left, ${Math.round(y * 100)}% from top of ${s.label}`;
    if (isMulti) {
      if (!S.focus.showMark) return;
      const markerDetail = `${s.label} at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%: ${s.detail || s.desc || TYPE_NAME[s.type]}`;
      S.focus.multiEdits = S.focus.multiEdits || {};
      S.focus.multiEdits['__marker'] = markerDetail;
      setHiddenSubjectBoxText({ key: '__marker', label: 'Marker', color: '#3fb950' }, markerDetail, '#3fb950');
      if (S.focus.multiSel === '__marker' && $('focusMultiText')) {
        $('focusMultiText').value = markerDetail;
      }
    } else {
      S.focus.desc = `${s.label} at ${Math.round(x * 100)}%, ${Math.round(y * 100)}%: ${s.detail || s.desc || TYPE_NAME[s.type]}`;
      syncActiveSingleItem();
    }
    updateAutoDescription(false);
    focusKey = '';
    changed();
  }
}
// drag the focus point in Single & Multiple Mode when Focus Marker is on; in Multiple Mode when Focus Marker is off, clicking an outline box selects that subject
{
  const box = $('focusImg'), img = $('focusPic'); let on = false;
  const getNormPt = e => {
    const b = box.getBoundingClientRect(), W = Math.max(1, img.clientWidth * fz.z), H = Math.max(1, img.clientHeight * fz.z);
    const left = b.left + box.clientLeft + img.offsetLeft + fz.tx, top = b.top + box.clientTop + img.offsetTop + fz.ty;
    return {x: clamp((e.clientX - left) / W, 0, 1), y: clamp((e.clientY - top) / H, 0, 1)};
  };
  const setFrom = e => {
    const pt = getNormPt(e);
    S.focus.x = pt.x; S.focus.y = pt.y;
    placeMark();
  };
  box.addEventListener('pointerdown', e => {
    if (!S.focus.on || focusDetailLoading || imgGenBusy || e.button !== 0) return;
    if (S.focus.mode === 'multi' && !S.focus.showMark) {
      const fb = e.target.closest?.('[data-fdet]');
      if (fb) selectMultiSubject(fb.dataset.fdet, true);
      return;
    }
    if (!S.focus.showMark) return;
    e.preventDefault(); on = true; focusDrag = true; box.classList.add('dragging');
    try { box.setPointerCapture(e.pointerId); } catch (err) {}
    setFrom(e);
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
function rigTarget() {
  const t = hooks.target?.();
  if (t && isFinite(t.x) && isFinite(t.y) && isFinite(t.z)) return t;
  return {x:0, y:calc().subjH / 2, z:0};
}

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
  const rawExt = hooks.sceneExtent?.('top');
  const ext = (isFinite(rawExt) && rawExt > 0) ? rawExt : (isFinite(k.fp) && k.fp > 0 ? k.fp * .75 : .6);
  const s = v.frozen ?? (Math.min(w, h) / 2 - 48) / Math.max(hd, ext, .05);
  Object.assign(v, {cx, cy, s, T});
  const step = drawGrid(ctx, w, h, cx, cy, s, C['ax-x'], C['ax-z'], cy + T.z * s, cx - T.x * s);
  $('topScale').textContent = `grid ${fmtStep(step)} · ${mStr(hd)}`;
  if (hooks.drawTopScene?.(ctx, v)) { /* video scene drawn */ }
  else {
    const sz = clamp(k.fp * s, 20, Math.min(38, Math.max(20, hd * s * .55)));
    v.thumbSz = sz;
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
    {dir:'fwd', x:clamp(px + ux * 32, 14, w - 14), y:clamp(py + uy * 32, 14, h - 14), ux, uy},
    {dir:'back', x:clamp(px - ux * 38, 14, w - 14), y:clamp(py - uy * 38, 14, h - 14), ux:-ux, uy:-uy},
    {dir:'right', x:clamp(px + rx * 28 - ux * 10, 14, w - 14), y:clamp(py + ry * 28 - uy * 10, 14, h - 14), ux:rx, uy:ry},
    {dir:'left', x:clamp(px - rx * 28 - ux * 10, 14, w - 14), y:clamp(py - ry * 28 - uy * 10, 14, h - 14), ux:-rx, uy:-ry}
  ];
  v.handles.forEach(hd2 => drawArrow(ctx, hd2, drag && drag.view === v && drag.dir === hd2.dir));
}
function drawSide() {
  const v = views.side, {ctx, w, h} = fit(v.c), k = calc(), T = rigTarget();
  if (w < 40 || h < 40) return;
  const cx = w / 2 + 20, cy = h / 2, el = rad(S.el);
  const hd = S.dist * Math.cos(el), hy = S.dist * Math.sin(el);
  const rawExt = hooks.sceneExtent?.('side');
  const ext = (isFinite(rawExt) && rawExt > 0) ? rawExt : (isFinite(k.subjH) && k.subjH > 0 ? k.subjH * .6 : .6);
  const s = v.frozen ?? (Math.min(w, h) / 2 - 48) / Math.max(S.dist, ext, .05);
  Object.assign(v, {cx, cy, s, T});
  const groundY = cy + T.y * s;
  const step = drawGrid(ctx, w, h, cx, cy, s, C['ax-z'], C['ax-y'], groundY);
  $('sideScale').textContent = `grid ${fmtStep(step)} · height ${hy >= 0 ? '+' : '-'}${mStr(Math.abs(hy))}`;
  if (hooks.drawSideScene?.(ctx, v)) { /* video scene drawn */ }
  else {
    const sz = views.top.thumbSz || clamp(k.fp * s, 20, 38);
    drawThumb(ctx, cx - sz / 2, cy - sz / 2, sz, sz, 3);
  }
  const px = cx - hd * s, py = cy - hy * s;
  let ux = cx - px, uy = cy - py; const L = Math.hypot(ux, uy); ux /= L || 1; uy /= L || 1;
  drawFrustum(ctx, px, py, ux, uy, Math.max(L, 40), rad(k.vfov / 2));
  drawCam(ctx, px, py, Math.atan2(uy, ux), 7, true);
  const upx = uy, upy = -ux;
  v.cam = {x:px, y:py};
  v.handles = [
    {dir:'fwd', x:clamp(px + ux * 32, 14, w - 14), y:clamp(py + uy * 32, 14, h - 14), ux, uy},
    {dir:'back', x:clamp(px - ux * 40, 14, w - 14), y:clamp(py - uy * 40, 14, h - 14), ux:-ux, uy:-uy},
    {dir:'up', x:clamp(px + upx * 30 - ux * 10, 14, w - 14), y:clamp(py + upy * 30 - uy * 10, 14, h - 14), ux:upx, uy:upy},
    {dir:'down', x:clamp(px - upx * 26 - ux * 10, 14, w - 14), y:clamp(py - upy * 26 - uy * 10, 14, h - 14), ux:-upx, uy:-upy}
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
function hit(view, x, y, name) {
  const hnd = (view.handles || []).find(h => Math.hypot(h.x - x, h.y - y) < 13);
  if (hnd) return {kind:'arrow', dir:hnd.dir};
  if (view.cam && Math.hypot(view.cam.x - x, view.cam.y - y) < 20) return {kind:'body'};
  const objHit = hooks.hitViewObj?.(name, view, x, y);
  if (objHit) return objHit;
  return null;
}
for (const [name, view] of Object.entries(views)) {
  const c = view.c;
  c.addEventListener('pointerdown', e => {
    const [x, y] = local(e, c), h = hit(view, x, y, name);
    if (!h) return;
    c.setPointerCapture(e.pointerId);
    drag = {view, name, ...h, x0:x, y0:y, moved:false, repeated:false};
    view.frozen = view.s;
    if (h.kind === 'obj') hooks.selectViewObj?.(h.objId);
    if (h.kind === 'arrow') drag.timer = setTimeout(() => { drag && (drag.iv = setInterval(() => { drag.repeated = true; STEP[name][h.dir](); changed(); }, 60)); }, 350);
    changed();
  });
  c.addEventListener('pointermove', e => {
    const [x, y] = local(e, c);
    if (!drag || drag.view !== view) { const h = hit(view, x, y, name); c.style.cursor = h ? ((h.kind === 'body' || h.kind === 'obj') ? 'grab' : 'pointer') : 'default'; return; }
    if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 4) { drag.moved = true; clearTimeout(drag.timer); clearInterval(drag.iv); }
    if (drag.moved) {
      c.style.cursor = 'grabbing';
      if (drag.kind === 'obj') hooks.dragViewObj?.(name, view, drag.objId, x, y, false);
      else applyDrag(view, drag.kind, drag.dir, x, y);
      changed();
    }
  });
  const end = () => {
    if (!drag || drag.view !== view) return;
    clearTimeout(drag.timer); clearInterval(drag.iv);
    if (drag.kind === 'arrow' && !drag.moved && !drag.repeated) STEP[name][drag.dir]();
    if (drag.kind === 'obj' && drag.moved) hooks.dragViewObj?.(name, view, drag.objId, 0, 0, true);
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
  hooks.cameraReset?.();
  changed(); toast('Camera reset: front view, eye level, default camera');
}));
$('resetCustom').addEventListener('click', async () => {
  Object.assign(S, {
    subjType:DEF.subjType,
    count:refs.length ? S.count : 1,
    types:refs.length ? S.types : [],
    subjCm:DEF.subjCm,
    subjColor:DEF.subjColor,
    subjDesc:'',
    descEn:'',
    descSrc:'',
    descPinned:false,
    descPinnedAt:0,
    descUserEdited:false,
    aspect:DEF.aspect,
    aspectCustom:'',
    light:DEF.light,
    lightCustom:'',
    bg:DEF.bg,
    bgCustom:'',
    bgPinned:'',
    extra:'',
    customKeys:[],
    keys:[...DEF.keys],
    refBg:0,
    focus:DEF_FOCUS(),
    lightOn:false,
    lightCat:'person',
    lightSetup:DEF.lightSetup,
    lights:rigFrom(LIGHTS.person[0]),
    lightSel:'key'
  });

  // Clear Description & all Focus detail text boxes (keeping reference images intact)
  if ($('subjDesc')) $('subjDesc').value = '';
  if ($('descStatus')) $('descStatus').textContent = '';
  if ($('focusDesc')) $('focusDesc').value = '';
  if ($('focusMultiText')) $('focusMultiText').value = '';
  if ($('focusNote')) $('focusNote').value = '';
  if ($('focusHiddenSubjBoxes')) $('focusHiddenSubjBoxes').innerHTML = '';

  refs.forEach(r => {
    r.aiRefDesc = '';
    r.aiSingleFocusDesc = '';
    r.aiMultiEdits = {};
    r.aiMultiMarkerDesc = '';
    r.vpRefDesc = '';
    r.vpSingleFocusDesc = '';
    r.vpMultiEdits = {};
    r.vpMultiMarkerDesc = '';
    r._vpRefPromise = null;
    if (Array.isArray(r.subjects)) {
      r.subjects.forEach(s => {
        delete s.aiDesc;
        delete s.vpDesc;
      });
    }
  });

  if (refs[0]?.img) {
    autoSelectAspectFromImage(refs[0].img);
  }
  if (refs.length) applySummary(true);
  syncUI();
  changed();
  toast('Custom options, Description & Focus details reset');

  // Re-run Description prompt generation immediately using the currently selected AI model
  if (refs.length) {
    setDescLoading(true);
    for (const r of refs) {
      if (!r.cancelled) {
        await detectRef(r, { forceDesc: true, skipFollowup: true });
      }
    }
    const curRef = refs[S.focus.img] || refs[0];
    if (curRef && !curRef.cancelled && S.focus.on && S.focus.mode === 'multi') {
      await runMultiModeAIStep(curRef);
    }
    changed();
  }
});
$('descPin').addEventListener('click', () => {
  if (!S.descPinned && !S.subjDesc.trim()) { toast('Write a description first'); return; }
  S.descPinned = !S.descPinned;
  if (S.descPinned) S.descPinnedAt = Date.now();
  changed();
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
  const id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  S.customKeys = [{id, text:text.slice(0, 500), kind, addedAt:Date.now()}, ...S.customKeys];
  S.keys = [id, ...S.keys];
  changed(); toast('Added to key prompts');
}
$('bgAdd').addEventListener('click', () => {
  const t = S.bgCustom.trim();
  if (!t) { toast('Describe the background first'); return; }
  S.bgPinned = t;
  S.bgCustom = '';
  $('bgCustom').value = '';
  addCustomKey('Background: ' + t, 'bg');
});
$('lightAdd').addEventListener('click', () => { const t = S.lightCustom.trim(); if (!t) { toast('Describe the lighting first'); return; } addCustomKey('Lighting: ' + t, 'light'); });
$('extraAdd').addEventListener('click', () => {
  const text = $('extra').value.trim();
  if (!text) { toast('Write a note first'); return; }
  const id = 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  S.customKeys = [{id, text:text.slice(0, 500), addedAt:Date.now()}, ...S.customKeys];
  S.keys = [id, ...S.keys];
  S.extra = ''; $('extra').value = '';
  changed(); toast('Added to key prompts');
});
$('themeBtn').addEventListener('click', () => {
  const m = root.getAttribute('data-mode') === 'night' ? 'day' : 'night';
  root.setAttribute('data-mode', m);
  try { localStorage.setItem('anglecraft-mode', m); } catch (e) {}
  drawAll(); hooks.themeChanged?.();
});
$('modeNormal').onclick = () => {
  S.mode = 'normal';
  S.focus.on = false;
  S.lightOn = false;
  document.body.classList.remove('adv');
  renderDock(); afterLayout();
  changed();
};
$('modeAdv').onclick = () => { if (!PRO) return needAdv(); S.mode = 'adv'; document.body.classList.add('adv'); if ($('modeNormal')) $('modeNormal').hidden = true; if ($('modeAdv')) $('modeAdv').disabled = true; renderDock(); afterLayout(); changed(); };
$('appImage').onclick = () => {
  if (S.app === 'image') return;
  if (S.app === 'video') {
    hooks.leaveVideo?.();
    switchModeState('image');
  }
  applyLayout();
  renderRefs();
  changed();
};
$('appVideo').onclick = () => { if (!ensureAdvMode('Video & 3D')) return; if (S.app === 'video') return; hooks.enterVideo ? hooks.enterVideo() : toast('Video & 3D could not load'); };
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
  if (del) {
    const id = del.dataset.del;
    S.customKeys = S.customKeys.filter(c => c.id !== id);
    S.keys = S.keys.filter(x => x !== id);
    if (!S.customKeys.some(c => c.kind === 'bg')) S.bgPinned = '';
    changed();
    return;
  }
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
        s.detail = `${TYPE_NAME[v]} ${i + 1}: ${s.desc}.`;
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
// CHANGE 2: Cross button (.x[data-rm]) must always be clickable, even while loading or AI request is in progress
$('refGrid').addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-rm]');
  if (b) { e.stopPropagation(); }
});
$('refGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-rm]');
  if (b) { e.preventDefault(); e.stopPropagation(); removeRef(b.dataset.rm); }
});
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.items || [])].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
  if (files.length) addFiles(files);
});
// Focus point (Image Mode): Single Mode, Multiple Mode, Focus Marker, Focus Detail & Focus Subject
function handleFocusToggleClick(e) {
  if (e) e.stopPropagation();
  if (S.mode !== 'adv') {
    if (!ensureAdvMode('Image Detection & Focus')) return;
    S.focus.on = true;
  } else {
    S.focus.on = !S.focus.on;
  }
  $('focusOn').setAttribute('aria-checked', String(!!S.focus.on));
  $('pFocus').classList.toggle('off', !S.focus.on);
  const curRef = refs[S.focus.img] || refs[0];
  if (!S.focus.on) {
    // Immediately release focus waiting state so the user never has to wait for detection/prompt
    setFocusDetailLoading(false);
    placeMark();
    updateAutoDescription(false);
    focusKey = '';
    changed();
    return;
  }
  // When turned back ON, restore any backend-saved focus/multi descriptions immediately if available
  if (curRef) {
    const activeModel = S.aiModel || 'visionpilot';
    const savedSingle = activeModel !== 'visionpilot' ? curRef.aiSingleFocusDesc : curRef.vpSingleFocusDesc;
    const savedMulti = activeModel !== 'visionpilot' ? curRef.aiMultiEdits : curRef.vpMultiEdits;
    if (savedMulti && typeof savedMulti === 'object') {
      S.focus.multiEdits = { ...(S.focus.multiEdits || {}), ...savedMulti };
    }
    if (S.focus.mode === 'single' && savedSingle && !S.focus.desc) {
      S.focus.desc = savedSingle;
      if ($('focusDesc')) $('focusDesc').value = savedSingle;
    }
  }
  placeMark();
  updateAutoDescription(false);
  focusKey = '';
  syncFocus();
  changed();
  if (S.focus.on && curRef && (S.aiModel || 'visionpilot') === 'visionpilot') {
    if (S.focus.mode === 'single' && !curRef.vpSingleFocusDesc) {
      identifyAt(curRef, S.focus.x, S.focus.y);
    } else if (S.focus.mode === 'multi' && (!curRef.vpMultiEdits || !Object.keys(curRef.vpMultiEdits).length)) {
      runMultiModeAIStep(curRef);
    }
  }
}
$('focusOn').addEventListener('click', handleFocusToggleClick);
$('focusOnWrap')?.addEventListener('click', e => {
  if (e.target.closest('#focusOn')) return;
  handleFocusToggleClick(e);
});
// CHANGE 4: In Multiple Mode, Focus Marker is off by default. When turned on, a glowing Marker button appears
// at the front of the subject buttons row and the marker shows in the image preview. Nothing is sent when merely turned on.
// When turned off, the Marker button goes away.
$('focusMarkOn')?.addEventListener('click', () => {
  if (S.mode !== 'adv') {
    if (!ensureAdvMode('Image Detection & Focus')) return;
    S.focus.on = true;
    S.focus.showMark = true;
  } else {
    S.focus.showMark = !S.focus.showMark;
    if (S.focus.showMark && !S.focus.on) S.focus.on = true;
  }
  if (!S.focus.showMark && S.focus.multiSel === '__marker') {
    S.focus.multiSel = '';
  }
  $('focusMarkOn').setAttribute('aria-checked', String(!!S.focus.showMark));
  $('focusOn').setAttribute('aria-checked', String(!!S.focus.on));
  $('pFocus').classList.toggle('off', !S.focus.on);
  focusKey = '';
  placeMark();
  syncFocus();
  changed();
});
$('focusTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-fimg]'); if (!b) return;
  const idx = +b.dataset.fimg;
  if (idx > 0 && idx >= refs.length) {
    toast(`Upload Image ${idx + 1} in Reference Images to switch to it`);
    return;
  }
  S.focus.img = idx; S.focus.multiSel = ''; S.focus.multiEditOpen = true;
  S.focus.multiPart = ''; S.focus.multiWhere = ''; S.focus.multiPartColor = '';
  updateAutoDescription(false);
  focusKey = ''; changed();
});
$('focusPic').addEventListener('load', placeMark);
$('focusModeBar').addEventListener('click', async e => {
  const b = e.target.closest('[data-fmode]'); if (!b) return;
  if (S.mode !== 'adv' && !ensureAdvMode('Image Detection & Focus')) return;
  const wantMulti = b.dataset.fmode === 'multi';
  S.focus.mode = wantMulti ? 'multi' : 'single';
  S.focus.on = true;
  // In Multiple Mode, the focus marker is off by default.
  // In Single Mode, the green focus marker works as normal and built-in image detection stays OFF.
  S.focus.showMark = !wantMulti;
  if (!S.focus.showMark && S.focus.multiSel === '__marker') {
    S.focus.multiSel = '';
  }
  if ($('focusMarkOn')) $('focusMarkOn').setAttribute('aria-checked', String(!!S.focus.showMark));
  placeMark();
  updateAutoDescription(false);
  focusKey = ''; changed();

  // Requirement 2: Built-in image detection turns ON only when Multiple Mode is turned ON.
  if (wantMulti && refs.length) {
    for (const r of refs) {
      if (!r.cancelled && (!r.det || !Array.isArray(r.subjects) || !r.subjects.length)) {
        await detectRef(r, { forMultiMode: true, skipRefStep: true, skipFollowup: true, forceDesc: true });
      }
    }
    focusKey = '';
    syncFocus();
    placeBoxes();
    changed();
    if (refs[S.focus.img]) {
      await runMultiModeAIStep(refs[S.focus.img]);
    }
  } else if (!wantMulti && refs[S.focus.img] && (S.aiModel || 'visionpilot') === 'visionpilot') {
    const curRef = refs[S.focus.img];
    if (!curRef.vpSingleFocusDesc) {
      await identifyAt(curRef, S.focus.x, S.focus.y);
    }
  }
});
on('focusDesc', 'input', v => {
  S.focus.desc = v;
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEdits['__marker'] = v;
  S.focus.multiMarkerText = v;
  syncActiveSingleItem();
  focusKey = '';
});
// Requirement 1: In Single Mode, "Focus Point Detail" is the "Marker"'s detail.
// Clicking "Into Subject" / "In Subject" adds the "Marker" button to the "Focus Subject" section below.
$('focusIntoSubjSingle').addEventListener('click', () => {
  if (!Array.isArray(S.focus.activeSubjs)) {
    S.focus.activeSubjs = S.focus.activeSubj ? [S.focus.activeSubj] : [];
  }
  const singleKey = '__marker';
  if (S.focus.singleActive) {
    S.focus.singleActive = false;
    S.focus.activeSubjs = S.focus.activeSubjs.filter(x => x !== singleKey && x !== S.focus.singleKey);
    S.focus.activeSubj = S.focus.activeSubjs[S.focus.activeSubjs.length - 1] || '';
    if (!S.focus.activeSubjs.length) S.focus.target = '';
    focusKey = ''; syncFocus(); changed();
    toast('Marker unselected from Select Focus Subject');
    return;
  }
  const detail = ($('focusDesc').value || S.focus.desc || '').trim();
  if (!detail) { toast('Click a spot on the image or write a detail first'); return; }
  S.focus.desc = detail;
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEdits['__marker'] = detail;
  S.focus.multiMarkerText = detail;
  S.focus.subjectItems = Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : [];
  const otherItems = S.focus.subjectItems.filter(it => it.key !== '__marker' && !it.isMarker && !it.isSinglePoint && it.key !== S.focus.singleKey);
  const markerItem = {
    key: singleKey,
    label: 'Marker',
    type: S.subjType || 'auto',
    category: 'Focus Marker',
    color: '#3fb950',
    desc: detail,
    detail,
    pointedPart: S.focus.note || '',
    pointedWhere: S.focus.where || '',
    x: S.focus.x,
    y: S.focus.y,
    img: S.focus.img,
    isMarker: true,
    isSinglePoint: true
  };
  S.focus.subjectItems = [markerItem, ...otherItems];
  S.focus.singleKey = singleKey;
  S.focus.singleActive = true;
  if (!S.focus.activeSubjs.includes(singleKey)) S.focus.activeSubjs.push(singleKey);
  S.focus.activeSubj = singleKey;
  S.focus.target = 'Marker';
  S.focus.on = true;
  focusKey = ''; syncFocus(); changed();
  toast('Marker added to Select Focus Subject');
});
// Reset button (next to Focus Marker toggle): clears current Focus details and re-runs detection when in Multiple Mode
$('focusMultiReset')?.addEventListener('click', async () => {
  const btn = $('focusMultiReset');
  const ref = refs[S.focus.img];
  S.focus.multiSel = '';
  S.focus.multiEditOpen = true;
  S.focus.multiEdits = {};
  S.focus.multiMarkerText = '';
  S.focus.desc = '';
  S.focus.activeSubj = '';
  S.focus.activeSubjs = [];
  S.focus.target = '';
  S.focus.singleActive = false;
  S.focus.subjectItems = (Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : []).filter(it => it.img !== S.focus.img && it.key !== '__marker' && !it.isMarker);
  S.descUserEdited = false;
  if ($('focusDesc')) $('focusDesc').value = '';
  if ($('focusMultiText')) $('focusMultiText').value = '';
  if (!ref || S.focus.mode !== 'multi') {
    if (ref) {
      ref.aiSingleFocusDesc = '';
      ref.aiMultiEdits = {};
      ref.aiMultiMarkerDesc = '';
      ref.vpMultiEdits = {};
    }
    focusKey = ''; syncFocus(); placeBoxes(); changed();
    toast('Focus details reset');
    return;
  }
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span> Resetting…';
  ref.det = null;
  ref.subjects = [];
  ref.aiMultiEdits = {};
  ref.aiMultiMarkerDesc = '';
  ref.vpMultiEdits = {};
  ref.status = 'busy';
  focusKey = ''; renderRefs(); syncFocus(); placeBoxes();
  try {
    await detectRef(ref, {forceDesc:true, forMultiMode:true, skipRefStep:true});
    toast('Re-ran AI detection on current image');
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
    focusKey = ''; syncFocus(); placeBoxes(); changed();
  }
});
// CHANGE 1 & CHANGE 4: Click subject button (or Marker button) to show its hidden box text in the always-visible box below
$('focusDetList').addEventListener('click', e => {
  const b = e.target.closest('[data-fdet]'); if (!b) return;
  selectMultiSubject(b.dataset.fdet, true);
});
$('focusMultiText').addEventListener('input', e => {
  if (!S.focus.multiSel) return;
  const val = e.target.value;
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEdits[S.focus.multiSel] = val;
  if (S.focus.multiSel === '__marker') {
    S.focus.multiMarkerText = val;
    setHiddenSubjectBoxText({ key: '__marker', label: 'Marker', color: '#22c55e' }, val, '#22c55e');
  } else {
    const subs = currentImgSubjects();
    const s = subs.find(x => x.key === S.focus.multiSel);
    setHiddenSubjectBoxText(s || S.focus.multiSel, val, s?.color || '');
    if (Array.isArray(S.focus.subjectItems)) {
      const it = S.focus.subjectItems.find(x => x.key === S.focus.multiSel);
      if (it) it.detail = val.trim();
    }
  }
  changed();
});
$('focusMultiDone')?.addEventListener('click', () => {
  if (!S.focus.multiSel) return;
  const k = S.focus.multiSel, val = ($('focusMultiText').value || '').trim();
  S.focus.multiEdits = S.focus.multiEdits || {};
  S.focus.multiEdits[k] = val;
  if (k === '__marker') {
    S.focus.multiMarkerText = val;
    setHiddenSubjectBoxText({ key: '__marker', label: 'Marker', color: '#22c55e' }, val, '#22c55e');
  } else {
    setHiddenSubjectBoxText(k, val);
    if (Array.isArray(S.focus.subjectItems)) {
      const it = S.focus.subjectItems.find(x => x.key === k);
      if (it && val) it.detail = val;
    }
  }
  S.focus.multiEditOpen = true;
  focusKey = ''; changed();
  toast('Subject details saved');
});
// Multiple Mode -> "Into Subject": transfers Marker (at the very front if active/present) and all detected subjects into Focus Subject
$('focusIntoSubjMulti').addEventListener('click', () => {
  if (S.focus.multiSel && $('focusMultiText')) {
    S.focus.multiEdits = S.focus.multiEdits || {};
    S.focus.multiEdits[S.focus.multiSel] = ($('focusMultiText').value || '').trim();
    if (S.focus.multiSel === '__marker') {
      S.focus.multiMarkerText = S.focus.multiEdits['__marker'];
    }
  }
  const subs = currentImgSubjects();
  const markerDetail = (
    getHiddenSubjectBoxText('__marker') ||
    S.focus.multiMarkerText ||
    S.focus.multiEdits?.['__marker'] ||
    ''
  ).trim();
  const includeMarker = Boolean(S.focus.showMark || markerDetail);

  if (!subs.length && !includeMarker) { toast('No subjects detected'); return; }
  const otherImgs = (Array.isArray(S.focus.subjectItems) ? S.focus.subjectItems : []).filter(
    it => it.key !== '__marker' && !it.isMarker && it.img !== S.focus.img && !subs.some(s => s.key === it.key)
  );
  const curItems = subs.map(s => {
    const cx = clamp((s.box?.x || .15) + (s.box?.w || .7) / 2, 0, 1);
    const cy = clamp((s.box?.y || .1) + (s.box?.h || .8) / 2, 0, 1);
    const savedDetail = getHiddenSubjectBoxText(s.key) || S.focus.multiEdits?.[s.key] || s.detail || '';
    return {
      key:s.key, label:s.label, type:s.type || S.subjType, category:s.category || null, subtype:s.subtype || '',
      color:s.color, subjHex:s.subjHex || null, colorName:s.colorName || null, secColorName:s.secColorName || null,
      desc:s.desc || '', detail:savedDetail, richSentence:s.richSentence || '',
      angle:s.angle || '', pose:s.pose || '', finish:s.finish || '', condition:s.condition || '',
      position:s.position || '', horiz:s.horiz || '', vert:s.vert || '', depth:s.depth || '',
      cm:s.cm || S.subjCm, box:s.box || null, partNames:s.partNames || null,
      x:cx, y:cy, img:S.focus.img
    };
  });
  const markerItems = includeMarker ? [{
    key:'__marker',
    label:'Marker',
    type:S.subjType || 'auto',
    category:'Focus Marker',
    color:'#3fb950',
    desc:markerDetail,
    detail:markerDetail || `Focus marker pointed at (${Math.round(S.focus.x * 100)}%, ${Math.round(S.focus.y * 100)}%)`,
    pointedPart:S.focus.multiPart || S.focus.note || '',
    pointedWhere:S.focus.multiWhere || S.focus.where || '',
    x:S.focus.x,
    y:S.focus.y,
    img:S.focus.img,
    isMarker:true
  }] : [];
  S.focus.subjectItems = [...markerItems, ...otherImgs, ...curItems];
  S.focus.multiEditOpen = true;
  S.focus.on = true; focusKey = ''; changed();
  const totalAdded = markerItems.length + subs.length;
  toast(`Transferred ${totalAdded} item${totalAdded > 1 ? 's' : ''} to Select Focus Subject`);
});
// Select Focus Subject -> click subject button(s) to independently toggle selection and include ONLY selected subjects' saved details in the main JSON prompt
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
    if (S.focus.singleKey === k || k === '__marker') S.focus.singleActive = false;
    if (S.focus.multiSel === k) { S.focus.multiSel = ''; S.focus.multiEditOpen = false; }
    focusKey = ''; changed(); refreshJsonIfReady();
    toast('Removed from Select Focus Subject'); return;
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
    if (item.isSinglePoint || item.isMarker || item.key === '__marker' || item.key === S.focus.singleKey) S.focus.singleActive = false;
    if (S.focus.multiSel === k) { S.focus.multiSel = S.focus.activeSubj; S.focus.multiEditOpen = false; }
    focusKey = ''; changed(); refreshJsonIfReady();
    toast(`${item.label} unselected from Main Prompt`);
  } else {
    S.focus.activeSubjs.push(k);
    S.focus.activeSubj = k;
    S.focus.on = true;
    S.focus.target = item.label;
    if (item.isSinglePoint || item.isMarker || item.key === '__marker' || item.key === S.focus.singleKey) {
      S.focus.singleActive = true;
      S.focus.singleKey = '__marker';
    }
    if (S.focus.mode === 'multi') S.focus.multiSel = k;
    if (isFinite(item.x)) S.focus.x = item.x;
    if (isFinite(item.y)) S.focus.y = item.y;
    focusKey = ''; changed(); refreshJsonIfReady();
    toast(`${item.label} details active in Main Prompt`);
  }
});
function toggleMacro() {
  if (S.mode !== 'adv') {
    if (!ensureAdvMode('Zoom to Detail')) return;
    S.focus.detail = true;
  } else {
    S.focus.detail = !S.focus.detail;
  }
  if (S.focus.detail) { S.focus.on = true; if (S.focus.detailAuto) S.focus.detailCm = clamp(S.focus.detailAuto, .5, 200); zoomToDetail(); }
  else S.focus.zoomLocked = false;
  changed();
}
$('detailOn').addEventListener('click', toggleMacro);
on('detailCm', 'change', v => { if (+v > 0) S.focus.detailCm = clamp(+v, .5, 200); if (S.focus.zoomLocked && S.focus.detail) zoomToDetail(); });
on('fZoom', 'input', v => { S.focus.zoom = clamp(+v, 1, 8); if (S.focus.zoom > 1) S.focus.on = true; });
function zoomToDetail(z) { const k = calc(), m = z ? 3 / clamp(+z, 1, 8) : 1; setDist(1.15 * m * (S.focus.detailCm / 100) * S.focal / k.sH); }
$('detailZoom').addEventListener('click', () => {
  if (S.mode !== 'adv' && !ensureAdvMode('Zoom to Detail')) return;
  S.focus.zoomLocked = !S.focus.zoomLocked;
  if (S.focus.zoomLocked) { S.focus.on = true; S.focus.detail = true; zoomToDetail(); toast('Zoom to detail locked'); }
  else toast('Zoom to detail unlocked');
  changed();
});
// lighting
$('lightOn').addEventListener('click', () => {
  if (S.mode !== 'adv') {
    if (!ensureAdvMode('Lighting')) return;
    S.lightOn = true;
  } else {
    if (!PRO) return needAdv('Lighting');
    S.lightOn = !S.lightOn;
  }
  changed();
});
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
  if (S.app === 'video' && t.closest('#vThree')) return;
  const p = t.closest('.view'); if (!p) return;
  S.min[p.id] = !S.min[p.id]; save(); syncUI();
  requestAnimationFrame(() => { drawAll(); placeMark(); fitPrompt(); });
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
  const pointedNote = sub.pointedPart
    ? `focus marker pointing at ${sub.label}'s ${sub.pointedPart}${sub.pointedWhere ? ' (' + sub.pointedWhere + ')' : ''}`
    : '';
  const visualTraitsList = [
    sub.richSentence || cleanDetail,
    sub.category ? `category: ${sub.category}` : '',
    sub.subtype ? `type: ${sub.subtype}` : '',
    sub.colorName ? `primary color: ${sub.colorName}${sub.subjHex ? ' (' + sub.subjHex + ')' : ''}` : '',
    sub.secColorName ? `secondary/trim color: ${sub.secColorName}` : '',
    partSummary ? `garment/feature colors (${partSummary})` : '',
    sub.pose ? `pose/framing: ${sub.pose}` : '',
    sub.angle ? `orientation: ${sub.angle}` : '',
    sub.finish ? `surface finish: ${sub.finish}` : '',
    sub.condition ? `condition: ${sub.condition}` : '',
    pointedNote
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
    ? `Show only ${selectedNamesStr} as the primary focal subjects: make ${sub.label} (${cleanDetail}) a primary focal point of the generated image alongside ${joinList(coSelectedSubs.map(s => s.label))}. Anchor the camera framing, optical focus plane, and primary lighting emphasis on ${selectedNamesStr}.`
    : `Show only ${sub.label} (${cleanDetail}) as the primary focal point and central hero of the generated image. Center and anchor the camera framing, optical focus plane, and primary lighting emphasis on ${sub.label}.`;
  const compAdjustment = `Show only ${selectedNamesStr} in primary focus and adjust the overall image composition around ${selectedNamesStr}: any unselected people or objects in the reference scene may move to secondary supporting positions (toward the background or periphery) or become less prominent with softer focus falloff, while the overall composition is built around ${selectedNamesStr}.`;
  const preserveInstruction = `Preserve ${sub.label}'s identity and defining visual details from the reference image as closely as possible: keep the exact same ${joinList(preserveAttrs)}, specifically maintaining ${cleanDetail}. Never swap or blend ${sub.label}'s identity or visual features with any other subject.`;

  const promptBlock = `SELECTED FOCUS SUBJECT (${sub.label}${sub.category ? ' · ' + sub.category : ''}): Show only ${selectedNamesStr} as the main focus — ${cleanDetail}. `
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
  const curImgSubs = (S.app !== 'video' ? currentImgSubjects() : []);
  const multiSelKey = (!hasSelectedFocusSubjs && isMultiFocus)
    ? (S.focus.multiSel || '')
    : '';
  const multiMainSubj = multiSelKey ? (curImgSubs.find(s => s.key === multiSelKey) || null) : null;
  const multiOtherSubjs = multiMainSubj ? curImgSubs.filter(s => s.key !== multiMainSubj.key) : [];
  const singleCenterActive = isSingleFocus && !!(S.focus.singleActive || activeFocusSubj);
  const liveSingleDesc = isSingleFocus ? (S.focus.desc || activeFocusSubj?.detail || S.focus.note || '').trim() : '';
  const detectedSubjSummary = (!desc && refs.length && curImgSubs.length && !hasSelectedFocusSubjs && !multiMainSubj)
    ? `Detected subject details: ${curImgSubs.map(s => (s.richSentence || s.detail || s.desc || s.label).replace(/\.\s*$/, '')).join('; ')}.`
    : '';
  const multiOtherSummary = multiOtherSubjs.length
    ? multiOtherSubjs.map(o => `${o.label} (${o.category || TYPE_NAME[o.type] || 'Subject'}): ${(o.richSentence || o.desc || o.baseDetail || o.label).replace(/\.\s*$/, '')}`).join('; ')
    : '';
  const multiCursorNote = (isMultiFocus && S.focus.showMark && S.focus.multiPart && multiMainSubj)
    ? ` Focus marker points directly at ${multiMainSubj.label}'s ${S.focus.multiPart}${S.focus.multiPartColor ? ` (${S.focus.multiPartColor})` : ''}, located ${S.focus.multiWhere || 'on the subject'}.`
    : '';
  const focusSubjText = hasSelectedFocusSubjs
    ? selectedFocusSubjInfos.map(info => info.prompt_block).join(' ')
    : isMultiFocus && multiMainSubj
    ? `PRIMARY FOCUS SUBJECT (central in composition): ${multiMainSubj.label} (${multiMainSubj.category}) — ${(multiMainSubj.richSentence || multiMainSubj.detail || multiMainSubj.desc || '').replace(/\.\s*$/, '')}.${multiCursorNote}${multiOtherSummary ? ` SURROUNDING SUBJECTS AROUND MAIN FOCUS: ${multiOtherSummary}.` : ''}`
    : (isSingleFocus && liveSingleDesc
      ? `Focus subject & pointed detail (${activeFocusSubj?.label || S.focus.target || curImgSubs[0]?.label || 'selected focus point'}): ${liveSingleDesc.replace(/\.\s*$/, '')}${curImgSubs[0]?.richSentence ? ' — ' + curImgSubs[0].richSentence.replace(/\.\s*$/, '') : ''}.`
      : '');
  const imgPresetText = (S.app !== 'video' && S.imgPresetPrompt) ? S.imgPresetPrompt : '';
  const actionParts = [
    desc ? `Scene and action (main instruction, follow it exactly): ${desc.replace(/\s*\n\s*/g, '; ')}.` : detectedSubjSummary,
    focusSubjText
  ].filter(Boolean);
  const action = actionParts.join(' ');
  const aspectRatioRaw = S.aspect === 'custom' ? (S.aspectCustom.trim() || '4:5') : S.aspect;
  const aspectInfo = getAspectSizeInfo(aspectRatioRaw);
  const aspectStr = aspectInfo.full;
  const customNotes = PRO ? S.customKeys.filter(c => S.keys.includes(c.id)).map(c => c.text) : [];
  const keyTexts = KEYS.filter(x => S.keys.includes(x.id) && (!x.video || (S.app === 'video' && !opts.use3d && (!opts.still || x.both))) && (!x.when || x.when.includes(S.subjType) || (mixed && x.id !== 'logo')))
    .map(x => opts.still && x.frameText ? x.frameText : group && x.group ? x.group : x.text).concat(customNotes);
  const bgFromImage = refs.length > 1 && S.refBg >= 0 && refs[S.refBg];
  const bgMode = bgFromImage ? 'keep' : S.bg;
  const alphaRefs = refs.map((r, i) => r.alpha ? i + 1 : 0).filter(Boolean);
  let bgText = bgFromImage
    ? `Use the environment and background from reference image ${S.refBg + 1} for the whole scene, re-projected correctly for the new viewpoint (perspective, horizon and parallax must match the camera angle).`
    : S.bg === 'custom' ? (S.bgCustom.trim() || S.bgPinned || 'Custom background as described by the user.') : BG[S.bg];
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
    : (isSingleFocus ? liveSingleDesc : (activeFocusSubj?.detail ? activeFocusSubj.detail.trim() : ''));
  const detail = detailActive() ? {
    part: note || fDesc || 'the pointed detail', of: focusTargetLabel || 'the subject', size_cm: S.focus.detailCm, shot: k.dShot,
    text: `Macro / detail shot: zoom in on ${note || 'the pointed detail'}${focusTargetLabel ? ` of ${focusTargetLabel}` : ''}`
      + (fDesc ? ` — ${fDesc.replace(/\.$/, '')}` : '')
      + ` — ${k.dShot ? k.dShot.text : 'the detail is the center of attention'}. Use a macro-lens look: razor-thin plane of focus on the detail, creamy falloff, micro texture visible, and keep the detail's exact design, material and any text identical to the reference.`
  } : null;
  let focus = null;
  if (S.app === 'video' && !opts.use3d) {
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
    const selText = `MAIN FOCUS SUBJECT${selectedFocusSubjInfos.length > 1 ? 'S' : ''} (mandatory composition rule): Show only ${selNames} (${selectedDetailsJoined}) as the ${selectedFocusSubjInfos.length > 1 ? 'primary focal points and central heroes' : 'SOLE main subject and hero'} of the shot. Place ${selNames} in the center of the camera frame, tack-sharp, well-lit, and rendered with full micro-detail, while any unselected elements in the scene move to secondary positions or become softly out of focus so nothing competes with ${selNames}.`;
    focus = {
      mode: S.focus.mode === 'multi' ? 'multiple' : 'single',
      target: selectedLabelsJoined,
      category: selCats || null,
      note: note || null,
      detail_description: selectedDetailsJoined || null,
      image: refs.length ? S.focus.img + 1 : null,
      point_pct: {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)},
      text: selText,
      master_line: `Show only ${selNames} (${selectedDetailsJoined}) as the ${selectedFocusSubjInfos.length > 1 ? 'primary focal points and heroes' : 'SOLE main subject and hero'} of the shot: placed centered in the frame, tack-sharp, and well-lit, while any unselected elements remain secondary and softly out of focus. `
    };
  } else if (isMultiFocus && multiMainSubj) {
    const othersLabelStr = multiOtherSubjs.length
      ? multiOtherSubjs.map(s => `${s.label}${s.category ? ' [' + s.category + ']' : ''}`).join(', ')
      : 'all other people or objects in the scene';
    const mainCleanDesc = (multiMainSubj.detail || multiMainSubj.richSentence || '').replace(/\s*Focus cursor pointing at[\s\S]*$/i, '').trim().replace(/\.\s*$/, '');
    const pointedPartText = (S.focus.showMark && S.focus.multiPart)
      ? ` Focus marker points at ${multiMainSubj.label}'s ${S.focus.multiPart}${S.focus.multiPartColor ? ` (${S.focus.multiPartColor})` : ''}, located ${S.focus.multiWhere || 'on the subject'}.`
      : '';
    const surroundingText = multiOtherSummary
      ? ` SURROUNDING SUBJECTS (described separately around ${multiMainSubj.label}): ${multiOtherSummary}.`
      : '';
    const multiText = `PRIMARY FOCUS SUBJECT (central in composition): ${multiMainSubj.label}${multiMainSubj.category ? ' (' + multiMainSubj.category + ')' : ''}${mainCleanDesc ? ' — ' + mainCleanDesc : ''} is the primary focus point of the shot, kept central in the camera composition, tack-sharp, well-lit, and rendered with full micro-detail.${pointedPartText}${surroundingText} Keep ${othersLabelStr} positioned around ${multiMainSubj.label} as secondary supporting subjects with softer focus falloff so ${multiMainSubj.label} remains the unmistakable central focus point.`;
    focus = {
      mode: 'multiple',
      target: multiMainSubj.label,
      category: multiMainSubj.category || null,
      pointed_part: (S.focus.showMark && S.focus.multiPart) ? S.focus.multiPart : (note || null),
      pointed_location: (S.focus.showMark && S.focus.multiWhere) ? S.focus.multiWhere : null,
      note: (S.focus.showMark && S.focus.multiPart) ? S.focus.multiPart : (note || null),
      detail_description: mainCleanDesc || null,
      surrounding_subjects: multiOtherSubjs.map(s => ({
        label: s.label,
        category: s.category || null,
        description: s.richSentence || s.desc || s.baseDetail || null,
        position: s.position || s.horiz || null
      })),
      non_focus_subjects: multiOtherSubjs.map(s => s.label),
      image: refs.length ? S.focus.img + 1 : null,
      point_pct: S.focus.showMark ? {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)} : null,
      text: multiText,
      master_line: `${multiMainSubj.label}${mainCleanDesc ? ' (' + mainCleanDesc + ')' : ''} is the primary focus point kept central in the composition, tack-sharp and well-lit${pointedPartText ? ' (' + pointedPartText.trim() + ')' : ''}, with ${othersLabelStr} arranged separately around ${multiMainSubj.label} as secondary subjects. `
    };
  } else if (isSingleFocus && (singleCenterActive || liveSingleDesc)) {
    const cleanSingle = liveSingleDesc.replace(/\.\s*$/, '');
    const ptStr = `${Math.round(S.focus.x * 100)}% from left, ${Math.round(S.focus.y * 100)}% from top${refs.length ? ` of reference image ${S.focus.img + 1}` : ''}`;
    const singleHeroLabel = cleanSingle || note || focusTargetLabel || 'the selected focus point';
    const singleText = singleCenterActive
      ? `CENTER OF FRAME & MAIN FOCUS (mandatory composition rule): Place the exact selected focus point (${ptStr}) — ${singleHeroLabel} — directly in the center of the camera frame, tack-sharp and clearly in focus as the hero of the shot. Keep the rest of the image and surrounding areas secondary and softly out of focus so nothing competes with this selected point.`
      : `FOCUS MARKER TARGET: Focus locked on ${focusTargetLabel || 'the subject'} at ${ptStr} — specifically ${singleHeroLabel}${S.focus.where ? ' (' + S.focus.where + ')' : ''}, kept tack-sharp in the center of the composition.`;
    focus = {
      mode: 'single',
      target: focusTargetLabel || curImgSubs[0]?.label || 'Selected Focus Point',
      pointed_part: note || null,
      pointed_location: S.focus.where || ptStr,
      note: note || null,
      detail_description: cleanSingle || null,
      image: refs.length ? S.focus.img + 1 : null,
      point_pct: S.focus.showMark ? {x: Math.round(S.focus.x * 100), y: Math.round(S.focus.y * 100)} : null,
      text: singleText,
      master_line: singleCenterActive
        ? `Place the exact selected focus point — ${singleHeroLabel} — directly in the center of the frame, sharp and clearly in focus as the hero of the shot, while the rest of the image stays secondary and softly out of focus. `
        : `Focus locked on ${focusTargetLabel || 'the subject'} (${singleHeroLabel}), kept centered and tack-sharp. `
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
  return {action, k, body, lens, T, n, group, mixed, noun, possN, preserve, isPerson, isPhone, desc, subjRef, aspectStr, aspectRatio: aspectInfo.ratio, aspectSizePx: aspectInfo.sizePx, aspectWidth: aspectInfo.width, aspectHeight: aspectInfo.height, customNotes, keyTexts, subs,
    bgMode, bgText, composition, focus, detail, activeFocusSubj, activeFocusSubjs, selectedFocusSubjInfo, selectedFocusSubjInfos, hasSelectedFocusSubjs, multiMainSubj, multiOtherSubjs, multiOtherSummary, singleCenterActive, imgPresetText, lightText, eq, N, lensName, lensChar, bgBlur, dofPhrase, negative,
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
  const use3d = !!opts.use3d;
  const img3dData = use3d && hooks.buildImg3DPromptData ? hooks.buildImg3DPromptData() : null;
  const selInfos = cm.selectedFocusSubjInfos || [];
  const hasSelFocus = selInfos.length > 0;
  const selLabelsStr = hasSelFocus ? joinList(selInfos.map(x => x.label)) : '';
  const selDetailsStr = hasSelFocus ? selInfos.map(x => `${x.label}: ${x.saved_detailed_description}`).join(' | ') : '';
  const groupLine = img3dData
    ? img3dData.summary_text
    : hasSelFocus
    ? (selInfos.length > 1
      ? `Show only ${selLabelsStr} as the primary focal subjects (${selInfos.length} selected): ${selDetailsStr}. Prioritize all ${selInfos.length} selected subjects in the center of the composition, while any unselected elements remain secondary.`
      : `Show only ${selInfos[0].label} (${selInfos[0].saved_detailed_description}) as the primary focal point and central hero of the composition, while any unselected elements remain secondary.`)
    : cm.multiMainSubj
    ? `Multiple-subject focus composition (${n} subjects detected): keep ${cm.multiMainSubj.label} as the primary focus point at the center of the composition, sharp and well-lit${cm.multiOtherSummary ? `, while describing and positioning the other subjects separately around it (${cm.multiOtherSummary})` : ''}.`
    : group ? `There are ${n} subjects. Keep all ${n} in frame with the same arrangement${refs.length > 1 ? '' : ' as the reference'}; from this angle their order, overlap and spacing change naturally with the viewpoint.` : '';
  const activeAiModel = S.aiModel || 'visionpilot';
  const aiWorkflow = (activeAiModel !== 'visionpilot' && window.VPAIBridge?.buildWorkflowExplanation)
    ? window.VPAIBridge.buildWorkflowExplanation(activeAiModel, {
        isVideo: false,
        refDesc: S.subjDesc || '',
        focusOn: !!S.focus.on,
        focusMode: S.focus.mode || 'single',
        focusTarget: cm.focus?.target || cm.multiMainSubj?.label || S.focus.target || noun,
        pointedPart: cm.focus?.pointed_part || S.focus.multiPart || S.focus.note || '',
        pointedWhere: cm.focus?.pointed_location || S.focus.multiWhere || S.focus.where || '',
        focusDetail: cm.focus?.detail_description || S.focus.desc || '',
        surroundingSummary: cm.multiOtherSummary || '',
        cameraSummary: `${A.phrase}, ${E.phrase}; ${shotName} (${shotDesc}) on ${body.name} with ${cm.lensName} at ${cm.eq}mm, ${apStr(cm.N)}; ${cm.dofPhrase}; ${cm.lightText}`
      })
    : null;
  const master = (aiWorkflow ? `[${aiWorkflow.active_ai_model} AI Workflow] ` : '')
    + (img3dData
    ? `${img3dData.master_prefix} Camera angle: ${A.phrase}, ${E.phrase}. `
    : `Re-photograph the exact same ${subjRef} from the reference image${refs.length > 1 ? 's' : ''} from a new camera angle: ${A.phrase}, ${E.phrase}. `)
    + (cm.imgPresetText ? cm.imgPresetText + ' ' : '')
    + (cm.action ? cm.action + ' ' : '')
    + (img3dData ? img3dData.master_details + ' ' : '')
    + (cm.composition ? 'All subjects from every reference image appear together in one photo. ' : '')
    + (cm.detail ? `${shotName}: zoom in on ${cm.detail.part}${S.focus.target ? ' of ' + S.focus.target : ''}, which fills the frame. ` : `${shotName}: ${shotDesc}. `)
    + `Shot on ${body.name} with ${cm.lensName} at ${cm.eq}mm, ${apStr(cm.N)}. ${cm.dofPhrase}. `
    + (img3dData && img3dData.focus_line ? img3dData.focus_line + ' ' : cm.focus && !cm.detail ? (cm.focus.master_line || `${cm.focus.target || 'The focus point'}${cm.focus.detail_description ? ' (' + cm.focus.detail_description + ')' : cm.focus.note ? ' (' + cm.focus.note + ')' : ''} is the main subject, centered and sharpest. `) : !cm.detail ? `The camera points straight at the ${noun}, which stays centered in frame and in sharp focus. ` : '')
    + (aiWorkflow ? aiWorkflow.workflow_narrative + ' ' : '')
    + `Keep ${joinList(cm.preserve.slice(0, 4))} identical to the reference. `
    + (cm.bgMode === 'keep' && A.absA > 15 ? 'The background turns with the camera and shows the scene from this new direction. ' : '')
    + `Real photograph shot on a real camera, not a 3D render, not CGI, not a cartoon: true-to-life skin, hair, fabric and materials. Photorealistic, ${aspectStr} aspect ratio.`
    + (keyTexts.length ? ' ' + keyTexts.map(t => t.split(':')[0]).join('. ') + '.' : '');
  const detailed = [
    aiWorkflow ? aiWorkflow.workflow_narrative : '',
    img3dData
      ? img3dData.guide_instruction
      : `Use the attached reference image${refs.length > 1 ? 's' : ` (shot as a ${cm.refView})`} as the single source of truth for the ${subjRef}. Keep the same real ${noun} and photograph it again from a new viewpoint, exactly as a real camera standing there would see it. Real photograph shot on a real camera, not a 3D render, not CGI, not a cartoon.`,
    cm.imgPresetText, cm.action, cm.composition, groupLine, img3dData?.focus_text || cm.focus?.text || '', cm.detail?.text || '',
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
    prompt_type: img3dData ? 'image_3d_scene_rerender' : cm.detail ? 'camera_angle_macro_detail' : 'camera_angle_rerender',
    ai_model: activeAiModel,
    ai_model_workflow: aiWorkflow || undefined,
    master_prompt: master,
    detailed_prompt: detailed,
    camera_preset: S.imgPresetId ? {id: S.imgPresetId, prompt: S.imgPresetPrompt} : null,
    scene_3d: img3dData ? img3dData.scene_3d : undefined,
    key_requirements: keyTexts,
    output_resolution: S.keys.includes('4k') ? '4K (3840 px long edge)' : 'native',
    reference_images: [
      ...(img3dData ? [{image: 1, file: 'visionpilot-3d-reference.png', role: '3D spatial layout, pose, scale and camera perspective guide (replace colored 3D proxy meshes with photorealistic real-world subjects)'}] : []),
      ...(refs.length ? refs.map((r, i) => ({
        image: (img3dData ? 2 : 1) + i,
        file: r.name,
        transparent_png: r.alpha || undefined,
        subjects: hasSelFocus
          ? selInfos.filter(s => s.img === i).map(s => s.label)
          : cm.subs.filter(s => s.img === i).map(s => s.label),
        role: 'identity, clothing, product design and appearance reference'
      })) : (!img3dData ? [{image: 1, file: null, note: 'attach your reference image'}] : []))
    ],
    composition: img3dData
      ? img3dData.composition_text
      : hasSelFocus
      ? [cm.composition, ...selInfos.map(x => x.composition_priority.primary_focal_point_instruction), selInfos[0].composition_priority.composition_adjustment].filter(Boolean).join(' ')
      : (cm.composition || null),
    selected_focus_subject: img3dData?.selected_focus_subject || selectedSubjectBlock,
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
            description: s.richSentence || s.detail || s.desc || null,
            original_position: s.position || s.horiz || null,
            is_selected_focus_subject: !!(cm.multiMainSubj && s.key === cm.multiMainSubj.key)
          })),
      main_subject: hasSelFocus
        ? {
            label: selInfos.map(x => x.label).join(', '),
            category: [...new Set(selInfos.map(x => x.category).filter(Boolean))].join(', ') || null,
            details: selDetailsStr,
            rule: 'primary focal point(s): placed in the center of the frame, sharp, well lit, clearly the hero(es) of the shot'
          }
        : cm.multiMainSubj
        ? {
            label: cm.multiMainSubj.label,
            category: cm.multiMainSubj.category || null,
            details: cm.multiMainSubj.detail || cm.multiMainSubj.richSentence || null,
            pointed_part: (S.focus.showMark && S.focus.multiPart) ? S.focus.multiPart : undefined,
            pointed_location: (S.focus.showMark && S.focus.multiWhere) ? S.focus.multiWhere : undefined,
            rule: 'primary focus point: kept central in the composition, tack-sharp, well-lit, with all other subjects described separately around it'
          }
        : null,
      surrounding_subjects: hasSelFocus ? null : (cm.multiMainSubj ? cm.multiOtherSubjs.map(s => ({
        label: s.label,
        category: s.category || null,
        description: s.richSentence || s.desc || s.baseDetail || null,
        original_position: s.position || s.horiz || null,
        rule: 'described separately around the central main focus subject as a secondary element'
      })) : null),
      non_focus_subjects: hasSelFocus ? null : (cm.multiMainSubj ? cm.multiOtherSubjs.map(s => ({label: s.label, category: s.category || null, description: s.richSentence || s.desc || null, rule: 'secondary subject positioned around the central main focus subject with softer focus falloff'})) : null),
      selected_focus_subject: selectedSubjectBlock || (cm.multiMainSubj ? {label: cm.multiMainSubj.label, details: cm.multiMainSubj.detail, pointed_part: S.focus.multiPart || undefined, pointed_location: S.focus.multiWhere || undefined} : null),
      description: cm.desc ? (group ? cm.desc.split(/\s*\n\s*/).filter(Boolean) : cm.desc) : null,
      preserve: cm.preserve,
      placement: hasSelFocus ? `${selLabelsStr} ${selInfos.length > 1 ? 'are the primary focal points and compositional anchors' : 'is the primary focal point and compositional anchor'}; any unselected people and objects move to secondary, less prominent positions around ${selLabelsStr}` : cm.multiMainSubj ? `${cm.multiMainSubj.label} kept central in the composition as the primary focus point; all other subjects arranged separately around it` : cm.singleCenterActive ? 'selected focus point placed in the exact center of the frame as main focus' : 'centered in frame; the camera always looks at the subject center',
      focus: hasSelFocus ? `primary focal point locked on ${selLabelsStr} (${selDetailsStr}); unselected elements less prominent` : cm.multiMainSubj ? `tack-sharp focus locked on ${cm.multiMainSubj.label}${S.focus.showMark && S.focus.multiPart ? ' (' + S.focus.multiPart + ' — ' + S.focus.multiWhere + ')' : ''}; other subjects described separately around it` : (S.focus.on && S.focus.mode === 'single') ? `sharp focus locked on ${cm.focus?.target || 'the subject'}${cm.focus?.pointed_part ? ' (' + cm.focus.pointed_part + ')' : ''}` : 'sharp focus locked on the subject'
    },
    focus_point: img3dData?.focus_point || (cm.focus ? {mode: cm.focus.mode || 'default', target: cm.focus.target, category: cm.focus.category || undefined, pointed_part: cm.focus.pointed_part || undefined, pointed_location: cm.focus.pointed_location || undefined, note: cm.focus.note, detail_description: cm.focus.detail_description || null, surrounding_subjects: cm.focus.surrounding_subjects || undefined, non_focus_subjects: cm.focus.non_focus_subjects || undefined, image: cm.focus.image, point_pct: cm.focus.point_pct, rule: cm.focus.text || 'this subject is the hero: centered and sharpest'} : null),
    macro_detail: cm.detail ? {detail: cm.detail.part, of: cm.detail.of, shot: k.dShot?.name || 'detail', look: 'macro lens, razor-thin focus, micro texture'} : null,
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
      aspect_ratio: cm.aspectRatio || aspectStr,
      aspect_ratio_size: cm.aspectSizePx || undefined,
      aspect_ratio_with_size: aspectStr,
      image_size_px: (cm.aspectWidth && cm.aspectHeight) ? {width: cm.aspectWidth, height: cm.aspectHeight} : undefined,
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
const GEN_LABEL = 'Generate Prompt';
const GEN_IMG_LABEL = 'Generate Image';
function showEmpty() {
  const what = S.app === 'video' ? '<b>Video</b> or <b>Image</b>' : '<b>Generate Prompt</b>';
  $('json').innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3H6a2 2 0 0 0-2 2v4l-2 3 2 3v4a2 2 0 0 0 2 2h2M16 3h2a2 2 0 0 1 2 2v4l2 3-2 3v4a2 2 0 0 1-2 2h-2"/></svg>'
    + `<span>Set the camera, then press ${what}.<br>Your JSON prompt will appear here.</span></div>`;
}
// kind: 'image' (image mode), 'video' (whole video with motion) or 'frame' (the current frame only, no motion)
let lastKind = 'image';
const promptLabel = () => S.app !== 'video' ? 'Image prompt' : lastKind === 'frame' && lastObj ? 'Image prompt' : 'Video prompt';
function generate(kind) {
  kind = S.app === 'video' ? (kind === 'frame' ? 'frame' : 'video') : 'image';
  const btn = $(kind === 'video' ? 'genVideo' : kind === 'frame' ? 'genFrame' : 'genBtn');
  if (document.querySelector('#pPrompt .btn.busy')) return;
  if ($('genImgModelBar') && !$('genImgModelBar').hidden) {
    closeGenImgModelBar();
  }
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
if ($('genImgBtn')) $('genImgBtn').innerHTML = GEN_IMG_LABEL;
$('genBtn').onclick = () => generate('image');
$('genVideo').onclick = () => generate('video');
$('genFrame').onclick = () => generate('frame');

// PART 2, 3, 4, 5 & 6: Generate Image, Model Chooser, Result Window & History Library
const VP_HIST_DB_NAME = 'vp_history_library_db';
const VP_HIST_STORE = 'entries';
const VP_HIST_LS_KEY = 'vp_history_library_v1';
let vpHistoryEntries = [];

function openHistoryDB() {
  return new Promise((resolve) => {
    if (!window.indexedDB) { resolve(null); return; }
    try {
      const req = indexedDB.open(VP_HIST_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(VP_HIST_STORE)) {
          db.createObjectStore(VP_HIST_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

async function loadHistoryLibrary() {
  let loaded = [];
  const db = await openHistoryDB();
  if (db) {
    loaded = await new Promise((resolve) => {
      try {
        const tx = db.transaction(VP_HIST_STORE, 'readonly');
        const req = tx.objectStore(VP_HIST_STORE).getAll();
        req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
        req.onerror = () => resolve([]);
      } catch (e) { resolve([]); }
    });
  }
  if (!loaded.length) {
    try {
      const raw = localStorage.getItem(VP_HIST_LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) loaded = parsed;
      }
    } catch (e) {}
  }
  loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  vpHistoryEntries = loaded;
  renderHistoryLibrary();
}

async function saveHistoryEntry(entry) {
  if (!entry) return;
  const hasMedia =
    entry.generatedImageDataUrl ||
    entry.upscaledImageDataUrl ||
    entry.upscaledVideoDataUrl ||
    (Array.isArray(entry.upFrames) && entry.upFrames.length) ||
    entry.exportDataUrl;
  if (!hasMedia) return;

  const item = {
    id: entry.id || ('vph_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
    kind: entry.kind || 'generated_image',
    mainImageDataUrl: entry.mainImageDataUrl || '',
    generatedImageDataUrl: entry.generatedImageDataUrl || entry.upscaledImageDataUrl || entry.exportDataUrl || (Array.isArray(entry.upFrames) && entry.upFrames[0]) || '',
    upscaledImageDataUrl: entry.upscaledImageDataUrl || '',
    upscaledVideoDataUrl: entry.upscaledVideoDataUrl || '',
    origFrames: Array.isArray(entry.origFrames) ? entry.origFrames : [],
    upFrames: Array.isArray(entry.upFrames) ? entry.upFrames : [],
    leftLabel: entry.leftLabel || (entry.kind === 'upscaled_video' ? 'Main Video' : 'Main Image'),
    rightLabel:
      entry.rightLabel ||
      (entry.kind === 'upscaled_image'
        ? 'Upscaled Image'
        : entry.kind === 'upscaled_video'
        ? 'Upscaled Video'
        : entry.kind === 'exported_video'
        ? 'Exported Video'
        : entry.kind === 'exported_image'
        ? 'Exported Image'
        : 'Generated Image'),
    scaleLabel: entry.scaleLabel || '',
    promptText: entry.promptText || '',
    modelName: entry.modelName || 'Generated Image',
    aspectRatio: entry.aspectRatio || '',
    width: entry.width || 0,
    height: entry.height || 0,
    fileName: entry.fileName || '',
    createdAt: entry.createdAt || Date.now()
  };

  // Deduplicate if an identical id is saved
  vpHistoryEntries = [item, ...vpHistoryEntries.filter((x) => x.id !== item.id)];

  const db = await openHistoryDB();
  if (db) {
    try {
      const tx = db.transaction(VP_HIST_STORE, 'readwrite');
      tx.objectStore(VP_HIST_STORE).put(item);
    } catch (e) {}
  }
  try {
    const compact = vpHistoryEntries.slice(0, 8).map((x) => ({
      ...x,
      upscaledVideoDataUrl: x.upscaledVideoDataUrl && x.upscaledVideoDataUrl.length > 250000 ? '' : x.upscaledVideoDataUrl
    }));
    localStorage.setItem(VP_HIST_LS_KEY, JSON.stringify(compact));
  } catch (e) {}

  renderHistoryLibrary();
  return item;
}
window.saveHistoryEntry = saveHistoryEntry;

function renderHistoryLibrary() {
  const listEl = $('vpHistoryList');
  const countLbl = $('vpHistoryCountLbl');
  const badgeEl = $('vpHistCountBadge');
  const n = vpHistoryEntries.length;
  if (countLbl) countLbl.textContent = `${n} saved ${n === 1 ? 'item' : 'items'}`;
  if (badgeEl) badgeEl.textContent = String(n);
  if (!listEl) return;

  if (!n) {
    listEl.innerHTML = '<div class="vph-empty" id="vpHistoryEmpty">No saved items yet. Generate an image, upscale an image/video, or export a 3D frame/video to see it here.</div>';
    return;
  }

  listEl.innerHTML = vpHistoryEntries.map((it, idx) => {
    const timeStr = it.createdAt ? new Date(it.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const isSingleExport = it.kind === 'exported_image' || it.kind === 'exported_video';
    const leftThumb =
      (it.kind === 'upscaled_video' && Array.isArray(it.origFrames) && it.origFrames[0]) ||
      it.mainImageDataUrl ||
      it.generatedImageDataUrl ||
      '';
    const rightThumb =
      (it.kind === 'upscaled_video' && Array.isArray(it.upFrames) && it.upFrames[0]) ||
      it.upscaledImageDataUrl ||
      it.generatedImageDataUrl ||
      '';
    const leftLbl = it.leftLabel || (it.kind === 'upscaled_video' ? 'Main Video' : 'Main Image');
    const rightLbl =
      it.rightLabel ||
      (it.kind === 'upscaled_image'
        ? 'Upscaled Image'
        : it.kind === 'upscaled_video'
        ? 'Upscaled Video'
        : 'Generated Image');
    const hasPrompt = Boolean(it.promptText && it.promptText.trim());

    const imgsHtml = isSingleExport
      ? `<div class="vph-imgs" style="grid-template-columns:1fr">
          <div class="vph-img-col">
            <div class="vph-img-frame" data-hist-preview="gen" data-hist-idx="${idx}" style="aspect-ratio:16/10" title="Click to open ${escAttr(rightLbl)}">
              <img src="${escAttr(rightThumb)}" alt="${escAttr(rightLbl)}">
            </div>
            <span class="vph-img-lbl">${esc(rightLbl)}</span>
          </div>
        </div>`
      : `<div class="vph-imgs">
          <div class="vph-img-col">
            <div class="vph-img-frame" data-hist-preview="main" data-hist-idx="${idx}" title="Click to view ${escAttr(leftLbl)}">
              <img src="${escAttr(leftThumb)}" alt="${escAttr(leftLbl)}">
            </div>
            <span class="vph-img-lbl">${esc(leftLbl)}</span>
          </div>
          <div class="vph-img-col">
            <div class="vph-img-frame" data-hist-preview="gen" data-hist-idx="${idx}" title="Click to view ${escAttr(rightLbl)}">
              <img src="${escAttr(rightThumb)}" alt="${escAttr(rightLbl)}">
            </div>
            <span class="vph-img-lbl">${esc(rightLbl)}</span>
          </div>
        </div>`;

    return `<div class="vph-entry" data-hist-id="${escAttr(it.id)}">
      <div class="vph-entry-meta">
        <b>${esc(it.modelName || rightLbl)}</b>
        <span>${esc(it.aspectRatio ? it.aspectRatio + ' · ' : '')}${esc(timeStr)}</span>
      </div>
      ${imgsHtml}
      <div class="vph-prompt-wrap">
        ${hasPrompt ? `<textarea class="vph-prompt-box" rows="3" readonly aria-label="Saved prompt">${esc(it.promptText || '')}</textarea>` : ''}
        <div class="vph-prompt-actions" style="${hasPrompt ? '' : 'grid-template-columns:1fr'}">
          ${hasPrompt ? `<button type="button" class="btn ghost sm" data-hist-copy="${idx}">Copy Prompt</button>` : ''}
          <button type="button" class="btn sm vph-del-btn" data-hist-del="${escAttr(it.id)}">Delete</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

const VP_HIST_DEL_NEVER_KEY = 'vp_hist_del_never_ask';
let pendingDeleteHistId = '';

async function deleteHistoryEntryById(entryId) {
  if (!entryId) return;
  vpHistoryEntries = vpHistoryEntries.filter((x) => x.id !== entryId);
  const db = await openHistoryDB();
  if (db) {
    try {
      const tx = db.transaction(VP_HIST_STORE, 'readwrite');
      tx.objectStore(VP_HIST_STORE).delete(entryId);
    } catch (e) {}
  }
  try {
    localStorage.setItem(VP_HIST_LS_KEY, JSON.stringify(vpHistoryEntries.slice(0, 8)));
  } catch (e) {}
  renderHistoryLibrary();
  toast('Deleted from History / Library');
}

function openHistDeleteConfirmModal(entryId) {
  pendingDeleteHistId = entryId;
  const modal = $('vpHistDeleteModal');
  const chk = $('vpHistDelNeverAsk');
  if (chk) chk.checked = false;
  if (modal) modal.hidden = false;
}

function closeHistDeleteConfirmModal() {
  pendingDeleteHistId = '';
  const modal = $('vpHistDeleteModal');
  if (modal) modal.hidden = true;
}

function requestDeleteHistoryEntry(entryId) {
  if (!entryId) return;
  let neverAsk = false;
  try {
    neverAsk = localStorage.getItem(VP_HIST_DEL_NEVER_KEY) === '1';
  } catch (e) {}
  if (neverAsk) {
    deleteHistoryEntryById(entryId);
  } else {
    openHistDeleteConfirmModal(entryId);
  }
}

$('vpHistDelConfirmBtn')?.addEventListener('click', () => {
  const id = pendingDeleteHistId;
  const chk = $('vpHistDelNeverAsk');
  if (chk && chk.checked) {
    try {
      localStorage.setItem(VP_HIST_DEL_NEVER_KEY, '1');
    } catch (e) {}
  }
  closeHistDeleteConfirmModal();
  if (id) deleteHistoryEntryById(id);
});
$('vpHistDelCancelBtn')?.addEventListener('click', closeHistDeleteConfirmModal);
$('vpHistDelCloseX')?.addEventListener('click', closeHistDeleteConfirmModal);
$('vpHistDeleteModal')?.addEventListener('click', (e) => {
  if (e.target === $('vpHistDeleteModal')) closeHistDeleteConfirmModal();
});

$('vpHistoryList')?.addEventListener('click', (e) => {
  const copyBtn = e.target.closest('button[data-hist-copy]');
  if (copyBtn) {
    const idx = Number(copyBtn.dataset.histCopy);
    const it = vpHistoryEntries[idx];
    if (it && it.promptText) {
      copyText(it.promptText, copyBtn);
    }
    return;
  }
  const delBtn = e.target.closest('button[data-hist-del]');
  if (delBtn) {
    const entryId = delBtn.dataset.histDel;
    if (entryId) requestDeleteHistoryEntry(entryId);
    return;
  }
  const prevFrame = e.target.closest('[data-hist-preview]');
  if (prevFrame) {
    const idx = Number(prevFrame.dataset.histIdx);
    const it = vpHistoryEntries[idx];
    if (!it) return;
    if (it.kind === 'upscaled_image' || (it.upscaledImageDataUrl && it.mainImageDataUrl)) {
      openUpscaledImageResultModal({
        origDataUrl: it.mainImageDataUrl,
        upscaledDataUrl: it.upscaledImageDataUrl || it.generatedImageDataUrl,
        scaleLabel: it.scaleLabel || '2x',
        width: it.width,
        height: it.height
      });
      return;
    }
    if (it.kind === 'upscaled_video') {
      openUpscaledVideoResultModal({
        origFrames: it.origFrames || [it.mainImageDataUrl],
        upFrames: it.upFrames || [it.generatedImageDataUrl],
        scaleLabel: it.scaleLabel || '2K',
        videoDataUrl: it.upscaledVideoDataUrl || '',
        width: it.width,
        height: it.height,
        fileName: it.fileName || 'visionpilot-upscaled-video.webm'
      });
      return;
    }
    if (it.kind === 'exported_image' || it.kind === 'exported_video') {
      openExportedMediaModal({
        mediaType: it.kind === 'exported_video' ? 'video' : 'image',
        dataUrl: it.upscaledVideoDataUrl || it.generatedImageDataUrl,
        thumbUrl: it.generatedImageDataUrl,
        promptText: it.promptText || '',
        label: it.modelName || (it.kind === 'exported_video' ? '3D Export Video' : '3D Export Image'),
        width: it.width,
        height: it.height,
        fileName: it.fileName
      });
      return;
    }
    const isMain = prevFrame.dataset.histPreview === 'main';
    openGeneratedImageResultModal(
      isMain ? it.mainImageDataUrl : it.generatedImageDataUrl,
      isMain ? 'Main Image' : (it.modelName || 'Generated Image'),
      {
        mainImageDataUrl: it.mainImageDataUrl,
        promptText: it.promptText,
        aspectRatio: it.aspectRatio
      }
    );
  }
});

function toggleHistoryDrawer(forceState) {
  const drawer = $('vpHistoryDrawer');
  const backdrop = $('vpHistoryDrawerBackdrop');
  const moreBtn = $('vpMoreBtn');
  if (!drawer) return;
  const nextOpen = typeof forceState === 'boolean' ? forceState : !drawer.classList.contains('open');
  drawer.classList.toggle('open', nextOpen);
  drawer.setAttribute('aria-hidden', String(!nextOpen));
  if (backdrop) backdrop.hidden = !nextOpen;
  if (moreBtn) moreBtn.setAttribute('aria-expanded', String(nextOpen));
}
window.toggleHistoryDrawer = toggleHistoryDrawer;
$('vpHistoryDrawerBackdrop')?.addEventListener('click', () => toggleHistoryDrawer(false));

$('vpMoreBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleHistoryDrawer();
});
$('vpOpenHistoryOpt')?.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleHistoryDrawer(true);
});

// Collapsible sections inside #vpHistoryDrawer (User bar, Settings bar, History / Library bar)
function bindDrawerCollapsibleSection(secId, headId, bodyId, arrowSelector) {
  const sec = $(secId);
  const head = $(headId);
  const body = $(bodyId);
  if (!sec || !head || !body) return;
  head.addEventListener('click', (e) => {
    e.stopPropagation();
    const isMin = sec.classList.toggle('min');
    body.hidden = isMin;
    head.setAttribute('aria-expanded', String(!isMin));
    const arr = arrowSelector ? head.querySelector(arrowSelector) : head.querySelector('.vpd-sec-arr');
    if (arr) arr.textContent = isMin ? '▸' : '▾';
  });
}
bindDrawerCollapsibleSection('vpDrawerUserSec', 'vpDrawerUserHead', 'vpDrawerUserBody', '#vpDrawerUserArrow');
bindDrawerCollapsibleSection('vpDrawerSettingsSec', 'vpDrawerSettingsHead', 'vpDrawerSettingsBody', '.vpd-sec-arr');
bindDrawerCollapsibleSection('vpDrawerHistSec', 'vpDrawerHistHead', 'vpHistoryList', '#vpHistoryMinArrow');

// Clicking anywhere outside the open 3-dot drawer automatically slides it back in
document.addEventListener('pointerdown', (e) => {
  const drawer = $('vpHistoryDrawer');
  if (!drawer || !drawer.classList.contains('open')) return;
  if (drawer.contains(e.target) || e.target.closest('#vpMoreBtn') || e.target.closest('#vpHistDeleteModal')) return;
  toggleHistoryDrawer(false);
});

/* ---------- PART 4: UNIFIED RESULT WINDOW (Generated Image / Upscaled Image / Upscaled Video / 3D Export) ---------- */
let currentResultModalState = {
  mode: 'generated_image',
  imageDataUrl: '',
  mainImageDataUrl: '',
  promptText: '',
  modelLabel: '',
  aspectRatio: '',
  splitPct: 50,
  viewMode: 'split', // 'split' | 'orig' | 'up'
  holdingOrig: false,
  origFrames: [],
  upFrames: [],
  activeFrameIdx: 0
};

function reshapeResultWindowForAspect(w, h) {
  const card = $('genImgResultCard');
  if (!card) return;
  const numW = Number(w) || 1024;
  const numH = Number(h) || 1024;
  const ratio = clamp(numW / Math.max(1, numH), 0.45, 2.4);
  // Reshapes to match the aspect ratio of the image/video while keeping close to its current size
  let targetCardW = 580;
  if (ratio < 0.85) {
    // Tall portrait (e.g. 9:16 -> ~440px, 3:4 -> ~490px)
    targetCardW = Math.round(clamp(360 + ratio * 150, 420, 520));
  } else if (ratio > 1.18) {
    // Wide landscape (e.g. 16:9 -> ~720px, 3:2 -> ~660px)
    targetCardW = Math.round(clamp(480 + ratio * 135, 620, 760));
  } else {
    // Square-ish (1:1, 4:5, 5:4)
    targetCardW = Math.round(clamp(500 + ratio * 65, 530, 600));
  }
  card.style.setProperty('--res-card-w', targetCardW + 'px');
  card.style.width = targetCardW + 'px';
}

function reshapeResultWindowFromDataUrl(dataUrl) {
  if (!dataUrl) {
    reshapeResultWindowForAspect(1024, 1024);
    return;
  }
  const probe = new Image();
  probe.onload = () => {
    if (probe.naturalWidth && probe.naturalHeight) {
      reshapeResultWindowForAspect(probe.naturalWidth, probe.naturalHeight);
    }
  };
  probe.src = dataUrl;
  if (probe.complete && probe.naturalWidth && probe.naturalHeight) {
    reshapeResultWindowForAspect(probe.naturalWidth, probe.naturalHeight);
  }
}

function updateComparisonSliderDOM() {
  const clipEl = $('resCompareOrigClip');
  const handleEl = $('resCompareHandle');
  const origBtn = $('resViewOrigBtn');
  const upBtn = $('resViewUpBtn');
  const holdBtn = $('resHoldOrigBtn');
  if (!clipEl || !handleEl) return;

  if (currentResultModalState.holdingOrig || currentResultModalState.viewMode === 'orig') {
    clipEl.style.clipPath = 'inset(0 0% 0 0)';
    handleEl.hidden = currentResultModalState.viewMode === 'orig' || currentResultModalState.holdingOrig;
    origBtn?.classList.add('active');
    upBtn?.classList.remove('active');
  } else if (currentResultModalState.viewMode === 'up') {
    clipEl.style.clipPath = 'inset(0 100% 0 0)';
    handleEl.hidden = true;
    origBtn?.classList.remove('active');
    upBtn?.classList.add('active');
  } else {
    const pct = clamp(currentResultModalState.splitPct, 0, 100);
    clipEl.style.clipPath = `inset(0 ${(100 - pct).toFixed(2)}% 0 0)`;
    handleEl.style.left = `${pct.toFixed(2)}%`;
    handleEl.setAttribute('aria-valuenow', String(Math.round(pct)));
    handleEl.hidden = false;
    // Highlight the active side or Upscaled by default
    origBtn?.classList.toggle('active', pct > 65);
    upBtn?.classList.toggle('active', pct <= 65);
  }
  if (holdBtn) {
    holdBtn.classList.toggle('holding', Boolean(currentResultModalState.holdingOrig));
  }
}

function setComparisonSplit(pct) {
  currentResultModalState.splitPct = clamp(pct, 0, 100);
  currentResultModalState.viewMode = 'split';
  updateComparisonSliderDOM();
}

// Setup comparison slider pointer dragging, top-left Original/Upscaled buttons, and top-right Hold Original button
(function initComparisonControls() {
  const wrap = $('resCompareWrap');
  const handle = $('resCompareHandle');
  const origBtn = $('resViewOrigBtn');
  const upBtn = $('resViewUpBtn');
  const holdBtn = $('resHoldOrigBtn');
  if (!wrap || !handle) return;

  let draggingCompare = false;
  const updateFromClientX = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    if (!rect.width) return;
    const pct = clamp(((clientX - rect.left) / rect.width) * 100, 0, 100);
    setComparisonSplit(pct);
  };

  wrap.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.res-compare-top-left, .res-hold-orig-btn')) return;
    draggingCompare = true;
    try { wrap.setPointerCapture(e.pointerId); } catch (_) {}
    updateFromClientX(e.clientX);
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!draggingCompare) return;
    updateFromClientX(e.clientX);
  });
  ['pointerup', 'pointercancel'].forEach((ev) => {
    wrap.addEventListener(ev, () => { draggingCompare = false; });
  });

  origBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentResultModalState.viewMode === 'orig') {
      currentResultModalState.viewMode = 'split';
    } else {
      currentResultModalState.viewMode = 'orig';
    }
    updateComparisonSliderDOM();
  });
  upBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentResultModalState.viewMode === 'up') {
      currentResultModalState.viewMode = 'split';
    } else {
      currentResultModalState.viewMode = 'up';
    }
    updateComparisonSliderDOM();
  });

  if (holdBtn) {
    const startHold = (e) => {
      e.stopPropagation();
      e.preventDefault();
      currentResultModalState.holdingOrig = true;
      updateComparisonSliderDOM();
    };
    const endHold = () => {
      if (!currentResultModalState.holdingOrig) return;
      currentResultModalState.holdingOrig = false;
      updateComparisonSliderDOM();
    };
    holdBtn.addEventListener('pointerdown', startHold);
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => {
      holdBtn.addEventListener(ev, endHold);
    });
  }
})();

function syncScaleButtonsLockState() {
  const can4x = Boolean(S.mode === 'adv' || PRO);
  const btnImg4x = $('imgUpscale4xBtn');
  const btnGenWin4x = $('genWinUpscale4xBtn');
  const btnVid4k = $('vidUpscale4kBtn');

  [btnImg4x, btnGenWin4x, btnVid4k].forEach((b) => {
    if (!b) return;
    const extraDis = b.dataset.forceDisabled === '1';
    const dis = !can4x || extraDis;
    b.classList.toggle('upscale-disabled', dis);
    b.disabled = dis;
  });
}
window.syncScaleButtonsLockState = syncScaleButtonsLockState;

function openGeneratedImageResultModal(imageDataUrl, modelLabel = '', meta = {}) {
  const modal = $('genImgResultModal');
  const titleEl = $('genImgResultTitle');
  const pill = $('genImgResultModelPill');
  const pic = $('genImgResultPic');
  const vidPlayer = $('genVidResultPlayer');
  const cmpWrap = $('resCompareWrap');
  const vThumbs = $('resVideoThumbs');
  const promptWrap = $('resExportPromptWrap');
  const dlBtn = $('genImgDownloadBtn');
  const upRow = $('genImgUpscaleRow');
  if (!modal || !pic) return;

  currentResultModalState = {
    mode: 'generated_image',
    imageDataUrl,
    mainImageDataUrl: meta.mainImageDataUrl || imageDataUrl,
    promptText: meta.promptText || '',
    modelLabel: modelLabel || 'Generated Image',
    aspectRatio: meta.aspectRatio || '',
    splitPct: 50,
    viewMode: 'split',
    holdingOrig: false,
    origFrames: [],
    upFrames: [],
    activeFrameIdx: 0
  };

  if (titleEl) {
    titleEl.textContent = 'Generated Image';
    titleEl.classList.remove('is-upscale');
  }
  if (pill) {
    pill.textContent = modelLabel || 'AI Generated';
    pill.hidden = !modelLabel;
  }

  pic.src = imageDataUrl;
  pic.hidden = false;
  if (vidPlayer) { vidPlayer.pause?.(); vidPlayer.hidden = true; }
  if (cmpWrap) cmpWrap.hidden = true;
  if (vThumbs) { vThumbs.hidden = true; vThumbs.innerHTML = ''; }
  if (promptWrap) promptWrap.hidden = true;

  if (dlBtn) {
    dlBtn.textContent = '⬇ Download Image';
    dlBtn.href = imageDataUrl;
    dlBtn.download = `visionpilot-generated-${Date.now()}.png`;
  }
  if (upRow) {
    upRow.hidden = false;
  }
  syncScaleButtonsLockState();
  reshapeResultWindowFromDataUrl(imageDataUrl);
  modal.hidden = false;
}
window.openGeneratedImageResultModal = openGeneratedImageResultModal;

function openUpscaledImageResultModal({ origDataUrl, upscaledDataUrl, scaleLabel = '2x', width = 0, height = 0 } = {}) {
  const modal = $('genImgResultModal');
  const titleEl = $('genImgResultTitle');
  const pill = $('genImgResultModelPill');
  const pic = $('genImgResultPic');
  const vidPlayer = $('genVidResultPlayer');
  const cmpWrap = $('resCompareWrap');
  const origImg = $('resCompareOrigImg');
  const upImg = $('resCompareUpImg');
  const vThumbs = $('resVideoThumbs');
  const promptWrap = $('resExportPromptWrap');
  const dlBtn = $('genImgDownloadBtn');
  const upRow = $('genImgUpscaleRow');

  if (!modal || !cmpWrap || !upImg || !origImg) {
    toast('Error: Could not open Upscaled Image window.');
    return;
  }
  if (!upscaledDataUrl) {
    toast('Error: Upscaled image data is empty.');
    return;
  }

  currentResultModalState = {
    mode: 'upscaled_image',
    imageDataUrl: upscaledDataUrl,
    mainImageDataUrl: origDataUrl || upscaledDataUrl,
    promptText: '',
    modelLabel: scaleLabel,
    aspectRatio: '',
    splitPct: 50,
    viewMode: 'split',
    holdingOrig: false,
    origFrames: [],
    upFrames: [],
    activeFrameIdx: 0
  };

  if (titleEl) {
    titleEl.textContent = 'Upscaled Image';
    titleEl.classList.add('is-upscale');
  }
  if (pill) {
    pill.textContent = scaleLabel || '2x';
    pill.hidden = false;
  }

  if (pic) pic.hidden = true;
  if (vidPlayer) { vidPlayer.pause?.(); vidPlayer.hidden = true; }
  if (vThumbs) { vThumbs.hidden = true; vThumbs.innerHTML = ''; }
  if (promptWrap) promptWrap.hidden = true;
  if (upRow) upRow.hidden = true;

  origImg.src = origDataUrl || upscaledDataUrl;
  upImg.src = upscaledDataUrl;
  cmpWrap.hidden = false;
  setComparisonSplit(50);

  if (dlBtn) {
    dlBtn.textContent = '⬇ Download';
    dlBtn.href = upscaledDataUrl;
    dlBtn.download = `visionpilot-upscaled-${scaleLabel || '2x'}-${Date.now()}.png`;
  }

  if (width && height) {
    reshapeResultWindowForAspect(width, height);
  } else {
    reshapeResultWindowFromDataUrl(upscaledDataUrl);
  }
  modal.hidden = false;
}
window.openUpscaledImageResultModal = openUpscaledImageResultModal;

function openUpscaledVideoResultModal({
  origFrames = [],
  upFrames = [],
  scaleLabel = '2K',
  videoDataUrl = '',
  videoBlobUrl = '',
  width = 0,
  height = 0,
  fileName = ''
} = {}) {
  const modal = $('genImgResultModal');
  const titleEl = $('genImgResultTitle');
  const pill = $('genImgResultModelPill');
  const pic = $('genImgResultPic');
  const vidPlayer = $('genVidResultPlayer');
  const cmpWrap = $('resCompareWrap');
  const origImg = $('resCompareOrigImg');
  const upImg = $('resCompareUpImg');
  const vThumbs = $('resVideoThumbs');
  const promptWrap = $('resExportPromptWrap');
  const dlBtn = $('genImgDownloadBtn');
  const upRow = $('genImgUpscaleRow');

  if (!modal || !cmpWrap || !origImg || !upImg || !upFrames.length) {
    toast('Error: Could not open Upscaled Video window.');
    return;
  }

  currentResultModalState = {
    mode: 'upscaled_video',
    imageDataUrl: upFrames[0],
    mainImageDataUrl: origFrames[0] || upFrames[0],
    promptText: '',
    modelLabel: scaleLabel,
    aspectRatio: '',
    splitPct: 50,
    viewMode: 'split',
    holdingOrig: false,
    origFrames,
    upFrames,
    activeFrameIdx: 0
  };

  if (titleEl) {
    titleEl.textContent = 'Upscaled Video';
    titleEl.classList.add('is-upscale');
  }
  if (pill) {
    pill.textContent = scaleLabel || '2K';
    pill.hidden = false;
  }

  if (pic) pic.hidden = true;
  if (vidPlayer) { vidPlayer.pause?.(); vidPlayer.hidden = true; }
  if (promptWrap) promptWrap.hidden = true;
  if (upRow) upRow.hidden = true;

  const setActiveVideoFrame = (fIdx) => {
    const i = clamp(fIdx, 0, upFrames.length - 1);
    currentResultModalState.activeFrameIdx = i;
    origImg.src = origFrames[i] || upFrames[i];
    upImg.src = upFrames[i];
    if (vThumbs) {
      vThumbs.querySelectorAll('.res-vthumb-btn').forEach((b, bi) => {
        b.classList.toggle('active', bi === i);
      });
    }
  };

  if (vThumbs) {
    vThumbs.hidden = false;
    vThumbs.innerHTML = upFrames
      .map(
        (fUrl, i) =>
          `<button type="button" class="res-vthumb-btn${i === 0 ? ' active' : ''}" data-vframe-idx="${i}" title="View extracted frame ${i + 1} of ${upFrames.length}">
            <img src="${escAttr(fUrl)}" alt="Frame ${i + 1}">
            <span>#${i + 1}</span>
          </button>`
      )
      .join('');
    vThumbs.onclick = (e) => {
      const btn = e.target.closest('.res-vthumb-btn[data-vframe-idx]');
      if (btn) setActiveVideoFrame(Number(btn.dataset.vframeIdx));
    };
  }

  cmpWrap.hidden = false;
  setActiveVideoFrame(0);
  setComparisonSplit(50);

  if (dlBtn) {
    dlBtn.textContent = '⬇ Download';
    dlBtn.href = videoBlobUrl || videoDataUrl || upFrames[0];
    dlBtn.download = fileName || `visionpilot-upscaled-${scaleLabel || '2K'}-${Date.now()}.webm`;
  }

  if (width && height) {
    reshapeResultWindowForAspect(width, height);
  } else {
    reshapeResultWindowFromDataUrl(upFrames[0]);
  }
  modal.hidden = false;
}
window.openUpscaledVideoResultModal = openUpscaledVideoResultModal;

function openExportedMediaModal({
  mediaType = 'image',
  dataUrl = '',
  blobUrl = '',
  thumbUrl = '',
  promptText = '',
  label = '3D Export',
  width = 0,
  height = 0,
  fileName = ''
} = {}) {
  const modal = $('genImgResultModal');
  const titleEl = $('genImgResultTitle');
  const pill = $('genImgResultModelPill');
  const pic = $('genImgResultPic');
  const vidPlayer = $('genVidResultPlayer');
  const cmpWrap = $('resCompareWrap');
  const vThumbs = $('resVideoThumbs');
  const promptWrap = $('resExportPromptWrap');
  const promptLbl = $('resExportPromptLbl');
  const promptBox = $('resExportPromptBox');
  const dlBtn = $('genImgDownloadBtn');
  const upRow = $('genImgUpscaleRow');
  if (!modal) return;

  const isVideo = mediaType === 'video';
  if (titleEl) {
    titleEl.textContent = isVideo ? 'Exported Video' : 'Exported Image';
    titleEl.classList.remove('is-upscale');
  }
  if (pill) {
    pill.textContent = label;
    pill.hidden = !label;
  }

  if (cmpWrap) cmpWrap.hidden = true;
  if (vThumbs) { vThumbs.hidden = true; vThumbs.innerHTML = ''; }
  if (upRow) upRow.hidden = true;

  if (isVideo && vidPlayer) {
    if (pic) pic.hidden = true;
    vidPlayer.src = blobUrl || dataUrl;
    vidPlayer.hidden = false;
  } else if (pic) {
    if (vidPlayer) { vidPlayer.pause?.(); vidPlayer.hidden = true; }
    pic.src = dataUrl || thumbUrl;
    pic.hidden = false;
  }

  if (promptWrap && promptBox) {
    promptWrap.hidden = !promptText;
    if (promptLbl) promptLbl.textContent = isVideo ? 'Video Prompt' : 'Image Prompt';
    promptBox.value = promptText || '';
  }

  if (dlBtn) {
    dlBtn.textContent = isVideo ? '⬇ Download Video' : '⬇ Download Image';
    dlBtn.href = blobUrl || dataUrl || thumbUrl;
    dlBtn.download = fileName || (isVideo ? `visionpilot-3d-${Date.now()}.webm` : `visionpilot-3d-frame-${Date.now()}.png`);
  }

  if (width && height) {
    reshapeResultWindowForAspect(width, height);
  } else {
    reshapeResultWindowFromDataUrl(thumbUrl || dataUrl);
  }
  modal.hidden = false;
}
window.openExportedMediaModal = openExportedMediaModal;

$('resExportPromptCopyBtn')?.addEventListener('click', () => {
  const box = $('resExportPromptBox');
  if (box && box.value) copyText(box.value, box);
});

function closeGeneratedImageResultModal() {
  const modal = $('genImgResultModal');
  const vidPlayer = $('genVidResultPlayer');
  if (vidPlayer) {
    try { vidPlayer.pause(); } catch (_) {}
  }
  // If an upscale was started from the Result/Download window (or is running), closing the window immediately stops it
  if (imgUpscaleRunning) {
    imgUpscaleAbort = true;
  }
  hooks.cancelVideoUpscale?.();
  if (modal) modal.hidden = true;
}

$('genImgResultCloseBtn')?.addEventListener('click', closeGeneratedImageResultModal);
$('genImgResultModal')?.addEventListener('click', (e) => {
  if (e.target === $('genImgResultModal')) closeGeneratedImageResultModal();
});

// PART 2.2: Keep background prompt always up to date with every settings change and live input value
function ensureBackgroundImagePrompt() {
  try {
    if ($('subjDesc')) S.subjDesc = $('subjDesc').value;
    if ($('extra')) S.extra = $('extra').value;
    if ($('bgCustom') && !$('bgCustom').hidden) S.bgCustom = $('bgCustom').value;
    if ($('aspectCustom') && !$('aspectCustom').hidden) S.aspectCustom = $('aspectCustom').value;
    if ($('lightCustom') && !$('lightCustom').hidden) S.lightCustom = $('lightCustom').value;
    if ($('focusDesc') && S.focus.mode !== 'multi') S.focus.desc = $('focusDesc').value;

    const freshPrompt = buildImagePrompt();
    bgImagePromptObj = freshPrompt;
    lastObj = freshPrompt;
    lastKind = 'image';
    if ($('json')) $('json').innerHTML = hl(JSON.stringify(lastObj, null, 2));
    if ($('status')) {
      $('status').textContent = 'Up to date';
      $('status').classList.remove('stale');
    }
    if ($('promptKind')) $('promptKind').textContent = promptLabel();
    fitPrompt();
  } catch (e) {
    console.warn('[VP] ensureBackgroundImagePrompt error:', e);
  }
  return lastObj || bgImagePromptObj;
}

function openGenImgModelBar() {
  const bar = $('genImgModelBar');
  const pre = $('json');
  if (!bar) return;
  if (pre && !pre.hidden) {
    fitPrompt();
    const h = pre.style.height || ((pre.offsetHeight || 180) + 'px');
    bar.style.height = h;
    pre.hidden = true;
  }
  bar.hidden = false;
  fitPrompt();
}

function closeGenImgModelBar() {
  const bar = $('genImgModelBar');
  const pre = $('json');
  if (bar) bar.hidden = true;
  if (pre) pre.hidden = false;
  fitPrompt();
}

$('genImgBtn')?.addEventListener('click', () => {
  const bar = $('genImgModelBar');
  if (!bar) return;
  if ($('genImgBtn').classList.contains('busy')) return;
  // Always rebuild the current up-to-date background prompt when clicking Generate Image
  ensureBackgroundImagePrompt();
  if (bar.hidden) {
    openGenImgModelBar();
  } else {
    closeGenImgModelBar();
  }
});

$('genImgModelClose')?.addEventListener('click', () => {
  closeGenImgModelBar();
});

let imgGenBusy = false;
let focusDetailLoading = false;

function isFocusSectionLocked() {
  // Only lock the entire Focus box while an actual Image Generation / Upscale is actively running.
  // Never lock the Focus toggle (#focusOn / #focusOnWrap) during detection or prompt generation!
  return Boolean(imgGenBusy);
}

function syncFocusLockState() {
  const pFocus = $('pFocus');
  if (!pFocus) return;
  const locked = isFocusSectionLocked();
  pFocus.classList.toggle('gen-locked', locked);
  try { pFocus.inert = locked; } catch (e) {}
  if (locked) {
    pFocus.setAttribute('aria-disabled', 'true');
    pFocus.setAttribute('aria-busy', 'true');
  } else {
    pFocus.removeAttribute('aria-disabled');
    pFocus.removeAttribute('aria-busy');
  }
  const tg = pFocus.closest('.tgroup');
  if (tg) tg.classList.toggle('gen-locked-group', locked && tg.contains(pFocus));
}
window.syncFocusLockState = syncFocusLockState;

function setFocusDetailLoading(loading) {
  focusDetailLoading = !!loading;
  const pFocus = $('pFocus');
  if (pFocus) {
    pFocus.classList.toggle('focus-loading', focusDetailLoading);
    const dimEl = pFocus.querySelector(':scope > .cbody > .dim');
    if (dimEl) {
      try { dimEl.inert = focusDetailLoading; } catch (e) {}
      if (focusDetailLoading) {
        dimEl.setAttribute('aria-disabled', 'true');
        dimEl.setAttribute('aria-busy', 'true');
      } else {
        dimEl.removeAttribute('aria-disabled');
        dimEl.removeAttribute('aria-busy');
      }
    }
  }
  syncFocusLockState();
  renderLiveAIStatus();
}
window.setFocusDetailLoading = setFocusDetailLoading;

function setImageGenBoxesLocked(locked) {
  imgGenBusy = !!locked;
  document.body.classList.toggle('img-gen-busy', imgGenBusy);
  const pRef = $('pRef');
  if (pRef) {
    pRef.classList.toggle('gen-locked', imgGenBusy);
    try { pRef.inert = imgGenBusy; } catch (e) {}
    if (imgGenBusy) {
      pRef.setAttribute('aria-disabled', 'true');
      pRef.setAttribute('aria-busy', 'true');
    } else {
      pRef.removeAttribute('aria-disabled');
      pRef.removeAttribute('aria-busy');
    }
    const tg = pRef.closest('.tgroup');
    if (tg) tg.classList.toggle('gen-locked-group', imgGenBusy && tg.contains(pRef));
  }
  syncFocusLockState();
}
window.setImageGenBoxesLocked = setImageGenBoxesLocked;

// Block any interaction inside Reference (#pRef) while generating/upscaling an image,
// or inside Image Detection & Focus (#pFocus) while an image is generating, upscaling, or being processed by AI
['pointerdown', 'mousedown', 'click', 'dblclick', 'input', 'change', 'keydown', 'dragstart', 'drop'].forEach((evType) => {
  document.addEventListener(evType, (e) => {
    const t = e.target;
    if (!t || typeof t.closest !== 'function') return;
    if (imgGenBusy && t.closest('#pRef, .tab[data-pid="pRef"]')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    if (isFocusSectionLocked() && t.closest('#pFocus, .tab[data-pid="pFocus"]')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return;
    }
    if (focusDetailLoading && t.closest('#pFocus > .cbody > .dim')) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  }, true);
});

async function runGenerateImageWithModel(imgModelId) {
  const btn = $('genImgBtn');
  if (!btn || btn.classList.contains('busy')) return;

  const mainRef = refs[S.focus.img] || refs[0];
  if (!mainRef || !mainRef.img) {
    toast('Upload a reference image first before generating an image.');
    return;
  }
  try {
    if (mainRef.ready) await mainRef.ready;
  } catch (e) {}
  if (!mainRef.img.naturalWidth || !mainRef.img.naturalHeight) {
    toast('Reference image is still loading. Please try again in a moment.');
    return;
  }

  const extConn = window.VPAIBridge?.isExtensionConnected ? window.VPAIBridge.isExtensionConnected() : false;
  if (!extConn) {
    openAIExtModal(imgModelId);
    toast('Chrome Extension not connected. Install & load the extension to generate images.');
    return;
  }

  const imgModelInfo = window.VPAIBridge?.getImageModelInfo
    ? window.VPAIBridge.getImageModelInfo(imgModelId)
    : { fullName: imgModelId };

  // PART 2.2: Always build the current, up-to-date background prompt directly from live settings
  const promptObj = ensureBackgroundImagePrompt();
  closeGenImgModelBar();

  btn.classList.add('busy');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  setImageGenBoxesLocked(true);
  if ($('status')) $('status').textContent = `Generating image via ${imgModelInfo.name || imgModelId}…`;
  setDescLoading(true, `Generating image with ${imgModelInfo.fullName} in a fresh chat…`);

  try {
    const res = await window.VPAIBridge.runImageGenerationStep(mainRef, promptObj, imgModelId);
    lastAIError = '';
    aiConnectedOk = true;
    if ($('status')) {
      $('status').textContent = 'Image generated';
      $('status').classList.remove('stale');
    }

    await saveHistoryEntry({
      kind: 'generated_image',
      mainImageDataUrl: res.mainImageDataUrl,
      generatedImageDataUrl: res.imageDataUrl,
      leftLabel: 'Main Image',
      rightLabel: 'Generated Image',
      promptText: res.promptText,
      modelName: res.modelName,
      aspectRatio: res.aspectRatio,
      createdAt: res.createdAt || Date.now()
    });

    openGeneratedImageResultModal(res.imageDataUrl, `${res.modelName} · ${res.aspectRatio}`, {
      mainImageDataUrl: res.mainImageDataUrl,
      promptText: res.promptText,
      aspectRatio: res.aspectRatio
    });
    toast(`Generated image ready from ${res.modelName}`);
  } catch (err) {
    if (!err?.cancelled) {
      const errMsg = err?.message || String(err);
      lastAIError = errMsg;
      if ($('status')) $('status').textContent = 'Image generation failed';
      toast(`Image Generation Error: ${errMsg}`);
    }
  } finally {
    btn.classList.remove('busy');
    btn.disabled = false;
    btn.innerHTML = GEN_IMG_LABEL;
    setImageGenBoxesLocked(false);
    setDescLoading(false);
    renderLiveAIStatus();
  }
}

document.querySelectorAll('.gen-img-model-opt[data-img-model]').forEach((optBtn) => {
  optBtn.addEventListener('click', () => {
    const modelId = optBtn.dataset.imgModel;
    if (modelId) runGenerateImageWithModel(modelId);
  });
});

/* ---------- PART 3 & PART 4.4: IN-BROWSER IMAGE UPSCALER (IMAGE MODE ONLY, Real-ESRGAN ONNX Runtime Web) ---------- */
const IMG_UPSCALER_MODEL_PATH = 'models/realesr-general-x4v3.onnx';
let imgUpscalerSession = null;
let imgUpscalerSessionPromise = null;
let imgUpscaleAbort = false;
let imgUpscaleRunning = false;

async function ensureLocalOrtRuntime() {
  if (window.ort && window.ort.InferenceSession) return window.ort;
  const loadScript = (relPath) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = new URL(relPath, document.baseURI).href;
    s.async = true;
    s.onload = () => res();
    s.onerror = () => { s.remove(); rej(new Error('Could not load ' + relPath)); };
    document.head.appendChild(s);
  });
  try {
    await loadScript('models/ort.min.js');
  } catch (e) {
    await loadScript('models/ort.webgpu.min.js');
  }
  if (!window.ort || !window.ort.InferenceSession) {
    throw new Error('Local ONNX Runtime Web engine (models/ort.min.js) is missing.');
  }
  return window.ort;
}

async function getOrCreateImageUpscalerSession() {
  if (imgUpscalerSession) return imgUpscalerSession;
  if (imgUpscalerSessionPromise) return imgUpscalerSessionPromise;

  imgUpscalerSessionPromise = (async () => {
    const ort = await ensureLocalOrtRuntime();
    try {
      ort.env.wasm.wasmPaths = new URL('models/', document.baseURI).href;
      ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
    } catch (_) {}

    const modelUrl = new URL(IMG_UPSCALER_MODEL_PATH, document.baseURI).href;
    let modelRes;
    try {
      modelRes = await fetch(modelUrl, { cache: 'default' });
    } catch (e) {
      throw new Error('The upscaler engine file is missing (models/realesr-general-x4v3.onnx).');
    }
    if (!modelRes || !modelRes.ok) {
      throw new Error('The upscaler engine file is missing (models/realesr-general-x4v3.onnx).');
    }
    const cType = (modelRes.headers.get('content-type') || '').toLowerCase();
    if (cType.includes('text/html')) {
      throw new Error('The upscaler engine file is missing (models/realesr-general-x4v3.onnx).');
    }
    const modelBuf = await modelRes.arrayBuffer();
    if (!modelBuf || modelBuf.byteLength < 1024) {
      throw new Error('The upscaler engine file is missing (models/realesr-general-x4v3.onnx).');
    }

    // Use WASM execution provider for reliable dynamic-shape inference across all browsers and GitHub Pages
    const session = await ort.InferenceSession.create(modelBuf, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all'
    });
    imgUpscalerSession = session;
    return session;
  })();

  try {
    return await imgUpscalerSessionPromise;
  } catch (err) {
    imgUpscalerSessionPromise = null;
    throw err;
  }
}

// Run tiled 4x Real-ESRGAN inference with overlap & feather blending, then scale down to half for 2x
async function runRealEsrganImageUpscale(sourceImgOrCanvas, scaleFactor, onProgress, checkCancelled) {
  const session = await getOrCreateImageUpscalerSession();
  if (checkCancelled && checkCancelled()) throw Object.assign(new Error('Upscale cancelled.'), { cancelled: true });

  const srcW = sourceImgOrCanvas.naturalWidth || sourceImgOrCanvas.width;
  const srcH = sourceImgOrCanvas.naturalHeight || sourceImgOrCanvas.height;
  if (!srcW || !srcH) throw new Error('Source image has invalid dimensions.');

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcW;
  srcCanvas.height = srcH;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true });
  srcCtx.drawImage(sourceImgOrCanvas, 0, 0, srcW, srcH);
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH).data;

  const modelScale = 4;
  const out4xW = srcW * modelScale;
  const out4xH = srcH * modelScale;

  const accumR = new Float32Array(out4xW * out4xH);
  const accumG = new Float32Array(out4xW * out4xH);
  const accumB = new Float32Array(out4xW * out4xH);
  const accumW = new Float32Array(out4xW * out4xH);

  const tileSize = 192;
  const overlap = 16;
  const stride = tileSize - overlap * 2;

  const xSteps = [];
  for (let x = 0; x < srcW; x += stride) {
    const xPos = Math.min(x, Math.max(0, srcW - tileSize));
    if (!xSteps.includes(xPos)) xSteps.push(xPos);
    if (x + tileSize >= srcW) break;
  }
  const ySteps = [];
  for (let y = 0; y < srcH; y += stride) {
    const yPos = Math.min(y, Math.max(0, srcH - tileSize));
    if (!ySteps.includes(yPos)) ySteps.push(yPos);
    if (y + tileSize >= srcH) break;
  }

  const totalTiles = Math.max(1, xSteps.length * ySteps.length);
  let doneTiles = 0;

  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];

  for (let yi = 0; yi < ySteps.length; yi++) {
    for (let xi = 0; xi < xSteps.length; xi++) {
      if (checkCancelled && checkCancelled()) {
        throw Object.assign(new Error('Upscale cancelled.'), { cancelled: true });
      }
      const x0 = xSteps[xi];
      const y0 = ySteps[yi];
      const tw = Math.min(tileSize, srcW - x0);
      const th = Math.min(tileSize, srcH - y0);

      const tensorData = new Float32Array(3 * th * tw);
      const planeSize = th * tw;
      for (let ty = 0; ty < th; ty++) {
        const sy = y0 + ty;
        for (let tx = 0; tx < tw; tx++) {
          const sx = x0 + tx;
          const sIdx = (sy * srcW + sx) * 4;
          const pIdx = ty * tw + tx;
          tensorData[pIdx] = srcData[sIdx] / 255.0;
          tensorData[planeSize + pIdx] = srcData[sIdx + 1] / 255.0;
          tensorData[planeSize * 2 + pIdx] = srcData[sIdx + 2] / 255.0;
        }
      }

      const inputTensor = new window.ort.Tensor('float32', tensorData, [1, 3, th, tw]);
      const feeds = { [inputName]: inputTensor };
      const results = await session.run(feeds);
      const outTensor = results[outputName];
      const outArr = outTensor.data;
      const outTW = tw * modelScale;
      const outTH = th * modelScale;
      const outPlane = outTH * outTW;
      const feather = overlap * modelScale;

      for (let oy = 0; oy < outTH; oy++) {
        const gy = y0 * modelScale + oy;
        if (gy >= out4xH) continue;
        let wy = 1.0;
        if (y0 > 0 && oy < feather) wy = (oy + 1) / (feather + 1);
        else if (y0 + th < srcH && oy >= outTH - feather) wy = (outTH - oy) / (feather + 1);

        for (let ox = 0; ox < outTW; ox++) {
          const gx = x0 * modelScale + ox;
          if (gx >= out4xW) continue;
          let wx = 1.0;
          if (x0 > 0 && ox < feather) wx = (ox + 1) / (feather + 1);
          else if (x0 + tw < srcW && ox >= outTW - feather) wx = (outTW - ox) / (feather + 1);

          const w = wx * wy;
          const pIdx = oy * outTW + ox;
          const gIdx = gy * out4xW + gx;
          accumR[gIdx] += clamp(outArr[pIdx], 0, 1) * 255.0 * w;
          accumG[gIdx] += clamp(outArr[outPlane + pIdx], 0, 1) * 255.0 * w;
          accumB[gIdx] += clamp(outArr[outPlane * 2 + pIdx], 0, 1) * 255.0 * w;
          accumW[gIdx] += w;
        }
      }

      doneTiles++;
      if (onProgress) onProgress(Math.round((doneTiles / totalTiles) * 100));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  const canvas4x = document.createElement('canvas');
  canvas4x.width = out4xW;
  canvas4x.height = out4xH;
  const ctx4x = canvas4x.getContext('2d');
  const outImgData = ctx4x.createImageData(out4xW, out4xH);
  const dst = outImgData.data;

  for (let y = 0; y < out4xH; y++) {
    const sy = Math.min(srcH - 1, Math.floor(y / modelScale));
    for (let x = 0; x < out4xW; x++) {
      const sx = Math.min(srcW - 1, Math.floor(x / modelScale));
      const gIdx = y * out4xW + x;
      const w = accumW[gIdx] || 1;
      const dIdx = gIdx * 4;
      dst[dIdx] = Math.round(clamp(accumR[gIdx] / w, 0, 255));
      dst[dIdx + 1] = Math.round(clamp(accumG[gIdx] / w, 0, 255));
      dst[dIdx + 2] = Math.round(clamp(accumB[gIdx] / w, 0, 255));
      dst[dIdx + 3] = srcData[(sy * srcW + sx) * 4 + 3];
    }
  }
  ctx4x.putImageData(outImgData, 0, 0);

  // The model gives 4x output directly. The 2x result is the 4x output scaled down to half.
  if (scaleFactor === 2) {
    const out2xW = srcW * 2;
    const out2xH = srcH * 2;
    const canvas2x = document.createElement('canvas');
    canvas2x.width = out2xW;
    canvas2x.height = out2xH;
    const ctx2x = canvas2x.getContext('2d');
    ctx2x.imageSmoothingEnabled = true;
    ctx2x.imageSmoothingQuality = 'high';
    ctx2x.drawImage(canvas4x, 0, 0, out2xW, out2xH);
    return {
      dataUrl: canvas2x.toDataURL('image/png'),
      width: out2xW,
      height: out2xH
    };
  }

  return {
    dataUrl: canvas4x.toDataURL('image/png'),
    width: out4xW,
    height: out4xH
  };
}

function fitUpscaleDropMedia(dropEl, mediaEl, nw, nh) {
  if (!dropEl || !mediaEl) return;
  const w = nw || mediaEl.naturalWidth || mediaEl.width || 0;
  const h = nh || mediaEl.naturalHeight || mediaEl.height || 0;
  if (!w || !h) {
    if (mediaEl.hasAttribute('data-fit')) mediaEl.removeAttribute('data-fit');
    return;
  }
  const bw = dropEl.clientWidth || 290;
  const bh = dropEl.clientHeight || 112;
  const wantFit = (w / h) >= (bw / bh) - 1e-4 ? 'width' : 'height';
  if (mediaEl.dataset.fit !== wantFit) mediaEl.dataset.fit = wantFit;
}
window.fitUpscaleDropMedia = fitUpscaleDropMedia;

let batchFolderState = null; // { folderName, files: File[], dirHandle, localFolderPath }
let lastCompletedBatch = null; // { folderName, outFolderName, scaleFactor, outDirHandle, savedFolderPath, items }

function isSupportedBatchImageFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : (fileOrName?.name || '');
  const type = typeof fileOrName === 'object' && fileOrName ? (fileOrName.type || '') : '';
  if (type && type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|bmp|gif|avif)$/i.test(name);
}

function syncImageUpscalerUI() {
  const drop = $('imgUpscaleDrop');
  const thumb = $('imgUpscaleThumb');
  const folderPrev = $('imgUpscaleFolderPreview');
  const folderNameEl = $('imgUpscaleFolderName');
  const empty = $('imgUpscaleEmpty');
  const meta = $('imgUpscaleMeta');
  const batchBtn = $('imgBatchUpscaleBtn');
  if (!thumb || !empty) return;

  syncScaleButtonsLockState();

  if (batchFolderState && batchFolderState.folderName) {
    thumb.hidden = true;
    empty.hidden = true;
    if (meta) meta.hidden = true;
    if (folderPrev) folderPrev.hidden = false;
    if (folderNameEl) {
      folderNameEl.textContent = batchFolderState.folderName;
      folderNameEl.title = `${batchFolderState.folderName} (${batchFolderState.files?.length || 0} images)`;
    }
    batchBtn?.classList.add('has-folder');
    return;
  }

  if (folderPrev) folderPrev.hidden = true;
  batchBtn?.classList.remove('has-folder');

  const ref = refs[S.focus?.img] || refs[0];
  if (ref && ref.src) {
    if (thumb.getAttribute('src') !== ref.src) thumb.src = ref.src;
    thumb.hidden = false;
    empty.hidden = true;
    const w = ref.img?.naturalWidth || 0;
    const h = ref.img?.naturalHeight || 0;
    fitUpscaleDropMedia(drop, thumb, w, h);
    if (meta) {
      meta.textContent = w && h ? `${w}×${h} px` : ref.name || 'Reference Image';
      meta.hidden = false;
    }
  } else {
    thumb.hidden = true;
    empty.hidden = false;
    if (meta) meta.hidden = true;
  }
}
window.syncImageUpscalerUI = syncImageUpscalerUI;
$('imgUpscaleThumb')?.addEventListener('load', () => {
  fitUpscaleDropMedia($('imgUpscaleDrop'), $('imgUpscaleThumb'));
});

// Wire Image Upscaler box dropzone & file input (stays connected with Reference box)
$('imgUpscaleDrop')?.addEventListener('click', () => {
  if (imgUpscaleRunning) return;
  $('imgUpscaleFile')?.click();
});
$('imgUpscaleFile')?.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length) {
    batchFolderState = null;
    addFiles(e.target.files);
    if (refs.length) {
      S.focus.img = refs.length - 1;
      syncImageUpscalerUI();
    }
    e.target.value = '';
  }
});
['dragenter', 'dragover'].forEach((ev) => {
  $('imgUpscaleDrop')?.addEventListener(ev, (e) => {
    if (imgUpscaleRunning) return;
    e.preventDefault();
    e.stopPropagation();
    $('imgUpscaleDrop').classList.add('over');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  $('imgUpscaleDrop')?.addEventListener(ev, (e) => {
    if (imgUpscaleRunning) return;
    e.preventDefault();
    e.stopPropagation();
    $('imgUpscaleDrop').classList.remove('over');
    if (ev === 'drop' && e.dataTransfer?.files?.length) {
      batchFolderState = null;
      addFiles(e.dataTransfer.files);
      if (refs.length) {
        S.focus.img = refs.length - 1;
        syncImageUpscalerUI();
      }
    }
  });
});

// Wire "Batch Upscaling" button & folder selection
async function selectBatchFolderFromDirectoryHandle(dirHandle) {
  if (!dirHandle) return;
  const imgFiles = [];
  for await (const [entryName, entryHandle] of dirHandle.entries()) {
    if (entryHandle.kind === 'file' && isSupportedBatchImageFile(entryName)) {
      try {
        const f = await entryHandle.getFile();
        imgFiles.push(f);
      } catch (_) {}
    }
  }
  imgFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  batchFolderState = {
    folderName: dirHandle.name || 'Selected_Folder',
    files: imgFiles,
    dirHandle,
    localFolderPath: ''
  };
  const errBox = $('imgUpscaleError');
  if (errBox) { errBox.hidden = true; errBox.textContent = ''; }
  syncImageUpscalerUI();
  toast(`Selected folder "${batchFolderState.folderName}" (${imgFiles.length} image${imgFiles.length === 1 ? '' : 's'})`);
}

function selectBatchFolderFromFileList(fileList, explicitFolderName = '', localFolderPath = '') {
  const allFiles = Array.from(fileList || []);
  let folderName = explicitFolderName || '';
  if (!folderName && allFiles.length) {
    const rel = allFiles[0].webkitRelativePath || '';
    if (rel && /[\\/]/.test(rel)) {
      folderName = rel.split(/[\\/]/)[0];
    }
  }
  if (!folderName) folderName = 'Selected_Folder';

  // Keep images inside the selected folder
  const imgFiles = allFiles.filter(f => isSupportedBatchImageFile(f));
  imgFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  batchFolderState = {
    folderName,
    files: imgFiles,
    dirHandle: null,
    localFolderPath: localFolderPath || ''
  };
  const errBox = $('imgUpscaleError');
  if (errBox) { errBox.hidden = true; errBox.textContent = ''; }
  syncImageUpscalerUI();
  toast(`Selected folder "${folderName}" (${imgFiles.length} image${imgFiles.length === 1 ? '' : 's'})`);
}
window.selectBatchFolderFromFileList = selectBatchFolderFromFileList;

$('imgBatchUpscaleBtn')?.addEventListener('click', async () => {
  if (imgUpscaleRunning) return;
  const errBox = $('imgUpscaleError');
  if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

  if (typeof window.showDirectoryPicker === 'function' && !window.__VP_USE_INPUT_FOLDER_PICKER) {
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await selectBatchFolderFromDirectoryHandle(dirHandle);
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const folderInput = $('imgBatchFolderInput');
  if (folderInput) {
    folderInput.value = '';
    folderInput.click();
  }
});

$('imgBatchFolderInput')?.addEventListener('change', (e) => {
  const files = e.target.files;
  if (!files || !files.length) return;
  const explicitName = e.target.dataset?.folderName || '';
  const localPath = e.target.dataset?.localFolderPath || '';
  selectBatchFolderFromFileList(files, explicitName, localPath);
});

function loadFileAsImageElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try { URL.revokeObjectURL(url); } catch (_) {}
      resolve(img);
    };
    img.onerror = () => {
      try { URL.revokeObjectURL(url); } catch (_) {}
      reject(new Error(`Could not decode image: ${file?.name || 'image'}`));
    };
    img.src = url;
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return await res.blob();
}

function openBatchUpscaleDoneModal(batchInfo) {
  const modal = $('batchUpscaleDoneModal');
  if (!modal) return;
  const msgEl = $('batchUpscaleDoneMsg');
  const pillEl = $('batchUpscaleDonePill');
  const tagEl = $('batchUpscaleDoneFolderTag');
  const viewBox = $('batchUpscaleDoneFolderView');
  const pathEl = $('batchUpscaleDoneFolderPath');
  const countEl = $('batchUpscaleDoneFolderCount');
  const gridEl = $('batchUpscaleDoneGrid');

  if (msgEl) {
    msgEl.textContent = 'Batch Upscale Completed. The files have been saved to your device.';
  }
  const items = batchInfo?.items || [];
  if (pillEl) {
    pillEl.textContent = `${batchInfo?.scaleFactor || 2}x · ${items.length} file${items.length === 1 ? '' : 's'}`;
  }
  if (tagEl) {
    tagEl.textContent = `📁 ${batchInfo?.outFolderName || ''}`;
  }
  if (pathEl) {
    pathEl.textContent = batchInfo?.savedFolderPath || batchInfo?.outFolderName || '';
  }
  if (countEl) {
    countEl.textContent = `${items.length} saved`;
  }
  if (gridEl) {
    gridEl.innerHTML = items.map((it, idx) => `
      <a class="batch-done-item" href="${escAttr(it.dataUrl)}" download="${escAttr(it.name)}" data-batch-idx="${idx}" title="${escAttr(it.name + ' (' + it.width + '×' + it.height + ')')}">
        <img src="${escAttr(it.dataUrl)}" alt="${escAttr(it.name)}">
        <span>${esc(it.name)}</span>
      </a>
    `).join('');
  }
  if (viewBox) {
    viewBox.hidden = true;
  }
  modal.hidden = false;
}

function closeBatchUpscaleDoneModal() {
  const modal = $('batchUpscaleDoneModal');
  if (modal) modal.hidden = true;
}

$('batchUpscaleOkBtn')?.addEventListener('click', closeBatchUpscaleDoneModal);
$('batchUpscaleDoneCloseX')?.addEventListener('click', closeBatchUpscaleDoneModal);
$('batchUpscaleDoneModal')?.addEventListener('click', (e) => {
  if (e.target === $('batchUpscaleDoneModal')) closeBatchUpscaleDoneModal();
});

$('batchUpscaleOpenFileBtn')?.addEventListener('click', async () => {
  const viewBox = $('batchUpscaleDoneFolderView');
  if (viewBox) viewBox.hidden = false;

  if (!lastCompletedBatch) return;

  // 1. Try local server helper endpoint to open the created folder directly in OS Explorer if available
  let openedNativeFolder = false;
  try {
    const resp = await fetch('/__vp_open_folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderPath: lastCompletedBatch.savedFolderPath || '',
        outFolderName: lastCompletedBatch.outFolderName || ''
      })
    });
    if (resp && resp.ok) {
      const data = await resp.json().catch(() => null);
      if (data && data.ok) openedNativeFolder = true;
    }
  } catch (_) {}

  // 2. If File System Access API directory handle is present, open native file explorer inside the newly created folder
  if (!openedNativeFolder && lastCompletedBatch.outDirHandle && typeof window.showOpenFilePicker === 'function') {
    try {
      await window.showOpenFilePicker({
        startIn: lastCompletedBatch.outDirHandle,
        multiple: true
      });
      openedNativeFolder = true;
    } catch (_) {}
  }

  toast(`Opened folder: ${lastCompletedBatch.outFolderName}`);
});

async function runBatchFolderUpscale(scaleFactor) {
  if (imgUpscaleRunning || !batchFolderState) return;
  if (scaleFactor === 4 && S.mode !== 'adv' && !PRO) {
    toast('4x Upscale requires Advanced mode or subscription.');
    return;
  }

  const errBox = $('imgUpscaleError');
  const loadBox = $('imgUpscaleLoading');
  const loadLbl = $('imgUpscaleLoadingLbl');
  const progBar = $('imgUpscaleProgBar');
  const card = $('pImgUpscale');

  if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

  const files = batchFolderState.files || [];
  if (!files.length) {
    const msg = 'No image files found in the selected folder.';
    if (errBox) { errBox.textContent = msg; errBox.hidden = false; }
    toast(msg);
    return;
  }

  const folderName = batchFolderState.folderName || 'Selected_Folder';
  const outFolderName = `${folderName}_UpScaled_${scaleFactor}x`;

  imgUpscaleRunning = true;
  imgUpscaleAbort = false;
  card?.classList.add('upscale-busy');
  setImageGenBoxesLocked(true);

  if (loadBox) loadBox.hidden = false;
  if (loadLbl) loadLbl.textContent = `Batch ${scaleFactor}x (0/${files.length})… 0%`;
  if (progBar) progBar.style.width = '0%';

  let outDirHandle = null;
  if (batchFolderState.dirHandle) {
    try {
      if (typeof batchFolderState.dirHandle.requestPermission === 'function') {
        await batchFolderState.dirHandle.requestPermission({ mode: 'readwrite' });
      }
      outDirHandle = await batchFolderState.dirHandle.getDirectoryHandle(outFolderName, { create: true });
    } catch (e) {
      console.warn('Could not create output folder handle via File System Access API:', e);
    }
  }

  const savedItems = [];
  let savedFolderPath = '';
  const usedNames = new Set();

  try {
    for (let i = 0; i < files.length; i++) {
      if (imgUpscaleAbort) {
        const cancelErr = new Error('Batch upscale cancelled');
        cancelErr.cancelled = true;
        throw cancelErr;
      }

      const fileObj = files[i];
      const imgEl = await loadFileAsImageElement(fileObj);

      const res = await runRealEsrganImageUpscale(
        imgEl,
        scaleFactor,
        (tilePct) => {
          const overallPct = Math.round(((i + (tilePct / 100)) / files.length) * 100);
          if (loadLbl) loadLbl.textContent = `Batch ${scaleFactor}x (${i + 1}/${files.length}): ${fileObj.name}… ${overallPct}%`;
          if (progBar) progBar.style.width = `${overallPct}%`;
        },
        () => imgUpscaleAbort
      );

      if (!res || !res.dataUrl) {
        throw new Error(`Upscaler returned an empty result for ${fileObj.name}.`);
      }

      const baseStem = (fileObj.name || `image_${i + 1}`).replace(/\.[^.]+$/, '');
      let outFileName = `${baseStem}.png`;
      let dup = 2;
      while (usedNames.has(outFileName.toLowerCase())) {
        outFileName = `${baseStem}_${dup++}.png`;
      }
      usedNames.add(outFileName.toLowerCase());

      let wroteToDisk = false;

      // Save via File System Access API into [Original_Folder_Name]_UpScaled_2x / 4x
      if (outDirHandle) {
        try {
          const blob = await dataUrlToBlob(res.dataUrl);
          const fh = await outDirHandle.getFileHandle(outFileName, { create: true });
          const writable = await fh.createWritable();
          await writable.write(blob);
          await writable.close();
          wroteToDisk = true;
        } catch (wErr) {
          console.warn('Failed writing file to directory handle:', wErr);
        }
      }

      // Save via local companion endpoint if running on local server / desktop test
      try {
        const srvResp = await fetch('/__vp_batch_save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folderName,
            outFolderName,
            localFolderPath: batchFolderState.localFolderPath || '',
            fileName: outFileName,
            dataUrl: res.dataUrl
          })
        });
        if (srvResp && srvResp.ok) {
          const srvJson = await srvResp.json().catch(() => null);
          if (srvJson && srvJson.ok) {
            wroteToDisk = true;
            if (srvJson.savedFolderPath) savedFolderPath = srvJson.savedFolderPath;
          }
        }
      } catch (_) {}

      // Fallback browser download if neither FileSystemAccess API nor local companion wrote it
      if (!wroteToDisk) {
        const a = document.createElement('a');
        a.href = res.dataUrl;
        a.download = `${outFolderName}_${outFileName}`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 250);
      }

      savedItems.push({
        name: outFileName,
        origName: fileObj.name,
        dataUrl: res.dataUrl,
        width: res.width,
        height: res.height
      });
    }

    lastCompletedBatch = {
      folderName,
      outFolderName,
      scaleFactor,
      outDirHandle,
      savedFolderPath: savedFolderPath || outFolderName,
      items: savedItems
    };
    window.__lastCompletedBatch = lastCompletedBatch;

    openBatchUpscaleDoneModal(lastCompletedBatch);
    toast(`Batch Upscale (${scaleFactor}x) completed: ${savedItems.length} files saved to ${outFolderName}`);
  } catch (err) {
    if (!err?.cancelled) {
      const msg = err?.message || String(err);
      if (errBox) {
        errBox.textContent = msg;
        errBox.hidden = false;
      }
      toast(msg);
    } else {
      toast('Batch upscale cancelled');
    }
  } finally {
    imgUpscaleRunning = false;
    imgUpscaleAbort = false;
    card?.classList.remove('upscale-busy');
    if (loadBox) loadBox.hidden = true;
    setImageGenBoxesLocked(false);
    syncImageUpscalerUI();
  }
}

async function startImageBoxUpscale(scaleFactor) {
  if (imgUpscaleRunning) return;
  if (batchFolderState && batchFolderState.folderName) {
    return await runBatchFolderUpscale(scaleFactor);
  }
  if (scaleFactor === 4 && S.mode !== 'adv' && !PRO) {
    toast('4x Upscale requires Advanced mode or subscription.');
    return;
  }

  const ref = refs[S.focus?.img] || refs[0];
  const errBox = $('imgUpscaleError');
  const loadBox = $('imgUpscaleLoading');
  const loadLbl = $('imgUpscaleLoadingLbl');
  const progBar = $('imgUpscaleProgBar');
  const card = $('pImgUpscale');
  const activeScaleBtn = scaleFactor === 4 ? $('imgUpscale4xBtn') : $('imgUpscale2xBtn');
  const origScaleBtnHtml = activeScaleBtn ? activeScaleBtn.innerHTML : `${scaleFactor}x`;

  if (errBox) { errBox.hidden = true; errBox.textContent = ''; }

  if (!ref || !ref.img) {
    const msg = 'Upload or drop an image first before upscaling.';
    if (errBox) { errBox.textContent = msg; errBox.hidden = false; }
    toast(msg);
    return;
  }

  try {
    if (ref.ready) await ref.ready;
  } catch (_) {}

  imgUpscaleRunning = true;
  imgUpscaleAbort = false;
  card?.classList.add('upscale-busy');
  if (activeScaleBtn) {
    activeScaleBtn.classList.add('busy');
    activeScaleBtn.innerHTML = `<span class="spin"></span> ${scaleFactor}x`;
  }
  setImageGenBoxesLocked(true);

  if (loadBox) loadBox.hidden = false;
  if (loadLbl) loadLbl.textContent = `Upscaling ${scaleFactor}x… 0%`;
  if (progBar) progBar.style.width = '0%';

  try {
    const origDataUrl = window.VPAIBridge?.renderOriginalImageDataUrl
      ? window.VPAIBridge.renderOriginalImageDataUrl(ref.img)
      : ref.src;

    const res = await runRealEsrganImageUpscale(
      ref.img,
      scaleFactor,
      (pct) => {
        if (loadLbl) loadLbl.textContent = `Upscaling ${scaleFactor}x… ${pct}%`;
        if (progBar) progBar.style.width = `${pct}%`;
      },
      () => imgUpscaleAbort
    );

    if (!res || !res.dataUrl) {
      throw new Error('Upscaler returned an empty result.');
    }

    const scaleLabel = `${scaleFactor}x`;
    await saveHistoryEntry({
      kind: 'upscaled_image',
      mainImageDataUrl: origDataUrl,
      upscaledImageDataUrl: res.dataUrl,
      generatedImageDataUrl: res.dataUrl,
      leftLabel: 'Main Image',
      rightLabel: 'Upscaled Image',
      scaleLabel,
      modelName: `Upscaled Image (${scaleLabel})`,
      aspectRatio: `${res.width}×${res.height}`,
      width: res.width,
      height: res.height,
      createdAt: Date.now()
    });

    openUpscaledImageResultModal({
      origDataUrl,
      upscaledDataUrl: res.dataUrl,
      scaleLabel,
      width: res.width,
      height: res.height
    });
    toast(`Upscaled image (${scaleLabel}) ready`);
  } catch (err) {
    if (!err?.cancelled) {
      const msg = err?.message || String(err);
      if (errBox) {
        errBox.textContent = msg;
        errBox.hidden = false;
      }
      toast(msg);
    } else {
      toast('Image upscale cancelled');
    }
  } finally {
    imgUpscaleRunning = false;
    imgUpscaleAbort = false;
    card?.classList.remove('upscale-busy');
    if (activeScaleBtn) {
      activeScaleBtn.classList.remove('busy');
      activeScaleBtn.innerHTML = origScaleBtnHtml;
    }
    if (loadBox) loadBox.hidden = true;
    setImageGenBoxesLocked(false);
    syncImageUpscalerUI();
  }
}

$('imgUpscale2xBtn')?.addEventListener('click', () => startImageBoxUpscale(2));
$('imgUpscale4xBtn')?.addEventListener('click', () => startImageBoxUpscale(4));
$('imgUpscaleCancelBtn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  imgUpscaleAbort = true;
});

// PART 4.4: Upscaling directly from the Generated Image Window ("2x Upscale and Download" / "4x Upscale and Download")
async function runGeneratedWindowUpscaleAndDownload(scaleFactor) {
  if (imgUpscaleRunning) return;
  if (scaleFactor === 4 && S.mode !== 'adv' && !PRO) {
    toast('4x Upscale and Download requires Advanced mode or subscription.');
    return;
  }

  const srcDataUrl = currentResultModalState.imageDataUrl;
  if (!srcDataUrl) {
    toast('Generated image is missing.');
    return;
  }

  const btn2x = $('genWinUpscale2xBtn');
  const btn4x = $('genWinUpscale4xBtn');
  const orig2xHtml = btn2x ? btn2x.innerHTML : '2x Upscale and Download';
  const orig4xHtml = btn4x ? btn4x.innerHTML : '4x Upscale and Download';
  const activeBtn = scaleFactor === 4 ? btn4x : btn2x;

  imgUpscaleRunning = true;
  imgUpscaleAbort = false;
  if (btn2x) btn2x.disabled = true;
  if (btn4x) btn4x.disabled = true;
  if (activeBtn) {
    activeBtn.classList.add('busy');
    activeBtn.innerHTML = `<span class="spin"></span> Upscaling ${scaleFactor}x… 0%`;
  }

  try {
    const imgEl = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('Could not load generated image for upscaling.'));
      im.src = srcDataUrl;
    });

    const res = await runRealEsrganImageUpscale(
      imgEl,
      scaleFactor,
      (pct) => {
        if (activeBtn) activeBtn.innerHTML = `<span class="spin"></span> Upscaling ${scaleFactor}x… ${pct}%`;
      },
      () => imgUpscaleAbort || Boolean($('genImgResultModal')?.hidden)
    );

    if (imgUpscaleAbort || $('genImgResultModal')?.hidden) {
      throw Object.assign(new Error('Upscale cancelled.'), { cancelled: true });
    }

    if (!res || !res.dataUrl) {
      throw new Error('Upscaler failed to produce an upscaled image.');
    }

    const scaleLabel = `${scaleFactor}x`;
    await saveHistoryEntry({
      kind: 'upscaled_image',
      mainImageDataUrl: srcDataUrl,
      upscaledImageDataUrl: res.dataUrl,
      generatedImageDataUrl: res.dataUrl,
      leftLabel: 'Main Image',
      rightLabel: 'Upscaled Image',
      scaleLabel,
      promptText: currentResultModalState.promptText || '',
      modelName: `Upscaled Image (${scaleLabel})`,
      aspectRatio: `${res.width}×${res.height}`,
      width: res.width,
      height: res.height,
      createdAt: Date.now()
    });

    // Replace the Generated Image Window in place with the Upscaled Image Window
    openUpscaledImageResultModal({
      origDataUrl: srcDataUrl,
      upscaledDataUrl: res.dataUrl,
      scaleLabel,
      width: res.width,
      height: res.height
    });

    // Automatically download the upscaled image
    const a = document.createElement('a');
    a.href = res.dataUrl;
    a.download = `visionpilot-upscaled-${scaleLabel}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 300);

    toast(`${scaleLabel} upscaled image downloaded and saved to History / Library`);
  } catch (err) {
    if (!err?.cancelled) {
      const msg = err?.message || String(err);
      toast(msg);
    } else {
      toast('Upscale cancelled');
    }
  } finally {
    imgUpscaleRunning = false;
    imgUpscaleAbort = false;
    if (activeBtn) activeBtn.classList.remove('busy');
    if (btn2x) {
      btn2x.disabled = false;
      btn2x.innerHTML = orig2xHtml;
    }
    if (btn4x) {
      btn4x.innerHTML = orig4xHtml;
    }
    syncScaleButtonsLockState();
  }
}

$('genWinUpscale2xBtn')?.addEventListener('click', () => runGeneratedWindowUpscaleAndDownload(2));
$('genWinUpscale4xBtn')?.addEventListener('click', () => runGeneratedWindowUpscaleAndDownload(4));

loadHistoryLibrary();
syncImageUpscalerUI();
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
const panelName = id =>
  id === 'pRef'
    ? 'Input'
    : id === 'pObjects'
    ? 'Object'
    : id === 'pImgUpscale' || id === 'pVidUpscale'
    ? 'Upscale'
    : id === 'pPrompt'
    ? 'Prompt and Image'
    : id === 'pFocus'
    ? 'Image Detection & Focus'
    : ($(id)?.dataset.name || id);
const mode = () => S.app === 'video' ? 'video' : 'image';
function dockOf(m = mode()) {
  S.docks = S.docks || {};
  const allowed = dockableFor(m);
  const cols = Object.keys(DOCK_COLS[m]);
  let d = S.docks[m];
  if (!d || cols.some(c => !Array.isArray(d[c])) || Object.keys(d).some(c => !cols.includes(c))) d = DEFAULT_DOCK(m);
  const seen = new Set();
  cols.forEach(c => {
    d[c] = d[c].map(g => ({tabs:(g.tabs || []).filter(id => allowed.includes(id) && !seen.has(id) && seen.add(id)), active:g.active, collapsed:!!g.collapsed}))
      .filter(g => g.tabs.length);
    d[c].forEach(g => {
      if (S.mode !== 'adv' && g.active === 'pCam') g.active = g.tabs.find(id => id !== 'pCam') || g.tabs[0];
      if (!g.tabs.includes(g.active)) g.active = g.tabs[0];
    });
  });
  let missing = allowed.filter(id => !seen.has(id));
  if (missing.includes('pObjects')) {
    let refGrp = null;
    cols.forEach(c => d[c].forEach(g => { if (g.tabs.includes('pRef')) refGrp = g; }));
    if (refGrp) { refGrp.tabs.push('pObjects'); missing = missing.filter(id => id !== 'pObjects'); }
  }
  if (missing.includes('pImgUpscale')) {
    let refGrp = null;
    cols.forEach(c => d[c].forEach(g => { if (g.tabs.includes('pRef')) refGrp = g; }));
    if (refGrp) { refGrp.tabs.push('pImgUpscale'); missing = missing.filter(id => id !== 'pImgUpscale'); }
  }
  if (missing.includes('pVidUpscale')) {
    let refGrp = null;
    cols.forEach(c => d[c].forEach(g => { if (g.tabs.includes('pObjects') || g.tabs.includes('pRef')) refGrp = g; }));
    if (refGrp) { refGrp.tabs.push('pVidUpscale'); missing = missing.filter(id => id !== 'pVidUpscale'); }
  }
  if (missing.includes('pPresets')) {
    let outGrp = null;
    cols.forEach(c => d[c].forEach(g => { if (g.tabs.includes('pOutput')) outGrp = g; }));
    if (outGrp) { outGrp.tabs.push('pPresets'); missing = missing.filter(id => id !== 'pPresets'); }
  }
  if (missing.includes('pAnimPresets')) {
    let preGrp = null;
    cols.forEach(c => d[c].forEach(g => { if (g.tabs.includes('pPresets') || g.tabs.includes('pOutput')) preGrp = g; }));
    if (preGrp) { preGrp.tabs.push('pAnimPresets'); missing = missing.filter(id => id !== 'pAnimPresets'); }
  }
  if (missing.length) d[cols[cols.length - 1]].push({tabs:missing, active:missing[0]});
  return (S.docks[m] = d);
}
let dragPid = null;
let cachedRefBoxHeight = { image: 0, video: 0 };
function measureRefBoxHeight() {
  const m = mode();
  const refEl = $('pRef');
  const objEl = $('pObjects');
  if (refEl && refEl.offsetParent !== null && !refEl.closest('.tgroup.collapsed')) {
    const h = Math.round(refEl.getBoundingClientRect().height);
    if (h > 120) cachedRefBoxHeight[m] = h;
  } else if (m === 'video' && objEl && objEl.offsetParent !== null && !objEl.closest('.tgroup.collapsed')) {
    const h = Math.round(objEl.getBoundingClientRect().height);
    if (h > 120 && !cachedRefBoxHeight.video) cachedRefBoxHeight.video = h;
  }
}
function applyUpscalerExactBoxSize() {
  const m = mode();
  const targetH = cachedRefBoxHeight[m] || (m === 'video' ? 370 : 395);
  ['pImgUpscale', 'pVidUpscale'].forEach(id => {
    const upEl = $(id);
    if (!upEl) return;
    const isCollapsed = upEl.classList.contains('min') || Boolean(upEl.closest('.tgroup')?.classList.contains('collapsed'));
    if (isCollapsed) {
      upEl.style.height = '';
      upEl.style.minHeight = '';
      upEl.style.maxHeight = '';
    } else if ((m === 'video' && id === 'pVidUpscale') || (m !== 'video' && id === 'pImgUpscale')) {
      upEl.style.height = targetH + 'px';
      upEl.style.minHeight = targetH + 'px';
      upEl.style.maxHeight = targetH + 'px';
    }
  });
}
function renderDock() {
  measureRefBoxHeight();
  const m = mode(), d = dockOf(m), hold = $('vHold');
  const refEl = $('pRef');
  if (refEl) {
    refEl.dataset.name = 'Input';
    const rTagBtn = refEl.querySelector('.shead .tag');
    if (rTagBtn) rTagBtn.textContent = 'Input';
  }
  const objEl = $('pObjects');
  if (objEl) {
    objEl.dataset.name = 'Object';
    const tagBtn = objEl.querySelector(':scope > .tag');
    if (tagBtn) tagBtn.textContent = 'Object';
  }
  const focEl = $('pFocus');
  if (focEl) {
    focEl.dataset.name = 'Image Detection & Focus';
    const fTagBtn = focEl.querySelector('.shead .tag');
    if (fTagBtn) fTagBtn.textContent = 'Image Detection & Focus';
    const fSwLbl = $('focusOnWrap')?.querySelector('.vf-sw-lbl');
    if (fSwLbl) fSwLbl.textContent = 'Image Detection & Focus';
  }
  [...new Set([...DOCKABLE.image, ...DOCKABLE.video])].forEach(id => { const el = $(id); if (el) hold.appendChild(el); });
  Object.entries(DOCK_COLS[m]).forEach(([col, boxId]) => {
    const box = $(boxId); [...box.children].forEach(ch => ch.remove());
    const zone = gi => { const z = document.createElement('div'); z.className = 'dropzone'; z.dataset.col = col; z.dataset.gi = gi; return z; };
    box.appendChild(zone(0));
    d[col].forEach((g, gi) => {
      const singleSw = g.tabs.length === 1 && $(g.active)?.classList.contains('has-sw');
      const el = document.createElement('div'); el.className = 'tgroup' + (g.collapsed ? ' collapsed' : '') + (singleSw ? ' single-sw' : ''); el.dataset.col = col; el.dataset.gi = gi;
      const bar = document.createElement('div'); bar.className = 'tabbar'; bar.setAttribute('role', 'tablist');
      g.tabs.forEach(id => {
        const isCamLocked = id === 'pCam' && S.mode !== 'adv';
        const isLocked = isCamLocked || (!PRO && LOCKED_PANELS.includes(id));
        const isUpscaleTab = id === 'pImgUpscale' || id === 'pVidUpscale';
        const t = document.createElement('button');
        t.type = 'button';
        t.className = 'tab' + (isUpscaleTab ? ' tab-upscale' : '') + (isLocked ? ' locked' : '');
        t.draggable = !isCamLocked;
        t.dataset.pid = id;
        t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', id === g.active ? 'true' : 'false');
        t.innerHTML = esc(panelName(id));
        t.title = isCamLocked ? '' : id === g.active ? 'Click to minimize or open' : 'Click to show';
        if (isCamLocked) {
          t.disabled = true;
          try { t.inert = true; } catch (e) {}
        }
        bar.appendChild(t);
      });
      const st = $(g.active)?.querySelector('.shead .tag');
      if (st) { st.draggable = true; st.dataset.pid = g.active; }
      el.append(bar, $(g.active)); box.appendChild(el); box.appendChild(zone(gi + 1));
    });
  });
  applyUpscalerExactBoxSize();
  requestAnimationFrame(() => {
    measureRefBoxHeight();
    applyUpscalerExactBoxSize();
    syncImageUpscalerUI();
    hooks.syncVideoUpscalerUI?.();
    if (typeof alignBrandWithInputBox === 'function') alignBrandWithInputBox();
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
  requestAnimationFrame(() => {
    const el = $(pid), tg = el?.closest('.tgroup');
    if (tg && tg.dataset.gi === '0' && tg.parentElement) tg.parentElement.scrollTop = 0;
    else (tg || el)?.scrollIntoView({block:'nearest', behavior:'smooth'});
  });
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
    if (card) {
      if (card.id === 'pFocus' && S.app !== 'video') return;
      S.min[card.id] = !S.min[card.id]; save(); syncUI(); requestAnimationFrame(() => { drawAll(); placeMark(); }); return;
    }
  }
  const t = e.target.closest('.tab'); if (!t) return;
  if (t.dataset.pid === 'pCam' && S.mode !== 'adv') return;
  if (!PRO && LOCKED_PANELS.includes(t.dataset.pid)) { needAdv(panelName(t.dataset.pid)); return; }
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

/* ---------- AI Model Selector (VisionPilot AI · Claude · GPT · Gemini) & Extension Bridge ---------- */
function syncAIModelUI() {
  const activeId = ['visionpilot', 'claude', 'gpt', 'gemini'].includes(S.aiModel) ? S.aiModel : 'visionpilot';
  S.aiModel = activeId;
  const info = window.VPAIBridge?.getModelInfo ? window.VPAIBridge.getModelInfo(activeId) : {name:'VisionPilot AI', color:'#e85d2b'};
  const extConn = window.VPAIBridge?.isExtensionConnected ? window.VPAIBridge.isExtensionConnected() : false;
  if ($('aiModelCur')) $('aiModelCur').textContent = info.name;
  if ($('aiModelM')) {
    $('aiModelM').setAttribute('data-active-model', activeId);
    $('aiModelM').style.setProperty('--ai-c', info.color || '#e85d2b');
  }
  if ($('aiModelBtn')) {
    $('aiModelBtn').setAttribute('data-active-model', activeId);
    $('aiModelBtn').style.setProperty('--active-ai-color', info.color || '#e85d2b');
    $('aiModelBtn').style.setProperty('--ai-c', info.color || '#e85d2b');
  }
  document.querySelectorAll('#aiModelMenu .aimodel-opt').forEach(b => {
    b.setAttribute('aria-checked', String(b.dataset.aimodel === activeId));
  });
  if ($('aiExtTopBtn')) {
    $('aiExtTopBtn').classList.toggle('connected', extConn);
  }
  if ($('aiExtTopLbl')) {
    $('aiExtTopLbl').textContent = extConn ? 'Extension Connected' : 'Install Extension';
  }
  if ($('aiMenuExtStatus')) {
    $('aiMenuExtStatus').innerHTML = `<span class="ext-l1">Extension Bridge</span><span class="ext-l2">${extConn ? 'Connected' : 'Not Connected'}</span>`;
    $('aiMenuExtStatus').classList.toggle('on', extConn);
  }
  if ($('aiMenuExtInstall')) {
    $('aiMenuExtInstall').innerHTML = '<svg class="ext-dl-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="ext-dl-txt"><span>Download</span><span>Extension</span></span>';
  }
  renderLiveAIStatus();
}
window.syncAIModelUI = syncAIModelUI;

let pendingAIModel = '';

async function selectAIModel(modelId) {
  if (!['visionpilot', 'claude', 'gpt', 'gemini'].includes(modelId)) modelId = 'visionpilot';
  // Immediately stop and cancel any running backend work from the previous AI model
  cancelAllRunningAIWork();

  const myEpoch = aiModelSessionEpoch;
  const extConn = window.VPAIBridge?.isExtensionConnected ? window.VPAIBridge.isExtensionConnected() : false;
  const info = window.VPAIBridge?.getModelInfo ? window.VPAIBridge.getModelInfo(modelId) : {name:modelId};

  S.aiModel = modelId;
  lastAIError = '';
  aiConnectedOk = false;
  $('aiModelM')?.classList.remove('open');
  $('aiModelBtn')?.setAttribute('aria-expanded', 'false');

  if (modelId !== 'visionpilot' && !extConn) {
    pendingAIModel = modelId;
    syncAIModelUI();
    syncUI();
    openAIExtModal(modelId);
    const errMsg = `Chrome Extension not connected. Install & load the extension to use ${info.name}.`;
    lastAIError = errMsg;
    renderLiveAIStatus();
    toast(errMsg);
    changed();
    return;
  }

  pendingAIModel = '';

  if (modelId === 'visionpilot') {
    setDescLoading(false);
    syncAIModelUI();
    syncUI();
    if (refs.length) {
      const fRef = refs.find(r => r.id === S.focus.img) || refs[0];
      if (fRef && !fRef.vpRefDesc && window.VPLocalWriter) {
        updateAutoDescription(true);
      } else {
        applySummary(true);
      }
      if (S.focus.on && S.focus.mode === 'multi' && fRef && (!fRef.vpMultiEdits || !Object.keys(fRef.vpMultiEdits).length)) {
        runMultiModeAIStep(fRef);
      }
    }
    toast(`Active AI Model: ${info.name}`);
    changed();
    return;
  }

  // External AI model selected (Claude, GPT, Gemini):
  // Ensure Advanced mode & Focus Box are visible
  if (!PRO) setPro(true);
  if (S.mode !== 'adv') {
    S.mode = 'adv';
    document.body.classList.add('adv');
  }
  if (!S.focus.on) {
    S.focus.on = true;
  }
  // In Multiple Mode (Image Mode) or Video/3D Mode, focus marker is off by default; in Single Mode (Image Mode), focus marker is on
  S.focus.showMark = S.app === 'video' ? false : (S.focus.mode !== 'multi');

  syncAIModelUI();
  syncUI();

  // Requirement 1: Open that site's tab if not already open, always starting a fresh new chat and never reusing an old conversation.
  setDescLoading(true, `Opening fresh ${info.name} chat tab & checking login…`);
  const connRes = await window.VPAIBridge.connectModel(modelId);
  if (myEpoch !== aiModelSessionEpoch || S.aiModel !== modelId) return;
  setDescLoading(false);

  if (!connRes || !connRes.ok) {
    const errMsg = connRes?.error || `Failed to connect to ${info.name} tab.`;
    lastAIError = errMsg;
    aiConnectedOk = false;
    renderLiveAIStatus();
    toast(`${info.name} Error: ${errMsg}`);
    return;
  }

  aiConnectedOk = true;
  lastAIError = '';
  renderLiveAIStatus();
  toast(`Connected to fresh ${info.name} chat tab`);

  S.descUserEdited = false;
  if (refs.length) {
    for (const ref of refs) {
      if (myEpoch !== aiModelSessionEpoch || S.aiModel !== modelId) return;
      await detectRef(ref, {forceDesc:true, skipFollowup:true});
    }
    const curRef = refs[S.focus.img] || refs[0];
    if (curRef && !lastAIError && myEpoch === aiModelSessionEpoch && S.aiModel === modelId) {
      if (S.focus.mode === 'multi') {
        await runMultiModeAIStep(curRef);
      }
    }
  }
  renderLiveAIStatus();
  changed();
}
window.selectAIModel = selectAIModel;

$('aiModelBtn')?.addEventListener('click', e => {
  e.stopPropagation();
  const wrap = $('aiModelM');
  if (!wrap) return;
  const open = wrap.classList.toggle('open');
  $('aiModelBtn').setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', e => {
  if (!e.target.closest('#aiModelM')) {
    $('aiModelM')?.classList.remove('open');
    $('aiModelBtn')?.setAttribute('aria-expanded', 'false');
  }
});
$('aiModelMenu')?.addEventListener('click', e => {
  const opt = e.target.closest('.aimodel-opt[data-aimodel]');
  if (opt) {
    e.stopPropagation();
    selectAIModel(opt.dataset.aimodel);
  }
});
function openAIExtModal(forModel) {
  $('aiModelM')?.classList.remove('open');
  $('aiModelBtn')?.setAttribute('aria-expanded', 'false');
  if (typeof forModel !== 'string') pendingAIModel = '';
  if ($('aiExtModal')) $('aiExtModal').hidden = false;
}
function closeAIExtModal() {
  if ($('aiExtModal')) $('aiExtModal').hidden = true;
}
$('aiExtTopBtn')?.addEventListener('click', () => openAIExtModal());
$('aiMenuExtInstall')?.addEventListener('click', e => { e.stopPropagation(); openAIExtModal(); });
$('aiExtCloseBtn')?.addEventListener('click', closeAIExtModal);
$('aiExtModal')?.addEventListener('click', e => { if (e.target === $('aiExtModal')) closeAIExtModal(); });
$('aiExtDownloadBtn')?.addEventListener('click', async () => {
  try {
    await window.VPAIBridge?.downloadExtensionZip?.();
    toast('Downloaded visionpilot-ai-bridge-extension.zip — unzip and load unpacked in chrome://extensions, then refresh.');
  } catch (err) {
    toast('Download failed: ' + (err?.message || err));
  }
});
$('aiExtConnectNowBtn')?.addEventListener('click', async () => {
  const verify = await window.VPAIBridge?.verifyExtensionInstalled?.();
  syncAIModelUI();
  if (!verify || !verify.ok) {
    toast(verify?.error || 'Extension not detected in Chrome. Load the unpacked extension in chrome://extensions and refresh this page.');
    return;
  }
  closeAIExtModal();
  if (pendingAIModel) {
    const target = pendingAIModel;
    pendingAIModel = '';
    selectAIModel(target);
  } else {
    toast('VisionPilot Chrome Extension verified! Select Claude, GPT, or Gemini.');
  }
});

// Align ONLY the Logo (img.vp-logo) horizontally centered above the fixed left column (#iLeft / #vLeft),
// while keeping the maker name & tagline right beside the logo at the same 14px gap.
// Using the fixed left column geometry ensures the logo & tagline NEVER shift when switching between Input, Object, and Upscale.
function alignBrandWithInputBox() {
  const brand = document.querySelector('.nav .brand');
  const logo = brand?.querySelector('.vp-logo');
  const navIn = document.querySelector('.nav-in');
  if (!brand || !logo || !navIn) return;
  if (window.innerWidth <= 820) {
    brand.style.marginLeft = '0px';
    return;
  }
  const leftCol = $(S.app === 'video' ? 'vLeft' : 'iLeft');
  if (!leftCol) return;
  const colRect = leftCol.getBoundingClientRect();
  const colW = leftCol.offsetWidth || colRect.width;
  if (colW < 40) return;

  // Cards inside #iLeft / #vLeft have 2px left padding and 6px right padding (inner card width = colW - 8)
  const targetCenterX = colRect.left + 2 + (colW - 8) / 2;
  const logoRect = logo.getBoundingClientRect();
  const curMarginLeft = parseFloat(brand.style.marginLeft || '0') || 0;
  const currentLogoCenterX = logoRect.left + logoRect.width / 2;
  const deltaX = targetCenterX - currentLogoCenterX;
  const nextMarginLeft = Math.round(curMarginLeft + deltaX);
  if (Math.abs(nextMarginLeft - curMarginLeft) >= 1) {
    brand.style.marginLeft = nextMarginLeft + 'px';
  }
}
window.alignBrandWithInputBox = alignBrandWithInputBox;

// Button click visual feedback across UI (dark gray #2b2d31 + light gray text, loading icon, and box outline #b8bec8),
// leaving "Key prompts" (#keys) and "Select Focus Subject" (#focusSubjList, #vfSubjList) untouched.
document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#keys, #focusSubjList, #vfSubjList')) return;
  const btn = e.target.closest('.btn, #genImgDownloadBtn, .vph-del-btn, #vpHistDelCancelBtn, #vpHistDelConfirmBtn');
  if (!btn || btn.disabled || btn.classList.contains('upscale-disabled')) return;
  btn.classList.add('vp-btn-pressed');
  const release = () => {
    setTimeout(() => {
      btn.classList.remove('vp-btn-pressed');
    }, 240);
    window.removeEventListener('pointerup', release);
    window.removeEventListener('pointercancel', release);
  };
  window.addEventListener('pointerup', release, { once: true });
  window.addEventListener('pointercancel', release, { once: true });
});

// Global Drag-and-Drop anywhere on the page:
// - Dropping image(s) or a folder of images anywhere loads into Input (#pRef) and Image Upscale (#pImgUpscale) and turns on the Upscale box.
// - Dropping video(s) or a folder of videos anywhere loads into Video Upscale (#pVidUpscale) and turns on the Video Upscale box (blocked for Normal mode users without Advanced mode).
function isSupportedDropVideoFile(fileOrName) {
  const name = typeof fileOrName === 'string' ? fileOrName : (fileOrName?.name || '');
  const type = typeof fileOrName === 'object' && fileOrName ? (fileOrName.type || '') : '';
  if (type && type.startsWith('video/')) return true;
  return /\.(mp4|webm|mov|m4v|mkv|avi|ogv)$/i.test(name);
}

async function readDirectoryEntryRecursive(dirEntry) {
  const out = [];
  const reader = dirEntry.createReader();
  const readBatch = () => new Promise((resolve) => {
    reader.readEntries((entries) => resolve(entries || []), () => resolve([]));
  });
  let batch = await readBatch();
  while (batch.length) {
    for (const entry of batch) {
      if (entry.isFile) {
        const f = await new Promise((res) => entry.file((file) => res(file), () => res(null)));
        if (f) out.push(f);
      } else if (entry.isDirectory) {
        const sub = await readDirectoryEntryRecursive(entry);
        out.push(...sub);
      }
    }
    batch = await readBatch();
  }
  return out;
}

async function extractDroppedFilesAndFolder(dataTransfer) {
  const rawFiles = Array.from(dataTransfer?.files || []);
  const items = Array.from(dataTransfer?.items || []);
  const entries = items
    .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
    .filter(Boolean);

  const dirEntry = entries.find((en) => en.isDirectory);
  if (dirEntry) {
    const dirFiles = await readDirectoryEntryRecursive(dirEntry);
    return {
      files: dirFiles.length ? dirFiles : rawFiles,
      isFolder: true,
      folderName: dirEntry.name || 'Dropped_Folder'
    };
  }

  let folderName = '';
  let isFolder = false;
  if (rawFiles.length && rawFiles[0].webkitRelativePath && /[\\/]/.test(rawFiles[0].webkitRelativePath)) {
    folderName = rawFiles[0].webkitRelativePath.split(/[\\/]/)[0];
    isFolder = true;
  }
  return {
    files: rawFiles,
    isFolder,
    folderName: folderName || (rawFiles.length > 1 ? 'Dropped_Batch' : '')
  };
}

async function handleGlobalPageDroppedPayload({ files = [], isFolder = false, folderName = '' } = {}) {
  const all = Array.from(files || []).filter(Boolean);
  if (!all.length) return;
  const imgFiles = all.filter((f) => isSupportedBatchImageFile(f));
  const vidFiles = all.filter((f) => isSupportedDropVideoFile(f));

  // Video drop (single video, multiple videos, or folder of videos)
  if (vidFiles.length > 0 && imgFiles.length === 0) {
    if (!PRO) {
      needAdv('Video Upscale');
      toast('Video Upscale is only available in Advanced mode.');
      return;
    }
    if (S.mode !== 'adv') {
      if (!ensureAdvMode('Video Upscale')) return;
    }
    if (S.app !== 'video') {
      hooks.enterVideo?.();
    }
    showPanel('pVidUpscale');
    hooks.handleDroppedVideos?.({
      files: vidFiles,
      isFolder: Boolean(isFolder || vidFiles.length > 1),
      folderName: folderName || 'Selected_Video_Folder'
    });
    return;
  }

  // Image drop (single image, multiple images, or folder of images)
  if (imgFiles.length > 0) {
    if (S.app === 'video') {
      hooks.leaveVideo?.();
      switchModeState('image');
      applyLayout();
    }
    if (isFolder) {
      // Load first image into Input (#pRef) and set folder batch in Image Upscale (#pImgUpscale)
      addFiles([imgFiles[0]]);
      selectBatchFolderFromFileList(imgFiles, folderName || 'Dropped_Folder');
    } else {
      batchFolderState = null;
      addFiles(imgFiles);
      if (refs.length) {
        S.focus.img = refs.length - 1;
      }
    }
    showPanel('pImgUpscale');
    syncImageUpscalerUI();
  }
}
window.handleGlobalPageDroppedPayload = handleGlobalPageDroppedPayload;

let pageDragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (dragPid) return;
  const types = Array.from(e.dataTransfer?.types || []);
  if (!types.includes('Files')) return;
  e.preventDefault();
  pageDragDepth++;
  document.body.classList.add('vp-page-dragover');
});
window.addEventListener('dragover', (e) => {
  if (dragPid) return;
  const types = Array.from(e.dataTransfer?.types || []);
  if (!types.includes('Files')) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  document.body.classList.add('vp-page-dragover');
});
window.addEventListener('dragleave', (e) => {
  if (dragPid) return;
  pageDragDepth = Math.max(0, pageDragDepth - 1);
  if (pageDragDepth === 0 || e.relatedTarget === null) {
    pageDragDepth = 0;
    document.body.classList.remove('vp-page-dragover');
  }
});
window.addEventListener('drop', async (e) => {
  if (dragPid) return;
  const hasFiles = (e.dataTransfer?.files && e.dataTransfer.files.length) ||
    (e.dataTransfer?.items && e.dataTransfer.items.length);
  pageDragDepth = 0;
  document.body.classList.remove('vp-page-dragover');
  if (!hasFiles) return;
  e.preventDefault();
  e.stopPropagation();
  const payload = await extractDroppedFilesAndFolder(e.dataTransfer);
  await handleGlobalPageDroppedPayload(payload);
}, true);

// height of the top bar, so the video workspace can fill exactly the rest of the screen
function measureNav() {
  const n = document.querySelector('.nav');
  if (n) root.style.setProperty('--navh', Math.ceil(n.getBoundingClientRect().height + 10) + 'px');
  alignBrandWithInputBox();
}
// in both image and video mode the prompt box takes the room under Output so its bottom aligns with Top & Front views (or Timeline)
function fitPrompt() {
  const pre = $('json'), bar = $('genImgModelBar'), card = $('pPrompt'), col = $(S.app === 'video' ? 'vRight' : 'iRight');
  if (!pre || !card || !col) return;
  const barOpen = bar && !bar.hidden;
  if (!barOpen) pre.style.height = '';
  if (!col.contains(card) || innerWidth < 1251 || card.closest('.tgroup')?.classList.contains('collapsed')) return;
  const refEl = S.app === 'video' ? $('pTimeline') : $('pairViews');
  const refRect = refEl?.getBoundingClientRect();
  const targetBottom = (refRect && refRect.height > 20) ? (refRect.bottom - 1) : (col.getBoundingClientRect().bottom - 12);
  const activeEl = barOpen ? bar : pre;
  const extra = card.getBoundingClientRect().height - activeEl.offsetHeight;
  const space = targetBottom - card.getBoundingClientRect().top;
  const h = clamp(Math.floor(space - extra), 80, 520) + 'px';
  pre.style.height = h;
  if (bar) bar.style.height = h;
}
window.addEventListener('resize', () => { measureNav(); fitPrompt(); alignBrandWithInputBox(); });
document.fonts?.ready.then(() => { measureNav(); fitPrompt(); alignBrandWithInputBox(); });
function applyLayout() {
  measureNav();
  const video = S.app === 'video';
  document.body.classList.toggle('video', video);
  if (video) {
    $('vCenter').prepend($('pViewport'));
    place($('vThree'), ['pOrbit', 'pTop', 'pSide']);
    place($('iTools'), ['pFocus']);
  } else {
    $('vCenter').prepend($('pViewport'));
    $('iCenter').prepend($('pOrbit'));
    place($('orbitSide'), ['pTop', 'pSide']);
    place($('pairViews'), ['pFocus']);
    $('iCenter').appendChild($('pairViews'));
  }
  renderDock();
  resetPrompt();
  syncUI();
  afterLayout();
  requestAnimationFrame(alignBrandWithInputBox);
}

/* ---------- boot ---------- */
readTokens();
buildStatic();
document.querySelectorAll('select').forEach(enhance);
renderRefs();
if (S.app === 'video' && !PRO) S.app = 'image';
enforce();
showEmpty();
const ro = new ResizeObserver(() => {
  drawAll();
  placeMark();
  if ($('imgUpscaleDrop') && $('imgUpscaleThumb') && !$('imgUpscaleThumb').hidden) {
    fitUpscaleDropMedia($('imgUpscaleDrop'), $('imgUpscaleThumb'));
  }
  if ($('vidUpscaleDrop') && $('vidUpscaleThumbImg') && !$('vidUpscaleThumbImg').hidden) {
    fitUpscaleDropMedia($('vidUpscaleDrop'), $('vidUpscaleThumbImg'));
  }
});
['globe', 'top', 'side', 'lightDial', 'focusImg', 'focusPic', 'imgUpscaleDrop', 'vidUpscaleDrop'].forEach(id => {
  if ($(id)) ro.observe($(id));
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { drawAll(); hooks.themeChanged?.(); });
applyLayout();
syncUI();
drawAll();
snapshot();

window.AC = {S, DEF, refs, $, rad, deg, clamp, norm360, signed, rnd, cap, joinList, esc, escAttr, hl, mStr,
  BODIES, SUBJ, SHOTS, KEYS, LIGHTS, ROLES, TYPE_NAME, IMG_PRESETS, C, hooks,
  calc, getBody, getLens, setAz, setEl, setDist, setFocal, distForShot, allSubjects, currentThumb, sampleImg, onLights,
  changed, applyQuiet, syncUI, drawAll, readTokens, fit, drawCam, drawArrow, drawThumb, toast, enhance, refreshDD,
  common, angleParts, azInfo, elInfo, lensCharFor, lightPhrase, rigText, cameraJSON, lightingJSON, getSetup, kelvinRGB, apStr, hardName, buildImagePrompt, ensureBackgroundImagePrompt,
  applyLayout, switchModeState, renderRefs, renderImgPresets, loadUserImgPresets, saveUserImgPresets, resetPrompt, save, views, DMIN, DMAX, showPanel, rigTarget, setIfIdle, undo, redo, histUI, flushSnapshot,
  addFiles, identifyAt, selectMultiSubject, selectAIModel, syncFocus, placeMark, placeBoxes,
  isPro:() => PRO, setPro, needAdv, ensureAdvMode, hideAdv, GATED};
window.ensureBackgroundImagePrompt = ensureBackgroundImagePrompt;
document.dispatchEvent(new Event('ac-ready'));

// Register VisionPilot Service Worker (sw.js) for asset caching & offline support
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.protocol === 'http:') && !window.__vpSwRegistered) {
  window.__vpSwRegistered = true;
  const registerVpServiceWorker = () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(reg => {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch(err => {
        console.warn('VisionPilot Service Worker registration skipped:', err?.message || err);
      });
  };
  if (document.readyState === 'complete') {
    registerVpServiceWorker();
  } else {
    window.addEventListener('load', registerVpServiceWorker, { once: true });
  }
}
})();
