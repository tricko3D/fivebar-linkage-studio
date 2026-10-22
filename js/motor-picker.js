// Motor selection overlay. Reuses the material library's dialog, categories and choice card UI.
// Published stall/holding ratings are contextual only, NOT used as running torque.
'use strict';

const motorFamilies = [
  { key: 'micro', label: 'Micro servos', description: 'Compact positional RC servos for small linkages', symbol: '◉' },
  { key: 'standard', label: 'Standard servos', description: 'Larger positional RC servos for heavier linkages', symbol: '◈' },
  { key: 'stepper', label: 'Steppers', description: 'Continuous-angle steppers, driver-dependent torque', symbol: '⚙' },
  { key: 'gimbal', label: 'Gimbal & frameless', description: 'Compact direct-drive BLDC motors for robotic joints', symbol: '◎' },
  { key: 'outrunner', label: 'BLDC outrunners', description: 'Bare high-torque-density motors, external FOC needed', symbol: '◌' },
  { key: 'actuator', label: 'Integrated actuators', description: 'Robotic BLDC units with driver or gearing built in', symbol: '◈' }
];
// All motorNm / motorRPM entries are editable FIRST-PASS RUNNING estimates.
// Published stall/holding torque and no-load speed are NOT interchangeable with
// a measured torque-speed curve. A servo's internal gear reduction is already
// represented by its output-shaft torque: the external ratio starts at 1:1.
// Published references (ratings only):
// https://towerpro.com.tw/product/sg90-analog/
// https://towerpro.com.tw/product/mg90s-3/
// https://towerpro.com.tw/product/mg996R/
// https://manuals.plus/m/bc698d4a450c3f26c3c9e0d10c421c271a39e51d32643f958f6179dd1bf36096
// https://www.omc-stepperonline.com/nema-14-stepper-motor-bipolar-l-33mm-w-gear-ratio-100-1-planetary-gearbox-14hs13-0804s-pg100
// https://www.omc-stepperonline.com/nema-17-bipolar-1-8deg-26ncm-36-8oz-in-0-4a-12v-42x42x34mm-4-wires-17hs13-0404s1
// https://ww1.microchip.com/downloads/aemDocuments/documents/MCU08/ApplicationNotes/ApplicationNotes/TB3362-Drivnig-Stepper-Motor-Using-AVR-EB-DS90003362.pdf
// https://www.omc-stepperonline.com/nema-17-bipolar-59ncm-84oz-in-2a-42x48mm-4-wires-w-1m-cable-connector-17hs19-2004s1
const motorPresets = {
  sg90: { family: 'micro', label: 'TowerPro SG90', rating: '1.8 kg·cm stall @ 4.8 V', motorNm: 0.065, motorRPM: 55, servoTravel: 180, note: '9 g plastic-gear analog servo; running torque and RPM are intentionally below the stall and no-load ratings.' },
  mg90s: { family: 'micro', label: 'TowerPro MG90S', rating: '1.8 kg·cm stall @ 4.8 V', motorNm: 0.08, motorRPM: 65, servoTravel: 180, note: 'Metal-gear micro servo. A conservative illustrative working point, not a measured MG90S torque-speed curve.' },
  mg996r: { family: 'standard', label: 'TowerPro MG996R', rating: '9.4 kg·cm stall @ 4.8 V', motorNm: 0.40, motorRPM: 38, servoTravel: 180, note: 'Standard-size metal-gear servo; the rating is at stall, while the model uses an indicative lower running torque.' },
  ds3218: { family: 'standard', label: 'DS3218 (270° version)', rating: '21.5 kg·cm stall @ 6.8 V', motorNm: 0.80, motorRPM: 35, servoTravel: 270, note: 'Choose this only for the 270° positional variant. A 180° DS3218 must have its travel corrected.' },
  'nema14-34': { family: 'stepper', label: 'NEMA 14 · 34 mm', rating: '0.14 N·m holding (14HS13 example)', motorNm: 0.065, motorRPM: 200, servoTravel: 360, note: 'Representative NEMA 14 at moderate speed. Usable torque is highly dependent on driver, voltage and current.' },
  'nema17-34': { family: 'stepper', label: 'NEMA 17 · 34 mm', rating: '0.26 N·m holding (17HS13-0404S1)', motorNm: 0.10, motorRPM: 180, servoTravel: 360, note: 'Short NEMA 17 example. This high-inductance 0.4 A motor needs its own measured torque-speed curve.' },
  'nema17-40': { family: 'stepper', label: 'NEMA 17 · 40 mm', rating: '0.40 N·m holding (17HS4401)', motorNm: 0.18, motorRPM: 250, servoTravel: 360, note: 'Common 1.7 A NEMA 17. Holding torque is not usable running torque; tune to your driver and supply.' },
  'nema17-48': { family: 'stepper', label: 'NEMA 17 · 48 mm', rating: '0.59 N·m holding (17HS19-2004S1)', motorNm: 0.25, motorRPM: 250, servoTravel: 360, note: 'Longer 2 A NEMA 17 example, not a guaranteed torque at 250 RPM.' },
  'nema17-baseline': {family:'stepper',label:'NEMA 17 · project baseline',rating:'Project setup, not a manufacturer torque-speed curve',motorNm:0.25,motorRPM:180,servoTravel:360,ratio:2,note:'Retains saved 0.25 N·m, 180 RPM, 2:1 external drive; travel corrected from 180° to 360°.'},
  'ipower-gm4108h': {family:'gimbal',label:'iPower GM4108H-120T',rating:'0.12–0.18 N·m load torque @20 V',motorNm:0.12,motorRPM:250,servoTravel:360,note:'Listed loaded torque, but 250 RPM is an illustrative estimate, not measured at that torque.',source:'https://iflight-rc.eu/en-pt/products/ipower-gm4108h-120t-gimbal-motor'},
  'cubemars-ri30': {family:'gimbal',label:'CubeMars RI30 KV260',rating:'0.076 N·m rated @4110 RPM, 24 V',motorNm:0.076,motorRPM:4110,servoTravel:360,note:'Published rated torque-speed point, frameless FOC motor.',source:'https://www.cubemars.com/product/ri30-kv260-frameless-torque-motor.html'},
  'cubemars-ri50': {family:'gimbal',label:'CubeMars RI50 KV100',rating:'0.58 N·m rated @1090 RPM, 24 V',motorNm:0.58,motorRPM:1090,servoTravel:360,note:'Published rated torque-speed point, frameless 54 mm motor.',source:'https://www.cubemars.com/product/ri50-kv100-frameless-inrunner-torque-motor.html'},
  'odrive-d5065': {family:'outrunner',label:'ODrive D5065 · 270 KV',rating:'270 KV; approximately 0.031 N·m/A',motorNm:0.22,motorRPM:900,servoTravel:360,note:'Illustrative running point, not a published rated torque-speed pair. Encoder and FOC controller needed.',source:'https://eu.odriverobotics.com/shop/odrive-custom-motor-d5065'},
  'flipsky-6374': {family:'outrunner',label:'Flipsky 6374 · 190 KV',rating:'8 N·m MAX torque, not continuous',motorNm:1.5,motorRPM:1000,servoTravel:360,note:'Illustrative working point. Maximum torque must not be used for continuous sizing.',source:'https://flipsky.net/products/bldc-belt-motor-6374-190kv-3250w-for-electric-skateboard'},
  'eagle-la8308-90kv': {family:'outrunner',label:'Eagle Power LA8308 · 90 KV',rating:'90 KV; 22 A max continuous current; Ø92 × 28.5 mm',motorNm:0.45,motorRPM:500,servoTravel:360,note:'Compact axially, but 92 mm diameter. Running torque and speed are illustrative, not a tested matched pair.',source:'https://www.technobotix.in/products/eagle-powor-la-8308-kv90-motor/1781252000000073016'},
  'dji-gm6020': {family:'actuator',label:'DJI RoboMaster GM6020',rating:'1.2 N·m continuous @132 RPM, 24 V',motorNm:1.2,motorRPM:132,servoTravel:360,note:'Published output specification. Integrated driver and positional feedback; direct drive.',source:'https://www.robomaster.com/en-US/products/components/general/gm6020'},
  'dji-m3508-p19': {family:'actuator',label:'DJI M3508 P19',rating:'3 N·m continuous @469 RPM, C620 @24 V',motorNm:3,motorRPM:469,servoTravel:360,note:'Published output point with internal P19 gearbox; do not count its internal ratio twice.',source:'https://rm-static.djicdn.com/robomasters/public/document/RoboMaster%20M3508%20P19%20Brushless%20DC%20Gear%20Motor%20V1.0.pdf'},
  'cubemars-ak40-10': {family:'actuator',label:'CubeMars AK40-10',rating:'1.3 N·m rated @370 RPM, 24 V',motorNm:1.3,motorRPM:370,servoTravel:360,note:'Integrated FOC, encoder and 10:1 gearbox. Torque and speed already at the output.',source:'https://www.cubemars.com/product/ak40-10-robotic-actuator.html'},
  'cubemars-ak60-6': {family:'actuator',label:'CubeMars AK60-6 V3',rating:'3 N·m rated @490 RPM, 48 V',motorNm:3,motorRPM:490,servoTravel:360,note:'Integrated BLDC + driver with 6:1 internal gearbox. Output rating already reduced.',source:'https://www.cubemars.com/product/ak60-6-v3-0-kv80-robotic-actuator.html'}
};
let selectedMotorFamily = 'micro';
let motorPickerReturnFocus = null;
let motorPickerInitialized = false;
const motorKeys = ['motorNm', 'motorRPM', 'servoTravel'];
// Only the exact historical NEMA 17 snapshot gets the user-confirmed 360° correction.
function migrateLegacyMotorConfiguration(source, destination) {
  if (!source || Object.prototype.hasOwnProperty.call(source, 'motorPreset')) return;
  if (source.motorNm === 0.25 && source.motorRPM === 180 &&
      source.ratio === 2 && source.efficiency === 95 && source.servoTravel === 180) {
    destination.motorPreset = 'nema17-baseline';
    destination.servoTravel = 360;
  }
}
function normalizeMotorPresetSelection() {
  const preset = motorPresets[state.motorPreset];
  if (!preset || motorKeys.some(key => Math.abs(state[key] - preset[key]) > 1e-6))
    state.motorPreset = 'custom';
}
function motorLabel() { return motorPresets[state.motorPreset]?.label || 'Custom values'; }
function refreshMotorPickerTrigger() {
  const preset = motorPresets[state.motorPreset];
  const family = motorFamilies.find(item => item.key === preset?.family);
  const familyText = family?.label || 'Manual setup';
  const groupNode = $('motorPickerFamilyLabel');
  const choiceNode = $('motorChoiceLabel');
  if (groupNode) groupNode.textContent = familyText;
  if (choiceNode) choiceNode.textContent = motorLabel();
  const trigger = $('motorPickerTrigger');
  if (trigger) trigger.setAttribute('aria-label', 'Choose motor. ' + familyText + ', ' + motorLabel());
}
function updateMotorPresetNote() {
  const note = $('motorPresetNote');
  if (!note) return;
  const preset = motorPresets[state.motorPreset];
  note.textContent = preset
    ? state.motorPreset === 'nema17-baseline'
      ? 'Saved NEMA 17 setup · 0.25 N·m, 180 RPM, 2:1 drive (assumed).'
      : preset.label + ' · ' + preset.motorNm + ' N·m, ' + preset.motorRPM +
        ' RPM (see model details).'
    : 'Custom values. Enter running torque at speed, not stall or holding torque.';
}
function renderMotorChoices() {
  const family = motorFamilies.find(entry => entry.key === selectedMotorFamily);
  const groups = $('motorFamilyOptions');
  const choices = $('motorPickerChoices');
  groups.replaceChildren();
  choices.replaceChildren();
  $('motorPickerFamilyName').textContent = family.label;
  $('motorPickerFamilyHelp').textContent = family.description;
  for (const group of motorFamilies) {
    const active = group.key === selectedMotorFamily;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'materialProcessOption' + (active ? ' is-active' : '');
    button.dataset.motorFamily = group.key;
    button.setAttribute('aria-pressed', String(active));
    const symbol = document.createElement('span');
    symbol.className = 'materialProcessGlyph';
    symbol.textContent = group.symbol;
    symbol.setAttribute('aria-hidden', 'true');
    const names = document.createElement('span');
    names.className = 'materialProcessOptionText';
    const name = document.createElement('strong');
    name.textContent = group.label;
    const description = document.createElement('small');
    description.textContent = group.description;
    names.append(name, description);
    const count = document.createElement('span');
    count.className = 'materialProcessOptionCount';
    count.textContent = String(Object.values(motorPresets).filter(p => p.family === group.key).length);
    button.append(symbol, names, count);
    groups.append(button);
  }
  const listed = Object.entries(motorPresets).filter(entry => entry[1].family === selectedMotorFamily);
  $('motorPickerCount').textContent = listed.length + ' motors';
  for (const [key, model] of listed) {
    const active = state.motorPreset === key;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.motorChoice = key;
    button.className = 'materialPickerChoice' + (active ? ' is-selected' : '');
    button.setAttribute('aria-pressed', String(active));
    const head = document.createElement('span');
    head.className = 'materialPickerChoiceTitle';
    const name = document.createElement('strong');
    name.textContent = model.label;
    const check = document.createElement('span');
    check.className = 'materialChoiceCheck';
    check.textContent = '✓';
    check.setAttribute('aria-hidden', 'true');
    head.append(name, check);
    const metrics = document.createElement('span');
    metrics.className = 'materialPickerChoiceMetrics';
    metrics.textContent = model.motorNm + ' N·m running · ' + model.motorRPM + ' RPM · ' + model.servoTravel + '°';
    const rating = document.createElement('span');
    rating.className = 'materialPickerChoiceNote';
    rating.textContent = 'Published: ' + model.rating;
    const description = document.createElement('span');
    description.className = 'materialPickerChoiceNote';
    description.textContent = model.note;
    button.append(head, metrics, rating, description);
    if (model.source) button.title = 'Specification source: ' + model.source;
    choices.append(button);
  }
  const custom = document.createElement('button');
  custom.type = 'button';
  custom.className = 'materialPickerChoice materialPickerCustom' + (state.motorPreset === 'custom' ? ' is-selected' : '');
  custom.dataset.motorChoice = 'custom';
  custom.setAttribute('aria-pressed', String(state.motorPreset === 'custom'));
  const label = document.createElement('strong');
  label.textContent = 'Custom values';
  const detail = document.createElement('span');
  detail.className = 'materialPickerChoiceNote';
  detail.textContent = 'Keep the currently entered torque, RPM, travel and transmission settings.';
  custom.append(label, detail);
  choices.append(custom);
}
function applyMotorPreset(key) {
  if (key === 'custom') {
    state.motorPreset = 'custom';
  } else {
    const preset = motorPresets[key];
    if (!preset) return false;
    state.motorPreset = key;
    for (const field of motorKeys) state[field] = preset[field];
    state.servoMargin = key === 'nema17-baseline' ? 10 :
      ['micro', 'standard'].includes(preset.family) ? 10 : 0;
    // The rated servo torque is measured at the horn, AFTER its internal gearbox.
    // 1:1 here means no ADDITIONAL external transmission.
    state.ratio = preset.ratio ?? 1;
    state.efficiency = 95;
    // Existing joint stops belong to the previous motor installation.
    state.useJointLimits = false;
    state.leftMinAngle = 0;
    state.leftMaxAngle = 360;
    state.rightMinAngle = 0;
    state.rightMaxAngle = 360;
  }
  for (const field of [...motorKeys, 'servoMargin', 'ratio', 'efficiency',
    'useJointLimits', 'leftMinAngle', 'leftMaxAngle', 'rightMinAngle', 'rightMaxAngle']) {
    const input = $(field);
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = !!state[field];
    else input.value = String(state[field]);
  }
  refreshMotorPickerTrigger();
  updateMotorPresetNote();
  return true;
}
function closeMotorPicker() {
  const overlay = $('motorPickerOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('materialPickerOpen');
  $('motorPickerTrigger').setAttribute('aria-expanded', 'false');
  motorPickerReturnFocus?.focus();
  motorPickerReturnFocus = null;
}
function openMotorPicker() {
  const overlay = $('motorPickerOverlay');
  if (!overlay || !overlay.hidden) return;
  motorPickerReturnFocus = document.activeElement;
  selectedMotorFamily = motorPresets[state.motorPreset]?.family || 'micro';
  overlay.hidden = false;
  document.body.classList.add('materialPickerOpen');
  $('motorPickerTrigger').setAttribute('aria-expanded', 'true');
  renderMotorChoices();
  $('motorFamilyOptions').querySelector('button')?.focus();
}
function initMotorPicker() {
  if (motorPickerInitialized) return;
  motorPickerInitialized = true;
  const overlay = $('motorPickerOverlay');
  $('motorPickerTrigger').addEventListener('click', openMotorPicker);
  $('motorPickerClose').addEventListener('click', closeMotorPicker);
  overlay.addEventListener('click', event => {
    if (event.target.closest('[data-motor-close]')) { closeMotorPicker(); return; }
    const family = event.target.closest('[data-motor-family]');
    if (family && overlay.contains(family)) {
      selectedMotorFamily = family.dataset.motorFamily;
      renderMotorChoices();
      $('motorPickerChoices').scrollTop = 0;
      return;
    }
    const choice = event.target.closest('[data-motor-choice]');
    if (!choice || !overlay.contains(choice)) return;
    if (applyMotorPreset(choice.dataset.motorChoice)) {
      closeMotorPicker();
      change();
    }
  });
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMotorPicker();
      return;
    }
    if (event.key === 'Tab') {
      const nodes = Array.from(overlay.querySelectorAll('button:not([disabled])'))
        .filter(el => el.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
  }, true);
  normalizeMotorPresetSelection();
  refreshMotorPickerTrigger();
  updateMotorPresetNote();
}
