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
function setupMaterialOptions() {
  const select = $('material');
  select.replaceChildren();
  for (const group of materialGroups) {
    const options = document.createElement('optgroup');
    options.label = group.label;
    for (const preset of group.items) {
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
  if (!materialPresets[state.material] && state.material !== 'custom')
    state.material = 'custom'; // preserve numeric values from obsolete JSON files
  select.value = state.material;
  state.manufacturing = manufacturingMethods.some(method => method.key === state.manufacturing)
    && (state.material === 'custom' ||
        materialMethodKeys[state.manufacturing].includes(state.material))
    ? state.manufacturing : manufacturingForMaterial(state.material);
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

function persist() {
  try {
    localStorage.setItem('fivebar-linkage-studio-v1', JSON.stringify(state));
  } catch (e) {}
}
function change(recalc = true) {
  if (typeof refreshMaterialPickerTrigger === 'function') refreshMaterialPickerTrigger();
  stopRoute();
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
  state[key] = defaults[key];
  $(key).value = String(defaults[key]);
  const msg = $('jointStopSetStatus');
  if (msg) {
    msg.textContent = (key.includes('left') ? 'M₁' : 'M₂') + ' ' +
      (key.includes('Min') ? 'MIN' : 'MAX') + ' reset to ' + defaults[key] + '°.';
    msg.dataset.state = 'success';
  }
  change();
  return true;
}
function resetAllJointStops() {
  for (const key of ['leftMinAngle','leftMaxAngle','rightMinAngle','rightMaxAngle']) {
    state[key] = defaults[key];
    $(key).value = String(defaults[key]);
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
      if (['youngMPa', 'density', 'stressLimit', 'stiffFactor'].includes(key) &&
          state.material !== 'custom') {
        state.material = 'custom';
        $('material').value = 'custom';
        updateMaterialPresetNote();
      }
      change(!['showCoverage', 'showCenters', 'showRings', 'showServoArcs'].includes(key));
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
  $('exportButton').onclick = () =>
    download(
      'fivebar-chess-config.json',
      JSON.stringify({ schema: 'fivebar-chess-v3', ...state }, null, 2),
      'application/json',
    );
  $('svgButton').onclick = () => {
    const copy = svg.cloneNode(true);
    copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    copy.setAttribute('width', '1200');
    copy.setAttribute('height', '950');
    download(
      'fivebar-chessboard.svg',
      new XMLSerializer().serializeToString(copy),
      'image/svg+xml',
    );
  };
  $('routePlay').onclick = toggleRoutePlay;
  $('routeReset').onclick = () => {
    stopRoute();
    setRouteCursor(0);
  };
  $('routeScrub').addEventListener('input', () => {
    stopRoute();
    setRouteCursor(Number($('routeScrub').value) / 1000);
  });
  $('reportButton').onclick = downloadAuditMarkdown;
  $('swVariablesButton').onclick = downloadSolidWorksVariables;
  $('importButton').onclick = () => $('importFile').click();
  $('importFile').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const newState = { ...defaults };
      for (const key of Object.keys(defaults)) {
        if (
          typeof parsed[key] === typeof defaults[key] &&
          (!['number'].includes(typeof parsed[key]) || Number.isFinite(parsed[key]))
        )
          newState[key] = parsed[key];
      }
      state = newState;
      // Older JSON configurations did not have a manufacturing process field.
      if (!Object.prototype.hasOwnProperty.call(parsed, 'manufacturing') ||
          !materialMethodKeys[state.manufacturing]?.includes(state.material) &&
          state.material !== 'custom')
        state.manufacturing = manufacturingForMaterial(state.material);
      state.outerW = Math.max(state.boardW, state.outerW);
      state.outerH = Math.max(state.boardH, state.outerH);
      writeControls();
      change();
    } catch (e) {
      alert('Invalid configuration JSON.');
    }
    e.target.value = '';
  };
}
