// Chessboard reachability sampling and servo travel tests.
// Files run in the order specified in index.html; they share the application state.
'use strict';

const fileLetters = 'ABCDEFGH';
function squarePos(col, row) {
  return vec(((col + 0.5) * state.boardW) / 8, ((row + 0.5) * state.boardH) / 8);
}
function squareName(col, row) {
  return fileLetters[col] + (8 - row);
}
function sampleCoverage() {
  let cells = [],
    okCenters = 0,
    totalOk = 0,
    angles = [];
  const samples = [0.15, 0.5, 0.85];
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      let hits = 0;
      for (const dy of samples)
        for (const dx of samples) {
          const G = vec(((col + dx) * state.boardW) / 8, ((row + dy) * state.boardH) / 8);
          const sol = calc(G);
          if (sol.valid) {
            hits++;
            angles.push({ L: sol.angleL, R: sol.angleR, col, row });
          }
        }
      const center = calc(squarePos(col, row));
      if (center.valid) okCenters++;
      totalOk += hits;
      cells.push({ col, row, hits, center: center.valid });
    }
  return { cells, angles, okCenters, percentage: (totalOk / 576) * 100 };
}
// Circular angular coverage; minimal enclosing arc excludes the biggest unoccupied gap.
// Motor mounting calibration may rotate the 180° servo window relative to world +X.
const norm360 = (n) => ((n % 360) + 360) % 360;
function minimumArc(angles) {
  if (!angles.length) return null;
  const vals = angles.map(norm360).sort((a, b) => a - b);
  let gap = -1,
    cut = 0;
  for (let i = 0; i < vals.length; i++) {
    const next = i + 1 < vals.length ? vals[i + 1] : vals[0] + 360;
    if (next - vals[i] > gap) {
      gap = next - vals[i];
      cut = i;
    }
  }
  return { start: vals[(cut + 1) % vals.length], span: 360 - gap, count: vals.length };
}
function windowContains(angle, start, travel) {
  return travel >= 359.999 || norm360(angle - start) < travel + 1e-6;
}
function bestServoWindow(angles, range, arc) {
  if (!arc) return null;
  if (range >= 360 - 1e-6) return { start: 0, span: 360, hits: angles.length };
  if (arc.span <= range + 1e-6) {
    const start = norm360(arc.start - (range - arc.span) / 2);
    return { start, span: range, hits: angles.length };
  }
  const arr = angles.map(norm360).sort((a, b) => a - b),
    double = arr.concat(arr.map((x) => x + 360));
  let bestHits = -1,
    bestStart = arr[0],
    end = 0;
  for (let i = 0; i < arr.length; i++) {
    end = Math.max(end, i);
    while (end < i + arr.length && double[end] - double[i] <= range + 1e-6) end++;
    const hits = end - i;
    if (hits > bestHits) {
      bestHits = hits;
      bestStart = arr[i];
    }
  }
  return { start: bestStart, span: range, hits: bestHits };
}
function servoPass(sol, data) {
  return (
    !!sol.valid &&
    !!data.leftWindow &&
    !!data.rightWindow &&
    windowContains(sol.angleL, data.leftWindow.start, data.usable) &&
    windowContains(sol.angleR, data.rightWindow.start, data.usable)
  );
}
// The preset's travel describes motor-shaft travel, not the driven joint.
// For continuous-rotation motors/steppers, 360° is the library's "unbounded
// rotation" sentinel; positional servos have travel below 360°.
function usableJointTravel(s = state) {
  if (s.servoTravel >= 359.999) return 360;
  return Math.max(0, Math.min(360,
    (s.servoTravel - 2 * s.servoMargin) / Math.max(1, s.ratio)));
}
function servoAnalysis(cov, s = state) {
  const usable = usableJointTravel(s);
  const leftArc = minimumArc(cov.angles.map((p) => p.L)),
    rightArc = minimumArc(cov.angles.map((p) => p.R));
  const leftWindow = bestServoWindow(
    cov.angles.map((p) => p.L),
    usable,
    leftArc,
  );
  const rightWindow = bestServoWindow(
    cov.angles.map((p) => p.R),
    usable,
    rightArc,
  );
  let centers = 0,
    samples = 0;
  for (const sample of cov.angles)
    if (
      leftWindow &&
      rightWindow &&
      windowContains(sample.L, leftWindow.start, usable) &&
      windowContains(sample.R, rightWindow.start, usable)
    )
      samples++;
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++)
      if (servoPass(calc(squarePos(col, row)), { leftWindow, rightWindow, usable })) centers++;
  return {
    usable,
    leftArc,
    rightArc,
    leftWindow,
    rightWindow,
    samples,
    centers,
    geometricalPoints: cov.angles.length,
    geomCentres: cov.okCenters,
    full:
      cov.okCenters === 64 &&
      cov.angles.length === 576 &&
      leftArc &&
      rightArc &&
      leftArc.span <= usable + 1e-6 &&
      rightArc.span <= usable + 1e-6,
  };
}
function angleFormat(n) {
  return `${norm360(n).toFixed(1)}°`;
}
function servoReadout(sol) {
  const a = lastServoMap;
  if (!a) return;
  $('servoUsable').textContent = state.servoTravel >= 359.999
    ? 'Continuous-angle model (verify physical limits)'
    : `${f(a.usable)}° at output from ${f(state.servoTravel)}° motor, ${f(state.ratio)}:1 drive`;
  $('servoLeftSweep').textContent = a.leftArc
    ? `${a.leftArc.span.toFixed(1)}°`
    : 'no reachable points';
  $('servoRightSweep').textContent = a.rightArc
    ? `${a.rightArc.span.toFixed(1)}°`
    : 'no reachable points';
  $('servoMaxDisp').textContent = state.servoTravel >= 359.999
    ? 'Unrestricted model · check motor hardware'
    : `${f(a.usable)}° output (${f(state.servoMargin)}° motor margin/side, ${f(state.ratio)}:1)`;
  $('servoLArc').textContent = a.leftArc
    ? `${angleFormat(a.leftArc.start)} → ${angleFormat(a.leftArc.start + a.leftArc.span)} (${a.leftArc.span.toFixed(1)}°)`
    : '—';
  $('servoRArc').textContent = a.rightArc
    ? `${angleFormat(a.rightArc.start)} → ${angleFormat(a.rightArc.start + a.rightArc.span)} (${a.rightArc.span.toFixed(1)}°)`
    : '—';
  $('servoLWindow').textContent = a.leftWindow
    ? `${angleFormat(a.leftWindow.start)} → ${angleFormat(a.leftWindow.start + a.usable)}`
    : '—';
  $('servoRWindow').textContent = a.rightWindow
    ? `${angleFormat(a.rightWindow.start)} → ${angleFormat(a.rightWindow.start + a.usable)}`
    : '—';
  $('servoCentres').textContent = `${a.centers}/64`;
  $('servoSamples').textContent = `${a.samples}/576`;
  $('servoTarget').textContent = !sol.valid
    ? (sol.limitedBy === 'joint-stops' ? 'Outside mechanical stops' : 'Unreachable')
    : servoPass(sol, a)
      ? 'Within both windows'
      : 'Beyond configured servo travel';
  const limitReadout = $('jointLimitReadout');
  if (limitReadout) limitReadout.textContent = state.useJointLimits
    ? `Active · M₁ ${state.leftMinAngle}° → ${state.leftMaxAngle}° · M₂ ${state.rightMinAngle}° → ${state.rightMaxAngle}° · ${a.centers}/64 centres meet geometry, stops and servo travel`
    : 'Disabled · mechanical stops do not constrain reachability';
  const status = $('servoStatus');
  if (a.full) {
    status.className = 'mechbadge';
    status.textContent = 'PASS: All sampled points fit both servo limits.';
  } else if (a.geometricalPoints !== 576) {
    status.className = 'mechbadge warn';
    status.textContent = 'Some board points are outside the linkage geometry or enabled mechanical stops.';
  } else {
    status.className = 'mechbadge bad';
    status.textContent = 'Servo travel insufficient for full-board coverage.';
  }
  $('servoHint').textContent =
    a.leftArc && a.rightArc && a.leftArc.span <= a.usable && a.rightArc.span <= a.usable
      ? 'The servo windows cover the reachable points. Mechanical stops, when enabled, also constrain reachability and motion paths.'
      : 'At least one motor needs more angular travel than allowed, or some squares are unreachable. The fitted windows maximize individual motor coverage where full fit is impossible.';
}
