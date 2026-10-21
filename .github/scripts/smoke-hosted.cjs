const { chromium } = require('playwright');
const fs = require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const width of [1600,700]){
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('http://127.0.0.1:8765/',{waitUntil:'load',timeout:30000});
  await page.waitForTimeout(500);
  console.log('TEST '+width+'px');
  if(!(await page.locator('.resultTabs [data-insight="help"]').getAttribute('aria-selected')==='true'))throw Error('Guide is not default');
  if(!(await page.locator('#scaleLabel').isVisible()))throw Error('Scale missing');
  if(!/[0-9]+ mm/.test(await page.locator('#scaleLabel').innerText()))throw Error('Scale label invalid');
  if(await page.locator('.topSettingsTabs button').count()!==5)throw Error('Settings tabs missing');
  if(await page.locator('.config > .railTitle').count())throw Error('Redundant settings title bar returned');
  if(width>=851){
    const configBox=await page.locator('.config').boundingBox();
    const workBox=await page.locator('.workarea').boundingBox();
    if(configBox.width>250)throw Error('Settings rail wider than compact layout: '+configBox.width);
    if(Math.abs(workBox.x-(configBox.x+configBox.width))>1.1)
      throw Error('Settings and workspace are no longer flush');
  }
  if(await page.locator('.mountSpot').count()!==8)throw Error('Mount picker missing positions');
  if(!(await page.locator('#routePanel').evaluate(el=>el.parentElement.classList.contains('workarea'))))throw Error('Motion study is not below the canvas');
  if(!(await page.locator('#heatMode').evaluate(el=>el.closest('.canvasbox')!==null)))throw Error('Heatmap selector not inside canvas');
  const scaleBorder=await page.locator('#scaleTicks').evaluate(el=>getComputedStyle(el).borderLeftWidth);
  if(scaleBorder==='0px')throw Error('The map-style L scale is missing');
  if(await page.locator('#canvasScale').count()!==1)throw Error('Canvas ruler missing');
  if(await page.locator('#svgButton').count()!==1)throw Error('SVG tool missing');

  // Compact motion monitor combines playback and two live demand tracks.
  const route=page.locator('#routePanel');
  if(!(await route.evaluate(el=>el.parentElement.classList.contains('workarea'))))throw Error('Motion Study left workspace');
  if(await page.locator('#torqueGraph,#rpmGraph').count())throw Error('Legacy twin graphs remain');
  if(await route.locator('.motionBarRow').count()!==2)throw Error('Expected one torque and one RPM bar');
  if(!(await page.locator('#routeScrub').isVisible()))throw Error('Playback scrub is not integrated into the monitor');
  if(!(await page.locator('#routePlay').isVisible()))throw Error('Play button is not integrated');
  const initialHeight=await route.evaluate(el=>el.getBoundingClientRect().height);
  console.log('Motion monitor '+width+'px height '+Math.round(initialHeight)+'px');
  if(width>=1500&&initialHeight>220)throw Error('Motion monitor still occupies too much vertical space');
  if(!(await page.locator('#motionTorqueThreshold').isVisible()))throw Error('Torque safety limit missing');
  await page.locator('#routeScrub').fill('500');
  await page.locator('#routeScrub').dispatchEvent('input');
  if(!(await page.locator('#routeTime').innerText()).includes('s'))throw Error('Playback time readout broken');
  if(!(await page.locator('#motionRPMLeft').evaluate(el=>parseFloat(el.style.width)>0)))throw Error('RPM bar did not respond to scrub');
  await page.locator('#routePlay').click();
  await page.waitForTimeout(120);
  if(!(await page.locator('#routePlay span').innerText()).includes('Pause'))throw Error('Playback did not start');
  await page.locator('#routePlay').click();
  if(!(await page.locator('#routePlay span').innerText()).includes('Play'))throw Error('Playback did not pause');
  await page.locator('#routeReset').click();
  if(await page.locator('#routeScrub').inputValue()!=='0')throw Error('Reset did not rewind timeline');

  // Switch to the full overlaid graph, filter specific left/right curves,
  // switch the scale, and scrub the shared playback directly from the plot.
  await page.locator('[data-motion-view="graph"]').click();
  if(!(await page.locator('#motionOverlayGraph').isVisible()))throw Error('Graph view not visible');
  if(await page.locator('#motionBarsPane').isVisible())throw Error('Bars still visible in graph view');
  if(await page.locator('#motionOverlayGraph [data-plot-series]').count()!==4)throw Error('Expected four overlaid torque/RPM curves');
  await page.locator('[data-overlay-series="rpmR"]').uncheck();
  if(await page.locator('#motionOverlayGraph [data-plot-series="rpmR"]').count())throw Error('Unchecked RPM curve remained visible');
  if(await page.locator('#motionOverlayGraph [data-plot-series]').count()!==3)throw Error('Other curves disappeared when filtering');
  await page.locator('#motionGraphScale').selectOption('percent');
  if(!(await page.locator('#motionOverlayGraph').innerHTML()).includes('%'))throw Error('Percent-of-limit graph was not drawn');
  const plotted=page.locator('#motionOverlayGraph');
  await plotted.scrollIntoViewIfNeeded();
  const bounds=await plotted.boundingBox();
  if(!bounds)throw Error('Graph has no viewport');
  // Graph plot occupies x=57..855 in its 920px viewBox.
  await page.mouse.click(bounds.x+bounds.width*.67,bounds.y+bounds.height*.55);
  if(Number(await page.locator('#routeScrub').inputValue())<500)throw Error('Graph click did not scrub playback');
  if(!(await page.locator('[data-overlay-value="tauL"]').innerText()).includes('N·m'))throw Error('Graph legend values did not track playback');
  await page.locator('#motionGraphScale').selectOption('auto');
  if(await page.locator('#motionOverlayGraph [data-plot-series]').count()!==3)throw Error('Auto-scale lost selection');
  await page.locator('[data-motion-view="bars"]').click();
  if(!(await page.locator('#motionBarsPane').isVisible()))throw Error('Compact bars did not return');
  if(await page.locator('#motionOverlayPane').isVisible())throw Error('Graph did not hide');
  await page.locator('[data-motion-view="graph"]').click();
  if(await page.locator('[data-overlay-series="rpmR"]').isChecked())throw Error('Series selection did not persist across views');
  await page.locator('[data-motion-view="bars"]').click();

  await page.locator('#fileMenuButton').click();
  await page.waitForTimeout(400);
  if(!(await page.locator('#fileMenu').isVisible()))throw Error('File menu did not open');
  for(const x of ['importButton','exportButton','swVariablesButton','reportButton'])
   if(!(await page.locator('#'+x).isVisible()))throw Error('File action invisible: '+x);
  if(await page.locator('#fileMenu #svgButton').count())throw Error('SVG should only be on canvas');
  if(await page.locator('#printButton').count())throw Error('PDF export should be gone');
  if(await page.locator('.appHeader svg.lucide').count()<8)throw Error('Lucide did not load');
  const [md] = await Promise.all([page.waitForEvent('download'),page.locator('#reportButton').click()]);
  if(!md.suggestedFilename().endsWith('.md'))throw Error('Markdown export wrong name');
  const markdown=fs.readFileSync(await md.path(),'utf8');
  if(!markdown.includes('## ')||!markdown.includes('Calculation audit'))throw Error('Markdown export is not formatted');
  await page.locator('#fileMenuButton').click();
  const [sw]=await Promise.all([page.waitForEvent('download'),page.locator('#swVariablesButton').click()]);
  if(!sw.suggestedFilename().endsWith('.txt'))throw Error('SW export not TXT');
  const equations=fs.readFileSync(await sw.path(),'utf8');
  if(!equations.includes('"BoardWidth" = 255mm')||!equations.includes('"LeftProximalLength" ='))throw Error('SolidWorks variables missing');
  for(const key of ['LeftJointMinAngle','LeftJointMaxAngle','RightJointMinAngle','RightJointMaxAngle','HardStopsEnabled','ServoUsableTravel'])
    if(!equations.includes('"'+key+'" ='))throw Error('SolidWorks export omits '+key);
  const vars=[...equations.matchAll(/^"([^"]+)" = ([-\d.]+)(mm|deg)?$/gm)];
  if(vars.length<70)throw Error('Insufficient CAD variable coverage: '+vars.length);
  await page.locator('#fileMenuButton').click();
  const [json]=await Promise.all([page.waitForEvent('download'),page.locator('#exportButton').click()]);
  if(!json.suggestedFilename().endsWith('.json'))throw Error('Configuration not JSON');
  const [svg]=await Promise.all([page.waitForEvent('download'),page.locator('#svgButton').click()]);
  if(!svg.suggestedFilename().endsWith('.svg'))throw Error('Canvas SVG missing');
  await page.locator('#canvasHelp').click();
  if(!(await page.locator('#studioTooltip').isVisible()))throw Error('Contextual tooltip not shown');
  await page.keyboard.press('Escape');
  if(await page.locator('#studioTooltip').isVisible())throw Error('Tooltip not dismissed');
  if(!(await page.locator('#resizeButton span').innerText()).includes('Dynamic Resize Links'))throw Error('Resize label missing');
  await page.locator('#resizeButton').click();
  if(await page.locator('#resizeButton').getAttribute('aria-pressed')!=='true')throw Error('Resize not enabled');
  await page.locator('#resizeButton').click();
  if(await page.locator('#resizeButton').getAttribute('aria-pressed')!=='false')throw Error('Resize not disabled');

  if(width<850)await page.locator('#toggleSettings').click();
  await page.locator('.topSettingsTabs [data-setting="board"]').click();
  if(!(await page.locator('#boardW').isVisible()))throw Error('Board settings invisible');

  // Every Linkage section must be independently collapsible.
  await page.locator('.topSettingsTabs [data-setting="linkage"]').click();
  if(await page.locator('.linkageAccordion').count()!==3)throw Error('Expected three linkage accordions');
  for(const section of await page.locator('.linkageAccordion').all()){
    if(!(await section.evaluate(el=>el.open)))throw Error('Linkage accordion did not default to expanded');
    await section.locator('summary').click();
    if(await section.evaluate(el=>el.open))throw Error('Linkage accordion would not collapse');
    await section.locator('summary').click();
    if(!(await section.evaluate(el=>el.open)))throw Error('Linkage accordion would not reopen');
  }
  await page.locator('.mountSpot[data-preset="TC"]').click();
  if(await page.locator('#mountX').inputValue()!=='127.5')throw Error('Top centre not aligned horizontally');
  if(await page.locator('#angle').inputValue()!=='0')throw Error('Top centre angle incorrect');

  await page.locator('.topSettingsTabs [data-setting="mechanics"]').click();
  if(!(await page.locator('#sectionsGroup').isVisible()))throw Error('Mechanical sections missing');
  await page.locator('#sectionsGroup').evaluate(el=>el.open=true);
  if(!(await page.locator('#l1W').isVisible()))throw Error('Cross section fields missing');
  await page.locator('#sectionsGroup .crossSectionHead .infoTrigger').click();
  if(!(await page.locator('#studioTooltip').innerText()).includes('Link cross-sections, not link lengths'))
    throw Error('Cross-section explanation missing from tooltip');
  await page.keyboard.press('Escape');

  await page.locator('.topSettingsTabs [data-setting="motors"]').click();
  if(!(await page.locator('#ratio').isVisible()))throw Error('Drive inputs missing');
  await page.locator('#ratio').fill('3');
  await page.locator('#ratio').dispatchEvent('change');
  if(!(await page.locator('#gearReadout').innerText()).includes('3.00:1'))
    throw Error('Gear ratio did not recalculate');

  // Explicit min/max, per-value reset, and reset-all must all work in the rail.
  const stops=page.locator('#jointLimitsGroup');
  if(!(await stops.isVisible()))throw Error('Joint hard stops are hidden');
  if(await stops.locator('[data-joint-stop]').count()!==4 ||
     await stops.locator('[data-reset-stop]').count()!==4)
    throw Error('Expected four Set and four Reset buttons');
  await stops.locator('[data-joint-stop="leftMinAngle"]').click();
  if(!(await page.locator('#useJointLimits').isChecked()))throw Error('Set did not enable mechanical limits');
  const minValue=Number(await page.locator('#leftMinAngle').inputValue());
  if(!(minValue>0 && minValue<=360))throw Error('Set did not capture left joint angle');
  if(!(await page.locator('#currentLeftJointAngle').innerText()).includes('°'))throw Error('Live joint angle missing');
  await stops.locator('[data-reset-stop="leftMinAngle"]').click();
  if(await page.locator('#leftMinAngle').inputValue()!=='0')throw Error('Reset MIN failed');
  await stops.locator('[data-joint-stop="rightMaxAngle"]').click();
  await page.locator('#resetJointLimits').click();
  if(await page.locator('#useJointLimits').isChecked())throw Error('Reset all did not disable limits');
  if(await page.locator('#rightMaxAngle').inputValue()!=='360')throw Error('Reset all did not restore max');

  await page.locator('.topSettingsTabs [data-setting="display"]').click();
  const label=page.locator('label.toggle').filter({has:page.locator('#showCoverage')});
  const color=await label.evaluate(e=>getComputedStyle(e).color);
  if(color==='rgb(194, 209, 221)')throw Error('Checkbox text still washed out');
  if(width<850){await page.locator('#closeSettings').click();await page.locator('#toggleInsights').click();}
  await page.locator('.resultTabs [data-insight="position"]').click();
  if(!(await page.locator('#outX').isVisible()))throw Error('Position panel invisible');
  if(errors.length)throw Error('JavaScript console errors: '+errors.join('; ').slice(0,600));
  console.log('PASS '+width+'px with settings, linkage accordions, hard stops, SW export, compact rail and motion study');
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
