// 개발자 모드 — 성장 패널 제목의 🌱 를 눌러 연다.
//
// **이 비밀번호는 보안이 아니다.** 클라이언트 코드에 그대로 들어 있어서 소스를 열면 보인다.
// 막으려는 건 "실수로 눌러서 세이브가 바뀌는 것" 이지 작정하고 들어오는 사람이 아니다.
// 세이브가 애초에 localStorage 라 브라우저 콘솔로 얼마든지 고칠 수 있고, 서버도 없다.
// 그러니 여기에 진짜 보호가 필요한 값(결제·랭킹)은 두지 않는다.
//
// 값을 바꾸면 **표시가 남는다**(패널 상단 경고). 개발용으로 올린 세이브를 실제 플레이 기록과
// 헷갈리면 밸런스 판단이 통째로 틀어지기 때문이다 — 시뮬 수치와 대조할 때 특히 그렇다.
import { B, STAT_KEYS } from './balance.js';
import { S, save, defaults, wipe } from './state.js';
import { fromNum, fmt, L0 } from './logmath.js';
import { enterStage, MODE } from './combat.js';
import * as L2 from './layer2.js';

const $ = id => document.getElementById(id);
const PASS = '799879';
let ctx = { refresh: () => {}, toast: () => {}, redraw: () => {} };
let open = false;          // 이번 세션에서 비밀번호를 통과했는가 (새로고침하면 다시 묻는다)

export function initDev(c) {
  ctx = { ...ctx, ...c };
  const btn = $('devKey');
  if (btn) btn.onclick = () => (open ? showPanel() : showGate());
  $('devClose').onclick = close;
  $('devOv').onclick = e => { if (e.target.id === 'devOv') close(); };
}

const close = () => $('devOv').classList.remove('on');

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

// ── 패널 ─────────────────────────────────────────────────────
// 입력칸은 "지금 값" 으로 채워 둔다. 빈 칸으로 두고 적은 것만 반영하는 방식은
// 실수로 0 을 넣기 쉽다 — 채워 두면 안 건드린 항목이 그대로 간다는 게 눈에 보인다.
const num = v => (Number.isFinite(v) ? v : 0);

/** 골드처럼 자릿수가 큰 값을 사람이 읽고 쓰는 표기로 (1.2e15) */
const bigOut = L => (L === L0 || !Number.isFinite(L) ? '0' : Math.pow(10, L) < 1e15
  ? String(Math.round(Math.pow(10, L))) : Math.pow(10, L).toExponential(2));
/** "1e30" · "1000" · "1.5e9" 를 log10 으로. 못 읽으면 null */
function bigIn(s) {
  const v = Number(String(s).trim().replace(/[, ]/g, ''));
  if (!Number.isFinite(v) || v < 0) return null;
  return v === 0 ? L0 : fromNum(v);
}

const row = (id, label, value, hint = '') =>
  `<label class="devRow"><span>${label}${hint ? `<i>${hint}</i>` : ''}</span>
     <input id="${id}" value="${value}" autocomplete="off" inputmode="decimal"></label>`;

function showPanel() {
  $('devOv').classList.add('on');
  const mons = B.roster.monsters
    .map(m => `<option value="${m.key}">${m.name} (Lv.${L2.monLevel(m.key)})</option>`).join('');
  $('devBody').innerHTML = `
    <h3>🛠️ 개발자 모드</h3>
    <div class="devWarn">여기서 바꾼 값은 <b>실제 플레이 기록이 아닙니다.</b>
      밸런스를 볼 때는 시뮬(<code>npm run sim</code>)을 기준으로 하세요.</div>
    <div class="devGrid">
      ${row('dvSt', '현재 스테이지', num(S.st))}
      ${row('dvLife', '최고 기록', num(S.life), '해금 기준')}
      ${row('dvGold', '골드', bigOut(S.Lg), '1e30 표기 가능')}
      ${row('dvGem', '젬', num(S.gem))}
      ${row('dvShard', '조각', num(S.shard))}
      ${row('dvOre', '광석', num(S.ore))}
      ${row('dvSoul', '소울', num(S.souls))}
      ${row('dvStat', '전 스탯 레벨', '', '비우면 유지')}
    </div>
    <label class="devRow devMon"><span>몬스터 레벨</span>
      <select id="dvMonKey">${mons}</select>
      <input id="dvMonLv" value="" placeholder="레벨" inputmode="numeric"></label>
    <div class="devErr" id="devErr"></div>
    <button id="dvApply">적용</button>
    <div class="devQuick">
      <button id="dvAllMon">전 몬스터 Lv.100</button>
      <button id="dvUnlockAll">전부 해금</button>
    </div>
    <button id="dvWipe" class="devDanger">세이브 초기화</button>`;

  $('dvApply').onclick = apply;
  $('dvAllMon').onclick = () => {
    for (const m of B.roster.monsters) S.monLv[m.key] = 100;
    done('전 몬스터 Lv.100');
  };
  $('dvUnlockAll').onclick = () => {
    // 해금은 전부 life 를 본다. 가장 깊은 해금 요구치까지 올리면 전부 열린다.
    const deepest = Math.max(
      ...B.roster.monsters.map(m => m.unlock || 1),
      ...STAT_KEYS.map(k => B.stats[k].reqStage || 1),
      B.prestige?.unlockStage || 1);
    S.life = Math.max(S.life, deepest);
    done('전부 해금 (최고 기록 ' + S.life + ')');
  };
  $('dvWipe').onclick = () => {
    if (!confirm('세이브를 전부 지웁니다. 되돌릴 수 없습니다. 계속할까요?')) return;
    wipe();
    Object.assign(S, defaults());
    done('세이브 초기화 — 새로고침하세요');
  };
}

/** 적용 후 공통 처리 */
function done(msg) {
  save();
  ctx.redraw();           // 열려 있는 패널 (성장의 조각·광석, 강화의 스탯 레벨 …)
  ctx.refresh();          // 상단 HUD
  ctx.toast('🛠️ ' + msg);
  showPanel();            // 입력칸을 새 값으로 다시 채운다
}

function apply() {
  const err = [];
  const int = (id, lo, hi) => {
    const raw = $(id).value.trim();
    if (raw === '') return null;                  // 비우면 유지
    const v = Math.floor(Number(raw.replace(/[, ]/g, '')));
    if (!Number.isFinite(v) || v < lo || (hi !== undefined && v > hi)) { err.push(id); return null; }
    return v;
  };

  const st = int('dvSt', 1), life = int('dvLife', 1);
  const gem = int('dvGem', 0), shard = int('dvShard', 0), ore = int('dvOre', 0), soul = int('dvSoul', 0);
  const statLv = int('dvStat', 0);
  const monLv = int('dvMonLv', 0);
  const goldRaw = $('dvGold').value.trim();
  const Lg = goldRaw === '' ? null : bigIn(goldRaw);
  if (goldRaw !== '' && Lg === null) err.push('dvGold');

  if (err.length) {
    $('devErr').textContent = '숫자를 다시 확인하세요';
    for (const id of err) $(id).classList.add('bad');
    return;
  }

  if (gem !== null) S.gem = gem;
  if (shard !== null) S.shard = shard;
  if (ore !== null) S.ore = ore;
  if (soul !== null) S.souls = soul;
  if (Lg !== null) S.Lg = Lg;

  // 최고 기록은 현재 스테이지보다 낮을 수 없다 — 낮으면 해금이 도로 잠겨 UI 가 어긋난다
  if (life !== null) S.life = life;
  if (st !== null) { S.st = st; S.best = Math.max(S.best, st); S.life = Math.max(S.life, st); }

  if (statLv !== null) {
    for (const k of STAT_KEYS) {
      const d = B.stats[k];
      const lo = d.kind === 'mul' ? 1 : 0;        // 배수 스탯의 레벨 1 이 "배수 없음" 이다
      S.lv[k] = Math.max(lo, d.max !== undefined ? Math.min(statLv, d.max) : statLv);
    }
  }
  if (monLv !== null) S.monLv[$('dvMonKey').value] = monLv;

  // 스테이지를 옮겼으면 실제로 그리로 들어가야 화면이 따라온다
  if (st !== null) enterStage(S.st, MODE.RUN);
  done('적용됨 · 골드 ' + fmt(S.Lg));
}
