// Deterministic, self-contained, shareable Fivebar Studio configuration links.
// No accounts, server storage or URL shortener: the fragment is the configuration.
'use strict';
const SHARE_VERSION=1;
const SHARE_MAX=8192;
function shareCanonicalConfig(source=state){
  const values={};
  for(const key of Object.keys(defaults).sort()){
    const v=source[key];
    if(typeof v!==typeof defaults[key] || (typeof v==='number'&&!Number.isFinite(v)))
      throw new Error('Invalid parameter '+key);
    if(v!==defaults[key]) values[key]=v;
  }
  return JSON.stringify({v:SHARE_VERSION,s:values});
}
function shareEncode(source=state){
  const bytes=new TextEncoder().encode(shareCanonicalConfig(source));
  let binary='';
  for(const b of bytes) binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function shareDecode(token){
  if(typeof token!=='string'||!token.length||token.length>SHARE_MAX||!/^[A-Za-z0-9_-]+$/.test(token))
    throw new Error('Invalid or excessively long shared configuration');
  const raw=atob(token.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-token.length%4)%4));
  const bytes=Uint8Array.from(raw,ch=>ch.charCodeAt(0));
  const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!parsed || parsed.v!==SHARE_VERSION || !parsed.s ||
     typeof parsed.s!=='object'||Array.isArray(parsed.s))
    throw new Error('Unsupported configuration link format');
  const result={...defaults};
  for(const [key,value] of Object.entries(parsed.s)){
    if(!Object.prototype.hasOwnProperty.call(defaults,key) ||
       typeof value!==typeof defaults[key] ||
       (typeof value==='number'&&!Number.isFinite(value)))
      throw new Error('Unsupported or invalid configuration value: '+key);
    if(typeof value==='string'&&value.length>160)throw new Error('Configuration text is too long');
    result[key]=value;
  }
  return result;
}
function shareRootUrl(){
  const script=document.querySelector('script[src$="js/share-links.js"]');
  if(!script)throw new Error('Share library script URL unavailable');
  return new URL('../',script.src);
}
function shareLink(kind='studio',source=state){
  const root=shareRootUrl();
  const locationUrl=new URL(kind==='report'?'r/':'',root);
  locationUrl.hash='c='+shareEncode(source);
  return locationUrl.href;
}
function shareReadUrl(value=window.location.href){
  const url=new URL(value,window.location.href);
  // Support both host route and standalone /r/ viewer; no external redirects.
  const hash=new URLSearchParams(url.hash.replace(/^#/,''));
  const token=hash.get('c')||url.searchParams.get('c');
  return token?shareDecode(token):null;
}
function shareStateFromLink(value){
  const s=shareReadUrl(value);
  if(!s)throw new Error('The URL has no shared Fivebar configuration (#c=...)');
  return s;
}
// Return a plain state object; callers choose when to commit it.
function shareCurrentFromUrl(){
  return shareReadUrl(window.location.href);
}
function shareClearActiveLink(){
  if(window.location.hash.startsWith('#c='))
    history.replaceState(null,'',window.location.pathname+window.location.search);
}
