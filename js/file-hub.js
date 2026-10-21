// Unified file workspace. Read-only exports are generated from the current
// simulation; both pasted and loaded JSON use the same importConfigurationJson.
'use strict';

let fileHubKind = 'json';
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
  svg: { title:'Workspace drawing · SVG', help:'Scalable diagram of the current board and linkage configuration.', filename:'fivebar-chessboard.svg', mime:'image/svg+xml' }
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
// Render the subset of Markdown used by buildAuditReport without injecting HTML.
// Headings, paragraphs, and fenced code blocks remain fully selectable.
function renderReportPreview(markdown) {
  const root = document.getElementById('fileHubMarkdownPreview');
  root.replaceChildren();
  const lines = markdown.split(/\r?\n/);
  let codeLines = null, paragraph = [];
  const flushParagraph = () => {
    if (!paragraph.length) return;
    const p = document.createElement('p');
    p.textContent = paragraph.join(' ');
    root.append(p);
    paragraph = [];
  };
  for (const line of lines) {
    if (/^\x60\x60\x60/.test(line)) {
      if (codeLines) {
        const pre = document.createElement('pre');
        const code = document.createElement('code');
        code.textContent = codeLines.join('\n');
        pre.append(code); root.append(pre);
        codeLines = null;
      } else {
        flushParagraph(); codeLines = [];
      }
      continue;
    }
    if (codeLines) { codeLines.push(line); continue; }
    const header = line.match(/^(#{1,3})\s+(.+)$/);
    if (header) {
      flushParagraph();
      const title = document.createElement('h' + header[1].length);
      title.textContent = header[2]; root.append(title);
    } else if (!line.trim()) {
      flushParagraph();
    } else {
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  if (codeLines) {
    const pre=document.createElement('pre');
    pre.textContent=codeLines.join('\n');root.append(pre);
  }
}
function fileHubGenerate(kind=fileHubKind) {
  switch(kind) {
    case 'json': return buildConfigurationJson();
    case 'sw': return buildSolidWorksVariables();
    case 'md': return buildAuditReport();
    case 'svg': return buildWorkspaceSvg();
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
  document.getElementById('fileHubCopy').hidden = importing;
  document.getElementById('fileHubSave').hidden = importing;
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
  const showSvg=fileHubKind==='svg';
  field.hidden=showMd||showSvg;
  md.hidden=!showMd;
  svgPreview.hidden=!showSvg;
  field.readOnly=!importing;
  field.placeholder=importing?'Paste a Fivebar Studio JSON configuration here…':'';
  if (importing) {
    field.value='';
    fileHubStatus('Paste JSON and Apply, or load a JSON file.');
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
function openFileHub(kind='json') {
  const root=document.getElementById('fileHubOverlay');
  if (!root.hidden) return;
  if (!fileHubKinds[kind]) kind='json';
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
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(fileHubContent);
    else {
      const field=document.getElementById('fileHubText');
      const wasHidden=field.hidden;
      field.hidden=false;
      field.focus();field.select();
      if (!document.execCommand('copy')) throw new Error('Clipboard access denied');
      field.hidden=wasHidden;
    }
    fileHubStatus('Copied '+fileHubKinds[fileHubKind].filename+' content.');
  } catch(error) {
    fileHubStatus('Copy blocked. Open the source view and select the text.',true);
  }
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
