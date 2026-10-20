// Switchable Motion Study plots. All curves read the existing route samples;
// no second kinematics or mechanics calculation is performed.
'use strict';

const motionOverlaySeries = [
  {key:'tauL', label:'Left torque', group:'torque', color:'#137eb8', unit:'N·m'},
  {key:'tauR', label:'Right torque', group:'torque', color:'#8b5eb8', unit:'N·m'},
  {key:'rpmL',label:'Left RPM', group:'rpm', color:'#009b82', unit:'RPM'},
  {key:'rpmR',label:'Right RPM', group:'rpm', color:'#d6872d', unit:'RPM'}
];
const motionOverlayGeometry = {left:57,right:855,top:22,bottom:201};
let motionOverlayMode = 'bars';
let motionGraphLastScale = null;
const motionSeriesIsOn = key => !!document.querySelector('[data-overlay-series="'+key+'"]')?.checked;
const motionSVG = $('motionOverlayGraph');
const motionFormatValue = (key,n) => key.startsWith('tau') ? n.toFixed(3)+' N·m' : n.toFixed(1)+' RPM';
const motionToFixed = (v,n=1) => Number.isFinite(v)?v.toFixed(n):'--';
function motionNiceMax(v) {
  if(!Number.isFinite(v)||v<=0)return 1;
  const power=Math.pow(10,Math.floor(Math.log10(v)));
  return [1,1.2,1.5,2,2.5,3,4,5,6,8,10]
    .map(k=>k*power).find(n=>n>=v) || 10*power;
}
const motionEscapeAttr = str => String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
function drawMotionOverlayGraph() {
  const d=routeData;
  const active=motionOverlaySeries.filter(s=>motionSeriesIsOn(s.key));
  const empty=$('motionOverlayEmpty');
  const valid=!!d?.valid;
  empty.hidden=active.length!==0 || !valid;
  if(!valid){
    motionSVG.innerHTML='<text x="460" y="125" fill="#6c8193" font-size="14" text-anchor="middle">No valid motion path</text>';
    motionGraphLastScale=null;
    updateMotionOverlayCursor();
    return;
  }
  const limits={torque:Math.max(0.001,d.base.allowTorque),rpm:Math.max(0.001,state.motorRPM)};
  const peaks={torque:Math.max(0.001,...active.filter(s=>s.group==='torque').map(s=>s.key==='tauL'?d.maxTorqueL:d.maxTorqueR)),
               rpm:Math.max(0.001,...active.filter(s=>s.group==='rpm').map(s=>s.key==='rpmL'?d.maxRPML:d.maxRPMR))};
  const showTorque=active.some(s=>s.group==='torque');
  const showRPM=active.some(s=>s.group==='rpm');
  const percent=$('motionGraphScale').value==='percent';
  const axes=percent
    ? {pct:motionNiceMax(Math.max(110,...active.map(s=>{
        const p=s.group==='torque'?(s.key==='tauL'?d.maxTorqueL:d.maxTorqueR):(s.key==='rpmL'?d.maxRPML:d.maxRPMR);
        return 100*p/limits[s.group]*1.10;
      })))}
    : {torque:motionNiceMax(Math.max(peaks.torque*1.12, showTorque&&limits.torque<peaks.torque*1.65?limits.torque*1.04:0.001)),
       rpm:motionNiceMax(Math.max(peaks.rpm*1.12, showRPM&&limits.rpm<peaks.rpm*1.65?limits.rpm*1.04:0.001))};
  const {left,right,top,bottom}=motionOverlayGeometry;
  const width=right-left, height=bottom-top;
  const x=t=>left+width*t;
  const y=(key,value)=>{
    const group=key.startsWith('tau')?'torque':'rpm';
    const fraction=percent?((value/limits[group])*100/axes.pct):(value/axes[group]);
    return bottom-height*Math.max(0,Math.min(fraction,1.5));
  };
  const markup=[];
  markup.push('<rect x="0" y="0" width="920" height="240" fill="transparent"/>');
  for(let tick=0;tick<=4;tick++){
    const y0=bottom-tick*height/4;
    markup.push('<line x1="'+left+'" y1="'+y0+'" x2="'+right+'" y2="'+y0+'" stroke="#d7e2ed" stroke-width="1"/>');
    if(percent){
      markup.push('<text x="'+(left-8)+'" y="'+(y0+4)+'" text-anchor="end" fill="#5c7489" font-size="11">'+motionToFixed(axes.pct*tick/4,0)+'%</text>');
    }else{
      if(showTorque)markup.push('<text x="'+(left-8)+'" y="'+(y0+4)+'" text-anchor="end" fill="#396b92" font-size="11">'+motionToFixed(axes.torque*tick/4,axes.torque<1?3:1)+'</text>');
      if(showRPM)markup.push('<text x="'+(right+9)+'" y="'+(y0+4)+'" text-anchor="start" fill="#628779" font-size="11">'+motionToFixed(axes.rpm*tick/4,axes.rpm<10?1:0)+'</text>');
    }
  }
  const duration=d.profile.duration;
  for(let tick=0;tick<=4;tick++){
    const xpos=x(tick/4);
    markup.push('<text x="'+xpos+'" y="223" text-anchor="middle" fill="#5b748a" font-size="11">'+motionToFixed(duration*tick/4,2)+'s</text>');
  }
  if(percent){
    const thresh=y('tauL',limits.torque);
    markup.push('<line x1="'+left+'" y1="'+thresh+'" x2="'+right+'" y2="'+thresh+'" stroke="#bb7f2f" stroke-width="1.3" stroke-dasharray="5 5"/>');
    markup.push('<text x="'+(right-5)+'" y="'+(thresh-5)+'" text-anchor="end" fill="#a36a22" font-size="10">100% limits</text>');
  }else{
    if(showTorque && limits.torque<=axes.torque) {
      const yt=y('tauL',limits.torque);
      markup.push('<line x1="'+left+'" y1="'+yt+'" x2="'+right+'" y2="'+yt+'" stroke="#bd822f" stroke-width="1.2" stroke-dasharray="5 5"/>');
      markup.push('<text x="'+(right-4)+'" y="'+(yt-4)+'" text-anchor="end" font-size="10" fill="#a77529">Torque limit</text>');
    }
    if(showRPM && limits.rpm<=axes.rpm){
      const yr=y('rpmL',limits.rpm);
      markup.push('<line x1="'+left+'" y1="'+yr+'" x2="'+right+'" y2="'+yr+'" stroke="#688d89" stroke-width="1.2" stroke-dasharray="3 6"/>');
      markup.push('<text x="'+(left+5)+'" y="'+(yr-4)+'" text-anchor="start" font-size="10" fill="#487a73">RPM limit</text>');
    }
  }
  if(!percent){
    if(showTorque)markup.push('<text x="7" y="13" font-size="11" fill="#396b92">N·m</text>');
    if(showRPM)markup.push('<text x="912" y="13" text-anchor="end" font-size="11" fill="#628779">RPM</text>');
  }else markup.push('<text x="7" y="13" font-size="11" fill="#396b92">% of limit</text>');
  for(const s of active){
    const coords=d.samples.map((sample,i)=> (i===0?'M':'L')+x(i/(d.samples.length-1)).toFixed(2)+' '+y(s.key,sample[s.key]).toFixed(2)).join(' ');
    markup.push('<path data-plot-series="'+s.key+'" d="'+coords+'" fill="none" stroke="'+s.color+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" '+(s.group==='rpm'?'stroke-dasharray="7 4" ':'')+'vector-effect="non-scaling-stroke"/>');
  }
  markup.push('<g id="motionOverlayCursor" pointer-events="none"><line id="motionOverlayCursorLine" x1="'+left+'" x2="'+left+'" y1="'+top+'" y2="'+bottom+'" stroke="#445b70" stroke-width="1.4" stroke-dasharray="3 4"/></g>');
  markup.push('<rect x="'+left+'" y="'+top+'" width="'+width+'" height="'+height+'" fill="transparent" class="motionPlotHitArea" aria-hidden="true"/>');
  motionSVG.innerHTML=markup.join('');
  motionGraphLastScale={axes,limits,percent,active,geom:{left,right,top,bottom},y};
  updateMotionOverlayCursor();
}
function updateMotionOverlayCursor() {
  const d=routeData,valid=!!d?.valid;
  const idx=valid?Math.max(0,Math.min(d.samples.length-1,Math.round(routeCursor*(d.samples.length-1)))):0;
  const sample=valid?d.samples[idx]:null;
  for(const series of motionOverlaySeries){
    const display=document.querySelector('[data-overlay-value="'+series.key+'"]');
    if(display)display.textContent=sample?motionFormatValue(series.key,sample[series.key]):'--';
  }
  if(!motionGraphLastScale||!valid)return;
  const {left,right,top,bottom}=motionOverlayGeometry;
  const x=left+(right-left)*routeCursor;
  const line=$('motionOverlayCursorLine');
  if(line){line.setAttribute('x1',x.toFixed(2));line.setAttribute('x2',x.toFixed(2))}
  const cursor=$('motionOverlayCursor');
  if(cursor){
    cursor.querySelectorAll('circle').forEach(el=>el.remove());
    for(const s of motionGraphLastScale.active){
      const cy=motionGraphLastScale.y(s.key,sample[s.key]);
      const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
      dot.setAttribute('cx',x.toFixed(2));dot.setAttribute('cy',cy.toFixed(2));
      dot.setAttribute('r','4');dot.setAttribute('stroke','#fff');dot.setAttribute('stroke-width','1.5');
      dot.setAttribute('fill',s.color);cursor.appendChild(dot);
    }
  }
}
function setMotionStudyView(mode) {
  motionOverlayMode=mode==='graph'?'graph':'bars';
  $('motionBarsPane').hidden=motionOverlayMode!=='bars';
  $('motionOverlayPane').hidden=motionOverlayMode!=='graph';
  document.querySelectorAll('[data-motion-view]').forEach(button=>{
    const active=button.dataset.motionView===motionOverlayMode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  if(motionOverlayMode==='graph')drawMotionOverlayGraph();
}
(() => {
  for(const button of document.querySelectorAll('[data-motion-view]')){
    button.addEventListener('click',()=>setMotionStudyView(button.dataset.motionView));
  }
  for(const box of document.querySelectorAll('[data-overlay-series]')){
    box.addEventListener('change',drawMotionOverlayGraph);
  }
  $('motionGraphScale').addEventListener('change',drawMotionOverlayGraph);
  let pointerTracking=false;
  function seek(event){
    if(!routeData?.valid||!motionGraphLastScale)return;
    const point=motionSVG.createSVGPoint();
    point.x=event.clientX;point.y=event.clientY;
    const ctm=motionSVG.getScreenCTM();
    if(!ctm)return;
    const local=point.matrixTransform(ctm.inverse());
    const {left,right}=motionOverlayGeometry;
    const pos=Math.max(0,Math.min(1,(local.x-left)/(right-left)));
    stopRoute();
    setRouteCursor(pos);
  }
  motionSVG.addEventListener('pointerdown',event=>{
    if(!routeData?.valid)return;
    pointerTracking=true;
    motionSVG.setPointerCapture(event.pointerId);
    seek(event);event.preventDefault();
  });
  motionSVG.addEventListener('pointermove',event=>{
    if(pointerTracking)seek(event);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>motionSVG.addEventListener(name,()=>{pointerTracking=false}));
  motionSVG.addEventListener('keydown',event=>{
    if(!routeData?.valid)return;
    if(event.key==='ArrowRight'||event.key==='ArrowLeft'){
      stopRoute();
      setRouteCursor(routeCursor+(event.key==='ArrowRight'?0.01:-0.01));
      event.preventDefault();
    }
  });
  setMotionStudyView('bars');
  updateMotionOverlayCursor();
})();
