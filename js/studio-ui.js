// Canvas ruler, mounting selector state, and compact contextual help.
// Works with the existing kinematics and UI controls; no numerical model changes.
'use strict';

function updateCanvasScale() {
  const svg=document.getElementById('scene'),ticks=document.getElementById('scaleTicks'),label=document.getElementById('scaleLabel');
  if(!svg||!ticks||!label)return;
  const m=svg.getScreenCTM();
  if(!m)return;
  const pxPerMm=Math.hypot(m.a,m.b);
  if(!Number.isFinite(pxPerMm)||pxPerMm<=0)return;
  const choices=[1,2,5,10,20,50,100,200,500,1000];
  const millimetres=choices.reduce((best,mm)=>Math.abs(Math.log(mm*pxPerMm/65))<Math.abs(Math.log(best*pxPerMm/65))?mm:best,choices[0]);
  const pixels=millimetres*pxPerMm;
  ticks.style.width=pixels.toFixed(1)+'px';
  ticks.style.height=pixels.toFixed(1)+'px';
  label.textContent=millimetres+' × '+millimetres+' mm';
  document.getElementById('canvasScale').setAttribute('aria-label','Scale square: '+millimetres+' by '+millimetres+' millimetres');
}
function refreshMountPicker() {
  const padX=(state.outerW-state.boardW)/2,padY=(state.outerH-state.boardH)/2;
  const left=-padX-40,right=(state.outerW+state.boardW)/2+40,
        top=-padY-40,bottom=(state.outerH+state.boardH)/2+40,
        middleX=state.boardW/2,middleY=state.boardH/2;
  const positions={
    TL:[left,top,90],TC:[middleX,top,0],TR:[right,top,90],
    ML:[left,middleY,90],MR:[right,middleY,90],
    BL:[left,bottom,90],BC:[middleX,bottom,-180],BR:[right,bottom,90]
  };
  document.querySelectorAll('.mountSpot').forEach(b=>{
    const value=positions[b.dataset.preset];
    const selected=value && Math.abs(state.mountX-value[0])<.02 &&
      Math.abs(state.mountY-value[1])<.02 && Math.abs(state.angle-value[2])<.02;
    b.classList.toggle('is-selected',!!selected);
    b.setAttribute('aria-pressed',String(!!selected));
  });
}
(function initStudioUI(){
  const pop=document.createElement('div');
  pop.id='studioTooltip'; pop.className='studioTooltip';pop.setAttribute('role','tooltip');
  pop.hidden=true;document.body.appendChild(pop);
  let anchor=null,pinned=false;
  const textFor = node => {
    if(node._tooltipDescriptions)return node._tooltipDescriptions.map(x=>x.textContent.trim()).filter(Boolean).join('\n\n');
    return node.dataset.tip || '';
  };
  function closeTooltip(force=false){
    if(pinned&&!force)return;
    pop.hidden=true;anchor=null;pinned=false;
  }
  function openTooltip(node,click=false){
    const text=textFor(node);
    if(!text)return;
    if(click && anchor===node && pinned){closeTooltip(true);return}
    anchor=node;pinned=click;pop.textContent=text;pop.hidden=false;
    const rect=node.getBoundingClientRect(), margin=10;
    pop.style.maxWidth=Math.min(340,window.innerWidth-20)+'px';
    pop.style.top='0';pop.style.left='0';
    const width=pop.offsetWidth,height=pop.offsetHeight;
    const x=Math.max(margin,Math.min(rect.left,window.innerWidth-width-margin));
    const bottom=rect.bottom+9,above=rect.top-height-9;
    const y=bottom+height<window.innerHeight-margin?bottom:Math.max(margin,above);
    pop.style.left=x+'px';pop.style.top=y+'px';
  }
  for(const section of document.querySelectorAll('.config > .section,.analysis > .panel')){
    const header=section.querySelector('.sectheader,.subheading');
    if(!header)continue;
    const descriptions=Array.from(section.querySelectorAll(':scope > p.hint, :scope > .hint:not(#positionReason)')).filter(n=>n.id!=='positionReason');
    if(!descriptions.length)continue;
    const btn=document.createElement('button');
    btn.type='button';btn.className='infoTrigger';btn.setAttribute('aria-label','More about '+header.textContent.trim());
    btn.setAttribute('aria-haspopup','true');
    btn.innerHTML='<i data-lucide="info"></i>';
    btn._tooltipDescriptions=descriptions;
    header.append(btn);
    for(const description of descriptions)description.classList.add('inspectorHintCollapsed');
  }
  const route=document.getElementById('routePanel');
  const routeHeader=route?.querySelector('.routeTop .sectheader');
  const routeDescriptions=Array.from(route?.querySelectorAll('.routeTop .mini,.routepanel > p.hint')||[]);
  if(routeHeader&&routeDescriptions.length){
    const b=document.createElement('button');b.type='button';b.className='infoTrigger';
    b.setAttribute('aria-label','Motion study assumptions');b.innerHTML='<i data-lucide="info"></i>';
    b._tooltipDescriptions=routeDescriptions;routeHeader.append(b);
    routeDescriptions.forEach(n=>n.classList.add('inspectorHintCollapsed'));
  }
  const tipSelector='[data-tip],.infoTrigger';
  document.addEventListener('pointerover',e=>{
    const button=e.target.closest?.(tipSelector);
    if(button&&!pinned)openTooltip(button);
  });
  document.addEventListener('pointerout',e=>{
    const button=e.target.closest?.(tipSelector);
    if(button&&!button.contains(e.relatedTarget))closeTooltip();
  });
  document.addEventListener('focusin',e=>{
    const b=e.target.closest?.(tipSelector);
    if(b&&!pinned)openTooltip(b);
  });
  document.addEventListener('focusout',e=>{
    if(e.target.closest?.(tipSelector))closeTooltip();
  });
  document.addEventListener('click',e=>{
    const b=e.target.closest?.(tipSelector);
    if(b){openTooltip(b,true);return}
    if(!pop.contains(e.target))closeTooltip(true);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTooltip(true)});
  window.addEventListener('resize',()=>{closeTooltip(true);updateCanvasScale()});
  refreshMountPicker();
  requestAnimationFrame(updateCanvasScale);
  if(window.lucide?.createIcons)window.lucide.createIcons();
})();
