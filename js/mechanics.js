// Link stiffness, load, sag and motor torque screening estimates.
// Files run in the order specified in index.html; they share the application state.
'use strict';

// Screening-only mechanics: units m, kg, N and Nm internally.
const capPayloadG=2000;
const mechKeys=['l1','l2','r1','r2'];
function sectionData(k,s=state){
 const b=s[k+'W']/1000,h=s[k+'H']/1000,L=s[k]/1000;
 let bi=0,hi=0;if(s.sectionType==='box'){bi=Math.max(0,b-2*s.wall/1000);hi=Math.max(0,h-2*s.wall/1000)}
 const A=b*h-bi*hi,I=Math.max(1e-15,(b*Math.pow(h,3)-bi*Math.pow(hi,3))/12);
 return {A,I,L,c:h/2,mass:A*L*s.density*1000};
}
function mechanicalBase(s=state){
 const bars=Object.fromEntries(mechKeys.map(k=>[k,sectionData(k,s)]));
 const E=s.youngMPa*1e6*s.stiffFactor;
 const compliance=(keys)=>keys.reduce((v,k)=>v+Math.pow(bars[k].L,3)/(3*E*bars[k].I),0);
 const selfSag=keys=>keys.reduce((v,k)=>v+bars[k].mass*9.81*Math.pow(bars[k].L,3)/(8*E*bars[k].I),0);
 const cL=compliance(['l1','l2']),cR=compliance(['r1','r2']);
 const shareL=cR/(cL+cR),shareR=cL/(cL+cR);
 const tipCompliance=cL*cR/(cL+cR);
 const ownSag=shareL*selfSag(['l1','l2'])+shareR*selfSag(['r1','r2']);
 const linkMass=mechKeys.reduce((v,k)=>v+bars[k].mass,0);
 const allowTorque=s.motorNm*s.ratio*(s.efficiency/100)/s.motorSF;
 return {bars,shareL,shareR,tipCompliance,ownSag,linkMass,allowTorque};
}
function structuralAt(payloadG,base,s=state){
 const F=9.81*(s.headG+payloadG)/1000;
 const sag=(base.ownSag+F*base.tipCompliance)*1000;
 let worst=0;
 for(const side of ['l','r']){
  const near=base.bars[side+'1'],far=base.bars[side+'2'],share=side==='l'?base.shareL:base.shareR;
  // Conservative simplified cantilever moments, including the downstream link and approximate self weight.
  const nearMoment=F*share*(near.L+far.L)+near.mass*9.81*near.L/2+far.mass*9.81*(near.L+far.L/2);
  const farMoment=F*share*far.L+far.mass*9.81*far.L/2;
  worst=Math.max(worst,nearMoment*near.c/near.I/1e6,farMoment*far.c/far.I/1e6);
 }
 return {sag,stress:worst};
}
function deltaAngle(a,b){const d=(a-b)*RAD;return Math.atan2(Math.sin(d),Math.cos(d))}
function getGradient(sol,s=state){
 if(!sol.valid||sol.margin<.025)return null;
 const delta=.3,g=sol.G;
 let grad=[];
 for(const axis of ['x','y']){
  const plus=calc(vec(g.x+(axis==='x'?delta:0),g.y+(axis==='y'?delta:0)),s);
  const minus=calc(vec(g.x-(axis==='x'?delta:0),g.y-(axis==='y'?delta:0)),s);
  if(!plus.valid||!minus.valid)return null;
  grad.push([deltaAngle(plus.angleL,minus.angleL)/(2*delta),deltaAngle(plus.angleR,minus.angleR)/(2*delta)]);
 }
 // dTheta/dXY in rad/mm; invert for dXY/dTheta in mm/rad.
 const a=grad[0][0],b=grad[1][0],c=grad[0][1],d=grad[1][1],det=a*d-b*c;
 if(!Number.isFinite(det)||Math.abs(det)<1e-11)return null;
 const JL=Math.hypot(d,-c)/Math.abs(det)/1000,JR=Math.hypot(-b,a)/Math.abs(det)/1000;
 if(!Number.isFinite(JL)||!Number.isFinite(JR)||JL>100||JR>100)return null;
 return [JL,JR];
}
function torqueAt(payloadG,base,gradient,s=state){
 if(!gradient)return {L:NaN,R:NaN};
 const effectiveMoving=(s.headG+payloadG)/1000+base.linkMass*.5;
 const F=s.dragN+effectiveMoving*s.accel/1000;
 return {L:F*gradient[0]+s.bearingFrictionNm,R:F*gradient[1]+s.bearingFrictionNm};
}
function numericLimit(predicate){
 if(!predicate(0))return 0;
 if(predicate(capPayloadG))return capPayloadG;
 let lo=0,hi=capPayloadG;
 for(let i=0;i<23;i++){const mid=(lo+hi)/2;if(predicate(mid))lo=mid;else hi=mid}
 return lo;
}
function mechanicalAt(sol,base=mechanicalBase(),s=state){
 const struct=structuralAt(s.payloadG,base,s),gradient=getGradient(sol,s);
 const torque=torqueAt(s.payloadG,base,gradient,s);
 const tipMass=(s.headG+s.payloadG)/1000;
 const structuralLimit=numericLimit(v=>{const test=structuralAt(v,base,s);return test.sag<=s.sagLimit&&test.stress<=s.stressLimit});
 const sagLimit=numericLimit(v=>structuralAt(v,base,s).sag<=s.sagLimit);
 const strengthLimit=numericLimit(v=>structuralAt(v,base,s).stress<=s.stressLimit);
 const torqueLimit=gradient?numericLimit(v=>{const tor=torqueAt(v,base,gradient,s);return Math.max(tor.L,tor.R)<=base.allowTorque}):0;
 const finalLimit=Math.min(structuralLimit,torqueLimit);
 const limiting= !gradient?'Singularity / numerical limit':finalLimit===sagLimit?'Vertical sag':finalLimit===strengthLimit?'Beam stress':'Motor torque';
 const loadOK=!!gradient && torque.L<=base.allowTorque && torque.R<=base.allowTorque && struct.sag<=s.sagLimit && struct.stress<=s.stressLimit && sol.margin>=.14;
 return {struct,torque,tipMass,gradient,structuralLimit,sagLimit,strengthLimit,torqueLimit,finalLimit,limiting,loadOK,usable:!!gradient&&sol.margin>=.14};
}
function formatPayload(x){return x>=capPayloadG-.5?'≥2,000 g*':`${Math.round(x)} g`}
function mechColor(info,s=state){
 if(!info)return '#e16e7a';
 if(s.heatMode==='servo'){if(!info.sol.valid)return '#e16e7a';return servoPass(info.sol,lastServoMap)?'#48d3a5':'#e16e7a';}
 if(s.heatMode==='singularity'){if(!info.sol.valid)return '#e16e7a';const x=info.sol.margin;return x<.14?'#e16e7a':x<.25?'#f0b660':'#48d3a5';}
 if(!info.sol.valid)return '#e16e7a';
 if(s.heatMode==='payload'){
  if(!info.mech)return '#e16e7a';
  const ratio=info.mech.structuralLimit/Math.max(s.payloadG,1);
  return ratio<1?'#e16e7a':ratio<1.5?'#f0b660':'#48d3a5';
 }
 if(!info.mech||!info.mech.gradient||info.sol.margin<.14)return '#e16e7a';
 if(s.heatMode==='motor'){
  const use=Math.max(info.mech.torque.L,info.mech.torque.R)/info.base.allowTorque;
  return use>1?'#e16e7a':use>.7?'#f0b660':'#48d3a5';
 }
 if(s.heatMode==='combined'){
  const ratio=info.mech.finalLimit/Math.max(s.payloadG,1);
  return ratio<1?'#e16e7a':ratio<1.5?'#f0b660':'#48d3a5';
 }
 return '#48d3a5';
}
function mechanicalCoverage(){
 const base=mechanicalBase();const cells=[];let worst=capPayloadG,critical='',singularCount=0,motorOver=0;
 for(let row=0;row<8;row++)for(let col=0;col<8;col++){
  const sol=calc(squarePos(col,row));const mech=sol.valid?mechanicalAt(sol,base):null;
  if(sol.valid&&sol.margin<.14)singularCount++;
  if(mech&&mech.gradient&&Math.max(mech.torque.L,mech.torque.R)>base.allowTorque)motorOver++;
  if(sol.valid){let score=mech?mech.finalLimit:0;if(score<=worst){worst=score;critical=squareName(col,row)}}
  cells.push({sol,mech,base});
 }
 return {base,cells,worst,critical,singularCount,motorOver};
}
function updateMechanicalInspector(sol){
 if(!state.showMechanics){$('mechInspector').classList.add('invisible');return} $('mechInspector').classList.remove('invisible');
 const result=mechanicalAt(sol,lastMechMap.base);
 const b=lastMechMap.base;
 $('mechLinkMass').textContent=`${Math.round(b.linkMass*1000)} g (links only)`;
 $('mechSag').textContent=`${result.struct.sag.toFixed(2)} mm / ${f(state.sagLimit)} mm`;
 $('mechStress').textContent=`${result.struct.stress.toFixed(1)} MPa / ${f(state.stressLimit)} MPa`;
 $('mechTorqueL').textContent=Number.isFinite(result.torque.L)?`${result.torque.L.toFixed(3)} N·m`:'not reliably estimated';
 $('mechTorqueR').textContent=Number.isFinite(result.torque.R)?`${result.torque.R.toFixed(3)} N·m`:'not reliably estimated';
 $('mechTorqueAllow').textContent=`${b.allowTorque.toFixed(3)} N·m (derated)`;
 $('mechMaxPayload').textContent=sol.valid?formatPayload(result.structuralLimit):'unreachable';
 $('mechMotorPayload').textContent=sol.valid&&result.gradient?formatPayload(result.torqueLimit):'not reliably estimated';
 $('mechCombinedPayload').textContent=sol.valid&&result.gradient?formatPayload(result.finalLimit):'not reliably estimated';
 $('mechLimitation').textContent=sol.valid?result.limiting:'Unreachable';
 $('mechBoardLimit').textContent=`${formatPayload(lastMechMap.worst)} ${lastMechMap.critical?'@ '+lastMechMap.critical:''}`;
 $('mechSingularCount').textContent=`${lastMechMap.singularCount} / 64`;
 const status=$('mechStatus');
 if(!sol.valid){status.className='mechbadge bad';status.textContent='Unreachable geometry, cannot assess load.'}
 else if(!result.usable){status.className='mechbadge warn';status.textContent='Near a singularity, torque estimate unreliable.'}
 else if(result.struct.sag>state.sagLimit || result.struct.stress>state.stressLimit){status.className='mechbadge bad';status.textContent='Vertical bending estimate exceeds configured threshold.'}
 else if(result.torque.L>b.allowTorque || result.torque.R>b.allowTorque){status.className='mechbadge warn';status.textContent='Vertical load passes the estimate; XY motion torque margin is low.'}
 else{status.className='mechbadge';status.textContent='Within simplified screening thresholds, not a safety rating.'}
}
