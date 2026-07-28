/**
 * EVE Suite — The Treasury
 * Vault dial, income/spending ledgers, daily net-flow chart, latest trades.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, esiGetPaged, getTok, resolveNames,
         nameOf }                                      from '@core/esi-client.js';
import { $, esc, fmtISK, fmtInt }                     from '@core/format.js';

const MY_SECTION = 'treasury';
const DAY = 86_400_000, WINDOW_D = 30;
let chars = loadChars();
let ledger = null;

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

function refLabel(rt){return(rt||'other').replace(/_/g,' ');}

async function loadAll(){
  if(noPilotsGuard('out'))return;
  const btn=$('loadBtn');btn.disabled=true;
  $('out').innerHTML='<div class="empty"><span class="spin"></span>Opening the vault…</div>';
  const cutoff=Date.now()-WINDOW_D*DAY;
  const L={bal:{},journal:[],tx:[],errs:{}};
  for(const id of visibleIds(MY_SECTION)){
    try{const s=await getTok(id);if(!s)throw new Error('token expired — re-open the Toolset menu');
      const T=s.access;const nm=s.charName||('Char '+id);
      L.bal[id]={n:nm,v:await esiGet('/characters/'+id+'/wallet/',T)};
      try{const j=await esiGetPaged('/characters/'+id+'/wallet/journal/',T,5);j.filter(e=>Date.parse(e.date)>cutoff).forEach(e=>L.journal.push({...e,_c:nm}));}catch{}
      try{const t=await esiGet('/characters/'+id+'/wallet/transactions/',T);t.slice(0,40).forEach(e=>L.tx.push({...e,_c:nm}));}catch{}
    }catch(e){L.errs[id]=e.status===403?'wallet scope missing — re-add the character':e.message;}
  }
  L.tx.sort((a,b)=>Date.parse(b.date)-Date.parse(a.date));L.tx=L.tx.slice(0,45);
  try{await resolveNames(L.tx.flatMap(t=>[t.type_id,t.client_id]));}catch{}
  ledger=L;render();btn.disabled=false;
}

function render(){
  const L=ledger;
  const tot=Object.values(L.bal).reduce((a,b)=>a+(b.v||0),0);
  const inc={},spd={};
  L.journal.forEach(e=>{const amt=e.amount||0;if(amt>0)inc[e.ref_type]=(inc[e.ref_type]||0)+amt;else if(amt<0)spd[e.ref_type]=(spd[e.ref_type]||0)-amt;});
  const incRows=Object.entries(inc).sort((a,b)=>b[1]-a[1]).slice(0,9);
  const spdRows=Object.entries(spd).sort((a,b)=>b[1]-a[1]).slice(0,9);
  const incTot=incRows.length?incRows[0][1]:1,spdTot=spdRows.length?spdRows[0][1]:1;
  const errHtml=Object.keys(L.errs).map(id=>`<div class="charerr">⚠ ${esc((chars[id]||{}).charName||('Char '+id))}: ${esc(L.errs[id])}</div>`).join('');
  const col=(title,rows,max,cls)=>`<div class="ledgercol panel"><h2 class="panel-hd-line">${title}</h2><div class="rows">${rows.length?rows.map(([rt,v])=>`<div class="lrow"><span class="cn">${esc(refLabel(rt))}</span><span class="track"><span class="fill ${cls}" style="width:${(100*v/max).toFixed(1)}%"></span></span><span class="cv">${fmtISK(v)}</span></div>`).join(''):'<div class="empty" style="padding:18px">nothing in the window</div>'}</div></div>`;
  $('out').innerHTML=errHtml+
    `<div class="vault">${col('Income · 30d',incRows,incTot,'in')}<div class="dial panel"><div class="ring"><span class="tot">${fmtISK(tot)}</span><span class="tl">COMBINED BALANCE</span></div><div class="perchar">${Object.values(L.bal).map(b=>`<div class="pc-row"><span>${esc(b.n)}</span><b>${fmtISK(b.v)}</b></div>`).join('')}</div></div>${col('Spending · 30d',spdRows,spdTot,'out')}</div>`+
    `<div class="band panel"><h2 class="panel-hd-line">Daily net flow · 30d</h2><div style="padding:4px 14px 14px"><canvas id="flowBand"></canvas></div></div>`+
    `<div class="trades panel"><h2 class="panel-hd-line">Latest trades</h2><div style="overflow-x:auto"><table><thead><tr><th>When</th><th>Pilot</th><th>Item</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Total</th><th>Side</th></tr></thead><tbody>${L.tx.map(t=>`<tr><td>${t.date.slice(5,16).replace('T',' ')}</td><td>${esc(t._c)}</td><td>${esc(nameOf(t.type_id,'…'))}</td><td class="num">${fmtInt(t.quantity)}</td><td class="num">${fmtISK(t.unit_price)}</td><td class="num">${fmtISK(t.unit_price*t.quantity)}</td><td class="${t.is_buy?'buy':'sell'}">${t.is_buy?'buy':'sell'}</td></tr>`).join('')}</tbody></table></div></div>`;
  drawBand();
  const inc30=Object.values(inc).reduce((a,b)=>a+b,0),spd30=Object.values(spd).reduce((a,b)=>a+b,0);
  reportDashboard(MY_SECTION, fmtISK(tot)+' · net '+fmtISK(inc30-spd30)+'/30d', inc30>=spd30?'ok':'bad');
  $('loadNote').textContent='Vault read '+new Date().toUTCString().slice(17,25)+' EVE · '+L.journal.length+' journal entries in window';
}

function drawBand(){
  const cv=$('flowBand');if(!cv||!ledger)return;
  const W=cv.parentElement.clientWidth,H=120,dpr=window.devicePixelRatio||1;
  cv.width=W*dpr;cv.height=H*dpr;cv.style.width=W+'px';cv.style.height=H+'px';
  const ctx=cv.getContext('2d');if(!ctx)return;ctx.scale(dpr,dpr);
  const css=getComputedStyle(document.documentElement);
  const c=v=>css.getPropertyValue(v).trim()||'#888';
  const days={};
  for(let i=WINDOW_D-1;i>=0;i--)days[new Date(Date.now()-i*DAY).toISOString().slice(0,10)]=0;
  ledger.journal.forEach(e=>{const d=e.date.slice(0,10);if(d in days)days[d]+=(e.amount||0);});
  const keys=Object.keys(days),vals=keys.map(k=>days[k]);
  const mx=Math.max(1,...vals.map(Math.abs));
  const mid=H/2,bw=Math.max(3,W/keys.length-4);
  ctx.clearRect(0,0,W,H);ctx.strokeStyle=c('--line');ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(W,mid);ctx.stroke();
  keys.forEach((k,i)=>{const v=days[k];const h=Math.abs(v)/mx*(H/2-8);const x=i*W/keys.length+2;ctx.fillStyle=v>=0?c('--green'):c('--red');ctx.globalAlpha=.8;ctx.fillRect(x,v>=0?mid-h:mid,bw,Math.max(1,h));ctx.globalAlpha=1;});
}

window.addEventListener('resize',()=>{if(ledger)drawBand();});
$('loadBtn').onclick=loadAll;
window.onRosterChange=()=>{if(ledger)loadAll();};
renderPilots();
