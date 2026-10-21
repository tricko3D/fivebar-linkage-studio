// CAD-style, dimensioned five-bar plan view in true model millimetres.
// Datum: nearest midpoint of the OUTER physical board edge, not board centre.
'use strict';
function cadEdgeReference(s=state){
  const b=boardBounds(s),M=pivots(s).M;
  const options=[
    ['TOP',{x:b.x+b.w/2,y:b.y}],
    ['BOTTOM',{x:b.x+b.w/2,y:b.y+b.h}],
    ['LEFT',{x:b.x,y:b.y+b.h/2}],
    ['RIGHT',{x:b.x+b.w,y:b.y+b.h/2}]
  ];
  return options.map(([side,point])=>({side,point,distance:dist(M,point)}))
    .reduce((best,next)=>next.distance<best.distance?next:best);
}
const cadNum=(n,places=1)=>Number.isFinite(n)?String(Number(n.toFixed(places))):'—';
const cadEsc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function cadLabel(p,value,color='#2f607e',size=10){
  const label=cadEsc(value),w=Math.max(28,label.length*size*.57+13);
  return '<g pointer-events="none"><rect x="'+(p.x-w/2)+'" y="'+(p.y-12)+
    '" width="'+w+'" height="18" rx="3" fill="#fff" fill-opacity=".95"/>'+
    '<text x="'+p.x+'" y="'+(p.y+.6)+'" text-anchor="middle" font-family="Arial,sans-serif" font-size="'+size+
    '" font-weight="700" fill="'+color+'">'+label+'</text></g>';
}
function cadLine(a,b,color='#50809b',width=1,dash=''){
  return '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+
    '" stroke="'+color+'" stroke-width="'+width+'" fill="none"'+
    (dash?' stroke-dasharray="'+dash+'"':'')+'/>';
}
function cadDimension(a,b,label,offset=15,color='#287caa'){
  const dx=b.x-a.x,dy=b.y-a.y,distAB=Math.hypot(dx,dy);
  if(distAB<.005)return cadLabel({x:a.x+25,y:a.y-15},label,color);
  const ux=dx/distAB,uy=dy/distAB,nx=-uy,ny=ux;
  const p={x:a.x+nx*offset,y:a.y+ny*offset},
    q={x:b.x+nx*offset,y:b.y+ny*offset};
  const ext=5,arrow=Math.min(7,distAB*.16);
  const tip=(point,sign)=>'<path d="M'+point.x+' '+point.y+
    ' l'+((ux*arrow+nx*2.3)*sign)+' '+((uy*arrow+ny*2.3)*sign)+
    ' l'+(-nx*4.6*sign)+' '+(-ny*4.6*sign)+' Z" fill="'+color+'"/>';
  const mid={x:(p.x+q.x)/2+nx*10,y:(p.y+q.y)/2+ny*10};
  return '<g class="cadDimension" pointer-events="none">'+
    cadLine(a,{x:p.x+nx*ext,y:p.y+ny*ext},color,.75)+
    cadLine(b,{x:q.x+nx*ext,y:q.y+ny*ext},color,.75)+
    cadLine(p,q,color,1.1)+tip(p,1)+tip(q,-1)+cadLabel(mid,label,color,9.5)+'</g>';
}
function cadDimensions(s=state,solution=null,detail=false){
  const b=boardBounds(s),pv=pivots(s),
    sol=solution||calc(vec(s.targetX,s.targetY),{...s,useJointLimits:false,forbidCrossings:false});
  const ref=cadEdgeReference(s);
  let out='<g id="cadDimensions" pointer-events="none">';
  // Board edge midpoint is an explicit datum; NOT the middle of the board.
  out+='<circle cx="'+ref.point.x+'" cy="'+ref.point.y+
    '" r="4" fill="#fff" stroke="#c47727" stroke-width="1.8"/>';
  out+=cadLine(ref.point,pv.M,'#ce8e42',1.1,'4 4');
  out+=cadDimension(ref.point,pv.M,'EDGE MID → M  '+cadNum(ref.distance)+' mm',
    ref.side==='BOTTOM'?-24:ref.side==='TOP'?24:ref.side==='LEFT'?-25:25,'#ad6d2a');
  out+=cadDimension(pv.A,pv.B,'M₁–M₂  '+cadNum(s.sep)+' mm',-24);
  if(sol?.EL&&sol?.ER&&sol?.P){
    out+=cadDimension(pv.A,sol.EL,'L1  '+cadNum(s.l1)+' mm',-15,'#177e97');
    out+=cadDimension(sol.EL,sol.P,'L2  '+cadNum(s.l2)+' mm',14,'#177e97');
    out+=cadDimension(pv.B,sol.ER,'R1  '+cadNum(s.r1)+' mm',15,'#755ab6');
    out+=cadDimension(sol.ER,sol.P,'R2  '+cadNum(s.r2)+' mm',-14,'#755ab6');
  }
  if(detail){
    out+=cadDimension({x:b.x,y:b.y},{x:b.x+b.w,y:b.y},
      'OUTER BOARD '+cadNum(s.outerW)+' mm',-40);
    out+=cadDimension({x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},
      'OUTER '+cadNum(s.outerH)+' mm',40);
    out+=cadDimension({x:0,y:0},{x:s.boardW,y:0},
      'PLAYING '+cadNum(s.boardW)+' mm',-11);
    out+=cadDimension({x:0,y:0},{x:0,y:s.boardH},
      'PLAYING '+cadNum(s.boardH)+' mm',11);
  }
  return out+'</g>';
}
function buildCadDrawingSvg(s=state){
  const pv=pivots(s),b=boardBounds(s);
  const solution=calc(vec(s.targetX,s.targetY),{...s,useJointLimits:false,forbidCrossings:false});
  const coords=[pv.A,pv.B,pv.M,
    {x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h}];
  for(const key of ['EL','ER','P','G'])if(solution[key])coords.push(solution[key]);
  const xmin=Math.min(...coords.map(p=>p.x))-110,
    xmax=Math.max(...coords.map(p=>p.x))+235,
    ymin=Math.min(...coords.map(p=>p.y))-110,
    ymax=Math.max(...coords.map(p=>p.y))+135;
  const w=xmax-xmin,h=ymax-ymin;
  const right=xmax-202,top=ymin+26;
  let g='<rect x="'+xmin+'" y="'+ymin+'" width="'+w+'" height="'+h+'" fill="#fff"/>';
  g+='<rect x="'+(xmin+7)+'" y="'+(ymin+7)+'" width="'+(w-14)+'" height="'+(h-14)+
    '" fill="none" stroke="#8ca4b4" stroke-width="1.1"/>';
  g+='<text x="'+(xmin+24)+'" y="'+(ymin+34)+'" font-family="Arial,sans-serif" fill="#193e58" font-size="17" font-weight="700">FIVEBAR · DIMENSIONED PLAN VIEW</text>';
  g+='<text x="'+(xmin+24)+'" y="'+(ymin+52)+'" font-family="Arial,sans-serif" fill="#6a8190" font-size="10">Units: mm · Board origin top-left · X right / Y down · Nominal geometry</text>';
  g+='<rect x="'+b.x+'" y="'+b.y+'" width="'+b.w+'" height="'+b.h+
    '" fill="#f0f4f7" stroke="#647f90" stroke-width="1.8"/>';
  g+='<rect x="0" y="0" width="'+s.boardW+'" height="'+s.boardH+
    '" fill="#fff" stroke="#8ba5b4" stroke-width="1.4"/>';
  for(let k=1;k<8;k++){
    g+=cadLine({x:s.boardW*k/8,y:0},{x:s.boardW*k/8,y:s.boardH},'#e1e7ec',.65);
    g+=cadLine({x:0,y:s.boardH*k/8},{x:s.boardW,y:s.boardH*k/8},'#e1e7ec',.65);
  }
  const edge=cadEdgeReference(s);
  g+=cadLine(edge.point,pv.M,'#c28337',1.3,'4 5');
  g+=cadLine(pv.A,pv.B,'#465f71',3.3);
  if(solution.EL&&solution.ER&&solution.P){
    for(const [a,b,c] of [
      [pv.A,solution.EL,'#178ca9'],[solution.EL,solution.P,'#178ca9'],
      [pv.B,solution.ER,'#8469bd'],[solution.ER,solution.P,'#8469bd']])
      g+=cadLine(a,b,c,5.5);
  }
  for(const [p,name] of [[pv.A,'M₁'],[pv.B,'M₂'],[pv.M,'M']]){
    g+='<circle cx="'+p.x+'" cy="'+p.y+'" r="4.7" fill="#fff" stroke="#254f69" stroke-width="1.8"/>';
    g+=cadLabel({x:p.x+14,y:p.y-9},name);
  }
  for(const [p,label] of [[solution.EL,'E₁'],[solution.ER,'E₂'],[solution.P,'P']]){
    if(p){g+='<circle cx="'+p.x+'" cy="'+p.y+'" r="3.7" fill="#fff" stroke="#254f69" stroke-width="1.5"/>';
      g+=cadLabel({x:p.x+14,y:p.y-9},label);}
  }
  g+=cadDimensions(s,solution,true);
  // Dimensioned cross sections: orthographic not-to-scale sketches for each link.
  g+='<g id="cadSections">';
  g+='<rect x="'+right+'" y="'+top+'" width="187" height="214" fill="#f7fafc" stroke="#a7bac8"/>';
  g+='<text x="'+(right+12)+'" y="'+(top+19)+'" font-family="Arial" font-size="12" font-weight="700" fill="#315a75">LINK CROSS SECTIONS</text>';
  const links=[['L1','l1'],['L2','l2'],['R1','r1'],['R2','r2']];
  for(let i=0;i<links.length;i++){
    const [label,key]=links[i],yy=top+45+i*41,ww=s[key+'W'],hh=s[key+'H'];
    const scale=24/Math.max(ww,hh,1),sw=ww*scale,sh=hh*scale;
    const cx=right+31,cy=yy;
    g+='<rect x="'+(cx-sw/2)+'" y="'+(cy-sh/2)+'" width="'+sw+'" height="'+sh+
      '" fill="#d6e8f1" stroke="#266d95" stroke-width="1.4"/>';
    if(s.sectionType==='box'){
      const iw=Math.max(0,(ww-2*s.wall)*scale),ih=Math.max(0,(hh-2*s.wall)*scale);
      if(iw>0&&ih>0)g+='<rect x="'+(cx-iw/2)+'" y="'+(cy-ih/2)+
        '" width="'+iw+'" height="'+ih+'" fill="#fff" stroke="#709bae"/>';
    }
    g+='<text x="'+(right+58)+'" y="'+(yy-4)+'" font-family="Arial" font-size="10.5" fill="#244963" font-weight="700">'+label+'</text>';
    g+='<text x="'+(right+58)+'" y="'+(yy+10)+'" font-family="Arial" font-size="10" fill="#516f82">'+
      cadNum(ww)+' W × '+cadNum(hh)+' H'+(s.sectionType==='box'?' · t='+cadNum(s.wall):' · solid')+' mm</text>';
  }
  g+='</g>';
  const blockY=ymax-82;
  g+='<rect x="'+(xmin+25)+'" y="'+blockY+'" width="'+(w-50)+'" height="52" fill="#f4f8fa" stroke="#a4b6c2"/>';
  g+='<text x="'+(xmin+38)+'" y="'+(blockY+17)+'" font-family="Arial" font-size="11" font-weight="700" fill="#214d6a">FIVEBAR LINKAGE STUDIO · NOMINAL PLAN</text>';
  g+='<text x="'+(xmin+38)+'" y="'+(blockY+33)+'" font-family="Arial" font-size="10" fill="#577487">'+
      'Datum: midpoint of nearest OUTER board '+edge.side.toLowerCase()+' edge · Distance '+cadNum(edge.distance)+' mm</text>';
  g+='<text x="'+(xmin+38)+'" y="'+(blockY+46)+'" font-family="Arial" font-size="9" fill="#718694">Reference only · Check tolerances, interferences and manufacture in CAD</text>';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'+xmin+' '+ymin+' '+w+' '+h+
    '" width="1400" height="1000" preserveAspectRatio="xMidYMid meet">'+g+'</svg>';
}
