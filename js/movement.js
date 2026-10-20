// Chess move motion profiles, motor speed and torque graphs.
// Files run in the order specified in index.html; they share the application state.
'use strict';

// Queen movement simulation. XY-only; motor torque and RPM are estimate proxies.
function updateTransmissionReadout() {
  const s = state,
    ratio = Math.max(0.01, s.ratio),
    eff = s.efficiency / 100;
  const nominal = s.motorNm * ratio * eff,
    derated = nominal / Math.max(1, s.motorSF);
  const rpm = s.motorRPM / ratio;
  $('gearReadout').innerHTML =
    `<strong>${ratio.toFixed(2)}:1 ${ratio === 1 ? 'direct drive' : 'reduction'}</strong><br/>Nominal output torque: <strong>${nominal.toFixed(3)} N·m</strong> · after ${f(s.motorSF)}× margin: <strong>${derated.toFixed(3)} N·m</strong><br/>At motor speed ${f(s.motorRPM)} RPM, output shaft: <strong>${rpm.toFixed(1)} RPM</strong> (${(rpm * 6).toFixed(1)}°/s).<br/><span class="mini">Constant running torque is an input assumption. Gear ratios change real motor operating RPM, so the actual available torque may differ.</span>`;
}
function motorDerivatives(sol, s = state) {
  if (!sol.valid || sol.margin < 0.025) return null;
  const delta = 0.25,
    g = sol.G;
  const xp = calc(vec(g.x + delta, g.y), s),
    xm = calc(vec(g.x - delta, g.y), s),
    yp = calc(vec(g.x, g.y + delta), s),
    ym = calc(vec(g.x, g.y - delta), s);
  if (!xp.valid || !xm.valid || !yp.valid || !ym.valid) return null;
  const a = deltaAngle(xp.angleL, xm.angleL) / (2 * delta),
    b = deltaAngle(yp.angleL, ym.angleL) / (2 * delta);
  const c = deltaAngle(xp.angleR, xm.angleR) / (2 * delta),
    d = deltaAngle(yp.angleR, ym.angleR) / (2 * delta),
    det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-11) return null;
  return { a, b, c, d, det };
}
function xyProfile(distance, speed, accel) {
  const a = Math.max(0.01, accel),
    v = Math.max(0.01, speed),
    tA = Math.min(v / a, Math.sqrt(distance / a));
  const vmax = a * tA,
    cruise = Math.max(0, (distance - (vmax * vmax) / a) / vmax);
  const duration = 2 * tA + cruise;
  return { tA, vmax, cruise, duration, a, distance };
}
function profileAt(p, t) {
  const { tA, cruise, vmax, a, distance, duration } = p;
  if (t <= 0) return { distance: 0, velocity: 0, acceleration: a };
  if (t >= duration) return { distance, velocity: 0, acceleration: 0 };
  if (t < tA) return { distance: (a * t * t) / 2, velocity: a * t, acceleration: a };
  if (t < tA + cruise)
    return { distance: (a * tA * tA) / 2 + vmax * (t - tA), velocity: vmax, acceleration: 0 };
  const u = t - tA - cruise;
  return {
    distance: (a * tA * tA) / 2 + vmax * cruise + vmax * u - (a * u * u) / 2,
    velocity: vmax - a * u,
    acceleration: -a,
  };
}
function squareByName(name) {
  const col = fileLetters.indexOf((name || '')[0]),
    row = 8 - Number((name || '')[1]);
  if (col < 0 || row < 0 || row > 7) return null;
  return squarePos(col, row);
}
function buildRouteData() {
  const start = squareByName(state.routeFrom),
    end = squareByName(state.routeTo);
  if (!start || !end) return { valid: false, reason: 'Choose valid squares.' };
  const length = dist(start, end),
    dir = length > 0 ? mul(sub(end, start), 1 / length) : vec(0, 0);
  if (length < 0.01)
    return { valid: false, reason: 'Choose different starting and destination squares.' };
  // The sample points are also used to estimate a kinematic motor RPM cap.
  let maxRadiansPerMm = 0,
    minMargin = 1;
  for (let i = 0; i <= 120; i++) {
    const g = add(start, mul(dir, (length * i) / 120)),
      sol = calc(g);
    if (!sol.valid)
      return {
        valid: false,
        start,
        end,
        reason: `Part of ${state.routeFrom} → ${state.routeTo} is unreachable (${Math.round(i / 1.2)}% along the path).`,
      };
    if (sol.margin < 0.025)
      return {
        valid: false,
        start,
        end,
        reason: 'Path passes too close to a singularity for reliable numerical estimates.',
      };
    minMargin = Math.min(minMargin, sol.margin);
    const der = motorDerivatives(sol);
    if (!der)
      return {
        valid: false,
        start,
        end,
        reason: 'Numerical IK derivatives failed along the path.',
      };
    const kL = Math.abs(der.a * dir.x + der.b * dir.y),
      kR = Math.abs(der.c * dir.x + der.d * dir.y);
    maxRadiansPerMm = Math.max(maxRadiansPerMm, kL, kR);
  }
  const motorCap =
    (state.motorRPM * ((2 * Math.PI) / 60)) / Math.max(state.ratio * maxRadiansPerMm, 1e-8);
  const effectiveSpeed = state.speedCap ? Math.min(state.xySpeed, motorCap) : state.xySpeed;
  const profile = xyProfile(length, effectiveSpeed, state.accel);
  const base = mechanicalBase(state),
    moveMass = (state.headG + state.payloadG) / 1000 + base.linkMass * 0.5;
  const data = {
    valid: true,
    start,
    end,
    length,
    dir,
    profile,
    effectiveSpeed,
    motorCap,
    minMargin,
    samples: [],
    base,
    moveMass,
    maxTorqueL: 0,
    maxTorqueR: 0,
    maxRPML: 0,
    maxRPMR: 0,
    maxRatio: 0,
    highTorque: 0,
  };
  const n = 200;
  for (let i = 0; i <= n; i++) {
    const t = (profile.duration * i) / n,
      p = profileAt(profile, t),
      g = add(start, mul(dir, p.distance)),
      sol = calc(g),
      k = motorDerivatives(sol);
    if (!k)
      return {
        valid: false,
        start,
        end,
        reason: 'Motor Jacobian could not be evaluated along the full path.',
      };
    const thetaVelL = (k.a * dir.x + k.b * dir.y) * p.velocity,
      thetaVelR = (k.c * dir.x + k.d * dir.y) * p.velocity;
    const rpmL = ((Math.abs(thetaVelL) * 60) / (2 * Math.PI)) * state.ratio,
      rpmR = ((Math.abs(thetaVelR) * 60) / (2 * Math.PI)) * state.ratio;
    // Force direction follows commanded XY acceleration and dissipative drag while moving.
    const Fr = (moveMass * p.acceleration) / 1000 + (p.velocity > 0.0001 ? state.dragN : 0);
    const Fx = dir.x * Fr,
      Fy = dir.y * Fr;
    const tauL =
      Math.abs((k.d * Fx - k.c * Fy) / k.det / 1000) +
      (i > 0 && i < n ? state.bearingFrictionNm : 0);
    const tauR =
      Math.abs((-k.b * Fx + k.a * Fy) / k.det / 1000) +
      (i > 0 && i < n ? state.bearingFrictionNm : 0);
    const v = {
      t,
      pos: g,
      speed: p.velocity,
      accel: p.acceleration,
      tauL,
      tauR,
      rpmL,
      rpmR,
      thetaL: sol.angleL,
      thetaR: sol.angleR,
    };
    data.samples.push(v);
    data.maxTorqueL = Math.max(data.maxTorqueL, tauL);
    data.maxTorqueR = Math.max(data.maxTorqueR, tauR);
    data.maxRPML = Math.max(data.maxRPML, rpmL);
    data.maxRPMR = Math.max(data.maxRPMR, rpmR);
  }
  return data;
}
function plotGraph(id, seriesA, seriesB, limit, title) {
  const data = routeData.samples,
    w = 650,
    h = 170,
    l = 44,
    r = 14,
    top = 13,
    bottom = 30;
  const x = (t) => l + ((w - l - r) * t) / routeData.profile.duration;
  const max = Math.max(
    limit * 1.2,
    ...data.map((v) => Math.max(v[seriesA], v[seriesB]) * 1.12),
    0.001,
  );
  const y = (v) => top + (h - top - bottom) * (1 - v / max);
  const line = (key) =>
    data.map((v, i) => `${i ? 'L' : 'M'}${x(v.t).toFixed(2)},${y(v[key]).toFixed(2)}`).join(' ');
  let out = '';
  for (let j = 0; j <= 4; j++) {
    const v = (max * j) / 4;
    out += `<line class="gridline" x1="${l}" y1="${y(v)}" x2="${w - r}" y2="${y(v)}"/><text x="${l - 7}" y="${y(v) + 3}" text-anchor="end">${title === 'rpm' ? v.toFixed(0) : v.toFixed(2)}</text>`;
  }
  for (let j = 0; j <= 4; j++) {
    const t = (routeData.profile.duration * j) / 4;
    out += `<text x="${x(t)}" y="${h - 9}" text-anchor="middle">${t.toFixed(2)}s</text>`;
  }
  out += `<line class="threshold" x1="${l}" y1="${y(limit)}" x2="${w - r}" y2="${y(limit)}"/><text class="limitlabel" x="${w - r - 3}" y="${Math.max(10, y(limit) - 5)}" text-anchor="end">limit ${title === 'rpm' ? limit.toFixed(0) : limit.toFixed(3)}</text>`;
  out += `<path class="left" d="${line(seriesA)}"/><path class="right" d="${line(seriesB)}"/>`;
  out += `<line class="cursorline" id="${id}Cursor" x1="${l}" y1="${top}" x2="${l}" y2="${h - bottom}"/><circle id="${id}PointL" class="cursorpoint" cx="${l}" cy="${y(data[0][seriesA])}" r="4" fill="#5bd1db"/><circle id="${id}PointR" class="cursorpoint" cx="${l}" cy="${y(data[0][seriesB])}" r="4" fill="#b4a1fb"/>`;
  out += `<text class="legend" x="${l + 4}" y="${h - 1}" fill="#5bd1db">● left</text><text class="legend" x="${l + 74}" y="${h - 1}" fill="#b4a1fb">● right</text>`;
  $(id).innerHTML = out;
  $(id).dataset.plot = JSON.stringify({ l, w, r, top, h, bottom, max, seriesA, seriesB });
}
function redrawRouteGraphs() {
  if (!routeData || !routeData.valid) {
    $('torqueGraph').innerHTML = '';
    $('rpmGraph').innerHTML = '';
    return;
  }
  plotGraph('torqueGraph', 'tauL', 'tauR', routeData.base.allowTorque, 'torque');
  plotGraph('rpmGraph', 'rpmL', 'rpmR', state.motorRPM, 'rpm');
}
function updateRouteGraphCursor() {
  if (!routeData?.valid) return;
  const idx = Math.min(
      routeData.samples.length - 1,
      Math.round(routeCursor * (routeData.samples.length - 1)),
    ),
    s = routeData.samples[idx];
  for (const id of ['torqueGraph', 'rpmGraph']) {
    const graph = $(id),
      cfg = JSON.parse(graph.dataset.plot || 'null');
    if (!cfg) continue;
    const x = cfg.l + (cfg.w - cfg.l - cfg.r) * routeCursor,
      y = (v) => cfg.top + (cfg.h - cfg.top - cfg.bottom) * (1 - v / cfg.max);
    $(id + 'Cursor').setAttribute('x1', x);
    $(id + 'Cursor').setAttribute('x2', x);
    for (const [end, key] of [
      ['L', cfg.seriesA],
      ['R', cfg.seriesB],
    ]) {
      $(id + 'Point' + end).setAttribute('cx', x);
      $(id + 'Point' + end).setAttribute('cy', y(s[key]));
    }
  }
  $('routeTime').textContent = (routeCursor * routeData.profile.duration).toFixed(2) + ' s';
  $('routeDuration').textContent = routeData.profile.duration.toFixed(2) + ' s';
  $('routeProgress').textContent = (routeCursor * 100).toFixed(0) + '%';
  $('routeTorqueNow').textContent = `${s.tauL.toFixed(3)} / ${s.tauR.toFixed(3)} N·m`;
  $('routeSpeedNow').textContent = `${s.rpmL.toFixed(1)} / ${s.rpmR.toFixed(1)} RPM`;
  $('routeScrub').value = Math.round(routeCursor * 1000);
}
function rebuildRoute() {
  routeData = buildRouteData();
  routeCursor = 0;
  const d = routeData;
  $('routePlay').disabled = !d.valid;
  $('routeScrub').disabled = !d.valid;
  if (!d.valid) {
    $('routeSummary').textContent = 'No valid route';
    $('routeAlert').className = 'routeAlert bad';
    $('routeAlert').textContent = d.reason || 'Path is unreachable.';
    for (const id of [
      'routeTime',
      'routeDuration',
      'routeProgress',
      'routeTorqueNow',
      'routeSpeedNow',
      'routeTorquePeak',
      'routeRPMPeak',
    ])
      $(id).textContent = '—';
    redrawRouteGraphs();
    return;
  }
  $('routeSummary').textContent =
    `${d.length.toFixed(1)} mm · ${d.profile.duration.toFixed(2)} s · ${d.effectiveSpeed.toFixed(1)} mm/s peak`;
  $('routeTorquePeak').textContent = `${d.maxTorqueL.toFixed(3)} / ${d.maxTorqueR.toFixed(3)} N·m`;
  $('routeRPMPeak').textContent = `${d.maxRPML.toFixed(1)} / ${d.maxRPMR.toFixed(1)} RPM`;
  const tExceeded = Math.max(d.maxTorqueL, d.maxTorqueR) > d.base.allowTorque + 1e-6;
  const rExceeded = Math.max(d.maxRPML, d.maxRPMR) > state.motorRPM + 0.05;
  const cautions = [];
  if (tExceeded)
    cautions.push(
      `output torque above derated estimate (${Math.max(d.maxTorqueL, d.maxTorqueR).toFixed(3)} > ${d.base.allowTorque.toFixed(3)} N·m)`,
    );
  if (rExceeded) cautions.push('input motor RPM exceeds configured speed limit');
  if (d.minMargin < 0.14) cautions.push('path near singularity');
  if (state.speedCap && d.effectiveSpeed < state.xySpeed - 0.01)
    cautions.push(
      `requested ${f(state.xySpeed)} mm/s capped to ${d.effectiveSpeed.toFixed(1)} mm/s by motor RPM`,
    );
  const el = $('routeAlert');
  el.className = 'routeAlert ' + (tExceeded || rExceeded ? 'warn' : '');
  el.textContent = cautions.length
    ? cautions.join(' · ')
    : 'Path reachable · estimated motor torque and RPM within entered limits.';
  redrawRouteGraphs();
  updateRouteGraphCursor();
}
function stopRoute() {
  routePlaying = false;
  routeFrameStamp = null;
  if (routeFrameHandle) {
    cancelAnimationFrame(routeFrameHandle);
    routeFrameHandle = null;
  }
  if ($('routePlay')) { const b=$('routePlay'); const label=b.querySelector('span'); if (label) label.textContent='Play'; else b.textContent='Play'; b.classList.remove('is-playing'); }
}
function setRouteCursor(v) {
  if (!routeData?.valid) return;
  routeCursor = Math.max(0, Math.min(1, v));
  const p = profileAt(routeData.profile, routeCursor * routeData.profile.duration);
  const pos = add(routeData.start, mul(routeData.dir, p.distance));
  state.targetX = pos.x;
  state.targetY = pos.y;
  // Keep view fixed during playback/scrubbing, without rebuilding the expensive heatmaps.
  render(false);
  updateRouteGraphCursor();
}
function routeTick(stamp) {
  if (!routePlaying) return;
  if (routeFrameStamp !== null)
    routeCursor = Math.min(
      1,
      routeCursor + (stamp - routeFrameStamp) / 1000 / routeData.profile.duration,
    );
  routeFrameStamp = stamp;
  setRouteCursor(routeCursor);
  if (routeCursor >= 1) {
    stopRoute();
    return;
  }
  routeFrameHandle = requestAnimationFrame(routeTick);
}
function toggleRoutePlay() {
  if (routePlaying) {
    stopRoute();
    return;
  }
  if (!routeData?.valid) return;
  if (routeCursor >= 1) setRouteCursor(0);
  if (resizeMode) setResizeMode(false);
  routePlaying = true;
  routeFrameStamp = null;
  { const b=$('routePlay'); const label=b.querySelector('span'); if (label) label.textContent='Pause'; else b.textContent='Pause'; b.classList.add('is-playing'); }
  currentView = sceneViewport(calc(routeData.start));
  routeFrameHandle = requestAnimationFrame(routeTick);
}
