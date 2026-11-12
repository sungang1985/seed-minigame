const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
// 仅重新生成素材时需要 Playwright；现成 PNG 已随项目提供。
(async()=>{
 const browser = await chromium.launch({...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),headless:true,args:['--no-sandbox']});
 const page = await browser.newPage({viewport:{width:1024,height:1024},deviceScaleFactor:1});
 await page.setContent('<html><body style="margin:0"><canvas id="art"></canvas></body></html>');
 for(const [kind,width,height] of [['icon',1024,1024],['share',1000,800]]){
  const data=await page.evaluate(({kind,width,height})=>{
   const canvas=document.querySelector('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
   const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#152f45');gradient.addColorStop(1,'#081321');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
   const cx=width/2,cy=kind==='icon'?height/2:height*0.41,r=kind==='icon'?300:210;
   const glow=ctx.createRadialGradient(cx,cy,5,cx,cy,r*1.65);glow.addColorStop(0,'rgba(121,233,194,.2)');glow.addColorStop(1,'rgba(121,233,194,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
   for(let i=0;i<70;i++){const x=(i*137+41)%width,y=(i*211+71)%height;ctx.fillStyle='rgba(166,207,229,'+(i%3===0?.35:.16)+')';ctx.beginPath();ctx.arc(x,y,i%4===0?2:1,0,Math.PI*2);ctx.fill();}
   ctx.strokeStyle='rgba(121,233,194,.18)';ctx.lineWidth=2;for(const ratio of [1,1.3]){ctx.beginPath();ctx.arc(cx,cy,r*ratio,0,Math.PI*2);ctx.stroke();}
   function star(x,y,r,color,rotation=0){ctx.save();ctx.translate(x,y);ctx.rotate(rotation);ctx.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,l=i%2===0?r:r*.46;if(!i)ctx.moveTo(Math.cos(a)*l,Math.sin(a)*l);else ctx.lineTo(Math.cos(a)*l,Math.sin(a)*l);}ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.restore();}
   star(cx,cy,r*.7,'#ffdb88',-.12);star(cx-r*1.04,cy-r*.54,r*.17,'#79e9c2',.16);star(cx+r*1.03,cy+r*.65,r*.22,'#79e9c2',-.2);
   if(kind==='share'){ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#f1f7fb';ctx.font='bold 64px sans-serif';ctx.fillText('星星收集',cx,height*.79);ctx.fillStyle='#91a6bb';ctx.font='28px sans-serif';ctx.fillText('30 秒，把星光收入囊中',cx,height*.89);}
   return canvas.toDataURL('image/png').split(',')[1];
  },{kind,width,height});
  fs.writeFileSync(path.join(__dirname, '../minigame/assets', kind+'.png'),Buffer.from(data,'base64'));
 }
 await browser.close();
 console.log('生成 icon.png (1024×1024) 和 share.png (1000×800)');
})().catch(error=>{console.error(error);process.exit(1);});
