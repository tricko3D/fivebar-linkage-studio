// Independent Motion Study fold control; playback remains available in the header.
'use strict';
(() => {
  const panel = document.getElementById('routePanel');
  const content = document.getElementById('motionStudyContent');
  const toggle = document.getElementById('motionStudyToggle');
  if (!panel || !content || !toggle) return;
  const key = 'fivebar-motion-study-collapsed';

  function setCollapsed(collapsed) {
    panel.classList.toggle('is-collapsed', collapsed);
    content.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.setAttribute('aria-label', collapsed ? 'Show Motion Study graphs' : 'Hide Motion Study graphs');
    toggle.title = collapsed ? 'Show graphs' : 'Hide graphs';
    const icon = toggle.querySelector('svg, i');
    if (icon) icon.style.transform = collapsed ? 'rotate(180deg)' : '';
    try { localStorage.setItem(key, String(collapsed)); } catch (_) {}
    if (!collapsed && typeof drawMotionOverlayGraph === 'function' &&
        !document.getElementById('motionOverlayPane')?.hidden) {
      requestAnimationFrame(drawMotionOverlayGraph);
    }
  }

  let initial = true;
  try {
    const saved = localStorage.getItem(key);
    if (saved !== null) initial = saved === 'true';
  } catch (_) {}
  setCollapsed(initial);
  toggle.addEventListener('click', () =>
    setCollapsed(!panel.classList.contains('is-collapsed')));
})();
