// 유물 — 3단계 레이어의 첫 조각.
//
// 왜 넣었나. 해금 35개 중 25개가 첫 주에 열리고 **31~90일에는 1개뿐**이었다(실플레이 모델 실측).
// D30 리텐션이 결정되는 구간에 "다음에 뭐가 열리지" 의 답이 없었다. 유물 20종을 마을 침공
// 던전의 조각으로 **정해진 순서대로** 하나씩 열어 그 구간에 사다리를 다시 깐다.
//
// 효과는 대부분 피해 배수가 아니다. 마스터리에서 배웠다 — 전부 피해로 수렴하면 또 하나의
// 스탯 트랙일 뿐이다. 오프라인 상한·곡괭이·던전 키·관문·힐러·연쇄·무료 뽑기처럼
// **다른 시스템을 건드리는** 것이 새 축이 된다. 각 시스템은 여기서 eff() 로 묻는다.
import { B } from './balance.js';
import { S } from './state.js';
import { shardSoulMul } from './prestige.js';
import { t, has } from './i18n.js';

const RL = B.relics || { list: [], shardBase: 0, shardSlope: 0 };
export const RELICS = RL.list;
export const enabled = () => RELICS.length > 0;

export const shards = () => S.relic?.shards || 0;
export const openCount = () => S.relic?.n || 0;
/** 열린 유물 목록 (순서 고정) */
export const opened = () => RELICS.slice(0, openCount());
/** 다음에 열릴 유물 (전부 열렸으면 null) */
export const next = () => RELICS[openCount()] || null;
export const isOpen = key => RELICS.findIndex(r => r.key === key) < openCount();

/** 마을 침공 1회(완전 클리어 기준)에 나오는 조각 수 */
export function shardsPerRun(diff) {
  return RL.shardBase + Math.log10(Math.max(1, diff)) * RL.shardSlope;
}

/**
 * 열린 유물의 효과 합. 배수(atk·hp·gold·bossDmg·shardMul·healerBudget)는 곱,
 * 양(offlineHours·pickaxes·dungeonKeys·crit·chainHold·freePulls·gateSoft)은 합.
 * 없는 키는 배수면 1, 양이면 0 — 호출부가 분기 없이 곱하거나 더할 수 있게.
 */
const MUL = new Set(['atk', 'hp', 'gold', 'bossDmg', 'shardMul', 'healerBudget']);
let cache = null, cacheN = -1;
export function eff(key) {
  if (cacheN !== openCount()) {
    cache = {}; cacheN = openCount();
    for (const r of opened()) for (const [k, v] of Object.entries(r.eff || {})) {
      cache[k] = MUL.has(k) ? (cache[k] ?? 1) * v : (cache[k] ?? 0) + v;
    }
  }
  return cache[key] ?? (MUL.has(key) ? 1 : 0);
}

/** 조각 배수 — 등불 유물 × 영혼 트리 공명. '환생하면 유물이 빨라진다' 가 여기서 닫힌다 */
export const shardMul = () => eff('shardMul') * shardSoulMul();

/** 조각을 넣고, 넘치는 만큼 유물을 연다. 새로 열린 유물 목록을 돌려준다(연출용). */
export function addShards(n) {
  if (!S.relic) S.relic = { shards: 0, n: 0 };
  S.relic.shards += n * shardMul();
  const got = [];
  while (S.relic.n < RELICS.length && S.relic.shards >= RELICS[S.relic.n].cost) {
    S.relic.shards -= RELICS[S.relic.n].cost;
    got.push(RELICS[S.relic.n]);
    S.relic.n++;
  }
  if (got.length) cacheN = -1;        // 효과 캐시 무효화
  return got;
}

/** 다음 유물까지 진행률 0~1 (UI 용) */
export function progress() {
  const nx = next();
  return nx ? Math.min(1, shards() / nx.cost) : 1;
}

/** 효과를 사람 말로 */
export function describe(effObj) {
  // 문구는 언어팩 rfx.<효과>. {p} 는 퍼센트로 바꾼 값 — 힐러는 '줄어든 몫', 나머지는 그대로
  const pct = (k, v) => Math.round((k === 'healerBudget' ? 1 - v : v) * 100);
  return Object.entries(effObj || {})
    .map(([k, v]) => (has('rfx.' + k) ? t('rfx.' + k, { v, p: pct(k, v) }) : `${k} ${v}`)).join(' · ');
}
