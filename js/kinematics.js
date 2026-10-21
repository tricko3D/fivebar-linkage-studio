// Five-bar inverse kinematics and singularity checks.
// Files run in the order specified in index.html; they share the application state.
'use strict';

function pivots(s) {
  const t = s.angle * RAD,
    dx = (Math.cos(t) * s.sep) / 2,
    dy = (Math.sin(t) * s.sep) / 2;
  return {
    A: vec(s.mountX - dx, s.mountY - dy),
    B: vec(s.mountX + dx, s.mountY + dy),
    M: vec(s.mountX, s.mountY),
    rot: vec(s.mountX - Math.sin(t) * 65, s.mountY + Math.cos(t) * 65),
  };
}
function elbowPoint(A, target, prox, distal, sign) {
  const d = dist(A, target);
  if (d < 1e-8 || d > prox + distal + 1e-7 || d < Math.abs(prox - distal) - 1e-7) return null;
  let along = (prox * prox - distal * distal + d * d) / (2 * d);
  const height = Math.sqrt(Math.max(0, prox * prox - along * along));
  const dx = (target.x - A.x) / d,
    dy = (target.y - A.y) / d;
  return vec(A.x + along * dx - sign * height * dy, A.y + along * dy + sign * height * dx);
}
function properIntersection(a, b, c, d) {
  const r = sub(b, a),
    q = sub(d, c),
    den = cross(r, q);
  if (Math.abs(den) < 1e-7) return false;
  const t = cross(sub(c, a), q) / den,
    u = cross(sub(c, a), r) / den;
  return t > 1e-5 && t < 1 - 1e-5 && u > 1e-5 && u < 1 - 1e-5;
}
// Absolute output-joint angles: +X=0°, +Y=90° (down on the board).
// Min > max wraps through 0°. Equal endpoints mean a zero-width sweep.
function hardStopSweep(min, max) {
  if (Math.abs(max - min) >= 359.999) return 360;
  return ((max - min) % 360 + 360) % 360;
}
function jointWithinStops(angle, min, max) {
  const span = hardStopSweep(min, max);
  return span >= 359.999 ||
    ((angle - min) % 360 + 360) % 360 <= span + 1e-6;
}
function jointStopsPass(a, b, s = state) {
  return !s.useJointLimits || (
    jointWithinStops(a, s.leftMinAngle, s.leftMaxAngle) &&
    jointWithinStops(b, s.rightMinAngle, s.rightMaxAngle)
  );
}
function calc(G, s = state) {
  const { A, B, M } = pivots(s),
    signL = s.branch[0] === '+' ? 1 : -1,
    signR = s.branch[1] === '+' ? 1 : -1;
  let P, EL, ER;
  if (s.toolMode === 'left') {
    EL = elbowPoint(A, G, s.l1, s.l2 + s.extension, signL);
    if (!EL) return { valid: false, reason: 'Left linkage cannot reach the gripper.', A, B, M, G };
    P = add(EL, mul(sub(G, EL), s.l2 / (s.l2 + s.extension)));
    ER = elbowPoint(B, P, s.r1, s.r2, signR);
    if (!ER)
      return {
        valid: false,
        reason: 'Right linkage cannot reach the required joint P.',
        A,
        B,
        M,
        G,
        P,
        EL,
      };
  } else if (s.toolMode === 'right') {
    ER = elbowPoint(B, G, s.r1, s.r2 + s.extension, signR);
    if (!ER) return { valid: false, reason: 'Right linkage cannot reach the gripper.', A, B, M, G };
    P = add(ER, mul(sub(G, ER), s.r2 / (s.r2 + s.extension)));
    EL = elbowPoint(A, P, s.l1, s.l2, signL);
    if (!EL)
      return {
        valid: false,
        reason: 'Left linkage cannot reach the required joint P.',
        A,
        B,
        M,
        G,
        P,
        ER,
      };
  } else {
    P = s.toolMode === 'fixed' ? vec(G.x - s.offsetX, G.y - s.offsetY) : G;
    EL = elbowPoint(A, P, s.l1, s.l2, signL);
    ER = elbowPoint(B, P, s.r1, s.r2, signR);
    if (!EL || !ER)
      return {
        valid: false,
        reason:
          !EL && !ER
            ? 'Neither linkage can reach the common joint P.'
            : !EL
              ? 'Left linkage cannot reach joint P.'
              : 'Right linkage cannot reach joint P.',
        A,
        B,
        M,
        G,
        P,
        EL,
        ER,
      };
  }
  const crossed =
    properIntersection(A, EL, B, ER) ||
    properIntersection(A, EL, ER, P) ||
    properIntersection(B, ER, EL, P);
  if (s.forbidCrossings && crossed)
    return {
      valid: false,
      reason: 'The linkage crosses itself in the selected 2D assembly.',
      A,
      B,
      M,
      G,
      P,
      EL,
      ER,
      crossed,
    };
  const angleL = degree(sub(EL, A)), angleR = degree(sub(ER, B));
  if (!jointStopsPass(angleL, angleR, s)) {
    const left = !jointWithinStops(angleL, s.leftMinAngle, s.leftMaxAngle);
    const name = left ? 'Left (M₁)' : 'Right (M₂)';
    const angle = left ? angleL : angleR;
    const lo = left ? s.leftMinAngle : s.rightMinAngle;
    const hi = left ? s.leftMaxAngle : s.rightMaxAngle;
    return {
      valid: false, limitedBy: 'joint-stops',
      reason: `${name} joint angle ${angle.toFixed(1)}° is outside mechanical stops (${lo}° → ${hi}°).`,
      A, B, M, G, P, EL, ER, crossed, angleL, angleR,
    };
  }
  const serialL = Math.abs(cross(sub(EL, A), sub(P, EL))) / (s.l1 * s.l2),
    serialR = Math.abs(cross(sub(ER, B), sub(P, ER))) / (s.r1 * s.r2),
    parallel = Math.abs(cross(sub(P, EL), sub(P, ER))) / (s.l2 * s.r2);
  const margin = Math.min(serialL, serialR, parallel);
  return {
    valid: true,
    A,
    B,
    M,
    G,
    P,
    EL,
    ER,
    crossed,
    angleL,
    angleR,
    margin,
    warning:
      margin < 0.14
        ? 'Near a serial or parallel singularity.'
        : crossed
          ? 'Planar links cross; use offset layers or adjust branch.'
          : '',
  };
}
