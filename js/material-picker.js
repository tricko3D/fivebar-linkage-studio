// Manufacturing process + material overlay. No framework or network calls.
// All material parameters and identifiers continue to come from state.js.
'use strict';

let materialPickerInitialized = false;
let pickerMethod = 'fdm';
let materialPickerReturnFocus = null;

function materialMethodForState() {
  const known = manufacturingMethods.some(method => method.key === state.manufacturing);
  const fallback = manufacturingForMaterial(state.material);
  const chosen = known ? state.manufacturing : fallback;
  // A preset may belong to more than one process (e.g. machined or cut sheet).
  if (state.material !== 'custom' &&
      !materialMethodKeys[chosen]?.includes(state.material)) return fallback;
  return chosen;
}
function refreshMaterialPickerTrigger() {
  const process = manufacturingMethods.find(method => method.key === materialMethodForState());
  const label = materialPresets[state.material]?.label || 'Custom values';
  const methodLabel = process?.label || 'FDM / FFF';
  const processNode = $('materialProcessLabel');
  const materialNode = $('materialChoiceLabel');
  const trigger = $('materialPickerTrigger');
  if (processNode) processNode.textContent = methodLabel;
  if (materialNode) materialNode.textContent = label;
  if (trigger) trigger.setAttribute('aria-label',
    'Change material. ' + methodLabel + ', ' + label);
}
function renderManufacturingChoices() {
  const method = manufacturingMethods.find(entry => entry.key === pickerMethod);
  const methodList = $('materialProcessOptions');
  const materialList = $('materialPickerChoices');
  methodList.replaceChildren();
  materialList.replaceChildren();
  $('materialPickerProcessName').textContent = method.label;
  $('materialPickerProcessHelp').textContent = method.description;

  for (const entry of manufacturingMethods) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'materialProcessOption' +
      (entry.key === pickerMethod ? ' is-active' : '');
    button.dataset.manufacturing = entry.key;
    button.setAttribute('aria-pressed', String(entry.key === pickerMethod));
    const icon = document.createElement('span');
    icon.className = 'materialProcessGlyph';
    // Visual glyphs are decorative; text names provide accessible labels.
    icon.textContent = ({
      fdm:'▤', sls:'◈', sla:'◐', mjf:'⬡', cnc:'⚙', sheet:'▱', lpbf:'✦'
    })[entry.key] || '◆';
    icon.setAttribute('aria-hidden','true');
    const copy = document.createElement('span');
    copy.className = 'materialProcessOptionText';
    const name = document.createElement('strong');
    name.textContent = entry.label;
    const description = document.createElement('small');
    description.textContent = entry.description;
    copy.append(name,description);
    const count = document.createElement('span');
    count.className = 'materialProcessOptionCount';
    count.textContent = String(materialOptionsForMethod(entry.key).length);
    button.append(icon,copy,count);
    methodList.append(button);
  }

  const term = $('materialPickerSearch').value.trim().toLocaleLowerCase();
  const items = materialOptionsForMethod(pickerMethod).filter(item =>
    !term || (item.label + ' ' + item.note).toLocaleLowerCase().includes(term));
  $('materialPickerCount').textContent = items.length + ' materials';
  for (const item of items) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.materialChoice = item.key;
    button.className = 'materialPickerChoice' +
      (state.material === item.key && materialMethodForState() === pickerMethod
       ? ' is-selected' : '');
    button.setAttribute('aria-pressed', String(
      state.material === item.key && materialMethodForState() === pickerMethod));
    const head = document.createElement('span');
    head.className = 'materialPickerChoiceTitle';
    const title = document.createElement('strong');
    title.textContent = item.label;
    const mark = document.createElement('span');
    mark.textContent = '✓';
    mark.setAttribute('aria-hidden','true');
    mark.className = 'materialChoiceCheck';
    head.append(title,mark);
    const metrics = document.createElement('span');
    metrics.className = 'materialPickerChoiceMetrics';
    metrics.textContent =
      'E ' + (item.youngMPa / 1000).toLocaleString('en-US', {maximumFractionDigits:2}) +
      ' GPa   ·   ρ ' + item.density + ' g/cm³';
    const note = document.createElement('span');
    note.className = 'materialPickerChoiceNote';
    note.textContent = item.note;
    button.append(head,metrics,note);
    materialList.append(button);
  }
  // Custom values are possible under any process, without overwriting inputs.
  if (!term || 'custom values manual'.includes(term)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'materialPickerChoice materialPickerCustom' +
      (state.material === 'custom' && materialMethodForState() === pickerMethod
        ? ' is-selected' : '');
    button.dataset.materialChoice = 'custom';
    button.setAttribute('aria-pressed', String(
      state.material === 'custom' && materialMethodForState() === pickerMethod));
    const title = document.createElement('strong');
    title.textContent = 'Custom values';
    const note = document.createElement('span');
    note.className = 'materialPickerChoiceNote';
    note.textContent = 'Keep the existing modulus, density and strength thresholds.';
    button.append(title,note);
    materialList.append(button);
  }
  if (!items.length && term && !('custom values manual'.includes(term))) {
    const empty = document.createElement('p');
    empty.className = 'materialPickerEmpty';
    empty.textContent = 'No materials match this search within ' + method.label + '.';
    materialList.append(empty);
  }
}
function closeMaterialPicker() {
  const overlay = $('materialPickerOverlay');
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
  document.body.classList.remove('materialPickerOpen');
  $('materialPickerTrigger').setAttribute('aria-expanded', 'false');
  materialPickerReturnFocus?.focus();
  materialPickerReturnFocus = null;
}
function openMaterialPicker() {
  const overlay = $('materialPickerOverlay');
  if (!overlay || !overlay.hidden) return;
  materialPickerReturnFocus = document.activeElement;
  pickerMethod = materialMethodForState();
  $('materialPickerSearch').value = '';
  overlay.hidden = false;
  document.body.classList.add('materialPickerOpen');
  $('materialPickerTrigger').setAttribute('aria-expanded', 'true');
  renderManufacturingChoices();
  // Focus the process chooser: the user can select process or Tab to search.
  $('materialPickerSearch').focus();
}
function initMaterialPicker() {
  if (materialPickerInitialized) return;
  materialPickerInitialized = true;
  const overlay = $('materialPickerOverlay');
  $('materialPickerTrigger').addEventListener('click', openMaterialPicker);
  $('materialPickerClose').addEventListener('click', closeMaterialPicker);
  overlay.addEventListener('click', event => {
    if (event.target.closest('[data-picker-close]')) {
      closeMaterialPicker();
      return;
    }
    const process = event.target.closest('[data-manufacturing]');
    if (process && overlay.contains(process)) {
      pickerMethod = process.dataset.manufacturing;
      $('materialPickerSearch').value = '';
      renderManufacturingChoices();
      $('materialPickerChoices').scrollTop = 0;
      return;
    }
    const choice = event.target.closest('[data-material-choice]');
    if (!choice || !overlay.contains(choice)) return;
    const key = choice.dataset.materialChoice;
    if (key !== 'custom' && !materialMethodKeys[pickerMethod].includes(key)) return;
    state.manufacturing = pickerMethod;
    state.material = key;
    $('material').value = key;
    applyMaterialPreset(key);
    updateMaterialPresetNote();
    closeMaterialPicker();
    change();
  });
  $('materialPickerSearch').addEventListener('input',renderManufacturingChoices);
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeMaterialPicker();
      return;
    }
    // Trap keyboard focus inside the modal while preserving native Tab order.
    if (event.key === 'Tab') {
      const nodes = Array.from(overlay.querySelectorAll('button:not([disabled]), input:not([disabled])'))
        .filter(element => element.getClientRects().length > 0);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();first?.focus();
      }
    }
  }, true);
  refreshMaterialPickerTrigger();
}
