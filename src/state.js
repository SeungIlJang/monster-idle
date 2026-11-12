// 세이브/로드. 키를 짧게, 버전 필드를 처음부터 둔다(DESIGN.md §12).
// 스탯 레벨이 수천 단위가 되므로 숫자만 저장하고 파생값은 저장하지 않는다.
import { B, STAT_KEYS } from './balance.js';
import { L0 } from './logmath.js';

const KEY = 'monsteridle';
const SAVE_VERSION = 3;

export function defaults() {
  const lv = {};
  for (const k of STAT_KEYS) lv[k] = B.stats[k].kind === 'mul' ? 1 : 0;
  return {
    v: SAVE_VERSION,
    Lg: L0,            // 골드 (log10)
    lv,                // 스탯 레벨
    st: 1,             // 현재 도전 스테이지
    best: 1,           // 이번 회차의 최고 도달 스테이지 (환생하면 1 로 돌아간다)
    life: 1,           // **영구** 최고 기록. 해금은 전부 이걸 본다 — 환생이 해금을 지우면 안 된다
    souls: 0,          // (1판) 환생 재화 — 3판 세이브부터 쓰지 않는다. 마이그레이션이 soul.Llegacy 로 옮긴다
    soul: { Lfree: L0, claim: 0, tree: {}, Llegacy: 0 },  // 환생 2판: 남은 영혼(log10) · 마지막 청구 때 life · 트리 · 1판 보너스(log10)
    echoTo: 0,         // 메아리: 이 층 아래에서는 골드 배수 (직전 회차 최고 기록)
    lives: 0,          // 환생 횟수
    farm: 0,           // 수동 파밍 스테이지 (0 = 자동)
    spd: 1,            // 전투 배속 (1 또는 2). 라이브 루프에만 걸린다
    autoSkill: true,   // 스킬 자동 발동. 끄면 쿨이 찬 채로 기다린다
    // 자동 강화. 진척의 92% 가 오프라인이라 이 게임은 사실상 "돌아와서 뭘 하느냐" 인데,
    // 돌아오면 스탯 10개에 MAX 를 하나씩 눌러야 했다 — 모든 복귀가 잡일로 시작했다.
    // 시뮬(spend)은 처음부터 탐욕 구매를 가정하므로, 켜는 쪽이 시뮬과 현실을 맞춘다.
    autoBuy: true,
    mon: 'slime',      // 선택한 리드 몬스터
    bp: { equip: 0, skill: 0, comp: 0 },   // 배너별 누적 뽑기 (= 배너 경험치)
    own: { equip: 0, skill: 0, comp: 0 },  // 배너별 보유 효과 합(%) — inv 에서 파생되는 캐시
    eqv: { equip: 0, skill: 0, comp: 0 },  // 배너별 장착 효과 합(%) — inv + best 에서 파생
    inv: { equip: {}, skill: {}, comp: {} }, // "아이템id|등급|강화" → 개수
    gem: 0,
    freeDay: '',                           // 무료 뽑기 일일 리셋 기준일
    freeUsed: { equip: 0, skill: 0, comp: 0 },
    // 던전: 키/광고 횟수는 매일 리셋, diff 는 클리어한 최고 난이도라 유지
    dun: { day: '', keys: { gold: 0, boss: 0 }, ad: { gold: 0, boss: 0 }, diff: { gold: 0, boss: 0 } },
    daily: { date: '', kill: 0, pull: 0, stage: 0, claimed: {} },
    attend: { last: '', streak: 0 },       // last 는 "받은 날" — 띄운 날이 아니다
    ev: { id: '', p: 0, claimed: {} },     // 기간 이벤트 진행 (id 가 바뀌면 통째로 버린다)
    // 관문별 실패 횟수 "스테이지번호" → 횟수. 실패할수록 그 관문이 약해진다.
    // **저장해야 한다** — 앱을 껐다 켜면 약화가 사라져 영구 벽이 될 수 있다.
    gateFail: {},
    relic: { shards: 0, n: 0 },    // 유물 조각 · 열린 수 (순서 고정이라 수만 저장)
    // 2단계 레이어
    shard: 0, ore: 0,
    mine: { pick: 0, t: 0, day: '', bomb: 0, grid: null, top: 0, depth: 0 },
    monLv: {},                             // 몬스터별 레벨 (마스터리 포인트의 원천)
    mastery: { atk: 0, hp: 0, dps: 0 },
    rs: { lv: 0, startAt: 0 },             // 연구
    t: Date.now(),     // 마지막 저장 시각 (오프라인 보상용)
  };
}

/** 저장 데이터를 현재 버전으로 올린다. 필드가 없으면 기본값으로 채운다. */
function migrate(d) {
  const base = defaults();
  if (!d || typeof d !== 'object') return base;
  // v1 이 최초 버전이라 아직 실제 변환은 없다. 누락 필드만 메운다.
  const s = { ...base, ...d, v: SAVE_VERSION };
  s.lv = { ...base.lv, ...(d.lv || {}) };
  s.bp = { ...base.bp, ...(d.bp || {}) };
  s.own = { ...base.own, ...(d.own || {}) };
  s.eqv = { ...base.eqv, ...(d.eqv || {}) };
  s.inv = { ...base.inv, ...(d.inv || {}) };
  s.freeUsed = { ...base.freeUsed, ...(d.freeUsed || {}) };
  // life 가 없던 세이브(환생 이전 버전)는 지금 기록이 곧 영구 기록이다.
  // 이걸 빼먹으면 기존 플레이어가 업데이트하는 순간 해금이 전부 잠긴다.
  s.life = Math.max(Number(s.life) || 1, Number(s.best) || 1);
  s.souls = Number.isFinite(s.souls) ? Math.max(0, Math.floor(s.souls)) : 0;
  s.lives = Number.isFinite(s.lives) ? Math.max(0, Math.floor(s.lives)) : 0;
  s.gem = Number.isFinite(s.gem) ? Math.max(0, Math.floor(s.gem)) : 0;
  s.dun = { ...base.dun, ...(d.dun || {}) };
  s.dun.keys = { ...base.dun.keys, ...(d.dun?.keys || {}) };
  s.dun.ad = { ...base.dun.ad, ...(d.dun?.ad || {}) };
  s.dun.diff = { ...base.dun.diff, ...(d.dun?.diff || {}) };
  s.daily = { ...base.daily, ...(d.daily || {}) };
  s.daily.claimed = { ...(d.daily?.claimed || {}) };
  s.attend = { ...base.attend, ...(d.attend || {}) };
  s.ev = { ...base.ev, ...(d.ev || {}) };
  s.ev.claimed = { ...(d.ev?.claimed || {}) };
  s.gateFail = { ...(d.gateFail || {}) };
  s.relic = { shards: 0, n: 0, ...(d.relic || {}) };
  s.soul = { ...base.soul, ...(d.soul || {}) };
  s.soul.tree = { ...(d.soul?.tree || {}) };
  if (!(typeof s.soul.Lfree === 'number')) s.soul.Lfree = L0;
  s.echoTo = Number(s.echoTo) || 0;
  // v3: 환생 2판. 1판 영혼(층수 비례 · 단일 상점)의 피해 보너스는 **그대로 넘긴다**(Llegacy) — 업데이트로
  // 약해지면 안 된다. claim 은 0 이라 다음 환생 때 평생 기록 전체만큼 2판 영혼을 받는다.
  if ((Number(d.v) || 1) < 3 && s.souls > 0 && !d.soul) {
    const sh = B.prestige.shop;
    const lv = s.souls < sh.c0 ? 0 : Math.floor(Math.log(1 + s.souls * (sh.g - 1) / sh.c0) / Math.log(sh.g));
    s.soul.Llegacy = lv * Math.log10(sh.r);
  }
  s.mine = { ...base.mine, ...(d.mine || {}) };
  s.monLv = { ...(d.monLv || {}) };
  s.mastery = { ...base.mastery, ...(d.mastery || {}) };
  // v2: 마스터리 노드의 뜻이 바뀌었다(광폭이 'DPS' → '보스 특화'). 예전 배분을 그대로 두면
  // 찍은 적 없는 트레이드오프가 소급 적용된다 — 한 번 전부 돌려준다.
  // 포인트 자체는 몬스터 레벨에서 나오므로 지우는 건 '어디에 썼나' 뿐이다.
  if ((Number(d.v) || 1) < 2) for (const k of Object.keys(s.mastery)) s.mastery[k] = 0;
  s.rs = { ...base.rs, ...(d.rs || {}) };
  s.shard = Number.isFinite(s.shard) ? Math.max(0, Math.floor(s.shard)) : 0;
  s.ore = Number.isFinite(s.ore) ? Math.max(0, Math.floor(s.ore)) : 0;
  // 마스터리는 보유 포인트를 넘길 수 없다 (밸런스 변경으로 레벨이 줄었을 수 있다)
  {
    const pts = Object.values(s.monLv).reduce((a, v) => a + (Number(v) || 0), 0);
    let spent = 0;
    for (const k of Object.keys(s.mastery)) {
      s.mastery[k] = Math.max(0, Math.floor(Number(s.mastery[k]) || 0));
      spent += s.mastery[k];
    }
    if (spent > pts) for (const k of Object.keys(s.mastery)) s.mastery[k] = 0;
  }
  // 밸런스 변경으로 상한이 내려갔을 수 있으니 레벨을 클램프
  for (const k of STAT_KEYS) {
    const def = B.stats[k];
    const min = def.kind === 'mul' ? 1 : 0;
    let v = Number(s.lv[k]);
    if (!Number.isFinite(v)) v = min;
    v = Math.max(min, Math.floor(v));
    if (def.max !== undefined) v = Math.min(v, def.max);
    s.lv[k] = v;
  }
  if (!Number.isFinite(s.Lg)) s.Lg = L0;
  s.spd = s.spd === 2 ? 2 : 1;
  s.autoSkill = s.autoSkill !== false;
  s.autoBuy = s.autoBuy !== false;
  s.st = Math.max(1, Math.floor(s.st) || 1);
  s.best = Math.max(s.st, Math.floor(s.best) || 1);
  return s;
}

export let S = defaults();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    // save() 가 -Infinity 를 '-inf' 문자열로 적으므로 되돌린 뒤 마이그레이션
    S = migrate(raw ? reviveNumbers(JSON.parse(raw)) : null);
  } catch (e) {
    console.warn('세이브 로드 실패, 새로 시작', e);
    S = defaults();
  }
  return S;
}

// 오프라인 보상을 **받기 전에는** 저장 시각을 붙잡아 둔다(main.js 가 건다).
// 첫 화면은 5초마다 · 페이지를 떠날 때 저장한다. 그때 시각이 '지금' 으로 바뀌면
// 첫 화면에서 언어를 바꿔 새로고침했을 때 쌓여 있던 오프라인 보상이 통째로 사라진다.
let heldT = 0;
export function holdSaveTime(t) { heldT = t || 0; }

export function save() {
  S.t = heldT || Date.now();
  try {
    // -Infinity 는 JSON 에서 null 이 되므로 문자열로 보존
    localStorage.setItem(KEY, JSON.stringify(S, (k, v) =>
      v === -Infinity ? '-inf' : v === Infinity ? 'inf' : v));
  } catch (e) {
    console.warn('세이브 저장 실패', e);
  }
}

// JSON.parse 쪽 복원
export function reviveNumbers(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === '-inf') obj[k] = -Infinity;
    else if (obj[k] === 'inf') obj[k] = Infinity;
    else if (obj[k] && typeof obj[k] === 'object') reviveNumbers(obj[k]);
  }
  return obj;
}

export function wipe() {
  try { localStorage.removeItem(KEY); } catch {}
  S = defaults();
}
