// Isolated smoke test for motor profiles, default config and serialization.
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: {width: 1400, height: 900} });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:8765/', {waitUntil: 'load', timeout: 30000});

  const source = JSON.parse(fs.readFileSync('configs/default.json', 'utf8'));
  const initial = await page.evaluate(() => ({state: {...state}, defaults: {...defaults}}));
  for (const [key,value] of Object.entries(initial.defaults)) {
    if (JSON.stringify(source[key]) !== JSON.stringify(value))
      throw Error('Checked-in default mismatch: ' + key);
  }
  const baseline = initial.state;
  if (baseline.motorPreset !== 'nema17-baseline' || baseline.motorNm !== 0.25 ||
      baseline.motorRPM !== 180 || baseline.ratio !== 2 ||
      baseline.servoTravel !== 360 || !baseline.useJointLimits)
    throw Error('Incorrect NEMA 17 baseline: ' + JSON.stringify(baseline));

  await page.locator('[data-setting="motors"]').click();
  const noteStyle = await page.locator('#motorPresetNote').evaluate(el => ({
    size: parseFloat(getComputedStyle(el).fontSize),
    background: getComputedStyle(el).backgroundColor
  }));
  if (noteStyle.size > 11 || noteStyle.background === 'rgba(0, 0, 0, 0)')
    throw Error('Motor selection note does not use the compact material-note styling');

  async function select(family,key) {
    if (!(await page.locator('#motorPickerOverlay').isVisible()))
      await page.locator('#motorPickerTrigger').click();
    await page.locator('[data-motor-family="'+family+'"]').click();
    await page.locator('[data-motor-choice="'+key+'"]').click();
  }
  await page.locator('#motorPickerTrigger').click();
  if (await page.locator('[data-motor-family]').count() !== 6)
    throw Error('Expected servo, stepper and three BLDC motor groups');

  await select('outrunner','eagle-la8308-90kv');
  const eagle = await page.evaluate(() => ({
    preset:state.motorPreset,torque:state.motorNm,rpm:state.motorRPM,
    travel:state.servoTravel,ratio:state.ratio,settings:buildConfigurationJson(),
    link:shareLink('studio'),stored:localStorage.getItem('fivebar-linkage-studio-v1')
  }));
  if (eagle.preset !== 'eagle-la8308-90kv' || eagle.torque !== 0.45 ||
      eagle.rpm !== 500 || eagle.travel !== 360 || eagle.ratio !== 1)
    throw Error('Eagle preset not loaded');
  if (JSON.parse(eagle.settings).motorPreset !== eagle.preset ||
      JSON.parse(eagle.stored).motorPreset !== eagle.preset)
    throw Error('Motor selection absent from JSON or localStorage');
  const fromLink = await page.evaluate(url => shareStateFromLink(url), eagle.link);
  if (fromLink.motorPreset !== eagle.preset || fromLink.motorNm !== eagle.torque)
    throw Error('Motor data failed permalink round-trip');

  await select('actuator','cubemars-ak40-10');
  const ak = await page.evaluate(() => ({
    key:state.motorPreset,ratio:state.ratio,nm:state.motorNm,rpm:state.motorRPM
  }));
  if (ak.key !== 'cubemars-ak40-10' || ak.ratio !== 1 ||
      ak.nm !== 1.3 || ak.rpm !== 370)
    throw Error('Integrated actuator already-reduced output misapplied');

  await page.evaluate(data => importConfigurationJson(data),eagle.settings);
  const restored = await page.evaluate(() => ({
    preset:state.motorPreset,torque:state.motorNm,rpm:state.motorRPM,ratio:state.ratio
  }));
  if (restored.preset !== eagle.preset || restored.torque !== eagle.torque ||
      restored.rpm !== eagle.rpm || restored.ratio !== eagle.ratio)
    throw Error('JSON round-trip failed');

  // Old project JSON was missing the motor label and mistakenly declared 180°.
  const legacy={...source};
  delete legacy.motorPreset;
  legacy.servoTravel=180;
  await page.evaluate(data => importConfigurationJson(data),JSON.stringify(legacy));
  const migrated=await page.evaluate(() => ({
    preset:state.motorPreset,travel:state.servoTravel,ratio:state.ratio,
    torque:state.motorNm,rpm:state.motorRPM,stops:state.useJointLimits
  }));
  if (migrated.preset !== 'nema17-baseline' || migrated.travel !== 360 ||
      migrated.ratio !== 2 || migrated.torque !== 0.25 ||
      migrated.rpm !== 180 || !migrated.stops)
    throw Error('Legacy project configuration not migrated correctly');

  // Older unrelated servo configurations must remain 180°, not get reclassified.
  legacy.motorNm=0.08;
  legacy.ratio=1;
  await page.evaluate(data => importConfigurationJson(data),JSON.stringify(legacy));
  const other=await page.evaluate(() => ({preset:state.motorPreset,travel:state.servoTravel}));
  if (other.preset !== 'custom' || other.travel !== 180)
    throw Error('Unrelated legacy servo modified by migration');

  await select('gimbal','cubemars-ri30');
  const ri30=await page.evaluate(() => ({
    preset:state.motorPreset,nm:state.motorNm,rpm:state.motorRPM
  }));
  if (ri30.preset !== 'cubemars-ri30' || ri30.nm !== 0.076 || ri30.rpm !== 4110)
    throw Error('Rated frameless motor profile misapplied');

  await page.locator('#motorNm').fill('0.09');
  if ((await page.locator('#motorChoiceLabel').innerText()) !== 'Custom values')
    throw Error('Manual edit did not mark preset as custom');
  if (errors.length) throw Error('Page errors: ' + errors.join('; '));

  // Regression: stand-alone /r/ report previously crashed with
  // "motorPresets is not defined" for a shared MG90S configuration.
  const mg90sReportConfig = {
    ...initial.defaults,
    boardW: 182, boardH: 182, outerW: 210, outerH: 210,
    heatMode: 'motor',
    l1: 156.6040116480914, r1: 156.6040116480914,
    l2: 172.26441281290053, r2: 172.26441281290053,
    l1W: 10, l1H: 10, l2W: 10, l2H: 10,
    r1W: 10, r1H: 10, r2W: 10, r2H: 10,
    mountX: 92.90394592285156, mountY: 282.3293151855469,
    targetX: 79.625, targetY: 11.375,
    motorPreset: 'mg90s', motorNm: 0.08, motorRPM: 65,
    servoTravel: 180, ratio: 6, useJointLimits: false,
    leftMinAngle: 0, leftMaxAngle: 360,
    rightMinAngle: 0, rightMaxAngle: 360
  };
  const sharedMg90sReport = await page.evaluate(
    input => shareLink('report',input), mg90sReportConfig
  );
  const standalone = await browser.newPage({viewport: {width: 1200, height: 900}});
  const reportErrors = [];
  standalone.on('pageerror', error => reportErrors.push(error.message));
  await standalone.goto(sharedMg90sReport, {waitUntil: 'load', timeout: 30000});
  const reportError = await standalone.locator('#reportError').innerText();
  const reportStatus = await standalone.locator('#reportStatus').innerText();
  if (reportErrors.length || reportError ||
      !reportStatus.includes('Report ready') ||
      await standalone.locator('#fileHubMarkdownPreview h2').count() < 5)
    throw Error('Shared MG90S report failed: ' +
      JSON.stringify({reportStatus,reportError,reportErrors}));
  const reportState = await standalone.evaluate(() => ({
    motorPreset:state.motorPreset,motorNm:state.motorNm,motorRPM:state.motorRPM,
    servoTravel:state.servoTravel,ratio:state.ratio,boardW:state.boardW,boardH:state.boardH
  }));
  if (reportState.motorPreset !== 'mg90s' || reportState.motorNm !== 0.08 ||
      reportState.motorRPM !== 65 || reportState.servoTravel !== 180 ||
      reportState.ratio !== 6 || reportState.boardW !== 182 || reportState.boardH !== 182)
    throw Error('Report did not preserve MG90S shared settings: ' + JSON.stringify(reportState));
  const reportMarkdown = await standalone.locator('#reportMarkdownSource').inputValue();
  if (!reportMarkdown.includes('TowerPro MG90S') ||
      !reportMarkdown.includes('0.08') || !reportMarkdown.includes('6:1'))
    throw Error('Standalone report omitted motor choice or transmission values');
  await standalone.close();
  console.log('PASS motor presets, config, persistence, styling and standalone shared MG90S report');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
