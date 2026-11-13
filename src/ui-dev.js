// 개발자 모드 — 성장 패널 맨 위 제목(🌱 성장)을 눌러 연다. 비밀번호를 넣어야 들어간다.
//
// **이 비밀번호는 보안이 아니다.** 클라이언트 코드에 그대로 들어 있어서 소스를 열면 보인다.
// 막으려는 건 "실수로 눌러서 세이브가 바뀌는 것" 이지 작정하고 들어오는 사람이 아니다.
// 세이브가 애초에 localStorage 라 브라우저 콘솔로 얼마든지 고칠 수 있고, 서버도 없다.
// 그러니 여기에 진짜 보호가 필요한 값(결제·랭킹)은 두지 않는다.
//
// 값을 바꾸면 **표시가 남는다**(패널 상단 경고). 개발용으로 올린 세이브를 실제 플레이 기록과
// 헷갈리면 밸런스 판단이 통째로 틀어지기 때문이다 — 시뮬 수치와 대조할 때 특히 그렇다.
//
// 탭: 자원 · 진행 · 전투 · 몬스터 · 강화 · 뽑기 · 성장 · 일일·시간 · 세이브
// 전투 스위치(무적·피해 배수·배속·광고 건너뛰기·이벤트 강제)는 dev-flags.js 에 있고 **저장하지 않는다**.
// 이 파일은 개발 전용이라 언어팩을 쓰지 않는다(tools/find-ko.mjs 의 ALLOW).
import { B, STAT_KEYS, isBoss, gateCfg, chapterLabel } from './balance.js';
import { S, save, wipe, holdSaveTime, reviveNumbers } from './state.js';
import { fmt, L0, ratio } from './logmath.js';
import { R, enterStage, MODE, devKillAll, retry, enrage } from './combat.js';
import { LDPS, LHP, autoBuyTick, canClear, bestFarmStage } from './stats.js';
import * as L2 from './layer2.js';
import * as G from './gacha.js';
import * as MINE from './mine.js';
import * as PR from './prestige.js';
import * as RL from './relics.js';
import * as DUN from './dungeon.js';
import * as DAILY from './daily.js';
import * as EV from './events.js';
import { LgoldPerSec, pendingOffline, claimOffline } from './offline.js';
import { monTier } from './companions.js';
import { DEV } from './dev-flags.js';

const $ = id => document.getElementById(id);
const PASS = '799879';
const BAK = 'monsteridle.devbak';      // 개발자 모드 백업 슬롯 (세이브 키와 따로)
let ctx = { refresh: () => {}, toast: () => {}, redraw: () => {}, onLeadChange: () => {} };
let open = false;          // 이번 실행에서 비밀번호를 통과했는가 (새로고침하면 다시 묻는다)
let tab = 'res';
let liveTimer = 0;

export function initDev(c) {
  ctx = { ...ctx, ...c };
  const btn = $('devKey');
  if (btn) btn.onclick = () => (open ? showPanel() : showGate());
  $('devClose').onclick = close;
  $('devOv').onclick = e => { if (e.target.id === 'devOv') close(); };
}

function close() {
  clearInterval(liveTimer);
  $('devOv').classList.remove('on');
}

// ── 비밀번호 ─────────────────────────────────────────────────
function showGate() {
  $('devOv').classList.add('on');
  $('devBody').innerHTML = `
    <h3>🔒 개발자 모드</h3>
    <div class="sub">비밀번호를 입력하세요</div>
    <input id="devPass" type="password" inputmode="numeric" autocomplete="off" placeholder="● ● ● ● ● ●">
    <div class="devErr" id="devErr"></div>
    <button id="devGo">확인</button>`;
  const inp = $('devPass');
  const tryIt = () => {
    if (inp.value === PASS) { open = true; showPanel(); return; }
    $('devErr').textContent = '비밀번호가 다릅니다';
    inp.value = '';
    inp.focus();
  };
  $('devGo').onclick = tryIt;
  inp.onkeydown = e => { if (e.key === 'Enter') tryIt(); };
  setTimeout(() => inp.focus(), 50);
}

// ── 공용 조각 ────────────────────────────────────────────────
// 입력칸은 "지금 값" 으로 채워 둔다. 빈 칸으로 두고 적은 것만 반영하는 방식은
// 실수로 0 을 넣기 쉽다 — 채워 두면 안 건드린 항목이 그대로 간다는 게 눈에 보인다.
const num = v => (Number.isFinite(v) ? v : 0);
const n0 = v => Math.floor(num(v)).toLocaleString('ko-KR');

/** 골드처럼 자릿수가 큰 값을 사람이 읽고 쓰는 표기로 (1.2e15) */
const bigOut = L => (L === L0 || !Number.isFinite(L) ? '0' : L < 15
  ? String(Math.round(Math.pow(10, L))) : `${Math.pow(10, L % 1).toFixed(2)}e${Math.floor(L)}`);
/** "1e30" · "1000" · "1.5e9" · "1e5000" 을 log10 으로. 못 읽으면 null */
function bigIn(s) {
  const t = String(s).trim().replace(/[, ]/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(?:e\+?(\d+))?$/i);
  if (!m) return null;
  const mant = Number(m[1]);
  if (mant === 0) return L0;
  return Math.log10(mant) + (m[2] ? Number(m[2]) : 0);   // 1e5000 도 log 로 바로 — Number 로는 Infinity 가 된다
}

const row = (id, label, value, hint = '') =>
  `<label class="devRow"><span>${label}${hint ? `<i>${hint}</i>` : ''}</span>
     <input id="${id}" value="${value}" autocomplete="off" inputmode="decimal"></label>`;
const sec = title => `<div class="devSec">${title}</div>`;
/** [[id, 글자, 켜짐?], …] → 버튼 묶음 */
const btns = list => `<div class="devBtns">${list.map(([id, label, on]) =>
  `<button id="${id}" class="${on ? 'on' : ''}">${label}</button>`).join('')}</div>`;
const on = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };

/** 입력 읽기 — 비우면 null(유지), 틀리면 빨갛게 표시하고 bad 를 세운다 */
function form() {
  const f = { bad: false };
  const mark = id => { f.bad = true; $(id)?.classList.add('bad'); };
  f.int = (id, lo = 0, hi) => {
    const raw = ($(id)?.value ?? '').trim();
    if (raw === '') return null;
    const v = Math.floor(Number(raw.replace(/[, ]/g, '')));
    if (!Number.isFinite(v) || v < lo || (hi !== undefined && v > hi)) { mark(id); return null; }
    return v;
  };
  f.big = id => {
    const raw = ($(id)?.value ?? '').trim();
    if (raw === '') return null;
    const L = bigIn(raw);
    if (L === null) { mark(id); return null; }
    return L;
  };
  f.fail = () => { if (f.bad) $('devErr').textContent = '숫자를 다시 확인하세요'; return f.bad; };
  return f;
}

/** 값을 바꾼 뒤 공통 처리 — 파생 캐시를 다시 모으고, 화면을 새로 그리고, 저장한다 */
function done(msg, { stay = true } = {}) {
  G.recomputeGacha();                 // 장비·동료 효과 캐시(S.own·S.eqv)
  // 체력 상한이 바뀌었을 수 있다(스탯·장비·유물). 넘치면 깎고, 모자라면 그대로 둔다
  R.LhpMax = LHP();
  if (!(R.Lhp <= R.LhpMax)) R.Lhp = R.LhpMax;
  save();
  ctx.redraw();           // 열려 있는 패널 (성장의 조각·광석, 강화의 스탯 레벨 …)
  ctx.refresh();          // 상단 HUD
  ctx.toast('🛠️ ' + msg);
  if (stay) showPanel();  // 입력칸을 새 값으로 다시 채운다
}

/** 그 층으로 들어간다. 기록은 따라 올리고(해금이 도로 잠기지 않게) 내리지는 않는다 */
function go(st) {
  st = Math.max(1, Math.floor(st));
  S.st = st;
  S.best = Math.max(S.best, st);
  S.life = Math.max(S.life, st);
  S.farm = 0;
  enterStage(st, MODE.RUN);
  done(`${chapterLabel(st)} (${n0(st)}층) 으로 이동`);
}

// ── 패널 ─────────────────────────────────────────────────────
const TABS = [
  ['res', '자원'], ['prog', '진행'], ['fight', '전투'], ['mon', '몬스터'], ['stat', '강화'],
  ['gacha', '뽑기'], ['grow', '성장'], ['day', '일일·시간'], ['save', '세이브'],
];

function showPanel() {
  clearInterval(liveTimer);
  $('devOv').classList.add('on');
  $('devOv').querySelector('.devBox')?.classList.add('wide');
  const S_ = SECTIONS[tab]();
  $('devBody').innerHTML = `
    <h3>🛠️ 개발자 모드</h3>
    <div class="devWarn">여기서 바꾼 값은 <b>실제 플레이 기록이 아닙니다.</b>
      밸런스를 볼 때는 시뮬(<code>npm run sim</code>)을 기준으로 하세요.
      ${devOnNote()}</div>
    <div class="devTabs">${TABS.map(([k, n]) => `<button data-dtab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="devSecBody">${S_.html}</div>
    <div class="devErr" id="devErr"></div>`;
  $('devBody').querySelectorAll('[data-dtab]').forEach(b => b.onclick = () => { tab = b.dataset.dtab; showPanel(); });
  S_.bind();
}

/** 켜 둔 전투 스위치를 경고에 띄운다 — 켠 걸 잊고 플레이하면 체감이 전부 틀린다 */
function devOnNote() {
  const on = [];
  if (DEV.god) on.push('무적');
  if (DEV.Ldmg) on.push('피해 ×' + (DEV.Ldmg >= 100 ? '한 방' : fmt(DEV.Ldmg)));
  if (DEV.speed !== 1) on.push(DEV.speed === 0 ? '멈춤' : '배속 ×' + DEV.speed);
  if (DEV.adSkip) on.push('광고 건너뛰기');
  if (DEV.event) on.push('이벤트 강제');
  return on.length ? `<br>켜진 스위치: <b>${on.join(' · ')}</b> (새로고침하면 꺼짐)` : '';
}

const SECTIONS = {};

// ── 자원 ─────────────────────────────────────────────────────
SECTIONS.res = () => ({
  html: `
    ${sec('💰 재화')}
    <div class="devGrid">
      ${row('dvGold', '골드', bigOut(S.Lg), '1e30 · 1e5000 표기 가능')}
      ${row('dvGem', '젬', num(S.gem))}
      ${row('dvShard', '조각', num(S.shard))}
      ${row('dvOre', '광석', num(S.ore))}
      ${row('dvSoul', '영혼(남은)', bigOut(S.soul.Lfree), '1e30 표기 가능')}
      ${row('dvRelicSh', '유물 조각', num(Math.floor(S.relic?.shards || 0)))}
      ${row('dvPick', '곡괭이', MINE.picks(), '상한 ' + MINE.pickMax())}
      ${DUN.DUNGEONS.map(d => row('dvKey_' + d.key, (d.icon || '🗝️') + ' ' + d.name + ' 열쇠', num(S.dun.keys[d.key]), '하루 ' + DUN.keysMax(d.key))).join('')}
    </div>
    <button id="dvApply">적용</button>
    ${sec('⚡ 빠르게')}
    ${btns([['qGem', '젬 +10,000'], ['qGold', '골드 ×1000'], ['qMat', '조각·광석 +10,000'],
      ['qSoul', '영혼 ×1000'], ['qRelic', '유물 조각 +1,000'], ['qKeys', '열쇠·곡괭이 가득']])}`,
  bind() {
    on('dvApply', () => {
      const f = form();
      const Lg = f.big('dvGold'), gem = f.int('dvGem'), shard = f.int('dvShard'), ore = f.int('dvOre');
      const Lsoul = f.big('dvSoul'), rsh = f.int('dvRelicSh'), pick = f.int('dvPick');
      const keys = Object.fromEntries(DUN.DUNGEONS.map(d => [d.key, f.int('dvKey_' + d.key)]));
      if (f.fail()) return;
      if (Lg !== null) S.Lg = Lg;
      if (gem !== null) S.gem = gem;
      if (shard !== null) S.shard = shard;
      if (ore !== null) S.ore = ore;
      if (Lsoul !== null) S.soul.Lfree = Lsoul;
      if (rsh !== null) S.relic = { shards: 0, n: 0, ...(S.relic || {}), shards: rsh };
      if (pick !== null) { MINE.picks(); S.mine.pick = pick; S.mine.t = Date.now(); }
      for (const [k, v] of Object.entries(keys)) if (v !== null) S.dun.keys[k] = v;
      done('자원 적용 · 골드 ' + fmt(S.Lg));
    });
    on('qGem', () => { S.gem += 10000; done('젬 +10,000'); });
    on('qGold', () => { S.Lg = S.Lg === L0 ? 3 : S.Lg + 3; done('골드 ' + fmt(S.Lg)); });
    on('qMat', () => { S.shard += 10000; S.ore += 10000; done('조각·광석 +10,000'); });
    on('qSoul', () => { S.soul.Lfree = S.soul.Lfree === L0 ? 3 : S.soul.Lfree + 3; done('영혼 ' + fmt(S.soul.Lfree)); });
    on('qRelic', () => { S.relic = { shards: 0, n: 0, ...(S.relic || {}) }; S.relic.shards += 1000; done('유물 조각 +1,000'); });
    on('qKeys', () => {
      DUN.ensureKeys();
      for (const d of DUN.DUNGEONS) { S.dun.keys[d.key] = DUN.keysMax(d.key); S.dun.ad[d.key] = 0; }
      MINE.picks(); S.mine.pick = MINE.pickMax(); S.mine.t = Date.now();
      done('열쇠·광고 횟수·곡괭이 가득');
    });
  },
});

// ── 진행 ─────────────────────────────────────────────────────
SECTIONS.prog = () => {
  const g = gateCfg();
  const bossEvery = B.stage.bossEvery;
  const nextBoss = Math.ceil((R.stage + 1) / bossEvery) * bossEvery;
  const nextGate = g?.every > 0 ? Math.ceil((R.stage + 1) / g.every) * g.every : 0;
  const fails = Object.keys(S.gateFail || {}).length;
  return {
    html: `
      <div class="devInfo">지금 <b>${chapterLabel(R.stage)}</b> (${n0(R.stage)}층) · ${R.mode === MODE.FARM ? '파밍' : '도전'}${R.gate ? ' · 관문' : R.boss ? ' · 보스' : ''}<br>
        이번 회차 최고 <b>${n0(S.best)}</b> · 평생 최고 <b>${n0(S.life)}</b> · 환생 <b>${n0(S.lives)}</b>회</div>
      ${sec('🧭 기록')}
      <div class="devGrid">
        ${row('dvSt', '현재 스테이지', num(S.st), '적용하면 그 층으로 들어간다')}
        ${row('dvBest', '이번 회차 최고', num(S.best))}
        ${row('dvLife', '평생 최고', num(S.life), '해금 기준')}
        ${row('dvLives', '환생 횟수', num(S.lives))}
        ${row('dvEcho', '메아리 층', num(S.echoTo), '이 층 아래는 골드 배수')}
      </div>
      <button id="dvApply">적용</button>
      ${sec('🚀 이동')}
      ${btns([['gPrev', '◀ 한 층'], ['gNext', '한 층 ▶'], ['g10', '+10층'], ['g100', '+100층'], ['g1000', '+1,000층'],
        ['gBoss', `다음 보스 (${n0(nextBoss)})`], ...(nextGate ? [['gGate', `다음 관문 (${n0(nextGate)})`]] : []),
        ['gAgain', '이 층 다시'], ['gRetry', '최고 기록 다음 층']])}
      ${sec('🔓 기타')}
      ${btns([['gUnlock', '전부 해금'], ['gGateReset', `관문 약화 초기화 (${fails})`]])}`,
    bind() {
      on('dvApply', () => {
        const f = form();
        const st = f.int('dvSt', 1), best = f.int('dvBest', 1), life = f.int('dvLife', 1);
        const lives = f.int('dvLives'), echo = f.int('dvEcho');
        if (f.fail()) return;
        if (lives !== null) S.lives = lives;
        if (echo !== null) S.echoTo = echo;
        if (best !== null) S.best = best;
        if (life !== null) S.life = life;
        // 기록끼리 어긋나면 해금이 도로 잠기거나 UI 가 틀린다 — 현재 ≤ 이번 회차 ≤ 평생
        if (st !== null) S.st = st;
        S.best = Math.max(S.best, S.st);
        S.life = Math.max(S.life, S.best);
        if (st !== null) { S.farm = 0; enterStage(S.st, MODE.RUN); }
        done('진행 적용');
      });
      on('gPrev', () => go(R.stage - 1));
      on('gNext', () => go(R.stage + 1));
      on('g10', () => go(R.stage + 10));
      on('g100', () => go(R.stage + 100));
      on('g1000', () => go(R.stage + 1000));
      on('gBoss', () => go(nextBoss));
      on('gGate', () => go(nextGate));
      on('gAgain', () => { enterStage(R.stage, R.mode); done('이 층 다시'); });
      on('gRetry', () => { retry(); done('최고 기록 다음 층으로'); });
      on('gUnlock', () => {
        // 해금은 전부 life 를 본다. 가장 깊은 해금 요구치까지 올리면 전부 열린다.
        const deepest = Math.max(
          ...B.roster.monsters.map(m => m.unlock || 1),
          ...STAT_KEYS.map(k => B.stats[k].reqStage || 1),
          B.prestige?.unlockStage || 1);
        S.life = Math.max(S.life, deepest);
        done('전부 해금 (평생 최고 ' + n0(S.life) + ')');
      });
      on('gGateReset', () => { S.gateFail = {}; done('관문 약화 초기화'); });
    },
  };
};

// ── 전투 ─────────────────────────────────────────────────────
const DMG = [[0, '×1'], [1, '×10'], [3, '×1000'], [6, '×100만'], [1e5, '한 방']];
const SPD = [0, 1, 2, 5, 10, 20, 50];

function liveText() {
  const hp = R.LhpMax > L0 ? ratio(R.Lhp, R.LhpMax) : 0;
  const alive = R.enemies.filter(e => e.Lhp > L0).length;
  const e = enrage();
  return `<b>${chapterLabel(R.stage)}</b> (${n0(R.stage)}층)${R.gate ? ' · 관문' : R.boss ? ' · 보스' : ''} · 웨이브 ${R.waveIdx + 1}<br>
    체력 <b>${(hp * 100).toFixed(1)}%</b> (${fmt(R.Lhp)} / ${fmt(R.LhpMax)}) · 남은 적 <b>${alive}</b><br>
    DPS <b>${fmt(LDPS(R.boss))}</b> · 이 층 <b>${R.stageTime.toFixed(1)}초</b>${e > 1 ? ` · 광폭 ×${e.toFixed(2)}` : ''}<br>
    게임 배속 ×${S.spd || 1} · 개발 배속 ×${DEV.speed} → 실제 ×${(S.spd || 1) * DEV.speed}`;
}

SECTIONS.fight = () => ({
  html: `
    <div class="devInfo" id="dvLive">${liveText()}</div>
    ${sec('🛡️ 스위치 (저장 안 됨)')}
    ${btns([['fGod', '무적', DEV.god], ['fAd', '광고 건너뛰기', DEV.adSkip],
      ['fAutoSkill', '자동 스킬', S.autoSkill !== false], ['fAutoBuy', '자동 강화', S.autoBuy !== false]])}
    ${sec('⚔️ 피해 배수')}
    ${btns(DMG.map(([L, n]) => ['fD' + L, n, DEV.Ldmg === L]))}
    ${sec('⏩ 배속 (게임 ×1/×2 위에 곱한다)')}
    ${btns(SPD.map(v => ['fS' + v, v === 0 ? '⏸ 멈춤' : '×' + v, DEV.speed === v]))}
    ${sec('🎯 지금')}
    ${btns([['fKill', '적 전부 처치'], ['fHeal', '체력 가득'], ['fCd', '스킬 쿨 초기화'],
      ['fEnrage', '광폭화 바로'], ['fDie', '다음 피격에 쓰러지기']])}`,
  bind() {
    const flip = (k, label) => () => { DEV[k] = !DEV[k]; ctx.toast(`🛠️ ${label} ${DEV[k] ? '켬' : '끔'}`); showPanel(); };
    on('fGod', flip('god', '무적'));
    on('fAd', flip('adSkip', '광고 건너뛰기'));
    on('fAutoSkill', () => { S.autoSkill = S.autoSkill === false; done('자동 스킬 ' + (S.autoSkill ? '켬' : '끔')); });
    on('fAutoBuy', () => { S.autoBuy = S.autoBuy === false; done('자동 강화 ' + (S.autoBuy ? '켬' : '끔')); });
    for (const [L, n] of DMG) on('fD' + L, () => { DEV.Ldmg = L; ctx.toast('🛠️ 피해 ' + n); showPanel(); });
    for (const v of SPD) on('fS' + v, () => { DEV.speed = v; ctx.toast('🛠️ 배속 ' + (v === 0 ? '멈춤' : '×' + v)); showPanel(); });
    on('fKill', () => { devKillAll(); ctx.refresh(); ctx.toast('🛠️ 적 전부 처치'); });
    on('fHeal', () => { R.Lhp = R.LhpMax; ctx.toast('🛠️ 체력 가득'); });
    on('fCd', () => { for (const k of Object.keys(R.skillCd)) R.skillCd[k] = 0; ctx.toast('🛠️ 스킬 쿨 초기화'); });
    on('fEnrage', () => {
      const e = R.gate ? (gateCfg()?.enrage || B.stage.bossEnrage) : B.stage.bossEnrage;
      if (!R.boss || !e) { ctx.toast('🛠️ 보스 층에서만 됩니다'); return; }
      R.stageTime = Math.max(R.stageTime, e.after + 0.01);
      ctx.toast('🛠️ 광폭화 시작');
    });
    on('fDie', () => {
      DEV.god = false;
      R.Lhp = L0;           // 다음 적 타격이 '체력보다 큰 피해' 가 되어 평소 사망 흐름을 탄다
      ctx.toast('🛠️ 다음 피격에 쓰러집니다');
      showPanel();
    });
    // 실시간 상황 — 이 탭이 열려 있는 동안만
    liveTimer = setInterval(() => { const el = $('dvLive'); if (el) el.innerHTML = liveText(); else clearInterval(liveTimer); }, 400);
  },
});

// ── 몬스터 ───────────────────────────────────────────────────
SECTIONS.mon = () => ({
  html: `
    <div class="devInfo">리드 <b>${B.roster.monsters.find(m => m.key === S.mon)?.name || S.mon}</b> ·
      몬스터 레벨 합 <b>${n0(L2.totalMonLevels())}</b> (= 마스터리 포인트) · 마일스톤 ${L2.milestoneCount()}개</div>
    ${sec('👑 리드 몬스터')}
    <label class="devRow"><span>리드</span><select id="dvLead">${B.roster.monsters.map(m =>
      `<option value="${m.key}" ${m.key === S.mon ? 'selected' : ''}>${m.name}${S.life < (m.unlock || 1) ? ` 🔒${n0(m.unlock)}층` : ''}</option>`).join('')}</select></label>
    <button id="dvLeadGo">리드로 세우기</button>
    ${sec('📈 몬스터 레벨')}
    <div class="devGrid">${B.roster.monsters.map(m =>
      row('dvM_' + m.key, m.name, num(S.monLv[m.key] || 0), `${S.life >= (m.unlock || 1) ? '해금' : '🔒 ' + n0(m.unlock) + '층'} · 진화 ${monTier(m.key)}단계`)).join('')}</div>
    <button id="dvApply">적용</button>
    ${sec('⚡ 빠르게')}
    ${btns([['mAll25', '전부 Lv.25'], ['mAll50', '전부 Lv.50'], ['mAll75', '전부 Lv.75'], ['mAll100', '전부 Lv.100'],
      ['mAll0', '전부 Lv.0'], ['mUnlock', '전 몬스터 해금']])}`,
  bind() {
    on('dvLeadGo', () => {
      const m = B.roster.monsters.find(x => x.key === $('dvLead').value);
      if (!m) return;
      S.life = Math.max(S.life, m.unlock || 1);    // 잠긴 몬스터를 세우면 해금까지 같이
      S.mon = m.key;
      ctx.onLeadChange();
      done('리드: ' + m.name);
    });
    // 레벨을 내리면 이미 찍은 마스터리가 포인트를 넘을 수 있다 — 그 상태로 저장하면
    // 다음 로드(migrate)가 마스터리를 통째로 지운다. 여기서 먼저 돌려준다
    const fixMastery = () => { if (L2.masterySpent() > L2.masteryPoints()) for (const k of Object.keys(S.mastery)) S.mastery[k] = 0; };
    const setAll = lv => () => { for (const m of B.roster.monsters) S.monLv[m.key] = lv; fixMastery(); ctx.onLeadChange(); done('전 몬스터 Lv.' + lv); };
    on('dvApply', () => {
      const f = form();
      const v = Object.fromEntries(B.roster.monsters.map(m => [m.key, f.int('dvM_' + m.key)]));
      if (f.fail()) return;
      for (const [k, lv] of Object.entries(v)) if (lv !== null) S.monLv[k] = lv;
      fixMastery();
      ctx.onLeadChange();          // 진화 단계가 바뀌면 그림이 바뀐다
      done('몬스터 레벨 적용');
    });
    for (const lv of [0, 25, 50, 75, 100]) on('mAll' + lv, setAll(lv));
    on('mUnlock', () => {
      S.life = Math.max(S.life, ...B.roster.monsters.map(m => m.unlock || 1));
      done('전 몬스터 해금 (평생 최고 ' + n0(S.life) + ')');
    });
  },
});

// ── 강화(스탯) ───────────────────────────────────────────────
const statMin = k => (B.stats[k].kind === 'mul' ? 1 : 0);   // 배수 스탯의 레벨 1 이 "배수 없음" 이다
const statClamp = (k, v) => Math.max(statMin(k), B.stats[k].max !== undefined ? Math.min(v, B.stats[k].max) : v);

SECTIONS.stat = () => ({
  html: `
    ${sec('🔨 스탯 레벨')}
    <div class="devGrid">${STAT_KEYS.map(k => row('dvL_' + k, B.stats[k].name || k, num(S.lv[k]),
      (B.stats[k].max !== undefined ? '최대 ' + n0(B.stats[k].max) : '상한 없음') + (B.stats[k].reqStage ? ` · ${n0(B.stats[k].reqStage)}층 해금` : ''))).join('')}</div>
    <button id="dvApply">적용</button>
    ${sec('⚡ 빠르게')}
    ${btns([['sUp100', '전 스탯 +100'], ['sUp1000', '전 스탯 +1,000'], ['sMax', '상한 있는 것 최대'],
      ['sAuto', '골드로 끝까지 자동 강화'], ['sReset', '전 스탯 초기화']])}`,
  bind() {
    on('dvApply', () => {
      const f = form();
      const v = Object.fromEntries(STAT_KEYS.map(k => [k, f.int('dvL_' + k)]));
      if (f.fail()) return;
      for (const k of STAT_KEYS) if (v[k] !== null) S.lv[k] = statClamp(k, v[k]);
      done('스탯 적용');
    });
    const up = n => () => { for (const k of STAT_KEYS) S.lv[k] = statClamp(k, (S.lv[k] || 0) + n); done('전 스탯 +' + n0(n)); };
    on('sUp100', up(100));
    on('sUp1000', up(1000));
    on('sMax', () => { for (const k of STAT_KEYS) if (B.stats[k].max !== undefined) S.lv[k] = B.stats[k].max; done('상한 있는 스탯 최대'); });
    on('sAuto', () => {
      let n = 0;
      for (let i = 0; i < 20000; i++) { const got = autoBuyTick(R.stage, R.boss); if (!got) break; n += got; }
      done(`자동 강화 ${n0(n)}회 · 남은 골드 ${fmt(S.Lg)}`);
    });
    on('sReset', () => { for (const k of STAT_KEYS) S.lv[k] = statMin(k); done('전 스탯 초기화'); });
  },
});

// ── 뽑기 ─────────────────────────────────────────────────────
const lastThresh = () => B.gacha.lvThresh[B.gacha.lvThresh.length - 1];
let giveBanner = G.BANNERS[0]?.key;
let allBanner = G.BANNERS.find(b => b.key === 'comp')?.key || giveBanner;   // '전부 강화' 는 동료가 기본

SECTIONS.gacha = () => {
  const items = G.CATALOG[giveBanner] || [];
  return {
    html: `
      ${sec('🎲 배너 레벨 (누적 뽑기 수)')}
      <div class="devGrid">${G.BANNERS.map(b => row('dvBp_' + b.key, `${b.icon || ''} ${b.name} Lv.${G.bannerLv(b.key)}`, num(S.bp[b.key]),
        `최대 Lv.${B.gacha.lvThresh.length} = ${n0(lastThresh())}회 · 보유 ${n0(G.totalItems(b.key))}개`)).join('')}</div>
      <button id="dvApply">적용</button>
      ${sec('🎁 아이템 지급')}
      <div class="devGrid">
        <label class="devRow"><span>배너</span><select id="dvGB">${G.BANNERS.map(b => `<option value="${b.key}" ${b.key === giveBanner ? 'selected' : ''}>${b.icon || ''} ${b.name}</option>`).join('')}</select></label>
        <label class="devRow"><span>아이템</span><select id="dvGI">${items.map(it => `<option value="${it.id}">${it.icon || ''} ${it.name}</option>`).join('')}</select></label>
        <label class="devRow"><span>등급</span><select id="dvGR">${G.RARITIES.map((r, i) => `<option value="${i}" ${i === G.RARITIES.length - 1 ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label>
        ${row('dvGE', '강화', 0)}
        ${row('dvGN', '개수', 1)}
      </div>
      <button id="dvGive">지급</button>
      ${sec('⚡ 빠르게')}
      ${btns([['gPull', '배너마다 무료 10연'], ['gFree', '무료 뽑기 횟수 초기화'], ['gMaxLv', '배너 전부 최대 레벨'],
        ['gBest', '전 아이템 최고 등급 1개씩'], ['gClear', '보유 아이템 전부 삭제']])}
      ${sec('⭐ 전부 강화')}
      <div class="devInfo">${G.BANNERS.map(b => {
        const sl = G.activeSlots(b.key), max = b.slotUnlock?.length || b.slots || 0;
        return `${b.icon || ''} ${b.name} <b>+${n0(S.own[b.key] + S.eqv[b.key])}%</b> (보유 ${n0(S.own[b.key])}% · 장착 ${n0(S.eqv[b.key])}%) · 슬롯 ${sl}/${max}`;
      }).join('<br>')}</div>
      <div class="devGrid" style="margin-top:7px">
        <label class="devRow"><span>배너</span><select id="dvAB">${G.BANNERS.map(b => `<option value="${b.key}" ${b.key === allBanner ? 'selected' : ''}>${b.icon || ''} ${b.name}</option>`).join('')}</select></label>
        <label class="devRow"><span>등급</span><select id="dvAR">${G.RARITIES.map((r, i) => `<option value="${i}" ${i === G.RARITIES.length - 1 ? 'selected' : ''}>${r.name}</option>`).join('')}</select></label>
        ${row('dvAE', '강화', 10, '+1마다 효과 ×' + B.gacha.fuse.enhanceMul)}
      </div>
      ${btns([['aSet', '6종 전부 이 등급·강화로 (교체)'], ['aUp', '보유 전부 강화 +1'], ['aSlots', '이 배너 슬롯 전부 열기']])}`,
    bind() {
      $('dvGB').onchange = e => { giveBanner = e.target.value; showPanel(); };
      on('dvApply', () => {
        const f = form();
        const v = Object.fromEntries(G.BANNERS.map(b => [b.key, f.int('dvBp_' + b.key)]));
        if (f.fail()) return;
        for (const [k, n] of Object.entries(v)) if (n !== null) S.bp[k] = n;
        done('배너 레벨 적용');
      });
      on('dvGive', () => {
        const f = form();
        const enh = f.int('dvGE', 0, 999), n = f.int('dvGN', 1, 1e6);
        if (f.fail()) return;
        const b = $('dvGB').value, id = $('dvGI').value, r = +$('dvGR').value;
        const inv = (S.inv[b] ||= {});
        const k = `${id}|${r}|${enh || 0}`;
        inv[k] = (inv[k] || 0) + (n || 1);
        const it = (G.CATALOG[b] || []).find(x => x.id === id);
        done(`${G.RARITIES[r].name} ${it?.name || id}${enh ? ' +' + enh : ''} ×${n || 1} 지급`);
      });
      on('gPull', () => { for (const b of G.BANNERS) G.pull(b.key, 10, { free: true }); done('배너마다 10연'); });
      on('gFree', () => { S.freeDay = ''; G.ensureDaily(); done('무료 뽑기 횟수 초기화'); });
      on('gMaxLv', () => { for (const b of G.BANNERS) S.bp[b.key] = Math.max(S.bp[b.key] || 0, lastThresh()); done('배너 전부 최대 레벨'); });
      on('gBest', () => {
        const top = G.RARITIES.length - 1;
        for (const b of G.BANNERS) {
          const inv = (S.inv[b.key] ||= {});
          for (const it of G.CATALOG[b.key] || []) { const k = `${it.id}|${top}|0`; inv[k] = (inv[k] || 0) + 1; }
        }
        done('전 아이템 ' + G.RARITIES[top].name + ' 1개씩');
      });
      $('dvAB').onchange = e => { allBanner = e.target.value; };
      on('aSet', () => {
        const f = form();
        const enh = f.int('dvAE', 0, 999);
        if (f.fail()) return;
        const b = $('dvAB').value, r = +$('dvAR').value, e = enh || 0;
        // 종류마다 1개씩 — 슬롯이 다 열려 있으면 전부 장착되고 동료는 하늘에 전부 뜬다
        S.inv[b] = Object.fromEntries((G.CATALOG[b] || []).map(it => [`${it.id}|${r}|${e}`, 1]));
        const bn = G.BANNERS.find(x => x.key === b);
        done(`${bn?.name || b} ${(G.CATALOG[b] || []).length}종 전부 ${G.RARITIES[r].name}${e ? ' +' + e : ''}`);
      });
      on('aUp', () => {
        const b = $('dvAB').value;
        const inv = S.inv[b] || {}, next = {};
        for (const [k, n] of Object.entries(inv)) {
          const [id, r, e] = k.split('|');
          const nk = `${id}|${r}|${(+e || 0) + 1}`;
          next[nk] = (next[nk] || 0) + n;
        }
        S.inv[b] = next;
        done(`${G.BANNERS.find(x => x.key === b)?.name || b} 보유 전부 강화 +1`);
      });
      on('aSlots', () => {
        const bn = G.BANNERS.find(x => x.key === $('dvAB').value);
        const need = Math.max(1, ...(bn?.slotUnlock || [1]));
        S.life = Math.max(S.life, need);        // 슬롯은 평생 최고 기록으로 열린다 — 다른 해금도 같이 열린다
        done(`${bn?.name} 슬롯 전부 열림 (평생 최고 ${n0(S.life)}층)`);
      });
      on('gClear', () => {
        if (!confirm('세 배너의 보유 아이템을 전부 지웁니다. 계속할까요?')) return;
        for (const b of G.BANNERS) S.inv[b.key] = {};
        done('보유 아이템 전부 삭제');
      });
    },
  };
};

// ── 성장 (마스터리 · 연구 · 광산 · 유물 · 영혼 트리 · 환생) ─────────
SECTIONS.grow = () => {
  const rsLeft = L2.researchLeft();
  return {
    html: `
      ${sec(`🎓 마스터리 — 포인트 ${n0(L2.masteryPoints())} · 사용 ${n0(L2.masterySpent())} · 남음 ${n0(L2.masteryFree())}`)}
      <div class="devGrid">${L2.MASTERY_NODES.map(n => row('dvMa_' + n.key, n.name || n.key, num(S.mastery[n.key] || 0))).join('')}</div>
      ${btns([['maApply', '마스터리 적용'], ['maReset', '마스터리 초기화']])}
      ${sec(`🔬 연구 — Lv.${L2.researchLv()}${L2.researchRunning() ? (rsLeft > 0 ? ` · 진행 중 (남은 ${n0(rsLeft)}초)` : ' · 완료 대기') : ' · 쉬는 중'}`)}
      <div class="devGrid">${row('dvRs', '연구 레벨', L2.researchLv())}</div>
      ${btns([['rsApply', '연구 레벨 적용'], ['rsDone', '연구 즉시 완료'], ['rsStop', '연구 취소']])}
      ${sec(`⛏️ 광산 — 깊이 ${n0(MINE.depth())} · 곡괭이 ${MINE.picks()}/${MINE.pickMax()} · 폭탄 ${MINE.bombLeft()}`)}
      ${btns([['miPick', '곡괭이 가득'], ['miBomb', '폭탄 초기화'], ['miNew', '광산 새로 깔기']])}
      ${sec(`🏺 유물 — ${RL.openCount()} / ${RL.RELICS.length} 열림`)}
      <div class="devGrid">${row('dvRelicN', '열린 유물 수', RL.openCount(), RL.opened().map(r => r.name).join(', ') || '없음')}</div>
      ${btns([['rlApply', '유물 수 적용'], ['rlAll', '유물 전부 열기'], ['rlNone', '유물 전부 닫기']])}
      ${sec(`🌳 영혼 트리 — 남은 영혼 ${fmt(S.soul.Lfree)}`)}
      <div class="devGrid">${PR.TREE.map(n => row('dvT_' + n.key, n.name || n.key, PR.tlv(n.key), n.max !== undefined ? '최대 ' + n.max : '상한 없음')).join('')}</div>
      ${btns([['trApply', '트리 적용'], ['trMax', '전부 최대(상한 없는 건 100)'], ['trReset', '트리 초기화']])}
      ${sec(`♻️ 환생 — ${PR.canPrestige() ? '지금 하면 영혼 ' + fmt(PR.Lpending()) : PR.unlocked() ? '받을 영혼이 없다(기록을 더 올려야 함)' : n0(B.prestige.unlockStage) + '층 해금'}`)}
      ${btns([['prGo', '지금 환생']])}`,
    bind() {
      on('maApply', () => {
        const f = form();
        const v = Object.fromEntries(L2.MASTERY_NODES.map(n => [n.key, f.int('dvMa_' + n.key)]));
        if (f.fail()) return;
        const next = { ...S.mastery };
        for (const [k, lv] of Object.entries(v)) if (lv !== null) next[k] = lv;
        const spent = Object.values(next).reduce((a, x) => a + (x || 0), 0);
        // 포인트를 넘기면 다음 로드(migrate)가 통째로 지운다 — 몬스터 레벨을 먼저 올리라고 알린다
        if (spent > L2.masteryPoints()) { $('devErr').textContent = `포인트가 모자랍니다 (필요 ${n0(spent)} · 보유 ${n0(L2.masteryPoints())}) — 몬스터 탭에서 레벨을 올리세요`; return; }
        S.mastery = next;
        done('마스터리 적용');
      });
      on('maReset', () => { for (const k of Object.keys(S.mastery)) S.mastery[k] = 0; done('마스터리 초기화'); });
      on('rsApply', () => { const f = form(); const lv = f.int('dvRs'); if (f.fail() || lv === null) return; S.rs.lv = lv; done('연구 Lv.' + lv); });
      on('rsDone', () => {
        if (L2.researchRunning()) { S.rs.startAt = 1; L2.collectResearch(); }   // 시작 시각을 아주 옛날로 → 바로 끝남
        else S.rs.lv = L2.researchLv() + 1;
        done('연구 완료 → Lv.' + L2.researchLv());
      });
      on('rsStop', () => { S.rs.startAt = 0; done('진행 중 연구 취소 (광석은 돌려주지 않음)'); });
      on('miPick', () => { MINE.picks(); S.mine.pick = MINE.pickMax(); S.mine.t = Date.now(); done('곡괭이 가득'); });
      on('miBomb', () => { MINE.ensureMineDaily(); S.mine.bomb = 0; done('폭탄 횟수 초기화'); });
      on('miNew', () => { S.mine.grid = null; MINE.ensureGrid(); done('광산 새로 깔기 (깊이 0)'); });
      const setRelics = n => { S.relic = { shards: 0, n: 0, ...(S.relic || {}), n }; done(`유물 ${n} / ${RL.RELICS.length} 열림`); };
      on('rlApply', () => { const f = form(); const n = f.int('dvRelicN', 0, RL.RELICS.length); if (f.fail() || n === null) return; setRelics(n); });
      on('rlAll', () => setRelics(RL.RELICS.length));
      on('rlNone', () => setRelics(0));
      on('trApply', () => {
        const f = form();
        const v = Object.fromEntries(PR.TREE.map(n => [n.key, f.int('dvT_' + n.key, 0, n.max)]));
        if (f.fail()) return;
        for (const [k, lv] of Object.entries(v)) if (lv !== null) S.soul.tree[k] = lv;
        done('영혼 트리 적용');
      });
      on('trMax', () => { for (const n of PR.TREE) S.soul.tree[n.key] = n.max !== undefined ? n.max : Math.max(100, PR.tlv(n.key)); done('영혼 트리 최대'); });
      on('trReset', () => { S.soul.tree = {}; done('영혼 트리 초기화'); });
      on('prGo', () => {
        if (!PR.canPrestige()) { $('devErr').textContent = '지금은 환생할 수 없습니다 — 진행 탭에서 평생 최고를 올리세요'; return; }
        // 성장 탭의 환생 버튼과 같은 흐름 (ui-grow.js)
        const Lps = LgoldPerSec(Math.max(1, S.best - 1));
        const r = PR.doPrestige(Lps);
        if (!r) return;
        for (let i = 0; i < 4000; i++) if (!autoBuyTick(r.target, isBoss(r.target))) break;
        const st = canClear(r.target, 1) ? r.target : bestFarmStage(r.target);
        S.st = st; S.best = st;
        enterStage(st, MODE.RUN);
        ctx.onLeadChange();
        done(`환생 · 영혼 +${fmt(r.Lgot)} · ${n0(st)}층에서 시작`);
      });
    },
  };
};

// ── 일일 · 시간 ──────────────────────────────────────────────
SECTIONS.day = () => {
  const qs = DAILY.questState();
  const pa = DAILY.pendingAttend();
  const ev = EV.activeEvent();
  return {
    html: `
      <div class="devInfo">퀘스트 ${qs.map(q => `${q.done ? '✅' : '⬜'}${q.claimed ? '🎁' : ''} ${q.cur}/${q.goal}`).join(' · ')}<br>
        출석 연속 <b>${S.attend.streak || 0}</b>일 · ${pa ? `오늘 받을 수 있음 (${pa.day}일째 💎${pa.gem})` : '오늘 받음'}<br>
        이벤트 <b>${ev ? (ev.name || ev.id) : '없음'}</b>${ev ? ` · 포인트 ${n0(S.ev.p || 0)}` : ''}</div>
      ${sec('📅 하루')}
      ${btns([['dNext', '하루 넘기기'], ['dQuest', '퀘스트 전부 달성'], ['dQClaim', '퀘스트 수령 초기화'], ['dAttend', '출석 처음부터']])}
      <div class="devGrid" style="margin-top:7px">${row('dvStreak', '출석 연속 일수', S.attend.streak || 0)}</div>
      <button id="dvStreakGo">연속 일수 적용</button>
      ${sec('🎉 이벤트')}
      <label class="devRow"><span>강제로 열기<i>저장 안 됨</i></span><select id="dvEv">
        <option value="">기간대로</option>${(B.events?.list || []).map(e => `<option value="${e.id}" ${DEV.event === e.id ? 'selected' : ''}>${e.name || e.id} (${e.from}~${e.to})</option>`).join('')}</select></label>
      ${ev ? `<div class="devGrid" style="margin-top:7px">${row('dvEvP', '이벤트 포인트', S.ev.p || 0)}</div>
        ${btns([['evApply', '포인트 적용'], ['evClaim', '이벤트 수령 초기화']])}` : ''}
      ${sec('🌙 오프라인 보상')}
      <div class="devGrid">${row('dvOffH', '자리 비운 시간(시간)', 8, '상한 ' + B.offline.capHours + '시간 + 유물')}</div>
      ${btns([['oShow', '보상 화면 보기 (새로고침)'], ['oNow', '바로 받기']])}`,
    bind() {
      on('dNext', () => {
        // 날짜를 비우면 각 시스템이 '하루가 바뀌었다' 로 보고 채운다. 출석은 '어제 받음' 으로 돌려 연속을 잇는다
        S.daily.date = ''; S.freeDay = ''; S.dun.day = ''; S.mine.day = '';
        if (!DAILY.pendingAttend()) S.attend.last = yday();     // 오늘 받았으면 '어제 받음' 으로 → 다음 출석이 연속으로 이어진다
        DAILY.ensureDaily(); G.ensureDaily(); DUN.ensureKeys(); MINE.ensureMineDaily();
        done('하루 넘김 — 퀘스트·무료 뽑기·열쇠·폭탄·출석');
      });
      on('dQuest', () => { DAILY.ensureDaily(); for (const q of DAILY.QUESTS) S.daily[q.id] = Math.max(S.daily[q.id] || 0, q.goal); done('퀘스트 전부 달성'); });
      on('dQClaim', () => { S.daily.claimed = {}; done('퀘스트 수령 초기화'); });
      on('dAttend', () => { S.attend = { last: '', streak: 0 }; done('출석 처음부터 (1일째)'); });
      on('dvStreakGo', () => { const f = form(); const n = f.int('dvStreak'); if (f.fail() || n === null) return; S.attend.streak = n; done('출석 연속 ' + n + '일'); });
      $('dvEv').onchange = e => { DEV.event = e.target.value; EV.ensureEvent(); done(DEV.event ? '이벤트 강제 열기: ' + DEV.event : '이벤트 기간대로'); };
      on('evApply', () => { const f = form(); const p = f.int('dvEvP'); if (f.fail() || p === null) return; S.ev.p = p; done('이벤트 포인트 ' + n0(p)); });
      on('evClaim', () => { S.ev.claimed = {}; done('이벤트 수령 초기화'); });
      const hours = () => { const f = form(); const h = f.int('dvOffH', 0, 24 * 365); return f.fail() || h === null ? null : h; };
      on('oShow', () => {
        const h = hours(); if (h === null) return;
        // 마지막 저장을 h 시간 전으로 돌리고 새로고침 → 시작을 누르면 실제 보상 창이 뜬다.
        // holdSaveTime: 새로고침 전 저장이 시각을 '지금' 으로 덮지 않게
        S.t = Date.now() - h * 3600000;
        holdSaveTime(S.t);
        save();
        location.reload();
      });
      on('oNow', () => {
        const h = hours(); if (h === null) return;
        const t0 = S.t;
        S.t = Date.now() - h * 3600000;
        const o = pendingOffline();
        S.t = t0;
        if (!o) { $('devErr').textContent = '1분 미만이거나 계산할 수 없습니다'; return; }
        claimOffline(o, 1);
        done(`오프라인 ${h}시간 · 골드 +${fmt(o.Lgold)}`);
      });
    },
  };
};
/** daily.js 와 같은 날짜 표기 (YYYY-M-D) — 어제 */
function yday() { const d = new Date(Date.now() - 86400000); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

// ── 세이브 ───────────────────────────────────────────────────
// save() 와 같은 표기 — ±Infinity 는 JSON 에서 null 이 되므로 문자열로
const ser = () => JSON.stringify(S, (k, v) => (v === -Infinity ? '-inf' : v === Infinity ? 'inf' : v));

/** 세이브를 통째로 바꾸고 새로고침한다. 로드 때 migrate 가 빠진 필드를 메운다 */
function replaceSave(obj) {
  reviveNumbers(obj);
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, obj);
  holdSaveTime(0);
  save();                   // 떠날 때 저장(pagehide)도 이 S 를 쓴다
  location.reload();
}

SECTIONS.save = () => {
  let bak = null;
  try { bak = JSON.parse(localStorage.getItem(BAK) || 'null'); } catch {}
  return {
    html: `
      ${sec('💾 백업 슬롯')}
      <div class="devInfo">${bak ? `백업 있음 · ${new Date(bak.at).toLocaleString('ko-KR')} · 평생 최고 ${n0(bak.life)}` : '백업 없음'}</div>
      ${btns([['sBak', '지금 세이브 백업'], ['sRestore', '백업 복원 (새로고침)']])}
      ${sec('📤 내보내기 · 불러오기')}
      <textarea id="dvJson" spellcheck="false" placeholder="여기에 세이브 JSON 을 붙여넣고 '불러오기'"></textarea>
      ${btns([['sExport', '내보내기'], ['sCopy', '복사'], ['sImport', '불러오기 (새로고침)']])}
      ${sec('🔄 기타')}
      ${btns([['sReload', '저장하고 새로고침']])}
      <button id="dvWipe" class="devDanger">세이브 초기화</button>`,
    bind() {
      on('sBak', () => {
        localStorage.setItem(BAK, JSON.stringify({ at: Date.now(), life: S.life, s: ser() }));
        ctx.toast('🛠️ 백업 저장');
        showPanel();
      });
      on('sRestore', () => {
        if (!bak) { $('devErr').textContent = '백업이 없습니다'; return; }
        if (!confirm('지금 세이브를 백업으로 바꿉니다. 계속할까요?')) return;
        replaceSave(JSON.parse(bak.s));
      });
      on('sExport', () => { $('dvJson').value = ser(); $('dvJson').select(); });
      on('sCopy', async () => {
        if (!$('dvJson').value) $('dvJson').value = ser();
        try { await navigator.clipboard.writeText($('dvJson').value); ctx.toast('🛠️ 복사됨'); }
        catch { $('dvJson').select(); ctx.toast('🛠️ 직접 복사하세요 (선택해 둠)'); }
      });
      on('sImport', () => {
        let obj;
        try { obj = JSON.parse($('dvJson').value); } catch { $('devErr').textContent = 'JSON 이 아닙니다'; return; }
        if (!obj || typeof obj !== 'object' || obj.lv === undefined) { $('devErr').textContent = '이 게임 세이브가 아닌 것 같습니다'; return; }
        if (!confirm('지금 세이브를 붙여넣은 것으로 바꿉니다. 계속할까요?')) return;
        replaceSave(obj);
      });
      on('sReload', () => { save(); location.reload(); });
      on('dvWipe', () => {
        if (!confirm('세이브를 전부 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
        wipe();
        holdSaveTime(0);
        location.reload();
      });
    },
  };
};
