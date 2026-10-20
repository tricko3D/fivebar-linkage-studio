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
  if(!/\\d+ mm/.test(await page.locator('#scaleLabel').innerText()))throw Error('Scale label invalid');
  if(await page.locator('.topSettingsTabs button').count()!==5)throw Error('Header tabs lost');
  if(await page.locator('.mountSpot').count()!==8)throw Error('Mount picker missing positions');
  if(await page.locator('#canvasScale').count()!==1)throw Error('Canvas ruler missing');
  if(await page.locator('#svgButton').count()!==1)throw Error('SVG tool missing');

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
  await page.locator('#fileMenuButton').click();
  const [json]=await Promise.all([page.waitForEvent('download'),page.locator('#exportButton').click()]);
  if(!json.suggestedFilename().endsWith('.json'))throw Error('Configuration not JSON');
  const [svg]=await Promise.all([page.waitForEvent('download'),page.locator('#svgButton').click()]);
  if(!svg.suggestedFilename().endsWith('.svg'))throw Error('Canvas SVG missing');
  await page.locator('#canvasHelp').click();
  if(!(await page.locator('#studioTooltip').isVisible()))throw Error('Contextual tooltip not shown');
  await page.keyboard.press('Escape');
  if(await page.locator('#studioTooltip').isVisible())throw Error('Tooltip not dismissed');
  await page.locator('#resizeButton').click();
  if(await page.locator('#resizeButton').getAttribute('aria-pressed')!=='true')throw Error('Resize not enabled');
  await page.locator('#resizeButton').click();
  if(await page.locator('#resizeButton').getAttribute('aria-pressed')!=='false')throw Error('Resize not disabled');

  if(width<850)await page.locator('#toggleSettings').click();
  await page.locator('.topSettingsTabs [data-setting="board"]').click();
  if(!(await page.locator('#mountX').isVisible()))throw Error('Board settings invisible');
  await page.locator('.mountSpot[data-preset="TC"]').click();
  if(await page.locator('#mountX').inputValue()!=='127.5')throw Error('Top centre not aligned horizontally');
  if(await page.locator('#angle').inputValue()!=='0')throw Error('Top centre angle incorrect');
  if(await page.locator('.mountSpot[data-preset="TC"]').getAttribute('aria-pressed')!=='true')throw Error('Picker selection not highlighted');
  await page.locator('.topSettingsTabs [data-setting="loads"]').click();
  if(!(await page.locator('#ratio').isVisible()))throw Error('Loads tab invisible');
  await page.locator('#ratio').fill('3');
  await page.locator('#ratio').dispatchEvent('change');
  if(!(await page.locator('#gearReadout').innerText()).includes('3.00:1'))throw Error('Gear ratio did not recalculate');
  await page.locator('.topSettingsTabs [data-setting="view"]').click();
  const label=page.locator('label.toggle').filter({has:page.locator('#showCoverage')});
  const color=await label.evaluate(e=>getComputedStyle(e).color);
  if(color==='rgb(194, 209, 221)')throw Error('Checkbox text still washed out');
  if(width<850){await page.locator('#closeSettings').click();await page.locator('#toggleInsights').click();}
  await page.locator('.resultTabs [data-insight="position"]').click();
  if(!(await page.locator('#outX').isVisible()))throw Error('Position panel invisible');
  if(errors.length)throw Error('JavaScript console errors: '+errors.join('; ').slice(0,600));
  console.log('PASS '+width+'px with mount picker, tooltip, ruler, exports, resize, tabs');
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
