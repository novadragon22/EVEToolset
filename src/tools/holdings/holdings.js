/**
 * EVE Suite — Cargo Holds
 * Assets racked by location, containers folded, valued at CCP averages, searchable.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, esiGetPaged, getTok, resolveNames,
         nameOf, structureName }                       from '@core/esi-client.js';
import { $, esc, fmtISK, fmtInt }                     from '@core/format.js';

const MY_SECTION = 'holdings';
let chars = loadChars();
let shelves = null, avgPrices = {};

function renderPilots(){const el=$('pilots');if(!el)return;const ids=Object.keys(chars);if(!ids.length){el.innerHTML='<span class="nochars">no pilots — sign in from the Toolset menu</span>';return;}el.innerHTML=ids.map(id=>{const on=sectionOn(id,MY_SECTION);return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;}).join('');el.querySelectorAll('.ptag').forEach(b=>{b.onclick=()=>{setSection(b.dataset.id,MY_SECTION,!sectionOn(b.dataset.id,MY_SECTION));renderPilots();};});}
function noPilotsGuard(cid){const el=$(cid);if(!Object.keys(chars).length){if(el)el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>';return true;}if(!visibleIds(MY_SECTION).length){if(el)el.innerHTML='<div class="empty">All pilots excluded — click a name above.</div>';return true;}return false;}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock();setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

async function locationName(id, token) {
  if (id == null) return '—';
  if (id >= 1e12) return structureName(id, token);
  await resolveNames([id]); return nameOf(id, 'Location ' + id);
}

async function loadAll(){
  if(noPilotsGuard('out'))return;
  const btn=$('loadBtn');btn.disabled=true;
  $('out').innerHTML='<div class="empty"><span class="spin"></span>Opening the warehouse… (large rosters take a moment)</div>';
  const errs=[];const raw=[];
  for(const id of visibleIds(MY_SECTION)){
    try{const s=await getTok(id);if(!s)throw new Error('token expired — re-open the Toolset menu');
      const rows=await esiGetPaged('/characters/'+id+'/assets/',s.access,8);
      rows.forEach(r=>raw.push({...r,_c:s.charName||('Char '+id),_tok:s.access}));
    }catch(e){errs.push(((chars[id]||{}).charName||id)+': '+(e.status===403?'assets scope missing — re-add in the Toolset menu':e.message));}
  }
  if(!raw.length){$('out').innerHTML=errs.map(e=>`<div class="charerr">⚠ ${esc(e)}</div>`).join('')+'<div class="empty">no assets readable</div>';btn.disabled=false;return;}
  try{const pl=await esiGet('/markets/prices/');pl.forEach(p=>{avgPrices[p.type_id]=p.average_price;});}catch{}
  const byItemId={};raw.forEach(r=>{byItemId[r.item_id]=r;});
  function topLoc(r,depth){if(depth>6)return null;const parent=byItemId[r.location_id];return parent?topLoc(parent,(depth||0)+1):r.location_id;}
  shelves={};
  raw.forEach(r=>{const loc=topLoc(r,0);if(loc==null)return;const inContainer=!!byItemId[r.location_id];shelves[loc]=shelves[loc]||{items:[]};shelves[loc].items.push({tid:r.type_id,qty:r.quantity||1,owner:r._c,inContainer,isk:(avgPrices[r.type_id]||0)*(r.quantity||1)});});
  const typeIds=[...new Set(raw.map(r=>r.type_id))].slice(0,1800);
  try{await resolveNames(typeIds);}catch{}
  const anyTok=raw[0]._tok;
  await Promise.all(Object.keys(shelves).map(loc=>locationName(+loc,anyTok).then(n=>{shelves[loc].name=n;})));
  render(errs);btn.disabled=false;
}

function render(errs){
  const q=($('searchIn').value||'').trim().toLowerCase();
  const locs=Object.entries(shelves).map(([loc,sh])=>{
    const merged={};sh.items.forEach(it=>{const k=it.tid+(it.inContainer?'c':'');merged[k]=merged[k]||{tid:it.tid,qty:0,isk:0,inContainer:it.inContainer};merged[k].qty+=it.qty;merged[k].isk+=it.isk;});
    let items=Object.values(merged);if(q)items=items.filter(it=>String(nameOf(it.tid,'')).toLowerCase().includes(q));
    items.sort((a,b)=>b.isk-a.isk);
    return{loc,name:sh.name||('Location '+loc),items,isk:items.reduce((a,b)=>a+b.isk,0),count:items.length};
  }).filter(l=>l.items.length).sort((a,b)=>b.isk-a.isk);
  const grand=locs.reduce((a,l)=>a+l.isk,0);
  $('grandTot').textContent=locs.length+' shelves · ≈ '+fmtISK(grand)+' (CCP avg, estimate)';
  const errHtml=(errs||[]).map(e=>`<div class="charerr">⚠ ${esc(e)}</div>`).join('');
  if(!locs.length){$('out').innerHTML=errHtml+'<div class="empty">nothing on the shelves'+(q?' matches "'+esc(q)+'"':'')+'</div>';return;}
  $('out').innerHTML=errHtml+locs.map((l,i)=>{
    const shown=l.items.slice(0,60);
    return `<details class="shelf panel"${q||i<2?' open':''}><summary><span class="ln">${esc(l.name)}<span class="lt">${l.count} stack types</span></span><span class="lv">≈ ${fmtISK(l.isk)}<span class="li">CCP avg estimate</span></span></summary><div class="shelfbody">${shown.map(it=>`<div class="srow"><span class="sn">${it.inContainer?'<span class="inbox">boxed</span>':''}${esc(nameOf(it.tid,'Type '+it.tid))} × ${fmtInt(it.qty)}</span><span class="sv">${fmtISK(it.isk)}</span></div>`).join('')}${l.items.length>60?`<div class="srow more">… ${l.items.length-60} more stack types on this shelf</div>`:''}</div></details>`;
  }).join('');
  reportDashboard(MY_SECTION, '≈ '+fmtISK(grand)+' across '+locs.length+' shelves', 'ok');
}

let _st=null;
$('searchIn').addEventListener('input',()=>{if(!shelves)return;clearTimeout(_st);_st=setTimeout(()=>render(),250);});
$('loadBtn').onclick=loadAll;
window.onRosterChange=()=>{if(shelves)loadAll();};
renderPilots();
