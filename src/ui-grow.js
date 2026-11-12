// 성장 패널 — 광산 / 몬스터 / 마스터리 / 연구 (2단계 레이어)
// ui.js 와 순환 참조를 만들지 않으려고, 필요한 콜백은 init 으로 받는다.
import { B, isBoss } from './balance.js';
import { S, save } from './state.js';
import * as L2 from './layer2.js';
import * as PR from './prestige.js';
import { playRewarded } from './ads.js';
import { enterStage, MODE } from './combat.js';
import { evoPrefix, evoStage, evoNextTier } from './sprites.js';
import { monTier } from './companions.js';
import { showEvolve } from './ui-evolve.js';
import { t, n0, dur } from './i18n.js';
import { fmt } from './logmath.js';
import { LgoldPerSec } from './offline.js';
import { autoBuyTick, canClear, bestFarmStage } from './stats.js';
import * as RELIC from './relics.js';
import { unlocked as dungeonOpen } from './dungeon.js';

const $ = id => document.getElementById(id);
let ctx = { refresh: () => {}, toast: () => {}, onLeadChange: () => {} };
export function initGrow(c) { ctx = { ...ctx, ...c }; }

let growTab = 'mine';
const GROW_TABS = [
  { k: 'mine', n: t('grow.tab.mine'), ic: '⛏️' },
  { k: 'mon', n: t('grow.tab.mon'), ic: '🐾' },
  { k: 'mast', n: t('grow.tab.mast'), ic: '🌟' },
  { k: 'res', n: t('grow.tab.res'), ic: '🔬' },
  // 유물은 마을 침공(던전)에서 나오므로 던전이 열릴 때 같이 보인다
  { k: 'relic', n: t('grow.tab.relic'), ic: '🏺', when: () => RELIC.enabled() && dungeonOpen() },
  // 환생은 해금되기 전엔 탭 자체를 숨긴다 — 3,000층 전에는 눌러도 할 게 없다
  { k: 'pres', n: t('grow.tab.pres'), ic: '♻️', when: () => PR.unlocked() },
];

const secs = n => dur(Math.ceil(n), true);      // 3시간 5분 / 4분 12초 (i18n.dur)
const after = () => { save(); renderGrow(); ctx.refresh(); };

export function renderGrow() {
  $('growRes').innerHTML =
    `<div>🔹 ${t('res.shard')}<b>${n0(S.shard)}</b></div>
     <div>🪨 ${t('res.ore')}<b>${n0(S.ore)}</b></div>
     <div>🌟 ${t('res.point')}<b>${L2.masteryFree()} / ${L2.masteryPoints()}</b></div>`;

  const tabs = GROW_TABS.filter(t => !t.when || t.when());
  if (!tabs.some(t => t.k === growTab)) growTab = 'mine';
  $('growTabs').innerHTML = tabs.map(t =>
    `<div class="seg ${t.k === growTab ? 'on' : ''}" data-gt="${t.k}">${t.ic} ${t.n}</div>`).join('');
  $('growTabs').querySelectorAll('[data-gt]').forEach(el => {
    el.onclick = () => { growTab = el.dataset.gt; renderGrow(); };
  });

  if (growTab === 'mine') renderMine();
  else if (growTab === 'mon') renderMonsters();
  else if (growTab === 'mast') renderMastery();
  else if (growTab === 'pres') renderPrestige();
  else if (growTab === 'relic') renderRelics();
  else renderResearch();
}

// ── 광산 (타일 채굴) ─────────────────────────────────────────
let bombMode = false;

function renderMine() {
  const p = L2.picks(), max = L2.pickMax(), bombs = L2.bombLeft();
  const rws = L2.rows();

  const grid = rws.map((row, ri) => {
    const cells = row.cells.map((c, ci) => {
      if (L2.isDug(c)) return '<div class="tile dug"></div>';
      const can = L2.canDig(ri, ci);
      const t = L2.TILE[Math.floor(c / 10)];
      const hits = c % 10;
      if (!can && !bombMode) return '<div class="tile dark">?</div>';
      const cls = 'tile' + (can ? '' : ' dark') + (bombMode ? ' bombable' : '');
      return `<div class="${cls}" data-r="${ri}" data-c="${ci}">${can ? t.icon : '?'}${hits > 1 && can ? `<i>${hits}</i>` : ''}</div>`;
    }).join('');
    return `<div class="trow"><span class="dep">${row.depth}</span>${cells}</div>`;
  }).join('');

  $('growBody').innerHTML =
    `<div class="gsec">
       <h3>⛏️ ${t('mine.title')} <span style="opacity:.55;font-size:12px;font-weight:600">${t('mine.depth', { d: L2.depth() })}</span></h3>
       <div class="d">${t('mine.help', { m: L2.depthMult().toFixed(1) })}</div>
       <div class="d" style="opacity:.85">${t('mine.picks')} <span style="color:#fff">${p} / ${max}</span>${p < max ? t('mine.next', { t: secs(L2.nextPickIn()) }) : t('mine.full')}
         ${bombMode ? `<br><b style="color:#ffcf3a">${t('mine.bombMode')}</b>` : ''}</div>
       <div class="mgrid">${grid}</div>
       <div class="gbtns" style="margin-top:9px">
         <button id="digAll" ${p < 1 ? 'disabled' : ''}>${t('mine.auto')}<span class="c">${t('mine.picksN', { n: p })}</span></button>
         <button id="digBomb" class="ad" ${bombs < 1 ? 'disabled' : ''}>${bombMode ? t('mine.cancel') : t('mine.bomb')}<span class="c">${t('mine.left', { n: bombs })}</span></button>
       </div>
       <div class="d" id="digRes" style="margin:9px 0 0"></div>
     </div>`;

  const show = r => {
    if (!r) return;
    after();
    const el = $('digRes');
    if (el) el.innerHTML = `${t('mine.result', { n: r.digs ?? 1 })} · 🔹 +${n0(r.shard)} · 🪨 +${n0(r.ore)}`;
  };

  $('growBody').querySelectorAll('[data-r]').forEach(el => {
    el.onclick = async () => {
      const r = +el.dataset.r, c = +el.dataset.c;
      if (bombMode) {
        bombMode = false;
        if (!await playRewarded()) { renderGrow(); ctx.toast(t('ad.notFinished')); return; }
        const res = L2.bombAt(r, c);
        if (res) show(res); else { after(); ctx.toast(t('mine.bombFail')); }
        return;
      }
      if (L2.picks() < 1) { ctx.toast(t('mine.noPick')); return; }
      const res = L2.digTile(r, c);
      if (res) show(res);
    };
  });
  $('digAll').onclick = () => show(L2.digAuto());
  $('digBomb').onclick = () => {
    if (bombMode) { bombMode = false; renderGrow(); return; }
    if (L2.bombLeft() < 1) { ctx.toast(t('mine.noBomb')); return; }
    bombMode = true;
    renderGrow();
  };
}

// ── 몬스터 수집 (도감) ───────────────────────────────────────
// 목록이 아니라 **그리드 + 실루엣**으로 보여준다. 빈 칸은 아무 감정도 만들지 않지만
// 회색 실루엣은 "아직 없는 것"을 계속 보여준다 — 수집 동기를 만드는 가장 싼 장치다
// (docs/reference-legend-of-slime.md §3).
let picked = null;

function renderMonsters() {
  const open = m => S.life >= m.unlock;      // 해금은 영구 기록 기준
  if (!picked || !L2.MONSTERS.some(m => m.key === picked)) picked = S.mon;

  const tiles = L2.MONSTERS.map(m => {
    const o = open(m), lv = L2.monLevel(m.key), lead = S.mon === m.key;
    // 도감도 지금 레벨의 진화형을 보여준다 — 키운 보람이 제일 먼저 눈에 들어오는 자리다.
    // 접두사는 매니페스트에 그림이 있을 때만 붙으므로 404 가 나지 않는다.
    const evo = evoPrefix('mon', m.key, monTier(m.key));
    return `<div class="mtile ${o ? '' : 'lock'} ${picked === m.key ? 'on' : ''}" data-pick="${m.key}">
      <!-- 그림이 아직 없는 몬스터(신규 추가분)는 404 로 깨진 아이콘이 뜬다. 숨기고 ? 를 띄운다 -->
      <img src="assets/mon/${m.key}/${evo}idle_1.png" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="noart" style="display:none">?</div>
      ${lead ? `<span class="lead">${t('mon.lead')}</span>` : ''}
      <div class="nm">${o ? m.name : '???'}</div>
      <div class="sub">${o ? 'Lv.' + lv : m.unlock}</div>
    </div>`;
  }).join('');

  const m = L2.MONSTERS.find(x => x.key === picked);
  // 고유 능력. 잠긴 몬스터도 보여 준다 — "저걸 얻으면 뭐가 되는지" 가 보여야 목표가 된다.
  const abil = B.roster.monsters.find(x => x.key === m.key)?.ability;
  const o = open(m), lv = L2.monLevel(m.key), cost = L2.monCost(m.key);
  const can = o && S.shard >= cost;
  const lead = S.mon === m.key;
  const miles = L2.MILESTONES.map(x => `<span class="mile ${lv >= x ? 'on' : ''}">${x}</span>`).join('');
  // 겉모습 단계 — "레벨을 올리면 모습이 변하나" 에 화면이 직접 답해야 한다.
  // 그림이 없는 종(신규 추가분)은 줄 자체를 띄우지 않는다 — 안 변하는데 변한다고 하면 안 된다.
  const tier = monTier(m.key);
  const stage = evoStage('mon', m.key, tier), nextT = evoNextTier('mon', m.key, tier);
  const evoLine = o && (stage > 1 || nextT)
    ? `<div class="mevo">${t('mon.evo', { n: stage })}${nextT
        ? t('mon.evoNext', { lv: L2.MILESTONES[nextT - 1] }) : t('mon.evoFinal')}</div>`
    : '';

  $('growBody').innerHTML = `
    <div class="mgrid">${tiles}</div>
    <div class="mdet">
      <div class="t">${o ? m.name : '???'} <span style="opacity:.55;font-weight:600">Lv.${lv}</span></div>
      ${abil ? `<div class="mabil"><b>${abil.name}</b> ${abil.desc}</div>` : ''}
      <div class="d">${o
        ? t('mon.miles', { m: miles, c: n0(cost) })
        : t('mon.unlockAt', { n: m.unlock })}</div>
      ${evoLine}
      ${o ? `<div class="mbtn">
          <button data-lead="${m.key}" class="${lead ? 'sel' : ''}" ${lead ? 'disabled' : ''}>${lead ? t('mon.lead') : t('mon.toLead')}</button>
          <button data-lvup="${m.key}" ${can ? '' : 'disabled'}>+1 <span class="c">🔹${n0(cost)}</span></button>
          <button data-lvmax="${m.key}" ${can ? '' : 'disabled'}>MAX</button>
        </div>` : ''}
    </div>
    <div class="d" style="font-size:11px;opacity:.65;line-height:1.6;margin-top:10px">
      ${t('mon.help', { m: L2.MILESTONES.join('·'), p: B.layer2.collect.milestoneAtkPct })}
    </div>`;

  $('growBody').querySelectorAll('[data-pick]').forEach(el => {
    el.onclick = () => { picked = el.dataset.pick; renderMonsters(); };
  });
  $('growBody').querySelectorAll('[data-lead]').forEach(el => {
    el.onclick = () => {
      S.mon = el.dataset.lead;
      ctx.onLeadChange();
      after();
      ctx.toast(t('mon.leadToast', { name: L2.MONSTERS.find(x => x.key === S.mon).name }));
    };
  });
  // 레벨업이 마일스톤(10·25·50·75·100)을 넘으면 진화 · 각성 연출을 띄운다 (ui-evolve.js)
  const lvUp = (key, fn) => {
    const t0 = monTier(key);
    if (!fn()) { ctx.toast(t('mon.noShard')); return; }
    after();
    const t1 = monTier(key);
    if (t1 > t0) showEvolve(key, t0, t1);
  };
  $('growBody').querySelectorAll('[data-lvup]').forEach(el => {
    el.onclick = () => lvUp(el.dataset.lvup, () => L2.levelUpMonster(el.dataset.lvup, 1));
  });
  $('growBody').querySelectorAll('[data-lvmax]').forEach(el => {
    el.onclick = () => lvUp(el.dataset.lvmax, () => L2.levelUpMonsterMax(el.dataset.lvmax));
  });
}

// ── 마스터리 ─────────────────────────────────────────────────
function renderMastery() {
  const free = L2.masteryFree();
  const nodes = L2.MASTERY_NODES.map(nd => {
    const lv = S.mastery[nd.key] || 0;
    const now = L2.masteryMul(nd.key);
    const next = now * (nd.mul || 1);        // 노드마다 배수가 다르다(§마스터리)
    // 찍으면 뭐가 되는지를 **찍기 전에** 보여준다. 미리보기가 없으면 고민이 생기지 않는다.
    const prev = free >= 1
      ? `<span class="pv">×${now.toFixed(3)} → <b>×${next.toFixed(3)}</b></span>`
      : `×${now.toFixed(3)}`;
    return `<div class="mrow">
      <div class="ic">${nd.icon}</div>
      <div class="mid"><div class="t">${nd.name} <span style="opacity:.55;font-weight:600">Lv.${lv}</span></div>
        <div class="d">${nd.affects} ${prev}</div></div>
      <button data-mp="${nd.key}" ${free < 1 ? 'disabled' : ''}>+1</button>
      <button data-mp10="${nd.key}" ${free < 10 ? 'disabled' : ''}>+10</button>
    </div>`;
  }).join('');
  $('growBody').innerHTML =
    `<div class="d" style="font-size:11px;opacity:.65;line-height:1.6;margin-bottom:9px">
       ${t('mast.help', { free, total: L2.masteryPoints() })}
     </div>` + nodes +
    `<button id="mReset" style="width:100%;margin-top:8px;background:#3a2030;color:#ffb4b4;
       border:1px solid #6a3545;border-radius:10px;padding:9px;font-size:12px;font-weight:700;cursor:pointer">
       ${t('mast.reset')} <span style="opacity:.8">💎${L2.masteryResetCost()}</span></button>`;
  $('growBody').querySelectorAll('[data-mp]').forEach(el => {
    el.onclick = () => { if (L2.spendMastery(el.dataset.mp, 1)) after(); };
  });
  $('growBody').querySelectorAll('[data-mp10]').forEach(el => {
    el.onclick = () => { if (L2.spendMastery(el.dataset.mp10, 10)) after(); };
  });
  $('mReset').onclick = () => {
    if (L2.masterySpent() < 1) { ctx.toast(t('mast.noSpent')); return; }
    if (S.gem < L2.masteryResetCost()) { ctx.toast(t('mast.noGem', { n: L2.masteryResetCost() })); return; }
    if (L2.resetMastery()) { after(); ctx.toast(t('mast.resetDone')); }
  };
}

// ── 유물 ─────────────────────────────────────────────────────
// 사다리 전체를 보여준다. 잠긴 것도 이름과 효과는 보인다 — '다음에 뭐가 열리지' 가
// 3달 뒤까지 보여야 오늘 침공 키를 쓸 이유가 된다. 순서는 고정이라 고를 것은 없다.
function renderRelics() {
  const n = RELIC.openCount(), nx = RELIC.next(), sh = RELIC.shards();
  const st = v => (Math.abs(v - Math.round(v)) < 0.05 ? String(Math.round(v)) : v.toFixed(1));
  // 지금까지 열린 효과 합계 — 같은 종류(atk 두 번 등)는 eff() 가 이미 합/곱해 준다
  const keys = [...new Set(RELIC.opened().flatMap(r => Object.keys(r.eff || {})))];
  const total = Object.fromEntries(keys.map(k => [k, +RELIC.eff(k).toFixed(3)]));
  const head = nx
    ? `<div style="background:#1b1830;border:1px solid #5a4a2a;border-radius:11px;padding:10px 11px;margin-bottom:9px">
         <div style="font-size:12px;font-weight:800">${t('relic.next')} ${nx.icon} ${nx.name}</div>
         <div style="font-size:11px;opacity:.75;margin:2px 0 6px">${RELIC.describe(nx.eff)}</div>
         <div style="height:7px;background:#0b1028;border-radius:4px;overflow:hidden">
           <div style="height:100%;width:${(RELIC.progress() * 100).toFixed(1)}%;background:linear-gradient(90deg,#c58a2e,#ffd27a)"></div></div>
         <div style="font-size:11px;opacity:.7;margin-top:4px">${t('relic.where', { sh: st(sh), cost: nx.cost })}</div>
       </div>`
    : `<div class="d" style="margin-bottom:9px">🏺 ${t('relic.allOpen', { n: RELIC.RELICS.length })}</div>`;
  const sum = keys.length
    ? `<div style="font-size:11px;opacity:.7;line-height:1.6;margin-bottom:9px">${t('relic.sum', { fx: RELIC.describe(total) })}</div>`
    : '';
  const rows = RELIC.RELICS.map((r, i) => {
    const on = i < n, isNext = i === n;
    const tag = on ? `<span style="color:#7fd07f;font-weight:800">${t('relic.owned')}</span>`
      : isNext ? `<span style="color:#ffd27a;font-weight:800">${st(sh)}/${r.cost}</span>`
      : `<span style="opacity:.6">🏺${r.cost}</span>`;
    return `<div class="mrow ${on || isNext ? '' : 'lock'}" ${isNext ? 'style="border-color:#c58a2e"' : ''}>
      <div class="ic">${r.icon}</div>
      <div class="mid"><div class="t">${i + 1}. ${r.name}</div><div class="d">${RELIC.describe(r.eff)}</div></div>
      <div style="font-size:11px;white-space:nowrap">${tag}</div>
    </div>`;
  }).join('');
  $('growBody').innerHTML = head + sum + rows;
}

// ── 연구 ─────────────────────────────────────────────────────
function renderResearch() {
  const lv = L2.researchLv(), cost = L2.researchCost();
  const running = L2.researchRunning(), ready = L2.researchReady();
  $('growBody').innerHTML =
    `<div class="gsec">
       <h3>🔬 ${t('rsch.title')} <span style="opacity:.55;font-size:12px;font-weight:600">Lv.${lv}</span></h3>
       <div class="d">${t('rsch.help', { m: L2.researchMul().toFixed(2), per: B.layer2.research.atkPerLevel })}</div>
       <div class="d" style="opacity:.85">
         ${running
           ? (ready ? `<b style="color:#7fd07f">${t('rsch.ready')}</b>`
                    : t('rsch.running', { t: secs(L2.researchLeft()) }))
           : t('rsch.next', { c: n0(cost), t: secs(L2.researchSeconds()) })}
       </div>
       <div class="gbtns">
         ${ready
           ? `<button id="rsGet" class="ok">${t('rsch.get')}<span class="c">Lv.${lv + 1}</span></button>`
           : running
             ? `<button id="rsRush" class="ad">${t('rsch.rush')}<span class="c">${t('rsch.ad')}</span></button>`
             : `<button id="rsStart" ${S.ore >= cost ? '' : 'disabled'}>${t('rsch.start')}<span class="c">🪨 ${n0(cost)}</span></button>`}
       </div>
     </div>`;
  const b1 = $('rsStart');
  if (b1) b1.onclick = () => { if (L2.startResearch()) after(); else ctx.toast(t('rsch.noOre')); };
  const b2 = $('rsGet');
  if (b2) b2.onclick = () => { if (L2.collectResearch()) { after(); ctx.toast(t('rsch.done', { n: L2.researchLv() })); } };
  const b3 = $('rsRush');
  if (b3) b3.onclick = async () => {
    if (!await playRewarded()) { ctx.toast(t('ad.notFinished')); return; }
    if (L2.rushResearch()) after();
  };
}

// ── 환생 ─────────────────────────────────────────────────────
// 플레이어가 내리는 이 게임 **유일한 전략적 결정** 이다. 그래서 "지금 누르면 뭘 얻고
// 뭘 잃는가" 를 전부 숫자로 펼쳐 놓는다. 확인 한 번을 거치게 한다 — 되돌릴 수 없다.
let presConfirm = false;

function renderPrestige() {
  const can = PR.canPrestige(), rec = PR.recommended();
  const Lgot = PR.Lpending(), Lcl = PR.Lclaimed();
  // 미리보기는 평생 기록 기준 — 환생은 기록을 넘어야 가능하고, 그 순간 이번 회차 최고 = 평생 기록이다
  const from = Math.max(S.best, S.life), target = Math.max(1, Math.floor(from * PR.warpPct()));
  const toRec = PR.floorsToRecommend();
  const big = L => (isFinite(L) ? fmt(L) : '0');
  const legacy = S.soul.Llegacy > 0
    ? `<div class="d" style="margin-top:4px;opacity:.7">${t('pres.legacy', { m: Math.pow(10, S.soul.Llegacy).toFixed(2) })}</div>` : '';

  const tree = PR.TREE.map(n => {
    const lv = PR.tlv(n.key), mx = PR.maxed(n), ok = PR.canBuy(n);
    const now = PR.nodeText(n, lv), nxt = mx ? '' : ` → <b>${PR.nodeText(n, lv + 1).replace(n.desc + ' ', '')}</b>`;
    return `<div class="mrow">
      <div class="ic">${n.icon}</div>
      <div class="mid"><div class="t">${n.name} <span style="opacity:.55;font-weight:600">Lv.${lv}${n.max !== undefined ? ' / ' + n.max : ''}</span></div>
        <div class="d">${now}${nxt}</div>
        <div class="d" style="opacity:.6">${mx ? t('pres.max') : '🌟 ' + big(PR.Lcost(n))}</div></div>
      <button data-sb="${n.key}" ${ok ? '' : 'disabled'}>+1</button>
      <button data-sbm="${n.key}" ${ok ? '' : 'disabled'}>MAX</button>
    </div>`;
  }).join('');

  $('growBody').innerHTML = `
    <div class="mdet">
      <div class="t">♻️ ${t('pres.title')} <span style="opacity:.55;font-weight:600">${t('pres.count', { n: S.lives || 0 })}</span></div>
      <div class="mabil">${t('pres.souls', { free: big(S.soul.Lfree), got: big(Lcl) })}</div>
      <div class="d" style="margin-top:6px">${t('pres.bonus', { a: PR.mulText(PR.soulMul()), b: PR.mulText(Math.pow(10, PR.LsoulBoss())), g: PR.mulText(Math.pow(10, PR.LtMul('gold'))) })}</div>
      ${legacy}
    </div>

    <div class="mdet" style="margin-top:10px;${rec ? 'border-color:#ffd34d' : ''}">
      <div class="t">${t('pres.now')} ${rec ? `<span style="color:#ffd34d;font-size:12px">${t('pres.rec')}</span>` : ''}</div>
      <div class="d">
        <div>${t('pres.gain', { n: big(Lgot) })}</div>
        <div style="opacity:.75">${t('pres.rule', { n: n0(S.life) })}
          ${rec ? t('pres.good') : t('pres.toRec', { n: n0(toRec) })}</div>
        <div style="margin-top:6px">${t('pres.warp', { st: n0(target), p: Math.round(PR.warpPct() * 100), min: Math.round(B.prestige.warp.goldSeconds / 60) })}</div>
        <div>${t('pres.echo', { st: n0(from), m: PR.echoMul() })}</div>
      </div>
      <div class="d" style="margin-top:8px;color:#ff9a9a">${t('pres.lose')}</div>
      <div class="d" style="margin-top:4px;color:#9ae6b4">${t('pres.keep')}</div>
      <div class="mbtn">
        <button id="presBtn" ${can ? '' : 'disabled'} style="${presConfirm ? 'background:#8a2f3f' : ''}">
          ${!PR.unlocked() ? t('pres.need', { n: n0(B.prestige.unlockStage) })
            : !can ? t('pres.noSoul')
            : presConfirm ? t('pres.confirm') : t('pres.go')}
        </button>
      </div>
    </div>

    <div class="mdet" style="margin-top:10px">
      <div class="t" style="display:flex;align-items:center;justify-content:space-between">${t('pres.tree')}
        <button id="soulAuto" style="font-size:11px;padding:4px 9px;border-radius:8px;border:1px solid #3d4a80;background:#1d2550;color:#cfe0ff;cursor:pointer">${t('pres.auto')}</button></div>
      <div class="d" style="opacity:.7;margin:4px 0 8px">${t('pres.treeHelp')}</div>
      ${tree}
    </div>`;

  $('growBody').querySelectorAll('[data-sb]').forEach(el => {
    el.onclick = () => { if (PR.buy(el.dataset.sb, 1)) after(); };
  });
  $('growBody').querySelectorAll('[data-sbm]').forEach(el => {
    el.onclick = () => { if (PR.buy(el.dataset.sbm, 1e6)) after(); };
  });
  $('soulAuto').onclick = () => {
    const k = PR.buyCheapest();
    if (k) { after(); ctx.toast(t('pres.autoToast', { n: k })); } else ctx.toast(t('pres.noNode'));
  };

  const btn = $('presBtn');
  if (btn) btn.onclick = () => {
    if (!presConfirm) { presConfirm = true; renderPrestige(); ctx.toast(t('pres.again')); return; }
    presConfirm = false;
    const Lps = LgoldPerSec(Math.max(1, S.best - 1));      // 리셋 **전** 최전선 수입 — 도약 골드의 기준
    const r = PR.doPrestige(Lps);
    if (!r) return;
    // 도약: 받은 골드로 강화한 뒤, 그 힘으로 넘을 수 있는 층에서 시작한다(못 넘는 층에 갇히지 않게)
    for (let i = 0; i < 4000; i++) if (!autoBuyTick(r.target, isBoss(r.target))) break;
    const st = canClear(r.target, 1) ? r.target : bestFarmStage(r.target);
    S.st = st; S.best = st;
    save();
    enterStage(st, MODE.RUN);
    ctx.onLeadChange();
    after();
    ctx.toast(t('pres.done', { n: fmt(r.Lgot), st: n0(st), from: n0(r.from), m: PR.echoMul() }));
  };
}
