// 던전 2종 — 골드 수레 / 용사 연전 (DESIGN.md §10)
//
// 라이브 전투가 아니라 즉시 판정한다. 방치형에서 던전은 "오늘 할 일"이지 조작 거리가 아니고,
// 전투 규칙(전투 중 회복 없음·비율 감소)은 메인과 동일한 수식으로 계산하므로 결과는 일관된다.
//
// 키는 하루 2개 + 광고 2회. 재화마다 전용 던전을 붙여 메인이 막혀도 할 일이 남게 하는 구조다.
import { B, LeHP, LeATK, perWave } from './balance.js';
import { S } from './state.js';
import { LDPS, LHP, LDEF, nval } from './stats.js';
import { LgoldPerSec } from './offline.js';
import { L0, add, sub, ratio, fromNum } from './logmath.js';
import * as RELIC from './relics.js';

const D = B.dungeon;
export const DUNGEONS = D.list;

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

/** 하루가 바뀌었으면 키와 광고 횟수를 채운다 */
export function ensureKeys() {
  const t = today();
  if (S.dun.day !== t) {
    S.dun.day = t;
    for (const d of DUNGEONS) {
      S.dun.keys[d.key] = keysMax(d.key);
      S.dun.ad[d.key] = 0;
    }
  }
  // 업데이트로 새로 생긴 던전은 그날 키가 비어 있다(하루가 바뀔 때만 채우므로) — 바로 채워 준다
  for (const d of DUNGEONS) {
    if (S.dun.keys[d.key] === undefined) S.dun.keys[d.key] = keysMax(d.key);
    if (S.dun.ad[d.key] === undefined) S.dun.ad[d.key] = 0;
  }
}
const RELIC_DUN = B.relics?.dungeon || 'raid';
/** 하루 키 수. 열쇠 유물은 **마을 침공에만** 붙는다 — 용사 연전에 붙으면 젬 예산(§6)이 깨진다 */
export const keysMax = k => D.keysPerDay + (k === RELIC_DUN ? RELIC.eff('dungeonKeys') : 0);
export function keysLeft(k) { ensureKeys(); return S.dun.keys[k] ?? 0; }
export function adLeft(k) { ensureKeys(); return Math.max(0, D.adRunsPerDay - (S.dun.ad[k] ?? 0)); }

/** 클리어한 최고 난이도 (0 = 아직 없음) */
export const clearedDiff = k => S.dun.diff[k] ?? 0;
/**
 * 도전 가능한 최고 난이도 — **본편 진행도만** 본다.
 *
 * 예전엔 `clearedDiff + 1` 로 한 칸씩만 열었다. 그런데 난이도 해금은 하루 최대 4칸인데
 * 본편은 2일차에 이미 1,400층을 간다. 그래서 골드 수레 보상(기준 스테이지 = 난이도×10 에서
 * 30분 파밍)이 본편 수입의 10^-143 수준으로 떨어져 **키를 넣어도 아무 일도 안 일어났다.**
 * 격차는 영원히 벌어진다 — 본편 14,000층이면 쓸모있는 난이도 1,400 까지 350일이 걸린다.
 *
 * k 는 쓰지 않지만 호출부 시그니처를 유지한다.
 */
export const maxDiff = k => Math.max(1, Math.floor(S.life / 10) || 1);
/** 해당 난이도의 기준 스테이지 */
export const diffStage = d => d * 10;
/** 본편을 10스테이지도 못 갔으면 던전이 열리지 않는다 */
export const unlocked = () => S.life >= 10;

// ── 용사 연전 (젬) ───────────────────────────────────────────
/**
 * 용사 10명을 연달아 상대한다. 제한시간 안에 쓰러뜨린 수만큼 보상.
 * 메인과 달리 중간 회복이 없고, 누적 피해로 죽으면 거기서 끝난다.
 */
export function simulateBossRush(diff) {
  const base = diffStage(diff);
  const limit = D.timeLimit;
  const Ldps = LDPS(true);
  const Ldef = LDEF();
  let Lhp = LHP();
  let t = 0, killed = 0, died = false;

  for (let i = 0; i < D.bossCount; i++) {
    const stage = base + i * D.bossStep;
    const ttk = ratio(LeHP(stage, true), Ldps);
    if (!isFinite(ttk) || t + ttk > limit) break;
    // 그 시간 동안 보스에게 맞는다 (보스는 1마리)
    const Ldmg = LeATK(stage, true) + fromNum(B.enemy.aspd * ttk) - Ldef;
    if (Ldmg >= Lhp) { died = true; break; }
    Lhp = sub(Lhp, Ldmg);
    t += ttk;
    killed++;
  }
  const full = killed >= D.bossCount;
  // 난이도 보너스는 **로그**다. 선형(난이도당 +10)이었을 때, 난이도 해금을 본편에 연동하자
  // 본편 5,000층에서 하루 젬이 일일 수입의 1,233% 가 됐다. 젬은 §6 에서 하루 1,700 으로
  // 역산해 둔 **예산이 정해진 재화**라 보상이 깊이를 따라 커지면 안 된다
  // (깊이를 따라가야 하는 건 골드 쪽이고, 그건 기준 스테이지가 알아서 한다).
  // 로그면 난이도 1→1,400 에서 250→281 이라 예산 안에 남으면서도 더 깊이 가면 조금 낫다.
  const bonus = B.gems.bossRushPerDiff * Math.log10(Math.max(1, diff));
  const gem = Math.round((B.gems.bossRushBase + bonus) * (killed / D.bossCount));
  return { killed, total: D.bossCount, full, died, seconds: t, gem, hpLeft: ratio(Lhp, LHP()) };
}

// ── 골드 수레 (골드) ─────────────────────────────────────────
/**
 * 수레는 반격하지 않는다 — 순수 DPS 체크다.
 * 보상은 "해당 난이도에서 30분 파밍했을 때의 골드" × 달성률.
 */
export function simulateGoldRush(diff) {
  const stage = diffStage(diff);
  const limit = D.timeLimit;
  const LwagonHP = LeHP(stage, true);
  const Ldealt = LDPS(false) + fromNum(limit);
  const frac = Math.min(1, ratio(Ldealt, LwagonHP));
  const Lps = LgoldPerSec(stage);
  const Lgold = isFinite(Lps) && frac > 0 ? Lps + fromNum(D.goldFarmSeconds * frac) : L0;
  return { frac, full: frac >= 1, Lgold, seconds: limit };
}

// ── 마을 침공 (유물 조각) ───────────────────────────────────
/**
 * 마을 8구역을 제한시간 안에 휩쓴다. 일반 용사 무리라 반격으로 죽지는 않고 시간만 본다.
 * 한 구역에 **최소 한 번은 휘둘러야** 한다(공격 간격 바닥) — 전투력이 넘쳐도 0초가 안 된다.
 * 조각은 난이도의 **로그**로 늘어난다(유물은 수가 정해진 사다리라 깊이를 따라 터지면 안 된다).
 * 가장 높은 난이도에서 조금 모자라면 한 칸 낮추는 게 거의 손해가 없다 — log 라서.
 */
export function simulateRaid(diff) {
  const stage = diffStage(diff);
  const limit = D.timeLimit;
  const waves = D.raidWaves || 8;
  const swing = 1 / Math.max(1e-9, nval('aspd'));
  const raw = ratio(LeHP(stage, false), LDPS(false)) * perWave(stage);
  const perZone = Math.max(isFinite(raw) ? raw : Infinity, swing);
  const cleared = isFinite(perZone) ? Math.min(waves, Math.floor(limit / perZone)) : 0;
  // 못 끝낸 구역은 남은 시간만큼 부분 점수
  const part = cleared < waves && isFinite(perZone) ? Math.min(1, (limit - cleared * perZone) / perZone) : 0;
  const frac = Math.min(1, (cleared + part) / waves);
  const full = cleared >= waves;
  // 한 구역이라도 점령해야 조각이 나온다 — 판정상 0.0001% 짜리 헛입장에 최소 보상을 주지 않는다
  const shards = cleared >= 1 ? Math.max(1, Math.round(RELIC.shardsPerRun(diff) * frac)) : 0;
  return { frac, full, zones: cleared, total: waves, seconds: full ? Math.min(limit, waves * perZone) : limit, shards };
}

/**
 * 완전 점령(클리어)이 되는 가장 높은 난이도. 없으면 1.
 * 카드를 최고 난이도로 열면 환생 직후처럼 힘이 빠졌을 때 그대로 눌러 키를 버린다.
 * 판정이 난이도에 단조라 이분 탐색이면 충분하다 (난이도 3,000 도 12번).
 */
export function recDiff(k) {
  const max = maxDiff(k);
  if (!simulate(k, 1).full) return 1;
  let lo = 1, hi = max;
  while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (simulate(k, m).full) lo = m; else hi = m - 1; }
  return lo;
}

export const simulate = (k, diff) => (k === 'boss' ? simulateBossRush(diff) : k === 'raid' ? simulateRaid(diff) : simulateGoldRush(diff));

// ── 입장 ─────────────────────────────────────────────────────
/**
 * @param {'gold'|'boss'|'raid'} k
 * @param {number} diff
 * @param {boolean} useAd 광고로 추가 입장
 * @returns 결과 또는 null(입장 불가)
 */
export function enter(k, diff, useAd = false) {
  ensureKeys();
  if (!unlocked()) return null;
  if (diff < 1 || diff > maxDiff(k)) return null;
  if (useAd) {
    if (adLeft(k) < 1) return null;
    S.dun.ad[k] = (S.dun.ad[k] ?? 0) + 1;
  } else {
    if (keysLeft(k) < 1) return null;
    S.dun.keys[k] -= 1;
  }

  const res = simulate(k, diff);
  if (k === 'boss') {
    S.gem += res.gem;
  } else if (k === 'raid') {
    res.gain = res.shards * RELIC.eff('shardMul');   // 등불 유물 반영된 실제 획득량(표시용)
    res.opened = RELIC.addShards(res.shards);        // 새로 깨어난 유물(연출용)
  } else if (res.Lgold > L0) {
    S.Lg = add(S.Lg, res.Lgold);
  }
  // 완전 클리어해야 다음 난이도가 열린다
  if (res.full && diff > clearedDiff(k)) S.dun.diff[k] = diff;
  return res;
}
