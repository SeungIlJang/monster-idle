// 기간 이벤트 — **틀 하나, 데이터 여러 벌.**
//
// 레퍼런스(Legend of Slime)의 Addressables 카탈로그를 뜯어 보니 steproulette 가
// anniv3rd_a/b/c · anniv4th_a/b/c 로 반복돼 있었다. 기믹을 새로 만드는 게 아니라
// **같은 트랙에 데이터만 갈아 끼우는** 구조다. 여기도 그렇게 만든다 —
// 새 이벤트는 balance.json 의 events.list 에 한 덩이를 더하면 끝이고, 코드는 안 건드린다.
//
// 포인트 원천이 설계의 핵심이다. 처치 수나 클리어 수로 포인트를 주면
// 2일차(+1,625층)와 300일차(+24층) 사이에 70배가 벌어져, 같은 트랙이 초반엔 즉시
// 완주되고 후반엔 영영 안 찬다. 그래서 **일일퀘스트와 출석** 에서만 준다 — 둘 다
// 하루 한도가 정해져 있어 깊이와 무관하다.
import { B } from './balance.js';
import { S } from './state.js';

const CFG = B.events || { pointPer: {}, gemBudgetPerDay: 0, list: [] };

/** 'YYYY-MM-DD' 를 그 날 0시로. 로컬 시간대 기준이라 플레이어 달력과 맞는다. */
function parse(d) {
  const [y, m, day] = String(d).split('-').map(Number);
  return new Date(y, (m || 1) - 1, day || 1).getTime();
}

/** 지금 열려 있는 이벤트 (없으면 null). 겹치면 먼저 적힌 것이 이긴다. */
export function activeEvent(now = Date.now()) {
  for (const e of CFG.list || []) {
    if (now >= parse(e.from) && now < parse(e.to) + 86400000) return e;
  }
  return null;
}

/** 남은 시간(ms). 이벤트가 없으면 0 */
export function msLeft(now = Date.now()) {
  const e = activeEvent(now);
  return e ? Math.max(0, parse(e.to) + 86400000 - now) : 0;
}

/**
 * 세이브를 지금 이벤트에 맞춘다. 이벤트가 바뀌면 포인트와 수령 기록을 **버린다** —
 * 이월시키면 다음 이벤트가 시작하자마자 완주돼 버린다.
 */
export function ensureEvent() {
  const e = activeEvent();
  const id = e ? e.id : '';
  if (!S.ev || S.ev.id !== id) S.ev = { id, p: 0, claimed: {} };
  return e;
}

export const points = () => (ensureEvent() ? (S.ev.p || 0) : 0);

/** 포인트 적립. daily.js 가 퀘스트/출석을 **실제로 지급할 때** 부른다. */
export function addPoint(kind, times = 1) {
  if (!ensureEvent()) return 0;
  const per = (CFG.pointPer || {})[kind] || 0;
  if (per <= 0) return 0;
  S.ev.p = (S.ev.p || 0) + per * times;
  return per * times;
}

/** 트랙 상태. at 은 누적 포인트 기준이다. */
export function trackState() {
  const e = ensureEvent();
  if (!e) return [];
  const p = S.ev.p || 0;
  return e.track.map((t, i) => ({
    i, at: t.at, gem: t.gem,
    reached: p >= t.at,
    claimed: !!S.ev.claimed[i],
  }));
}

/** 한 칸 수령. 도달하지 않았거나 이미 받았으면 0 */
export function claimStep(i) {
  if (!ensureEvent()) return 0;
  const st = trackState()[i];
  if (!st || !st.reached || st.claimed) return 0;
  S.ev.claimed[i] = true;
  S.gem += st.gem;
  return st.gem;
}

/** 받을 수 있는 칸 수 (탭 배지용) */
export const claimable = () => trackState().filter(t => t.reached && !t.claimed).length;

/**
 * 데이터가 젬 예산을 넘는지 본다. 넘으면 콘솔에 경고한다 —
 * 조용히 통과시키면 이벤트를 하나 더 만들 때마다 곡선이 밀린다.
 * (ads.json 의 플레이스홀더 경고와 같은 취지다.)
 */
export function validate() {
  const cap = (CFG.gemBudgetPerDay || 0) * (B.gacha.gemsPerDay || 0);
  for (const e of CFG.list || []) {
    const days = Math.max(1, Math.round((parse(e.to) - parse(e.from)) / 86400000) + 1);
    const total = e.track.reduce((a, t) => a + t.gem, 0);
    const perDay = total / days;
    if (perDay > cap + 1e-9) {
      console.warn(`[events] "${e.id}" 가 젬 예산을 넘습니다 — ${perDay.toFixed(0)}/일 > 상한 ${cap.toFixed(0)}/일.`
        + ' 시뮬은 상한까지만 검증했으므로 이대로 두면 곡선이 밀립니다.');
    }
  }
}
