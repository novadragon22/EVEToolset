/**
 * EVE Suite — Training Deck
 * Skill queues as vertical tracks, plus the Optimal Queue generator modal.
 */
import { KEY_CHARS, KEY_THEME }                        from '@core/constants.js';
import { loadChars, sectionOn, setSection, visibleIds,
         reportDashboard }                             from '@core/storage.js';
import { esiGet, getTok, resolveNames, nameOf, pLimit } from '@core/esi-client.js';
import { $, esc, fmtDur, fmtInt, roman }               from '@core/format.js';

const MY_SECTION = 'academy';
let chars = loadChars();
let tracks = [];

// ── Shared boot helpers ───────────────────────────────────────────────────────

function renderPilots() {
  const el = $('pilots'); if (!el) return;
  const ids = Object.keys(chars);
  if (!ids.length) { el.innerHTML = '<span class="nochars">no pilots — sign in from the Toolset menu</span>'; return; }
  el.innerHTML = ids.map(id => {
    const on = sectionOn(id, MY_SECTION);
    return `<button class="ptag${on?'':' off'}" data-id="${id}">${esc((chars[id]||{}).charName||('Char '+id))}</button>`;
  }).join('');
  el.querySelectorAll('.ptag').forEach(b => { b.onclick = () => { setSection(b.dataset.id, MY_SECTION, !sectionOn(b.dataset.id, MY_SECTION)); renderPilots(); }; });
}

function noPilotsGuard(cid) {
  const ids = visibleIds(MY_SECTION); const el = $(cid);
  if (!Object.keys(chars).length) { if (el) el.innerHTML = '<div class="empty">No pilots signed in yet.<br><br>Open the EVE Toolset menu.</div>'; return true; }
  if (!ids.length) { if (el) el.innerHTML = '<div class="empty">All pilots excluded — click a name above to include one.</div>'; return true; }
  return false;
}

function tickClock() { const el = $('eveclock'); if (!el) return; const d = new Date(); el.textContent = String(d.getUTCHours()).padStart(2,'0')+':'+String(d.getUTCMinutes()).padStart(2,'0')+' EVE'; }
tickClock(); setInterval(tickClock, 15_000);
try { if (window.self === window.top) { const bl = $('backlink'); if (bl) bl.style.display = 'inline-flex'; } } catch {}
window.addEventListener('storage', e => { if (e.key === KEY_CHARS) { chars = loadChars(); renderPilots(); } if (e.key === KEY_THEME && e.newValue) try { document.documentElement.dataset.theme = e.newValue; } catch {} });

// ── Queue rendering ───────────────────────────────────────────────────────────

function render() {
  const now = Date.now();
  let training = 0, idle = 0;
  $('out').innerHTML = tracks.map(t => {
    if (t.err) return `<div class="track panel"><div class="track-hd"><span class="cn">${esc(t.name)}</span></div><div class="charerr">⚠ ${esc(t.err)}</div></div>`;
    const q = t.queue || [];
    const cur = q[0];
    if (cur) training++; else idle++;
    const runway = q.length ? Date.parse(q[q.length-1].finish_date) - now : 0;
    const entries = q.slice(0, 12).map((e, i) => {
      const isNow = i === 0;
      let prog = '';
      if (isNow && e.start_date && e.finish_date) {
        const a = Date.parse(e.start_date), b = Date.parse(e.finish_date);
        const pct = Math.min(100, Math.max(0, 100*(now-a)/(b-a)));
        prog = `<div class="prog"><span class="fill" style="width:${pct.toFixed(1)}%"></span></div>`;
      }
      return `<div class="qe${isNow?' now':''}"><div class="qn">${esc(nameOf(e.skill_id,'skill #'+e.skill_id))}<b>${roman(e.finished_level)}</b></div>` +
        `<div class="qt">${e.finish_date ? (isNow?'finishes in ':'done in ')+fmtDur(Date.parse(e.finish_date)-now) : 'paused'}</div>${prog}</div>`;
    }).join('');
    const more = q.length > 12 ? `<div class="qe"><div class="qt">… ${q.length-12} more queued</div></div>` : '';
    const attrs = t.attrs ? `<div class="attr">${['intelligence','memory','perception','willpower','charisma'].map(a=>`<span>${a.slice(0,3).toUpperCase()} ${t.attrs[a]}</span>`).join('')}</div>` : '';
    return `<div class="track panel">` +
      `<div class="track-hd"><span class="cn">${esc(t.name)}</span>` +
      `<div class="sp"><span>${fmtInt(t.totalSp)} SP · ${t.skillCount} skills</span><span>${t.unalloc ? fmtInt(t.unalloc)+' unalloc.' : ''}</span></div>` +
      (q.length ? `<span class="alarm ok">queue runs ${fmtDur(runway)}</span>` : `<span class="alarm bad">QUEUE EMPTY — SP IDLE</span>`) +
      `<button class="opt-btn" data-id="${t.id}" onclick="window._openQueueModal(this.dataset.id)">⚡ Optimal Queue</button>` +
      `</div>` +
      (q.length ? `<div class="rail">${entries}${more}</div>` : `<div class="empty" style="padding:22px">nothing training</div>`) +
      attrs + `</div>`;
  }).join('');
  reportDashboard(MY_SECTION, training + ' training' + (idle ? ' · ' + idle + ' idle!' : ''), idle ? 'bad' : 'ok');
  $('loadNote').textContent = 'Queues read ' + new Date().toUTCString().slice(17,25) + ' EVE';
}

// ── ESI fetch ─────────────────────────────────────────────────────────────────

async function loadAll() {
  if (noPilotsGuard('out')) return;
  const btn = $('loadBtn'); btn.disabled = true;
  $('out').innerHTML = '<div class="empty" style="grid-column:1/-1"><span class="spin"></span>Reading queues…</div>';
  tracks = [];
  for (const id of visibleIds(MY_SECTION)) {
    const t = { id, name: (chars[id]||{}).charName || ('Char '+id) };
    try {
      const s = await getTok(id); if (!s) throw new Error('token expired — re-open the Toolset menu');
      const T = s.access;
      const [sk, q] = await Promise.all([esiGet('/characters/'+id+'/skills/', T), esiGet('/characters/'+id+'/skillqueue/', T)]);
      t.totalSp = sk.total_sp; t.unalloc = sk.unallocated_sp || 0; t.skillCount = (sk.skills||[]).length;
      t.queue = (q||[]).filter(e => !e.finish_date || Date.parse(e.finish_date) > Date.now());
      try { t.attrs = await esiGet('/characters/'+id+'/attributes/', T); } catch { t.attrs = null; }
    } catch (e) { t.err = e.status === 403 ? 'skills scope missing — re-add the character' : e.message; }
    tracks.push(t);
  }
  try { await resolveNames(tracks.flatMap(t => (t.queue||[]).map(e => e.skill_id))); } catch {}
  render(); btn.disabled = false;
}

$('loadBtn').onclick = loadAll;
window.onRosterChange = () => { if (tracks.length) loadAll(); };

// ── Optimal Queue Generator ───────────────────────────────────────────────────

const DA_PRIMARY=180, DA_SECONDARY=182, DA_RANK=275;
const DA_REQ1=182,DA_LV1=277, DA_REQ2=183,DA_LV2=278, DA_REQ3=184,DA_LV3=279, DA_REQ4=1285,DA_LV4=1286, DA_REQ5=1289,DA_LV5=1290;
const ATTR_CODE = {164:'int',165:'per',166:'cha',167:'wil',168:'mem'};
const IMP_ATTR  = {175:'int',176:'mem',177:'per',178:'wil',179:'cha'};
const KNOWN_IMP_TYPES = {
  10212:['int',1],10213:['int',2],10214:['int',3],10215:['int',4],10216:['int',5],
  10217:['per',1],10218:['per',2],10219:['per',3],10220:['per',4],10221:['per',5],
  10222:['wil',1],10223:['wil',2],10224:['wil',3],10225:['wil',4],10226:['wil',5],
  10228:['mem',1],10229:['mem',2],10230:['mem',3],10231:['mem',4],10232:['mem',5],
  10233:['cha',1],10234:['cha',2],10235:['cha',3],10236:['cha',4],10237:['cha',5],
  33399:['int',5],33400:['mem',5],33394:['per',5],33402:['wil',5],33396:['cha',5],
  3279:['int',3],3280:['mem',3],3281:['per',3],3282:['wil',3],
};
const LEVEL_SP = [0,250,1414,8000,45255,256000];
function spForLevel(rank,lv){return LEVEL_SP[lv]*rank;}
function trainSec(sp,pri,sec){return sp/((pri+sec/2)/60);}

const skillDogmaCache = {};
const DOGMA_CACHE_KEY = 'eve_suite_dogmacache_v1';
try { Object.assign(skillDogmaCache, JSON.parse(sessionStorage.getItem(DOGMA_CACHE_KEY)||'{}')); } catch {}
function saveDogmaCache(){try{sessionStorage.setItem(DOGMA_CACHE_KEY,JSON.stringify(skillDogmaCache));}catch{}}

async function fetchSkillDogma(typeIds) {
  const need = typeIds.filter(id => !skillDogmaCache[id]);
  if (!need.length) return;
  const lim = pLimit(8);
  await Promise.all(need.map(id => lim(async () => {
    try {
      const r = await fetch('https://esi.evetech.net/latest/universe/types/'+id+'/');
      if (!r.ok) { skillDogmaCache[id] = null; return; }
      const d = await r.json();
      const attrs = {};
      (d.dogma_attributes||[]).forEach(a => { attrs[a.attribute_id] = a.value; });
      const pri  = ATTR_CODE[attrs[DA_PRIMARY]]   || 'int';
      const sec  = ATTR_CODE[attrs[DA_SECONDARY]] || 'mem';
      const rank = attrs[DA_RANK] || 1;
      const req  = [];
      [[DA_REQ1,DA_LV1],[DA_REQ2,DA_LV2],[DA_REQ3,DA_LV3],[DA_REQ4,DA_LV4],[DA_REQ5,DA_LV5]]
        .forEach(([ra,la]) => { if (attrs[ra] && attrs[la]) req.push([+attrs[ra], +attrs[la]]); });
      skillDogmaCache[id] = { name:d.name, rank, pri, sec, req };
    } catch { skillDogmaCache[id] = null; }
  })));
  saveDogmaCache();
}

function buildQueue(targets, currentLevels, dogma, cap) {
  const queue=[]; const queued=new Set(); const trained={...currentLevels};
  function needSkill(skillId, targetLevel) {
    const d=dogma[skillId]; if(!d) return;
    const curLv=trained[skillId]||0; if(curLv>=targetLevel) return;
    (d.req||[]).forEach(([pid,plv])=>needSkill(pid,plv));
    for(let lv=curLv+1;lv<=targetLevel;lv++){const key=skillId+':'+lv;if(!queued.has(key)){queued.add(key);queue.push({skillId,level:lv,name:d.name,rank:d.rank,pri:d.pri,sec:d.sec,isPrereq:false});trained[skillId]=lv;}}
  }
  targets.forEach(([sid,lv])=>needSkill(sid,lv));
  const targetSet=new Set(targets.map(([s,l])=>s+':'+l));
  queue.forEach(e=>{if(!targetSet.has(e.skillId+':'+e.level)){const inTgt=targets.some(([s])=>s===e.skillId);e.isPrereq=!inTgt;}});
  return queue.slice(0,cap||50);
}

function effAttrs(baseAttrs, implantBonuses) {
  const eff={};['int','mem','per','wil','cha'].forEach(k=>{eff[k]=(baseAttrs[k]||20)+(implantBonuses[k]||0);});return eff;
}

function queueTime(queue,effA,currentLevels){
  let sec=0;const sim={...currentLevels};
  queue.forEach(e=>{const curSP=spForLevel(e.rank,sim[e.skillId]||0);const tgtSP=spForLevel(e.rank,e.level);const needed=Math.max(0,tgtSP-curSP);sec+=trainSec(needed,effA[e.pri]||20,effA[e.sec]||20);sim[e.skillId]=e.level;});
  return sec;
}

function optimiseOrder(queue,effA){
  return queue.slice().sort((a,b)=>{const ra=(effA[a.pri]||20)+(effA[a.sec]||20)/2;const rb=(effA[b.pri]||20)+(effA[b.sec]||20)/2;if(rb!==ra)return rb-ra;return a.rank-b.rank;});
}

let qModal=null, qCharId=null, qTabIdx=0;

async function openQueueModal(charId) {
  qCharId=charId; qTabIdx=0;
  showModal('<div class="qmod-spin"><span class="spin"></span> Loading skill data…</div>');
  try {
    const s=tracks.find(t=>t.id===charId); if(!s) throw new Error('character not loaded — click Sound the bell first');
    const tok=await getTok(charId); if(!tok) throw new Error('token expired');
    const T=tok.access;
    let implantIds=[];
    try{implantIds=await esiGet('/characters/'+charId+'/implants/',T);}catch{}
    const implantBonus={int:0,mem:0,per:0,wil:0,cha:0};
    implantIds.forEach(tid=>{const k=KNOWN_IMP_TYPES[tid];if(k)implantBonus[k[0]]=Math.max(implantBonus[k[0]],k[1]);});
    const unknownImpls=implantIds.filter(tid=>!KNOWN_IMP_TYPES[tid]);
    if(unknownImpls.length){await Promise.all(unknownImpls.slice(0,20).map(async tid=>{try{const r=await fetch('https://esi.evetech.net/latest/universe/types/'+tid+'/');if(!r.ok)return;const d=await r.json();(d.dogma_attributes||[]).forEach(a=>{const attr=IMP_ATTR[a.attribute_id];if(attr&&a.value>0)implantBonus[attr]=Math.max(implantBonus[attr],a.value);});}catch{}}));}
    const hasImplants=Object.values(implantBonus).some(v=>v>0);
    const baseA={int:20,mem:20,per:20,wil:20,cha:19};
    if(s.attrs){baseA.int=s.attrs.intelligence||20;baseA.mem=s.attrs.memory||20;baseA.per=s.attrs.perception||20;baseA.wil=s.attrs.willpower||20;baseA.cha=s.attrs.charisma||19;}
    const curLevels={};let charSkillsFull=[];
    try{const sk=await esiGet('/characters/'+charId+'/skills/',T);charSkillsFull=sk.skills||[];}catch{}
    charSkillsFull.forEach(sk=>{curLevels[sk.skill_id]=sk.active_skill_level;});
    const allSkillIds=charSkillsFull.map(sk=>sk.skill_id);
    showModal('<div class="qmod-spin"><span class="spin"></span> Fetching skill metadata ('+allSkillIds.length+' skills)…</div>');
    await fetchSkillDogma(allSkillIds);
    const targets=[];
    charSkillsFull.forEach(sk=>{const curLv=sk.active_skill_level||0;if(curLv<5){const d=skillDogmaCache[sk.skill_id];if(d)targets.push([sk.skill_id,5]);}});
    const effWith=effAttrs(baseA,implantBonus);const effWithout=effAttrs(baseA,{int:0,mem:0,per:0,wil:0,cha:0});
    targets.sort((a,b)=>{const da=skillDogmaCache[a[0]],db=skillDogmaCache[b[0]];if(!da||!db)return 0;return (effWith[db.pri]+effWith[db.sec]/2)-(effWith[da.pri]+effWith[da.sec]/2);});
    const qWith=buildQueue(targets,curLevels,skillDogmaCache,50);
    const qWithout=buildQueue(targets,curLevels,skillDogmaCache,50);
    const qWithOpt=optimiseOrder(qWith,effWith);const qWithoutOpt=optimiseOrder(qWithout,effWithout);
    const tWith=queueTime(qWithOpt,effWith,curLevels);const tWithout=queueTime(qWithoutOpt,effWithout,curLevels);
    renderQueueModal(s.name,qWithOpt,qWithoutOpt,effWith,effWithout,implantBonus,hasImplants,tWith,tWithout,curLevels,baseA);
  } catch(err) { showModal(`<div style="padding:20px;font-size:12px;color:var(--red)">⚠ ${esc(err.message||String(err))}</div>`); }
}

function showModal(innerHtml){closeModal();const bd=document.createElement('div');bd.className='qmod-backdrop';bd.id='qmod-backdrop';bd.innerHTML='<div class="qmod panel">'+innerHtml+'</div>';bd.onclick=e=>{if(e.target===bd)closeModal();};document.body.appendChild(bd);qModal=bd;}
function closeModal(){if(qModal){qModal.remove();qModal=null;}}

function renderQueueModal(charName,qWith,qWithout,effWith,effWithout,implantBonus,hasImplants,tWith,tWithout,curLevels,baseA){
  function impLine(bonus){const parts=Object.entries(bonus).filter(([,v])=>v>0).map(([k,v])=>k.toUpperCase()+'+'+v);return parts.length?parts.join(' · '):'none detected';}
  function queueRows(queue,effA,curL){
    if(!queue.length) return '<div class="hint" style="padding:10px">No trainable skills found.</div>';
    let cumSec=0;const sim={...curL};
    return queue.map((e,i)=>{
      const needed=Math.max(0,spForLevel(e.rank,e.level)-(spForLevel(e.rank,sim[e.skillId]||0)));
      const sec=trainSec(needed,effA[e.pri]||20,effA[e.sec]||20);cumSec+=sec;sim[e.skillId]=e.level;
      return `<div class="qrow${e.isPrereq?' prereq':''}"><span class="qpos">${i+1}</span><span class="qskn">${esc(e.name)}</span><span class="qskl">${['','I','II','III','IV','V'][e.level]}</span><span class="qtm">+${fmtDur(sec*1000)}</span></div>`;
    }).join('');
  }
  function copyText(q){return q.map((e,i)=>(i+1)+'. '+e.name+' '+['','I','II','III','IV','V'][e.level]).join('\n');}
  const deltaStr=hasImplants?`<span class="qdelta faster">↓ ${fmtDur(Math.abs((tWithout-tWith)*1000))} faster with implants</span>`:'';
  const bodies=[
    `<div class="qmod-note">Implant bonuses: <b>${impLine(implantBonus)}</b> · INT ${effWith.int} MEM ${effWith.mem} PER ${effWith.per} WIL ${effWith.wil} CHA ${effWith.cha}</div><div style="font-size:10.5px;margin-bottom:10px;opacity:.7">Queue time: <b>${fmtDur(tWith*1000)}</b> ${deltaStr}</div><div>${queueRows(qWith,effWith,curLevels)}</div><div class="qmod-copy"><textarea readonly>${copyText(qWith)}</textarea></div>`,
    `<div class="qmod-note">Base attributes only · INT ${effWithout.int} MEM ${effWithout.mem} PER ${effWithout.per} WIL ${effWithout.wil} CHA ${effWithout.cha}</div><div style="font-size:10.5px;margin-bottom:10px;opacity:.7">Queue time: <b>${fmtDur(tWithout*1000)}</b></div><div>${queueRows(qWithout,effWithout,curLevels)}</div><div class="qmod-copy"><textarea readonly>${copyText(qWithout)}</textarea></div>`,
  ];
  const tabHtml=['With implants','Without implants'].map((t,i)=>`<div class="qmod-tab${i===qTabIdx?' on':''}" data-ti="${i}">${t}</div>`).join('');
  showModal(`<div class="qmod-hd"><h2>⚡ Optimal Queue · ${esc(charName)}</h2><span class="qmod-close" onclick="window._closeQueueModal()">✕</span></div><div class="qmod-tabs">${tabHtml}</div><div class="qmod-body">${bodies[qTabIdx]}</div>`);
  qModal.querySelectorAll('.qmod-tab').forEach(tab=>{tab.onclick=()=>{qTabIdx=+tab.dataset.ti;renderQueueModal(charName,qWith,qWithout,effWith,effWithout,implantBonus,hasImplants,tWith,tWithout,curLevels,baseA);};});
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
window._openQueueModal  = openQueueModal;
window._closeQueueModal = closeModal;

renderPilots();
