// Configuration and results tabs, responsive drawers, and graph collapse controls.
(() => {
  'use strict';
  const config = document.querySelector('.config');
  const configSections = Array.from(config.querySelectorAll(':scope > .section'));
  const groups = {board:[0,1], links:[2,3], view:[4], servos:[5], loads:[6], files:[7]};
  const inspector = document.querySelector('.analysis');
  const inspectors = Array.from(inspector.querySelectorAll(':scope > .panel'));
  const results = {servo:[0],forces:[1],position:[2],corners:[3],help:[4]};
  function choose(tabs, panels, mapping, selected) {
    Array.from(tabs.querySelectorAll('button[data-setting],button[data-insight]')).forEach(button=>{
      const yes=(button.dataset.setting || button.dataset.insight)===selected;
      button.classList.toggle('is-active', yes);
      button.setAttribute('aria-selected', String(yes));
    });
    panels.forEach((el,i) => el.classList.toggle('is-active',(mapping[selected]||[]).includes(i)));
  }
  const settingTabs=document.querySelector('.settingsTabs'), resultTabs=document.querySelector('.resultTabs');
  settingTabs.addEventListener('click',e=>{
    const btn=e.target.closest('[data-setting]'); if(btn) choose(settingTabs,configSections,groups,btn.dataset.setting);
  });
  resultTabs.addEventListener('click',e=>{
    const btn=e.target.closest('[data-insight]'); if(btn) choose(resultTabs,inspectors,results,btn.dataset.insight);
  });
  choose(settingTabs,configSections,groups,'board');
  choose(resultTabs,inspectors,results,'position');
  function setDrawer(which, open) {
    document.body.classList.toggle('show-'+which,open);
    document.getElementById(which==='settings'?'toggleSettings':'toggleInsights').setAttribute('aria-expanded',String(open));
  }
  document.getElementById('toggleSettings').addEventListener('click',()=>{
    const open=!document.body.classList.contains('show-settings'); setDrawer('insights',false);setDrawer('settings',open);
  });
  document.getElementById('toggleInsights').addEventListener('click',()=>{
    const open=!document.body.classList.contains('show-insights'); setDrawer('settings',false);setDrawer('insights',open);
  });
  document.getElementById('closeSettings').addEventListener('click',()=>setDrawer('settings',false));
  document.getElementById('closeInsights').addEventListener('click',()=>setDrawer('insights',false));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){setDrawer('settings',false);setDrawer('insights',false)}});
  const routePanel=document.getElementById('routePanel'),routeCollapse=document.getElementById('routeCollapse');
  routeCollapse.addEventListener('click',()=>{
    const collapsed=routePanel.classList.toggle('is-collapsed');
    routeCollapse.textContent=collapsed?'▸ Show graphs':'▾ Hide graphs';
    routeCollapse.setAttribute('aria-expanded',String(!collapsed));
  });
  document.getElementById('routePlay').addEventListener('click',()=>{ if(routePanel.classList.contains('is-collapsed')) routeCollapse.click(); });
  if ('ResizeObserver' in window) {
    let previousWidth = 0, previousHeight = 0;
    const ro = new ResizeObserver(entries => {
      const {width, height} = entries[0].contentRect;
      if (Math.abs(width - previousWidth) > 1 || Math.abs(height - previousHeight) > 1) {
        previousWidth = width; previousHeight = height;
        window.dispatchEvent(new Event('resize'));
      }
    });
    ro.observe(document.querySelector('.canvasbox'));
  }
})();
