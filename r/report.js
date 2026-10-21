// Standalone report at /r/#c=... — no remote storage or backend.
'use strict';
let standaloneReportMarkdown='';
let standaloneCadSvg='';
let standaloneCadUrl=null;
function standaloneStatus(message){document.getElementById('reportStatus').textContent=message;}
function standaloneDownload(name,source,mime='text/markdown'){
  const url=URL.createObjectURL(new Blob([source],{type:mime+';charset=utf-8'}));
  const a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),0);
}
function initStandaloneReport(){
  const error=document.getElementById('reportError'),preview=$('fileHubMarkdownPreview'),source=$('reportMarkdownSource');
  try{
    const linked=shareCurrentFromUrl();
    if(!linked)throw new Error('No configuration found. Open a shared report URL from Files & Export → Share links.');
    state={...linked};
    state.outerW=Math.max(state.outerW,state.boardW);
    state.outerH=Math.max(state.outerH,state.boardH);
    standaloneReportMarkdown=buildAuditReport();
    standaloneCadSvg=buildCadDrawingSvg(state);
    standaloneCadUrl=URL.createObjectURL(new Blob([standaloneCadSvg],{type:'image/svg+xml'}));
    document.getElementById('reportCadImage').src=standaloneCadUrl;
    document.getElementById('reportCadFull').href=standaloneCadUrl;
    source.value=standaloneReportMarkdown;
    renderReportPreview(standaloneReportMarkdown);
    document.getElementById('reportBack').href=shareLink('studio',state);
    standaloneStatus('Report ready');
  }catch(err){
    error.textContent='Unable to open report: '+err.message;
    error.hidden=false;preview.hidden=true;
    document.querySelector('.reportCad').hidden=true;
    standaloneStatus('Invalid or missing configuration');
  }
  window.renderStudioMath=()=>{
    if(!preview.hidden && standaloneReportMarkdown)renderReportPreview(standaloneReportMarkdown);
  };
  document.getElementById('reportMode').addEventListener('click',event=>{
    if(!standaloneReportMarkdown)return;
    const asSource=source.hidden;
    source.hidden=!asSource;preview.hidden=asSource;
    event.currentTarget.textContent=asSource?'Formatted preview':'Markdown source';
    event.currentTarget.setAttribute('aria-pressed',String(asSource));
    if(!asSource)renderReportPreview(standaloneReportMarkdown);
  });
  const copy=async(str,message)=>{
    if(!str)return;
    try{await navigator.clipboard.writeText(str);standaloneStatus(message);}
    catch(err){standaloneStatus('Clipboard permission denied — use Markdown source or select the URL.');}
  };
  document.getElementById('reportCopy').addEventListener('click',()=>copy(standaloneReportMarkdown,'Markdown copied'));
  document.getElementById('reportCopyLink').addEventListener('click',()=>copy(window.location.href,'Report link copied'));
  document.getElementById('reportCadSave').addEventListener('click',()=>{
    if(standaloneCadSvg)standaloneDownload('fivebar-dimensioned-cad.svg',standaloneCadSvg,'image/svg+xml');
  });
  document.getElementById('reportCadToggle').addEventListener('click',event=>{
    const body=document.getElementById('reportCadBody');
    body.hidden=!body.hidden;
    event.currentTarget.textContent=body.hidden?'Show drawing':'Hide drawing';
    event.currentTarget.setAttribute('aria-expanded',String(!body.hidden));
  });
  window.addEventListener('pagehide',()=>{
    if(standaloneCadUrl)URL.revokeObjectURL(standaloneCadUrl);
  });
  document.getElementById('reportZip').addEventListener('click',async()=>{
    const btn=document.getElementById('reportZip');
    if(!standaloneReportMarkdown)return;
    btn.disabled=true;
    try { await downloadFivebarBundle(state);standaloneStatus('ZIP downloaded'); }
    catch(err){standaloneStatus('ZIP error: '+err.message);}
    finally{btn.disabled=false;}
  });
  document.getElementById('reportSave').addEventListener('click',()=>{
    if(standaloneReportMarkdown)standaloneDownload('fivebar-calculation-report.md',standaloneReportMarkdown);
  });
}
document.addEventListener('DOMContentLoaded',initStandaloneReport);
