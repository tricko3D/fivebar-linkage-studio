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
// The camera may move at most half a viewport in each direction, giving a
// two-viewport-wide panning envelope without losing the mechanism.
let panOffset = vec(0, 0);
function clampPan(view) {
  panOffset.x = Math.max(-view.w / 2, Math.min(view.w / 2, panOffset.x));
  panOffset.y = Math.max(-view.h / 2, Math.min(view.h / 2, panOffset.y));
}
// Show the drag cursor only during a drag, not on hover.
svg.style.cursor = '';
svg.style.touchAction = 'none';
svg.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  const h = e.target.closest?.('[data-handle]');
  const q = localPoint(e);
  const board = boardBounds();
  const onBoard = q.x >= board.x && q.x <= board.x + board.w &&
    q.y >= board.y && q.y <= board.y + board.h;
  const onChessSquare = q.x >= 0 && q.x <= state.boardW &&
    q.y >= 0 && q.y <= state.boardH && !!e.target.closest?.('#boardCells');

  // Only the empty SVG background may pan. Neither the wooden surround,
  // chessboard nor any linkage/annotation can initiate a camera drag.
  const type = h?.dataset.handle ||
    (e.target === svg && !onBoard ? 'pan' : onChessSquare ? 'board-click' : null);
  if (!type) return;
  if (routePlaying) stopRoute();
  dragging = {
    type, start: q, originX: state.mountX, originY: state.mountY,
    clientX: e.clientX, clientY: e.clientY,
    startPan: vec(panOffset.x, panOffset.y),
    moved: false, pointerId: e.pointerId,
  };
  if (type !== 'board-click') svg.style.cursor = 'grabbing';
  if (type === 'resize') {
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
  if (!dragging || e.pointerId !== dragging.pointerId) return;
  if (dragging.type === 'board-click') {
    if (Math.hypot(e.clientX - dragging.clientX, e.clientY - dragging.clientY) > 4)
      dragging.moved = true;
    return;
  }
  if (dragging.type === 'pan') {
    const dx = e.clientX - dragging.clientX;
    const dy = e.clientY - dragging.clientY;
    if (Math.hypot(dx, dy) > 4) dragging.moved = true;
    if (!dragging.moved) return;
    // Pixel deltas are relative to the original camera scale, not its
    // changing viewBox, so panning remains smooth and stable.
    const bounds = svg.getBoundingClientRect();
    const base = sceneViewport(lastSolution);
    panOffset.x = dragging.startPan.x - dx * base.w / Math.max(1, bounds.width);
    panOffset.y = dragging.startPan.y - dy * base.h / Math.max(1, bounds.height);
    clampPan(base);
    currentView = { ...base, x: base.x + panOffset.x, y: base.y + panOffset.y };
    render(false);
    e.preventDefault();
    return;
  }
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
    // Never push the gripper past an enabled output-joint hard stop.
    const bounded = constrainedTarget(vec(state.targetX, state.targetY), q);
    state.targetX = bounded.x;
    state.targetY = bounded.y;
    change(false);
  }
  e.preventDefault();
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
  svg.addEventListener(ev, (e) => {
    if (!dragging || e.pointerId !== dragging.pointerId) return;
    const boardClick = dragging.type === 'board-click' &&
      !dragging.moved && ev === 'pointerup';
    dragging = null;
    svg.style.cursor = '';
    if (boardClick && !resizeMode) {
      const q = localPoint(e);
      if (q.x >= 0 && q.x <= state.boardW && q.y >= 0 && q.y <= state.boardH) {
        const bounded = constrainedTarget(vec(state.targetX, state.targetY), q);
        state.targetX = bounded.x;
        state.targetY = bounded.y;
        change(false);
        return;
      }
    }
    render(false);
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
// Infer a manufacturing method for legacy settings saved before the picker existed.
setupMaterialOptions();
writeControls();
initControls();
initMaterialPicker();
updateTransmissionReadout();
rebuildRoute();
render(true);
