#!/usr/bin/env node
/* 신규 방치형 설계 검증 시뮬레이터 (로그 공간 버전)
 *
 * 큰 값은 전부 log10 으로 다룬다(tools/logmath.cjs) → 스테이지 50,000 까지 검증 가능.
 * 변수명 앞의 L 은 "log10 값"을 뜻한다.
 *
 * 설계 원칙은 DESIGN.md §5 참조. 이 파일의 D 객체가 모든 상수의 단일 출처다.
 *
 * 사용법:
 *   node tools/design-sim.cjs --days=30
 *   node tools/design-sim.cjs --days=365
 *   node tools/design-sim.cjs --nogacha              # 젬 레이어 제거(무과금 하한)
 *   node tools/design-sim.cjs --pullMul=3            # 과금(뽑기 3배) 비교
 *   node tools/design-sim.cjs --quiet --hpGrow=1.08  # 스윕용 한 줄 출력
 *   node tools/design-sim.cjs --bands                # 스테이지 밴드별 생존여유 진단
 */
'use strict';
const M = require('./logmath.cjs');
const { L0, fromNum, ratio, add: Ladd, sub: Lsub, fmt } = M;

const ARG = {};
for (const a of process.argv.slice(2)) { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); if (m) ARG[m[1]] = m[2] === undefined ? true : m[2]; }
const NUM = k => ARG[k] !== undefined ? +ARG[k] : undefined;
const DAYS = NUM('days') || 30;
const NOGACHA = !!ARG.nogacha;

// ── 3단계: 배속 · 지속 버프 ───────────────────────────────────
// 배속과 "10분간 골드 2배" 같은 광고 버프는 같은 기계다 — **시한부 배수**다.
// 다른 건 무엇에 곱하느냐뿐이라 하나로 모델링한다.
//
// 전투 시간(t)과 하루 수입(뽑기·레이어2)은 따로 돈다. 배속은 전투만 빠르게 하고
// 하루 수입은 그대로이므로 "전부 2배" 가 되지 않는다 — 그게 이 검증의 핵심이다.
//
//   --speed=2        항상 켜진 배속 (상시 해금안)
//   --buffmin=60     하루 중 버프가 켜진 분 (광고안: 6회 x 10분 = 60)
//   --buffmul=2      그 버프의 배수
//   --bufftype=speed|gold
// ── 오프라인: 하루 중 실제로 켜 두는 시간 ─────────────────────
// 기본은 **꺼져 있다**(24시간 연속 전투). 기존 판정과 숫자를 비교할 수 있어야 해서다.
//
//   --active=2      하루 실제 플레이 시간(시간). 0 이면 모델 끔
//   --sessions=2    하루 접속 횟수. 상한이 무는지는 플레이 시간이 아니라 **간격**이 정한다 —
//                   2시간을 2번에 나눠 하면 간격이 11시간이라 12시간 상한에 걸리지 않지만,
//                   한 번에 몰아서 하면 간격이 22시간이라 10시간을 버린다.
//   --offlineAd=2   복귀 보상 광고(2배)를 매번 본다고 가정
const ACTIVE_H = NUM('active') || 0;
const SESSIONS = Math.max(1, NUM('sessions') || 2);
const OFFLINE_AD = NUM('offlineAd') || 1;

const SPEED = NUM('speed') || 1;                 // 상시 배속
const BUFF_MIN = NUM('buffmin') || 0;            // 하루 버프 지속(분)
const BUFF_MUL = NUM('buffmul') || 2;
const BUFF_TYPE = ARG.bufftype || 'speed';
// 하루 중 버프가 켜진 비율. 시뮬의 플레이어는 24시간 싸우므로 이 비율이 곧 기여도다.
const BUFF_F = Math.max(0, Math.min(1, BUFF_MIN / 1440));
// 비율 f 동안 m 배면 전체 처리량 배수는 (1-f) + f*m 이다.
const blend = m => (1 - BUFF_F) + BUFF_F * m;
const SPEED_MUL = SPEED * (BUFF_TYPE === 'speed' ? blend(BUFF_MUL) : 1);
const GOLD_MUL = BUFF_TYPE === 'gold' ? blend(BUFF_MUL) : 1;
const LGOLD_MUL = fromNum(GOLD_MUL);

// ══════════════════════════════════════════════════ 설계 상수
// ══════════════════════════════════════════════════ 상수는 게임과 같은 파일에서 읽는다
// src/balance.json 이 단일 출처다. 여기에 수치를 중복으로 적으면 반드시 어긋난다
// (구버전 프로젝트는 시뮬이 index.html 을 정규식으로 파싱하다 그렇게 됐다).
const B = require('../src/balance.json');

const D = {
  enemy: { ...B.enemy },
  stage: {
    ...B.stage,
    // JSON 에는 함수를 못 담으므로 {base, div, cap} 로 적고 여기서 함수로 만든다
    perWave: s => Math.min(B.stage.perWave.cap, B.stage.perWave.base + Math.floor(s / B.stage.perWave.div)),
  },
  // 플레이어 행동 모델(게임 규칙이 아니라 시뮬 전용): 한 스테이지가 이보다 오래 걸릴 것 같으면
  // 사람은 앉아서 기다리지 않고 앞 스테이지를 파밍한다. 제한시간과 달리 영구 벽이 되지 않는다.
  player: { giveUpSeconds: B.player.giveUpSeconds, farmSeconds: 120 },
  stats: JSON.parse(JSON.stringify(B.stats)),
  gacha: { ...B.gacha, pullMul: 1 },
  offline: { ...B.offline },
};
const CAP_S = (D.offline.capHours || 12) * 3600;    // 오프라인 보상 상한(초)

// 보스 광폭화 — 오래 끌수록 보스 공격력이 오른다. --enrageOff 로 끈다.
const BE = D.stage.bossEnrage || { after: 1e9, perSec: 0, cap: 1 };
const enrageAt = tt => ARG.enrageOff ? 1
  : Math.min(NUM('eCap') ?? BE.cap, 1 + Math.max(0, tt - (NUM('eAfter') ?? BE.after)) * (NUM('ePerSec') ?? BE.perSec));

// ── 관문 보스 ─────────────────────────────────────────────────
// 측정상 사망 127회가 **전부 1일차** 였다. 그 뒤 364일은 한 번도 안 죽는다 —
// 실패가 "죽음" 이 아니라 "너무 느림"(포기 187,072회)으로 바뀌어 있었다.
// 관문은 **살아남는 시험**으로 되돌리는 장치다: 체력보다 공격력을 올리고 광폭화를
// 앞당긴다. 체력만 올리면 또 느려질 뿐이라 긴장이 아니라 지루함이 된다.
//
// 영구 벽이 되면 안 된다(원칙 3). 실패해도 아래서 파밍하고 다시 오면 되고,
// 전투력은 상한 없이 자라므로 언젠가는 뚫린다 — 얼마나 걸리는지를 시뮬이 답한다.
const GT = D.stage.gate || {};
const GATE = {
  on: !ARG.gateOff && (NUM('gateEvery') ?? GT.every ?? 0) > 0,
  every: NUM('gateEvery') ?? GT.every ?? 0,
  hpMul: NUM('gateHp') ?? GT.hpMul ?? 1,
  atkMul: NUM('gateAtk') ?? GT.atkMul ?? 1,
  // 한 대당 플레이어 최대 체력의 몇 %. **이게 관문의 본체다.**
  // 적 공격력을 키우는 길은 막혀 있다 — 측정상 1일차 이후 보스에게 죽으려면 ×10^6 이 필요했다.
  hpPct: NUM('gatePct') ?? GT.hpPct ?? 0,
  // 실패할수록 그 관문이 약해진다. **벽을 구조적으로 불가능하게 만드는 장치다.**
  // 이게 없으면 관문 하나에서 7~20시간씩 막힌다(실측) — 판정 1(무진행 6시간)이 깨진다.
  // 긴장은 유지된다: 처음 몇 번은 진짜로 죽고, 약화는 시도한 만큼만 쌓인다.
  weaken: NUM('gWeaken') ?? GT.weakenPerFail ?? 0,
  weakenMax: NUM('gWeakenMax') ?? GT.weakenMax ?? 0,
  after: NUM('gAfter') ?? GT.enrage?.after ?? BE.after,
  perSec: NUM('gPerSec') ?? GT.enrage?.perSec ?? BE.perSec,
  cap: NUM('gCap') ?? GT.enrage?.cap ?? BE.cap,
};
const isGate = s => GATE.on && s % GATE.every === 0;

// ── 지원형(힐러) ─────────────────────────────────────────────
// 백마법사는 **공격하지 않고 아군 체력을 채운다**. 두 방향으로 작용한다:
//   · 공격을 안 하니 그 수만큼 적 DPS 가 내려간다 (플레이어에게 유리)
//   · 아군을 채우니 적 실효 체력이 오른다 (플레이어에게 불리)
// 적의 13% 가 힐러(실측)라 어느 쪽이 큰지는 재 봐야 안다 — 그래서 구성을 정확히 모델링한다.
const HEROES = B.roster.heroes;
const SCENE = D.stage.sceneEvery || D.stage.bossEvery;
const hRot = s => HEROES[Math.floor((s - 1) / SCENE) % HEROES.length];
const hPool = s => HEROES.slice(0, Math.min(HEROES.length, Math.floor((s - 1) / SCENE) + 1));
function hHash(a, b2, c) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b);
  h ^= Math.imul(b2 + 0x165667b1, 0xc2b2ae35);
  h ^= Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h ^= h >>> 15; return h >>> 0;
}
const isSup = h => !!(h && h.support);
function foeAtSim(stage, wave, slot) {
  const lead = hRot(stage);
  const rest = hPool(stage).filter(h => h !== lead);
  if (!rest.length) return lead;
  const h = hHash(stage, wave, slot);
  if (h % 100 < D.stage.leadFoePct) return lead;
  return rest[(h >>> 8) % rest.length];
}
/** 그 웨이브의 힐러 수 (src/balance.js fixSupportOnly 와 같은 규칙) */
function supportsIn(stage, wave, n) {
  if (ARG.healOff) return 0;
  let list = [...Array(n)].map((_, i) => foeAtSim(stage, wave, i));
  if (list.length && list.every(isSup)) {
    const alt = hPool(stage).filter(h => !isSup(h));
    if (alt.length) list[list.length - 1] = alt[hHash(stage, wave, 99) % alt.length];
  }
  return list.filter(isSup).length;
}
const HEAL_PCT = NUM('healPct') ?? (HEROES.find(isSup)?.healPct ?? 0);
const gateEnrageAt = tt => ARG.enrageOff ? 1
  : Math.min(GATE.cap, 1 + Math.max(0, tt - GATE.after) * GATE.perSec);

// ══════════════════════════════════════════════════ 환생(프레스티지)
// 스테이지·골드·강화를 버리고 **영혼**을 받는다. 영혼은 피해에 곱해지며 영구다.
//
// 수식의 근거: 스테이지 s 에 도달하려면 로그 전투력이 s × log10(hpGrow) ≈ s × 0.0492 필요하다.
// 영혼이 주는 로그 보너스는 (s / soulDiv) × log10(perSoul) 이므로, 둘의 비가 곧
// **"환생 직후 예전 스테이지의 몇 %까지 즉시 돌아오는가"** 다:
//
//     복귀율 = log10(perSoul) / (soulDiv × log10(hpGrow))
//
// 이 값이 1 을 넘으면 환생할수록 공짜로 깊어져 무한 루프가 된다. 0.3~0.5 가 설계 목표다.
// soulDiv 를 키우면 영혼 개수가 읽기 좋아지지만 perSoul 이 비현실적으로 커진다 — 10 이 타협점이다.
// ⚠️ 영혼을 **자동 배수**로 주면 안 된다. 측정으로 확인했다:
//   복귀율 3% 에서도 365일 끝점이 19,668 → 138,354, 4% 이상은 연산 상한(20만)까지 폭주했다.
//   이유는 수식에 있다 — 영혼이 스테이지에 선형이면
//     S(n+1) ≥ S(n) + (복귀층/soulDiv) = S(n)·(1 + 복귀율)
//   이라 **어떤 복귀율에서도 발산한다.** 게다가 더 빨리 깊어지니 3,000층짜리 해금 절벽을
//   오히려 앞당긴다 — 고치려던 문제를 악화시킨다.
//
// 그래서 영혼은 **사서 쓰는 재화**다. 비용이 등비로 오르는 상점에서 사면
// 보너스가 영혼의 로그가 되어(레벨 N ∝ log(영혼)) 곡선이 수렴한다.
// 구조가 기존 골드 강화와 똑같아서, 이미 5판정으로 검증된 모양을 그대로 쓴다.
const PRESTIGE = {
  on: !!ARG.prestige,
  unlockStage: NUM('pUnlock') || 100,      // 첫 환생 가능 스테이지
  soulDiv: NUM('pDiv') || 10,              // 스테이지 N 당 영혼 1
  c0: NUM('pC0') || 10,                    // 영혼 상점 1레벨 가격
  g: NUM('pG') || 1.15,                    // 레벨당 가격 배수
  r: NUM('pR') || 1.08,                    // 레벨당 피해 배수
  at: NUM('pAt') || 2,                     // 지금 영혼의 몇 배를 더 받을 수 있으면 환생하는가
};
const soulsFor = stage => Math.floor(stage / PRESTIGE.soulDiv);

// ── 리드 몬스터 고유 능력 (src/stats.js 의 ab() 와 같은 규칙) ──
// 전부 사이드그레이드여야 한다 — 하나가 지배적이면 선택이 사라지고 곡선도 밀린다.
// --lead=<key> 로 바꿔 가며 돌려 끝점이 좁은 띠 안에 있는지 확인한다.
const LEAD = ARG.lead || B.roster.monsters[0].key;
const LEAD_AB = (B.roster.monsters.find(m => m.key === LEAD) || {}).ability || {};
const ab = (k, dflt = 1) => (typeof LEAD_AB[k] === 'number' ? LEAD_AB[k] : dflt);

/** 영혼 N 개로 살 수 있는 최대 레벨. 등비수열 합의 역함수. */
function soulLv(souls) {
  if (souls < PRESTIGE.c0) return 0;
  return Math.floor(Math.log(1 + souls * (PRESTIGE.g - 1) / PRESTIGE.c0) / Math.log(PRESTIGE.g));
}

// ══════════════════════════════════════════════════ 가챠 레이어
// 보유 효과만이 아니라 장착 효과까지 모델링한다.
// 그러려면 "총합"이 아니라 "등급별 보유량"을 들고 있어야 한다 — 장착은 상위 N개만 쓰기 때문이다.
// 결정론적 시뮬이라 개수는 기대값(소수)으로 둔다.
const GACHA = {
  banners: B.gacha.banners,                          // slots / slotUnlock 이 필요해 객체 그대로
  keys: B.gacha.banners.map(b => b.key),
  lvThresh: B.gacha.lvThresh,
  table: B.gacha.table,
  owned: B.gacha.rarities.map(r => r.owned),
  equipped: B.gacha.rarities.map(r => r.equipped),
  types: B.gacha.itemTypes,                          // 종류가 많을수록 3개 모으기가 느리다
  R: B.gacha.rarities.length,
};
function bannerLv(pulls) {
  let lv = 1;
  for (let i = 0; i < GACHA.lvThresh.length; i++) if (pulls >= GACHA.lvThresh[i]) lv = i + 1;
  return lv;
}
/** 뽑기 1회를 "종류당 기대 보유량"에 더한다 */
function addPull(cnt, pulls) {
  const t = GACHA.table[bannerLv(pulls) - 1];
  for (let r = 0; r < GACHA.R; r++) cnt[r] += (t[r] / 100) / GACHA.types;
}
/** 같은 종류 3개 → 상위 1개. 게임의 일괄 융합과 같은 규칙 */
function fuse(cnt) {
  for (let r = 0; r < GACHA.R - 1; r++) {
    const p = Math.floor(cnt[r] / B.gacha.fuse.sameRarityToPromote);
    if (p > 0) { cnt[r] -= p * B.gacha.fuse.sameRarityToPromote; cnt[r + 1] += p; }
  }
}
/** 보유 효과 합(%) — 가진 것 전부 */
function ownSum(cnt) {
  let s = 0;
  for (let r = 0; r < GACHA.R; r++) s += GACHA.types * cnt[r] * GACHA.owned[r];
  return s;
}
/** 장착 효과 합(%) — 상위 등급부터 슬롯을 채운다 */
function eqSum(cnt, slots) {
  let left = slots, s = 0;
  for (let r = GACHA.R - 1; r >= 0 && left > 0; r--) {
    const have = Math.min(left, GACHA.types * cnt[r]);
    if (have > 0) { s += have * GACHA.equipped[r]; left -= have; }
  }
  return s;
}
// ══════════════════════════════════════════════════ 2단계 레이어
// 광산(조각·광석) → 몬스터 수집(레벨) → 마스터리(승산) / 연구(승산)
// 핵심은 "시간에 복리로 붙는 승산"이다. 가챠 보유 효과는 시간에 선형으로만 쌓여
// 장기 곡선이 죽는데(§6 ⚠️1), 마스터리·연구가 그 자리를 메운다.
const L2 = B.layer2;
const NOL2 = !!ARG.nolayer2;

function layer2Day(S) {
  if (NOL2) return;
  const m = L2.mine;
  const mult = (1 + S.best / m.depthDiv) * (1 + m.adBonus);   // 깊이 갈수록 더 깊이 판다
  S.shards += m.shardPerDay * mult;
  S.ore += m.orePerDay * mult;

  // 몬스터 10종을 고르게 키운다 → 레벨 비용이 레벨에 비례하므로 총 레벨은 조각의 제곱근
  const unit = L2.collect.shardCostPerLevel / L2.collect.monsters;
  S.monLv = Math.floor((-1 + Math.sqrt(1 + (8 * S.shards) / unit)) / 2);
  const per = S.monLv / L2.collect.monsters;
  S.milestones = L2.collect.monsters * L2.collect.milestoneLevels.filter(x => per >= x).length;

  // 연구: 광석과 "하루 24시간"이 허락하는 만큼만
  const r = L2.research;
  let hours = 0;
  for (let guard = 0; guard < 500; guard++) {
    const cost = r.oreC0 * Math.pow(r.oreGrow, S.rsLv);
    const wait = Math.min(r.maxHours, r.baseHours * Math.pow(r.hourGrow, S.rsLv));
    if (S.ore < cost || hours + wait > 24) break;
    S.ore -= cost; hours += wait; S.rsLv++;
  }
}
// 마스터리 포인트는 3노드(공격·체력·광폭)에 고르게 분배된다고 본다.
// 피해에 기여하는 건 공격·광폭 둘이고 체력은 생존으로 간다.
const masteryPts = S => (NOL2 ? 0 : S.monLv) / L2.mastery.nodes.length;
/** 2단계가 공격력에 주는 로그 배수 */
function Llayer2Atk(S) {
  if (NOL2) return 0;
  return masteryPts(S) * fromNum(L2.mastery.perPoint)         // 마스터리 공격 노드
       + S.rsLv * fromNum(L2.research.atkPerLevel)            // 연구 (승산)
       + fromNum(1 + S.milestones * L2.collect.milestoneAtkPct / 100);   // 수집 마일스톤 (가산)
}
/** 체력 노드 */
const Llayer2Hp = S => (NOL2 ? 0 : masteryPts(S) * fromNum(L2.mastery.perPoint));
/** 광폭 노드 — DPS 에 곱해진다 */
const Llayer2Dps = S => (NOL2 ? 0 : masteryPts(S) * fromNum(L2.mastery.perPoint));

/** 진행도에 따라 열린 슬롯 수 */
const activeSlots = (b, best) => b.slotUnlock.filter(u => best >= u).length;
/** own/eq 는 자주 읽히므로 캐시한다 (뽑기 후와 스테이지 상승 시에만 갱신) */
function refreshGacha(S) {
  for (const b of GACHA.banners) {
    S.own[b.key] = ownSum(S.cnt[b.key]);
    S.eqv[b.key] = eqSum(S.cnt[b.key], activeSlots(b, S.life));
  }
}
// CLI 오버라이드
if (NUM('hpGrow')   !== undefined) D.enemy.hpGrow   = NUM('hpGrow');
if (NUM('atkGrow')  !== undefined) D.enemy.atkGrow  = NUM('atkGrow');
if (NUM('goldGrow') !== undefined) D.enemy.goldGrow = NUM('goldGrow');
if (NUM('defR')     !== undefined) D.stats.def.r    = NUM('defR');
if (NUM('costG')    !== undefined) for (const k of ['atk', 'hp', 'def']) D.stats[k].g = NUM('costG');
if (NUM('statR')    !== undefined) D.stats.atk.r = D.stats.hp.r = NUM('statR');
if (NUM('c0mul')    !== undefined) for (const k of ['atk', 'hp', 'def']) D.stats[k].c0 *= NUM('c0mul');
if (NUM('gems')     !== undefined) D.gacha.gemsPerDay = NUM('gems');

// ── 기간 이벤트의 젬 수입 ───────────────────────────────────
// 이벤트는 트랙 보상을 젬으로만 준다. 밸런스상 하는 일은 **젬 수입을 올리는 것** 뿐이라,
// 모델은 한 줄이면 된다: 하루 평균 추가 젬 = gemBudgetPerDay × 평소 수입 × 가동률.
//
// 기본 가동률 1.0 은 **연중 이벤트가 끊기지 않는다**는 상한 가정이다. 실제 일정은
// 이보다 성기므로, 여기서 5판정이 버티면 어떤 일정에서도 버틴다.
// --eventOff 로 끄고, --eventUptime=0.5 로 느슨하게 본다.
const EV_CFG = B.events || {};
const EV_UPTIME = ARG.eventOff ? 0 : (NUM('eventUptime') ?? 1);
const EV_BUDGET = NUM('eventBudget') ?? (EV_CFG.gemBudgetPerDay || 0);
const EV_GEMS = D.gacha.gemsPerDay * EV_BUDGET * EV_UPTIME;
D.gacha.gemsPerDay += EV_GEMS;
if (NUM('pullMul')  !== undefined) D.gacha.pullMul = NUM('pullMul');
if (NUM('giveUp')   !== undefined) D.player.giveUpSeconds = NUM('giveUp');
if (NUM('waves')    !== undefined) D.stage.waves = NUM('waves');
if (NUM('perWaveDiv') !== undefined) { const v = NUM('perWaveDiv'); D.stage.perWave = s => Math.min(4, 2 + Math.floor(s / v)); }
if (NUM('hp0')      !== undefined) D.stats.hp.base = NUM('hp0');

// 미리 계산한 로그 상수
const LG = {
  hp0: fromNum(D.enemy.hp0), hpGrow: fromNum(D.enemy.hpGrow),
  atk0: fromNum(D.enemy.atk0), atkGrow: fromNum(D.enemy.atkGrow),
  gold0: fromNum(D.enemy.gold0), goldGrow: fromNum(D.enemy.goldGrow),
  bossHp: fromNum(D.stage.bossHpMul), bossAtk: fromNum(D.stage.bossAtkMul), bossGold: fromNum(D.stage.bossGoldMul),
};
for (const k of Object.keys(D.stats)) {
  const d = D.stats[k];
  // c0log = log10 가격. 깊은 층 해금 스탯은 10^1000 을 넘어 double 로 못 적는다(src/balance.js 와 동일)
  d.Lc0 = d.c0log !== undefined ? d.c0log : fromNum(d.c0); d.Lg = fromNum(d.g);
  if (d.kind === 'mul') { d.Lbase = fromNum(d.base); d.Lr = fromNum(d.r); }
}

// ══════════════════════════════════════════════════ 상태 & 스탯
function newState() {
  const lv = {}; for (const k of Object.keys(D.stats)) lv[k] = (D.stats[k].kind === 'mul' ? 1 : 0);
  const cnt = {}, own = {}, eqv = {}, bp = {};
  for (const k of GACHA.keys) { cnt[k] = new Float64Array(GACHA.R); own[k] = 0; eqv[k] = 0; bp[k] = 0; }
  return { Lgold: L0, lv, stage: 1, best: 1, pulls: 0,
           bp,            // 배너별 누적 뽑기
           cnt,           // 배너별 "종류당" 등급별 기대 보유량
           own, eqv,      // 보유 / 장착 효과 합(%) 캐시
           shards: 0, ore: 0, monLv: 0, milestones: 0, rsLv: 0,     // 2단계
           souls: 0, life: 1 };    // 환생: best=이번 회차 / life=영구 최고 기록(해금 기준)
}

/**
 * 환생 한 번. 스테이지·골드·강화만 버린다 —
 * 가챠·마스터리·연구·수집은 **하루 수입에 묶여 있어서** 같이 지우면 하루를 통째로 날리는 꼴이 된다.
 */
function doPrestige(S) {
  S.souls += soulsFor(S.best);
  S.Lgold = L0;
  for (const k of Object.keys(D.stats)) S.lv[k] = (D.stats[k].kind === 'mul' ? 1 : 0);
  S.stage = 1; S.best = 1;   // life 는 그대로 — 해금과 로드맵은 영구다
}
const SD = k => D.stats[k];
function unlocked(S, k) {
  const d = SD(k);
  if (d.reqStage && S.life < d.reqStage) return false;
  if (d.req && S.lv[d.req[0]] < d.req[1]) return false;
  return true;
}
const maxed = (S, k) => { const d = SD(k); return d.max !== undefined && S.lv[k] >= d.max; };
const Lcost = (S, k) => { const d = SD(k); return d.Lc0 + S.lv[k] * d.Lg; };
const Lval = (S, k) => { const d = SD(k); return d.Lbase + (S.lv[k] - (d.base === 1 ? 0 : 1)) * d.Lr; };   // 'mul' → log10
const nval = (S, k) => {                                                                                    // 'add' → 실수
  const d = SD(k);
  let v = d.base + d.a * S.lv[k];
  if (k === 'aspd' || k === 'cdmg' || k === 'rec') v *= ab(k);
  if (k === 'crit') v = Math.max(0, v + ab('critAdd', 0));
  if (k === 'dbl') v = Math.max(0, v + ab('dblAdd', 0));   // 아라크네 맹독
  return v;
};

// 배너별 보유 효과 합(%)이 각각 다른 축을 곱한다:
//   장비 → 공격력(+체력 절반), 동료 → DPS, 스킬 → 보스 버스트
// 보유 효과 + 장착 효과가 같은 축에 곱해진다
const gE = S => NOGACHA ? 0 : S.own.equip + S.eqv.equip;
const gS = S => NOGACHA ? 0 : S.own.skill + S.eqv.skill;
const gC = S => NOGACHA ? 0 : S.own.comp + S.eqv.comp;
const Lburst = S => fromNum(1.5 * (1 + gS(S) / 100));
// 상급공격력은 해금 전에는 ×1 이어야 한다 (게임과 동일)
// 공격·체력 배수 트랙 — src/stats.js 와 같은 규칙(balance.json 의 `track`)을 쓴다.
// 키를 박아 두면 깊은 층 해금 스탯을 넣을 때마다 양쪽을 고쳐야 한다.
const TRACK = t => Object.keys(D.stats).filter(k => D.stats[k].kind === 'mul' && D.stats[k].track === t);
const ATK_T = TRACK('atk'), HP_T = TRACK('hp');
const Ltrack = (S, ks) => ks.reduce((a, k) => a + (unlocked(S, k) ? Lval(S, k) : 0), 0);

const LATK = S => Ltrack(S, ATK_T) + fromNum(1 + gE(S) / 100) + Llayer2Atk(S);
const LHP  = S => Ltrack(S, HP_T) + fromNum((1 + gE(S) / 200) * ab('hp')) + Llayer2Hp(S);
const LDEF = S => Lval(S, 'def') + fromNum(ab('dr'));
// 환생 보너스(로그). 영혼으로 산 레벨 × 레벨당 배수 — 승산이라 로그에서는 덧셈이다.
// soulLv 가 영혼의 로그라서 이 항 자체가 로그로 자란다 = 수렴한다.
const Lsoul = S => soulLv(S.souls) * Math.log10(PRESTIGE.r);

function LDPS(S, boss) {
  const critF = 1 + Math.min(1, nval(S, 'crit')) * (nval(S, 'cdmg') - 1);
  const shots = 1 + Math.min(1, nval(S, 'dbl')) + Math.min(1, nval(S, 'trp'));
  const nrmF = boss ? 1 : 1 + nval(S, 'nrm');
  let L = LATK(S) + Llayer2Dps(S) + fromNum(critF * shots * nrmF * nval(S, 'aspd') * (1 + gC(S) / 100)
                                     * ab('dmg') * (boss ? ab('boss') : ab('nrm')));
  if (boss) L += Lburst(S);
  return L + Lsoul(S);
}

const isBoss = s => s % D.stage.bossEvery === 0;
const LgateHp  = s => isGate(s) ? fromNum(GATE.hpMul) : 0;
const LgateAtk = s => isGate(s) ? fromNum(GATE.atkMul) : 0;
const LeHP   = (s, b) => LG.hp0  + (s - 1) * LG.hpGrow   + (b ? LG.bossHp : 0) + LgateHp(s);
const LeATK  = (s, b) => LG.atk0 + (s - 1) * LG.atkGrow  + (b ? LG.bossAtk : 0) + LgateAtk(s);
const LeGOLD = (s, b) => LG.gold0 + (s - 1) * LG.goldGrow + (b ? LG.bossGold : 0) + fromNum(ab('gold'));

const Linc = (S, s, b) => LeATK(s, b) + fromNum(D.enemy.aspd * (b ? 1 : D.stage.perWave(s))) - LDEF(S);

// 자리를 비운 동안의 초당 골드. src/offline.js 의 LgoldPerSec 과 같은 식이어야 한다
// (게임은 "최고 클리어 직전 스테이지" 기준으로 준다).
function LgoldPerSec(S, stage) {
  const b = isBoss(stage);
  const ttk = ratio(LeHP(stage, b), LDPS(S, b));
  if (!(ttk > 0) || !isFinite(ttk)) return L0;
  return LeGOLD(stage, b) - fromNum(ttk);
}
function Lpower(S, s) {
  const b = isBoss(s), waves = b ? 1 : D.stage.waves;
  const Lehp = LHP(S) + fromNum(1 + (waves - 1) * nval(S, 'rec'));
  return LDPS(S, b) + Lehp - Linc(S, s, b);
}

// ══════════════════════════════════════════════════ 지출 정책
// 등비수열 합의 로그: log10( (g^N - 1) / (g - 1) )  — N 이 커도 오버플로하지 않게
function LgeoSum(Lg, g, N) {
  const LgN = N * Lg;
  if (LgN > 12) return LgN - Math.log10(g - 1);
  return Math.log10((Math.pow(g, N) - 1) / (g - 1));
}
function spend(S) {
  for (let iter = 0; iter < 400; iter++) {
    const p0 = Lpower(S, S.stage);
    let best = null;
    for (const k of Object.keys(D.stats)) {
      if (!unlocked(S, k) || maxed(S, k)) continue;
      const c = Lcost(S, k); if (c > S.Lgold) continue;
      S.lv[k]++; const gain = ratio(Lpower(S, S.stage), p0) - 1; S.lv[k]--;
      if (!(gain > 0)) continue;
      const score = Math.log10(gain) - c;        // gain/cost 를 로그로 비교
      if (!best || score > best.score) best = { k, c, score };
    }
    if (!best) return;
    const d = SD(best.k);
    // 한 레벨씩 사면 후반에 수억 번 반복된다 → 살 수 있는 양의 1/4씩 묶어서 구매.
    // (1/4 로 쪼개는 이유: 한 트랙에 전부 쏟지 않고 트랙 간 균형을 유지하기 위해)
    const afford = Math.pow(10, Math.min(300, S.Lgold - best.c));
    let N = Math.floor(Math.log(1 + afford * (d.g - 1)) / Math.log(d.g));
    N = Math.max(1, Math.min(Math.floor(N / 4), 10000));
    if (d.max !== undefined) N = Math.min(N, d.max - S.lv[best.k]);
    if (N < 1) N = 1;
    const paid = best.c + LgeoSum(d.Lg, d.g, N);
    if (paid > S.Lgold) { S.Lgold = Lsub(S.Lgold, best.c); S.lv[best.k]++; continue; }
    S.Lgold = Lsub(S.Lgold, paid); S.lv[best.k] += N;
  }
}

// ══════════════════════════════════════════════════ 스테이지 1회 시도
// 전투 중 회복 없음. 웨이브 사이에만 회복. 제한시간 없음 — 실패는 사망 또는 "너무 느림"(플레이어 포기).
function attempt(S, s) {
  const b = isBoss(s), gate = isGate(s);
  const waves = b ? 1 : D.stage.waves;
  const per = b ? 1 : D.stage.perWave(s);
  const Lhp0 = LHP(S), Ldps = LDPS(S, b), Lehp = LeHP(s, b), Leatk = LeATK(s, b), Ldef = LDEF(S);
  const Lrec = fromNum(nval(S, 'rec'));
  let Lhp = Lhp0, t = 0, Lgold = L0;

  // ── 힐러 ──
  // 보스는 힐러가 아니다(bossHeroAt 가 막는다). 잡몹 웨이브만 본다.
  // 힐러는 **공격하지 않고** 아군을 초당 healPct×최대체력 만큼 채운다.
  // 그래서 실효 DPS 가 그만큼 깎인다 — 깎인 뒤가 0 이하면 아무리 때려도 안 죽는다.
  const sup = b ? 0 : supportsIn(s, 0, per);
  // **로그로 계산한다.** 선형으로 바꾸면 깊은 층 적 체력(10^300+)이 Infinity 가 되어
  // 멀쩡한 설정도 벽으로 보인다 — 실제로 한 번 그렇게 재서 16,063 을 6,235 로 오판했다.
  // 초당 회복량 = sup × healPct × 적최대체력 × 공격속도.
  const Lheal = (sup > 0 && HEAL_PCT > 0)
    ? Lehp + fromNum(sup * HEAL_PCT * D.enemy.aspd) : L0;
  const Leff = Lheal > L0 ? Lsub(Ldps, Lheal) : Ldps;   // 회복을 뺀 실효 DPS
  const ttk = (b || Lheal <= L0) ? ratio(Lehp, Ldps)
    : (Leff > L0 ? ratio(Lehp, Leff) : Infinity);       // 회복이 DPS 를 넘으면 안 죽는다
  // 너무 느릴 것 같으면 즉시 판단해서 그만둔다 — 시간을 소모하지 않는다.
  // (여기서 giveUpSeconds 를 흘려보내면 타임라인이 포기 사이클로 뒤덮인다)
  if (!(ttk >= 0) || !isFinite(ttk) || ttk * per * waves > D.player.giveUpSeconds)
    return { win: false, reason: 'slow', elapsed: 0, Lgold };

  // ── 관문: 최대 체력 비례 피해 ──
  // 한 대당 maxHP × hpPct 라 스탯으로 못 피한다. 적 공격속도 × 전투시간 = 맞는 횟수이므로
  // **빨리 못 죽이면 반드시 죽는다**. 광폭화는 그 비율을 키워 시간을 더 조인다.
  // 이게 관문의 전부다 — 나머지(hpMul·atkMul)는 연출용 보조다.
  if (gate && GATE.hpPct > 0) {
    const hits = ttk * D.enemy.aspd;
    const enr = gateEnrageAt(ttk / 2);          // 전투 중간값으로 근사
    // 실패한 만큼 피해가 줄어든다 — 시도할수록 반드시 뚫린다(영구 벽 방지)
    const fails = S.gateFail?.get(s) || 0;
    const soft = Math.max(1 - GATE.weakenMax, 1 - fails * GATE.weaken);
    if (GATE.hpPct * soft * hits * enr >= 1) {
      if (!S.gateFail) S.gateFail = new Map();
      S.gateFail.set(s, fails + 1);
      return { win: false, reason: 'dead', elapsed: ttk, Lgold };
    }
  }
  for (let w = 0; w < waves; w++) {
    let alive = per;
    while (alive > 0) {
      t += ttk;
      // 보스전만 광폭화가 붙는다 (b). t 는 이 스테이지에서 흐른 시간.
      // 힐러는 때리지 않는다 — 살아있는 수가 아니라 **공격하는 수** 에 비례한다
      const hitters = b ? alive : Math.max(0, alive - Math.min(sup, alive));
      if (hitters <= 0) { alive--; Lgold = Ladd(Lgold, LeGOLD(s, b)); continue; }
      const Ldmg = Leatk + fromNum(D.enemy.aspd * hitters) - Ldef + fromNum(ttk)
        + (b ? fromNum(gate ? gateEnrageAt(t) : enrageAt(t)) : 0);
      if (Ldmg >= Lhp) return { win: false, reason: 'dead', elapsed: t, Lgold };
      Lhp = Lsub(Lhp, Ldmg);
      alive--; Lgold = Ladd(Lgold, LeGOLD(s, b));
    }
    if (Lrec > L0) Lhp = Math.min(Lhp0, Ladd(Lhp, Lhp0 + Lrec));
  }
  return { win: true, elapsed: t, Lgold };
}

// ══════════════════════════════════════════════════ 메인 루프
function run() {
  const S = newState();
  const log = [], daily = [];
  let t = 0, deaths = 0, slows = 0, lastUp = 0, stall = 0, farmT = 0, nextLog = 2, day = 0;
  const gstat = { tries: 0, win: 0, slow: 0, dead: 0, stallS: 0 };   // 관문 계측
  const deadLog = [];
  const LOG_CAP = 20000; let logEvery = 1;      // 스냅샷 메모리 상한 (아래 솎아내기 참조)
  const T = DAYS * 86400;
  // 배너당 하루 뽑기 = 광고 무료 + (젬 수입 ÷ 뽑기비용) ÷ 배너 수
  const perBanner = (D.gacha.freeAdPullsPerBanner + (D.gacha.gemsPerDay / D.gacha.costPerPull) / GACHA.keys.length) * D.gacha.pullMul;
  const pullsPerDay = Math.round(perBanner * GACHA.keys.length);
  const addPulls = () => {
    for (const k of GACHA.keys) {
      const n = Math.round(perBanner);
      for (let i = 0; i < n; i++) { addPull(S.cnt[k], S.bp[k]); S.bp[k]++; }
      fuse(S.cnt[k]);          // 플레이어는 일괄 융합을 누른다고 본다
      S.pulls += n;
    }
    refreshGacha(S);
  };

  const snap = () => ({ stage: S.stage, life: S.life, souls: S.souls, t, Ldps: LDPS(S, false), Lhp: LHP(S), Ldef: LDEF(S), pulls: S.pulls,
                        bLv: bannerLv(S.bp.equip), own: { ...S.own }, eqv: { ...S.eqv }, lv: { ...S.lv },
                        monLv: S.monLv, rsLv: S.rsLv });
  daily.push({ day: 0, ...snap() });

  // 한 세션이 끝나면 자리를 비우고, 돌아올 때 상한까지만 보상을 받는다.
  // ACTIVE_H=0 이면 sessionCombat 이 Infinity 라 예전처럼 24시간 내리 싸운다.
  const sessionCombat = ACTIVE_H ? ACTIVE_H * 3600 / SESSIONS : Infinity;
  const gapS = ACTIVE_H ? (24 - ACTIVE_H) * 3600 / SESSIONS : 0;
  let sessionT = 0, offlineS = 0, lostS = 0, sessions = 0, prestiges = 0;

  while (t < T) {
    const d2 = Math.floor(t / 86400);
    if (d2 > day) { day = d2; addPulls(); layer2Day(S); daily.push({ day, ...snap() }); }

    const t0 = t;
    const atGate = isGate(S.stage);
    const r = attempt(S, S.stage);
    if (atGate) { gstat.tries++; if (r.win) gstat.win++; else if (r.reason === 'dead') gstat.dead++; else gstat.slow++; }
    S.Lgold = Ladd(S.Lgold, r.Lgold + LGOLD_MUL); spend(S);
    t += r.elapsed / SPEED_MUL;        // 배속은 전투 시간만 줄인다 (하루 수입은 그대로)

    if (r.win) {
      S.stage++;
      if (S.stage > S.best) { S.best = S.stage; if (S.best > S.life) S.life = S.best; refreshGacha(S); }
      // 스테이지마다 스냅샷을 쌓으면 폭주 설정(스테이지 20만)에서 힙이 터진다(실측 4GB OOM).
      // 상한에 닿으면 절반으로 솎아내고 기록 간격을 2배로 늘려 메모리를 일정하게 유지한다.
      while (nextLog <= S.stage) {
        if (nextLog < 200 || nextLog % logEvery === 0) log.push(snap());
        nextLog++;
      }
      if (log.length > LOG_CAP) {
        let w = 0;
        for (let i = 0; i < log.length; i += 2) log[w++] = log[i];
        log.length = w;
        logEvery *= 2;
      }
      lastUp = t;
    } else {
      // 사망이 **언제 · 어디서** 나는지 남긴다. 총 횟수만 보면 365일 평균에 희석돼
      // "첫 1시간 무사망" 같은 체감 문제가 판정을 통과해 버린다.
      if (r.reason === 'dead' && deadLog.length < 4000) deadLog.push({ stage: S.stage, t, boss: isBoss(S.stage) });
      r.reason === 'dead' ? deaths++ : slows++;
      const fs = Math.max(1, S.stage - 1), fb = isBoss(fs);
      const ttkF = ratio(LeHP(fs, fb), LDPS(S, fb));
      const kills = Math.max(0, Math.min(D.player.farmSeconds * SPEED_MUL / Math.max(ttkF, 1e-6), 1e4));
      if (kills > 0) S.Lgold = Ladd(S.Lgold, LeGOLD(fs, fb) + fromNum(kills) + LGOLD_MUL);
      spend(S);
      t += D.player.farmSeconds; farmT += D.player.farmSeconds;
    }
    // ── 환생 판단 ──
    // 사람은 "지금 가진 것의 몇 배는 돼야 리셋한다" 로 생각한다. 그 배수가 pAt 다.
    // 첫 환생만 unlockStage 로 따로 막는다(영혼 0 이면 어떤 배수든 0 이라 즉시 통과한다).
    if (PRESTIGE.on && S.best >= PRESTIGE.unlockStage
        && soulsFor(S.best) >= Math.max(1, S.souls * PRESTIGE.at)) {
      doPrestige(S); prestiges++;
      refreshGacha(S);          // 해금은 life 기준이라 그대로지만 캐시는 다시 계산한다
      spend(S);
      lastUp = t;               // 스스로 되돌린 것은 '무진행' 이 아니다
    }

    // ── 세션 종료 → 자리를 비운다 ──
    sessionT += t - t0;
    if (sessionT >= sessionCombat) {
      sessionT = 0; sessions++;
      // 게임과 같은 기준: 최고 클리어 **직전** 스테이지의 초당 골드 × 상한까지의 시간
      const credit = Math.min(gapS, CAP_S);
      const Lps = LgoldPerSec(S, Math.max(1, S.best - 1));
      if (Lps > L0 && isFinite(Lps)) S.Lgold = Ladd(S.Lgold, Lps + fromNum(credit) + fromNum(OFFLINE_AD));
      offlineS += credit; lostS += gapS - credit;
      t += gapS;
      // 자리를 비운 것은 **무진행이 아니다.** lastUp 을 같이 밀지 않으면 공백이 그대로
      // "벽" 으로 잡혀서 아래 24시간 중단 조건에 걸린다.
      lastUp += gapS;
      spend(S);                                // 돌아오면 모아둔 골드를 쓴다
    }

    if (t - lastUp > stall) stall = t - lastUp;
    if (t - lastUp > 24 * 3600) break;        // 24시간 무진행 = 벽으로 보고 중단
    if (S.stage > 200000) break;              // 수치가 아니라 연산량 상한
  }
  return { S, log, daily, deaths, slows, t, stall, farmT, pullsPerDay, deadLog, offlineS, lostS, sessions, prestiges, gstat };
}

// ══════════════════════════════════════════════════ 지표 & 출력
function margins(R) {
  // 생존여유 = 버티는 시간 ÷ 스테이지 클리어에 필요한 전투 시간
  return R.log.map(e => {
    const s = e.stage, per = D.stage.perWave(s);
    // 웨이브 간 회복을 포함한 실효 체력 (전투 중 회복은 없지만 웨이브 사이에는 있다)
    const rec = D.stats.rec.base + D.stats.rec.a * e.lv.rec;
    const Lehp = e.Lhp + fromNum(1 + (D.stage.waves - 1) * rec);
    const Lsurv = Lehp - (LeATK(s, false) + fromNum(D.enemy.aspd * per) - e.Ldef);
    const need = ratio(LeHP(s, false), e.Ldps) * per * D.stage.waves;
    return { stage: s, margin: ratio(Lsurv, fromNum(need)), clear: need, ttk: ratio(LeHP(s, false), e.Ldps) };
  });
}
const hm = s => !isFinite(s) ? '∞' : s < 3600 ? Math.floor(s / 60) + '분' : s < 86400 ? (s / 3600).toFixed(1) + '시간' : (s / 86400).toFixed(1) + '일';
const f = (n, w) => String(n).padStart(w);
// 환생하면 stage 는 1 로 떨어진다 — 일자별 비교는 영구 기록(life)으로 해야 의미가 있다
const dayStage = (R, d) => { const e = R.daily.filter(x => x.day <= d).pop(); return e ? (e.life ?? e.stage) : 1; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

const R = run();
const MG = margins(R);
const worst = MG.length ? MG.reduce((a, b) => a.margin < b.margin ? a : b) : { margin: 0, stage: 0 };
// 환생하면 stage 는 1 로 떨어진다 — 상승폭은 영구 기록(life) 차이로 재야 음수가 나오지 않는다
const lifeOf = d => d.life ?? d.stage;
const incs = []; for (let i = 1; i < R.daily.length; i++) incs.push(lifeOf(R.daily[i]) - lifeOf(R.daily[i - 1]));
const early = avg(incs.slice(0, 3)), late = avg(incs.slice(-3));
const maxClear = MG.reduce((a, m) => m.clear > a ? m.clear : a, 0);   // 스프레드는 배열이 커지면 스택을 넘긴다
// 긴 실행에서는 깊은 스테이지가 표본을 지배해 중위값이 의미를 잃는다.
// 판정은 "첫 30일 동안의 체감"으로 고정한다 — 실행 길이와 무관해야 비교가 된다.
const EARLY_T = 30 * 86400;
const earlyClear = MG.filter((m, i) => (R.log[i]?.t ?? Infinity) <= EARLY_T).map(m => m.clear).sort((a, b) => a - b);
const medClear = earlyClear.length ? earlyClear[earlyClear.length >> 1] : 0;

if (ARG.quiet) {
  process.stdout.write(
    'hp' + D.enemy.hpGrow.toFixed(4) + ' atk' + D.enemy.atkGrow.toFixed(3) + ' def' + D.stats.def.r.toFixed(3) +
    ' c0x' + (NUM('c0mul') || 1) + ' p' + D.gacha.pullMul + (NOL2 ? ' [L2off]' : '') +
    ' | D1 ' + f(dayStage(R, 1), 5) + ' D7 ' + f(dayStage(R, 7), 5) + ' D30 ' + f(dayStage(R, 30), 5) + ' max ' + f(R.S.life, 6) +
    ' | ' + f(early.toFixed(0), 4) + '->' + f(late.toFixed(0), 4) + '/d' +
    ' | stall ' + f((R.stall / 3600).toFixed(1), 5) + 'h' +
    ' | marg ' + worst.margin.toFixed(2) + '@' + f(worst.stage, 5) +
    ' | clear ' + f(hm(maxClear), 7) +
    ' | dead ' + f(R.deaths, 5) + ' slow ' + f(R.slows, 5) + String.fromCharCode(10));
  process.exit(0);
}

console.log('== 설계 검증' + (NOGACHA ? ' [무과금]' : D.gacha.pullMul !== 1 ? ' [뽑기 x' + D.gacha.pullMul + ']' : '') + ' · ' + DAYS + '일 ' + '='.repeat(14));
console.log('  최고 스테이지 ' + R.S.life + '   (1일차 ' + dayStage(R, 1) + ' / 7일차 ' + dayStage(R, 7) + ' / 30일차 ' + dayStage(R, 30) + ')');
console.log('  사망 ' + R.deaths + '회  ·  너무 느려 포기 ' + R.slows + '회  ·  하루 뽑기 ' + R.pullsPerDay + '회');
console.log('  최장 무진행 ' + hm(R.stall) + '  ·  파밍 ' + hm(R.farmT) + ' / 전체 ' + hm(R.t));
if (ACTIVE_H) {
  console.log('  [오프라인] 하루 ' + ACTIVE_H + '시간 × ' + SESSIONS + '회 접속'
    + (OFFLINE_AD > 1 ? ' · 복귀광고 ×' + OFFLINE_AD : '')
    + '  ·  접속 ' + R.sessions + '회'
    + '  ·  보상받은 공백 ' + hm(R.offlineS) + '  ·  상한 초과로 버린 시간 ' + hm(R.lostS)
    + ' (상한 ' + D.offline.capHours + '시간)');
} else {
  console.log('  [오프라인] 모델 꺼짐 — 24시간 연속 전투 가정 (--active=2 로 켠다)');
}
if (PRESTIGE.on) {
  const lv = soulLv(R.S.souls);
  console.log('  [환생] ' + R.prestiges + '회  ·  영혼 ' + R.S.souls.toLocaleString()
    + '  ·  상점 Lv.' + lv + ' (보너스 10^' + (lv * Math.log10(PRESTIGE.r)).toFixed(1) + '배)'
    + '  ·  ' + PRESTIGE.soulDiv + '층당 영혼1 · 가격 ' + PRESTIGE.c0 + '×' + PRESTIGE.g + '^lv · 레벨당 ×' + PRESTIGE.r);
} else {
  console.log('  [환생] 꺼짐 (--prestige 로 켠다)');
}
console.log('  [이벤트] ' + (EV_UPTIME > 0
  ? '젬 +' + Math.round(EV_GEMS) + '/일 (예산 ' + (EV_BUDGET * 100).toFixed(0) + '% × 가동률 ' + EV_UPTIME + ')'
  : '꺼짐 (--eventOff)'));
console.log('  최장 스테이지 클리어 시간 ' + hm(maxClear) + '  (포기 임계 ' + hm(D.player.giveUpSeconds) + ')');

console.log('\n[일자별]   일  스테이지        DPS      최대HP   뽑기 배너Lv  보유%   장착% | 공격 체력 방어  상급');
for (const d of R.daily) if (d.day <= 7 || d.day % (DAYS > 60 ? 30 : 5) === 0)
  console.log('         ' + f(d.day, 4) + f(lifeOf(d), 10) + f(fmt(d.Ldps), 11) + f(fmt(d.Lhp), 12) + f(d.pulls, 7)
    + f(d.bLv, 6) + f(d.own.equip.toFixed(0), 9) + f(d.eqv.equip.toFixed(0), 10)
    + f(d.monLv, 7) + f(d.rsLv, 5)
    + ' |' + f(d.lv.atk, 5) + f(d.lv.hp, 5) + f(d.lv.adv, 7));

const step = R.S.life > 2000 ? 200 : R.S.life > 500 ? 50 : 10;
console.log('\n[스테이지]  st     도달시점     1킬     클리어필요    생존여유        적HP         DPS');
for (const m of MG) {
  if (m.stage % step !== 0) continue;
  const e = R.log.find(x => x.stage === m.stage);
  console.log('          ' + f(m.stage, 5) + f(hm(e.t), 12) + f(m.ttk.toFixed(1) + 's', 9) + f(hm(m.clear), 12)
    + f(m.margin.toFixed(2) + '배', 12) + f(fmt(LeHP(m.stage, false)), 12) + f(fmt(e.Ldps), 12));
}

if (ARG.bands) {
  console.log('\n[밴드별 생존여유]');
  const n = Math.max(1, Math.ceil(MG.length / 10));
  for (let i = 0; i < MG.length; i += n) {
    const sl = MG.slice(i, i + n); if (!sl.length) continue;
    const mn = sl.reduce((a, b) => a.margin < b.margin ? a : b);
    console.log('  st ' + f(sl[0].stage, 5) + '~' + f(sl[sl.length - 1].stage, 5)
      + '  평균 ' + f(avg(sl.map(x => x.margin)).toFixed(2), 6) + '배  최악 ' + f(mn.margin.toFixed(2), 6) + '배 @st' + mn.stage
      + '  적수 ' + D.stage.perWave(sl[0].stage));
  }
}

// 사망이 **언제** 나는지. 365일 평균 사망률은 체감을 못 본다 — 첫 1시간이 무사망이어도
// 판정은 통과한다(실제로 그랬다). 긴장이 초반에 존재하는지는 여기서만 보인다.
const DL = R.deadLog;
const deadsIn = sec => DL.filter(d => d.t <= sec).length;
console.log('\n[사망 시점]  1시간 ' + deadsIn(3600) + '회  ·  6시간 ' + deadsIn(6 * 3600)
  + '  ·  1일 ' + deadsIn(86400) + '  ·  7일 ' + deadsIn(7 * 86400) + '  ·  전체 ' + R.deaths
  + '   (보스전 ' + DL.filter(d => d.boss).length + ')');
if (DL.length) console.log('  첫 사망 ' + hm(DL[0].t) + ' @ st' + DL[0].stage + (DL[0].boss ? ' (보스)' : ''));
else console.log('  첫 사망 없음');
// **1일차 이후** 사망이 이 기능의 존재 이유다. 전체 사망률은 1일차 몰림을 가려 버린다 —
// 127회가 전부 1일차여도 "사망률 0.06%" 로 통과한다(관문 넣기 전 실측).
if (GATE.on) {
  const after = DL.filter(d => d.t > 86400);
  const atGate = DL.filter(d => isGate(d.stage));
  console.log('  [관문] ' + GATE.every + '층마다 · 체력 ×' + GATE.hpMul + ' 공격 ×' + GATE.atkMul
    + ' · 광폭 ' + GATE.after + '초후 +' + (GATE.perSec * 100).toFixed(0) + '%/초(최대 ×' + GATE.cap + ')');
  console.log('  [관문] 1일차 이후 사망 ' + after.length + '회  ·  관문에서 죽은 것 ' + atGate.length + '회'
    + (after.length ? ' · 마지막 ' + hm(after[after.length - 1].t) : ''));
  const G = R.gstat;
  console.log('  [관문] 시도 ' + G.tries + '회 → 통과 ' + G.win + ' · 사망 ' + G.dead + ' · 너무 느려 포기 ' + G.slow);
}
if (ARG.deaths) {
  console.log('\n[사망 목록 — 앞 40건]');
  for (const d of DL.slice(0, 40)) console.log('  ' + f(hm(d.t), 10) + ' st' + f(d.stage, 6) + (d.boss ? '  👑' : ''));
}

// 생존여유 지표는 보수적 추정(스테이지 진입 시점 스냅샷 + 웨이브 중 구매 미반영)이라
// 실제 치사율과 어긋난다. 판정은 실제 사망률로 한다.
const attempts = R.S.life + R.deaths + R.slows;
const deathRate = attempts ? R.deaths / attempts : 0;
const pass = [
  ['벽 없음 (무진행 < 6시간)',          R.stall < 6 * 3600],
  ['로그 곡선 (후반 < 초반 상승폭)',    late < early],
  // 사망률 하한은 실행이 길어질수록 희석돼 쓸모가 없다(365일이면 0.03%).
  // "죽긴 죽되 과하지 않다"로 본다.
  ['사망이 발생하고 10% 이하',          R.deaths > 0 && deathRate <= 0.10],
  // maxClear 는 포기임계에 클램프되므로 최댓값으로는 판정할 수 없다.
  ['첫 30일 중위 클리어 2분 이내',      medClear <= 120],
  ['골드성장 > 적체력성장 (동기 보존)', D.enemy.goldGrow > D.enemy.hpGrow],
];
console.log('\n  일별 상승폭 ' + early.toFixed(1) + ' -> ' + late.toFixed(1) + ' 스테이지/일');
console.log('  사망 ' + R.deaths + ' / 시도 ' + attempts + ' = 사망률 ' + (deathRate * 100).toFixed(2) + '%');
console.log('  생존여유(보수적 추정, 진단용) 최악 ' + worst.margin.toFixed(2) + '배 @ st' + worst.stage);
console.log('\n[판정]');
for (const [n, ok] of pass) console.log('  ' + (ok ? '✅' : '❌') + ' ' + n);
