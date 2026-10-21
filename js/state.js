// Shared defaults, mutable UI state and vector helpers.
// Files run in the order specified in index.html; they share the application state.
'use strict';

// Representative room-temperature screening presets, not certified design allowables.
// For filled FDM grades the modulus is an indicative XY/bending value; factor
// discounts the printed linkage for build quality/orientation. Printed materials
// are anisotropic and vary by moisture, brand and process; metals use factor 1.
// References: Bambu Lab Filament Guide + individual filament datasheets,
// Prusa Advanced Filament Guide, and grade-specific alloy references.
// Allowable stress is a conservative *model threshold*, NOT tensile strength.
const materialGroups = [
  { label: "Common & reinforced filaments", items: [
    { key: "pla", label: "PLA", youngMPa: 2500, density: 1.24, stressLimit: 12, stiffFactor: 0.65, note: "Rigid, easy to print; low heat resistance and comparatively brittle." },
    { key: "pla-tough", label: "PLA Tough / PLA+", youngMPa: 2400, density: 1.24, stressLimit: 15, stiffFactor: 0.7, note: "Toughened PLA is vendor-dependent; impact toughness is not the same as stiffness." },
    { key: "pla-cf", label: "PLA-CF", youngMPa: 3950, density: 1.22, stressLimit: 20, stiffFactor: 0.65, note: "Stiffer in the print plane; short carbon fiber does not make it continuous-carbon composite." },
    { key: "petg", label: "PETG", youngMPa: 1900, density: 1.27, stressLimit: 10, stiffFactor: 0.65, note: "Tougher and less brittle than ordinary PLA; prone to creep under sustained load." },
    { key: "petg-cf", label: "PETG-CF", youngMPa: 2800, density: 1.28, stressLimit: 17, stiffFactor: 0.7, note: "Short-fiber reinforced PETG; abrasive and print-direction dependent." },
    { key: "pet-cf", label: "PET-CF", youngMPa: 5320, density: 1.29, stressLimit: 25, stiffFactor: 0.7, note: "Stiff engineering composite; drying, nozzle wear and print orientation matter." },
    { key: "abs", label: "ABS", youngMPa: 1880, density: 1.04, stressLimit: 12, stiffFactor: 0.65, note: "Impact-tolerant engineering plastic; enclosure and ventilation recommended." },
    { key: "abs-gf", label: "ABS-GF", youngMPa: 3200, density: 1.13, stressLimit: 16, stiffFactor: 0.7, note: "Glass-fiber-filled ABS; stiff, abrasive, and sensitive to build orientation." },
    { key: "asa", label: "ASA", youngMPa: 1920, density: 1.05, stressLimit: 12, stiffFactor: 0.7, note: "UV- and weather-resistant plastic, commonly used for outdoor components." },
    { key: "asa-cf", label: "ASA-CF", youngMPa: 4000, density: 1.1, stressLimit: 20, stiffFactor: 0.7, note: "Short-fiber reinforced ASA; representative estimates vary substantially by manufacturer." },
  ] },
  { label: "Nylons, polycarbonate & structural FDM", items: [
    { key: "pa6", label: "PA6 (Nylon 6)", youngMPa: 1700, density: 1.13, stressLimit: 13, stiffFactor: 0.65, note: "Nylon 6 absorbs moisture; its stiffness and strength vary strongly with conditioning." },
    { key: "pa6-cf", label: "PA6-CF", youngMPa: 5460, density: 1.09, stressLimit: 28, stiffFactor: 0.65, note: "Indicative dry XY value. Moisture can substantially reduce flexural stiffness." },
    { key: "pa6-gf", label: "PA6-GF", youngMPa: 4200, density: 1.17, stressLimit: 22, stiffFactor: 0.65, note: "Glass-fiber reinforced nylon; moisture and fiber direction are important." },
    { key: "pa12", label: "PA12 (Nylon 12)", youngMPa: 1550, density: 1.01, stressLimit: 12, stiffFactor: 0.65, note: "Lower moisture uptake than PA6; still sensitive to process and orientation." },
    { key: "pa12-cf", label: "PA12-CF", youngMPa: 4100, density: 1.1, stressLimit: 22, stiffFactor: 0.65, note: "Carbon-fiber-filled nylon 12; depends heavily on filament formulation." },
    { key: "paht-cf", label: "PAHT-CF", youngMPa: 4230, density: 1.16, stressLimit: 24, stiffFactor: 0.7, note: "Carbon-filled high-temperature nylon blend; dry versus conditioned properties differ." },
    { key: "pc", label: "PC (Polycarbonate)", youngMPa: 2310, density: 1.2, stressLimit: 18, stiffFactor: 0.7, note: "Impact-resistant engineering plastic requiring controlled printing conditions." },
    { key: "pc-cf", label: "PC-CF", youngMPa: 4700, density: 1.24, stressLimit: 25, stiffFactor: 0.7, note: "Carbon-filled PC; print-plane rigidity rises but interlayer properties may not." },
    { key: "ppa-cf", label: "PPA-CF", youngMPa: 9300, density: 1.22, stressLimit: 35, stiffFactor: 0.7, note: "High-stiffness carbon-filled polyphthalamide; printer capability must be checked." },
  ] },
  { label: "Specialty & industrial polymers", items: [
    { key: "pp", label: "PP (Polypropylene)", youngMPa: 1100, density: 0.9, stressLimit: 8, stiffFactor: 0.7, note: "Light, fatigue-resistant polymer; low stiffness and challenging bed adhesion." },
    { key: "tpu-95a", label: "TPU 95A", youngMPa: 25, density: 1.2, stressLimit: 2, stiffFactor: 0.7, note: "Flexible elastomer: linear beam/small-deflection assumptions are especially unreliable." },
    { key: "pps-cf", label: "PPS-CF", youngMPa: 7160, density: 1.26, stressLimit: 25, stiffFactor: 0.7, note: "High-temperature specialty composite; may require hotter equipment than consumer printers." },
    { key: "peek", label: "PEEK (industrial)", youngMPa: 3700, density: 1.3, stressLimit: 25, stiffFactor: 0.7, note: "Industrial high-temperature polymer requiring specialized hotend and heated chamber." },
    { key: "pei", label: "PEI / ULTEM (industrial)", youngMPa: 3200, density: 1.27, stressLimit: 24, stiffFactor: 0.7, note: "Industrial high-temperature polymer requiring specialized equipment." },
  ] },
  { label: "Metals & engineering sheet", items: [
    { key: "al6061", label: "Aluminum 6061-T6", youngMPa: 69000, density: 2.7, stressLimit: 95, stiffFactor: 1, note: "Machined structural alloy. The model assumes a homogeneous, solid material." },
    { key: "al7075", label: "Aluminum 7075-T6", youngMPa: 71700, density: 2.81, stressLimit: 175, stiffFactor: 1, note: "Higher-strength aerospace alloy; stiffness is similar to other aluminum alloys." },
    { key: "steel1018", label: "Steel 1018", youngMPa: 205000, density: 7.87, stressLimit: 120, stiffFactor: 1, note: "Mild carbon steel: very stiff but heavy. This is not a material for FDM printing." },
    { key: "ss304", label: "Stainless steel 304", youngMPa: 193000, density: 8, stressLimit: 85, stiffFactor: 1, note: "Corrosion-resistant steel. Properties vary with processing and cold work." },
    { key: "ti64", label: "Titanium Ti-6Al-4V", youngMPa: 114000, density: 4.43, stressLimit: 220, stiffFactor: 1, note: "Strong aerospace alloy, typically machined or metal-printed with industrial equipment." },
    { key: "g10-fr4", label: "G10 / FR-4 laminate", youngMPa: 20000, density: 1.85, stressLimit: 60, stiffFactor: 1, note: "Glass-epoxy plate: strongly directional and unsuitable for isotropic beam assumptions." },
  ] },
];
// Preserve original SolidWorks codes: PLA=1 and PETG=2 (Custom=0).
let nextMaterialCode = 3;
const materialPresets = Object.fromEntries(
  materialGroups.flatMap(group => group.items).map(entry => [
    entry.key, {
      ...entry,
      code: entry.key === 'pla' ? 1 : entry.key === 'petg' ? 2 : nextMaterialCode++
    }
  ])
);

const defaults = {
  routeFrom: 'D1',
  routeTo: 'D8',
  xySpeed: 90,
  motorRPM: 180,
  speedCap: true,
  boardW: 255,
  boardH: 255,
  outerW: 300,
  outerH: 300,
  mountX: 127.5,
  mountY: 380,
  sep: 85,
  angle: -180,
  l1: 200,
  l2: 220,
  r1: 200,
  r2: 220,
  branch: '+-',
  toolMode: 'joint',
  extension: 65,
  offsetX: 30,
  offsetY: 0,
  showCoverage: true,
  showCenters: true,
  showRings: true,
  forbidCrossings: false,
  targetX: 127.5,
  targetY: 127.5,
  showMechanics: true,
  heatMode: 'payload',
  material: 'petg',
  sectionType: 'box',
  youngMPa: 1900,
  density: 1.27,
  stiffFactor: 0.65,
  stressLimit: 10,
  wall: 2,
  sagLimit: 1,
  l1W: 20,
  l1H: 20,
  l2W: 20,
  l2H: 20,
  r1W: 20,
  r1H: 20,
  r2W: 20,
  r2H: 20,
  headG: 180,
  payloadG: 50,
  accel: 350,
  dragN: 0.3,
  motorNm: 0.25,
  motorSF: 1.7,
  ratio: 2,
  efficiency: 95,
  bearingFrictionNm: 0.015,
  servoTravel: 180,
  servoMargin: 10,
  useJointLimits: false,
  leftMinAngle: 0,
  leftMaxAngle: 360,
  rightMinAngle: 0,
  rightMaxAngle: 360,
  showServoArcs: true,
};
let state = { ...defaults };
let routeData = null,
  routePlaying = false,
  routeCursor = 0,
  routeFrameStamp = null,
  routeFrameHandle = null,
  routeUpdating = false;
const $ = (id) => document.getElementById(id);
const svg = $('scene');
let lastMap = null,
  lastMechMap = null,
  lastServoMap = null,
  lastSolution = null,
  dragging = null,
  resizeMode = false,
  currentView = { x: 0, y: 0, w: 600, h: 600 };
const RAD = Math.PI / 180;
const vec = (x, y) => ({ x, y }),
  add = (a, b) => vec(a.x + b.x, a.y + b.y),
  sub = (a, b) => vec(a.x - b.x, a.y - b.y),
  mul = (v, k) => vec(v.x * k, v.y * k),
  dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  cross = (a, b) => a.x * b.y - a.y * b.x;
const f = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : '--');
const degree = (n) => (Math.atan2(n.y, n.x) / RAD + 360) % 360;
