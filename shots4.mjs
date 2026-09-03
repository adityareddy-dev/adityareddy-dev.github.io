import { chromium } from '@playwright/test';
const wd=setTimeout(()=>process.exit(2),150000);
const b=await chromium.launch({headless:true,channel:'chromium'});
const p=await (await b.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2})).newPage();
await p.goto('http://localhost:8090/index-v3.html');
await p.waitForTimeout(4000);
// name->code gap check: capture shortly after the name beat ends
for(const [f,n] of [[0.12,'gap'],[0.44,'tail'],[0.93,'pct']]){
  await p.evaluate((f)=>{const fl=document.getElementById('film');
    window.scrollTo(0,f*(fl.offsetHeight-innerHeight));},f);
  await p.waitForTimeout(2100);
  await p.screenshot({path:`/tmp/s4-${n}.png`});
}
for(const [sel,n] of [['#about','about'],['#career','career'],['#contact','contact']]){
  await p.evaluate((sel)=>document.querySelector(sel).scrollIntoView({block:'start'}),sel);
  await p.waitForTimeout(1400);
  await p.screenshot({path:`/tmp/s4-${n}.png`});
}
await b.close();clearTimeout(wd);process.exit(0);
