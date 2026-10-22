// Motor selection overlay. Reuses the material library's dialog, categories and choice card UI.
// Published stall/holding ratings are contextual only, NOT used as running torque.
'use strict';

const motorFamilies = [
  { key: 'micro', label: 'Micro servos', description: 'Compact positional RC servos for small linkages', symbol: '◉' },
  { key: 'standard', label: 'Standard servos', description: 'Larger positional RC servos for heavier linkages', symbol: '◈' },
  { key: 'stepper', label: 'Steppers', description: 'Continuous-angle steppers, driver-dependent torque', symbol: '⚙' }
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
  'nema17-48': { family: 'stepper', label: 'NEMA 17 · 48 mm', rating: '0.59 N·m holding (17HS19-2004S1)', motorNm: 0.25, motorRPM: 250, servoTravel: 360, note: 'Longer 2 A NEMA 17 example, not a guaranteed torque at 250 RPM.' }
};
let selectedMotorFamily = 'micro';
let motorPickerReturnFocus = null;
let motorPickerInitialized = false;
const motorKeys = ['motorNm', 'motorRPM', 'servoTravel'];
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
    ? preset.label + ': ' + preset.note +
      ' Preset RPM and motor torque are illustrative RUNNING estimates, not published load ratings. ' +
      'External reduction is reset to 1:1; existing joint hard stops are cleared for recalibration.'
    : 'Custom motor: running torque, usable RPM and angular travel remain fully editable. ' +
      'Use motor torque at speed, not a servo stall or stepper holding rating.';
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
    state.servoMargin = preset.family === 'stepper' ? 0 : 10;
    // The rated servo torque is measured at the horn, AFTER its internal gearbox.
    // 1:1 here means no ADDITIONAL external transmission.
    state.ratio = 1;
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
