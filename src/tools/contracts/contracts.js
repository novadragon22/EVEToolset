/**
 * EVE Suite — Contract Docket
 * All personal contracts across the roster: status filters, KV cards, ledger table.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGetPaged, getTok, resolveNames, nameOf,
         structureName }                               from '@core/esi-client.js';
import { $, esc, fmtISK, fmtDur, fmtInt }             from '@core/format.js';

const MY_SECTION = 'contracts';
let chars = loadChars();
let rows = [], charErrs = {};
let filtStatus = 'all', filtType = 'all';

const STATUS_GROUPS = [
  {key:'all',        label:'All'},
  {key:'outstanding',label:'Outstanding',      match:s=>s==='outstanding'},
  {key:'in_progress',label:'In progress',      match:s=>s==='in_progress'},
  {key:'finished',   label:'Finished',         match:s=>/^finished/.test(s)},
  {key:'failed',     label:'Failed / rejected', match:s=>['failed','rejected','cancelled','deleted','reversed'].includes(s)},
];
const TYPE_GROUPS = [
  {key:'all',          label:'All types'},
  {key:'courier',      label:'Courier'},
  {key:'item_exchange',label:'Item exchange'},
  {key:'auction',      label:'Auction'},
];

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.className='';},3600);}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

async function locationName(id, token) {
  if (id == null) return '—';
  if (id >= 1e12) return structureName(id, token);
  await resolveNames([id]); return nameOf(id, 'Location ' + id);
}

function stampClass(s){if(s==='outstanding')return 'st-out';if(s==='in_progress')return 'st-prog';if(/^finished/.test(s))return 'st-done';return 'st-bad';}
function statusLabel(s){return (s||'').replace(/_/g,' ');}

function renderFilters(){
  const counts=k=>{const g=STATUS_GROUPS.find(x=>x.key===k);return k==='all'?rows.length:rows.filter(r=>g.match(r.status)).length;};
  $('statusFilts').innerHTML=STATUS_GROUPS.map(g=>`<button class="filt${filtStatus===g.key?' on':''}" data-k="${g.key}"><span>${g.label}</span><span class="ct">${counts(g.key)}</span></button>`).join('');
  $('statusFilts').querySelectorAll('.filt').forEach(b=>{b.onclick=()=>{filtStatus=b.dataset.k;renderFilters();renderTable();};});
  const tcount=k=>k==='all'?rows.length:rows.filter(r=>r.type===k).length;
  $('typeFilts').innerHTML=TYPE_GROUPS.map(g=>`<button class="filt${filtType===g.key?' on':''}" data-k="${g.key}"><span>${g.label}</span><span class="ct">${tcount(g.key)}</span></button>`).join('');
  $('typeFilts').querySelectorAll('.filt').forEach(b=>{b.onclick=()=>{filtType=b.dataset.k;renderFilters();renderTable();};});
}

function renderKv(){
  const now=Date.now();
  const out=rows.filter(r=>r.status==='outstanding');
  const prog=rows.filter(r=>r.status==='in_progress');
  const collAtRisk=prog.concat(out).filter(r=>r.type==='courier').reduce((a,r)=>a+(r.collateral||0),0);
  const rewardsPending=out.concat(prog).reduce((a,r)=>a+(r.reward||0),0);
  const done30=rows.filter(r=>/^finished/.test(r.status)&&r.date_completed&&Date.parse(r.date_completed)>now-30*86_400_000);
  $('kv').innerHTML=
    `<div class="kcard"><div class="l">Outstanding</div><div class="n">${out.length}</div><div class="s">awaiting a taker</div></div>`+
    `<div class="kcard"><div class="l">Couriers in transit</div><div class="n">${prog.filter(r=>r.type==='courier').length}</div><div class="s">accepted, not delivered</div></div>`+
    `<div class="kcard"><div class="l">Collateral in play</div><div class="n">${fmtISK(collAtRisk)}</div><div class="s">on open + running couriers</div></div>`+
    `<div class="kcard"><div class="l">Rewards on the table</div><div class="n">${fmtISK(rewardsPending)}</div><div class="s">open + in-progress</div></div>`+
    `<div class="kcard"><div class="l">Finished · 30d</div><div class="n">${done30.length}</div><div class="s">completed this month</div></div>`;
}

function renderTable(){
  const now=Date.now();
  const errHtml=Object.keys(charErrs).map(id=>`<div class="charerr">⚠ ${esc((chars[id]||{}).charName||('Char '+id))}: ${esc(charErrs[id])}</div>`).join('');
  const g=STATUS_GROUPS.find(x=>x.key===filtStatus);
  let list=rows.filter(r=>(filtStatus==='all'||g.match(r.status))&&(filtType==='all'||r.type===filtType));
  list=list.slice().sort((a,b)=>Date.parse(b.date_issued)-Date.parse(a.date_issued));
  $('countHint').textContent=list.length+' of '+rows.length+' contracts';
  if(!list.length){$('out').innerHTML=errHtml+'<div class="empty">No contracts match the current filing.</div>';return;}
  $('out').innerHTML=errHtml+'<table><thead><tr><th>Issued</th><th>Type</th><th>Contract</th><th>Route / scope</th><th class="num">Price / reward</th><th class="num">Collateral</th><th>Status</th></tr></thead><tbody>'+
    list.map(r=>{
      const issued=new Date(r.date_issued);const iso=issued.toISOString().slice(0,10);
      const who=esc(nameOf(r.issuer_id,'…'))+(r.acceptor_id?' → '+esc(nameOf(r.acceptor_id,'…')):'');
      const route=r.type==='courier'?`<span>${esc(r._startName||'…')}</span><span class="arr">⇒</span><span>${esc(r._endName||'…')}</span><span class="vol">${fmtInt(Math.round(r.volume||0))} m³ · ${r.days_to_complete||0}d to deliver</span>`:`<span>${esc(r._startName||'—')}</span>`;
      const priceCol=r.type==='courier'?fmtISK(r.reward):fmtISK(r.price||r.reward||0);
      const exp=r.status==='outstanding'&&r.date_expired?`<span class="expiry">expires in ${fmtDur(Date.parse(r.date_expired)-now)}</span>`:'';
      return `<tr><td>${iso}<span class="expiry">${esc(r._charName)}</span></td><td>${esc((r.type||'').replace(/_/g,' '))}</td><td class="ctitle"><span class="t">${esc(r.title||'(no title)')}</span><span class="who">${who}</span></td><td class="route">${route}</td><td class="num">${priceCol}</td><td class="num">${r.type==='courier'?fmtISK(r.collateral):'—'}</td><td><span class="stamp ${stampClass(r.status)}">${esc(statusLabel(r.status))}</span>${exp}</td></tr>`;
    }).join('')+'</tbody></table>';
}

async function loadAll(){
  if(noPilotsGuard('out'))return;
  const btn=$('loadBtn');btn.disabled=true;
  $('out').innerHTML='<div class="empty"><span class="spin"></span>Pulling contracts from ESI…</div>';
  rows=[];charErrs={};
  for(const id of visibleIds(MY_SECTION)){
    try{const s=await getTok(id);if(!s)throw new Error('token expired — re-open the Toolset menu');
      const list=await esiGetPaged('/characters/'+id+'/contracts/',s.access,20);
      list.forEach(c=>{rows.push({...c,_charId:id,_charName:s.charName||('Char '+id)});});
    }catch(e){charErrs[id]=e.status===403?'contracts scope missing — remove & re-add the character':e.message;}
  }
  try{await resolveNames(rows.flatMap(r=>[r.issuer_id,r.acceptor_id]));}catch{}
  const locJobs=[];
  rows.forEach(r=>{const tok=(chars[r._charId]||{}).access;if(r.start_location_id)locJobs.push(locationName(r.start_location_id,tok).then(n=>{r._startName=n;}));if(r.type==='courier'&&r.end_location_id)locJobs.push(locationName(r.end_location_id,tok).then(n=>{r._endName=n;}));});
  try{await Promise.all(locJobs);}catch{}
  renderKv();renderFilters();renderTable();
  const out=rows.filter(r=>r.status==='outstanding').length;
  const prog=rows.filter(r=>r.status==='in_progress').length;
  reportDashboard(MY_SECTION, out+' outstanding · '+prog+' running', prog||out?'ok':'muted');
  $('loadNote').textContent='Docket pulled '+new Date().toUTCString().slice(17,25)+' EVE · '+rows.length+' contracts';
  btn.disabled=false;
  if(Object.keys(charErrs).length)toast('Some pilots could not be read',true);
}

$('loadBtn').onclick=loadAll;
window.onRosterChange=()=>{if(rows.length)loadAll();};
renderFilters();
renderPilots();
