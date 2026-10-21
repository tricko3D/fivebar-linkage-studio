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
  // The navigation already names Board / Linkage / Motors / Mechanics / Display.
  // Keep section titles only INSIDE collapsible cards, not above them.
  rename(mounting, 'Motor mounting geometry');
  rename(linkage, 'Link lengths & assembly');
  rename(gripper, 'Gripper attachment');

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

  // All Linkage cards must share ONE settings section, like Motors & Drive.
  // Otherwise each child section flexes to fill a third of the rail height,
  // leaving artificial gaps and separator lines between the cards.
  mounting.classList.add('linkageStack');
  for (const section of [mounting, linkage, gripper]) {
    const header = section.querySelector(':scope > .sectheader');
    const details = document.createElement('details');
    details.className = 'mechanicsGroup linkageAccordion';
    details.open = true;
    const summary = document.createElement('summary');
    const name = document.createElement('span');
    name.textContent = header.textContent.trim();
    const arrow = document.createElement('i');
    arrow.dataset.lucide = 'chevron-down';
    arrow.setAttribute('aria-hidden', 'true');
    summary.append(name, arrow);
    const body = document.createElement('div');
    body.className = 'mechanicsGroupBody';
    for (const node of Array.from(section.children)) if (node !== header) body.append(node);
    header.remove();
    details.append(summary, body);
    mounting.append(details);
    if (section !== mounting) section.remove();
  }

  // Use exactly the same mechanicsGroup accordion component in every tab.
  // Move the existing nodes: their IDs, state binding and event listeners remain intact.
  function wrapCategoryControls(section, label) {
    const originalHeader = section.querySelector(':scope > .sectheader');
    if (originalHeader) originalHeader.remove();
    const children = Array.from(section.children);
    section.append(makeGroup(label, [], children));
  }
  wrapCategoryControls(board, 'Dimensions & margins');
  wrapCategoryControls(display, 'Workspace overlays');

  // Motors and Mechanics already contain accordion cards. No category title needed.
  for (const section of [motors, mechanics]) {
    const originalHeader = section.querySelector(':scope > .sectheader');
    if (originalHeader) originalHeader.remove();
  }

  // Five actual sections: Board, Linkage, Motors, Mechanics and Display.
  config.append(board, mounting, motors, mechanics, display);
})();