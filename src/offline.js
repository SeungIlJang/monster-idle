// 오프라인 보상. 최대 12시간, 획득률은 "최고 클리어 스테이지의 초당 골드"에 비례(DESIGN.md §3).
import { B, isBoss, LeHP, LeGOLD, perWave } from './balance.js';
import { S } from './state.js';
import { LDPS, ab } from './stats.js';
import { add, ratio, fromNum, fmt } from './logmath.js';

/** 파밍 기준 스테이지에서의 초당 골드 (log10) */
export function LgoldPerSec(stage) {
  const boss = isBoss(stage);
  const ttk = ratio(LeHP(stage, boss), LDPS(boss));       // 1마리 처치 시간(초)
  if (!(ttk > 0) || !isFinite(ttk)) return -Infinity;
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
