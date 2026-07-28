/**
 * EVE Suite — Clone Bay
 * Active implants, jump clones, cooldown meters, Infomorph skills.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, getTok, resolveNames, nameOf,
         structureName }                               from '@core/esi-client.js';
import { $, esc, fmtDur }                              from '@core/format.js';

const MY_SECTION = 'clones';
const SKILL_SYNC = 33399, SKILL_PSY = 24242;
let chars = loadChars();
let pods  = [];

function renderPilots() {
  const el = $('pilots'); if (!el) return;
  const ids = Object.keys(chars);
  if (!ids.length) { el.innerHTML = '<span class="nochars">no pilots — sign in from the Toolset menu</span>'; return; }
  el.innerHTML = ids.map(id => { const on = sectionOn(id, MY_SECTION); return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`; }).join('');
  el.querySelectorAll('.ptag').forEach(b => { b.onclick = () => { setSection(b.dataset.id, MY_SECTION, !sectionOn(b.dataset.id, MY_SECTION)); renderPilots(); }; });
}

function noPilotsGuard(cid) {
  const el=$(cid);
  if (!Object.keys(chars).length) { if(el) el.innerHTML='<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>'; return true; }
  if (!visibleIds(MY_SECTION).length) { if(el) el.innerHTML='<div class="empty">All pilots excluded — click a name above to include one.</div>'; return true; }
  return false;
}

function toast(msg,bad=false){const t=$('toast');if(!t)return;t.textContent=msg;t.className='show'+(bad?' bad':'');clearTimeout(toast._t);toast._t=setTimeout(()=>{t.className='';},3600);}
function tickClock(){const el=$('eveclock');if(!el)return;const d=new Date();el.textContent=String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE';}
tickClock(); setInterval(tickClock,15_000);
try{if(window.self===window.top){const bl=$('backlink');if(bl)bl.style.display='inline-flex';}}catch{}
window.addEventListener('storage',e=>{if(e.key===KEY_CHARS){chars=loadChars();renderPilots();}if(e.key===KEY_THEME&&e.newValue)try{document.documentElement.dataset.theme=e.newValue;}catch{}});

async function locationName(id, token) {
  if (id == null) return '—';
  if (id >= 1e12) return structureName(id, token);
  await resolveNames([id]); return nameOf(id, 'Location ' + id);
}

async function loadAll() {
  if (noPilotsGuard('out')) return;
  const btn=$('loadBtn'); btn.disabled=true;
  $('out').innerHTML='<div class="empty"><span class="spin"></span>Opening the vats…</div>';
  pods=[];
  for (const id of visibleIds(MY_SECTION)) {
    const pod={id, name:(chars[id]||{}).charName||('Char '+id)};
    try {
      const s=await getTok(id); if(!s) throw new Error('token expired — re-open the Toolset menu');
      pod.tok=s.access;
      const [cl,imps]=await Promise.all([
        esiGet('/characters/'+id+'/clones/',s.access),
        esiGet('/characters/'+id+'/implants/',s.access).catch(e=>{if(e.status===403)pod.scopeErr=true;return [];}),
      ]);
      pod.clones=cl; pod.implants=imps||[];
      try{const sk=await esiGet('/characters/'+id+'/skills/',s.access);const find=t=>{const f=(sk.skills||[]).find(x=>x.skill_id===t);return f?f.trained_skill_level:0;};pod.sync=find(SKILL_SYNC);pod.psy=find(SKILL_PSY);}catch{pod.sync=null;pod.psy=null;}
    } catch(e) { pod.err=e.status===403?'clones scope missing — remove & re-add the character':e.message; }
    pods.push(pod);
  }
  const typeIds=pods.flatMap(p=>(p.implants||[]).concat(((p.clones&&p.clones.jump_clones)||[]).flatMap(j=>j.implants||[])));
  try{await resolveNames(typeIds);}catch{}
  const locJobs=[];
  pods.forEach(p=>{
    if(!p.clones)return;
    const hl=p.clones.home_location;
    if(hl&&hl.location_id)locJobs.push(locationName(hl.location_id,p.tok).then(n=>{p.homeName=n;}));
    (p.clones.jump_clones||[]).forEach(j=>{locJobs.push(locationName(j.location_id,p.tok).then(n=>{j._locName=n;}));});
  });
  try{await Promise.all(locJobs);}catch{}
  render(); btn.disabled=false;
}

function cooldown(p){
  if(!p.clones)return null;
  const last=p.clones.last_clone_jump_date?Date.parse(p.clones.last_clone_jump_date):null;
  const lvl=p.sync==null?null:p.sync;
  const windowH=lvl==null?24:24-lvl;
  if(!last)return{ready:true,msLeft:0,windowH,unknownSkill:lvl==null,never:true};
  const readyAt=last+windowH*3_600_000;
  return{ready:readyAt<=Date.now(),msLeft:readyAt-Date.now(),windowH,unknownSkill:lvl==null};
}

function render(){
  if(!pods.length){$('out').innerHTML='<div class="empty">Nothing to show.</div>';return;}
  let readyCount=0,totalPods=0;
  $('out').innerHTML=pods.map(p=>{
    if(p.err)return `<div class="pod card"><div class="pod-hd"><span class="pn">${esc(p.name)}</span></div><div class="poderr">⚠ ${esc(p.err)}</div></div>`;
    totalPods++;
    const cd=cooldown(p); if(cd&&cd.ready)readyCount++;
    const jcs=(p.clones.jump_clones||[]);
    const maxJc=p.psy==null?'?':p.psy;
    const imps=(p.implants||[]).slice().sort((a,b)=>String(nameOf(a,'')).localeCompare(String(nameOf(b,''))));
    const slots=[];
    for(let i=0;i<10;i++){const t=imps[i];slots.push(t?`<div class="slot"><span class="sn">${i+1}</span><span class="pin on"></span><span class="im" title="${esc(nameOf(t))}">${esc(nameOf(t))}</span></div>`:`<div class="slot void"><span class="sn">${i+1}</span><span class="pin"></span><span class="im">— empty socket —</span></div>`);}
    const cdHtml=!cd?'':`<div class="cdwrap"><span class="hl">Jump-clone cooldown · ${cd.windowH}h window${cd.unknownSkill?' (skills unreadable — showing untrained 24h)':' (Infomorph Sync '+p.sync+')'}</span><div class="cdbar"><span class="fill ${cd.ready?'ok':'wait'}" style="width:${(cd.ready?100:Math.max(2,100-100*cd.msLeft/(cd.windowH*3_600_000))).toFixed(1)}%"></span><span class="txt">${cd.never?'no jump on record — ready':(cd.ready?'READY TO JUMP':fmtDur(cd.msLeft)+' remaining')}</span></div></div>`;
    return `<div class="pod card"><div class="pod-hd"><span class="pn">${esc(p.name)}</span><span class="pc">${jcs.length} / ${maxJc} vats</span></div><div class="vitals"><div class="vital"><div class="l">Implants live</div><div class="v">${(p.implants||[]).length} / 10</div></div><div class="vital"><div class="l">Jump clones</div><div class="v">${jcs.length}</div></div><div class="vital"><div class="l">Status</div><div class="v">${cd&&cd.ready?'ready':'cooling'}</div></div></div><div class="home"><span class="hl">Home station (death clone)</span>${esc(p.homeName||'—')}</div>${cdHtml}<div class="rack"><span class="hl">Active clone · implant rack</span>${slots.join('')}${p.scopeErr?'<div class="poderr">⚠ implant scope missing — sockets shown empty</div>':''}</div><div class="jcs"><span class="hl">Vat storage</span>${jcs.length?jcs.map(j=>`<details class="jc"><summary><span class="jn">${esc(j.name||('Clone '+j.jump_clone_id))} · ${esc(j._locName||'…')}</span><span class="jt">${(j.implants||[]).length} implants</span></summary><div class="jcbody">${(j.implants||[]).length?(j.implants||[]).map(t=>esc(nameOf(t))).join('<br>'):'no implants in this clone'}</div></details>`).join(''):'<div class="slot void"><span class="im">— no jump clones installed —</span></div>'}</div></div>`;
  }).join('');
  reportDashboard(MY_SECTION, readyCount+'/'+totalPods+' pods jump-ready', readyCount?'ok':'muted');
  $('loadNote').textContent='Registry read '+new Date().toUTCString().slice(17,25)+' EVE';
  if(pods.filter(p=>p.err).length)toast('Some pilots could not be read — see their pods',true);
}

$('loadBtn').onclick=loadAll;
window.onRosterChange=()=>{if(pods.length)loadAll();};
renderPilots();
