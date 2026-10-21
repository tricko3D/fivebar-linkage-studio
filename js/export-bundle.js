// Offline export: standard ZIP (stored entries) and self-contained HTML report.
'use strict';
const BUNDLE_CSS=[
 '*{box-sizing:border-box}body{max-width:1060px;margin:auto;padding:20px;background:#fff;font:14px/1.55 Arial,sans-serif;color:#29475b}',
 'h1{font-size:25px;color:#204d6c}h2{font-size:19px;border-bottom:1px solid #d5e2eb;padding:7px 0}',
 'h3{font-size:15px;color:#365d78;margin-top:24px}p{font-size:13px}',
 'header{display:flex;align-items:center;gap:10px;border-bottom:2px solid #4a91b7;padding-bottom:12px}header img{width:36px;height:36px}',
 '.drawing{margin:20px 0;padding:10px;background:#f3f7fa;border:1px solid #d0dfe8;border-radius:6px}.drawing svg{width:100%;height:auto;max-height:900px;display:block}',
 'table{width:100%;border-collapse:collapse;font-size:11px;margin:13px 0}th{background:#e9f2f9;text-align:left}td,th{padding:8px;border:1px solid #d6e2eb}tr:nth-child(even){background:#f9fcfe}',
 '.numeric{text-align:right}blockquote{background:#f2f7fb;padding:10px 14px;margin:12px 0;border-left:3px solid #82acc8}',
 'details{margin:10px 0;border:1px solid #d1e0ea;border-radius:6px;padding:0 11px 11px}summary{margin:0 -11px 12px;padding:10px;cursor:pointer;font-weight:bold;color:#315d7a;background:#edf5fa}',
 'details details{background:#f9fbfd}details details summary{background:#f4f7fa;color:#617d8c}',
 'pre,code{font:11px/1.55 Consolas,Menlo,monospace;white-space:pre-wrap;overflow-wrap:anywhere}',
 'pre{background:#f0f5f9;padding:11px;overflow:auto}.fileHubEquation{text-align:center;background:#f5f9fc;border:1px solid #dbe7ef;padding:13px;margin:13px 0;overflow-x:auto}',
 'math{font-size:1.13em}.fileHubReportTableScroll{overflow-x:auto}.fileHubUsage{display:inline-flex;gap:6px;align-items:center}',
 '.fileHubUsageTrack{display:inline-block;width:52px;height:7px;background:#dbe9f1;overflow:hidden;border-radius:7px}.fileHubUsageBar{display:block;height:100%;background:#4094ba}.fileHubUsageBar.is-over-limit{background:#c2795c}',
 'footer{border-top:1px solid #d4e0e9;font-size:11px;color:#748899;margin-top:25px;padding-top:12px}',
 '@media(max-width:650px){body{padding:9px}table{font-size:10px}td,th{padding:5px}}',
 '@media print{body{max-width:none;padding:0}.drawing{break-after:page}details{break-inside:avoid}}'
].join('');
const BUNDLE_CRC=Uint32Array.from({length:256},(_,i)=>{
  let crc=i;
  for(let n=0;n<8;n++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;
  return crc>>>0;
});
function bundleCRC(bytes){
  let crc=0xffffffff;
  for(const byte of bytes)crc=BUNDLE_CRC[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
function makeStoredZip(files){
  const encoder=new TextEncoder(),locals=[],centrals=[];
  let offset=0;
  for(const [name,source] of files){
    const bytes=source instanceof Uint8Array?source:encoder.encode(source);
    const filename=encoder.encode(name),checksum=bundleCRC(bytes);
    const local=new Uint8Array(30+filename.length+bytes.length),l=new DataView(local.buffer);
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);
    l.setUint16(8,0,true);l.setUint16(10,0,true);l.setUint16(12,0,true);
    l.setUint32(14,checksum,true);l.setUint32(18,bytes.length,true);l.setUint32(22,bytes.length,true);
    l.setUint16(26,filename.length,true);l.setUint16(28,0,true);
    local.set(filename,30);local.set(bytes,30+filename.length);locals.push(local);
    const central=new Uint8Array(46+filename.length),c=new DataView(central.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);
    c.setUint16(8,0x800,true);c.setUint16(10,0,true);c.setUint16(12,0,true);c.setUint16(14,0,true);
    c.setUint32(16,checksum,true);c.setUint32(20,bytes.length,true);c.setUint32(24,bytes.length,true);
    c.setUint16(28,filename.length,true);c.setUint16(30,0,true);c.setUint16(32,0,true);
    c.setUint16(34,0,true);c.setUint16(36,0,true);c.setUint32(38,0,true);c.setUint32(42,offset,true);
    central.set(filename,46);centrals.push(central);offset+=local.length;
  }
  const directorySize=centrals.reduce((sum,p)=>sum+p.length,0);
  const end=new Uint8Array(22),v=new DataView(end.buffer);
  v.setUint32(0,0x06054b50,true);v.setUint16(4,0,true);v.setUint16(6,0,true);
  v.setUint16(8,centrals.length,true);v.setUint16(10,centrals.length,true);
  v.setUint32(12,directorySize,true);v.setUint32(16,offset,true);v.setUint16(20,0,true);
  return new Blob([...locals,...centrals,end],{type:'application/zip'});
}
function bundleOfflineReport(markdown,cadSvg,faviconSvg){
  const holder=document.createElement('div');
  renderReportPreview(markdown,holder);
  // Prefer native MathML. It renders offline without KaTeX CSS, scripts or fonts.
  for(const element of holder.querySelectorAll('.fileHubEquation')){
    const math=element.querySelector('.katex-mathml math');
    if(math){element.replaceChildren(math.cloneNode(true));element.classList.remove('mathFallback');}
  }
  // Inline the exact exported CAD image in the report body; no duplicate
  // drawing section and no external image assets needed when opening the HTML.
  for(const image of holder.querySelectorAll('.fileHubReportDrawing img'))
    image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(cadSvg);
  // Keep audits collapsible; Print expands both levels when requested.
  const bytes=new TextEncoder().encode(faviconSvg);
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  const icon='data:image/svg+xml;base64,'+btoa(binary);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">'+
    '<title>Fivebar Engineering Report</title><link rel="icon" href="'+icon+'">'+
    '<style>'+BUNDLE_CSS+'</style></head><body>'+
    '<header><img src="'+icon+'" alt=""><strong>Fivebar Studio — Engineering Report</strong></header>'+
    '<main>'+holder.innerHTML+'</main>'+
    '<footer>Engineering estimates are indicative; check real mechanical and motor limits.</footer>'+
    '</body></html>';
}
async function buildStandaloneHtmlReport(config=state){
  const response=await fetch(new URL('favicon.svg',shareRootUrl()));
  if(!response.ok)throw new Error('Could not load the Fivebar favicon');
  const icon=await response.text();
  return bundleOfflineReport(buildAuditReport(),buildCadDrawingSvg(config),icon);
}
async function downloadFivebarHtmlReport(config=state){
  const html=await buildStandaloneHtmlReport(config);
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='fivebar-engineering-report.html';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}
async function fivebarBundleFiles(config=state){
  const markdown=buildAuditReport(),cad=buildCadDrawingSvg(config);
  const response=await fetch(new URL('favicon.svg',shareRootUrl()));
  if(!response.ok)throw new Error('Could not load the Fivebar favicon');
  const icon=await response.text();
  return [
    ['report.html',bundleOfflineReport(markdown,cad,icon)],
    ['drawing.svg',cad],
    ['configuration.json',JSON.stringify({schema:'fivebar-chess-v3',...config},null,2)],
    ['solidworks-variables.txt',buildSolidWorksVariables()],
    ['report.md',markdown]
  ];
}
async function downloadFivebarBundle(config=state){
  const files=await fivebarBundleFiles(config);
  const blob=makeStoredZip(files),url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download='fivebar-studio-export.zip';
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
  return files.length;
}
