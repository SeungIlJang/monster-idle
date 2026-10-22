// 성장 패널 — 광산 / 몬스터 / 마스터리 / 연구 (2단계 레이어)
// ui.js 와 순환 참조를 만들지 않으려고, 필요한 콜백은 init 으로 받는다.
import { B } from './balance.js';
import { S, save } from './state.js';
import * as L2 from './layer2.js';
import { playRewarded } from './ads.js';

const $ = id => document.getElementById(id);
let ctx = { refresh: () => {}, toast: () => {}, onLeadChange: () => {} };
export function initGrow(c) { ctx = { ...ctx, ...c }; }

let growTab = 'mine';
const GROW_TABS = [
  { k: 'mine', n: '광산', ic: '⛏️' },
  { k: 'mon', n: '몬스터', ic: '🐾' },
  { k: 'mast', n: '마스터리', ic: '🌟' },
  { k: 'res', n: '연구', ic: '🔬' },
];

const n0 = n => Math.floor(n).toLocaleString('ko-KR');
function secs(n) {
  n = Math.max(0, Math.ceil(n));
  const h = Math.floor(n / 3600), m = Math.floor((n % 3600) / 60);
  if (h) return h + '시간 ' + m + '분';
  if (m) return m + '분 ' + (n % 60) + '초';
  return n + '초';
}
const after = () => { save(); renderGrow(); ctx.refresh(); };

export function renderGrow() {
  $('growRes').innerHTML =
    `<div>🔹 조각<b>${n0(S.shard)}</b></div>
     <div>🪨 광석<b>${n0(S.ore)}</b></div>
     <div>🌟 포인트<b>${L2.masteryFree()} / ${L2.masteryPoints()}</b></div>`;

  $('growTabs').innerHTML = GROW_TABS.map(t =>
    `<div class="seg ${t.k === growTab ? 'on' : ''}" data-gt="${t.k}">${t.ic} ${t.n}</div>`).join('');
  $('growTabs').querySelectorAll('[data-gt]').forEach(el => {
    el.onclick = () => { growTab = el.dataset.gt; renderGrow(); };
  });

  if (growTab === 'mine') renderMine();
  else if (growTab === 'mon') renderMonsters();
  else if (growTab === 'mast') renderMastery();
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
       <h3>⛏️ 광산 <span style="opacity:.55;font-size:12px;font-weight:600">깊이 ${L2.depth()}m</span></h3>
       <div class="d">파인 칸에 붙은 타일만 캘 수 있습니다. 돌·광맥은 두 번 쳐야 합니다.<br>
         타일마다 <b>조각/광석 비율만</b> 다르고 곡괭이 1개당 총량은 같습니다 —
         깊이 배수 <span style="color:#8ad8ff">×${L2.depthMult().toFixed(1)}</span>.</div>
       <div class="d" style="opacity:.85">곡괭이 <span style="color:#fff">${p} / ${max}</span>${p < max ? ' · 다음 ' + secs(L2.nextPickIn()) : ' · 가득 참'}
         ${bombMode ? '<br><b style="color:#ffcf3a">폭탄 모드 — 터뜨릴 칸을 고르세요 (3×3)</b>' : ''}</div>
       <div class="mgrid">${grid}</div>
       <div class="gbtns" style="margin-top:9px">
         <button id="digAll" ${p < 1 ? 'disabled' : ''}>자동 채굴<span class="c">곡괭이 ${p}</span></button>
         <button id="digBomb" class="ad" ${bombs < 1 ? 'disabled' : ''}>${bombMode ? '취소' : '📺 폭탄'}<span class="c">${bombs}회 남음</span></button>
       </div>
       <div class="d" id="digRes" style="margin:9px 0 0"></div>
     </div>`;

  const show = r => {
    if (!r) return;
    after();
    const el = $('digRes');
    if (el) el.innerHTML = `${r.digs ?? 1}회 채굴 · 🔹 +${n0(r.shard)} · 🪨 +${n0(r.ore)}`;
  };

  $('growBody').querySelectorAll('[data-r]').forEach(el => {
    el.onclick = async () => {
      const r = +el.dataset.r, c = +el.dataset.c;
      if (bombMode) {
        bombMode = false;
        if (!await playRewarded()) { renderGrow(); ctx.toast('광고를 끝까지 봐야 보상을 받습니다'); return; }
        const res = L2.bombAt(r, c);
        if (res) show(res); else { after(); ctx.toast('폭탄을 쓸 수 없습니다'); }
        return;
      }
      if (L2.picks() < 1) { ctx.toast('곡괭이가 없습니다'); return; }
      const res = L2.digTile(r, c);
      if (res) show(res);
    };
  });
  $('digAll').onclick = () => show(L2.digAuto());
  $('digBomb').onclick = () => {
    if (bombMode) { bombMode = false; renderGrow(); return; }
    if (L2.bombLeft() < 1) { ctx.toast('오늘 폭탄을 다 썼어요'); return; }
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
  const open = m => S.best >= m.unlock;
  if (!picked || !L2.MONSTERS.some(m => m.key === picked)) picked = S.mon;

  const tiles = L2.MONSTERS.map(m => {
    const o = open(m), lv = L2.monLevel(m.key), lead = S.mon === m.key;
    return `<div class="mtile ${o ? '' : 'lock'} ${picked === m.key ? 'on' : ''}" data-pick="${m.key}">
      <img src="assets/mon/${m.key}/idle_1.png" alt="">
      ${lead ? '<span class="lead">선두</span>' : ''}
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

  $('growBody').innerHTML = `
    <div class="mgrid">${tiles}</div>
    <div class="mdet">
      <div class="t">${o ? m.name : '???'} <span style="opacity:.55;font-weight:600">Lv.${lv}</span></div>
      ${abil ? `<div class="mabil"><b>${abil.name}</b> ${abil.desc}</div>` : ''}
      <div class="d">${o
        ? '마일스톤 ' + miles + ' · 다음 레벨 🔹' + n0(cost)
        : '<b>스테이지 ' + m.unlock + '</b> 도달 시 해금'}</div>
      ${o ? `<div class="mbtn">
          <button data-lead="${m.key}" class="${lead ? 'sel' : ''}" ${lead ? 'disabled' : ''}>${lead ? '선두' : '선두로'}</button>
          <button data-lvup="${m.key}" ${can ? '' : 'disabled'}>+1 <span class="c">🔹${n0(cost)}</span></button>
          <button data-lvmax="${m.key}" ${can ? '' : 'disabled'}>MAX</button>
        </div>` : ''}
    </div>
    <div class="d" style="font-size:11px;opacity:.65;line-height:1.6;margin-top:10px">
      몬스터 레벨 1당 마스터리 포인트 1. <b>포인트는 전 몬스터 공용</b>이라 여러 마리를 키우는 게 이득입니다.<br>
      마일스톤(${L2.MILESTONES.join('·')})마다 전체 공격력 +${B.layer2.collect.milestoneAtkPct}%.
    </div>`;

  $('growBody').querySelectorAll('[data-pick]').forEach(el => {
    el.onclick = () => { picked = el.dataset.pick; renderMonsters(); };
  });
  $('growBody').querySelectorAll('[data-lead]').forEach(el => {
    el.onclick = () => {
      S.mon = el.dataset.lead;
      ctx.onLeadChange();
      after();
      ctx.toast(L2.MONSTERS.find(x => x.key === S.mon).name + ' 선두로');
    };
  });
  $('growBody').querySelectorAll('[data-lvup]').forEach(el => {
    el.onclick = () => { if (L2.levelUpMonster(el.dataset.lvup, 1)) after(); else ctx.toast('조각 부족'); };
  });
  $('growBody').querySelectorAll('[data-lvmax]').forEach(el => {
    el.onclick = () => { if (L2.levelUpMonsterMax(el.dataset.lvmax)) after(); else ctx.toast('조각 부족'); };
  });
}

// ── 마스터리 ─────────────────────────────────────────────────
function renderMastery() {
  const free = L2.masteryFree();
  const nodes = L2.MASTERY_NODES.map(nd => {
    const lv = S.mastery[nd.key] || 0;
    const now = L2.masteryMul(nd.key);
    const next = now * B.layer2.mastery.perPoint;
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
       남은 포인트 <b style="color:#8ad8ff">${free}</b> / 총 ${L2.masteryPoints()}.
       노드는 <b>승산</b>이라 레벨이 쌓일수록 복리로 붙습니다.
     </div>` + nodes +
    `<button id="mReset" style="width:100%;margin-top:8px;background:#3a2030;color:#ffb4b4;
       border:1px solid #6a3545;border-radius:10px;padding:9px;font-size:12px;font-weight:700;cursor:pointer">
       포인트 되돌리기 <span style="opacity:.8">💎${L2.masteryResetCost()}</span></button>`;
  $('growBody').querySelectorAll('[data-mp]').forEach(el => {
    el.onclick = () => { if (L2.spendMastery(el.dataset.mp, 1)) after(); };
  });
  $('growBody').querySelectorAll('[data-mp10]').forEach(el => {
    el.onclick = () => { if (L2.spendMastery(el.dataset.mp10, 10)) after(); };
  });
  $('mReset').onclick = () => {
    if (L2.masterySpent() < 1) { ctx.toast('되돌릴 포인트가 없습니다'); return; }
    if (S.gem < L2.masteryResetCost()) { ctx.toast(`젬이 부족합니다 (💎${L2.masteryResetCost()})`); return; }
    if (L2.resetMastery()) { after(); ctx.toast('포인트를 모두 되돌렸습니다'); }
  };
}

// ── 연구 ─────────────────────────────────────────────────────
function renderResearch() {
  const lv = L2.researchLv(), cost = L2.researchCost();
  const running = L2.researchRunning(), ready = L2.researchReady();
  $('growBody').innerHTML =
    `<div class="gsec">
       <h3>🔬 연구 <span style="opacity:.55;font-size:12px;font-weight:600">Lv.${lv}</span></h3>
       <div class="d">광석을 쓰고 시간을 기다립니다. 공격력 ×${L2.researchMul().toFixed(2)} (레벨당 ×${B.layer2.research.atkPerLevel}).<br>
         광석과 시간 <b>둘 다</b>가 게이트라 돈으로 건너뛸 수 없습니다.</div>
       <div class="d" style="opacity:.85">
         ${running
           ? (ready ? '<b style="color:#7fd07f">연구 완료 — 수령하세요</b>'
                    : '진행 중 · 남은 시간 <span style="color:#fff">' + secs(L2.researchLeft()) + '</span>')
           : '다음 연구 🪨 ' + n0(cost) + ' · 소요 ' + secs(L2.researchSeconds())}
       </div>
       <div class="gbtns">
         ${ready
           ? '<button id="rsGet" class="ok">수령<span class="c">Lv.' + (lv + 1) + '</span></button>'
           : running
             ? '<button id="rsRush" class="ad">📺 30분 단축<span class="c">광고</span></button>'
             : '<button id="rsStart" ' + (S.ore >= cost ? '' : 'disabled') + '>연구 시작<span class="c">🪨 ' + n0(cost) + '</span></button>'}
       </div>
     </div>`;
  const b1 = $('rsStart');
  if (b1) b1.onclick = () => { if (L2.startResearch()) after(); else ctx.toast('광석 부족'); };
  const b2 = $('rsGet');
  if (b2) b2.onclick = () => { if (L2.collectResearch()) { after(); ctx.toast('🔬 연구 Lv.' + L2.researchLv()); } };
  const b3 = $('rsRush');
  if (b3) b3.onclick = async () => {
    if (!await playRewarded()) { ctx.toast('광고를 끝까지 봐야 보상을 받습니다'); return; }
    if (L2.rushResearch()) after();
  };
}
