// Reader-friendly explanations for each detailed audit section.
// Exact machine-output values remain available behind a second disclosure.
'use strict';

function buildEngineeringAuditAppendices(ctx) {
  const {s,sol,pv,cov,sa,mechCov,base,m,grad,bar,rawSections,route} = ctx;
  const fmt=(n,d=3)=>Number.isFinite(n)?Number(n).toLocaleString('en-US',{maximumFractionDigits:d}):'N/A';
  const val=(n,u,d=3)=>fmt(n,d)+(u?' '+u:'');
  const item=(name,v)=>[name,v];
  const table=(headers,rows)=>[
    '',`| ${headers.join(' | ')} |`,
    `|${headers.map((_,i)=>i?'---:':':---').join('|')}|`,
    ...rows.map(row=>`| ${row.map(x=>String(x).replaceAll('|','/')).join(' | ')} |`),''
  ];
  const eq=(formula)=>['','$$',formula.trim(),'$$',''];
  const explain=(text)=>[text,''];
  const unavailable=(reason)=>['> This calculation cannot be evaluated at the current target: '+(reason||'invalid inverse kinematics')+'.',''];
  const material=materialPresets[s.material]?.label||'Custom';
  const moving=(s.headG+s.payloadG)/1000+base.linkMass*.5;
  const accel=s.accel/1000;
  const force=s.dragN+moving*accel;
  const safe=(x,unit,d=3)=>Number.isFinite(x)?val(x,unit,d):'Not available';
  const ceiling=x=>x>=2000-.5?'≥2,000 g (search cap)':safe(x,'g',1);
  const cols=['l1','l2','r1','r2'];
  const xyRows=()=>cols.map(k=>[
    k.toUpperCase(),val(s[k],'mm',2),val(s[k+'W'],'mm',2),val(s[k+'H'],'mm',2),
    val(bar[k].A*1e6,'mm²',2),val(bar[k].I*1e12,'mm⁴',2),val(bar[k].mass*1000,'g',2)
  ]);
  const formulas=[
    () => [
      ...explain('These are the editable inputs that define the simulation. The report snapshot contains their full precision in the raw-data section below.'),
      ...table(['Setting','Value'],[
        item('Board',`${fmt(s.boardW,1)} × ${fmt(s.boardH,1)} mm`),
        item('Mounting / motor separation',val(s.sep,'mm')),
        item('Link material',material),
        item('Motor profile',motorPresets[s.motorPreset]?.label || 'Custom values'),
        item('Motor running torque',val(s.motorNm,'N·m')),
        item('Gear ratio',`${fmt(s.ratio,2)}:1`),
        item('Tool + payload',`${fmt(s.headG,1)} + ${fmt(s.payloadG,1)} g`),
        item('Hard-stop enforcement',s.useJointLimits?'Enabled':'Disabled')
      ]),
    ],
    () => [
      ...explain('Motor positions are calculated by rotating half the motor spacing around the mounting midpoint. Positive Y points down in the drawing.'),
      ...eq(String.raw`\begin{aligned}
A &= M-\frac{s}{2}\begin{bmatrix}\cos\phi\\\sin\phi\end{bmatrix},\qquad
B=M+\frac{s}{2}\begin{bmatrix}\cos\phi\\\sin\phi\end{bmatrix}
\end{aligned}`),
      ...table(['Location','X (mm)','Y (mm)'],[
        ['Mounting midpoint M',fmt(pv.M.x,2),fmt(pv.M.y,2)],
        ['Left motor A',fmt(pv.A.x,2),fmt(pv.A.y,2)],
        ['Right motor B',fmt(pv.B.x,2),fmt(pv.B.y,2)]
      ]),
      ...explain(`Playing board: ${fmt(s.boardW,1)} × ${fmt(s.boardH,1)} mm; baseline ${fmt(s.angle,2)}°; motor spacing ${fmt(s.sep,2)} mm.`),
    ],
    () => [
      ...explain('Inverse kinematics finds each elbow as an intersection of two circles: one centred at a motor, the other at the common tool joint. The selected branch fixes which elbow solution is used.'),
      ...(sol.valid ? [
        ...eq(String.raw`\theta_L=\operatorname{atan2}(E_{1y}-A_y,E_{1x}-A_x),\qquad
\theta_R=\operatorname{atan2}(E_{2y}-B_y,E_{2x}-B_x)`),
        ...table(['Joint / result','Value'],[
          item('Gripper G',`(${fmt(sol.G.x,2)}, ${fmt(sol.G.y,2)}) mm`),
          item('Common joint P',`(${fmt(sol.P.x,2)}, ${fmt(sol.P.y,2)}) mm`),
          item('Left elbow E₁',`(${fmt(sol.EL.x,2)}, ${fmt(sol.EL.y,2)}) mm`),
          item('Right elbow E₂',`(${fmt(sol.ER.x,2)}, ${fmt(sol.ER.y,2)}) mm`),
          item('Left joint angle θL',val(sol.angleL,'°',3)),
          item('Right joint angle θR',val(sol.angleR,'°',3)),
          item('Singularity margin',fmt(sol.margin,4)),
          item('Link centreline intersection',sol.crossed?'Yes':'No')
        ]),
        ...explain('The singularity margin compares the three normalized cross-product metrics. Values near zero indicate that small XY movements may require very large joint changes.')
      ] : unavailable(sol.reason)),
    ],
    () => [
      ...explain(`Using ${material}, the model estimates each link's area, bending inertia, and mass from the cross-section and density. For hollow sections the interior is subtracted.`),
      ...eq(String.raw`A=bh-b_i h_i,\qquad I=\frac{bh^3-b_i h_i^3}{12},\qquad m=\rho A L`),
      ...table(['Link','Length','Width','Height','Area','Bending I','Mass'],xyRows()),
      ...explain(`Nominal modulus ${val(s.youngMPa,'MPa',1)}, factor ${fmt(s.stiffFactor,3)}, effective modulus ${val(s.youngMPa*s.stiffFactor,'MPa',1)}. Total idealized link mass: ${val(base.linkMass*1000,'g',2)}. Printed parts may be anisotropic.`)
    ],
    () => [
      ...explain('The simplified structural calculation models each arm as an equivalent bending chain. Tip compliance increases with the cube of link length, so long links can deflect disproportionately.'),
      ...eq(String.raw`\begin{aligned}
C_i&=\frac{L_i^3}{3E_{\mathrm{eff}} I_i}\\
C_{\mathrm{tip}}&=\frac{C_L C_R}{C_L+C_R}\\
\delta&=\delta_{\mathrm{self}}+F C_{\mathrm{tip}}
\end{aligned}`),
      ...table(['Calculation','Result','Configured limit'],[
        ['Combined head + payload weight',val((s.headG+s.payloadG)*9.81/1000,'N',4),'—'],
        ['Left / right load share',`${fmt(base.shareL*100,1)}% / ${fmt(base.shareR*100,1)}%`,'—'],
        ['Tip compliance',val(base.tipCompliance,'m/N',7),'—'],
        ['Estimated deflection',val(m.struct.sag,'mm',4),val(s.sagLimit,'mm')],
        ['Worst bending stress',val(m.struct.stress,'MPa',3),val(s.stressLimit,'MPa')]
      ]),
      ...explain('The estimate excludes pivot flexibility, frame deformation, anisotropic print layers, and position-dependent changes in the real five-bar structure.')
    ],
    () => {
      const derivatives=grad?.jac?.x && grad?.jac?.y ? grad.jac : null;
      const steps=grad?.samples?.x?.plus && grad?.samples?.x?.minus &&
        grad?.samples?.y?.plus && grad?.samples?.y?.minus ? grad.samples : null;
      return [
        ...explain('**What is this section?** We move the gripper by a tiny distance in X and Y and ask how much each motor must rotate. Those four slopes form the *inverse-kinematics Jacobian*. We then use its inverse to estimate mechanical leverage and motor torque.'),
        ...table(['Known motion/load input','Value'],[
          ['XY acceleration',`${fmt(s.accel,2)} mm/s² = ${fmt(accel,4)} m/s²`],
          ['Resistive planar drag',val(s.dragN,'N',4)],
          ['Bearing friction per motor',val(s.bearingFrictionNm,'N·m',5)],
          ['Effective moving mass',val(moving,'kg',4)],
          ['Resulting XY force proxy',val(force,'N',4)]
        ]),
        ...eq(String.raw`\begin{aligned}
m_{\mathrm{eff}}&=\frac{m_{\mathrm{head}}+m_{\mathrm{payload}}}{1000}
+\frac12 m_{\mathrm{links}}\\
F_{xy}&=F_{\mathrm{drag}}+m_{\mathrm{eff}}\,a_{xy}
\end{aligned}`),
        ...explain(`Substituting this configuration gives ${fmt(s.dragN,4)} + ${fmt(moving,4)} × ${fmt(accel,4)} = **${val(force,'N',4)}**. This is an intentionally simplified conservative XY-force proxy.`),
        '### Step 1 — Sample nearby motor angles',
        '',
        ...explain('We evaluate inverse kinematics at four nearby gripper positions. Each angle below is the actual joint position in **degrees**, not a derivative.'),
        ...(steps ? [
          ...table(['Gripper displacement','Left motor θL (°)','Right motor θR (°)'],[
            ['X +0.3 mm',fmt(steps.x.plus.angleL,4),fmt(steps.x.plus.angleR,4)],
            ['X −0.3 mm',fmt(steps.x.minus.angleL,4),fmt(steps.x.minus.angleR,4)],
            ['Y +0.3 mm',fmt(steps.y.plus.angleL,4),fmt(steps.y.plus.angleR,4)],
            ['Y −0.3 mm',fmt(steps.y.minus.angleL,4),fmt(steps.y.minus.angleR,4)]
          ])
        ]:unavailable(grad?.reason||sol.reason)),
        '### Step 2 — Turn angle changes into slopes',
        '',
        ...eq(String.raw`\begin{aligned}
\frac{\partial \theta_L}{\partial x}&\approx
\frac{\theta_L(x+h)-\theta_L(x-h)}{2h},\qquad h=0.3\,\mathrm{mm}\\
\frac{\partial \theta_R}{\partial y}&\approx
\frac{\theta_R(y+h)-\theta_R(y-h)}{2h}
\end{aligned}`),
        ...explain('Angles are converted to radians before division. This measures **motor angle change per millimetre** (rad/mm).'),
        '### Step 3 — Build and invert the 2 × 2 Jacobian',
        '',
        ...(derivatives ? [
          ...table(['Derivative','Left θL','Right θR'],[
            ['∂θ/∂x (rad/mm)',fmt(derivatives.x.l,6),fmt(derivatives.x.r,6)],
            ['∂θ/∂y (rad/mm)',fmt(derivatives.y.l,6),fmt(derivatives.y.r,6)]
          ]),
          ...eq(String.raw`J_{\theta\leftarrow xy}=
\begin{bmatrix}
\frac{\partial\theta_L}{\partial x}&\frac{\partial\theta_L}{\partial y}\\
\frac{\partial\theta_R}{\partial x}&\frac{\partial\theta_R}{\partial y}
\end{bmatrix}
=\begin{bmatrix}
${fmt(derivatives.x.l,6)}&${fmt(derivatives.y.l,6)}\\
${fmt(derivatives.x.r,6)}&${fmt(derivatives.y.r,6)}
\end{bmatrix}
\,\frac{\mathrm{rad}}{\mathrm{mm}}`),
          ...eq(String.raw`J_{xy\leftarrow\theta}=J_{\theta\leftarrow xy}^{-1}
=\frac1{ad-bc}\begin{bmatrix}d&-b\\-c&a\end{bmatrix}`),
          ...explain('Inverting translates a motor rotation into an approximate XY displacement. Near a singularity, the determinant can become tiny and the inversion unreliable.')
        ]:unavailable(grad?.reason||'Jacobian unavailable')),
        '### Step 4 — Estimate the required output torque',
        '',
        ...eq(String.raw`\begin{aligned}
J_L&=\frac{\sqrt{d^2+c^2}}{|ad-bc|\,1000},\qquad
J_R=\frac{\sqrt{b^2+a^2}}{|ad-bc|\,1000}\\
\tau_i&\approx F_{xy}J_i+\tau_{\mathrm{friction}}
\end{aligned}`),
        ...(grad?.valid ? [
          ...table(['Motor','Equivalent lever arm','Calculated torque','Available torque'],[
            ['Left M₁',val(grad.JL,'m/rad',4),val(m.torque.L,'N·m',4),val(base.allowTorque,'N·m',4)],
            ['Right M₂',val(grad.JR,'m/rad',4),val(m.torque.R,'N·m',4),val(base.allowTorque,'N·m',4)]
          ]),
          ...explain(`For each motor the estimate adds the configured ${val(s.bearingFrictionNm,'N·m',4)} bearing friction. It **does not** solve the exact direction of XY force, dynamics, or actual stepper torque-speed behavior.`)
        ] : unavailable(grad?.reason||'Numerical Jacobian unavailable'))
      ];
    },
    () => [
      ...explain('The tool varies the payload until a simplified threshold is reached. All searches stop at 2,000 g; a result at that boundary is *not* a verified lifting capacity.'),
      ...eq(String.raw`m_{\mathrm{screen}}=
\min\left(m_{\mathrm{deflection}},\,m_{\mathrm{stress}},\,m_{\mathrm{torque}}\right)`),
      ...table(['Screening limit','Estimated threshold'],[
        item('Deflection',ceiling(m.sagLimit)),
        item('Bending stress',ceiling(m.strengthLimit)),
        item('Both structural checks',ceiling(m.structuralLimit)),
        item('XY motor torque',grad?.valid?ceiling(m.torqueLimit):'Unavailable'),
        item('Combined screening result',grad?.valid?ceiling(m.finalLimit):'Unavailable')
      ]),
      ...explain(`The active limiting assumption is **${m.limiting}**. Separately validate vertical lifting, actual motors and assembled linkages.`)
    ],
    () => [
      ...explain('Reachability is evaluated on each chess-square centre plus 576 distributed points. Hard stops alter kinematic reachability; servo angular travel is checked separately.'),
      ...eq(String.raw`\mathrm{Centre\ coverage}=\frac{N_{\mathrm{reachable}}}{64}\times100\%`),
      ...table(['Coverage / limit','Result'],[
        ['Geometric/hard-stop centres',`${cov.okCenters} of 64`],
        ['Geometric/hard-stop samples',`${cov.angles.length} of 576`],
        ['Servo-travel centres',`${sa.centers} of 64`],
        ['Servo-travel samples',`${sa.samples} of 576`],
        ['Left hard stops',`${s.leftMinAngle}° → ${s.leftMaxAngle}°`],
        ['Right hard stops',`${s.rightMinAngle}° → ${s.rightMaxAngle}°`],
        ['Hard-stop enforcement',s.useJointLimits?'On':'Off'],
        ['Servo usable travel',val(sa.usable,'°',2)],
        ['Near-singular square centres',`${mechCov.singularCount} of 64`],
        ['Torque-over-limit centres',`${mechCov.motorOver} of 64`]
      ]),
    ],
    () => {
      const rows=[];
      for(let row=0;row<8;row++)for(let col=0;col<8;col++){
        const g=squarePos(col,row),v=calc(g,s),k=squareName(col,row);
        const calcM=v.valid?mechanicalAt(v,base,s):null;
        rows.push([
          k,v.valid?'Yes':'No',
          v.valid?fmt(v.angleL,1):'—',v.valid?fmt(v.angleR,1):'—',
          v.valid?fmt(v.margin,3):'—',
          calcM?.gradient?val(Math.max(calcM.torque.L,calcM.torque.R),'N·m',3):'—'
        ]);
      }
      return [
        ...explain('One row per square centre. The motor angles and singularity margin depend on that square. A dash means the pose is not reachable or the derivative cannot be evaluated.'),
        ...table(['Square','Reachable','M₁ angle (°)','M₂ angle (°)','Margin','Max XY torque'],rows),
        ...explain('This is a sampled workspace check; it does not guarantee collision-free or dynamically feasible movement between squares.')
      ];
    },
    () => {
      const active=route?.valid;
      const points=active ? route.samples : [];
      const sampled=points.length<=12?points:points.filter((_,i)=>i===0||i===points.length-1||i%Math.max(1,Math.ceil(points.length/10))===0);
      return [
        ...explain(`The requested XY path from **${s.routeFrom}** to **${s.routeTo}** uses a triangular or trapezoidal acceleration profile. Motor angle, torque and RPM estimates are evaluated along the route; collisions and vertical lifting are not simulated.`),
        ...eq(String.raw`\begin{aligned}
\dot{\theta}_L &= (a\,u_x+b\,u_y)\,v_{xy}\\
\mathrm{RPM}_{\mathrm{motor}} &= |\dot{\theta}|\,\frac{60r}{2\pi}
\end{aligned}`),
        ...(active ? [
          ...table(['Motion metric','Value'],[
            ['Path length',val(route.length,'mm',2)],
            ['Profile duration',val(route.profile.duration,'s',3)],
            ['Effective XY speed',val(route.effectiveSpeed,'mm/s',2)],
            ['Max output torque L / R',`${fmt(route.maxTorqueL,3)} / ${fmt(route.maxTorqueR,3)} N·m`],
            ['Max motor RPM L / R',`${fmt(route.maxRPML,1)} / ${fmt(route.maxRPMR,1)} RPM`],
            ['Path samples',String(points.length)]
          ]),
          ...table(['Time (s)','X (mm)','Y (mm)','Speed (mm/s)','M₁ (°)','M₂ (°)'],
            sampled.map(p=>[fmt(p.t,2),fmt(p.pos.x,1),fmt(p.pos.y,1),fmt(p.speed,1),fmt(p.thetaL,1),fmt(p.thetaR,1)])),
          ...explain('Only representative samples are shown here; every original motion sample is available under Raw calculation log.')
        ] : unavailable(route?.reason||'No valid motion study')),
      ];
    },
    () => [
      ...explain('To reproduce a value, apply the same input geometry and branch choice, solve IK at the target, estimate cross-section stiffness, and test force/torque screening limits.'),
      '- Start from the exact saved configuration at the top of this report.',
      '- Use the coordinate origin at the upper-left of the playing board (+X right, +Y down).',
      '- Convert lengths to metres and all motor-angle differentials to radians before deriving forces or torques.',
      '- For numerical derivatives, use symmetric ±0.3 mm changes on the fixed elbow branch.',
      '- The vertical calculation assumes idealized bending chains; real bearings, motors and frame stiffness are not included.',
      '- Confirm all performance limits through measurement and appropriate safety factors.',
      ''
    ]
  ];
  return rawSections.map((raw,index)=>{
    const content=formulas[index] ? formulas[index]() : unavailable('No explanation');
    const rawText=raw.lines.filter(line=>line!=='```text'&&line!=='```');
    return [
      '<details>',
      '<summary>'+raw.title+'</summary>',
      '',
      ...content,
      '',
      '<details>',
      '<summary>Raw calculation log — full precision</summary>',
      '',
      '```text',...rawText,'```',
      '',
      '</details>',
      '',
      '</details>',
      ''
    ].join('\n');
  });
}
