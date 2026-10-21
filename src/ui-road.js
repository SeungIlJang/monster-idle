// 해금 로드맵 — "몇 스테이지에서 무엇이 열리는가".
//
// 새 데이터를 만들지 않는다. 해금 조건은 이미 balance.json 에 전부 들어 있는데
// 코드 안에만 있어서 플레이어가 볼 방법이 없었다. 여기서는 **읽어서 그리기만** 한다.
// 레전드 슬라임의 월드맵이 하는 일이 이것이다(docs/reference-legend-of-slime.md §6).
import { S } from './state.js';
import { milestones } from './unlocks.js';

const $ = id => document.getElementById(id);

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
