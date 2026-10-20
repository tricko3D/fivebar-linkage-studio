// SVG pointer events and application startup.
// Files run in the order specified in index.html; they share the application state.
'use strict';

function localPoint(evt) {
  const p = svg.createSVGPoint();
  p.x = evt.clientX;
  p.y = evt.clientY;
  const m = svg.getScreenCTM();
  return m ? p.matrixTransform(m.inverse()) : vec(0, 0);
}
svg.addEventListener('pointerdown', (e) => {
  if (routePlaying) stopRoute();
  const h = e.target.closest('[data-handle]');
  let target = h?.dataset.handle || 'target';
  if (!h) {
    if (resizeMode) return; // In resize mode only the gold joint P is draggable.
    // Clicking anywhere on the playing board sets the gripper position.
    const q = localPoint(e);
    if (q.x >= 0 && q.x <= state.boardW && q.y >= 0 && q.y <= state.boardH) {
      state.targetX = q.x;
      state.targetY = q.y;
      change(false);
    } else return;
  }
  const start = localPoint(e);
  dragging = { type: target, start, originX: state.mountX, originY: state.mountY };
  if (target === 'resize') {
    const sol = calc(vec(state.targetX, state.targetY));
    const P = sol.P || vec(state.targetX, state.targetY);
    dragging.initialJoint = P;
    dragging.originalRadius = Math.max(15, dist(P, pivots(state).M));
    dragging.initialLinks = { l1: state.l1, l2: state.l2, r1: state.r1, r2: state.r2 };
  }
  svg.setPointerCapture(e.pointerId);
  e.preventDefault();
});
svg.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const q = localPoint(e);
  if (dragging.type === 'mount') {
    state.mountX = dragging.originX + q.x - dragging.start.x;
    state.mountY = dragging.originY + q.y - dragging.start.y;
    $('mountX').value = f(state.mountX);
    $('mountY').value = f(state.mountY);
    change(true);
  } else if (dragging.type === 'rotate') {
    state.angle = Math.atan2(q.y - state.mountY, q.x - state.mountX) / RAD - 90;
    $('angle').value = f(state.angle);
    change(true);
  } else if (dragging.type === 'resize') {
    const P = add(dragging.initialJoint, sub(q, dragging.start));
    if (resizeToJoint(P, dragging)) change(true);
  } else {
    state.targetX = q.x;
    state.targetY = q.y;
    change(false);
  }
  e.preventDefault();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
  svg.addEventListener(ev, () => {
    if (dragging) {
      dragging = null;
      render(false);
    }
  });
window.addEventListener('resize', () => render(false));
// New default preset for the public studio. Previous chess-v3 browser settings are kept untouched.
try {
  const prior = JSON.parse(localStorage.getItem('fivebar-linkage-studio-v1') || 'null');
  if (prior && typeof prior === 'object') {
    for (const key of Object.keys(defaults))
      if (typeof prior[key] === typeof defaults[key]) state[key] = prior[key];
  }
} catch (e) {}
state.outerW = Math.max(state.boardW, state.outerW);
state.outerH = Math.max(state.boardH, state.outerH);
writeControls();
initControls();
updateTransmissionReadout();
rebuildRoute();
render(true);
