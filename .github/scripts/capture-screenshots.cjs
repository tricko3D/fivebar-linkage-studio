const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true});
  fs.mkdirSync('screenshots',{recursive:true});
  const captures = [
    {name:'dashboard.png',width:1600,height:900},
    {name:'mechanical-analysis.png',width:1366,height:768},
    {name:'mobile.png',width:390,height:844}
  ];
  for (const c of captures) {
    const page = await browser.newPage({viewport:{width:c.width,height:c.height}, deviceScaleFactor:1});
    await page.goto('http://127.0.0.1:8765/',{waitUntil:'load'});
    await page.waitForTimeout(1400);
    if (c.name === 'mechanical-analysis.png') {
      const load = page.getByText('Loads & Drive', {exact:false});
      if (await load.count()) await load.first().click().catch(()=>{});
    }
    await page.screenshot({path:'screenshots/'+c.name,fullPage:false,animations:'disabled'});
    await page.close();
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});