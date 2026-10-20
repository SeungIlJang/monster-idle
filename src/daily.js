// 일일퀘스트 3종 + 7일 출석 (DESIGN.md §11)
//
// 출석 설계에서 주의한 점: 구버전 무럭무럭 용사님은 화면을 띄우는 시점에 연속일수를 올려놓고
// 저장까지 해버려서, 보상을 안 받고 끄면 연속이 소모됐다. 여기서는 **받을 때만 커밋**한다.
import { B } from './balance.js';
import { S } from './state.js';

export const QUESTS = B.daily.quests;
export const ATTEND_CYCLE = B.gems.attendCycle;

function dstr(d) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
const today = () => dstr(new Date());
const yesterday = () => dstr(new Date(Date.now() - 86400000));

// ── 일일퀘스트 ───────────────────────────────────────────────
export function ensureDaily() {
  const t = today();
  if (S.daily.date !== t) {
    S.daily = { date: t, kill: 0, pull: 0, stage: 0, claimed: {} };
  }
  return S.daily;
}

/** 진행도 증가. combat/gacha 에서 부른다. */
export function bump(id, n = 1) {
  ensureDaily();
  S.daily[id] = (S.daily[id] || 0) + n;
}

export function questState() {
  ensureDaily();
  return QUESTS.map(q => {
    const cur = S.daily[q.id] || 0;
    const done = cur >= q.goal;
    return { ...q, cur: Math.min(cur, q.goal), done, claimed: !!S.daily.claimed[q.id], gem: B.gems.questReward };
  });
}

export function claimQuest(id) {
  ensureDaily();
  const q = questState().find(x => x.id === id);
  if (!q || !q.done || q.claimed) return 0;
  S.daily.claimed[id] = true;
  S.gem += q.gem;
  return q.gem;
}

export const questClaimable = () => questState().filter(q => q.done && !q.claimed).length;

// ── 7일 출석 ─────────────────────────────────────────────────
/**
 * 오늘 받을 수 있는 출석 보상. 아직 커밋하지 않는다.
 * @returns {{streak:number, gem:number, day:number}|null} 이미 받았으면 null
 */
export function pendingAttend() {
  if (S.attend.last === today()) return null;
  const streak = S.attend.last === yesterday() ? (S.attend.streak || 0) + 1 : 1;
  const day = ((streak - 1) % ATTEND_CYCLE.length) + 1;
  return { streak, day, gem: ATTEND_CYCLE[day - 1] };
}

export function claimAttend() {
  const p = pendingAttend();
  if (!p) return null;
  S.attend.last = today();          // 받는 순간에만 커밋한다
  S.attend.streak = p.streak;
  S.gem += p.gem;
  return p;
}

/** 7일 주기에서 오늘이 며칠째인지 (UI 표시용) */
export function attendDayIndex() {
  const p = pendingAttend();
  if (p) return p.day;
  const streak = S.attend.streak || 1;
  return ((streak - 1) % ATTEND_CYCLE.length) + 1;
}

export const totalClaimable = () => questClaimable() + (pendingAttend() ? 1 : 0);
