// 진화 · 각성 연출 — 몬스터가 마일스톤(Lv 10·25·50·75·100)을 넘는 순간.
//
// 예전엔 성장 패널에서 레벨을 올려 Lv.25 를 넘어도 그림만 조용히 바뀌었다. 몇 날을 모은
// 조각이 결실을 맺는 순간인데 "진화했다" 가 안 보였다. 전투 화면 위에 전체 연출을 띄운다.
//
//   진화(겉모습이 바뀌는 단계): 옛 모습이 하얗게 달아올라 번쩍 → 새 모습이 튀어나오며 별가루가 터진다
//   각성(오라만 짙어지는 단계): 같은 무대에서 몸이 빛을 머금고 오라 이름이 뜬다
//
// 빛 색은 전장의 성장 오라(render.js drawTier)와 같다 — 동 · 은 · 금 · 보라 · 무지개.
// 수치는 아무것도 바꾸지 않는다. 단계마다 전체 공격력 +2%(balance.json collect.milestoneAtkPct)는
// 레벨이 오를 때 이미 적용돼 있고 여기서는 알려주기만 한다.
import { B } from './balance.js';
import { evoPrefix, evoStage } from './sprites.js';
import * as sfx from './audio.js';

const RGB = [null, [224, 163, 112], [214, 228, 255], [255, 211, 77], [196, 168, 255], [255, 138, 216]];
// 그 단계에서 전장에 새로 붙는 오라 (render.js drawTier 와 같은 순서)
const AURA = ['', '발밑에 빛이 깃든다', '빛가루가 피어오른다', '몸 뒤에 후광이 선다', '빛줄기가 돌기 시작한다', '무지개빛 — 최고 단계'];

let closeTimer = 0;

/** 연출을 띄운다. 여러 단계를 한 번에 넘으면(MAX 버튼) 가장 높은 단계 하나만 보여준다 */
export function showEvolve(key, fromTier, toTier) {
  const m = B.roster.monsters.find(x => x.key === key);
  if (!m || toTier <= fromTier) return;
  const tier = Math.min(toTier, 5);
  const lv = B.layer2.collect.milestoneLevels[toTier - 1];
  const evolved = evoStage('mon', key, toTier) !== evoStage('mon', key, fromTier);
  const src = t => `assets/mon/${key}/${evoPrefix('mon', key, t)}idle_1.png`;
  const atk = B.layer2.collect.milestoneAtkPct * (toTier - fromTier);

  let ov = document.getElementById('evoOv');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'evoOv';
    // 다른 모달과 같은 판 위에 — 게임 화면 크기에 맞춰 덮는다
    (document.getElementById('dunRes')?.parentElement || document.body).appendChild(ov);
  }
  const [r, g, b] = RGB[tier];
  ov.style.setProperty('--ec', `rgb(${r},${g},${b})`);
  ov.style.setProperty('--ecA', `rgba(${r},${g},${b},.34)`);
  const burst = [...Array(14)].map((_, i) =>
    `<span style="--a:${(i * 360 / 14 + (i % 2) * 9).toFixed(0)}deg;--d:${(90 + (i % 3) * 34)}px"></span>`).join('');
  ov.innerHTML = `
    <div class="evRays"></div>
    <div class="evStage">
      ${evolved ? `<img class="evOld" src="${src(fromTier)}" alt="">` : ''}
      <img class="evNew" src="${src(toTier)}" alt="">
      <div class="evBurst">${burst}</div>
    </div>
    <div class="evText">
      <div class="evTitle">${evolved ? '진화!' : '각성!'}</div>
      <div class="evName">${m.name} · Lv.${lv}</div>
      <div class="evSub">${evolved ? `${evoStage('mon', key, toTier)}단계 모습 · ` : ''}${AURA[tier]}</div>
      <div class="evGain">전체 공격력 +${atk}%</div>
    </div>
    <div class="evTap">눌러서 닫기</div>`;
  // 클래스를 다시 붙여야 애니메이션이 처음부터 돈다
  ov.className = '';
  void ov.offsetWidth;
  ov.className = 'on ' + (evolved ? 'evo' : 'awake') + (tier >= 5 ? ' rainbow' : '');
  try { sfx.gachaResult(2); } catch {}

  // 너무 일찍 닫히면 번쩍이는 순간을 못 본다 — 0.8초 뒤부터 누르면 닫힌다. 5초면 저절로 닫힌다
  const opened = performance.now();
  const close = () => { ov.className = ''; ov.onclick = null; clearTimeout(closeTimer); };
  ov.onclick = () => { if (performance.now() - opened > 800) close(); };
  clearTimeout(closeTimer);
  closeTimer = setTimeout(close, 5000);
}
