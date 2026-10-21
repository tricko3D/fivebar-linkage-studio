// Unified file workspace. Read-only exports are generated from the current
// simulation; both pasted and loaded JSON use the same importConfigurationJson.
'use strict';

let fileHubKind = 'share';
let fileHubJsonMode = 'export';
let fileHubMarkdownMode = 'preview';
let fileHubReturnFocus = null;
let fileHubSvgUrl = null;
let fileHubContent = '';
let fileHubInitialized = false;
const fileHubKinds = {
  json: { title:'Configuration · JSON', help:'All simulator parameters, saved material and manufacturing choices.', filename:'fivebar-chess-config.json', mime:'application/json' },
  sw: { title:'SolidWorks variables · TXT', help:'Global variables for Tools → Equations → Import in SolidWorks.', filename:'fivebar-solidworks-variables.txt', mime:'text/plain' },
  md: { title:'Calculation report · Markdown', help:'Reproducible calculations. Preview the report or inspect its Markdown source.', filename:'fivebar-calculation-report.md', mime:'text/markdown' },
  svg: { title:'CAD drawing · dimensioned SVG', help:'Plan view with outer-board edge datum, all four link lengths, motor separation and cross-sections.', filename:'fivebar-dimensioned-cad.svg', mime:'image/svg+xml' },
  share: { title:'Share configuration links', help:'Deterministic URLs containing the complete current settings.', filename:'', mime:'' }
};
function fileHubStatus(message, error = false) {
  const el = document.getElementById('fileHubStatus');
  if (!el) return;
  el.textContent = message;
  el.dataset.error = error ? 'true' : 'false';
}
function disposeFileHubSvg() {
  if (fileHubSvgUrl) URL.revokeObjectURL(fileHubSvgUrl);
  fileHubSvgUrl = null;
  const image = document.getElementById('fileHubSvgImage');
  if (image) image.removeAttribute('src');
}
// Rich, safe report renderer: tables, LaTeX, collapsible audit appendices.
// All text is inserted as text nodes; never execute Markdown as HTML.
function renderReportPreview(markdown) {
  const root=document.getElementById('fileHubMarkdownPreview');
  root.replaceChildren();
  const lines=markdown.split(/\r?\n/);
  const parentStack=[root];
  let parent=root,paragraph=[],list=null;
  const rich=(node,value)=>{
    for(const part of value.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)){
      if(!part)continue;
      if(part.startsWith('**')&&part.endsWith('**')){
        const strong=document.createElement('strong');
        strong.textContent=part.slice(2,-2);node.append(strong);
      } else if(part.startsWith('*')&&part.endsWith('*')){
        const em=document.createElement('em');
        em.textContent=part.slice(1,-1);node.append(em);
      } else node.append(document.createTextNode(part));
    }
  };
  const flush=()=>{
    if(paragraph.length){
      const p=document.createElement('p');
      rich(p,paragraph.join(' '));parent.append(p);paragraph=[];
    }
    list=null;
  };
  const tableLine=s=>/^\|.*\|$/.test(s);
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();
    if(line==='$$'){
      flush();
      const parts=[];
      while(++i<lines.length&&lines[i].trim()!=='$$')parts.push(lines[i]);
      const latex=parts.join('\n').trim();
      const block=document.createElement('div');
      block.className='fileHubEquation';
      block.setAttribute('aria-label','Mathematical equation');
      try{
        if(!window.katex?.render)throw new Error('KaTeX not loaded');
        window.katex.render(latex,block,{displayMode:true,throwOnError:true,trust:false});
      }catch(_){
        const fallback=document.createElement('code');
        fallback.textContent=latex;block.append(fallback);
        block.classList.add('mathFallback');
      }
      parent.append(block);continue;
    }
    if(/^\x60{3}/.test(line)){
      flush();
      const parts=[];
      while(++i<lines.length&&!/^\x60{3}/.test(lines[i].trim()))parts.push(lines[i]);
      const pre=document.createElement('pre'),code=document.createElement('code');
      code.textContent=parts.join('\n');pre.append(code);parent.append(pre);continue;
    }
    if(line==='<details>'){
      flush();
      const details=document.createElement('details');details.className='fileHubAuditDetails';
      parent.append(details);
      parentStack.push(details);parent=details;continue;
    }
    if(line==='</details>'){
      flush();
      if(parentStack.length>1)parentStack.pop();
      parent=parentStack[parentStack.length-1];continue;
    }
    const match=line.match(/^<summary>(.*?)<\/summary>$/);
    if(match){
      flush();
      const el=document.createElement('summary');el.textContent=match[1];parent.append(el);continue;
    }
    if(tableLine(line)){
      flush();
      const rows=[];
      while(i<lines.length&&tableLine(lines[i].trim())){
        const columns=lines[i].trim().slice(1,-1).split('|').map(x=>x.trim());
        if(!columns.every(x=>/^:?-{3,}:?$/.test(x)))rows.push(columns);
        i++;
      }
      i--;
      if(!rows.length)continue;
      const scroller=document.createElement('div');scroller.className='fileHubReportTableScroll';
      const table=document.createElement('table');table.className='fileHubReportTable';
      const head=document.createElement('thead'),headRow=document.createElement('tr');
      rows[0].forEach(val=>{const th=document.createElement('th');rich(th,val);headRow.append(th);});
      head.append(headRow);table.append(head);
      const body=document.createElement('tbody');
      rows.slice(1).forEach(row=>{
        const tr=document.createElement('tr');
        row.forEach((val,index)=>{
          const td=document.createElement('td');
          if(index>0&&/^[\d,.%+\-≥]/.test(val))td.classList.add('numeric');
          // Render model utilization as a compact bar; the Markdown download
          // retains the precise percentage in a normal table.
          if(rows[0][index]==='Used' && /^\d+(?:\.\d+)?%$/.test(val)){
            const amount=Number.parseFloat(val);
            const view=document.createElement('div');view.className='fileHubUsage';
            view.setAttribute('aria-label',val+' of model threshold');
            const label=document.createElement('span');label.textContent=val;
            const track=document.createElement('span');track.className='fileHubUsageTrack';
            const bar=document.createElement('span');bar.className='fileHubUsageBar';
            bar.style.width=Math.min(100,Math.max(0,amount))+'%';
            if(amount>100)bar.classList.add('is-over-limit');
            track.append(bar);view.append(label,track);td.append(view);
          }else rich(td,val);
          tr.append(td);
        });
        body.append(tr);
      });
      table.append(body);scroller.append(table);parent.append(scroller);continue;
    }
    const heading=line.match(/^(#{1,4})\s+(.+)$/);
    if(heading){
      flush();
      const el=document.createElement('h'+heading[1].length);
      rich(el,heading[2]);parent.append(el);continue;
    }
    if(line.startsWith('> ')){
      flush();
      const el=document.createElement('blockquote');
      rich(el,line.slice(2));parent.append(el);continue;
    }
    if(line.startsWith('- ')){
      if(paragraph.length)flush();
      if(!list){list=document.createElement('ul');parent.append(list);}
      const li=document.createElement('li');rich(li,line.slice(2));list.append(li);continue;
    }
    if(!line){flush();continue;}
    list=null;paragraph.push(line);
  }
  flush();
}
window.renderStudioMath=()=>{
  if(fileHubKind==='md'&&fileHubMarkdownMode==='preview'&&
     !document.getElementById('fileHubOverlay').hidden&&fileHubContent)
    renderReportPreview(fileHubContent);
};
function fileHubGenerate(kind=fileHubKind) {
  switch(kind) {
    case 'json': return buildConfigurationJson();
    case 'sw': return buildSolidWorksVariables();
    case 'md': return buildAuditReport();
    case 'svg': return buildCadDrawingSvg();
    default: throw new Error('Unknown file format');
  }
}
function refreshFileHub() {
  const item = fileHubKinds[fileHubKind], importing = fileHubKind==='json' && fileHubJsonMode==='import';
  document.getElementById('fileHubKindTitle').textContent = item.title;
  document.getElementById('fileHubKindHelp').textContent = item.help;
  document.querySelectorAll('[data-file-kind]').forEach(button => {
    const yes=button.dataset.fileKind===fileHubKind;
    button.classList.toggle('is-active',yes);
    button.setAttribute('aria-pressed',String(yes));
  });
  document.getElementById('fileHubJsonActions').hidden = fileHubKind!=='json';
  document.getElementById('fileHubMarkdownActions').hidden = fileHubKind!=='md';
  document.getElementById('fileHubImportActions').hidden = !importing;
  const sharing=fileHubKind==='share';
  document.getElementById('fileHubCopy').hidden = importing||sharing;
  document.getElementById('fileHubSave').hidden = importing||sharing;
  document.getElementById('fileHubOpenReport').hidden = fileHubKind!=='md';
  document.querySelectorAll('[data-json-mode]').forEach(button=>{
    const active=button.dataset.jsonMode===fileHubJsonMode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  document.querySelectorAll('[data-md-mode]').forEach(button=>{
    const active=button.dataset.mdMode===fileHubMarkdownMode;
    button.classList.toggle('is-active',active);
    button.setAttribute('aria-pressed',String(active));
  });
  disposeFileHubSvg();
  const field=document.getElementById('fileHubText');
  const md=document.getElementById('fileHubMarkdownPreview');
  const svgPreview=document.getElementById('fileHubSvgPreview');
  const showMd=fileHubKind==='md'&&fileHubMarkdownMode==='preview';
  const showSvg=fileHubKind==='svg',showShare=fileHubKind==='share';
  field.hidden=showMd||showSvg||showShare;
  md.hidden=!showMd;
  svgPreview.hidden=!showSvg;
  document.getElementById('fileHubSharePreview').hidden=!showShare;
  field.readOnly=!importing;
  field.placeholder=importing?'Paste configuration JSON or a shared studio/report URL here…':'';
  if (showShare) {
    try {
      document.getElementById('shareStudioUrl').value=shareLink('studio');
      document.getElementById('shareReportUrl').value=shareLink('report');
      fileHubStatus('Share this exact configuration via either link.');
    }catch(error){fileHubStatus('Cannot generate links: '+error.message,true);}
    fileHubContent='';
  } else if (importing) {
    field.value='';
    fileHubStatus('Paste JSON or a shared URL and Apply, or load a JSON file.');
  } else {
    try {
      fileHubContent=fileHubGenerate();
      field.value=fileHubContent;
      if (showMd) renderReportPreview(fileHubContent);
      if (showSvg) {
        fileHubSvgUrl=URL.createObjectURL(new Blob([fileHubContent],{type:'image/svg+xml'}));
        document.getElementById('fileHubSvgImage').src=fileHubSvgUrl;
      }
      fileHubStatus(item.filename+' · '+fileHubContent.length.toLocaleString('en-US')+' characters');
    } catch(error) {
      fileHubContent='';
      field.value='';
      fileHubStatus('Could not generate file: '+error.message,true);
    }
  }
}
function closeFileHub() {
  const root=document.getElementById('fileHubOverlay');
  if (root.hidden) return;
  root.hidden=true;
  document.body.classList.remove('fileHubOpen');
  document.getElementById('fileMenuButton').setAttribute('aria-expanded','false');
  disposeFileHubSvg();
  fileHubReturnFocus?.focus();
  fileHubReturnFocus=null;
}
function openFileHub(kind='share') {
  const root=document.getElementById('fileHubOverlay');
  if (!root.hidden) return;
  if (!fileHubKinds[kind]) kind='share';
  fileHubReturnFocus=document.activeElement;
  fileHubKind=kind;
  fileHubJsonMode='export';
  fileHubMarkdownMode='preview';
  root.hidden=false;
  document.body.classList.add('fileHubOpen');
  document.getElementById('fileMenuButton').setAttribute('aria-expanded','true');
  refreshFileHub();
  document.querySelector('[data-file-kind="'+kind+'"]')?.focus();
}
function fileHubImported(filename) {
  fileHubJsonMode='export';
  fileHubKind='json';
  refreshFileHub();
  fileHubStatus('Imported '+filename+' successfully.');
}
async function copyFileHubText() {
  if (!fileHubContent) return;
  let copied=false;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(fileHubContent);
      copied=true;
    }
  } catch (_) {
    // Fall through to the legacy copy command if Clipboard API permission fails.
  }
  if (!copied) {
    const field=document.getElementById('fileHubText');
    const wasHidden=field.hidden, wasReadOnly=field.readOnly;
    try {
      field.hidden=false;
      field.readOnly=true;
      field.focus();
      field.select();
      copied=!!document.execCommand('copy');
    } catch (_) {
      copied=false;
    } finally {
      field.hidden=wasHidden;
      field.readOnly=wasReadOnly;
    }
  }
  fileHubStatus(copied
    ? 'Copied '+fileHubKinds[fileHubKind].filename+' content.'
    : 'Copy blocked. Open the source view and select the text.', !copied);
}
function initFileHub() {
  if (fileHubInitialized) return;
  fileHubInitialized=true;
  const overlay=document.getElementById('fileHubOverlay');
  document.getElementById('fileMenuButton').addEventListener('click',()=>openFileHub());
  document.getElementById('fileHubClose').addEventListener('click',closeFileHub);
  overlay.addEventListener('click',event=>{
    if (event.target.closest('[data-file-hub-close]')) {closeFileHub();return;}
    const tab=event.target.closest('[data-file-kind]');
    if(tab&&overlay.contains(tab)) {
      fileHubKind=tab.dataset.fileKind;refreshFileHub();return;
    }
    const json=event.target.closest('[data-json-mode]');
    if(json&&overlay.contains(json)) {
      fileHubJsonMode=json.dataset.jsonMode;refreshFileHub();
      if(fileHubJsonMode==='import')document.getElementById('fileHubText').focus();
      return;
    }
    const md=event.target.closest('[data-md-mode]');
    if(md&&overlay.contains(md)) {fileHubMarkdownMode=md.dataset.mdMode;refreshFileHub();}
  });
  document.getElementById('fileHubRefresh').addEventListener('click',refreshFileHub);
  document.getElementById('fileHubLoad').addEventListener('click',()=>document.getElementById('importFile').click());
  document.getElementById('fileHubApply').addEventListener('click',()=>{
    try {
      const text=document.getElementById('fileHubText').value;
      importConfigurationJson(text);
      fileHubImported('pasted JSON');
    } catch(error) {fileHubStatus('Import failed: '+error.message,true);}
  });
  document.getElementById('fileHubCopy').addEventListener('click',copyFileHubText);
  document.getElementById('fileHubSave').addEventListener('click',()=>{
    if (!fileHubContent) return;
    const item=fileHubKinds[fileHubKind];
    download(item.filename,fileHubContent,item.mime+';charset=utf-8');
    fileHubStatus('Saving '+item.filename+'.');
  });
  const copyShare=async (inputId,label)=>{
    const text=document.getElementById(inputId).value;
    if(!text)return;
    try {
      await navigator.clipboard.writeText(text);
      fileHubStatus('Copied '+label+' permalink.');
    } catch(error) {
      const input=document.getElementById(inputId);
      input.focus();input.select();
      fileHubStatus('Select and copy the '+label+' URL.',true);
    }
  };
  document.getElementById('shareStudioCopy').addEventListener('click',()=>copyShare('shareStudioUrl','studio'));
  document.getElementById('shareReportCopy').addEventListener('click',()=>copyShare('shareReportUrl','report'));
  document.getElementById('shareStudioOpen').addEventListener('click',()=>{
    window.open(document.getElementById('shareStudioUrl').value,'_blank','noopener');
  });
  const openReport=()=>window.open(shareLink('report'),'_blank','noopener');
  document.getElementById('shareReportOpen').addEventListener('click',openReport);
  document.getElementById('fileHubOpenReport').addEventListener('click',openReport);
  document.getElementById('fileHubViewResults').addEventListener('click',()=>{
    closeFileHub();
    window.openStudioResults?.();
  });
  document.addEventListener('keydown',event=>{
    if(overlay.hidden)return;
    if(event.key==='Escape') {
      event.preventDefault();event.stopImmediatePropagation();
      closeFileHub();return;
    }
    if(event.key==='Tab') {
      const nodes=Array.from(overlay.querySelectorAll('button:not([hidden]):not([disabled]), textarea:not([hidden]):not([disabled])'))
        .filter(el=>el.getClientRects().length>0);
      if(!nodes.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
}
