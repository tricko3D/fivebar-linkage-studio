// Inputs, presets, JSON settings and local persistence.
// Files run in the order specified in index.html; they share the application state.
'use strict';

function persist() {
  try {
    localStorage.setItem('fivebar-linkage-studio-v1', JSON.stringify(state));
  } catch (e) {}
}
function change(recalc = true) {
  stopRoute();
  updateBoardReadout();
  updateTransmissionReadout();
  rebuildRoute();
  render(recalc);
  persist();
}
function initControls() {
  $('resizeButton').addEventListener('click', () => setResizeMode(!resizeMode));
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    const handle = () => {
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
        if (state.material === 'pla') {
          state.youngMPa = 2500;
          state.density = 1.24;
          state.stressLimit = 12;
        } else if (state.material === 'petg') {
          state.youngMPa = 1900;
          state.density = 1.27;
          state.stressLimit = 10;
        }
        for (const k of ['youngMPa', 'density', 'stressLimit']) $(k).value = state[k];
      }
      if (['youngMPa', 'density', 'stressLimit'].includes(key) && state.material !== 'custom') {
        state.material = 'custom';
        $('material').value = 'custom';
      }
      change(!['showCoverage', 'showCenters', 'showRings', 'showServoArcs'].includes(key));
    };
    el.addEventListener('input', handle);
    el.addEventListener('change', handle);
  });
  document.querySelectorAll('[data-preset]').forEach((b) =>
    b.addEventListener('click', () => {
      const d = 40,
        bounds = boardBounds();
      switch (b.dataset.preset) {
        case 'TL':
          state.mountX = bounds.x - d;
          state.mountY = bounds.y;
          state.angle = 90;
          break;
        case 'TR':
          state.mountX = bounds.x + bounds.w + d;
          state.mountY = bounds.y;
          state.angle = 90;
          break;
        case 'BL':
          state.mountX = bounds.x - d;
          state.mountY = bounds.y + bounds.h;
          state.angle = 90;
          break;
        case 'BR':
          state.mountX = bounds.x + bounds.w + d;
          state.mountY = bounds.y + bounds.h;
          state.angle = 90;
          break;
        case 'EDGE':
          state.mountX = state.boardW / 2;
          state.mountY = bounds.y - d;
          state.angle = 0;
          break;
      }
      writeControls();
      change();
    }),
  );
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const o = document.createElement('option');
      o.value = squareName(col, row);
      o.textContent = o.value;
      $('squareSelect').appendChild(o);
      for (const id of ['routeFrom', 'routeTo']) {
        const opt = o.cloneNode(true);
        $(id).appendChild(opt);
      }
    }
  $('routeFrom').value = state.routeFrom;
  $('routeTo').value = state.routeTo;
  $('squareSelect').addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;
    const col = fileLetters.indexOf(val[0]),
      row = 8 - parseInt(val.slice(1), 10);
    const G = squarePos(col, row);
    state.targetX = G.x;
    state.targetY = G.y;
    change(false);
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
  $('reportButton').onclick = downloadAuditText;
  $('sideReportButton').onclick = downloadAuditText;
  $('printButton').onclick = openPrintableAudit;
  $('sidePrintButton').onclick = openPrintableAudit;
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
