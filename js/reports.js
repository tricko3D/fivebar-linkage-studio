// Detailed calculation audit, export and browser PDF print.
// Files run in the order specified in index.html; they share the application state.
'use strict';

// Self-contained audit report. Every numerical value is recalculated from the current
// configuration rather than reading rounded values from the on-screen labels.
const auditNum = (x, places = 8) => (Number.isFinite(x) ? Number(x).toFixed(places) : 'N/A');
const auditVector = (v, p = 4) => (v ? `(${auditNum(v.x, p)}, ${auditNum(v.y, p)})` : 'N/A');
const auditRadians = (x) => `${auditNum(x, 10)} rad`;
const auditTag = (title, lines) => [
  '',
  '## ' + title.replace(/^\d+\s+/, ''),
  '',
  '```text',
  ...lines,
  '```',
];
function gradientAudit(sol, s = state) {
  if (!sol.valid) return null;
  const delta = 0.3,
    samples = {},
    jac = {};
  for (const axis of ['x', 'y']) {
    const dp = axis === 'x' ? vec(delta, 0) : vec(0, delta);
    const plus = calc(add(sol.G, dp), s),
      minus = calc(sub(sol.G, dp), s);
    if (!plus.valid || !minus.valid)
      return {
        valid: false,
        reason: `IK not valid at one of the +/- ${delta} mm perturbations on ${axis.toUpperCase()}`,
      };
    const l = deltaAngle(plus.angleL, minus.angleL) / (2 * delta);
    const r = deltaAngle(plus.angleR, minus.angleR) / (2 * delta);
    samples[axis] = { plus, minus };
    jac[axis] = { l, r };
  }
  const a = jac.x.l,
    b = jac.y.l,
    c = jac.x.r,
    d = jac.y.r;
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-11)
    return {
      valid: false,
      reason: 'Numerical IK Jacobian determinant too small',
      samples,
      jac,
      det,
    };
  const JL = Math.hypot(d, -c) / Math.abs(det) / 1000;
  const JR = Math.hypot(-b, a) / Math.abs(det) / 1000;
  return {
    valid:
      Number.isFinite(JL) && Number.isFinite(JR) && JL <= 100 && JR <= 100 && sol.margin >= 0.025,
    reason: sol.margin < 0.025 ? 'Singularity margin below the numerical screening threshold' : '',
    samples,
    jac,
    a,
    b,
    c,
    d,
    det,
    JL,
    JR,
    delta,
  };
}
function buildAuditReport() {
  const s = { ...state },
    sol = calc(vec(s.targetX, s.targetY), s),
    pv = pivots(s);
  const cov = sampleCoverage(),
    sa = servoAnalysis(cov, s),
    mechCov = mechanicalCoverage();
  const base = mechanicalBase(s),
    m = mechanicalAt(sol, base, s),
    grad = gradientAudit(sol, s);
  const st = m.struct,
    bar = base.bars;
  const rep = [
    '# Fivebar Linkage Studio | Calculation audit',
    'Generated: ' + new Date().toISOString(),
    'Units: mm, degrees, g unless otherwise specified. Calculations use SI (m, kg, N, N*m).',
    'Snapshot type: user inputs + reproducible intermediate computations, not certified engineering results.',
    'Note: resize changes the four link LENGTHS. Link cross-sectional widths/heights do not change automatically.',
    'Coordinate system: board playing area upper left=(0,0), X right, Y down.',
    'Angles use atan2 with Y-positive down, so positive rotation is visually clockwise.',
    ...auditTag(
      '01  ORIGINAL CONFIGURATION (exact raw inputs)',
      Object.entries(s).map(([k, v]) => `${k.padEnd(22)} = ${JSON.stringify(v)}`),
    ),
    ...auditTag('02  CHESSBOARD & MOTOR MOUNTING', [
      `Playing board = ${auditNum(s.boardW, 4)} x ${auditNum(s.boardH, 4)} mm; square = ${auditNum(s.boardW / 8, 6)} x ${auditNum(s.boardH / 8, 6)} mm`,
      `Outer top = ${auditNum(s.outerW, 4)} x ${auditNum(s.outerH, 4)} mm`,
      `Padding: left/right = (outerW-boardW)/2 = ${auditNum((s.outerW - s.boardW) / 2, 6)} mm; top/bottom = ${auditNum((s.outerH - s.boardH) / 2, 6)} mm`,
      `Motor baseline angle = ${auditNum(s.angle, 5)} deg = ${auditNum(s.angle * RAD, 10)} rad`,
      `M midpoint = ${auditVector(pv.M)} mm`,
      `Motor A (left) = M - (sep/2)*[cos(angle), sin(angle)] = ${auditVector(pv.A)} mm`,
      `Motor B (right) = M + (sep/2)*[cos(angle), sin(angle)] = ${auditVector(pv.B)} mm`,
      `Distances: motor spacing = ${auditNum(dist(pv.A, pv.B), 6)} mm`,
      `Tool mapping: mode=${s.toolMode}; extension=${s.extension} mm; offset=(${s.offsetX}, ${s.offsetY}) mm`,
      `Fixed elbow branch=${s.branch}; forbid 2D crossing=${s.forbidCrossings}`,
    ]),
    ...auditTag('03  SELECTED POSITION & INVERSE KINEMATICS', [
      `Requested gripper G = ${auditVector(sol.G)} mm`,
      `Feasible=${sol.valid}; explanation=${sol.valid ? sol.warning || 'valid' : sol.reason}`,
      `Common joint P=${auditVector(sol.P)} mm`,
      `Left elbow E1=${auditVector(sol.EL)} mm`,
      `Right elbow E2=${auditVector(sol.ER)} mm`,
      ...(sol.valid
        ? [
            `Motor theta_L = atan2(E1.y-A.y, E1.x-A.x) mod 360 = ${auditNum(sol.angleL, 8)} deg`,
            `Motor theta_R = atan2(E2.y-B.y, E2.x-B.x) mod 360 = ${auditNum(sol.angleR, 8)} deg`,
            `Check link lengths: |A-E1|=${auditNum(dist(sol.A, sol.EL), 6)}, |E1-P|=${auditNum(dist(sol.EL, sol.P), 6)}, |B-E2|=${auditNum(dist(sol.B, sol.ER), 6)}, |E2-P|=${auditNum(dist(sol.ER, sol.P), 6)} mm`,
            `Serial metric L = abs(cross(E1-A,P-E1))/(L1*L2) = ${auditNum(Math.abs(cross(sub(sol.EL, sol.A), sub(sol.P, sol.EL))) / (s.l1 * s.l2), 9)}`,
            `Serial metric R = abs(cross(E2-B,P-E2))/(R1*R2) = ${auditNum(Math.abs(cross(sub(sol.ER, sol.B), sub(sol.P, sol.ER))) / (s.r1 * s.r2), 9)}`,
            `Parallel metric = abs(cross(P-E1,P-E2))/(L2*R2) = ${auditNum(Math.abs(cross(sub(sol.P, sol.EL), sub(sol.P, sol.ER))) / (s.l2 * s.r2), 9)}`,
            `Singularity margin=min(three metrics)=${auditNum(sol.margin, 9)}; caution when <0.14; numerical derivative rejected below 0.025`,
            `Planar centreline crossing=${sol.crossed}`,
          ]
        : []),
    ]),
    ...auditTag('04  MATERIAL, LINK CROSS-SECTIONS, MASSES', [
      `Manufacturing=${manufacturingMethods.find(method => method.key === s.manufacturing)?.label || 'Unspecified'}`,
      `Material=${materialPresets[s.material]?.label || 'Custom values'} (${s.material}); section=${s.sectionType}; box wall=${s.wall} mm`,
      `Preset assumptions=${materialPresets[s.material]?.note || 'Manually entered material properties'}`,
      'Important: Young modulus and density are indicative only; strength threshold is an adjustable screening input, NOT a certified allowable.',
      'FDM is anisotropic; moisture, layer orientation and processing may change properties significantly.',
      `Young's modulus input=${auditNum(s.youngMPa, 5)} MPa; effective stiffness factor=${auditNum(s.stiffFactor, 6)}`,
      `Effective E=youngMPa * 1,000,000 * stiffness factor = ${auditNum(s.youngMPa * 1e6 * s.stiffFactor, 4)} Pa`,
      `Density=${s.density} g/cm^3 = ${auditNum(s.density * 1000, 3)} kg/m^3`,
      `Rectangular section: A=b*h - bi*hi ; I=(b*h^3 - bi*hi^3)/12, dimensions converted to metres`,
      `For hollow box: bi=max(0,b-2*wall); hi=max(0,h-2*wall). I is vertical bending second moment of area.`,
      ...mechKeys.map(
        (k) =>
          `${k.toUpperCase()}: length=${auditNum(s[k], 5)} mm, width=${auditNum(s[k + 'W'], 5)} mm, height=${auditNum(s[k + 'H'], 5)} mm, A=${auditNum(bar[k].A, 12)} m^2, I=${auditNum(bar[k].I, 15)} m^4, mass=${auditNum(bar[k].mass * 1000, 5)} g, c=${auditNum(bar[k].c, 7)} m`,
      ),
      `Total idealized link mass=${auditNum(base.linkMass * 1000, 6)} g (no pivots, bearings, printed brackets or servo bodies)`,
    ]),
    ...auditTag('05  VERTICAL BENDING / DEFLECTION (simplified beam screening)', [
      `Model: parallel branches treated as two cantilever beam chains (NOT a full rigid-joint/FEA solution).`,
      `Per-link tip compliance c_i = L_i^3/(3*E*I_i), units m/N`,
      ...mechKeys.map(
        (k) =>
          `c_${k} = ${auditNum(bar[k].L, 8)}^3 /(3 * ${auditNum(s.youngMPa * 1e6 * s.stiffFactor, 3)} * ${auditNum(bar[k].I, 15)}) = ${auditNum(Math.pow(bar[k].L, 3) / (3 * s.youngMPa * 1e6 * s.stiffFactor * bar[k].I), 12)} m/N`,
      ),
      `cL=c_l1+c_l2=${auditNum(base.bars.l1.L ** 3 / (3 * s.youngMPa * 1e6 * s.stiffFactor * base.bars.l1.I) + base.bars.l2.L ** 3 / (3 * s.youngMPa * 1e6 * s.stiffFactor * base.bars.l2.I), 12)} m/N`,
      `cR=c_r1+c_r2=${auditNum(base.bars.r1.L ** 3 / (3 * s.youngMPa * 1e6 * s.stiffFactor * base.bars.r1.I) + base.bars.r2.L ** 3 / (3 * s.youngMPa * 1e6 * s.stiffFactor * base.bars.r2.I), 12)} m/N`,
      `Load share left=cR/(cL+cR)=${auditNum(base.shareL, 10)}`,
      `Load share right=cL/(cL+cR)=${auditNum(base.shareR, 10)}`,
      `Combined compliance cTip=cL*cR/(cL+cR)=${auditNum(base.tipCompliance, 12)} m/N`,
      `Per-link proxy self-sag=s_i=(m_i*g*L_i^3)/(8*E*I_i)`,
      ...mechKeys.map(
        (k) =>
          `s_${k} = ${auditNum(((bar[k].mass * 9.81 * Math.pow(bar[k].L, 3)) / (8 * s.youngMPa * 1e6 * s.stiffFactor * bar[k].I)) * 1000, 8)} mm`,
      ),
      `Weighted self sag=${auditNum(base.ownSag * 1000, 9)} mm`,
      `Tool mass=${auditNum(s.headG, 3)} g, payload=${auditNum(s.payloadG, 3)} g, sum=${auditNum(s.headG + s.payloadG, 3)} g`,
      `Downward load F=(headG+payloadG)/1000*9.81 = ${auditNum(((s.headG + s.payloadG) / 1000) * 9.81, 9)} N`,
      `Total sag=(weighted self sag + F*cTip)*1000 = ${auditNum(st.sag, 9)} mm; allowed ${s.sagLimit} mm`,
      `Moment proxy for each side: M_near=F*share*(Lnear+Lfar)+mnear*g*Lnear/2+mfar*g*(Lnear+Lfar/2)`,
      `M_far=F*share*Lfar+mfar*g*Lfar/2 ; stress sigma=M*c/I/1e6 MPa`,
      ...['l', 'r'].flatMap((side) => {
        const near = bar[side + '1'],
          far = bar[side + '2'],
          share = side === 'l' ? base.shareL : base.shareR;
        const F = ((s.headG + s.payloadG) / 1000) * 9.81;
        const Mn =
          F * share * (near.L + far.L) +
          (near.mass * 9.81 * near.L) / 2 +
          far.mass * 9.81 * (near.L + far.L / 2);
        const Mf = F * share * far.L + (far.mass * 9.81 * far.L) / 2;
        return [
          `${side.toUpperCase()} near moment=${auditNum(Mn, 10)} N*m ; stress=${auditNum((Mn * near.c) / near.I / 1e6, 9)} MPa`,
          `${side.toUpperCase()} far  moment=${auditNum(Mf, 10)} N*m ; stress=${auditNum((Mf * far.c) / far.I / 1e6, 9)} MPa`,
        ];
      }),
      `Worst bending stress=${auditNum(st.stress, 9)} MPa; allowable=${auditNum(s.stressLimit, 5)} MPa`,
      `NOTE: simplified structural sag currently does NOT vary with XY joint angle; real assembly sag WILL vary.`,
    ]),
    ...auditTag('06  XY MOTOR TORQUE / FINITE-DIFFERENCE JACOBIAN', [
      `Motor profile=${motorPresets[s.motorPreset]?.label || 'Custom values'} (${s.motorPreset})`,
      'Motor torque screening uses unverified drag and friction assumptions, not measured motor load.',
      `Motor preset context=${motorPresets[s.motorPreset]?.rating || 'Manual inputs'}; running estimates are not datasheet stall/holding torque or a tested speed curve`,
      `Motor running torque entered=${auditNum(s.motorNm, 8)} N*m`,
      `Reduction ratio=${auditNum(s.ratio, 6)}; efficiency=${auditNum(s.efficiency, 6)}%; safety factor=${auditNum(s.motorSF, 5)}`,
      `Derated available torque=motorNm*ratio*(efficiency/100)/motorSF=${auditNum(base.allowTorque, 10)} N*m / motor`,
      `Acceleration=${auditNum(s.accel, 6)} mm/s^2 = ${auditNum(s.accel / 1000, 9)} m/s^2`,
      `Resistive XY drag=${auditNum(s.dragN, 8)} N; added bearing friction=${auditNum(s.bearingFrictionNm, 9)} N*m per motor`,
      `Effective moving mass=(headG+payloadG)/1000 + 0.5*(link mass kg)=${auditNum((s.headG + s.payloadG) / 1000 + base.linkMass * 0.5, 10)} kg`,
      `Conservative XY force proxy Fxy=dragN+moving mass*(accel/1000) = ${auditNum(s.dragN + (((s.headG + s.payloadG) / 1000 + base.linkMass * 0.5) * s.accel) / 1000, 10)} N`,
      `Jacobian approximation uses central differences of inverse motor angles at +/-0.3 mm in X and Y.`,
      `For each motor: dtheta/dx ~= [theta(x+0.3)-theta(x-0.3)] / 0.6 mm ; angles unwrapped across +/-180.`,
      `Inverse matrix dXY/dtheta uses determinant det=a*d-b*c; a=dL/dx, b=dL/dy, c=dR/dx, d=dR/dy.`,
      `Motor lever-arm proxy: J_L=hypot(d,-c)/abs(det)/1000, J_R=hypot(-b,a)/abs(det)/1000 in m/rad.`,
      `Estimated torque_i=Fxy*J_i + bearingFrictionNm; direction-specific force decomposition is NOT solved.`,
      ...(grad && grad.samples
        ? ['x', 'y'].flatMap((axis) => {
            const sample = grad.samples[axis];
            return [
              `${axis.toUpperCase()} +${grad.delta} mm: theta L/R=${auditNum(sample.plus.angleL, 10)} / ${auditNum(sample.plus.angleR, 10)} deg`,
              `${axis.toUpperCase()} -${grad.delta} mm: theta L/R=${auditNum(sample.minus.angleL, 10)} / ${auditNum(sample.minus.angleR, 10)} deg`,
              `dtheta/d${axis} = L ${auditNum(grad.jac[axis].l, 12)}, R ${auditNum(grad.jac[axis].r, 12)} rad/mm`,
            ];
          })
        : []),
      ...(grad && grad.valid
        ? [
            `a=${auditNum(grad.a, 12)}, b=${auditNum(grad.b, 12)}, c=${auditNum(grad.c, 12)}, d=${auditNum(grad.d, 12)} rad/mm`,
            `det=${auditNum(grad.det, 16)} (rad/mm)^2`,
            `J_L=${auditNum(grad.JL, 10)} m/rad ; J_R=${auditNum(grad.JR, 10)} m/rad`,
          ]
        : [`Jacobian unavailable: ${grad?.reason || 'unreachable gripper'}`]),
      `Estimated left motor torque=${auditNum(m.torque.L, 10)} N*m; right=${auditNum(m.torque.R, 10)} N*m`,
      `Fraction of derated allowance: left=${auditNum(m.torque.L / base.allowTorque, 9)}, right=${auditNum(m.torque.R / base.allowTorque, 9)}`,
      `NOTE: NEMA17 torque varies with speed/current/driver settings; no rotor inertia, acceleration dynamics, servo limits or calibrated friction included.`,
    ]),
    ...auditTag('07  PAYLOAD SEARCH / DESIGN LIMITS', [
      `Maximum search cap=${capPayloadG} g. All payload limits use binary search over [0,${capPayloadG}] g (23 iterations).`,
      `Vertical sag threshold=${s.sagLimit} mm`,
      `Allowable beam stress=${s.stressLimit} MPa`,
      `Motor torque per motor allowance=${auditNum(base.allowTorque, 10)} N*m`,
      `Sag-only payload limit = ${auditNum(m.sagLimit, 6)} g`,
      `Stress-only payload limit = ${auditNum(m.strengthLimit, 6)} g`,
      `Combined structural min = ${auditNum(m.structuralLimit, 6)} g`,
      `Motor-torque-only payload limit = ${auditNum(m.torqueLimit, 6)} g`,
      `Vertical-only estimated payload = ${auditNum(m.structuralLimit, 6)} g (sag/stress only; NOT certified)`,
      `XY-motion-limited payload proxy = ${auditNum(m.torqueLimit, 6)} g (does NOT measure static lifting ability)`,
      `Conservative combined screening = min(vertical-only, XY motor proxy) = ${auditNum(m.finalLimit, 6)} g`,
      `Identified limiting assumption=${m.limiting}`,
      `Screening OK at selected payload=${m.loadOK}`,
      `Caution: reaching search cap does not establish a real-world load capacity.`,
    ]),
    ...auditTag('08  BOARD COVERAGE AND ANGULAR TRAVEL', [
      `Square centres within geometry and enabled hard stops=${cov.okCenters}/64`,
      `3x3 samples per square within geometry and enabled hard stops=${cov.angles.length}/576`,
       `Sample coverage with mechanical stops=${auditNum(cov.percentage, 6)}%`,
      `Mechanical hard stops enabled=${s.useJointLimits}`,
      `Left output joint min=${s.leftMinAngle} deg, max=${s.leftMaxAngle} deg, sweep=${auditNum(hardStopSweep(s.leftMinAngle,s.leftMaxAngle), 6)} deg`,
      `Right output joint min=${s.rightMinAngle} deg, max=${s.rightMaxAngle} deg, sweep=${auditNum(hardStopSweep(s.rightMinAngle,s.rightMaxAngle), 6)} deg`,
      `Motor-shaft travel=${s.servoTravel} deg; margin at MOTOR each end=${s.servoMargin} deg; reduction=${s.ratio}:1; usable OUTPUT joint=${auditNum(sa.usable, 6)} deg`,
      '360 deg travel denotes a continuous-angle motor model; physical hard stops must be configured separately.',
      `Left minimal continuous angular arc: start=${auditNum(sa.leftArc?.start, 8)} deg, span=${auditNum(sa.leftArc?.span, 8)} deg`,
      `Right minimal continuous angular arc: start=${auditNum(sa.rightArc?.start, 8)} deg, span=${auditNum(sa.rightArc?.span, 8)} deg`,
      `Best servo left window start=${auditNum(sa.leftWindow?.start, 8)} deg, width=${auditNum(sa.usable, 8)} deg`,
      `Best servo right window start=${auditNum(sa.rightWindow?.start, 8)} deg, width=${auditNum(sa.usable, 8)} deg`,
      `Squares within angular travel=${sa.centers}/64; samples within fitted windows=${sa.samples}/576`,
      `Full 576-point geometric+angular pass=${sa.full}`,
      `Near-singular square centres (margin<0.14)=${mechCov.singularCount}/64`,
      `Motor-torque-over-limit square centres=${mechCov.motorOver}/64`,
      `Maximum evaluated square-centre motor demand=${auditNum(mechCov.maxTorque, 9)} N*m at ${mechCov.maxTorqueSquare || 'N/A'}`,
      `Torque evaluated at ${mechCov.motorChecked}/64 square centres; others cannot be claimed to pass.`,
      `Required motor shaft running torque to pass evaluated centres (same ratio, efficiency, SF)=${auditNum(mechCov.requiredMotorNm, 9)} N*m`,
      `Minimum combined screening payload over reachable square centres=${auditNum(mechCov.worst, 6)} g at ${mechCov.critical || 'N/A'}`,
      `CAUTION: worst-square result excludes unreachable centres and is not a global safe working load.`,
    ]),
    ...auditTag('09  ALL 64 SQUARE CENTRES (position-dependent outputs)', [
      'Square  X(mm)   Y(mm) IK  L(deg)  R(deg)  margin    L(Nm)   R(Nm)  sag(mm) stress(MPa) vert(g)  XY(g) comb(g) Servo',
      ...Array.from({ length: 64 }, (_, i) => {
        const row = Math.floor(i / 8),
          col = i % 8,
          g = squarePos(col, row),
          v = calc(g, s),
          a = v.valid ? mechanicalAt(v, base, s) : null;
        const items = [
          squareName(col, row).padEnd(5),
          auditNum(g.x, 2).padStart(7),
          auditNum(g.y, 2).padStart(7),
          (v.valid ? 'Y' : 'N').padStart(2),
          auditNum(v.angleL, 3).padStart(8),
          auditNum(v.angleR, 3).padStart(8),
          auditNum(v.margin, 4).padStart(8),
          auditNum(a?.torque.L, 5).padStart(8),
          auditNum(a?.torque.R, 5).padStart(8),
          auditNum(a?.struct.sag, 3).padStart(8),
          auditNum(a?.struct.stress, 3).padStart(11),
          auditNum(a?.structuralLimit, 2).padStart(7),
          auditNum(a?.torqueLimit, 2).padStart(7),
          auditNum(a?.finalLimit, 2).padStart(7),
          (servoPass(v, sa) ? 'Y' : 'N').padStart(5),
        ];
        return items.join(' ');
      }),
    ]),
    ...auditTag('10  QUEEN XY PATH: GEAR RATIO, SPEED, TORQUE AND INTERMEDIATE VALUES', [
      `Source / destination: ${s.routeFrom} to ${s.routeTo} (no lifting or obstacles modeled)`,
      `Gear reduction: ${auditNum(s.ratio, 6)} motor rev / output rev (1=direct-drive)`,
      `Transmission efficiency: ${auditNum(s.efficiency, 6)}%`,
      `Assumed motor running torque at commanded speed: ${auditNum(s.motorNm, 8)} N*m`,
      `Gear output nominal torque = motorNm*ratio*efficiency/100 = ${auditNum((s.motorNm * s.ratio * s.efficiency) / 100, 9)} N*m`,
      `After safety factor: nominal/motorSF = ${auditNum(base.allowTorque, 9)} N*m`,
      `Assumed usable motor RPM: ${auditNum(s.motorRPM, 4)} RPM`,
      `Output shaft RPM at that speed = motorRPM/ratio = ${auditNum(s.motorRPM / s.ratio, 6)} RPM`,
      `Output shaft angular speed = motorRPM/ratio * 6 = ${auditNum((s.motorRPM / s.ratio) * 6, 6)} deg/s`,
      `Requested gripper speed=${auditNum(s.xySpeed, 5)} mm/s; XY accel=${auditNum(s.accel, 5)} mm/s^2`,
      `Auto speed cap enabled=${s.speedCap}`,
      `Route formula: G(t) = G0 + unit(G1-G0) * distance(t); acceleration profile is triangular or trapezoidal.`,
      `Motor derivatives: a=d(thetaL)/dx, b=d(thetaL)/dy, c=d(thetaR)/dx, d=d(thetaR)/dy (rad/mm).`,
      `Numerical derivative uses IK angles at +/- 0.25mm in x,y; unwrap angles across 360deg.`,
      `dthetaL/dt = (a*dirX+b*dirY)*XY_velocity_mm_s; dthetaR/dt = (c*dirX+d*dirY)*XY_velocity_mm_s`,
      `Input motor RPM = abs(dtheta/dt) * 60/(2*pi) * gear_ratio.`,
      `Effective moving mass = (headG+payloadG)/1000 + 0.5 * ideal_link_mass_kg`,
      `Directed XY force = (effective_mass_kg * accel_mm_s2/1000 + XY_drag_N*sign(velocity)) * unit_direction.`,
      `J_xy = inverse([a,b;c,d]), units mm/rad. Each torque_i = abs((J_xy column_i dot XY_force)/1000) + motor friction allowance.`,
      `Transmission estimate compares output torque demand to motorNm*ratio*efficiency/motorSF; this is NOT a motor torque-speed curve.`,
      `Rotor inertia, full link inertia, stepper dynamics, load-dependent efficiency, gearbox play, Z movement and chess-piece collision are omitted.`,
      ...(routeData?.valid
        ? [
            `Path distance=${auditNum(routeData.length, 7)} mm; effective XY top speed=${auditNum(routeData.effectiveSpeed, 7)} mm/s`,
            `Estimated max speed before motor RPM cap=${auditNum(routeData.motorCap, 7)} mm/s`,
            `Profile: accel phase=${auditNum(routeData.profile.tA, 7)} s, cruise=${auditNum(routeData.profile.cruise, 7)} s, decel phase=${auditNum(routeData.profile.tA, 7)} s`,
            `Profile peak speed=${auditNum(routeData.profile.vmax, 7)} mm/s; duration=${auditNum(routeData.profile.duration, 7)} s`,
            `Moving mass=${auditNum(routeData.moveMass, 9)} kg; path min singularity metric=${auditNum(routeData.minMargin, 9)}`,
            `Maximum L/R output torques=${auditNum(routeData.maxTorqueL, 9)} / ${auditNum(routeData.maxTorqueR, 9)} N*m`,
            `Maximum L/R input motor speeds=${auditNum(routeData.maxRPML, 7)} / ${auditNum(routeData.maxRPMR, 7)} RPM`,
            `Total samples=${routeData.samples.length}. Trace columns: time s, x mm, y mm, XY velocity mm/s, XY acceleration mm/s^2, motor angles deg, output torques N*m, input RPM.`,
            't(s) x(mm) y(mm) v(mm/s) a(mm/s2) thL(deg) thR(deg) torqueL(Nm) torqueR(Nm) inputRPML inputRPMR',
            ...routeData.samples.map((x) =>
              [
                x.t,
                x.pos.x,
                x.pos.y,
                x.speed,
                x.accel,
                x.thetaL,
                x.thetaR,
                x.tauL,
                x.tauR,
                x.rpmL,
                x.rpmR,
              ]
                .map((v) => auditNum(v, 6))
                .join(' '),
            ),
          ]
        : [`Trajectory unavailable: ${routeData?.reason || 'invalid configuration'}`]),
    ]),
    ...auditTag('11  HOW TO REPRODUCE / LIMITATIONS', [
      '1. Recreate the input parameters in Section 01. For a target square, calculate G=((col+0.5)*boardW/8, (row+0.5)*boardH/8).',
      '2. Solve two circle-circle intersections (proximal radius, distal radius) for each arm, keeping the selected branch fixed.',
      '3. Compute link section areas / moments of inertia and the compliance equations in Sections 04-05.',
      '4. For XY torque, compute four nearby IK positions, finite-difference angles, invert the 2x2 Jacobian and apply the screening force proxy.',
      '5. For payload thresholds, vary payload until each limit is met. Cap is 2000 g; binary search iterations=23.',
      '6. This analytical proxy omits joint rotational stiffness, 3D deformation, print anisotropy, fasteners, motor torque-speed curves and impact loads.',
      '7. Magnitude-only Jacobian torque estimate assumes a worst-case planar force direction at each joint. It is not a verified dynamic or static lifting calculation.',
      '8. Some structural terms assume simplified load sharing and fixed-end beams; real five-bar arms have pivot joints, so treat sag/stress as ranking proxies.',
      '9. Link mass excludes reinforcement, joints, bearings, wiring, Z guide, motors and any supports. Tool head mass must account for those at G.',
      '10. Vertical-only payload and XY-motion capacity are different checks; a zero combined result does not mean a chess piece cannot be held or lifted.',
      '11. Verify predictions against physical test masses, deflection measurements and actual motor current settings before using any payload limit.',
    ]),
    '',
    'END OF REPORT',
    '',
  ];
  // Readers see conclusions, key parameters, then formulas. Preserve the
  // complete original audit as collapsed sections, including the 64 squares.
  const fmt=(n, digits=2, unit='')=>Number.isFinite(n)
    ? Number(n).toLocaleString('en-US',{maximumFractionDigits:digits})+(unit?(unit==='%'||unit==='°'?'':' ')+unit:'')
    : 'N/A';
  const perc=(n,d)=>d>0?fmt(n/d*100,1,'%'):'N/A';
  const cap=n=>n>=capPayloadG-.5?'≥2,000 g (search cap)':fmt(n,1,'g');
  const usage=(estimate,limit)=>limit>0&&Number.isFinite(estimate)?fmt(100*estimate/limit,0,'%'):'N/A';
  const validTorque=sol.valid&&!!m.gradient;
  const maxTorque=Math.max(m.torque.L,m.torque.R);
  const summary=!sol.valid?'Unreachable target: '+(sol.reason||'invalid linkage geometry')
    :!m.gradient?'Motor torque cannot be evaluated reliably at this position'
    :m.loadOK?'Selected payload passes the simplified screening checks'
    :'Selected payload exceeds or approaches at least one screening limit';
  const mat=materialPresets[s.material]?.label||'Custom values';
  const process=manufacturingMethods.find(item=>item.key===s.manufacturing)?.label||'Unspecified';
  const overview=[
    '# Fivebar Linkage Studio — Engineering report',
    '',
    `Generated: ${new Date().toISOString()} · All dimensions in mm unless stated otherwise; +Y points down.`,
    '',
    '![Dimensioned CAD drawing](drawing.svg)',
    '',
    '> **Screening only:** Simplified mechanical and kinematic estimates; NOT FEA, a validated motor model, or a safe working-load certification.',
    '',
    '## Executive summary',
    '',

    /[.!?]$/.test(summary) ? summary : summary+'.',
    '',
    '| Question | Result |',
    '|:---|:---|',
    `| Selected gripper position reachable? | ${sol.valid?'Yes':'No'} |`,
    `| Selected payload passes model checks? | ${m.loadOK?'Yes':'No / cannot assess reliably'} |`,
    `| Reachable chess-square centres | ${cov.okCenters} / 64 (${perc(cov.okCenters,64)}) |`,
    `| Reachable test points | ${cov.angles.length} / 576 (${perc(cov.angles.length,576)}) |`,
    `| Limiting model assumption | ${m.limiting} |`,
    '',
    '### Key engineering estimates',
    '',
    '| Quantity | Model estimate | Model threshold | Used |',
    '|:---|---:|---:|---:|',
    `| Vertical deflection | ${fmt(st.sag,3,'mm')} | ${fmt(s.sagLimit,2,'mm')} | ${usage(st.sag,s.sagLimit)} |`,
    `| Maximum bending stress | ${fmt(st.stress,2,'MPa')} | ${fmt(s.stressLimit,2,'MPa')} | ${usage(st.stress,s.stressLimit)} |`,
    `| Maximum output motor torque at selected point | ${validTorque?fmt(maxTorque,3,'N·m'):'Unavailable'} | ${fmt(base.allowTorque,3,'N·m')} | ${validTorque?usage(maxTorque,base.allowTorque):'N/A'} |`,
    `| Worst of 64 centre torque demands | ${fmt(mechCov.maxTorque,3,'N·m')} @ ${mechCov.maxTorqueSquare||'N/A'} | ${fmt(base.allowTorque,3,'N·m')} | ${usage(mechCov.maxTorque,base.allowTorque)} |`,
    `| Centre torque estimates within limit | ${mechCov.motorChecked-mechCov.motorOver}/${mechCov.motorChecked} evaluated | 64/64 required | — |`,
    `| Motor shaft torque needed for evaluated centres | ${fmt(mechCov.requiredMotorNm,3,'N·m')} | At speed, same reduction/SF | — |`,
    (mechCov.motorChecked===64?'':'| **Caution** | Some centre torques could not be evaluated | No full-board torque pass | — |'),
    `| Combined screening payload | ${validTorque?cap(m.finalLimit):'Unavailable'} | ${fmt(s.payloadG,0,'g')+' selected'} | — |`,
    '',
    'XY torque estimates planar movement, not vertical lifting.',
    '',
    '## Model configuration',
    '',
    '| Parameter | Value |',
    '|:---|:---|',
    `| Manufacturing & material | ${process} / ${mat} |`,
    `| Board | ${fmt(s.boardW,1,'mm')} × ${fmt(s.boardH,1,'mm')} |`,
    `| Motor spacing / baseline angle | ${fmt(s.sep,1,'mm')} / ${fmt(s.angle,1,'°')} |`,
    `| Motor model | ${motorPresets[s.motorPreset]?.label || 'Custom values'} |`,
    `| Link lengths (L1, L2, R1, R2) | ${['l1','l2','r1','r2'].map(k=>fmt(s[k],1,'mm')).join(' / ')} |`,
    `| Target (X, Y) | (${fmt(s.targetX,1)}, ${fmt(s.targetY,1)}) mm |`,
    `| Motor output angles | ${sol.valid?fmt(sol.angleL,2,'°')+' / '+fmt(sol.angleR,2,'°'):'Unavailable'} |`,
    `| Motor hard stops (MIN–MAX) | M₁ ${fmt(s.leftMinAngle,1,'°')}–${fmt(s.leftMaxAngle,1,'°')} / M₂ ${fmt(s.rightMinAngle,1,'°')}–${fmt(s.rightMaxAngle,1,'°')} (${s.useJointLimits?'enforced':'disabled'}) |`,
    `| Tool + payload | ${fmt(s.headG,0,'g')} + ${fmt(s.payloadG,0,'g')} |`,
    `| Idealized total link mass | ${fmt(base.linkMass*1000,1,'g')} |`,
    '',
    '### Link dimensions and masses',
    '',
    '| Link | Length | Width × height | Mass |',
    '|:---|---:|---:|--:|',
    ...mechKeys.map(k=>`| ${k.toUpperCase()} | ${fmt(s[k],1,'mm')} | ${fmt(s[k+'W'],1,'mm')} × ${fmt(s[k+'H'],1,'mm')} | ${fmt(bar[k].mass*1000,2,'g')} |`),
    '',
    '## Equations explained',
    '',
    '### 1. Material stiffness and cross section',
    '',
    'Effective Young modulus and hollow-section bending inertia:',
    '',
    String.raw`$$
E_{\mathrm{eff}} = E_{\mathrm{input}} f_{\mathrm{stiff}},
\qquad I = \frac{bh^3-b_i h_i^3}{12}
$$`,
    '',
    `For ${mat}, this model uses **${fmt(s.youngMPa*s.stiffFactor,0,'MPa')}** effective modulus, from **${fmt(s.youngMPa,0,'MPa')}** input × **${fmt(s.stiffFactor,2)}** factor.`,
    '',
    '### 2. Vertical bending',
    '',
    'Each link is approximated as a cantilever. The two branches share a load using their compliances. Here L is link length, E is Young modulus, I is bending inertia, F is the combined head-and-payload weight in newtons, and the factor 1,000 converts metres to millimetres:',
    '',
    String.raw`$$
\begin{aligned}
C_i &= \frac{L_i^3}{3 E_{\mathrm{eff}} I_i} \\
C_{\mathrm{tip}} &= \frac{C_L C_R}{C_L+C_R} \\
\delta_{\mathrm{tip}} &= 10^3(\delta_{\mathrm{self}} + F C_{\mathrm{tip}})
\end{aligned}
$$`,
    '',
    `Result: **${fmt(st.sag,3,'mm')}**, against your **${fmt(s.sagLimit,2,'mm')}** threshold. Real pivot and frame flexibility are not modeled.`,
    '',
    '### 3. Motor output and transmission',
    '',
    'The available output-joint torque is derated for gearing efficiency and safety:',
    '',
    String.raw`$$
\tau_{\mathrm{allow}} =
\frac{\tau_{\mathrm{motor}}\,r\,\eta}{SF}
$$`,
    '',
    `For **${fmt(s.ratio,2)}:1** reduction and **${fmt(s.efficiency,1,'%')}** efficiency, the allowance is **${fmt(base.allowTorque,3,'N·m')} per motor**.`,
    '',
    'The inverse-kinematics Jacobian estimates planar torque:',
    '',
    String.raw`$$
\tau_i \approx F_{xy} J_i + \tau_{\mathrm{friction}}
$$`,
    '',
    'The 0.3 N default drag and 0.015 N·m joint friction are UNMEASURED assumptions. The motor running torque preset is illustrative; green means only that the configured screening bounds pass. This proxy omits full arm inertia and the real speed–torque curve.',
    '',
    '### 4. Workspace reachability',
    '',
    'A position must satisfy the linkage geometry and enabled physical limits. Servo travel is assessed separately:',
    '',
    String.raw`$$
\mathrm{Coverage}=\frac{N_{\mathrm{reachable}}}{64}\times100\%
$$`,
    '',
    `**${cov.okCenters} of 64 centres** and **${cov.angles.length} of 576 samples** are reachable under the sampled criteria.`,
    '',
    '## Payload search limits',
    '',
    '| Simplified check | Estimated threshold |',
    '|:---|---:|',
    `| Vertical deflection | ${cap(m.sagLimit)} |`,
    `| Bending stress | ${cap(m.strengthLimit)} |`,
    `| Both structural checks | ${cap(m.structuralLimit)} |`,
    `| XY torque | ${validTorque?cap(m.torqueLimit):'Unavailable'} |`,
    '',
    '> **Important:** A result of ≥2,000 g indicates the binary search hit its ceiling. It does **not** demonstrate that the mechanism can safely lift 2 kg.',
    '',
    '## Detailed numerical audit',
    '',
    'Detailed equations and tables; expand **Raw calculation log** for full precision.',
    ''
  ];
  const sections=rep.join('\n').split(/\n(?=## )/);
  sections.shift();
  const rawSections=sections.map(section=>{
    const lines=section.split('\n');
    return {title:(lines.shift()||'').replace(/^##\s*/,'').trim(),lines};
  });
  const appendices=buildEngineeringAuditAppendices({
    s,sol,pv,cov,sa,mechCov,base,m,grad,bar,rawSections,
    route:typeof routeData==='undefined'?null:routeData
  });
  return [...overview,...appendices].join('\n');
}
function downloadAuditMarkdown() {
  download('fivebar-calculation-report.md', buildAuditReport(), 'text/markdown;charset=utf-8');
}
// Equations-file syntax: global variable declarations for SolidWorks Tools > Equations > Import.
// Distances are in mm, angles in degrees; no linkage solver assumptions are encoded here.
function buildSolidWorksVariables() {
  const s = state, pv = pivots(s);
  // Joint angles refer to output links, measured in the board's Y-down frame.
  // For pose geometry, ignore simulated hard stops and crossing policy; those
  // affect operational reachability, not whether the four bars intersect.
  const pose = calc(vec(s.targetX, s.targetY), {
    ...s, useJointLimits: false, forbidCrossings: false
  });
  const mm = (name, value) => `"${name}" = ${Number(value.toFixed(5))}mm`;
  const deg = (name, value) => `"${name}" = ${Number(value.toFixed(5))}deg`;
  const unit = (name, value) => `"${name}" = ${Number(value.toFixed(6))}`;
  return [
    "' Fivebar Linkage Studio | SolidWorks global variables",
    "' Import with Tools > Equations > Import. Link variables to sketch dimensions/mates manually.",
    "' Coordinate origin: top-left playable chessboard; +X right, +Y down.",
    "' Angular values are absolute to +X on the output shafts, NOT the geared motor shafts.",
    "' In this Y-down coordinate frame, angles increase clockwise on screen.",
    '',
    "' 01 BOARD DIMENSIONS",
    mm('BoardWidth', s.boardW), mm('BoardHeight', s.boardH),
    mm('OuterBoardWidth', s.outerW), mm('OuterBoardHeight', s.outerH),
    mm('BoardMarginX', (s.outerW - s.boardW) / 2),
    mm('BoardMarginY', (s.outerH - s.boardH) / 2),
    mm('SquareWidth', s.boardW / 8), mm('SquareHeight', s.boardH / 8),
    '',
    "' 02 MOTOR MOUNTING",
    mm('MotorSpacing', s.sep), mm('MotorMidpointX', s.mountX),
    mm('MotorMidpointY', s.mountY), deg('MotorBaselineAngle', s.angle),
    mm('MotorAX', pv.A.x), mm('MotorAY', pv.A.y),
    mm('MotorBX', pv.B.x), mm('MotorBY', pv.B.y),
    '',
    "' 03 LINKS AND GRIPPER",
    mm('LeftProximalLength', s.l1), mm('LeftDistalLength', s.l2),
    mm('RightProximalLength', s.r1), mm('RightDistalLength', s.r2),
    mm('LinkLeftProximalWidth', s.l1W), mm('LinkLeftProximalHeight', s.l1H),
    mm('LinkLeftDistalWidth', s.l2W), mm('LinkLeftDistalHeight', s.l2H),
    mm('LinkRightProximalWidth', s.r1W), mm('LinkRightProximalHeight', s.r1H),
    mm('LinkRightDistalWidth', s.r2W), mm('LinkRightDistalHeight', s.r2H),
    mm('WallThickness', s.wall),
    mm('ToolExtension', s.extension),
    mm('ToolOffsetX', s.offsetX), mm('ToolOffsetY', s.offsetY),
    mm('TargetX', s.targetX), mm('TargetY', s.targetY),
    "' Branch signs: 1=plus elbow, -1=minus elbow.",
    unit('LeftElbowBranchSign', s.branch[0] === '+' ? 1 : -1),
    unit('RightElbowBranchSign', s.branch[1] === '+' ? 1 : -1),
    "' Gripper modes: 0=joint, 1=left extension, 2=right extension, 3=fixed offset.",
    unit('ToolMountModeCode', ({ joint:0, left:1, right:2, fixed:3 })[s.toolMode]),
    unit('CrossSectionIsBox', s.sectionType === 'box' ? 1 : 0),
    unit('CrossingsForbidden', s.forbidCrossings ? 1 : 0),
    '',
    "' 04 OUTPUT JOINT HARD STOPS (simulator values, not physical stop geometry)",
    unit('HardStopsEnabled', s.useJointLimits ? 1 : 0),
    deg('LeftJointMinAngle', s.leftMinAngle),
    deg('LeftJointMaxAngle', s.leftMaxAngle),
    deg('RightJointMinAngle', s.rightMinAngle),
    deg('RightJointMaxAngle', s.rightMaxAngle),
    deg('LeftJointAllowedSweep', hardStopSweep(s.leftMinAngle, s.leftMaxAngle)),
    deg('RightJointAllowedSweep', hardStopSweep(s.rightMinAngle, s.rightMaxAngle)),
    "' MIN is the clockwise sweep start; MAX is the end (may wrap across 0 degrees).",
    deg('ServoRatedTravel', s.servoTravel),
    deg('ServoEndMargin', s.servoMargin),
    deg('ServoUsableTravel', Math.max(0, Math.min(360, s.servoTravel - 2 * s.servoMargin))),
    unit('GearReduction', s.ratio),
    '',
    "' 05 CURRENT SIMULATED POSITION (linkage geometry only)",
    ...(pose.valid ? [
      mm('JointPX', pose.P.x), mm('JointPY', pose.P.y),
      mm('LeftElbowX', pose.EL.x), mm('LeftElbowY', pose.EL.y),
      mm('RightElbowX', pose.ER.x), mm('RightElbowY', pose.ER.y),
      deg('CurrentLeftJointAngle', pose.angleL),
      deg('CurrentRightJointAngle', pose.angleR)
    ] : ["' No feasible four-bar pose at current target; current joint/elbow variables omitted."]),
    '',
    "' 06 SIMULATION REFERENCE INPUTS (not automatically assigned to CAD materials or forces)",
    "' Unitless reference values include their original units in the variable name.",
    "' Manufacturing method: " + (manufacturingMethods.find(method => method.key === s.manufacturing)?.label || 'Unspecified'),
    "' Selected link material: " + (materialPresets[s.material]?.label || 'Custom values'),
    "' ManufacturingMethodCode retains historical identifiers (FDM=1, SLS=2, SLA=3, CNC=5).",
    unit('ManufacturingMethodCode', manufacturingMethods.find(method => method.key === s.manufacturing)?.code ?? 0),
    "' MaterialPresetCode identifiers: Custom=0, PLA=1, PETG=2; remaining codes follow the preset catalog.",
    "' Bending threshold is a manually adjustable screening limit, not a design certification.",
    unit('MaterialPresetCode', materialPresets[s.material]?.code ?? 0),
    unit('MaterialYoungModulus_MPa', s.youngMPa),
    unit('MaterialDensity_gcm3', s.density),
    unit('PrintedStiffnessFactor', s.stiffFactor), // legacy variable name kept for compatibility
    unit('EffectiveStiffnessFactor', s.stiffFactor),
    unit('AllowableStress_MPa', s.stressLimit),
    unit('EffectiveYoungModulus_MPa', s.youngMPa * s.stiffFactor),
    mm('AllowableDeflection', s.sagLimit),
    unit('GripperHeadMass_g', s.headG),
    unit('PayloadMass_g', s.payloadG),
    unit('MotorTorqueAtSpeed_Nm', s.motorNm),
    unit('MotorSafetyFactor', s.motorSF),
    unit('MotorRatedRPM', s.motorRPM),
    unit('TransmissionEfficiency_percent', s.efficiency),
    unit('BearingFriction_Nm', s.bearingFrictionNm),
    unit('TargetXYSpeed_mmps', s.xySpeed),
    unit('TargetXYAcceleration_mmps2', s.accel),
    unit('DragForce_N', s.dragN),
    unit('AutoSpeedCapEnabled', s.speedCap ? 1 : 0),
    '',
    "' Not exported as numeric CAD variables: display toggles, heatmap type, route square",
    "' names, or fitted servo-window estimates (they are calculated from sampled coverage).",
    "' Export the JSON configuration to preserve every input including those metadata fields.",
    "' Hard stop geometry (cam diameter, switch location, clearance) is not modeled here.",
    ''
  ].join('\n');
}
function downloadSolidWorksVariables() {
  download('fivebar-solidworks-variables.txt',buildSolidWorksVariables(),'text/plain;charset=utf-8');
}
function download(name, body, mime) {
  const blob = new Blob([body], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
