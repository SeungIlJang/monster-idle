// 첫 화면. 켜면 이게 먼저 나오고, 시작을 누르면 전투로 들어간다.
//
// 방치형에서 타이틀이 매번 길게 걸리면 성가시다. 그래서 **한 번 누르면 끝**이고
// 애니메이션도 0.45초다. 대신 이어서 하는 사람에게는 "최고 몇 층" 을 보여줘서
// 누르기 전에 자기 진행 상황이 보이게 한다.
import { S } from './state.js';
import { B, chapterLabel } from './balance.js';
import { evoPrefix } from './sprites.js';
import { monTier } from './companions.js';

const $ = id => document.getElementById(id);

/**
 * 출연진 — 풀밭 전체를 무대로 쓴다.
 *
 * 가운데 앞쪽에 리드가 크게 서고, 예전 화면의 두 동료(포자 버섯 · 박쥐)가 바로 옆에 선다.
 * 가진 몬스터·동료가 늘수록 리드를 둘러싼 반원 자리(앞 · 옆 · 뒤)가 채워진다.
 * 레벨 높은 몬스터가 리드 가까운 앞자리부터 선다.
 *
 * 원근: 뒤(지평선)일수록 작고 살짝 어둡게, 앞일수록 크고 앞에 그린다. 오른쪽 몬스터는
 * 뒤집어서 리드 쪽을 보게 한다 — 무리가 주인공을 둘러싼 그림이 된다.
 *
 * 지면 위치: 배경(forest.png 1080×600)은 세로 화면에서 높이 기준 cover 라
 * 풀밭이 어느 폰에서나 화면 높이의 ~52% 에서 시작한다. 그 아래부터 시작 버튼 위까지가 무대다.
 */
const DECOR = ['spore', 'bats'];           // 예전 화면의 두 동료 — 신규 유저도 이 셋으로 시작한다
// 몬스터 그림은 투명 여백이 동료 그림보다 커서 같은 상자면 작아 보인다 — 상자를 키워 맞춘다
const MON_BOX = 1.2;
const FIELD_TOP = 0.545;                   // 화면 높이 대비 — 덤불 바로 아래 풀밭
// 자리 (u: 가로 0~1, v: 깊이 0=지평선 ~ 1=맨 앞). 리드 가까운 순서이고 왼쪽·오른쪽을 번갈아 둔다
const LEAD_SPOT = { u: 0.5, v: 0.6 };
const DECOR_SPOTS = [{ u: 0.27, v: 0.56 }, { u: 0.74, v: 0.5 }];
const SPOTS = [
  { u: 0.13, v: 0.74 }, { u: 0.87, v: 0.72 },     // 앞 옆
  { u: 0.24, v: 0.27 }, { u: 0.76, v: 0.25 },     // 뒤 옆
  { u: 0.41, v: 0.13 }, { u: 0.59, v: 0.12 },     // 뒤 가운데
  { u: 0.07, v: 0.47 }, { u: 0.93, v: 0.45 },     // 가장자리
  { u: 0.31, v: 0.95 }, { u: 0.69, v: 0.96 },     // 맨 앞
  { u: 0.09, v: 0.14 }, { u: 0.91, v: 0.12 },     // 뒤 구석
  { u: 0.37, v: 0.38 }, { u: 0.63, v: 0.36 },     // 리드 뒤
  { u: 0.08, v: 0.88 }, { u: 0.92, v: 0.87 },     // 앞 구석
];
// 개수가 홀수면 짝 없는 마지막 하나가 한쪽 구석에 몰려 그쪽만 붐빈다 — 맨 뒤 가운데에 세운다
const BACK_CENTER = { u: 0.5, v: 0.04 };

let castBuilt = false;
function buildCast() {
  const title = $('title'), field = $('tField'), foot = title?.querySelector('.tfoot');
  if (!title || !field || !foot) return;
  const W = title.clientWidth, H = title.clientHeight;
  if (!W || !H) return;

  const owned = B.roster.monsters.filter(m => S.life >= m.unlock);
  const lead = owned.find(m => m.key === S.mon) || owned[0] || B.roster.monsters[0];
  const monSrc = m => `assets/mon/${m.key}/${evoPrefix('mon', m.key, monTier(m.key))}idle_1.png`;
  const compSrc = id => `assets/comp/${id}.png`;

  // 가진 뽑기 동료 종류 (인벤토리 키 "id|등급|강화")
  const compIds = [...new Set(Object.entries(S.inv?.comp || {})
    .filter(([, n]) => n > 0).map(([k]) => k.split('|')[0]))];
  const mons = owned.filter(m => m !== lead)
    .sort((a, b) => ((S.monLv[b.key] || 0) - (S.monLv[a.key] || 0)) || a.unlock - b.unlock)
    .map(m => ({ src: monSrc(m), box: MON_BOX, mon: true }));
  const comps = compIds.filter(id => !DECOR.includes(id)).map(id => ({ src: compSrc(id), box: 1 }));
  // 몬스터와 동료를 짝지어 좌우에 섞는다 — 짝마다 먼저 갈 쪽을 바꾼다
  const queue = [];
  for (let i = 0; i < Math.max(mons.length, comps.length); i++) {
    for (const it of (i % 2 ? [comps[i], mons[i]] : [mons[i], comps[i]])) if (it) queue.push(it);
  }

  // 무대: 풀밭 시작 ~ 시작 버튼 위
  const yB = foot.offsetTop - 6;
  const yT = Math.min(H * FIELD_TOP, yB - 120);
  // 크기는 화면 폭 비율 — 폰(375px)에서 맨 앞 71 · 리드 142, 넓은 화면(540px)에서 90 · 170
  const front = Math.min(90, W * 0.19);                    // 맨 앞 동료 크기 — 리드보다 확실히 작게
  const leadW = Math.min(170, W * 0.38);
  const size = (v, box = 1) => front * (0.5 + 0.42 * v) * box;

  const cast = [{ src: monSrc(lead), w: leadW, ...LEAD_SPOT, lead: true }];
  DECOR.forEach((id, i) => cast.push({ src: compSrc(id), w: size(DECOR_SPOTS[i].v), ...DECOR_SPOTS[i] }));
  const shown = queue.slice(0, SPOTS.length + 1);
  const spots = SPOTS.slice(0, shown.length);
  if (shown.length % 2) spots[shown.length - 1] = BACK_CENTER;
  shown.forEach((it, i) => cast.push({ ...it, w: size(spots[i].v, it.box), ...spots[i] }));

  let n = 0;
  field.innerHTML = cast.map(c => {
    const w = Math.round(c.w);
    const x = Math.max(w / 2 + 2, Math.min(W - w / 2 - 2, c.u * W));
    const y = yT + (yB - yT) * c.v;                       // 발밑
    const flip = c.mon && c.u > 0.5;                       // 오른쪽 몬스터는 리드 쪽을 본다
    const dim = c.lead ? 1 : (0.82 + 0.18 * c.v).toFixed(2);
    return `<div class="tc" style="left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:${w}px;z-index:${Math.round(c.v * 100) + (c.lead ? 50 : 0)}">`
      + `<i class="tsh"></i><div class="tb" style="animation-delay:${((n++ * 0.37) % 2.4).toFixed(2)}s">`
      + `<img src="${c.src}" alt="" style="${flip ? 'transform:scaleX(-1);' : ''}filter:drop-shadow(0 5px 8px rgba(0,0,0,.4)) brightness(${dim})"`
      + (c.lead ? ` onerror="this.src='assets/mon/slime/idle_1.png'"` : ` onerror="this.closest('.tc').remove()"`) + `></div></div>`;
  }).join('');
  // 스크립트가 무대를 깔았으면 기본 3장은 숨긴다 (실패하면 그대로 남는다)
  const row = $('tRow'); if (row) row.style.visibility = 'hidden';
  castBuilt = true;
}
// 화면 크기가 바뀌면(회전 · 창 크기) 다시 깐다
let castTimer = 0;
window.addEventListener('resize', () => {
  if (!castBuilt || !$('title')?.classList.contains('on')) return;
  clearTimeout(castTimer); castTimer = setTimeout(() => { try { buildCast(); } catch {} }, 120);
});

/**
 * @param onStart 시작 버튼을 누른 뒤 실행할 것 (오프라인 보상 등)
 * @param onPress 버튼을 누른 **그 순간** 동기로 실행할 것. 오디오 활성화용이다 —
 *                모바일은 사용자 입력 핸들러 안에서 만든 AudioContext 만 울린다.
 *                onStart 는 450ms 페이드 뒤라 이미 입력 맥락이 아니다.
 */
export function showTitle(onStart, onPress) {
  const el = $('title');
  if (!el) { onStart?.(); return; }

  const fresh = S.life <= 1 && S.st <= 1;
  $('tStart').textContent = fresh ? '시작하기' : '이어하기';
  const lead = B.roster.monsters.find(m => m.key === S.mon)?.name || '';
  // 받침이 있으면 '과', 없으면 '와' — "본가드 와 함께" 처럼 어색하게 붙는 걸 막는다
  const josa = w => {
    const c = w.charCodeAt(w.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return '와';
    return (c - 0xac00) % 28 ? '과' : '와';
  };
  $('tSave').innerHTML = fresh
    ? '몬스터가 되어 숲을 지킨다'
    : `최고 <b style="color:#ffd34d">${chapterLabel(S.life)}</b> · ${lead}${josa(lead)} 함께`;
  $('tVer').textContent = 'v' + B.version;
  try { buildCast(); } catch (e) { console.warn('타이틀 출연진', e); }   // 실패해도 기본 3장이 남는다

  let done = false;
  const go = () => {
    if (done) return;            // 연타해도 한 번만
    done = true;
    try { onPress?.(); } catch {}   // 오디오가 실패해도 게임은 시작돼야 한다
    el.classList.add('out');
    setTimeout(() => { el.classList.remove('on', 'out'); onStart?.(); }, 450);
  };
  $('tStart').onclick = go;
}
