// 해금 로드맵 — "몇 스테이지에서 무엇이 열리는가".
//
// 새 데이터를 만들지 않는다. 해금 조건은 이미 balance.json 에 전부 들어 있는데
// 코드 안에만 있어서 플레이어가 볼 방법이 없었다. 여기서는 **읽어서 그리기만** 한다.
// 레전드 슬라임의 월드맵이 하는 일이 이것이다(docs/reference-legend-of-slime.md §6).
import { B } from './balance.js';
import { S } from './state.js';

const $ = id => document.getElementById(id);

/** 스테이지로 잠겨 있는 것들을 전부 모아 스테이지 순으로 정렬한다 */
export function milestones() {
  const out = [];
  for (const m of B.roster.monsters) {
    if (m.unlock > 1) out.push({ at: m.unlock, ic: '🐾', what: `몬스터 <b>${m.name}</b> 해금`, kind: 'mon' });
  }
  for (const b of B.gacha.banners) {
    b.slotUnlock.forEach((at, i) => {
      if (at > 1) out.push({ at, ic: b.icon, what: `${b.name} <b>${i + 1}번째 슬롯</b>`, kind: 'slot' });
    });
  }
  for (const [k, v] of Object.entries(B.stats)) {
    if (typeof v.reqStage === 'number' && v.reqStage > 1) {
      out.push({ at: v.reqStage, ic: v.icon || '✨', what: `스탯 <b>${v.name}</b> 해금`, kind: 'stat', key: k });
    }
  }
  return out.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
}

/** 다음에 열릴 것 (전부 열렸으면 null) — HUD 안내에도 쓸 수 있다 */
export function nextMilestone() {
  return milestones().find(m => m.at > S.best) || null;
}

export function renderRoad() {
  const el = $('roadList');
  if (!el) return;
  const list = milestones();
  const next = list.find(m => m.at > S.best);
  const rows = [];

  // 같은 스테이지에서 여러 개가 열리므로 스테이지로 묶는다
  const byStage = new Map();
  for (const m of list) {
    if (!byStage.has(m.at)) byStage.set(m.at, []);
    byStage.get(m.at).push(m);
  }

  for (const [at, group] of byStage) {
    const done = S.best >= at;
    const isNext = next && next.at === at;
    const items = group.map(g => `<div class="ritem">${g.ic} ${g.what}</div>`).join('');
    rows.push(`
      <div class="rrow ${done ? 'done' : ''} ${isNext ? 'next' : ''}">
        <div class="rnode">${done ? '✓' : at}</div>
        <div class="rbody">
          ${items}
          ${isNext ? `<div class="rhint">${at - S.best} 스테이지 남음</div>` : ''}
        </div>
      </div>`);
  }

  el.innerHTML = `
    <div class="rhead">현재 최고 <b>${S.best}</b> 스테이지 · ${list.filter(m => S.best >= m.at).length}/${list.length} 해금</div>
    ${rows.join('')}`;

  // 다음 해금이 보이도록 스크롤
  const nx = el.querySelector('.rrow.next');
  if (nx) nx.scrollIntoView({ block: 'center' });
}
