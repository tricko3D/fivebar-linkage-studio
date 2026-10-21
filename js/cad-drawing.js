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
// Traditional drafting arrows: tips sit precisely on the measured points,
// with small symmetric arrowheads pointing into the dimension line.
function cadDimension(a,b,label,offset=15,color='#287caa',options={}){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  if(length<.005)return cadLabel({x:a.x+25,y:a.y-15},label,color);
  const ux=dx/length,uy=dy/length,nx=-uy,ny=ux;
  const p={x:a.x+nx*offset,y:a.y+ny*offset};
  const q={x:b.x+nx*offset,y:b.y+ny*offset};
  const ext=Math.sign(offset||1)*5;
  const arrow=Math.min(5,Math.max(2.5,length*.10));
  const halfWidth=1.6;
  const tip=(at,direction)=>{
    const bx=at.x+ux*direction*arrow,by=at.y+uy*direction*arrow;
    return '<path d="M '+at.x+' '+at.y+' L '+(bx+nx*halfWidth)+' '+(by+ny*halfWidth)+
      ' L '+(bx-nx*halfWidth)+' '+(by-ny*halfWidth)+' Z" fill="'+color+'"/>';
  };
  const t=options.labelT??.5;
  const mid={x:p.x+(q.x-p.x)*t+nx*(options.labelOffset||0),
    y:p.y+(q.y-p.y)*t+ny*(options.labelOffset||0)};
  return '<g class="cadDimension" pointer-events="none">'+
    cadLine(a,{x:p.x+nx*ext,y:p.y+ny*ext},color,.65)+
    cadLine(b,{x:q.x+nx*ext,y:q.y+ny*ext},color,.65)+
    cadLine(p,q,color,1.0)+tip(p,1)+tip(q,-1)+
    cadLabel(mid,label,color,9.5)+'</g>';
}
function cadExteriorOffset(a,b,centroid,distance=24){
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  const nx=-dy/length,ny=dx/length;
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
  return (nx*(mid.x-centroid.x)+ny*(mid.y-centroid.y)>=0?1:-1)*distance;
}
function cadDimensions(s=state,solution=null,detail=false){
  const b=boardBounds(s),pv=pivots(s),
    sol=solution||calc(vec(s.targetX,s.targetY),{...s,useJointLimits:false,forbidCrossings:false});
  const ref=cadEdgeReference(s);
  let out='<g id="cadDimensions" pointer-events="none">';
  // Explicit datum marker at physical board EDGE MIDPOINT, never board centre.
  out+='<circle cx="'+ref.point.x+'" cy="'+ref.point.y+
    '" r="4" fill="#fff" stroke="#c47727" stroke-width="1.8"/>';
  out+=cadLine(ref.point,pv.M,'#ce8e42',1.0,'3 5');
  out+=cadDimension(ref.point,pv.M,'EDGE → M '+cadNum(ref.distance)+' mm',
    ref.side==='BOTTOM'?-30:ref.side==='TOP'?30:ref.side==='LEFT'?-30:30,
    '#ad6d2a',{labelT:.19});
  out+=cadDimension(pv.A,pv.B,'M₁–M₂ '+cadNum(s.sep)+' mm',-25);
  if(sol?.EL&&sol?.ER&&sol?.P){
    const vertices=[pv.A,pv.B,sol.EL,sol.ER,sol.P];
    const centroid={
      x:vertices.reduce((sum,p)=>sum+p.x,0)/vertices.length,
      y:vertices.reduce((sum,p)=>sum+p.y,0)/vertices.length
    };
    for(const [start,end,name,len,color] of [
      [pv.A,sol.EL,'L1',s.l1,'#177e97'],
      [sol.EL,sol.P,'L2',s.l2,'#177e97'],
      [pv.B,sol.ER,'R1',s.r1,'#755ab6'],
      [sol.ER,sol.P,'R2',s.r2,'#755ab6']
    ]){
      out+=cadDimension(start,end,name+' '+cadNum(len)+' mm',
        cadExteriorOffset(start,end,centroid,25),color);
    }
  }
  if(detail){
    out+=cadDimension({x:b.x,y:b.y},{x:b.x+b.w,y:b.y},
      'OUTER BOARD '+cadNum(s.outerW)+' mm',-40);
    // Put vertical board dimensions outside the mechanism. Stagger labels so
    // they cannot overlap each other or the elbow/joint marker.
    out+=cadDimension({x:b.x,y:b.y},{x:b.x,y:b.y+b.h},
      'OUTER '+cadNum(s.outerH)+' mm',102,'#287caa',{labelT:.30});
    out+=cadDimension({x:0,y:0},{x:s.boardW,y:0},
      'PLAYING '+cadNum(s.boardW)+' mm',-11);
    out+=cadDimension({x:0,y:0},{x:0,y:s.boardH},
      'PLAYING '+cadNum(s.boardH)+' mm',77,'#287caa',{labelT:.66});
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
    g+=cadLabel({x:p.x+(name==='M'?14:name==='M₁'?20:-20),y:p.y-17},name);
  }
  for(const [p,label] of [[solution.EL,'E₁'],[solution.ER,'E₂'],[solution.P,'P']]){
    if(p){g+='<circle cx="'+p.x+'" cy="'+p.y+'" r="3.7" fill="#fff" stroke="#254f69" stroke-width="1.5"/>';
      g+=cadLabel({x:p.x+(label==='E₂'?-21:21),y:p.y-17},label);}
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
