const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const width of [1600,700]){
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  await page.goto('https://tricko3d.github.io/fivebar-linkage-studio/',{waitUntil:'networkidle',timeout:45000});
  const initial=await page.locator('#mountX').inputValue();
  console.log('width',width,'title',await page.title(),'initial mountX',initial,'tab count',await page.locator('.settingsTabs [data-setting]').count());
  if(width<850)await page.locator('#toggleSettings').click();
  await page.locator('.settingsTabs [data-setting="board"]').click();
  if(!(await page.locator('#mountX').isVisible()))throw Error('Board settings not visible');
  await page.locator('#mountX').fill('130');
  await page.locator('#mountX').dispatchEvent('change');
  const output=await page.locator('#mountX').inputValue();
  if(output!=='130')throw Error('Mount edit did not persist: '+output);
  await page.locator('.settingsTabs [data-setting="loads"]').click();
  if(!(await page.locator('#ratio').isVisible()))throw Error('Drive ratio input not visible');
  await page.locator('#ratio').fill('3');
  await page.locator('#ratio').dispatchEvent('change');
  const readout=await page.locator('#gearReadout').innerText();
  if(!readout.includes('3.00:1'))throw Error('Drive ratio did not update: '+readout);
  await page.locator('#resetButton').click({force:true}).catch(()=>{});
  console.log('width',width,'mount edit',output,'gear readout',readout.slice(0,100),'errors',errors);
  if(errors.length)throw Error('Browser JavaScript errors: '+errors.join('; ').slice(0,800));
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
