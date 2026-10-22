// 환생. 스테이지·골드·강화를 버리고 **영혼** 을 받는다.
//
// 무엇이 남고 무엇이 사라지는가가 이 설계의 전부다:
//   사라진다 — 스테이지(best), 골드, 강화 레벨
//   남는다   — life(영구 최고 기록), 해금, 가챠, 마스터리, 연구, 수집, 젬, 동료
// 해금과 수입 엔진까지 지우면 하루치를 통째로 날리는 꼴이라 환생이 벌이 된다.
// 그래서 해금은 best 가 아니라 **life** 를 본다(state.js 참조).
//
// ⚠️ 영혼을 자동 배수로 주면 안 된다. 시뮬로 확인했다 — 영혼이 스테이지에 선형이면
//   S(n+1) ≥ S(n)·(1+복귀율) 이라 복귀율이 0보다 크기만 하면 발산한다.
//   복귀율 3% 에서도 365일 끝점이 19,668 → 138,354 였다.
// 등비 가격 상점에서 사면 레벨이 영혼의 로그가 되어 수렴한다(영혼 10→1천만에 10^0.0→10^2.8).
import { B } from './balance.js';
import { S, save } from './state.js';
import { L0, fromNum } from './logmath.js';

const P = B.prestige;

/** 이번 회차를 접으면 받을 영혼 */
export const soulsFor = best => Math.floor(Math.max(0, best) / P.soulDiv);
export const pendingSouls = () => soulsFor(S.best);

/** 지금 가진 영혼으로 도달한 상점 레벨 (등비수열 합의 역함수) */
export function soulLv(souls = S.souls) {
  if (souls < P.shop.c0) return 0;
  return Math.floor(Math.log(1 + souls * (P.shop.g - 1) / P.shop.c0) / Math.log(P.shop.g));
}
/** 다음 레벨까지 필요한 누적 영혼 */
export const soulsForLv = lv => P.shop.c0 * (Math.pow(P.shop.g, lv) - 1) / (P.shop.g - 1);

/** 환생 보너스 (log10). 승산이라 로그 공간에서는 덧셈이다. */
export const Lsoul = () => soulLv() * Math.log10(P.shop.r);
/** 표시용 배수 */
export const soulMul = () => Math.pow(P.shop.r, soulLv());

export const unlocked = () => S.life >= P.unlockStage;
/** 환생해도 되는가 — 영혼을 한 톨도 못 받으면 막는다 */
export const canPrestige = () => unlocked() && pendingSouls() > 0;

/**
 * 환생 실행. 호출측이 확인을 받은 뒤 부른다.
 * @returns 받은 영혼 수 (불가하면 0)
 */
export function doPrestige() {
  if (!canPrestige()) return 0;
  const got = pendingSouls();
  S.souls += got;
  S.lives = (S.lives || 0) + 1;
  S.Lg = L0;
  for (const k of Object.keys(S.lv)) S.lv[k] = B.stats[k].kind === 'mul' ? 1 : 0;
  S.st = 1;
  S.best = 1;          // life 는 그대로 — 해금과 로드맵은 영구다
  S.farm = 0;
  save();
  return got;
}
