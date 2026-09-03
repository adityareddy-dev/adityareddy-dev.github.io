import { chromium } from '@playwright/test';
const wd=setTimeout(()=>process.exit(2),60000);
const b=await chromium.launch({headless:true,channel:'chromium'});
const p=await (await b.newContext({javaScriptEnabled:false,viewport:{width:1280,height:900}})).newPage();
await p.goto('http://localhost:8090/index-v3.html'); await p.waitForTimeout(1500);
const t=await p.evaluate(()=>document.body.innerText);
const need=['Aditya Reddy','Averages hide','300','Northwestern Mutual','Say hello'];
console.log('no-JS text len:',t.length, need.map(x=>x+':'+t.includes(x)).join(' | '));
await b.close();clearTimeout(wd);process.exit(0);
