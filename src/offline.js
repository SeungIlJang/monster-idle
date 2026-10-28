// 오프라인 보상. 최대 12시간, 획득률은 "최고 클리어 스테이지의 초당 골드"에 비례(DESIGN.md §3).
import { B, isBoss, LeHP, LeGOLD, perWave } from './balance.js';
import { S } from './state.js';
import { LDPS, ab, nval } from './stats.js';
import { add, ratio, fromNum, fmt } from './logmath.js';

/** 파밍 기준 스테이지에서의 초당 골드 (log10) */
export function LgoldPerSec(stage) {
  const boss = isBoss(stage);
  // 처치 시간은 **한 번 때리는 시간**보다 짧을 수 없다. 이 바닥을 안 깔면
  // 전투력이 그 스테이지를 크게 웃돌 때 ttk 가 0 으로 언더플로하고
  // log10(0) = -Infinity 라 보상이 통째로 0 이 된다 —
  // 골드 수레에서 "키를 넣었는데 🪙 0" 이 뜨던 원인이고, 오프라인 보상도 같은 함수를 쓴다.
  const floor = 1 / Math.max(1e-9, nval('aspd'));
  const ttk = Math.max(ratio(LeHP(stage, boss), LDPS(boss)), floor);
  if (!isFinite(ttk)) return -Infinity;
  return LeGOLD(stage, boss) + fromNum(ab('gold')) - fromNum(ttk);   // 리드 능력의 골드 배수
}

/**
 * 돌아왔을 때 줄 보상을 계산한다. 보상을 지급하지는 않는다 — 호출측이 UI 로 확인받고 claim 한다.
 * @returns {{seconds:number, capped:number, Lgold:number}|null}
 */
export function pendingOffline() {
  if (!S.t) return null;
  const seconds = Math.max(0, (Date.now() - S.t) / 1000);
  if (seconds < 60) return null;                           // 1분 미만은 건너뜀
  const capped = Math.min(seconds, B.offline.capHours * 3600);
  const base = Math.max(1, S.best - 1);                    // 안전하게 직전 스테이지 기준
  const Lps = LgoldPerSec(base);
  if (!isFinite(Lps)) return null;
  return { seconds, capped, Lgold: Lps + fromNum(capped) };
}

export function claimOffline(o, mul = 1) {
  S.Lg = add(S.Lg, o.Lgold + fromNum(mul));
}

export function fmtDuration(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return h + '시간 ' + m + '분';
  if (m > 0) return m + '분';
  return sec + '초';
}

export { fmt };
