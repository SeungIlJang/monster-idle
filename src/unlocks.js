// 스테이지로 잠겨 있는 것들의 목록.
//
// 새 데이터를 만들지 않는다 — 해금 조건은 이미 balance.json 에 흩어져 있고
// 여기서는 모아서 정렬할 뿐이다. 전투(해금 순간 연출)와 UI(로드맵)가 같이 쓰므로
// UI 모듈이 아니라 여기에 둔다.
import { B } from './balance.js';
import { S } from './state.js';
import { t } from './i18n.js';

let cache = null;

/** 스테이지 오름차순. 같은 스테이지에서 여러 개가 열릴 수 있다. */
export function milestones() {
  // balance.json 만 보므로 결과가 바뀌지 않는다. 목표 띠가 초당 4번 물어보기 때문에
  // 매번 다시 모아 정렬하지 않는다.
  if (cache) return cache;
  const out = [];
  for (const m of B.roster.monsters) {
    if (m.unlock > 1) out.push({ at: m.unlock, ic: '🐾', what: t('unl.mon', { name: m.name }), plain: t('unl.monPlain', { name: m.name }), kind: 'mon' });
  }
  for (const b of B.gacha.banners) {
    b.slotUnlock.forEach((at, i) => {
      if (at > 1) out.push({ at, ic: b.icon, what: t('unl.slot', { name: b.name, n: i + 1 }), plain: t('unl.slotPlain', { name: b.name, n: i + 1 }), kind: 'slot' });
    });
  }
  for (const [, v] of Object.entries(B.stats)) {
    if (typeof v.reqStage === 'number' && v.reqStage > 1) {
      out.push({ at: v.reqStage, ic: v.icon || '✨', what: t('unl.stat', { name: v.name }), plain: t('unl.statPlain', { name: v.name }), kind: 'stat' });
    }
  }
  return (cache = out.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind)));
}

/** 다음에 열릴 것 (전부 열렸으면 null) */
export const nextMilestone = () => milestones().find(m => m.at > S.life) || null;

/** from 초과 ~ to 이하 구간에서 열린 것들 */
export const crossed = (from, to) => milestones().filter(m => m.at > from && m.at <= to);
