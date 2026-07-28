/**
 * EVE Suite — Extraction Ledger
 * 30-day mining history: stacked belt chart, ore mix bars, system/pilot manifests.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, esiGetPaged, getTok, resolveNames,
         nameOf, pLimit }                              from '@core/esi-client.js';
import { $, esc, fmtISK, fmtInt, fmtM3 }              from '@core/format.js';

const MY_SECTION = 'mining';
const ORE_COLORS = ['var(--gold)','var(--cyan)','var(--green)','var(--amber)','var(--violet)','var(--steel)','var(--red)','var(--muted)'];
let chars = loadChars();
let entries=[], charErrs={}, avgPrices={}, typeCache={};
let dayIndex=[], perDayOre={}, topOres=[];

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.className='';},3600);}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

const typeLimit = pLimit(6);
async function typeInfo(id){if(typeCache[id])return typeCache[id];const t=await typeLimit(()=>esiGet('/universe/types/'+id+'/'));typeCache[id]={name:t.name,volume:t.volume};return typeCache[id];}

async function loadAll(){
  if(noPilotsGuard('out'))return;
  const btn=$('loadBtn');btn.disabled=true;
  $('out').innerHTML='<div class="empty"><span class="spin"></span>Pulling mining ledgers…</div>';
  entries=[];charErrs={};
  for(const id of visibleIds(MY_SECTION)){
    try{const s=await getTok(id);if(!s)throw new Error('token expired — re-open the Toolset menu');
      const led=await esiGetPaged('/characters/'+id+'/mining/',s.access,15);
      led.forEach(e=>{entries.push({date:e.date,system:e.solar_system_id,type_id:e.type_id,qty:e.quantity,charId:id,charName:s.charName||('Char '+id)});});
    }catch(e){charErrs[id]=e.status===403?'mining-ledger scope missing — remove & re-add the character':e.message;}
  }
  if(!entries.length){
    $('out').innerHTML=Object.keys(charErrs).map(id=>`<div class="charerr">⚠ ${esc((chars[id]||{}).charName||('Char '+id))}: ${esc(charErrs[id])}</div>`).join('')+'<div class="empty">No mining recorded in the last ~30 days.</div>';
    reportDashboard(MY_SECTION,'nothing mined · 30d','muted');btn.disabled=false;return;
  }
  try{const pl=await esiGet('/markets/prices/');pl.forEach(p=>{avgPrices[p.type_id]=p.average_price;});}catch{}
  const typeIds=[...new Set(entries.map(e=>e.type_id))];
  await Promise.all(typeIds.map(t=>typeInfo(t).catch(()=>null)));
  try{await resolveNames(entries.map(e=>e.system));}catch{}
  entries.forEach(e=>{const ti=typeCache[e.type_id]||{};e.m3=(ti.volume||0)*e.qty;e.isk=(avgPrices[e.type_id]||0)*e.qty;});
  crunch();render();btn.disabled=false;
  if(Object.keys(charErrs).length)toast('Some pilots could not be read',true);
}

function crunch(){
  const days=new Set(entries.map(e=>e.date));const min=[...days].sort()[0];
  dayIndex=[];const d0=new Date(min+'T00:00:00Z');const today=new Date();
  for(let d=new Date(d0);d<=today;d.setUTCDate(d.getUTCDate()+1))dayIndex.push(d.toISOString().slice(0,10));
  perDayOre={};dayIndex.forEach(d=>perDayOre[d]={});
  const oreTot={};
  entries.forEach(e=>{if(!perDayOre[e.date])perDayOre[e.date]={};perDayOre[e.date][e.type_id]=(perDayOre[e.date][e.type_id]||0)+e.m3;oreTot[e.type_id]=oreTot[e.type_id]||{id:e.type_id,m3:0,isk:0,qty:0};oreTot[e.type_id].m3+=e.m3;oreTot[e.type_id].isk+=e.isk;oreTot[e.type_id].qty+=e.qty;});
  topOres=Object.values(oreTot).sort((a,b)=>b.m3-a.m3);
  topOres.forEach(o=>{o.name=(typeCache[o.id]||{}).name||('Type '+o.id);});
}

function render(){
  const totM3=entries.reduce((a,e)=>a+e.m3,0);
  const totISK=entries.reduce((a,e)=>a+e.isk,0);
  const activeDays=new Set(entries.map(e=>e.date)).size;
  const best=topOres[0];
  $('gauges').innerHTML=
    `<div class="gauge"><div class="l">Volume mined · window</div><div class="n">${fmtM3(totM3)}</div><div class="s">${fmtInt(entries.reduce((a,e)=>a+e.qty,0))} units</div></div>`+
    `<div class="gauge"><div class="l">Est. value</div><div class="n">${fmtISK(totISK)}</div><div class="s">at CCP average prices (estimate)</div></div>`+
    `<div class="gauge"><div class="l">Active days</div><div class="n">${activeDays}</div><div class="s">of ${dayIndex.length} in window</div></div>`+
    `<div class="gauge"><div class="l">Top ore</div><div class="n" style="font-size:19px;padding-top:5px">${esc(best?best.name:'—')}</div><div class="s">${best?fmtM3(best.m3):''}</div></div>`+
    `<div class="gauge"><div class="l">Systems worked</div><div class="n">${new Set(entries.map(e=>e.system)).size}</div><div class="s">across ${new Set(entries.map(e=>e.charId)).size} pilot(s)</div></div>`;
  const errHtml=Object.keys(charErrs).map(id=>`<div class="charerr">⚠ ${esc((chars[id]||{}).charName||('Char '+id))}: ${esc(charErrs[id])}</div>`).join('');
  const legendOres=topOres.slice(0,6);
  $('out').innerHTML=errHtml+
    `<div class="beltwrap panel"><div class="belt-hd" style="padding:11px 16px"><h2>Daily haul on the belt line</h2><div class="legend">${legendOres.map((o,i)=>`<span><span class="sw" style="background:${ORE_COLORS[i]}"></span>${esc(o.name)}</span>`).join('')}${topOres.length>6?`<span><span class="sw" style="background:${ORE_COLORS[7]}"></span>other</span>`:''}</div></div><div style="padding:6px 16px 16px;position:relative"><canvas id="beltChart"></canvas><div id="beltTip"></div></div></div>`+
    `<div class="mix panel"><div class="belt-hd" style="padding:11px 16px"><h2>Ore mix</h2><span class="hint" style="font-size:10px">share of total m³</span></div><div style="padding:6px 16px 16px" id="mixBars"></div></div>`+
    `<div class="manifests"><div class="mani panel"><div class="belt-hd" style="padding:11px 16px"><h2>By system</h2></div><div id="sysTable"></div></div><div class="mani panel"><div class="belt-hd" style="padding:11px 16px"><h2>By pilot</h2></div><div id="charTable"></div></div></div>`;
  const maxM3=topOres[0]?topOres[0].m3:1;
  $('mixBars').innerHTML=topOres.slice(0,12).map((o,i)=>{const pct=totM3?100*o.m3/totM3:0;return `<div class="orebar"><span class="on">${esc(o.name)}</span><span class="track"><span class="fill" style="width:${(100*o.m3/maxM3).toFixed(1)}%;background:${ORE_COLORS[Math.min(i,7)]}"></span></span><span class="ov">${fmtM3(o.m3)} · ${pct.toFixed(1)}% · ${fmtISK(o.isk)}</span></div>`;}).join('');
  const bySys={};entries.forEach(e=>{bySys[e.system]=bySys[e.system]||{m3:0,isk:0};bySys[e.system].m3+=e.m3;bySys[e.system].isk+=e.isk;});
  $('sysTable').innerHTML='<table><thead><tr><th>System</th><th class="num">m³</th><th class="num">Est. ISK</th></tr></thead><tbody>'+Object.entries(bySys).sort((a,b)=>b[1].m3-a[1].m3).map(([sid,v])=>`<tr><td>${esc(nameOf(+sid,'System '+sid))}</td><td class="num">${fmtM3(v.m3)}</td><td class="num">${fmtISK(v.isk)}</td></tr>`).join('')+'</tbody></table>';
  const byChar={};entries.forEach(e=>{byChar[e.charId]=byChar[e.charId]||{n:e.charName,m3:0,isk:0,days:new Set()};byChar[e.charId].m3+=e.m3;byChar[e.charId].isk+=e.isk;byChar[e.charId].days.add(e.date);});
  $('charTable').innerHTML='<table><thead><tr><th>Pilot</th><th class="num">m³</th><th class="num">Est. ISK</th><th class="num">Days</th></tr></thead><tbody>'+Object.values(byChar).sort((a,b)=>b.m3-a.m3).map(v=>`<tr><td>${esc(v.n)}</td><td class="num">${fmtM3(v.m3)}</td><td class="num">${fmtISK(v.isk)}</td><td class="num">${v.days.size}</td></tr>`).join('')+'</tbody></table>';
  drawBelt();
  reportDashboard(MY_SECTION, fmtM3(totM3)+' · 30d · ≈'+fmtISK(totISK), 'ok');
  $('loadNote').textContent='Ledger pulled '+new Date().toUTCString().slice(17,25)+' EVE · '+entries.length+' entries · ISK at CCP average prices';
}

function drawBelt(){
  const cv=$('beltChart');if(!cv)return;
  const wrap=cv.parentElement;const W=wrap.clientWidth;const H=230;const dpr=window.devicePixelRatio||1;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const ctx=cv.getContext('2d');if(!ctx)return;ctx.scale(dpr,dpr);
  const css=getComputedStyle(document.documentElement);
  const col=v=>{const m=String(v).match(/var\((--[^)]+)\)/);return m?css.getPropertyValue(m[1]).trim()||'#888':v;};
  const padL=52,padB=24,padT=8,plotW=W-padL-8,plotH=H-padT-padB;
  const legendIds=topOres.slice(0,6).map(o=>o.id);
  const dayTotals=dayIndex.map(d=>Object.values(perDayOre[d]||{}).reduce((a,b)=>a+b,0));
  const maxDay=Math.max(1,...dayTotals);
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle=col('var(--line)');ctx.fillStyle=col('var(--muted2)');ctx.font='9px monospace';ctx.lineWidth=1;
  for(let g=0;g<=4;g++){const y=padT+plotH-g*plotH/4;ctx.beginPath();ctx.moveTo(padL,y);ctx.lineTo(W-8,y);ctx.stroke();ctx.fillText(fmtM3(maxDay*g/4).replace(' m³',''),6,y+3);}
  const bw=Math.max(2,plotW/dayIndex.length-3);cv._bars=[];
  dayIndex.forEach((d,i)=>{
    const x=padL+i*plotW/dayIndex.length+1;let y=padT+plotH;const ores=perDayOre[d]||{};
    legendIds.forEach((tid,li)=>{const m3=ores[tid]||0;if(!m3)return;const h=m3/maxDay*plotH;y-=h;ctx.fillStyle=col(ORE_COLORS[li]);ctx.globalAlpha=.8;ctx.fillRect(x,y,bw,h);ctx.globalAlpha=1;});
    const other=Object.entries(ores).filter(([tid])=>!legendIds.includes(+tid)).reduce((a,[,v])=>a+v,0);
    if(other){const h=other/maxDay*plotH;y-=h;ctx.fillStyle=col(ORE_COLORS[7]);ctx.fillRect(x,y,bw,h);}
    cv._bars.push({x,w:bw,d,tot:dayTotals[i]});
    if(i%Math.ceil(dayIndex.length/9)===0){ctx.fillStyle=col('var(--muted2)');ctx.fillText(d.slice(5),x-4,H-8);}
  });
  cv.onmousemove=ev=>{const r=cv.getBoundingClientRect();const mx=ev.clientX-r.left;const hit=(cv._bars||[]).find(b=>mx>=b.x&&mx<=b.x+b.w+3);const tip=$('beltTip');if(!tip)return;if(hit&&hit.tot>0){tip.style.display='block';tip.style.left=Math.min(mx+14,W-160)+'px';tip.style.top='18px';tip.textContent=hit.d+' — '+fmtM3(hit.tot);}else tip.style.display='none';};
  cv.onmouseleave=()=>{const tip=$('beltTip');if(tip)tip.style.display='none';};
}

window.addEventListener('resize',()=>{if(entries.length)drawBelt();});
$('loadBtn').onclick=loadAll;
window.onRosterChange=()=>{if(entries.length)loadAll();};
renderPilots();
