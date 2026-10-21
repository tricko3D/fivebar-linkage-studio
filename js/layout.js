// Layout tabs, side drawers and responsive workspace.
'use strict';

(() => {
  'use strict';
  const config = document.querySelector('.config');
  const configSections = Array.from(config.querySelectorAll(':scope > .section'));
  const groups = { board: [0], linkage: [1, 2, 3], motors: [4], mechanics: [5], display: [6] };
  const inspector = document.querySelector('.analysis');
  const inspectors = Array.from(inspector.querySelectorAll(':scope > .panel'));
  const results = { servo: [0], forces: [1], position: [2], corners: [3], help: [4] };
  function choose(tabs, panels, mapping, selected) {
    Array.from(tabs.querySelectorAll('button[data-setting],button[data-insight]')).forEach(
      (button) => {
        const yes = (button.dataset.setting || button.dataset.insight) === selected;
        button.classList.toggle('is-active', yes);
        button.setAttribute('aria-selected', String(yes));
      },
    );
    panels.forEach((el, i) =>
      el.classList.toggle('is-active', (mapping[selected] || []).includes(i)),
    );
  }
  const titles = { board:'Board', linkage:'Linkage', motors:'Motors & Drive', mechanics:'Mechanics & Loads', display:'Display' };
  const railTitle = document.getElementById('settingsTitle');
  function chooseSettings(selected) {
    choose(settingTabs, configSections, groups, selected);
    if (railTitle) railTitle.textContent = titles[selected] || 'Settings';
  }
  const settingTabs = document.querySelector('.settingsTabs'),
    resultTabs = document.querySelector('.resultTabs');
  settingTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-setting]');
    if (btn) {
      chooseSettings(btn.dataset.setting);
      if (window.matchMedia('(max-width: 850px)').matches) {
        setDrawer('insights', false);
        setDrawer('settings', true);
      }
    }
  });
  resultTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-insight]');
    if (btn) choose(resultTabs, inspectors, results, btn.dataset.insight);
  });
  chooseSettings('board');
  choose(resultTabs, inspectors, results, 'help');
  function setDrawer(which, open) {
    document.body.classList.toggle('show-' + which, open);
    document
      .getElementById(which === 'settings' ? 'toggleSettings' : 'toggleInsights')
      .setAttribute('aria-expanded', String(open));
  }
  document.getElementById('toggleSettings').addEventListener('click', () => {
    const open = !document.body.classList.contains('show-settings');
    setDrawer('insights', false);
    setDrawer('settings', open);
  });
  document.getElementById('toggleInsights').addEventListener('click', () => {
    const open = !document.body.classList.contains('show-insights');
    setDrawer('settings', false);
    setDrawer('insights', open);
  });
  document
    .getElementById('closeSettings')
    .addEventListener('click', () => setDrawer('settings', false));
  document
    .getElementById('closeInsights')
    .addEventListener('click', () => setDrawer('insights', false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      setDrawer('settings', false);
      setDrawer('insights', false);
    }
  });
  // Compact file dropdown. Actual file operations remain handled by controls.js.
  const fileMenuButton = document.getElementById('fileMenuButton');
  const fileMenu = document.getElementById('fileMenu');
  const fileMenuWrap = document.getElementById('fileMenuWrap');
  function setFileMenu(open) {
    fileMenu.hidden = !open;
    fileMenuButton.setAttribute('aria-expanded', String(open));
    if (open) {
      setDrawer('settings', false);
      setDrawer('insights', false);
    }
  }
  fileMenuButton.addEventListener('click', () => {
    setFileMenu(fileMenu.hidden);
  });
  fileMenu.addEventListener('click', (event) => {
    if (event.target.closest('button[role="menuitem"]')) setFileMenu(false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (!fileMenu.hidden && !fileMenuWrap.contains(event.target)) setFileMenu(false);
  });
  fileMenuWrap.addEventListener('keydown', (event) => {
    const items = Array.from(fileMenu.querySelectorAll('button[role="menuitem"]'));
    if (event.key === 'Escape') {
      setFileMenu(false);
      fileMenuButton.focus();
      event.preventDefault();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (fileMenu.hidden) setFileMenu(true);
      const i = items.indexOf(document.activeElement);
      items[(i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      event.preventDefault();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !fileMenu.hidden) setFileMenu(false);
  });
  function updateHeaderHeight() {
    document.documentElement.style.setProperty(
      '--studio-header-height',
      document.querySelector('.appHeader').getBoundingClientRect().height + 'px'
    );
  }
  updateHeaderHeight();
  window.addEventListener('resize', updateHeaderHeight);

  // Make the scene layout responsive without overriding its kinematic viewBox.
  // The original resize listener recalculates the view when the browser size changes.
  if ('ResizeObserver' in window) {
    let previousWidth = 0,
      previousHeight = 0;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (Math.abs(width - previousWidth) > 1 || Math.abs(height - previousHeight) > 1) {
        previousWidth = width;
        previousHeight = height;
        // sceneViewport uses the SVG client aspect ratio, so rerender its viewBox.
        window.dispatchEvent(new Event('resize'));
      }
    });
    ro.observe(document.querySelector('.canvasbox'));
  }
})();
