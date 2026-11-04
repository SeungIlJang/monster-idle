// 환생 2판. 스테이지·골드·강화를 버리고 **영혼** 을 받아 **영혼 트리** 를 찍는다.
//
// 무엇이 남고 무엇이 사라지는가:
//   사라진다 — 이번 회차 스테이지·골드·강화 레벨
//   남는다   — life(영구 최고 기록), 해금, 가챠, 마스터리, 연구, 수집, 젬, 동료, 유물, 영혼 트리
//
// 1판은 1년에 3번이었다(시뮬 실측). 두 가지가 막고 있었다:
//   ① 영혼이 층수에 정비례 + 누적이라 '보유의 2배' 를 다시 모으기가 회차마다 기하급수로 어려워졌다.
//   ② 재등반이 층당 2.2초(게임 실측) × 수만 층 — 복귀에 실제 플레이 10시간 이상.
// 2판:
//   ① 영혼은 **평생 기록을 넘어선 만큼만** 나온다. F(life) = soulBase × 10^((life − unlockStage)/soulDecade),
//      받는 양 = F(life) − F(지난 환생 때 life). 기록 ~391층마다 '받은 총량' 만큼 새로 쌓인다 → 후반 주 1회.
//      같은 층을 반복해 영혼을 불릴 수 없다(복귀가 싸져도 안전한 이유).
//   ② **도약**: 이전 기록의 80%(트리로 95%) 지점에서 다시 시작하고, 환생 직전 최전선 수입 30분어치 골드를 받는다.
//      **메아리**: 이전 기록 아래에서는 골드 ×10(트리로 ×60). 시뮬: 복귀 실제 플레이 중위 0.6시간.
//
// ⚠️ 트리 레벨당 효과가 작은 이유: 이 게임은 골드 증가율(층당 ×1.126)이 적 체력(×1.12)과 거의 같아서
//   순수 난이도 기울기가 작고, 작은 배수도 수천 층으로 증폭된다. 영혼이 기록에 지수라 레벨은 기록에 비례 →
//   레벨당 효과가 크면 '기록↑ → 레벨↑ → 기록↑' 되먹임이 발산한다(시뮬: 레벨당 ×1.08 이면 60일에 2.7배).
//   지금 값에서 1년 끝점 +4%, 5판정 통과(실플레이·24시간 모델 모두).
//
// 영혼은 10^25 를 넘으므로 **log10 으로 저장**한다 (S.soul.Lfree).
import { B } from './balance.js';
import { S, save } from './state.js';
import { L0, add, sub, fromNum, fmt } from './logmath.js';

const P = B.prestige;
export const TREE = P.tree || [];

/** 평생 기록 life 까지 받을 수 있는 영혼 총량 (log10). 해금 전이면 -Infinity */
const LF = life => (life < P.unlockStage ? L0 : Math.log10(P.soulBase) + (life - P.unlockStage) / P.soulDecade);
/** 지금까지 받은 영혼 총량 (log10) */
export const Lclaimed = () => (S.soul.claim ? LF(S.soul.claim) : L0);
/** 지금 환생하면 받을 영혼 (log10) */
export function Lpending() {
  const a = LF(S.life);
  if (!isFinite(a)) return L0;
  return S.soul.claim ? sub(a, LF(S.soul.claim)) : a;
}
/** 다음 '추천' 까지 남은 층 (이미 추천이면 0) */
export function floorsToRecommend() {
  if (!S.soul.claim) return Math.max(0, P.unlockStage - S.life);
  const need = S.soul.claim + P.soulDecade * Math.log10(1 + P.recommendAt);
  return Math.max(0, Math.ceil(need - S.life));
}

export const unlocked = () => S.life >= P.unlockStage;
/** 받을 영혼이 있어야 환생할 수 있다 — 기록을 넘어서지 않았으면 0 이다 */
export const canPrestige = () => unlocked() && Lpending() > L0;
/** 받을 영혼 ≥ 받은 총량 × recommendAt — 시뮬의 환생 판단과 같은 규칙 */
export const recommended = () => canPrestige() && (!S.soul.claim || Lpending() >= Lclaimed() + Math.log10(P.recommendAt));

// ── 영혼 트리 ────────────────────────────────────────────────
export const tlv = k => S.soul.tree[k] || 0;
export const node = k => TREE.find(n => n.key === k);
export const maxed = n => n.max !== undefined && tlv(n.key) >= n.max;
/** 다음 레벨 가격 (log10) */
export const Lcost = (n, lv = tlv(n.key)) => Math.log10(n.c0) + lv * Math.log10(n.g);
export const canBuy = n => !maxed(n) && S.soul.Lfree >= Lcost(n);

/** 한 노드를 times 번(또는 살 수 있는 만큼) 올린다. 올린 횟수를 돌려준다 */
export function buy(key, times = 1) {
  const n = node(key); if (!n) return 0;
  let k = 0;
  while (k < times && canBuy(n)) {
    S.soul.Lfree = sub(S.soul.Lfree, Lcost(n));
    S.soul.tree[key] = tlv(key) + 1;
    k++;
  }
  return k;
}
/** 자동 분배 — 가장 싼 노드부터 산다(시뮬과 같은 규칙). 올린 총 레벨 */
export function buyCheapest() {
  let k = 0;
  for (let i = 0; i < 100000; i++) {
    let best = null;
    for (const n of TREE) if (!maxed(n) && (!best || Lcost(n) < Lcost(best))) best = n;
    if (!best || !canBuy(best)) break;
    buy(best.key, 1); k++;
  }
  return k;
}

/** 배수 노드 합 (log10). 같은 eff 를 가진 노드는 곱해진다 */
export const LtMul = eff => TREE.reduce((L, n) => L + (n.eff === eff && n.mul ? tlv(n.key) * Math.log10(n.mul) : 0), 0);
/** 가산 노드 합 */
export const tAdd = eff => TREE.reduce((a, n) => a + (n.eff === eff && n.add ? tlv(n.key) * n.add : 0), 0);
/** 배수를 사람 말로 — 2배 미만은 퍼센트(레벨당 1.5% 가 '×1.01' 로 뭉개지지 않게), 그 위는 배수 */
export const mulText = v => (v < 2 ? `+${((v - 1) * 100).toFixed(1)}%` : `×${v < 100 ? v.toFixed(2) : fmt(Math.log10(v))}`);
/** 노드 하나의 효과를 사람 말로 (lv 레벨일 때) */
export function nodeText(n, lv = tlv(n.key)) {
  if (n.mul) return `${n.desc} ${mulText(Math.pow(n.mul, lv))}`;
  if (n.eff === 'warpPct') return `${n.desc} ${Math.round((P.warp.pct + lv * n.add) * 100)}%`;
  if (n.eff === 'echo') return `${n.desc} ×${P.echo + lv * n.add}`;
  if (n.eff === 'shardMul') return `${n.desc} +${Math.round(lv * n.add * 100)}%`;
  return `${n.desc} ${lv}`;
}

// ── 다른 시스템이 묻는 값 ────────────────────────────────────
/** 전 피해 (log10) — 투지 + 1판에서 넘어온 옛 환생 보너스 */
export const Lsoul = () => LtMul('atk') + (S.soul.Llegacy || 0);
/** 보스·관문 추가 피해 (log10) — 패기 */
export const LsoulBoss = () => LtMul('bossDmg');
/** 메아리: 이전 회차 기록 아래에서만 골드 ×echo */
export const echoActive = () => S.echoTo > 0 && S.best < S.echoTo;
export const echoMul = () => P.echo + tAdd('echo');
/** 골드 배수 — 유산 × (메아리 중이면) 메아리 */
export const soulGoldMul = () => Math.pow(10, LtMul('gold')) * (echoActive() ? echoMul() : 1);
export const warpPct = () => Math.min(0.99, P.warp.pct + tAdd('warpPct'));
export const shardSoulMul = () => 1 + tAdd('shardMul');
/** 표시용 */
export const soulMul = () => Math.pow(10, Lsoul());

/**
 * 환생 실행. 호출측이 확인을 받은 뒤 부른다.
 * 도약 골드를 계산하려면 **리셋 전** 최전선 초당 골드가 필요해서 호출측이 넘긴다(LgoldPerSec 는
 * stats 에 기대는데, stats 가 이 모듈을 import 하므로 여기서 부르면 순환이 된다).
 * 강화 구매와 시작 층 확정(넘을 수 있는 층까지 내리기)도 호출측이 한다.
 * @returns {{Lgot:number, target:number, from:number}|null}
 */
export function doPrestige(LgoldPerSecAtFrontier) {
  if (!canPrestige()) return null;
  const Lgot = Lpending();
  S.soul.Lfree = add(S.soul.Lfree, Lgot);
  S.soul.claim = S.life;
  S.lives = (S.lives || 0) + 1;
  const from = S.best;
  const target = Math.max(1, Math.floor(from * warpPct()));
  S.echoTo = from;
  S.Lg = isFinite(LgoldPerSecAtFrontier) ? LgoldPerSecAtFrontier + fromNum(P.warp.goldSeconds) : L0;
  for (const k of Object.keys(S.lv)) S.lv[k] = B.stats[k].kind === 'mul' ? 1 : 0;
  S.st = target;
  S.best = 1;          // 호출측이 강화를 산 뒤 넘을 수 있는 층으로 확정한다. life 는 그대로
  S.farm = 0;
  save();
  return { Lgot, target, from };
}
