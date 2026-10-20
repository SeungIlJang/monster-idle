// HUD + 패널. 강화 패널이 1단계의 핵심 화면이다.
import { B, STAT_KEYS, chapterLabel, perWave } from './balance.js';

import { S, save, wipe } from './state.js';
import { R, retry, enterStage, toughness, MODE } from './combat.js';
import { Lcost, LcostN, Lval, nval, unlocked, maxed, affordable, buy, bestBuy, LDPS, LHP, LDEF } from './stats.js';
import { preloadFor } from './render.js';
import * as G from './gacha.js';
import * as DUN from './dungeon.js';
import * as DQ from './daily.js';
import * as L2 from './layer2.js';
import { playRewarded } from './ads.js';
import { initGrow, renderGrow } from './ui-grow.js';
import { initGacha, renderGacha } from './ui-gacha.js';
import { fmt, L0, ratio } from './logmath.js';

const $ = id => document.getElementById(id);
let tab = 'battle';
let buyMode = 1;        // 1 | 10 | 'max'

export function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('on'), 1500);
}

// ── 스탯 표시값 ──────────────────────────────────────────────
function statValueText(k) {
  const d = B.stats[k];
  if (d.kind === 'mul') {
    if (k === 'def') return '피해 ÷' + fmt(Lval(k));
    return fmt(Lval(k));
  }
  const v = nval(k);
  if (d.unit === 'pct') return (v * 100).toFixed(1) + '%';
  if (d.unit === 'persec') return v.toFixed(2) + '/초';
  if (d.unit === 'mul') return '×' + v.toFixed(2);
  return v.toFixed(2);
}

function lockText(k) {
  const d = B.stats[k];
  if (d.reqStage) return '스테이지 ' + d.reqStage + ' 도달 시 해금';
  if (d.req) return B.stats[d.req[0]].name + ' Lv.' + d.req[1] + ' 달성 시 해금';
  return '잠김';
}

// ── 강화 패널 ────────────────────────────────────────────────
function renderUpgrade() {
  const rec = bestBuy(R.stage, R.boss);
  // 구매 단위 선택을 목록 맨 위에 붙인다 (예전엔 강화 탭 안에 있었다)
  const bar = `<div class="bar">` + [1, 10, 'max'].map(m =>
    `<div class="seg ${buyMode === m ? 'on' : ''}" data-bm="${m}">${m === 'max' ? 'MAX' : '×' + m}</div>`).join('') + `</div>`;
  const rows = STAT_KEYS.map(k => {
    const d = B.stats[k];
    if (!unlocked(k)) {
      return `<div class="row lock"><div class="ic">🔒</div><div class="mid">
        <div class="t">${d.name}</div><div class="d" style="font-weight:600;opacity:.6;font-size:11px">${lockText(k)}</div></div>
        <div class="buyBtn"><div class="lbl">🔒</div></div></div>`;
    }
    if (maxed(k)) {
      return `<div class="row max"><div class="ic">${d.icon}<b>MAX</b></div><div class="mid">
        <div class="t">${d.name}</div><div class="d">${statValueText(k)}</div></div>
        <div class="buyBtn"><div class="lbl">완료</div></div></div>`;
    }
    const n = buyMode === 'max' ? affordable(k) : buyMode;
    const have = affordable(k) >= Math.min(n, 1) && affordable(k) > 0;
    const payN = Math.max(1, Math.min(n || 1, affordable(k) || 1));
    const Lc = buyMode === 1 ? Lcost(k) : LcostN(k, payN);
    const can = Lc <= S.Lg;
    const star = rec && rec.key === k ? '<span class="rec">추천</span>' : '';
    return `<div class="row ${can ? 'can' : 'cant'}" data-k="${k}">
      <div class="ic">${d.icon}<b>LV ${S.lv[k]}</b></div>
      <div class="mid">
        <div class="t">${d.name}${star}</div>
        <div class="d">${statValueText(k)}</div>
      </div>
      <div class="buyBtn">
        <div class="lbl">강화 ${buyMode === 'max' ? '×' + (affordable(k) || 0) : '×' + buyMode}</div>
        <div class="cost">🪙 ${fmt(Lc)}</div>
      </div></div>`;
  }).join('');

  $('mainUpg').innerHTML = bar + rows;
  $('mainUpg').querySelectorAll('[data-k]').forEach(el => {
    el.onclick = () => {
      const k = el.dataset.k;
      const n = buyMode === 'max' ? affordable(k) : buyMode;
      const got = buy(k, Math.max(1, n));
      if (got > 0) { save(); refresh(); }
      else toast('골드 부족');
    };
  });
  $('mainUpg').querySelectorAll('[data-bm]').forEach(el => {
    el.onclick = () => { buyMode = el.dataset.bm === 'max' ? 'max' : +el.dataset.bm; renderUpgrade(); };
  });
}

// ── 던전 패널 ────────────────────────────────────────────────
const dSel = {};                 // 던전별 선택 난이도
const dRes = {};                 // 던전별 마지막 결과

function renderDungeon() {
  if (!DUN.unlocked()) {
    $('dunList').innerHTML = '<div class="note">스테이지 10 에 도달하면 던전이 열립니다.</div>';
    return;
  }
  $('dunList').innerHTML = DUN.DUNGEONS.map(d => {
    const maxD = DUN.maxDiff(d.key);
    const cur = Math.min(dSel[d.key] ?? maxD, maxD);
    dSel[d.key] = cur;
    const keys = DUN.keysLeft(d.key), ads = DUN.adLeft(d.key);
    const r = dRes[d.key];
    return `<div class="dcard">
      <h3>${d.icon} ${d.name}</h3>
      <div class="d">${d.desc}<br>보상: ${d.reward}</div>
      <div class="drow">
        <span class="k">🗝️ 키 ${keys} / ${B.dungeon.keysPerDay}</span>
        <span class="k">📺 광고 ${ads} / ${B.dungeon.adRunsPerDay}</span>
        <span style="opacity:.5">최고 난이도 ${DUN.clearedDiff(d.key)}</span>
      </div>
      <div class="dlv">
        <button data-dd="${d.key}" ${cur <= 1 ? 'disabled' : ''}>−</button>
        <div class="cur">난이도 ${cur}<small>기준 스테이지 ${DUN.diffStage(cur)}</small></div>
        <button data-du="${d.key}" ${cur >= maxD ? 'disabled' : ''}>+</button>
      </div>
      <div class="dbtn">
        <button data-dk="${d.key}" ${keys < 1 ? 'disabled' : ''}>입장<span class="c">🗝️ 키 1개</span></button>
        <button class="ad" data-da="${d.key}" ${ads < 1 ? 'disabled' : ''}>📺 추가 입장<span class="c">${ads}회 남음</span></button>
      </div>
      ${r ? `<div class="dres">${r}</div>` : ''}
    </div>`;
  }).join('');

  const run = async (k, useAd) => {
    if (useAd) {
      if (DUN.adLeft(k) < 1) { toast('오늘 추가 입장을 다 썼어요'); return; }
      if (!await playRewarded()) { toast('광고를 끝까지 봐야 보상을 받습니다'); return; }
    }
    const res = DUN.enter(k, dSel[k], useAd);
    if (!res) { toast('입장할 수 없습니다'); return; }
    if (k === 'boss') {
      dRes[k] = `용사 <b>${res.killed}/${res.total}</b>명 격파 · ${res.seconds.toFixed(1)}초`
        + (res.died ? ' · <span style="color:#ff8a8a">쓰러짐</span>' : res.full ? ' · <span style="color:#7fd07f">완전 클리어!</span>' : ' · 시간 초과')
        + `<br>획득 💎 <b>${res.gem}</b>`
        + (res.full ? ' · 다음 난이도 해금' : '');
    } else {
      dRes[k] = `수레 <b>${(res.frac * 100).toFixed(0)}%</b> 파괴`
        + (res.full ? ' · <span style="color:#7fd07f">완파! 다음 난이도 해금</span>' : '')
        + `<br>획득 🪙 <b>${fmt(res.Lgold)}</b>`;
    }
    save(); renderDungeon(); refresh();
  };
  $('dunList').querySelectorAll('[data-dd]').forEach(el => el.onclick = () => { dSel[el.dataset.dd]--; renderDungeon(); });
  $('dunList').querySelectorAll('[data-du]').forEach(el => el.onclick = () => { dSel[el.dataset.du]++; renderDungeon(); });
  $('dunList').querySelectorAll('[data-dk]').forEach(el => el.onclick = () => run(el.dataset.dk, false));
  $('dunList').querySelectorAll('[data-da]').forEach(el => el.onclick = () => run(el.dataset.da, true));
}

// ── 일일 패널 ────────────────────────────────────────────────
function renderDaily() {
  const qs = DQ.questState();
  const quests = qs.map(q => {
    const pct = Math.min(100, (q.cur / q.goal) * 100);
    const btn = q.claimed ? '<span style="color:#7fd07f;font-weight:800;font-size:12px">✓ 완료</span>'
      : q.done ? `<button data-q="${q.id}">받기</button>`
      : `<span style="opacity:.5;font-size:11px">${q.cur}/${q.goal}</span>`;
    return `<div class="qrow ${q.claimed ? 'claimed' : q.done ? 'done' : ''}">
      <div class="ic">${q.icon}</div>
      <div class="mid"><div class="t">${q.name}</div>
        <div class="qbar"><i style="width:${pct}%"></i></div>
        <div class="d">보상 💎 ${q.gem}</div></div>
      <div>${btn}</div></div>`;
  }).join('');

  const pend = DQ.pendingAttend();
  const dayIdx = DQ.attendDayIndex();
  const cal = DQ.ATTEND_CYCLE.map((g, i) => {
    const n = i + 1;
    const cls = pend ? (n < dayIdx ? 'past' : n === dayIdx ? 'now' : '') : (n <= dayIdx ? 'past' : '');
    return `<div class="${cls}">${n}일<b>${g}</b></div>`;
  }).join('');

  $('dailyList').innerHTML =
    `<div class="note">자정에 초기화됩니다. 젬은 가챠에 씁니다.</div>`
    + quests
    + `<div style="font-size:13px;font-weight:800;margin:14px 0 2px">🎁 출석 보상</div>
       <div class="note" style="margin-bottom:0">연속 ${S.attend.streak || 0}일째${pend ? ' · 오늘 받을 수 있어요' : ' · 오늘은 받았어요'}</div>
       <div class="acal">${cal}</div>
       ${pend ? `<button id="attBtn" style="width:100%;border:none;border-radius:11px;background:#ffcf3a;color:#2a1e00;font-weight:800;padding:12px;font-size:14px;cursor:pointer">${pend.day}일차 보상 받기 · 💎 ${pend.gem}</button>` : ''}`;

  $('dailyList').querySelectorAll('[data-q]').forEach(el => el.onclick = () => {
    const g = DQ.claimQuest(el.dataset.q);
    if (g) { save(); renderDaily(); refresh(); toast('💎 ' + g + ' 획득'); }
  });
  const ab = $('attBtn');
  if (ab) ab.onclick = () => {
    const p = DQ.claimAttend();
    if (p) { save(); renderDaily(); refresh(); toast(`${p.day}일차 출석 · 💎 ${p.gem} 획득`); }
  };
}

// ── HUD ──────────────────────────────────────────────────────
export function refresh() {
  $('hStage').textContent = chapterLabel(R.stage) + (R.boss ? ' 👑' : '');
  $('hBest').textContent = S.best;
  $('hGold').textContent = fmt(S.Lg);
  $('hGem').textContent = S.gem;
  // 전투력(DPS×HP×방어)은 합성 수치라 플레이어에게 의미가 없었다 — DPS 로 바꿨다
  $('hPow').textContent = fmt(LDPS(false));

  const tg = toughness();
  const slow = tg.need > B.player.giveUpSeconds;
  $('mode').textContent = R.mode === MODE.FARM ? '파밍 중' : '도전 중';
  $('mode').className = R.mode === MODE.FARM ? 'farm' : 'run';
  $('retryBtn').style.display = R.mode === MODE.FARM ? '' : 'none';
  // 깊은 스테이지에서는 need 가 천문학적 숫자가 되므로 그대로 찍지 않는다
  let needTxt = '';
  if (slow) {
    const mins = tg.need / 60;
    needTxt = mins > 600 ? '지금 전투력으로는 사실상 불가능합니다 — 강화가 더 필요해요'
      : '이 스테이지는 약 ' + Math.round(mins) + '분 걸립니다 — 강화를 더 하세요';
  }
  $('hint').textContent = needTxt;

  // 강화 목록은 메인 화면에 상시 노출된다 — 골드가 계속 늘어 구매 가능 여부가 바뀌므로 매 틱 갱신.
  // 나머지 패널은 사용자 조작으로만 바뀌므로 탭을 열 때와 조작 직후에만 그린다.
  if (tab === 'battle') renderUpgrade();

  // 스테이지 진행바
  const per = R.boss ? 1 : perWave(R.stage);
  const waves = R.boss ? 1 : B.stage.waves;
  const alive = R.enemies.filter(e => e.Lhp > -Infinity).length;
  const killed = R.waveIdx * per + (per - alive);
  const prog = Math.max(0, Math.min(1, killed / (per * waves)));
  $('sProg').style.width = (prog * 100).toFixed(1) + '%';
  $('sName').textContent = B.zones.list[Math.floor((R.stage - 1) / B.stage.bossEvery) % B.zones.list.length].name;
  $('sNum').textContent = chapterLabel(R.stage);
  $('sIcon').textContent = R.boss ? '👑' : '🚩';
  // 융합 가능한 묶음이 있으면 탭에 점을 띄운다
  const gd = $('gDot');
  if (gd) gd.style.display = G.BANNERS.some(b => G.hasFusable(b.key)) ? 'block' : 'none';
  const qd = $('qDot');
  if (qd) qd.style.display = DQ.totalClaimable() > 0 ? 'block' : 'none';
  const dd = $('dDot');
  if (dd) dd.style.display = DUN.unlocked() && DUN.DUNGEONS.some(d => DUN.keysLeft(d.key) > 0) ? 'block' : 'none';
  const gr = $('grDot');
  if (gr) gr.style.display = (L2.picks() >= L2.pickMax() || L2.masteryFree() > 0 || L2.researchReady()) ? 'block' : 'none';
}

// ── 탭 ───────────────────────────────────────────────────────
const PANEL_RENDER = {
  upg: renderUpgrade, gacha: renderGacha, dun: renderDungeon,
  daily: renderDaily, grow: renderGrow,
};
function setTab(name) {
  tab = name;
  for (const el of document.querySelectorAll('.nav')) el.classList.toggle('on', el.dataset.t === name);
  for (const el of document.querySelectorAll('.panel')) el.classList.remove('on');
  if (name !== 'battle') $('p_' + name)?.classList.add('on');
  PANEL_RENDER[name]?.();      // 탭을 열 때 한 번 그린다 (이후는 조작할 때만)
  refresh();
}

export function initUI() {
  for (const el of document.querySelectorAll('.nav')) el.onclick = () => setTab(el.dataset.t);
  for (const el of document.querySelectorAll('[data-close]')) el.onclick = () => setTab('battle');
  for (const m of [1, 10, 'max']) {
    const el = $('bm_' + m);
    if (el) el.onclick = () => { buyMode = m; renderUpgrade(); };
  }
  initGrow({ refresh, toast, onLeadChange: () => preloadFor(R.stage) });
  initGacha({ refresh, toast });
  $('retryBtn').onclick = () => { retry(); refresh(); };
  const wb = $('wipeBtn');
  if (wb) wb.onclick = () => {
    if (confirm('정말 처음부터 다시 시작할까요? 이 기기의 저장 데이터가 사라집니다.')) {
      wipe();
      location.reload();
    }
  };
  setTab('battle');
}
