// Reorganize existing configuration controls without recreating their state or listeners.
'use strict';
(function reorganizeSettings() {
  const config = document.querySelector('.config');
  const sections = Array.from(config.querySelectorAll(':scope > .section'));
  if (sections.length !== 7) throw new Error('Unexpected configuration layout');
  const [board, mounting, linkage, gripper, display, motors, mechanics] = sections;
  for (const [section, category] of [
    [board, 'board'], [mounting, 'linkage'], [linkage, 'linkage'],
    [gripper, 'linkage'], [motors, 'motors'], [mechanics, 'mechanics'],
    [display, 'display']
  ]) section.dataset.category = category;
  const rename = (section, name) => {
    section.querySelector(':scope > .sectheader').textContent = name;
  };
  rename(board, 'Board dimensions');
  rename(mounting, 'Motor mounting geometry');
  rename(linkage, 'Link lengths & assembly');
  rename(gripper, 'Gripper attachment');
  rename(motors, 'Motors & Drive');
  rename(mechanics, 'Mechanics & Loads');
  rename(display, 'Display');

  function setting(id) {
    const element = document.getElementById(id);
    if (!element) throw new Error('Missing configuration control: ' + id);
    const container = element.closest('.field, .toggle');
    if (!container) throw new Error('Missing field for ' + id);
    return container;
  }
  function makeGroup(title, ids, extra = []) {
    const details = document.createElement('details');
    details.className = 'mechanicsGroup';
    details.open = true;
    const summary = document.createElement('summary');
    const label = document.createElement('span');
    label.textContent = title;
    const chevron = document.createElement('i');
    chevron.dataset.lucide = 'chevron-down';
    chevron.setAttribute('aria-hidden', 'true');
    summary.append(label, chevron);
    const body = document.createElement('div');
    body.className = 'mechanicsGroupBody';
    let row = null;
    for (const id of ids) {
      const field = setting(id);
      if (field.classList.contains('toggle')) {
        body.append(field);
        row = null;
      } else {
        if (!row || row.children.length >= 2) {
          row = document.createElement('div');
          row.className = 'fieldrow';
          body.append(row);
        }
        row.append(field);
      }
    }
    for (const node of extra) if (node) body.append(node);
    details.append(summary, body);
    return details;
  }

  // Assembly constraints are geometric, not display preferences.
  linkage.append(setting('forbidCrossings'));
  const crossingHint = display.querySelector(':scope > p.hint');
  if (crossingHint) linkage.append(crossingHint);

  // Motor angle overlays are a display control; servo angle limits are hardware.
  display.append(setting('showServoArcs'), setting('showMechanics'));
  const travelCard = document.createElement('details');
  travelCard.className = 'mechanicsGroup';
  travelCard.open = true;
  const summary = document.createElement('summary');
  summary.innerHTML = '<span>Servo travel</span><i data-lucide="chevron-down" aria-hidden="true"></i>';
  const travelBody = document.createElement('div');
  travelBody.className = 'mechanicsGroupBody';
  for (const child of Array.from(motors.children))
    if (!child.classList.contains('sectheader')) travelBody.append(child);
  travelCard.append(summary, travelBody);
  motors.append(travelCard);
  // Hard stops must be a separate collapsible card, not nested in servo travel.
  const jointStopsCard = document.getElementById('jointLimitsGroup');
  if (jointStopsCard) motors.append(jointStopsCard);

  const transmissionReadout = document.getElementById('gearReadout');
  motors.append(
    makeGroup('Motor output', ['motorNm', 'motorRPM', 'motorSF']),
    makeGroup('Transmission & friction', ['ratio', 'efficiency', 'bearingFrictionNm'], [transmissionReadout]),
    makeGroup('Motion commands', ['xySpeed', 'accel', 'speedCap'])
  );

  // Link section geometry belongs with the printed dimensions, not material limits.
  const crossSectionBody = document.querySelector('#sectionsGroup .mechanicsGroupBody');
  const crossSectionRow = document.createElement('div');
  crossSectionRow.className = 'fieldrow';
  crossSectionRow.append(setting('sectionType'), setting('wall'));
  crossSectionBody.prepend(crossSectionRow);
  document.getElementById('driveGroup').remove();
  for (const row of config.querySelectorAll('.fieldrow'))
    if (row.children.length === 0) row.remove();

  // Place tabs in assembly/configuration workflow order.
  config.append(board, mounting, linkage, gripper, motors, mechanics, display);
})();