// Interactive SVG chessboard and linkage rendering.
// Files run in the order specified in index.html; they share the application state.
'use strict';

function svgArc(center, r, start, span, col) {
  if (span < 0.001) return '';
  if (span >= 359.999)
    return `<circle cx="${center.x}" cy="${center.y}" r="${r}" fill="none" stroke="${col}" stroke-width="3" opacity=".9" stroke-dasharray="6 3" pointer-events="none"/>`;
  const st = start * RAD,
    en = (start + span) * RAD;
  const a = vec(center.x + r * Math.cos(st), center.y + r * Math.sin(st)),
    b = vec(center.x + r * Math.cos(en), center.y + r * Math.sin(en));
  return `<path d="M ${a.x} ${a.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${b.x} ${b.y}" fill="none" stroke="${col}" stroke-width="3.6" opacity=".95" stroke-linecap="round" pointer-events="none"/>`;
}
// Show the actual output-shaft angles of user-defined mechanical stop boundaries.
// Works independently of servo-travel overlays and shows a faded preview when
// enforcement is disabled. An unrestricted 360° range has no physical endpoints.
function svgJointStopGuides(config, motorPivots) {
  let marks = '';
  for (const [joint, motor, pivot, min, max] of [
    ['left', 'M₁', motorPivots.A, config.leftMinAngle, config.leftMaxAngle],
    ['right', 'M₂', motorPivots.B, config.rightMinAngle, config.rightMaxAngle],
  ]) {
    const sweep = hardStopSweep(min, max);
    if (sweep >= 359.999) continue;
    const near = sweep < 18 || sweep > 342;
    marks += `<g opacity="${config.useJointLimits ? 1 : 0.55}" pointer-events="none">`;
    if (sweep > 0.001)
      marks += svgArc(pivot, 42, min, sweep, '#d6a476');
    for (const [type, angle, color] of [
      ['MIN', min, '#1593a7'],
      ['MAX', max, '#cb7620'],
    ]) {
      const t = angle * RAD, ux = Math.cos(t), uy = Math.sin(t);
      // Separate the markers when both limits point in nearly the same direction.
      const far = near && type === 'MAX';
      const radius = far ? 59 : 42;
      const a = vec(pivot.x + (radius - 9) * ux, pivot.y + (radius - 9) * uy);
      const b = vec(pivot.x + (radius + 9) * ux, pivot.y + (radius + 9) * uy);
      marks += svgLine(a, b, color, 3.5,
        `data-joint-stop-boundary="${joint}-${type.toLowerCase()}" pointer-events="none"`);
      marks += svgCircle(b, 3.8, color, '#fff', 1.2, 'pointer-events="none"');
      const labelR = far ? 95 : 69;
      const side = type === 'MIN' ? -9 : 9;
      marks += txt(vec(
        pivot.x + labelR * ux - side * uy,
        pivot.y + labelR * uy + side * ux
      ), motor + ' ' + type, 10, color,
      'font-weight="800" text-anchor="middle" dominant-baseline="central" ' +
      'stroke="#fff" stroke-width="3" stroke-linejoin="round" paint-order="stroke" pointer-events="none"');
    }
    marks += '</g>';
  }
  return marks;
}

function color(cell) {
  if (cell.hits === 0) return '#e16e7a';
  if (cell.hits === 9) return '#48d3a5';
  return '#f0b660';
}
function svgCircle(p, r, fill, stroke = '', sw = 1, extra = '') {
  return `<circle cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="${stroke || 'none'}" stroke-width="${sw}" ${extra}/>`;
}
function svgLine(a, b, color, width = 4, extra = '') {
  return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${color}" stroke-width="${width}" stroke-linecap="round" ${extra}/>`;
}
function txt(p, s, size = 12, color = '#c1d3df', extra = '') {
  return `<text x="${p.x}" y="${p.y}" fill="${color}" font-size="${size}" font-family="system-ui,sans-serif" ${extra}>${s}</text>`;
}
function boardBounds(s = state) {
  const padX = (s.outerW - s.boardW) / 2,
    padY = (s.outerH - s.boardH) / 2;
  return { x: -padX, y: -padY, w: s.outerW, h: s.outerH, padX, padY };
}
function sceneViewport(sol) {
  const { A, B, M, rot } = pivots(state);
  const b = boardBounds();
  let pts = [
    vec(b.x, b.y),
    vec(b.x + b.w, b.y + b.h),
    vec(b.x + b.w, b.y),
    vec(b.x, b.y + b.h),
    A,
    B,
    M,
    rot,
  ];
  if (sol) {
    for (const k of ['EL', 'ER', 'P', 'G']) if (sol[k]) pts.push(sol[k]);
  }
  let xmin = Math.min(...pts.map((p) => p.x)),
    xmax = Math.max(...pts.map((p) => p.x)),
    ymin = Math.min(...pts.map((p) => p.y)),
    ymax = Math.max(...pts.map((p) => p.y));
  let pad = Math.max(60, Math.min(state.boardW, state.boardH) * 0.17);
  xmin -= pad;
  xmax += pad;
  ymin -= pad;
  ymax += pad;
  let w = xmax - xmin,
    h = ymax - ymin;
  const ratio = svg.clientWidth > 0 ? svg.clientWidth / (svg.clientHeight || 580) : 1;
  const cur = w / h;
  if (cur < ratio) {
    const newW = h * ratio;
    xmin -= (newW - w) / 2;
    w = newW;
  } else {
    const newH = w / ratio;
    ymin -= (newH - h) / 2;
    h = newH;
  }
  return { x: xmin, y: ymin, w, h };
}
function renderSvg() {
  const sol = calc(vec(state.targetX, state.targetY));
  lastSolution = sol;
  const p = pivots(state);
  if (!dragging && !routePlaying) {
    const base = sceneViewport(sol);
    if (typeof clampPan === 'function') clampPan(base);
    currentView = { ...base, x: base.x + panOffset.x, y: base.y + panOffset.y };
  }
  svg.setAttribute(
    'viewBox',
    `${currentView.x} ${currentView.y} ${currentView.w} ${currentView.h}`,
  );
  let out = '';
  // Background reference lines at 100mm spacing
  out += '<g pointer-events="none">';
  const stx = Math.floor(currentView.x / 100) * 100,
    endy = currentView.y + currentView.h,
    endx = currentView.x + currentView.w,
    sty = Math.floor(currentView.y / 100) * 100;
  for (let x = stx; x < endx; x += 100)
    out += svgLine(vec(x, currentView.y), vec(x, endy), '#314451', 0.5, 'opacity=".4"');
  for (let y = sty; y < endy; y += 100)
    out += svgLine(vec(currentView.x, y), vec(endx, y), '#314451', 0.5, 'opacity=".4"');
  out += '</g>';
  if (state.showRings) {
    out += '<g fill="none" pointer-events="none">';
    out += svgCircle(
      p.A,
      state.l1 + state.l2,
      'none',
      '#64bccc',
      1,
      'opacity=".35" stroke-dasharray="7 8"',
    );
    out += svgCircle(
      p.B,
      state.r1 + state.r2,
      'none',
      '#ae9ff1',
      1,
      'opacity=".35" stroke-dasharray="7 8"',
    );
    out += '</g>';
  }
  // Outer wooden top and centered playable area; playing coordinates remain at (0,0).
  const b = boardBounds();
  out += `<g id="outerBoard" pointer-events="none"><rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="2.5" fill="#8c634b" stroke="#c9a37a" stroke-width="2.2"/><rect x="${b.x + 3}" y="${b.y + 3}" width="${Math.max(0, b.w - 6)}" height="${Math.max(0, b.h - 6)}" fill="none" stroke="#d7b48a" stroke-width=".65" opacity=".8"/></g>`;
  // Chessboard
  out += `<g id="boardCells">`;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      let x = (col * state.boardW) / 8,
        y = (row * state.boardH) / 8,
        w = state.boardW / 8,
        h = state.boardH / 8;
      out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${(row + col) % 2 === 0 ? '#d9e2e7' : '#6c8393'}" stroke="#30465a" stroke-width=".65"/>`;
      const cell = lastMap.cells[row * 8 + col];
      if (state.showCoverage) {
        const mechanical = state.showMechanics && state.heatMode !== 'coverage';
        const fill = mechanical
          ? state.heatMode === 'servo'
            ? servoPass(calc(squarePos(col, row)), lastServoMap)
              ? '#48d3a5'
              : '#e16e7a'
            : mechColor(lastMechMap.cells[row * 8 + col])
          : color(cell);
        out += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="${mechanical ? 0.44 : cell.hits === 9 ? 0.25 : cell.hits === 0 ? 0.32 : 0.3}" pointer-events="none"/>`;
      }
      if (state.showCenters) {
        const q = squarePos(col, row);
        out += svgCircle(
          q,
          Math.max(2.3, Math.min(w, h) * 0.075),
          cell.center ? '#0e6d63' : '#913d49',
          '#f6f5ef',
          0.7,
          'opacity=".92" pointer-events="none"',
        );
      }
    }
  out += `<rect x="0" y="0" width="${state.boardW}" height="${state.boardH}" fill="none" stroke="#bed1da" stroke-width="2.4" pointer-events="none"/>`;
  for (let c = 0; c < 8; c++) {
    const z = squarePos(c, 7);
    out += txt(
      vec(z.x, state.boardH + 19),
      fileLetters[c],
      12,
      '#9db4c4',
      'text-anchor="middle" pointer-events="none"',
    );
  }
  for (let r = 0; r < 8; r++) {
    const z = squarePos(0, r);
    out += txt(
      vec(-13, z.y + 4),
      String(8 - r),
      12,
      '#9db4c4',
      'text-anchor="middle" pointer-events="none"',
    );
  }
  out += '</g>';
  // Optional trajectory markers, even while paused.
  if (routeData && routeData.valid) {
    const st = routeData.start,
      en = routeData.end;
    out += svgLine(
      st,
      en,
      '#f8d28e',
      2.6,
      'stroke-dasharray="6 7" opacity=".85" pointer-events="none"',
    );
    out += svgCircle(st, 5.5, '#2e885f', '#e9ffea', 1.5, 'pointer-events="none"');
    out += svgCircle(en, 5.5, '#bc8840', '#fff1c3', 1.5, 'pointer-events="none"');
    out += txt(
      vec(st.x + 10, st.y + 19),
      state.routeFrom,
      12,
      '#dbf8ca',
      'font-weight="700" pointer-events="none"',
    );
    out += txt(
      vec(en.x + 10, en.y + 19),
      state.routeTo,
      12,
      '#ffddad',
      'font-weight="700" pointer-events="none"',
    );
  }
  // Draw dashed target to base and motor supports
  out += svgLine(p.A, p.B, '#4d7488', 6, 'opacity=".85"');
  if (sol.P && sol.EL && sol.ER) {
    out += svgLine(p.A, sol.EL, '#56c9d1', 11, 'opacity=".18"');
    out += svgLine(sol.EL, sol.P, '#56c9d1', 11, 'opacity=".18"');
    out += svgLine(p.B, sol.ER, '#b4a4fa', 11, 'opacity=".18"');
    out += svgLine(sol.ER, sol.P, '#b4a4fa', 11, 'opacity=".18"');
    out += svgLine(p.A, sol.EL, '#66cfdd', 5);
    out += svgLine(sol.EL, sol.P, '#93edf0', 5);
    out += svgLine(p.B, sol.ER, '#b0a3fc', 5);
    out += svgLine(sol.ER, sol.P, '#d3baff', 5);
    if (dist(sol.P, sol.G) > 0.01) {
      out += svgLine(
        sol.P,
        sol.G,
        '#ffbb6d',
        4,
        state.toolMode === 'fixed' ? 'stroke-dasharray="6 6"' : '',
      );
    }
    out += svgCircle(sol.EL, 7, '#2a7588', '#d4f8f7', 2);
    out += svgCircle(sol.ER, 7, '#6554b3', '#eee7ff', 2);
    out += svgCircle(
      sol.P,
      resizeMode ? 14 : 8,
      resizeMode ? '#ffcf77' : '#d7dce5',
      '#273544',
      2.2,
      resizeMode ? 'data-handle="resize" class="resizehandle"' : '',
    );
    out += txt(vec(sol.EL.x + 12, sol.EL.y - 11), 'E₁', 12, '#b2f1f2');
    out += txt(vec(sol.ER.x + 12, sol.ER.y - 11), 'E₂', 12, '#d2c4ff');
    if (dist(sol.P, sol.G) > 3) out += txt(vec(sol.P.x + 12, sol.P.y - 11), 'P', 12, '#ebeff4');
  } else if (sol.EL && sol.P) {
    out += svgLine(p.A, sol.EL, '#66cfdd', 5);
    out += svgLine(sol.EL, sol.P, '#93edf0', 5);
    out += svgCircle(sol.P, 7, '#d8dce4', '#273544', 2);
  }
  // Physical stop positions are drawn at the pivots, regardless of servo overlay.
  out += svgJointStopGuides(state, p);
  if (state.showServoArcs && lastServoMap) {
    if (lastServoMap.leftWindow)
      out += svgArc(p.A, 28, lastServoMap.leftWindow.start, lastServoMap.usable, '#62d5e0');
    if (lastServoMap.rightWindow)
      out += svgArc(p.B, 28, lastServoMap.rightWindow.start, lastServoMap.usable, '#b9a4ff');
  }
  // Pivot controls and rotation handle
  out += svgLine(p.M, p.rot, '#76cbd3', 1.8, 'opacity=".65" stroke-dasharray="4 5"');
  out += svgCircle(p.A, 9, '#247d9a', '#d0ffff', 2, `data-handle="mount"`);
  out += svgCircle(p.B, 9, '#715bc1', '#eadcff', 2, `data-handle="mount"`);
  out += txt(vec(p.A.x - 12, p.A.y - 15), 'M₁', 12, '#abf4f6', 'text-anchor="middle"');
  out += txt(vec(p.B.x + 14, p.B.y - 15), 'M₂', 12, '#d6caff');
  out += svgCircle(p.M, 16, '#142d3c', '#71dee2', 2.2, 'data-handle="mount"');
  out += `<path d="M${p.M.x - 8} ${p.M.y}h16 M${p.M.x} ${p.M.y - 8}v16" stroke="#c1f3f6" stroke-width="2" pointer-events="none"/>`;
  out += svgCircle(
    p.rot,
    8,
    '#20384c',
    '#7fbbc8',
    2,
    'data-handle="rotate"',
  );
  out += txt(vec(p.rot.x + 12, p.rot.y - 9), 'rotate', 11, '#9dbfcc');
  // Positioning handle, or drag-to-resize handle while resize mode is enabled.
  const g = vec(state.targetX, state.targetY),
    good = sol.valid;
  if (resizeMode) {
    const handle = sol.P || g;
    out += svgCircle(
      handle,
      23,
      'none',
      '#ffca77',
      2.5,
      'stroke-dasharray="5 4" class="resizehandle" data-handle="resize"',
    );
    out += svgCircle(
      handle,
      11,
      '#fcca76',
      '#413323',
      2,
      'class="resizehandle" data-handle="resize"',
    );
    out += txt(
      vec(handle.x + 23, handle.y - 19),
      'RESIZE P',
      12,
      '#ffd9a4',
      'font-weight="800" pointer-events="none"',
    );
    if (dist(g, handle) > 2) {
      out += svgCircle(g, 7, good ? '#ffbb70' : '#fa7a80', '#382f2b', 2, 'pointer-events="none"');
      out += txt(vec(g.x + 14, g.y - 9), 'G', 12, '#ffcfab', 'pointer-events="none"');
    }
  } else {
    out += svgCircle(
      g,
      17,
      'none',
      good ? '#ffa94a' : '#fb737f',
      2,
      'opacity=".55" data-handle="target"',
    );
    out += svgCircle(
      g,
      9,
      good ? '#ffbb70' : '#fa7a80',
      '#382f2b',
      2,
      'data-handle="target"',
    );
    out += txt(
      vec(g.x + 15, g.y - 13),
      'G',
      13,
      good ? '#ffd3a4' : '#ffb0b7',
      'font-weight="800" pointer-events="none"',
    );
  }
  if (state.showDimensions) out += cadDimensions(state,sol,false);
  svg.innerHTML = out;
  return sol;
}
function calcCorners() {
  const out = [];
  for (const [col, row] of [
    [0, 7],
    [7, 7],
    [0, 0],
    [7, 0],
  ]) {
    const pos = squarePos(col, row);
    out.push({ name: squareName(col, row), ok: calc(pos).valid });
  }
  return out;
}
function updateStats() {
  const c = lastMap;
  $('centerStat').textContent = `${c.okCenters} / 64`;
  $('centerStat').style.color =
    c.okCenters === 64 ? '#70e0b9' : c.okCenters > 0 ? '#eac481' : '#fa858d';
  $('sampleStat').textContent = `${f(c.percentage)}%`;
  const M = pivots(state).M;
  let far = 0;
  for (const [col, row] of [
    [0, 0],
    [0, 7],
    [7, 0],
    [7, 7],
  ])
    far = Math.max(far, dist(M, squarePos(col, row)));
  $('farStat').textContent = `${Math.round(far)} mm`;
  $('corners').innerHTML = calcCorners()
    .map(
      (item) =>
        `<div class="datarow"><span>${item.name}</span><b style="color:${item.ok ? '#61ddb0' : '#fb8f93'}">${item.ok ? 'Reachable' : 'Unreachable'}</b></div>`,
    )
    .join('');
}
function updateInspector(sol) {
  $('outX').textContent = `${f(state.targetX)} mm`;
  $('outY').textContent = `${f(state.targetY)} mm`;
  $('outP').textContent = sol.P ? `${f(sol.P.x)}, ${f(sol.P.y)}` : '—';
  $('outLA').textContent = sol.valid ? `${f(sol.angleL)}°` : '—';
  $('outRA').textContent = sol.valid ? `${f(sol.angleR)}°` : '—';
  $('outMargin').textContent = sol.valid ? `${f(sol.margin * 100)}%` : '—';
  $('positionStatus').innerHTML =
    `<i class="dot ${sol.valid ? '' : 'bad'}"></i><span>${sol.valid ? 'Reachable' : 'Unreachable'}</span>`;
  $('positionReason').textContent = sol.valid
    ? sol.warning || 'Gripper position is kinematically feasible in the selected assembly branch.'
    : sol.reason || 'No IK solution.';
  const col = Math.floor(state.targetX / (state.boardW / 8)),
    row = Math.floor(state.targetY / (state.boardH / 8));
  $('squareSelect').value = col >= 0 && col < 8 && row >= 0 && row < 8 ? squareName(col, row) : '';
}
function render(recalc = true) {
  if (recalc || !lastMap) {
    lastMap = sampleCoverage();
    lastServoMap = servoAnalysis(lastMap);
    lastMechMap = mechanicalCoverage();
    updateStats();
  }
  const sol = renderSvg();
  updateInspector(sol);
  servoReadout(sol);
  // Show live absolute angles even when a configured hard stop rejects the pose.
  const readable = Number.isFinite(sol.angleL) && Number.isFinite(sol.angleR)
    ? sol : calc(vec(state.targetX, state.targetY), { ...state, useJointLimits: false });
  const la = $('currentLeftJointAngle'), ra = $('currentRightJointAngle');
  if (la) la.textContent = Number.isFinite(readable.angleL) ? readable.angleL.toFixed(1) + '°' : '—';
  if (ra) ra.textContent = Number.isFinite(readable.angleR) ? readable.angleR.toFixed(1) + '°' : '—';
  updateMechanicalInspector(sol);
  if (typeof updateCanvasScale === 'function') updateCanvasScale();
}
function writeControls() {
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (el.type === 'checkbox') el.checked = Boolean(state[key]);
    else el.value = state[key];
  });
  updateToolSettings();
  updateBoardReadout();
  if (typeof refreshMotorPickerTrigger === 'function') refreshMotorPickerTrigger();
  if (typeof updateMotorPresetNote === 'function') updateMotorPresetNote();
}
function updateBoardReadout() {
  for (const k of ['l1', 'l2', 'r1', 'r2']) {
    $('live' + k.toUpperCase()).textContent = state[k].toFixed(2);
  }
  const p = boardBounds();
  $('playingSize').textContent = `${f(state.boardW)} × ${f(state.boardH)} mm`;
  $('outerSize').textContent = `${f(state.outerW)} × ${f(state.outerH)} mm`;
  $('paddingSize').textContent = `${f(p.padX)} mm left/right · ${f(p.padY)} mm top/bottom`;
}
function setResizeMode(enabled) {
  resizeMode = enabled;
  $('resizeButton').classList.toggle('is-on', enabled);
  $('resizeButton').setAttribute('aria-pressed', String(enabled));
  $('resizeButton').querySelector('span').textContent = 'Dynamic Resize Links';
  $('resizeButton').setAttribute('aria-label', enabled ? 'Disable Dynamic Resize Links' : 'Enable Dynamic Resize Links');
  $('resizeHint').textContent = enabled
    ? 'Drag joint P to scale all four bars; motor positions stay fixed.'
    : 'Turn on, then drag the common joint P.';
  render(false);
}
function scaledTargetFromJoint(P, trial) {
  if (trial.toolMode === 'fixed') return add(P, vec(trial.offsetX, trial.offsetY));
  if (trial.toolMode === 'joint') return P;
  const pv = pivots(trial);
  const sign =
      trial.toolMode === 'left'
        ? trial.branch[0] === '+'
          ? 1
          : -1
        : trial.branch[1] === '+'
          ? 1
          : -1,
    left = trial.toolMode === 'left';
  const E = elbowPoint(
    left ? pv.A : pv.B,
    P,
    left ? trial.l1 : trial.r1,
    left ? trial.l2 : trial.r2,
    sign,
  );
  if (!E) return null;
  const v = sub(P, E),
    d = Math.hypot(v.x, v.y);
  return add(P, mul(v, trial.extension / Math.max(d, 0.001)));
}
function resizeToJoint(P, drag) {
  const orig = drag.initialLinks,
    pv = pivots(state),
    minDistance =
      Math.max(dist(pv.A, P) / (orig.l1 + orig.l2), dist(pv.B, P) / (orig.r1 + orig.r2)) * 1.002;
  let scale = Math.max(0.03, dist(pv.M, P) / drag.originalRadius, minDistance);
  const maxScale = Math.min(2000 / Math.max(...Object.values(orig)), 20);
  scale = Math.min(scale, maxScale);
  // Preserve relative lengths, and keep every new bar within supported slider limits.
  const trial = { ...state };
  for (const key of ['l1', 'l2', 'r1', 'r2']) trial[key] = Math.max(5, orig[key] * scale);
  const G = scaledTargetFromJoint(P, trial);
  if (G) {
    const sol = calc(G, trial);
    if (sol.valid || (sol.P && dist(sol.P, P) < 0.05)) {
      for (const key of ['l1', 'l2', 'r1', 'r2']) state[key] = trial[key];
      state.targetX = G.x;
      state.targetY = G.y;
      for (const key of ['l1', 'l2', 'r1', 'r2']) $(key).value = Number(state[key].toFixed(3));
      return true;
    }
  }
  // When a request is geometrically impossible at the requested scale, keep the last feasible shape.
  return false;
}
function updateToolSettings() {
  $('extensionSettings').classList.toggle('invisible', !['left', 'right'].includes(state.toolMode));
  $('fixedSettings').classList.toggle('invisible', state.toolMode !== 'fixed');
  const details = {
    joint: 'Tool tip coincides with the common joint P.',
    left: 'G extends rigidly beyond P, along the direction of the left distal link.',
    right: 'G extends rigidly beyond P, along the direction of the right distal link.',
    fixed:
      'G stays a fixed X/Y displacement from P in board coordinates. This assumes a non-rotating gripper mount.',
  };
  $('toolDescription').textContent = details[state.toolMode];
}
