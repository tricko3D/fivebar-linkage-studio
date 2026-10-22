// Inputs, presets, JSON settings and local persistence.
// Files run in the order specified in index.html; they share the application state.
'use strict';

// Chess-square input is separate from physical X/Y coordinates.
function isChessSquare(v) { return /^[A-H][1-8]$/.test(v); }
function sanitizeSquareText(v) {
 const raw=String(v||'').trim().toUpperCase();
 if(!/^[A-H]/.test(raw)) return '';
 const rank=raw.slice(1).replace(/[^1-8]/g,'')[0]||'';
 return raw[0]+rank;
}
// Single source of truth: dropdown groups, presets and exported material codes
// are all derived from materialGroups/materialPresets declared in state.js.
// Keep property values from legacy/removed choices instead of silently
// replacing them with a different material's assumptions.
function normalizeMaterialSelection() {
  if (!availablePickerMaterial(state.material) && state.material !== 'custom')
    state.material = 'custom';
  if (!manufacturingMethods.some(method => method.key === state.manufacturing)) {
    const legacy = { mjf: 'sls', sheet: 'cnc', lpbf: 'cnc' };
    state.manufacturing = legacy[state.manufacturing] || manufacturingForMaterial(state.material);
  }
  if (state.material !== 'custom' &&
      !materialMethodKeys[state.manufacturing].includes(state.material))
    state.manufacturing = manufacturingForMaterial(state.material);
}
function setupMaterialOptions() {
  // Internal hidden select still supports config/state binding; only the curated
  // processes and material choices are included.
  const select = $('material');
  select.replaceChildren();
  for (const method of manufacturingMethods) {
    const options = document.createElement('optgroup');
    options.label = method.label;
    for (const preset of materialOptionsForMethod(method.key)) {
      const option = document.createElement('option');
      option.value = preset.key;
      option.textContent = preset.label;
      options.appendChild(option);
    }
    select.appendChild(options);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Custom values';
  select.appendChild(custom);
  normalizeMaterialSelection();
  select.value = state.material;
  updateMaterialPresetNote();
}
function updateMaterialPresetNote() {
  const info = $('materialPresetNote');
  if (!info) return;
  const preset = materialPresets[state.material];
  info.textContent = preset
    ? preset.label + ': ' + preset.note +
      ' Numbers are approximate, room-temperature screening inputs, not certified design limits.'
    : 'Custom values: edit modulus, density, effective stiffness factor and allowable bending stress. Validate against actual datasheets and tests.';
}
function applyMaterialPreset(key) {
  const preset = materialPresets[key];
  if (!preset) {
    updateMaterialPresetNote();
    return false;
  }
  for (const property of ['youngMPa', 'density', 'stressLimit', 'stiffFactor']) {
    state[property] = preset[property];
    $(property).value = String(preset[property]);
  }
  updateMaterialPresetNote();
  return true;
}

function buildConfigurationJson() {
  return JSON.stringify({ schema:'fivebar-chess-v3', ...state }, null, 2);
}
function buildWorkspaceSvg() {
  const drawing = svg.cloneNode(true);
  drawing.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  drawing.setAttribute('width', '1200');
  drawing.setAttribute('height', '950');
  return new XMLSerializer().serializeToString(drawing);
}
// Same validation and migration path for uploaded JSON and pasted text.
function importConfigurationJson(source) {
  // Import either raw JSON or a deterministic /#c= /r/#c= permalink.
  const input=source.trim();
  const parsed=/^https?:\/\//i.test(input) ? shareStateFromLink(input) : JSON.parse(input);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Error('Expected a JSON object containing studio settings.');
  const keys = Object.keys(defaults);
  if (!keys.some(key => Object.prototype.hasOwnProperty.call(parsed, key)))
    throw new Error('No recognized Fivebar Studio configuration fields found.');
  const updated = { ...defaults };
  for (const key of keys) {
    if (typeof parsed[key] !== typeof defaults[key]) continue;
    if (typeof parsed[key] === 'number' && !Number.isFinite(parsed[key])) continue;
    updated[key] = parsed[key];
  }
  migrateLegacyMotorConfiguration(parsed, updated);
  state = updated;
  normalizeMaterialSelection();
  normalizeMotorPresetSelection();
  state.outerW = Math.max(state.boardW, state.outerW);
  state.outerH = Math.max(state.boardH, state.outerH);
  writeControls();
  change();
  return true;
}

function persist() {
  try {
    localStorage.setItem('fivebar-linkage-studio-v1', JSON.stringify(state));
  } catch (e) {}
}
function change(recalc = true) {
  if (typeof refreshMaterialPickerTrigger === 'function') refreshMaterialPickerTrigger();
  if (typeof refreshMotorPickerTrigger === 'function') refreshMotorPickerTrigger();
  stopRoute();
  if (typeof shareSyncUrl === 'function') shareSyncUrl();
  updateBoardReadout();
  updateTransmissionReadout();
  rebuildRoute();
  render(recalc);
  if (typeof refreshMountPicker === 'function') refreshMountPicker();
  persist();
}
// Use current output-joint angles to place hard stops without canvas controls.
function captureJointStop(key) {
  const targets = {
    leftMinAngle: ['angleL', 'Left M₁ minimum'],
    leftMaxAngle: ['angleL', 'Left M₁ maximum'],
    rightMinAngle: ['angleR', 'Right M₂ minimum'],
    rightMaxAngle: ['angleR', 'Right M₂ maximum'],
  };
  const target = targets[key];
  if (!target) return false;
  const message = $('jointStopSetStatus');
  // Capture the pose even if it is outside the previously set hard-stop range.
  const solution = calc(vec(state.targetX, state.targetY), {
    ...state,
    useJointLimits: false,
  });
  if (!solution.valid || !Number.isFinite(solution[target[0]])) {
    if (message) {
      message.textContent = 'Move the gripper to a reachable position before setting a stop.';
      message.dataset.state = 'error';
    }
    return false;
  }
  const angle = Math.round(solution[target[0]] * 10) / 10;
  state[key] = angle;
  state.useJointLimits = true;
  $(key).value = String(angle);
  $('useJointLimits').checked = true;
  if (message) {
    message.textContent = target[1] + ' set to ' + angle.toFixed(1) + '°.';
    message.dataset.state = 'success';
  }
  change();
  return true;
}
function resetJointStop(key) {
  if (!['leftMinAngle','leftMaxAngle','rightMinAngle','rightMaxAngle'].includes(key)) return false;
  // A per-stop reset clears that boundary, regardless of the project's
  // preset: MIN=0°, MAX=360°. Header Reset restores the saved baseline.
  const cleared = key.includes('Min') ? 0 : 360;
  state[key] = cleared;
  $(key).value = String(cleared);
  const msg = $('jointStopSetStatus');
  if (msg) {
    msg.textContent = (key.includes('left') ? 'M₁' : 'M₂') + ' ' +
      (key.includes('Min') ? 'MIN' : 'MAX') + ' cleared to ' + cleared + '°.';
    msg.dataset.state = 'success';
  }
  change();
  return true;
}
function resetAllJointStops() {
  // Clear physical boundaries even when the baseline preset includes limits.
  for (const key of ['leftMinAngle','leftMaxAngle','rightMinAngle','rightMaxAngle']) {
    const cleared = key.includes('Min') ? 0 : 360;
    state[key] = cleared;
    $(key).value = String(cleared);
  }
  state.useJointLimits = false;
  $('useJointLimits').checked = false;
  const msg = $('jointStopSetStatus');
  if (msg) {
    msg.textContent = 'Both joints reset to 0°–360°; hard stops disabled.';
    msg.dataset.state = 'success';
  }
  change();
}
function initControls() {
  $('resizeButton').addEventListener('click', () => setResizeMode(!resizeMode));
  document.querySelectorAll('[data-joint-stop]').forEach(button => {
    button.addEventListener('click', () => captureJointStop(button.dataset.jointStop));
  });
  document.querySelectorAll('[data-reset-stop]').forEach(button => {
    button.addEventListener('click', () => resetJointStop(button.dataset.resetStop));
  });
  $('resetJointLimits').addEventListener('click', resetAllJointStops);
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const handle = () => {
      if (key === 'routeFrom' || key === 'routeTo') {
        const cleaned = sanitizeSquareText(el.value);
        if (el.value !== cleaned) el.value = cleaned;
        if (!isChessSquare(cleaned) || state[key] === cleaned) return;
        state[key] = cleaned;
        change(false);
        return;
      }
      if (el.type === 'checkbox') state[key] = el.checked;
      else if (el.tagName === 'SELECT') state[key] = el.value;
      else {
        const n = parseFloat(el.value);
        if (!Number.isFinite(n)) return;
        const min = Number(el.min),
          max = Number(el.max);
        if ((el.hasAttribute('min') && n < min) || (el.hasAttribute('max') && n > max)) return;
        state[key] = n;
      }
      if (key === 'boardW' || key === 'boardH' || key === 'outerW' || key === 'outerH') {
        if (key === 'boardW' && state.boardW > state.outerW) state.outerW = state.boardW;
        if (key === 'boardH' && state.boardH > state.outerH) state.outerH = state.boardH;
        if (key === 'outerW' && state.outerW < state.boardW) state.outerW = state.boardW;
        if (key === 'outerH' && state.outerH < state.boardH) state.outerH = state.boardH;
        state.targetX = Math.min(Math.max(state.targetX, 0), state.boardW);
        state.targetY = Math.min(Math.max(state.targetY, 0), state.boardH);
        for (const other of ['boardW', 'boardH', 'outerW', 'outerH']) $(other).value = state[other];
      }
      if (key === 'toolMode') updateToolSettings();
      if (key === 'material') {
        state.manufacturing = manufacturingForMaterial(state.material, state.manufacturing);
        applyMaterialPreset(state.material);
      }
      if (['motorNm', 'motorRPM', 'servoTravel'].includes(key) && state.motorPreset !== 'custom') {
        state.motorPreset = 'custom';
        updateMotorPresetNote();
      }
      if (['youngMPa', 'density', 'stressLimit', 'stiffFactor'].includes(key) &&
          state.material !== 'custom') {
        state.material = 'custom';
        $('material').value = 'custom';
        updateMaterialPresetNote();
      }
      change(!['showCoverage', 'showCenters', 'showRings', 'showDimensions', 'showServoArcs'].includes(key));
    };
    // Native selects fire both input and change; applying a material preset
    // twice needlessly rebuilds the full mechanical heatmap.
    if (key !== 'material') el.addEventListener('input', handle);
    el.addEventListener('change', handle);
    if (key === 'routeFrom' || key === 'routeTo')
      el.addEventListener('blur', () => { el.value = state[key]; });
  });
  document.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = 40,
        bounds = boardBounds();
      const left = bounds.x - d, right = bounds.x + bounds.w + d;
      const top = bounds.y - d, bottom = bounds.y + bounds.h + d;
      const midX = state.boardW / 2, midY = state.boardH / 2;
      const presets = {
        TL: [left,top,90], TC:[midX,top,0],TR:[right,top,90],
        ML:[left,midY,90],MR:[right,midY,90],
        BL:[left,bottom,90],BC:[midX,bottom,-180],BR:[right,bottom,90],
      };
      if (!presets[b.dataset.preset]) return;
      [state.mountX,state.mountY,state.angle] = presets[b.dataset.preset];
      writeControls();
      change();
    }),
  );
  // Use short A1-H8 fields instead of native 64-option menus.
  for (const key of ['routeFrom', 'routeTo']) $(key).value = state[key];
  const squareControl = $('squareSelect');
  squareControl.addEventListener('input', () => {
    const cleaned = sanitizeSquareText(squareControl.value);
    squareControl.value = cleaned;
    if (!isChessSquare(cleaned)) return;
    const col = fileLetters.indexOf(cleaned[0]), row = 8 - Number(cleaned[1]);
    const G = squarePos(col, row);
    state.targetX = G.x; state.targetY = G.y;
    change(false);
  });
  squareControl.addEventListener('blur', () => {
    if (isChessSquare(squareControl.value)) return;
    const col = Math.floor(state.targetX / (state.boardW / 8));
    const row = Math.floor(state.targetY / (state.boardH / 8));
    squareControl.value = col >= 0 && col < 8 && row >= 0 && row < 8
      ? squareName(col, row) : '';
  });
  $('centreTarget').onclick = () => {
    state.targetX = state.boardW / 2;
    state.targetY = state.boardH / 2;
    change(false);
  };
  $('resetButton').onclick = () => {
    state = { ...defaults };
    setResizeMode(false);
    writeControls();
    change();
  };
  $('svgButton').onclick = () =>
    download('fivebar-chessboard.svg',buildWorkspaceSvg(),'image/svg+xml');
  $('routePlay').onclick = toggleRoutePlay;
  $('routeReset').onclick = () => {
    stopRoute();
    setRouteCursor(0);
  };
  $('routeScrub').addEventListener('input', () => {
    stopRoute();
    setRouteCursor(Number($('routeScrub').value) / 1000);
  });
  $('importFile').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      importConfigurationJson(await file.text());
      if (typeof fileHubImported === 'function') fileHubImported(file.name);
    } catch (error) {
      if (typeof fileHubStatus === 'function') fileHubStatus(error.message, true);
      else alert('Invalid configuration: ' + error.message);
    }
    event.target.value = '';
  };
}
