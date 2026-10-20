const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({headless:true});
  const url = process.env.SIM_URL || 'http://127.0.0.1:8765/';
  for (const width of [1600, 700]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    const errors = [];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
    await page.goto(url,{waitUntil:'load',timeout:30000});
    await page.waitForTimeout(250);
    const initial = await page.locator('#mountX').inputValue();
    console.log('Testing '+url+' at '+width+'px; initial mountX='+initial);
    if (await page.locator('.config .settingsTabs').count()) throw Error('Settings tabs still inside sidebar');
    if (await page.locator('.topSettingsTabs button').count() !== 5) throw Error('Expected five header tool tabs');
    await page.locator('#fileMenuButton').click();
    if (!(await page.locator('#fileMenu').isVisible())) throw Error('File menu did not open');
    for (const id of ['importButton','exportButton','svgButton','reportButton','printButton'])
      if (!(await page.locator('#'+id).isVisible())) throw Error('File action missing: '+id);
    await page.keyboard.press('Escape');
    if (await page.locator('#fileMenu').isVisible()) throw Error('Escape did not close File menu');
    await page.locator('#fileMenuButton').click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#exportButton').click(),
    ]);
    if (!download.suggestedFilename().endsWith('.json')) throw Error('Save configuration did not download JSON');
    if (await page.locator('#fileMenu').isVisible()) throw Error('File menu did not close after export');
    if(width<850) await page.locator('#toggleSettings').click();
    await page.locator('.settingsTabs [data-setting="board"]').click();
    if(!(await page.locator('#mountX').isVisible()))throw Error('Board settings not visible');
    await page.locator('#mountX').fill('130');
    await page.locator('#mountX').dispatchEvent('change');
    if(await page.locator('#mountX').inputValue()!=='130')throw Error('Mount position did not change');
    await page.locator('.settingsTabs [data-setting="loads"]').click();
    if(!(await page.locator('#ratio').isVisible()))throw Error('Drive ratio input not visible');
    await page.locator('#ratio').fill('3');
    await page.locator('#ratio').dispatchEvent('change');
    const readout = await page.locator('#gearReadout').innerText();
    if(!readout.includes('3.00:1'))throw Error('Drive ratio did not update: '+readout);
    await page.locator('.settingsTabs [data-setting="links"]').click();
    if(!(await page.locator('#l1').isVisible()))throw Error('Link length input not visible');
    if(width<850){
      await page.locator('#closeSettings').click();
      await page.locator('#toggleInsights').click();
    }
    await page.locator('.resultTabs [data-insight="position"]').click();
    if(!(await page.locator('#outX').isVisible()))throw Error('Position results not visible');
    if(errors.length)throw Error('JavaScript errors: '+errors.join('; '));
    console.log('PASS '+width+'px: tabs, mounts, gear ratio and result panel');
    await page.close();
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
