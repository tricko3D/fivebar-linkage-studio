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
  const header=await page.locator('body > header').boundingBox();
  const app=await page.locator('main.app').boundingBox();
  if(!header||!app||header.x>0.5||app.x>0.5||app.y-header.y-header.height>1)
    throw Error('Outer header/workspace margins returned');
  if(Math.abs(app.width-width)>2)throw Error('Workspace does not fill viewport');
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
  const playColor=await page.locator('#routePlay').evaluate(el=>getComputedStyle(el).color);
  if(playColor!=='rgb(255, 255, 255)')
    throw Error('Active blue Play button should use white text: '+playColor);
  const coverageBottom=await page.locator('.statbar').evaluate(el=>el.getBoundingClientRect().bottom);
  const canvasTop=await page.locator('.canvasbox').evaluate(el=>el.getBoundingClientRect().top);
  if(Math.abs(canvasTop-coverageBottom)>1.5)
    throw Error('Unwanted gap between KPI cards and drawing: '+(canvasTop-coverageBottom));
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

  // Unified Files & Export replaces the old dropdown and header Results button.
  if(await page.locator('#toggleInsights,#fileMenu').count())
    throw Error('Legacy Results button or file dropdown remains');
  if(!((await page.locator('#fileMenuButton').getAttribute('aria-label')).includes('Files')))
    throw Error('Renamed Files & Export button missing');
  await page.locator('#fileMenuButton').click();
  if(!(await page.locator('#fileHubOverlay').isVisible()))
    throw Error('File workspace did not open');
  if(await page.locator('[data-file-kind]').count()!==5)
    throw Error('Expected JSON, SolidWorks, Markdown, CAD SVG and Share views');
  if(await page.locator('.fileHubRepositoryLinks a').count()!==2)
    throw Error('GitHub source and MIT license footer links missing');
  const hub=page.locator('#fileHubOverlay');
  const order=await page.locator('.fileHubTabs [data-file-kind]').evaluateAll(
    buttons=>buttons.map(button=>button.dataset.fileKind));
  if(order.join(',')!=='share,md,json,sw,svg')
    throw Error('Share links must appear first in Files & Export');
  if(await page.locator('[data-file-kind="share"]').getAttribute('aria-pressed')!=='true')
    throw Error('Files & Export should open to Share links');
  if(!(await page.locator('#shareStudioUrl').inputValue()).includes('#c='))
    throw Error('Default Share links panel did not generate a permalink');
  if(await page.locator('#resetButton .resetText').innerText()!=='Reset')
    throw Error('Reset action lost its visible label');
  if(!(await page.locator('.brand .mark img').getAttribute('src')).includes('favicon.svg'))
    throw Error('Brand logo must be the favicon');
  if(await page.locator('#headerReportButton').count()!==1)
    throw Error('Report shortcut missing in header');
  const resetSize=await page.locator('#resetButton').evaluate(el=>{
    const button=el.getBoundingClientRect(),label=el.querySelector('.resetText').getBoundingClientRect();
    return {button:button.width,contained:label.left>=button.left&&label.right<=button.right};
  });
  if(resetSize.button<65||!resetSize.contained)
    throw Error('Reset label is clipped: '+JSON.stringify(resetSize));
  if(await page.locator('#fileHubViewResults').count())
    throw Error('Obsolete View Results link still exists');
  if(await page.locator('.fileHubSidebar #fileHubReportDownload').count()!==1||
     await page.locator('.fileHubSidebar #fileHubZip').count()!==1)
    throw Error('Report and ZIP download buttons must be in the sidebar');
  const svgAsset=await page.evaluate(async()=>{
    const response=await fetch('screenshots/coverage-stats.svg');
    return response.ok?await response.text():null;
  });
  if(!svgAsset||!svgAsset.includes('64 / 64')||
     !svgAsset.includes('100%')||!svgAsset.includes('381 mm'))
    throw Error('Vector coverage graphic for README missing');
  await page.locator('[data-file-kind="json"]').click();
  if(!(await page.locator('#fileHubText').inputValue()).includes('"boardW": 255'))
    throw Error('JSON preview lacks current board settings');

  // Configuration export, inline paste import, file loading and validation.
  const [json]=await Promise.all([page.waitForEvent('download'),page.locator('#fileHubSave').click()]);
  if(!json.suggestedFilename().endsWith('.json'))throw Error('Configuration not JSON');
  const sourceJSON=await page.locator('#fileHubText').inputValue();
  await page.locator('[data-json-mode="import"]').click();
  if(await page.locator('#fileHubText').getAttribute('readonly')!==null)
    throw Error('Paste view is not editable');
  await page.locator('#fileHubText').fill('{ definitely not json }');
  await page.locator('#fileHubApply').click();
  if(!(await page.locator('#fileHubStatus').innerText()).includes('Import failed'))
    throw Error('Invalid pasted JSON was not rejected');
  const payload=JSON.parse(sourceJSON);
  payload.boardW=280;
  await page.locator('#fileHubText').fill(JSON.stringify(payload));
  await page.locator('#fileHubApply').click();
  if(await page.locator('#boardW').inputValue()!=='280')
    throw Error('Pasted JSON did not restore simulator fields');
  if(!(await page.locator('#fileHubText').inputValue()).includes('"boardW": 280'))
    throw Error('Updated imported JSON was not previewed');
  // Load a JSON file through the same import path, restoring original values.
  await page.locator('[data-json-mode="import"]').click();
  await page.locator('#importFile').setInputFiles({
    name:'restored-config.json',mimeType:'application/json',
    buffer:Buffer.from(sourceJSON,'utf8')
  });
  if(await page.locator('#boardW').inputValue()!=='255')
    throw Error('Loading JSON file did not restore the configuration');

  // SolidWorks source preview and download.
  await page.locator('[data-file-kind="sw"]').click();
  const equations=await page.locator('#fileHubText').inputValue();
  if(!equations.includes('"BoardWidth" = 255mm')||
     !equations.includes('"LeftProximalLength" ='))
    throw Error('SolidWorks variables missing from preview');
  for(const key of ['LeftJointMinAngle','LeftJointMaxAngle','RightJointMinAngle','RightJointMaxAngle','HardStopsEnabled','ServoUsableTravel'])
    if(!equations.includes('"'+key+'" ='))throw Error('SolidWorks export omits '+key);
  const vars=[...equations.matchAll(/^"([^"]+)" = ([-\\d.]+)(mm|deg)?$/gm)];
  if(vars.length<70)throw Error('Insufficient CAD variable coverage: '+vars.length);
  const [sw]=await Promise.all([page.waitForEvent('download'),page.locator('#fileHubSave').click()]);
  if(!sw.suggestedFilename().endsWith('.txt'))throw Error('SW export not TXT');

  // Calculation report: readable overview, actual math, tables and collapsed
  // exact-data audit. GitHub Markdown source must preserve all original sections.
  await page.locator('#fileHubClose').click();
  await page.locator('#headerReportButton').click();
  if(await page.locator('[data-file-kind="md"]').getAttribute('aria-pressed')!=='true')
    throw Error('Header report shortcut did not open Report tab');
  const reportPane=page.locator('#fileHubMarkdownPreview');
  if(!(await reportPane.isVisible()) ||
     await reportPane.locator('h2').count()<5)
    throw Error('Engineering report headings missing');
  if(await reportPane.locator('.fileHubReportTable').count()<4)
    throw Error('Report does not render model comparison tables');
  if(await reportPane.locator('.fileHubUsage').count()!==3)
    throw Error('Three visual limit-utilization bars are missing');
  if(await reportPane.locator('.fileHubEquation').count()<13)
    throw Error('Detailed equations are not formatted as LaTeX');
  if(await reportPane.locator('.fileHubAuditDetails').count()!==22)
    throw Error('Explained audit sections or nested raw-precision logs were lost');
  if(await reportPane.locator('.fileHubAuditDetails .fileHubAuditDetails').count()!==11)
    throw Error('Each audit section must have its own optional raw calculation log');
  if(await reportPane.locator('.fileHubAuditDetails[open]').count())
    throw Error('Detailed audits should start collapsed');
  const summary=await reportPane.locator('h2').first().innerText();
  if(!summary.includes('Executive summary'))
    throw Error('Engineering summary is not first');
  const eq=reportPane.locator('.fileHubEquation').first();
  if(await page.evaluate(()=>!!window.katex?.render)){
    if(await eq.locator('.katex').count()!==1)
      throw Error('KaTeX library loaded but equations were not typeset');
  }else if(await eq.locator('code').count()!==0) {
    // The raw LaTeX fallback is still available when third-party CDN is blocked.
  }else throw Error('Missing equation fallback');
  // Expanding a section should reveal real explanations, matrices and tables,
  // not immediately expose a block of decimal-heavy logging.
  const jacSummary=reportPane.locator('.fileHubAuditDetails > summary')
    .filter({hasText:'XY MOTOR TORQUE / FINITE-DIFFERENCE JACOBIAN'});
  await jacSummary.click();
  const jacSection=jacSummary.locator('..');
  if(!(await jacSection.getByText('Step 1 — Sample nearby motor angles').isVisible()))
    throw Error('Jacobian audit missing step-by-step explanation');
  if(await jacSection.locator('.fileHubReportTable').count()<4 ||
     await jacSection.locator('.fileHubEquation').count()<4)
    throw Error('Jacobian steps are not presented as mathematical tables and LaTeX');
  if(await jacSection.locator('details[open]').count())
    throw Error('Raw numerical log should remain collapsed inside Jacobian explanation');
  const rawSummary=jacSection.locator('details > summary').filter({hasText:'Raw calculation log'});
  await rawSummary.click();
  if(!(await jacSection.locator('details pre').isVisible()))
    throw Error('Full-precision raw log cannot be expanded');
  await jacSummary.click();
  if(await jacSection.getAttribute('open')!==null)
    throw Error('Explained section failed to collapse');
  await page.locator('[data-md-mode="source"]').click();
  const markdown=await page.locator('#fileHubText').inputValue();
  if(!markdown.includes('## Executive summary') ||
     !markdown.includes('\\frac') ||
     !markdown.includes('$$') ||
     !markdown.includes('<details>') ||
     !markdown.includes('ALL 64 SQUARE CENTRES') ||
     !markdown.includes('J_{\\\\theta\\\\leftarrow xy}') ||
     !markdown.includes('Raw calculation log — full precision'))
    throw Error('Source Markdown lost LaTeX or raw calculations');
  const [md]=await Promise.all([page.waitForEvent('download'),page.locator('#fileHubSave').click()]);
  if(!md.suggestedFilename().endsWith('.md'))throw Error('Markdown download wrong name');

  // SVG graphic preview, then download. SVG toolbar export remains available.
  await page.locator('[data-file-kind="svg"]').click();
  if(!(await page.locator('#fileHubSvgPreview').isVisible()) ||
     !(await page.locator('#fileHubSvgImage').getAttribute('src')).startsWith('blob:'))
    throw Error('SVG image preview is missing');
  const cadSvg=await page.evaluate(()=>buildCadDrawingSvg());
  if(!cadSvg.includes('EDGE MID')||!cadSvg.includes('LINK CROSS SECTIONS')||
     !cadSvg.includes('L1  200 mm')||!cadSvg.includes('R2  220 mm'))
    throw Error('CAD drawing dimensions missing');
  const datum=await page.evaluate(()=>cadEdgeReference());
  if(datum.side!=='BOTTOM'||Math.abs(datum.distance-102.5)>0.001)
    throw Error('Motor mounting distance must reference outer board edge midpoint');
  const [svg]=await Promise.all([page.waitForEvent('download'),page.locator('#fileHubSave').click()]);
  if(!svg.suggestedFilename().includes('cad.svg'))throw Error('CAD SVG filename incorrect');

  // Share view, link stability, independent studio/report loading.
  await page.locator('[data-file-kind="share"]').click();
  const studioLink=await page.locator('#shareStudioUrl').inputValue();
  const reportLink=await page.locator('#shareReportUrl').inputValue();
  if(!studioLink.includes('/#c=')||!reportLink.includes('/r/#c='))
    throw Error('Deterministic share routes missing');
  const stable=await page.evaluate(()=>shareLink('studio')===shareLink('studio'));
  if(!stable)throw Error('Share link generation is nondeterministic');
  const child=await browser.newPage({viewport:{width,height:900}});
  await child.goto(studioLink,{waitUntil:'load',timeout:30000});
  if(await child.locator('#boardW').inputValue()!=='255')
    throw Error('Shared URL did not restore board dimensions');
  if(!(await child.url()).includes('#c='))
    throw Error('Initial studio URL must always contain the current config');
  const originalUrl=child.url();
  await child.locator('#motorSF').evaluate(input=>{
    input.value='1.9';
    input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  if(child.url()===originalUrl ||
     !(await child.evaluate(()=>shareReadUrl()?.motorSF===1.9)))
    throw Error('Changing a configuration value must immediately update the URL');
  await child.locator('#resetButton').click();
  if(!(await child.evaluate(()=>shareReadUrl()?.motorSF===defaults.motorSF &&
       shareReadUrl()?.useJointLimits===true &&
       shareReadUrl()?.leftMinAngle===247.8 &&
       shareReadUrl()?.leftMaxAngle===31.8)))
    throw Error('Reset must restore the joint-limited baseline and update the URL');
  await child.close();
  const standalone=await browser.newPage({viewport:{width,height:900}});
  await standalone.goto(reportLink,{waitUntil:'load',timeout:30000});
  if(!(await standalone.locator('#reportStatus').innerText()).includes('Report ready') ||
     await standalone.locator('#fileHubMarkdownPreview h2').count()<5)
    throw Error('Standalone /r/ report link failed to render');
  if(!(await standalone.locator('#reportBack').getAttribute('href')).includes('#c='))
    throw Error('Standalone report cannot return to the exact studio snapshot');
  if(await standalone.locator('.reportCad').count()!==0)
    throw Error('CAD drawing must not appear in its own report panel');
  const inlineCad=standalone.locator('#fileHubMarkdownPreview .fileHubReportDrawing img');
  if(await inlineCad.count()!==1 ||
     !(await inlineCad.isVisible()) ||
     !(await inlineCad.getAttribute('src')).startsWith('data:image/svg+xml'))
    throw Error('CAD drawing is missing from the report body');
  const cadSource=await standalone.evaluate(()=>buildCadDrawingSvg(state));
  if(!cadSource.includes('EDGE → M') ||
     !cadSource.includes('MOTOR JOINT ANGLES') ||
     !cadSource.includes('MIN 247.8°') ||
     !cadSource.includes('MAX 31.8°') ||
     !cadSource.includes('LINK CROSS SECTIONS'))
    throw Error('Inline CAD drawing does not include the current mechanical limits');
  const docsCad=await standalone.evaluate(async()=>{
    const response=await fetch('../screenshots/default-cad.svg');
    return response.ok?await response.text():null;
  });
  if(!docsCad||!docsCad.includes('MIN 247.8°'))
    throw Error('README drawing does not use the default joint-limited preset');
  // Switch to source first: Print must restore the formatted report and open
  // EVERY nested disclosure, including raw intermediate calculations.
  await standalone.locator('#reportMode').click();
  await standalone.evaluate(()=>{window.__printInvocations=0;
    window.print=()=>{window.__printInvocations++;};
  });
  await standalone.locator('#reportPrint').click();
  const expanded=await standalone.locator('#fileHubMarkdownPreview details[open]').count();
  if(expanded!==22 ||
     !(await standalone.locator('#fileHubMarkdownPreview').isVisible()) ||
     !(await standalone.locator('#reportMarkdownSource').isHidden()) ||
     !(await standalone.evaluate(()=>window.__printInvocations===1)))
    throw Error('Print must expand all 22 sections and invoke the browser print dialog');
  const [standaloneZip]=await Promise.all([
    standalone.waitForEvent('download'),standalone.locator('#reportZip').click()
  ]);
  if(!standaloneZip.suggestedFilename().endsWith('.zip'))
    throw Error('Standalone report ZIP download missing');
  await standalone.close();

  await page.locator('[data-file-kind="json"]').click();
  await page.locator('[data-json-mode="import"]').click();
  await page.locator('#fileHubText').fill(reportLink);
  await page.locator('#fileHubApply').click();
  if(!(await page.locator('#fileHubStatus').innerText()).includes('Imported'))
    throw Error('Pasting a report URL did not import the configuration');
  const [htmlReport]=await Promise.all([
    page.waitForEvent('download'),page.locator('#fileHubReportDownload').click()
  ]);
  if(htmlReport.suggestedFilename()!=='fivebar-engineering-report.html')
    throw Error('Sidebar did not download the standalone HTML report');
  const reportHTML=fs.readFileSync(await htmlReport.path(),'utf8');
  if(!reportHTML.includes('<style>')||!reportHTML.includes('<svg ')||
     /<script|(?:src|href)="https?:/i.test(reportHTML))
    throw Error('HTML report download is not self-contained');
  const [zip]=await Promise.all([
    page.waitForEvent('download'),page.locator('#fileHubZip').click()
  ]);
  if(zip.suggestedFilename()!=='fivebar-studio-export.zip')
    throw Error('Offline HTML ZIP bundle missing from Files & Export');
  const archive=fs.readFileSync(await zip.path());
  const zipped=new Map();
  for(let offset=0;offset+30<archive.length&&archive.readUInt32LE(offset)===0x04034b50;){
    const size=archive.readUInt32LE(offset+18);
    const nameSize=archive.readUInt16LE(offset+26);
    const extra=archive.readUInt16LE(offset+28);
    const name=archive.toString('utf8',offset+30,offset+30+nameSize);
    const start=offset+30+nameSize+extra;
    zipped.set(name,archive.subarray(start,start+size).toString('utf8'));
    offset=start+size;
  }
  const expected=['report.html','drawing.svg','configuration.json',
    'solidworks-variables.txt','report.md'];
  if(zipped.size!==expected.length||expected.some(name=>!zipped.has(name)))
    throw Error('ZIP is missing its offline report or other requested files');
  const html=zipped.get('report.html');
  if(!html.includes('<style>')||!html.includes('<svg ')||
     !html.includes('data:image/svg+xml;base64,')||
     !html.includes('Executive summary')||
     /<script|(?:src|href)="https?:/i.test(html))
    throw Error('ZIP report HTML is not fully self-contained');
  if(!zipped.get('drawing.svg').includes('MOTOR JOINT ANGLES'))
    throw Error('ZIP CAD drawing lost its MIN/MAX schedule');
  await page.locator('#fileHubClose').click();
  if(await hub.isVisible())throw Error('File workspace failed to close');
  if(await page.locator('link[rel="icon"][href="favicon.svg"]').count()!==1)
    throw Error('Custom SVG favicon not linked');
  await page.locator('.topSettingsTabs [data-setting="display"]').click();
  await page.locator('#showDimensions').check();
  if(await page.locator('#cadDimensions .cadDimension').count()<6)
    throw Error('Live SVG does not show CAD dimension arrows');
  await page.locator('#showDimensions').uncheck();
  if(await page.locator('#printButton').count())throw Error('PDF export should be gone');
  if(await page.locator('.appHeader svg.lucide').count()<5)
    throw Error('Header icons did not load');
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
  // All five tabs use the same accordion component; no duplicated category header.
  for(const category of ['board','linkage','motors','mechanics','display']){
    const section=page.locator('.config > .section[data-category="'+category+'"]');
    if(await section.count()!==1)throw Error('Missing settings section: '+category);
    if(await section.locator(':scope > .sectheader').count())
      throw Error('Redundant category title remains: '+category);
    if(await section.locator('.mechanicsGroup').count()<1)
      throw Error('Settings category lacks collapsible cards: '+category);
  }
  if(await page.locator('.config > .section[data-category="board"] > .mechanicsGroup').count()!==1)
    throw Error('Board settings are not one collapsible card');
  const boardCard=page.locator('.config > .section[data-category="board"] > .mechanicsGroup');
  await boardCard.locator('summary').click();
  if(await page.locator('#boardW').isVisible())throw Error('Board card did not collapse');
  await boardCard.locator('summary').click();
  if(!(await page.locator('#boardW').isVisible()))throw Error('Board card did not reopen');
  await page.locator('.topSettingsTabs [data-setting="display"]').click();
  const displayCard=page.locator('.config > .section[data-category="display"] > .mechanicsGroup');
  if(await displayCard.count()!==1)throw Error('Display overlay controls not inside a card');
  if(!(await page.locator('#showCoverage').isVisible()))throw Error('Display overlay controls hidden');
  await auditActiveFieldRows();
  await page.locator('.topSettingsTabs [data-setting="board"]').click();
  await auditActiveFieldRows();

  // Every Linkage section must be independently collapsible.
  await page.locator('.topSettingsTabs [data-setting="linkage"]').click();
  if(await page.locator('.linkageAccordion').count()!==3)throw Error('Expected three linkage accordions');
  await auditActiveFieldRows();
  if(await page.locator('.config > .section').count()!==5)throw Error('Expected one section per settings tab');
  const linkageParentCount=await page.locator('.linkageAccordion').evaluateAll(
    cards => new Set(cards.map(card => card.parentElement)).size
  );
  if(linkageParentCount!==1)throw Error('Linkage cards live in separate settings sections');
  const cards=await page.locator('.linkageAccordion').all();
  for(let i=1;i<cards.length;i++){
    const top=await cards[i-1].boundingBox(), bottom=await cards[i].boundingBox();
    if(!top||!bottom||bottom.y-(top.y+top.height)>15)
      throw Error('Linkage cards do not stack closely');
  }
  for(const section of cards){
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

  // Custom process/material overlay: process tabs filter available materials
  // and selections update calculations, reports and the persisted configuration.
  const pickerTrigger=page.locator('#materialPickerTrigger');
  if(!(await pickerTrigger.isVisible()))throw Error('Material picker trigger hidden');
  const getValues=()=>page.evaluate(()=>({
    material:state.material,manufacturing:state.manufacturing,
    youngMPa:state.youngMPa,density:state.density,
    stressLimit:state.stressLimit,stiffFactor:state.stiffFactor
  }));
  await pickerTrigger.click();
  const overlay=page.locator('#materialPickerOverlay');
  if(!(await overlay.isVisible()))throw Error('Material overlay did not open');
  const dialogBefore=await page.locator('.materialPickerDialog').boundingBox();
  if(await overlay.locator('[data-manufacturing]').count()!==4)
    throw Error('Manufacturing picker must list only FDM, SLS, SLA and CNC');
  const groups=await overlay.locator('[data-manufacturing]').evaluateAll(items =>
    items.map(item=>item.dataset.manufacturing));
  if(groups.join(',')!=='fdm,sls,sla,cnc')
    throw Error('Unexpected manufacturing methods: '+groups.join(','));
  for(const [method,expected,values] of [
    ['fdm',6,['pla','petg','pla-cf','petg-cf','pa6-cf','custom']],
    ['sls',4,['pa12-sls','pa11-sls','pa12-gf-sls','custom']],
    ['sla',4,['formlabs-tough2000-v2','formlabs-rigid4000','formlabs-high-temp','custom']],
    ['cnc',5,['al6061','al7075','steel1018','ss304','custom']]
  ]){
    await overlay.locator('[data-manufacturing="'+method+'"]').click();
    const choices=await overlay.locator('[data-material-choice]').evaluateAll(items =>
      items.map(item=>item.dataset.materialChoice));
    if(choices.length!==expected || choices.join(',')!==values.join(','))
      throw Error('Wrong '+method+' materials: '+choices.join(','));
  }
  const dialogAfter=await page.locator('.materialPickerDialog').boundingBox();
  if(!dialogBefore||!dialogAfter||
     Math.abs(dialogBefore.y-dialogAfter.y)>1||Math.abs(dialogBefore.height-dialogAfter.height)>1)
    throw Error('Material dialog jumps when switching processes');
  await overlay.locator('[data-manufacturing="fdm"]').click();
  if((await overlay.locator('#materialPickerProcessName').innerText()).trim()!=='FDM')
    throw Error('FDM label should not include FFF');
  if(await page.locator('#materialPickerSearch').count())
    throw Error('Short material picker should not waste space on search');
  if(await overlay.locator('[data-material-choice="pla-cf"]').count()!==1 ||
     await overlay.locator('[data-material-choice="pla"]').count()!==1)
    throw Error('PLA and PLA-CF must both appear in FDM materials');
  await overlay.locator('[data-material-choice="pla"]').click();
  const plainPla=await getValues();
  if(plainPla.material!=='pla'||plainPla.manufacturing!=='fdm'||
     plainPla.youngMPa!==2500||plainPla.density!==1.24||
     plainPla.stressLimit!==12||plainPla.stiffFactor!==0.65)
    throw Error('Normal PLA selection did not apply existing material properties');
  const plaSW=await page.evaluate(()=>buildSolidWorksVariables());
  if(!plaSW.includes('"MaterialPresetCode" = 1') ||
     !plaSW.includes('"MaterialYoungModulus_MPa" = 2500'))
    throw Error('Normal PLA did not retain its SolidWorks material code');
  await pickerTrigger.click();
  await overlay.locator('[data-material-choice="pla-cf"]').click();
  const plaCf=await getValues();
  if(plaCf.material!=='pla-cf'||plaCf.manufacturing!=='fdm'||plaCf.youngMPa!==3950||
     plaCf.density!==1.22||plaCf.stressLimit!==20||plaCf.stiffFactor!==0.65)
    throw Error('PLA-CF overlay selection did not update calculations');
  if(await overlay.isVisible())throw Error('Material picker did not close on selection');

  await pickerTrigger.click();
  await overlay.locator('[data-manufacturing="cnc"]').click();
  if(!(await page.locator('#materialPickerProcessName').innerText()).includes('CNC'))
    throw Error('CNC process was not selected');
  if(await overlay.locator('[data-material-choice="pla-cf"]').count())
    throw Error('CNC process displays FDM filament');
  if(await overlay.locator('[data-material-choice="ti64"]').count() ||
     await overlay.locator('[data-material-choice="pom"]').count())
    throw Error('Titanium or POM must not appear in the CNC picker');
  await overlay.locator('[data-material-choice="al6061"]').click();
  const aluminum=await getValues();
  if(aluminum.material!=='al6061'||aluminum.manufacturing!=='cnc'||aluminum.youngMPa!==69000||
     aluminum.density!==2.7||aluminum.stiffFactor!==1||aluminum.stressLimit!==95)
    throw Error('CNC aluminum material did not update all parameters');
  const aluminumSW=await page.evaluate(()=>buildSolidWorksVariables());
  if(!aluminumSW.includes('"MaterialPresetCode" = 25')||
     !aluminumSW.includes('"ManufacturingMethodCode" = 5')||
     !aluminumSW.includes('"EffectiveYoungModulus_MPa" = 69000'))
    throw Error('Manufacturing export did not include CNC and aluminum variables');

  await page.locator('#youngMPa').fill('73000');
  await page.locator('#youngMPa').dispatchEvent('change');
  const custom=await getValues();
  if(custom.material!=='custom'||custom.manufacturing!=='cnc'||custom.youngMPa!==73000||
     !(await page.locator('#materialChoiceLabel').innerText()).includes('Custom'))
    throw Error('Editing preset values did not switch to Custom for CNC');

  await pickerTrigger.click();
  await overlay.locator('[data-manufacturing="sla"]').click();
  if(await overlay.locator('[data-material-choice="formlabs-tough2000-v2"]').count()!==1||
     await overlay.locator('[data-material-choice="resin-tough"]').count()!==0||
     await overlay.locator('[data-material-choice="al6061"]').count()!==0)
    throw Error('SLA picker does not show only real commercial resins');
  await overlay.locator('[data-material-choice="formlabs-tough2000-v2"]').click();
  const resin=await getValues();
  if(resin.material!=='formlabs-tough2000-v2'||resin.manufacturing!=='sla'||
     resin.youngMPa!==1800||resin.density!==1.09)
    throw Error('Formlabs Tough 2000 V2 selection failed');
  const resinSW=await page.evaluate(()=>buildSolidWorksVariables());
  if(!resinSW.includes('"MaterialPresetCode" = 53')||
     !resinSW.includes('"MaterialYoungModulus_MPa" = 1800'))
    throw Error('Real SLA resin property export failed');

  await pickerTrigger.click();
  await page.keyboard.press('Escape');
  if(await overlay.isVisible())throw Error('Escape did not close material overlay');
  await pickerTrigger.click();
  await page.locator('.materialPickerBackdrop').click({position:{x:10,y:10}});
  if(await overlay.isVisible())throw Error('Outside click did not dismiss picker');

  await pickerTrigger.click();
  await overlay.locator('[data-manufacturing="fdm"]').click();
  await overlay.locator('[data-material-choice="petg"]').click();
  const petg=await getValues();
  if(petg.material!=='petg'||petg.manufacturing!=='fdm'||petg.youngMPa!==1900||
     petg.density!==1.27||petg.stressLimit!==10||petg.stiffFactor!==0.65)
    throw Error('Restoring PETG did not restore original FDM defaults');
  if(!(await page.locator('#materialPresetNote').isVisible()))
    throw Error('Material warning should remain visible outside tooltips');
  // Older saved MJF, sheet and discontinued FDM choices are not discarded:
  // load as Custom and retain each field's numerical properties.
  const previousMaterialAudit=await page.evaluate(()=>{
    const before={...state};
    state.manufacturing='mjf';
    state.material='pa12-mjf';
    state.youngMPa=4242;
    normalizeMaterialSelection();
    const result={material:state.material,process:state.manufacturing,E:state.youngMPa};
    Object.assign(state,before);
    return result;
  });
  if(previousMaterialAudit.material!=='custom' ||
     previousMaterialAudit.process!=='sls' || previousMaterialAudit.E!==4242)
    throw Error('Legacy process/material migration lost numerical properties');
  const retiredResinAudit=await page.evaluate(()=>{
    const snapshot={...state};
    state.manufacturing='sla';
    state.material='resin-tough';
    state.youngMPa=3141;
    normalizeMaterialSelection();
    const outcome={material:state.material,process:state.manufacturing,E:state.youngMPa};
    Object.assign(state,snapshot);
    return outcome;
  });
  if(retiredResinAudit.material!=='custom'||retiredResinAudit.process!=='sla'||
     retiredResinAudit.E!==3141)
    throw Error('Legacy generic SLA material lost its manual properties');
  await page.locator('#sectionsGroup').evaluate(el=>el.open=true);
  if(!(await page.locator('#l1W').isVisible()))throw Error('Cross section fields missing');
  await auditActiveFieldRows();
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

  // Every Transmission field needs its own full-width row, even the formerly
  // half-width standalone friction field.
  const transmissionWidths=await page.locator('#transmissionGroup .fieldrow').evaluateAll(rows=>
    rows.flatMap(row => {
      const box=row.getBoundingClientRect();
      return [...row.children].filter(n=>n.classList.contains('field'))
        .map(field=>({key:field.querySelector('input')?.id,
          w:field.getBoundingClientRect().width, rowWidth:box.width}));
    })
  );
  if(transmissionWidths.length!==3||transmissionWidths.some(f=>f.w<f.rowWidth*.90))
    throw Error('Transmission inputs are not full width: '+JSON.stringify(transmissionWidths));

  // Audit rendered two-column labels after each category switch. Any field
  // that wraps due to sharing the row should be promoted to full width.
  async function auditActiveFieldRows(){
    await page.waitForTimeout(50);
    const invalid=await page.locator('.config > .section.is-active .fieldrow').evaluateAll(rows=>{
      const problems=[];
      for(const row of rows){
        if(row.getBoundingClientRect().width<2)continue;
        const fields=[...row.children].filter(el=>el.classList.contains('field'));
        if(fields.length===0)continue;
        const available=row.getBoundingClientRect().width;
        if(fields.length===1&&fields[0].getBoundingClientRect().width<available*.88)
          problems.push('Lone field half width: '+fields[0].querySelector('input,select')?.id);
        for(const field of fields){
          const label=field.querySelector(':scope > label');
          if(!label)continue;
          const range=document.createRange();
          range.selectNodeContents(label);
          const rects=[...range.getClientRects()].filter(rc=>rc.width>1&&rc.height>1);
          const wrapped=rects.length>1&&rects.some(rc=>Math.abs(rc.top-rects[0].top)>3);
          if(wrapped&&fields.length>1&&!row.classList.contains('wrappedLabelRow')&&
             !row.closest('.fullWidthInputs'))
            problems.push('Wrapped label sharing a row: '+label.innerText);
          if(row.classList.contains('wrappedLabelRow')&&field.getBoundingClientRect().width<available*.88)
            problems.push('Expanded field not full width: '+label.innerText);
        }
      }
      return problems;
    });
    if(invalid.length)throw Error('Input width audit: '+invalid.join('; '));
  }
  await auditActiveFieldRows();

  // Explicit min/max, per-value reset, and reset-all must all work in the rail.
  const stops=page.locator('#jointLimitsGroup');
  if(!(await stops.isVisible()))throw Error('Joint hard stops are hidden');
  if(await stops.locator('[data-joint-stop]').count()!==4 ||
     await stops.locator('[data-reset-stop]').count()!==4)
    throw Error('Expected four Set and four Reset buttons');
  for(const field of await stops.locator('.jointStopField').all()){
    const input=await field.locator('input').boundingBox();
    const actions=await field.locator('.jointStopActions').boundingBox();
    if(!input||!actions||actions.y<input.y+input.height-1)
      throw Error('Hard-stop buttons must sit below their angle inputs');
    if(actions.width<input.width*.8)
      throw Error('Hard-stop action buttons are too cramped');
  }
  for(const body of await page.locator('.mechanicsGroup[open] > .mechanicsGroupBody').all()){
    const m=await body.evaluate(el=>({
      overflow:getComputedStyle(el).overflowY,
      scroll:el.scrollHeight,
      height:el.clientHeight
    }));
    if(m.overflow==='auto'||m.overflow==='scroll'||m.scroll>m.height+2)
      throw Error('Expanded card has its own scrollbar: '+JSON.stringify(m));
  }
  await stops.locator('[data-joint-stop="leftMinAngle"]').click();
  if(!(await page.locator('#useJointLimits').isChecked()))throw Error('Set did not enable mechanical limits');
  if(await page.locator('#scene [data-joint-stop-boundary="left-min"]').count()!==1)
    throw Error('Canvas MIN stop marker missing');
  if(await page.locator('#scene [data-joint-stop-boundary="left-max"]').count()!==1)
    throw Error('Canvas MAX stop marker missing');
  // Stop markers are hardware geometry, independent of display's servo arcs.
  await page.locator('.topSettingsTabs [data-setting="display"]').click();
  await page.locator('#showServoArcs').uncheck();
  if(await page.locator('#scene [data-joint-stop-boundary="left-min"]').count()!==1)
    throw Error('Physical stop markers incorrectly depend on servo arcs');
  await page.locator('.topSettingsTabs [data-setting="motors"]').click();
  const minValue=Number(await page.locator('#leftMinAngle').inputValue());
  if(!(minValue>0 && minValue<=360))throw Error('Set did not capture left joint angle');
  if(!(await page.locator('#currentLeftJointAngle').innerText()).includes('°'))throw Error('Live joint angle missing');
  await stops.locator('[data-reset-stop="leftMinAngle"]').click();
  if(await page.locator('#leftMinAngle').inputValue()!=='0')throw Error('Reset MIN failed');
  await stops.locator('[data-joint-stop="rightMaxAngle"]').click();
  await page.locator('#resetJointLimits').click();
  // The gripper must be clamped to the first hard-stop boundary, not merely
  // turn red after an out-of-range pointer event. Disabled mode stays free.
  const dragAudit=await page.evaluate(()=>{
    const start=vec(state.targetX,state.targetY);
    const current=calc(start,{...state,useJointLimits:false});
    if(!current.valid)return {error:'Starting gripper pose invalid'};
    const limits={...state,useJointLimits:true,
      leftMinAngle:(current.angleL-15+360)%360,
      leftMaxAngle:(current.angleL+15)%360,
      rightMinAngle:(current.angleR-15+360)%360,
      rightMaxAngle:(current.angleR+15)%360};
    const probes=[vec(0,0),vec(255,0),vec(0,255),vec(255,255),
      vec(start.x,start.y-250),vec(start.x+300,start.y)];
    const requested=probes.find(p=>!calc(p,limits).valid);
    if(!requested)return {error:'No outside-hard-stop test position'};
    const bounded=constrainedTarget(start,requested,limits);
    const stillValid=calc(bounded,limits).valid;
    const travelled=dist(start,bounded),distance=dist(start,requested);
    return {stillValid,travelled,distance,
      disabledFree:constrainedTarget(start,requested,{...limits,useJointLimits:false})===requested};
  });
  if(dragAudit.error||!dragAudit.stillValid||
     !(dragAudit.travelled<dragAudit.distance)||!dragAudit.disabledFree)
    throw Error('Hard-stop drag clamping failed: '+JSON.stringify(dragAudit));
  if(await page.locator('#useJointLimits').isChecked())throw Error('Reset all did not disable limits');
  if(await page.locator('#rightMaxAngle').inputValue()!=='360')throw Error('Reset all did not restore max');

  await page.locator('.topSettingsTabs [data-setting="display"]').click();
  const label=page.locator('label.toggle').filter({has:page.locator('#showCoverage')});
  const color=await label.evaluate(e=>getComputedStyle(e).color);
  if(color==='rgb(194, 209, 221)')throw Error('Checkbox text still washed out');
  if(width<850){
    await page.locator('#closeSettings').click();
    await page.locator('#fileMenuButton').click();
    if(!(await page.locator('.fileHubSidebar #fileHubZip').isVisible()))
      throw Error('Sidebar downloads inaccessible on mobile');
    await page.locator('#fileHubClose').click();
  }
  if(width>=851){
    await page.locator('.resultTabs [data-insight="position"]').click();
    if(!(await page.locator('#outX').isVisible()))throw Error('Position panel invisible');
  }
  if(errors.length)throw Error('JavaScript console errors: '+errors.join('; ').slice(0,600));
  console.log('PASS '+width+'px with settings, linkage accordions, hard stops, SW export, compact rail and motion study');
  await page.close();
 }
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
