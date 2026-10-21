// 스킬바 — 전장 아래 띠. 쿨이 차오르는 걸 보여주는 게 목적이다.
//
// 쿨은 매 프레임 바뀌므로 **DOM 을 다시 만들지 않는다.** 슬롯 구성이 바뀔 때만
// 새로 그리고, 평소에는 채움 막대 높이와 클래스만 건드린다.
// (이 저장소에서 매 틱 innerHTML 을 새로 쓰다 클릭 대상이 사라진 적이 있다.)
import { S, save } from './state.js';
import { R, fireSkill } from './combat.js';
import { skillBar, fireNow } from './skills.js';

const $ = id => document.getElementById(id);
let built = '';        // 지금 그려진 슬롯 구성 (id 를 이어붙인 것)

export function renderSkillBar() {
  const bar = $('skillBar');
  if (!bar) return;
  const list = skillBar(R.skillCd || {});
  bar.classList.toggle('on', list.length > 0);
  if (!list.length) { built = ''; bar.innerHTML = ''; return; }

  const sig = list.map(s => s.id).join(',');
  if (sig !== built) {
    built = sig;
    bar.innerHTML =
      `<div class="skAuto" id="skAuto"><div>AUTO</div><div id="skAutoV">ON</div></div>` +
      list.map(s => `<div class="skSlot" data-sk="${s.id}" title="${s.name} · ${s.cd}초">
          <i></i><b>${s.icon}</b></div>`).join('');
    $('skAuto').onclick = () => { S.autoSkill = !S.autoSkill; save(); renderSkillBar(); };
    for (const el of bar.querySelectorAll('[data-sk]')) {
      el.onclick = () => { if (fireNow(R.skillCd, el.dataset.sk, fireSkill)) renderSkillBar(); };
    }
  }

  $('skAutoV').textContent = S.autoSkill === false ? 'OFF' : 'ON';
  $('skAuto').classList.toggle('on', S.autoSkill !== false);
  for (const s of list) {
    const el = bar.querySelector(`[data-sk="${s.id}"]`);
    if (!el) continue;
    el.querySelector('i').style.height = ((1 - s.fill) * 100).toFixed(0) + '%';
    el.classList.toggle('ready', s.fill >= 1);
  }
}
