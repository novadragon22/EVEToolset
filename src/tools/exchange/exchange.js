/**
 * EVE Suite — The Exchange
 * Five-hub board, price history chart, Janice appraisal, live orders.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, esiGetPaged, esiPost, getTok,
         resolveNames, nameOf }                        from '@core/esi-client.js';
import { $, esc, fmtISK, fmtInt }                     from '@core/format.js';

const MY_SECTION = 'exchange';
const HUBS = [
  {name:'Jita 4-4',   region:10000002, station:60003760},
  {name:'Amarr VIII', region:10000043, station:60008494},
  {name:'Dodixie IX', region:10000032, station:60011866},
  {name:'Rens VI',    region:10000030, station:60004588},
  {name:'Hek VIII',   region:10000042, station:60005686},
];
let chars = loadChars();
let curType = null, hist = null;

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.className='';},3600);}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

async function idForName(name){const r=await esiPost('/universe/ids/',[name]);const t=(r.inventory_types||[])[0];return t?t.id:null;}

async function quote(){
  const q=$('itemIn').value.trim(); if(!q)return;
  $('hubs').innerHTML='<div class="empty" style="padding:24px"><span class="spin"></span>quoting…</div>';
  try{
    const tid=await idForName(q);
    if(!tid){$('hubs').innerHTML='<div class="empty" style="padding:24px">no item with that exact name — ESI needs the precise in-game spelling</div>';return;}
    curType=tid;$('chartTitle').textContent='Price history — '+q;
    const rows=[];
    for(const h of HUBS){try{const ords=await esiGetPaged('/markets/'+h.region+'/orders/?type_id='+tid,null,4);const atHub=ords.filter(o=>o.location_id===h.station);const sells=atHub.filter(o=>!o.is_buy_order).map(o=>o.price);const buys=atHub.filter(o=>o.is_buy_order).map(o=>o.price);rows.push({h,sell:sells.length?Math.min(...sells):null,buy:buys.length?Math.max(...buys):null});}catch(e){rows.push({h,err:true});}}
    $('hubs').innerHTML=rows.map(r=>`<div class="hub"><span class="hn">${esc(r.h.name)}</span><span class="hp">${r.err?'<span class="sell">—</span>':`<span class="sell">${r.sell!=null?fmtISK(r.sell):'no sells'}</span><span class="buy">buy ${r.buy!=null?fmtISK(r.buy):'—'}</span>`}</span></div>`).join('');
    try{hist=await esiGet('/markets/'+HUBS[0].region+'/history/?type_id='+tid);}catch{hist=null;}
    $('chartHint').textContent=hist?'The Forge · '+hist.length+' days':'history unavailable';
    drawHist();reportDashboard(MY_SECTION,'quoted '+q,'ok');
  }catch(e){$('hubs').innerHTML=`<div class="empty" style="padding:24px">quote failed: ${esc(e.message)}</div>`;}
}

function drawHist(){
  const cv=$('histChart');if(!cv)return;
  const W=cv.parentElement.clientWidth,H=280,dpr=window.devicePixelRatio||1;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const ctx=cv.getContext('2d');if(!ctx)return;ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  if(!hist||!hist.length)return;
  const css=getComputedStyle(document.documentElement);const c=v=>css.getPropertyValue(v).trim()||'#888';
  const data=hist.slice(-365);const padL=64,padB=22,padT=10;const plotW=W-padL-10,plotH=H-padT-padB;
  const lo=Math.min(...data.map(d=>d.lowest)),hi=Math.max(...data.map(d=>d.highest));
  const y=v=>padT+plotH-(v-lo)/(hi-lo||1)*plotH;const x=i=>padL+i*plotW/(data.length-1||1);
  ctx.strokeStyle=c('--line');ctx.fillStyle=c('--muted2');ctx.font='9px monospace';
  for(let g=0;g<=4;g++){const gy=padT+plotH-g*plotH/4;ctx.beginPath();ctx.moveTo(padL,gy);ctx.lineTo(W-10,gy);ctx.stroke();ctx.fillText(fmtISK(lo+(hi-lo)*g/4),6,gy+3);}
  ctx.beginPath();data.forEach((d,i)=>{const px=x(i);i?ctx.lineTo(px,y(d.highest)):ctx.moveTo(px,y(d.highest));});
  for(let i=data.length-1;i>=0;i--)ctx.lineTo(x(i),y(data[i].lowest));
  ctx.closePath();ctx.globalAlpha=.14;ctx.fillStyle=c('--cyan');ctx.fill();ctx.globalAlpha=1;
  ctx.beginPath();ctx.strokeStyle=c('--gold');ctx.lineWidth=1.6;data.forEach((d,i)=>{const px=x(i);i?ctx.lineTo(px,y(d.average)):ctx.moveTo(px,y(d.average));});ctx.stroke();
  ctx.fillStyle=c('--muted2');for(let i=0;i<data.length;i+=Math.ceil(data.length/8))ctx.fillText(data[i].date.slice(2,7),x(i)-12,H-6);
  cv.onmousemove=ev=>{const r=cv.getBoundingClientRect();const mx=ev.clientX-r.left;const i=Math.round((mx-padL)/(plotW/(data.length-1||1)));const tip=$('histTip');if(!tip)return;if(i>=0&&i<data.length){const d=data[i];tip.style.display='block';tip.style.left=Math.min(mx+12,W-190)+'px';tip.style.top='14px';tip.textContent=d.date+' · avg '+fmtISK(d.average)+' · vol '+fmtInt(d.volume);}else tip.style.display='none';};
  cv.onmouseleave=()=>{const t=$('histTip');if(t)t.style.display='none';};
}

// ── Janice appraisal ──────────────────────────────────────────────────────────

const JANICE_API = 'https://janice.e-351.com/api/rest/v1';
const JANICE_MARKETS = {jita:2,'r1o-gn':3,perimeter:4,jitameter:5,npc:6,'t5zi-s':113};
const JANICE_KEY_STORE = 'eve_suite_janice_key';
const JANICE_SEED_KEY  = 'G9KwKq3465588VPd6747t95Zh94q3W2E';
const JANICE_CACHE_STORE = 'eve_suite_janice_cache_v1';
const JANICE_CACHE_TTL = 21_600_000;
try{if(!localStorage.getItem(JANICE_KEY_STORE))localStorage.setItem(JANICE_KEY_STORE,JANICE_SEED_KEY);}catch{}
function janHash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return(h>>>0).toString(36);}
function janiceKey(){try{return localStorage.getItem(JANICE_KEY_STORE)||JANICE_SEED_KEY;}catch{return JANICE_SEED_KEY;}}
function janCacheLoad(){try{return JSON.parse(localStorage.getItem(JANICE_CACHE_STORE)||'{}');}catch{return{};}}
function janCacheSave(c){try{const ks=Object.keys(c);if(ks.length>40)ks.sort((a,b)=>c[a].ts-c[b].ts).slice(0,ks.length-30).forEach(k=>delete c[k]);localStorage.setItem(JANICE_CACHE_STORE,JSON.stringify(c));}catch{}}
async function janicePricer(names,marketName){
  const market=JANICE_MARKETS[marketName]||JANICE_MARKETS.jita;
  const payload=names.join('\n');const now=Date.now();
  const ck=market+'|'+janHash(payload)+'|'+janHash(janiceKey());
  const cache=janCacheLoad();const hit=cache[ck];
  if(hit&&(now-hit.ts)<JANICE_CACHE_TTL)return hit.data;
  let r;try{r=await fetch(JANICE_API+'/pricer?key='+encodeURIComponent(janiceKey())+'&market='+market,{method:'POST',headers:{'Content-Type':'text/plain'},body:payload});}catch(e){throw new Error('network/CORS blocked — Janice may not allow direct browser calls');}
  if(!r.ok){let d='';try{d=' '+(await r.text()).slice(0,120);}catch{}throw new Error('Janice HTTP '+r.status+d);}
  const data=await r.json();cache[ck]={ts:now,data};janCacheSave(cache);return data;
}
function janiceIndex(data){const ix={};(Array.isArray(data)?data:[]).forEach(row=>{const t=row&&row.itemType;if(!t)return;if(t.name)ix[String(t.name).toLowerCase()]=row;if(t.eid!=null)ix[String(t.eid)]=row;});return ix;}

async function appraiseJanice(items){
  const marketName=$('janMarket').value;
  const names=[...new Set(items.map(i=>i.name))];
  const data=await janicePricer(names,marketName);const ix=janiceIndex(data);
  let buyTot=0,sellTot=0,unk=0;
  const rows=items.map(it=>{const row=ix[it.name.toLowerCase()]||ix[String(it.name)];if(!row){unk++;return `<tr><td>${esc(it.name)}</td><td class="num">${fmtInt(it.qty)}</td><td class="num" colspan="4">not recognised</td></tr>`;}const buy=row.buyPriceMax,sell=row.sellPriceMin;const bl=(buy||0)*it.qty,sl=(sell||0)*it.qty;buyTot+=bl;sellTot+=sl;return `<tr><td>${esc(it.name)}</td><td class="num">${fmtInt(it.qty)}</td><td class="num">${fmtISK(buy)}</td><td class="num">${fmtISK(sell)}</td><td class="num">${fmtISK(bl)}</td><td class="num">${fmtISK(sl)}</td></tr>`;}).join('');
  $('apprOut').innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Buy/u</th><th class="num">Sell/u</th><th class="num">Buy total</th><th class="num">Sell total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('apprTot').textContent='buy '+fmtISK(buyTot)+' · sell '+fmtISK(sellTot)+' · Janice '+marketName+(unk?' · '+unk+' unrecognised':'');
  reportDashboard(MY_SECTION,'appraised via Janice ('+marketName+')','ok');
}

async function appraise(){
  const lines=$('pasteIn').value.split('\n').map(l=>l.trim()).filter(Boolean);if(!lines.length)return;
  $('apprOut').innerHTML='<div class="empty" style="padding:24px"><span class="spin"></span>appraising…</div>';
  const items=lines.map(l=>{const m=l.match(/^(.*?)[\s\t]+([\d.,]+)\s*$/);return m?{name:m[1].replace(/\*$/,'').trim(),qty:parseFloat(m[2].replace(/,/g,''))||1}:{name:l,qty:1};});
  try{await appraiseJanice(items);return;}catch(e){toast('Janice failed — falling back to CCP avg ('+e.message+')',true);}
  try{
    const names=[...new Set(items.map(i=>i.name))];const resolved={};
    for(let i=0;i<names.length;i+=450){const r=await esiPost('/universe/ids/',names.slice(i,i+450));(r.inventory_types||[]).forEach(t=>{resolved[t.name.toLowerCase()]=t.id;});}
    let prices={};try{const pl=await esiGet('/markets/prices/');pl.forEach(p=>{prices[p.type_id]=p.average_price;});}catch{}
    let tot=0,unk=0;
    const rows=items.map(it=>{const tid=resolved[it.name.toLowerCase()];if(!tid){unk++;return `<tr><td>${esc(it.name)}</td><td class="num">${fmtInt(it.qty)}</td><td class="num" colspan="2">not recognised</td></tr>`;}const unit=prices[tid]||0;const line=unit*it.qty;tot+=line;return `<tr><td>${esc(it.name)}</td><td class="num">${fmtInt(it.qty)}</td><td class="num">${fmtISK(unit)}</td><td class="num">${fmtISK(line)}</td></tr>`;}).join('');
    $('apprOut').innerHTML=`<div style="overflow-x:auto"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">CCP avg</th><th class="num">Est. total</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    $('apprTot').textContent='≈ '+fmtISK(tot)+' (CCP avg, estimate)'+(unk?' · '+unk+' unrecognised':'');
  }catch(e){$('apprOut').innerHTML=`<div class="empty" style="padding:24px">appraisal failed: ${esc(e.message)}</div>`;}
}

async function loadOrders(){
  if(noPilotsGuard('ordersOut'))return;
  $('ordersOut').innerHTML='<div class="empty" style="padding:24px"><span class="spin"></span>reading orders…</div>';
  const all=[];const errs=[];
  for(const id of visibleIds(MY_SECTION)){
    try{const s=await getTok(id);if(!s)throw new Error('token expired');const o=await esiGet('/characters/'+id+'/orders/',s.access);o.forEach(x=>all.push({...x,_c:s.charName||('Char '+id)}));}
    catch(e){errs.push(((chars[id]||{}).charName||id)+': '+(e.status===403?'orders scope missing — re-add in the Toolset menu':e.message));}
  }
  try{await resolveNames(all.map(o=>o.type_id));}catch{}
  const errHtml=errs.map(e=>`<div class="charerr">⚠ ${esc(e)}</div>`).join('');
  if(!all.length){$('ordersOut').innerHTML=errHtml+'<div class="empty" style="padding:24px">no live orders on the roster</div>';return;}
  all.sort((a,b)=>Date.parse(b.issued)-Date.parse(a.issued));
  $('ordersOut').innerHTML=errHtml+`<div style="overflow-x:auto"><table><thead><tr><th>Pilot</th><th>Item</th><th>Side</th><th class="num">Price</th><th class="num">Left</th></tr></thead><tbody>${all.map(o=>`<tr><td>${esc(o._c)}</td><td>${esc(nameOf(o.type_id,'…'))}</td><td class="${o.is_buy_order?'buy':'sell'}">${o.is_buy_order?'buy':'sell'}</td><td class="num">${fmtISK(o.price)}</td><td class="num">${fmtInt(o.volume_remain)}/${fmtInt(o.volume_total)}</td></tr>`).join('')}</tbody></table></div>`;
}

$('quoteBtn').onclick=quote;
$('itemIn').addEventListener('keydown',e=>{if(e.key==='Enter')quote();});
$('appraiseBtn').onclick=appraise;
$('ordersBtn').onclick=loadOrders;
window.addEventListener('resize',()=>{if(hist)drawHist();});

// Janice market persistence
try{$('janMarket').value=localStorage.getItem('eve_suite_janice_market')||'jita';}catch{}
$('janMarket').onchange=()=>{try{localStorage.setItem('eve_suite_janice_market',$('janMarket').value);}catch{}};

renderPilots();
