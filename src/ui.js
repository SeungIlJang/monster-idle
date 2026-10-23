// HUD + 패널. 강화 패널이 1단계의 핵심 화면이다.
import { B, STAT_KEYS, chapterLabel, perWave, zoneAt } from './balance.js';

import { S, save, wipe } from './state.js';
import { R, retry, enterStage, toughness, MODE, AUTO_RETRY_CLEARS } from './combat.js';
import { Lcost, LcostN, Lval, nval, unlocked, maxed, affordable, buy, bestBuy, canClear, LDPS, LHP, LDEF } from './stats.js';
import { preloadFor } from './render.js';
import * as G from './gacha.js';
import * as DUN from './dungeon.js';
import * as DQ from './daily.js';
import * as L2 from './layer2.js';
import { playRewarded } from './ads.js';
import { initGrow, renderGrow } from './ui-grow.js';
import { initGacha, renderGacha } from './ui-gacha.js';
import { renderRoad } from './ui-road.js';
import { nextMilestone } from './unlocks.js';
import * as sfx from './audio.js';
import * as EV from './events.js';
import { fmt, L0, ratio } from './logmath.js';

const $ = id => document.getElementById(id);
const n0 = n => Math.floor(n).toLocaleString('ko-KR');
let tab = 'battle';
let buyMode = 1;        // 1 | 10 | 'max'
let lastGoal = '';      // 목표 띠 — 바뀔 때만 다시 그린다

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
      // 성공했을 때만 울린다. 길게 누르기 연타는 audio.js 가 250ms 로 막는다.
      if (got > 0) { sfx.upgrade(); save(); refresh(); }
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

  // ── 기간 이벤트 (열려 있을 때만) ──
  const ev = EV.activeEvent();
  let evHtml = '';
  if (ev) {
    const p = EV.points(), track = EV.trackState();
    const last = track[track.length - 1];
    const prog = Math.min(1, p / last.at);
    const days = Math.ceil(EV.msLeft() / 86400000);
    evHtml = `<div class="evBox" style="--ec:${ev.color}">
      <div class="evTop"><b>${ev.icon} ${ev.name}</b><span>${days}일 남음</span></div>
      <div class="evBar"><i style="width:${(prog * 100).toFixed(1)}%"></i></div>
      <div class="evPt">${n0(p)} / ${n0(last.at)} 포인트 · 일일퀘스트와 출석으로 모읍니다</div>
      <div class="evTrack">${track.map(t => `
        <div class="evStep ${t.claimed ? 'done' : t.reached ? 'open' : ''}" data-ev="${t.i}">
          <div class="s">${n0(t.at)}</div>
          <div class="g">💎${n0(t.gem)}</div>
          ${t.claimed ? '<div class="chk">✓</div>' : ''}
        </div>`).join('')}</div>
    </div>`;
  }

  $('dailyList').innerHTML = evHtml +
    `<div class="note">자정에 초기화됩니다. 젬은 뽑기에 씁니다.</div>`
    + quests
    + `<div style="font-size:13px;font-weight:800;margin:14px 0 2px">🎁 출석 보상</div>
       <div class="note" style="margin-bottom:0">연속 ${S.attend.streak || 0}일째${pend ? ' · 오늘 받을 수 있어요' : ' · 오늘은 받았어요'}</div>
       <div class="acal">${cal}</div>
       ${pend ? `<button id="attBtn" style="width:100%;border:none;border-radius:11px;background:#ffcf3a;color:#2a1e00;font-weight:800;padding:12px;font-size:14px;cursor:pointer">${pend.day}일차 보상 받기 · 💎 ${pend.gem}</button>` : ''}`
    + `<div style="font-size:13px;font-weight:800;margin:18px 0 2px">🔊 소리</div>
       <div class="sndRow">
         <button id="sndMute">${sfx.muted() ? '🔇 꺼짐' : '🔊 켜짐'}</button>
         <input id="sndVol" type="range" min="0" max="100" step="5" value="${Math.round(sfx.volume() * 100)}" ${sfx.muted() ? 'disabled' : ''}>
         <span id="sndPct">${Math.round(sfx.volume() * 100)}%</span>
       </div>
       <div class="note" style="margin-top:4px">설정은 저장되어 다음 실행에도 유지됩니다.</div>`;

  $('dailyList').querySelectorAll('[data-ev]').forEach(el => el.onclick = () => {
    const g = EV.claimStep(+el.dataset.ev);
    if (g) { sfx.gachaResult(1); save(); renderDaily(); refresh(); toast('💎 ' + n0(g) + ' 획득'); }
  });
  $('dailyList').querySelectorAll('[data-q]').forEach(el => el.onclick = () => {
    const g = DQ.claimQuest(el.dataset.q);
    if (g) { save(); renderDaily(); refresh(); toast('💎 ' + g + ' 획득'); }
  });
  const ab = $('attBtn');
  if (ab) ab.onclick = () => {
    const p = DQ.claimAttend();
    if (p) { save(); renderDaily(); refresh(); toast(`${p.day}일차 출석 · 💎 ${p.gem} 획득`); }
  };
  // 소리 설정 — 게임 세이브가 아니라 audio.js 의 별도 키에 저장된다(진행 데이터를 건드리지 않는다)
  $('sndMute').onclick = () => { sfx.toggleMute(); renderDaily(); };
  $('sndVol').oninput = e => {
    sfx.setVolume(e.target.value / 100);
    $('sndPct').textContent = e.target.value + '%';
  };
  // 슬라이더를 놓을 때 한 번 들려준다 — 숫자만 보고는 크기를 알 수 없다
  $('sndVol').onchange = () => sfx.upgrade();
}

// ── HUD ──────────────────────────────────────────────────────
export function refresh() {
  $('hStage').textContent = chapterLabel(R.stage) + (R.boss ? ' 👑' : '');
  $('hBest').textContent = S.life;      // 영구 최고 기록
  $('hGold').textContent = fmt(S.Lg);
  $('hGem').textContent = S.gem;
  // 전투력(DPS×HP×방어)은 합성 수치라 플레이어에게 의미가 없었다 — DPS 로 바꿨다
  $('hPow').textContent = fmt(LDPS(false));
  $('hSpd').textContent = '×' + (S.spd || 1);
  $('spdCell').classList.toggle('on', S.spd === 2);

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
  // 파밍 중이라면 **왜 여기 있는지** 가 먼저다. 측정해 보니 첫 1시간의 45%가 파밍인데
  // 그동안 화면에는 "파밍 중" 세 글자뿐이었다 — 같은 곳을 도는 이유도 언제 끝나는지도
  // 안 보이니 반복이 그냥 정체로 읽힌다.
  //
  // 전투력 비율(canClear 의 생존여유)을 퍼센트로 보여줬다가 뺐다. 자동 재도전은
  // canClear 가 아직 false 여도 3판이면 한 번 찔러보므로(그쪽이 보수적이라서),
  // "준비 42%" 라고 써 놓고 재도전이 나가 버린다. 남은 판 수는 반드시 맞는 숫자다.
  if (R.mode === MODE.FARM) {
    const left = Math.max(0, AUTO_RETRY_CLEARS - (R.farmClears || 0));
    needTxt = canClear(S.st) || left === 0
      ? chapterLabel(S.st) + ' 재도전 준비 완료'
      : chapterLabel(S.st) + ' 재도전까지 ' + left + '판';
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
  const total = per * waves;
  const prog = Math.max(0, Math.min(1, killed / total));
  $('sProg').style.width = (prog * 100).toFixed(1) + '%';
  $('sName').textContent = zoneAt(R.stage).name;
  // 숫자로도 보여준다 — 30~60분 구간은 한 판이 약 250초라, 진행바가 한 칸 차는 데
  // 30초가 걸린다. 몇 마리 중 몇 번째인지 보이면 같은 4분도 "진행" 으로 읽힌다.
  $('sWave').textContent = R.boss ? '보스전'
    : `웨이브 ${Math.min(R.waveIdx + 1, waves)}/${waves} · ${killed}/${total}`;
  $('sNum').textContent = chapterLabel(R.stage);
  $('sIcon').textContent = R.boss ? '👑' : '🚩';

  // 다음 목표 — 로드맵은 눌러야 나오니 한 줄만 상시로 꺼내 둔다.
  // "왜 계속 내려가야 하는가" 에 대한 답이 화면에 항상 있어야 한다.
  const nm = nextMilestone();
  const goal = nm
    ? `${nm.ic} ${nm.what} <em>${nm.at - S.life}층 남음 ›</em>`
    : '🏅 해금 완료 — 최고 기록에 도전 중 <em>›</em>';
  if (goal !== lastGoal) { $('sGoal').innerHTML = goal; lastGoal = goal; }  // 초당 4번 파싱하지 않는다
  // 융합 가능한 묶음이 있으면 탭에 점을 띄운다
  const gd = $('gDot');
  if (gd) gd.style.display = G.BANNERS.some(b => G.hasFusable(b.key)) ? 'block' : 'none';
  const qd = $('qDot');
  if (qd) qd.style.display = (DQ.totalClaimable() + EV.claimable()) > 0 ? 'block' : 'none';
  const dd = $('dDot');
  if (dd) dd.style.display = DUN.unlocked() && DUN.DUNGEONS.some(d => DUN.keysLeft(d.key) > 0) ? 'block' : 'none';
  const gr = $('grDot');
  if (gr) gr.style.display = (L2.picks() >= L2.pickMax() || L2.masteryFree() > 0 || L2.researchReady()) ? 'block' : 'none';
}

// ── 탭 ───────────────────────────────────────────────────────
const PANEL_RENDER = {
  upg: renderUpgrade, gacha: renderGacha, dun: renderDungeon,
  daily: renderDaily, grow: renderGrow, road: renderRoad,
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
  // 스테이지 바를 누르면 해금 로드맵 — 월드맵 자리에 해당한다
  const sb = $('stageBar');
  if (sb) sb.onclick = () => setTab(tab === 'road' ? 'battle' : 'road');
  // 배속 — 방치형에서 가장 자주 눌리는 버튼인데 없었다.
  // 공짜로 둔다. 시뮬상 상시 ×2 가 30일 +3.8% / 365일 +2.1% 라 체감용이지 힘이 아니다
  // (곡선이 로그라 처리량을 2배로 올려도 스테이지는 상수만큼만 오른다).
  const sc = $('spdCell');
  if (sc) sc.onclick = () => { S.spd = S.spd === 2 ? 1 : 2; save(); refresh(); };
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
