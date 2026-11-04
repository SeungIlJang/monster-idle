// 첫 화면. 켜면 이게 먼저 나오고, 시작을 누르면 전투로 들어간다.
//
// 방치형에서 타이틀이 매번 길게 걸리면 성가시다. 그래서 **한 번 누르면 끝**이고
// 애니메이션도 0.45초다. 대신 이어서 하는 사람에게는 "최고 몇 층" 을 보여줘서
// 누르기 전에 자기 진행 상황이 보이게 한다.
import { S } from './state.js';
import { B, chapterLabel } from './balance.js';
import { evoPrefix } from './sprites.js';
import { monTier, skyCompanions } from './companions.js';

const $ = id => document.getElementById(id);

/**
 * 출연진 — **보유한 것만** 세운다.
 *
 * 타이틀은 "내가 모은 것" 의 진열장이다. 아직 없는 것을 보여주는 역할은 도감이
 * 검은 실루엣으로 이미 하고 있고, 여기서 12종을 다 받으면 신규 유저가 1.3MB 를 문다.
 * 보유분만 쓰면 비용이 진척도에 비례하고(신규 364KB · 만렙 1,321KB), 12종을 모을
 * 무렵이면 도감과 전장이 이미 받아 둬서 사실상 공짜다.
 *
 * 배치는 전장과 같다 — 몬스터는 땅, 뽑기 동료는 하늘. 이미 아는 그림이 된다.
 */
function buildCast() {
  const sky = $('tSky'), back = $('tBack'), front = $('tFront');
  if (!sky || !back || !front) return;

  const owned = B.roster.monsters.filter(m => S.life >= m.unlock);
  const lead = owned.find(m => m.key === S.mon) || owned[0];
  const rest = owned.filter(m => m !== lead);
  // 뒷줄은 해금이 이른 것부터 — 왼쪽에서 오른쪽으로 성장 순서가 읽힌다
  const half = Math.ceil(rest.length / 2);
  const backRow = rest.slice(0, half);
  const frontRow = rest.slice(half);

  // 레벨에 따라 진화한 모습으로 — 키운 게 타이틀에 남아야 한다
  const src = m => `assets/mon/${m.key}/${evoPrefix('mon', m.key, monTier(m.key))}idle_1.png`;
  const img = (cls, s, i) =>
    `<img class="${cls}" src="${s}" alt="" style="animation-delay:${(i * 0.21).toFixed(2)}s"`
    + ` onerror="this.style.display='none'">`;

  back.innerHTML = backRow.map((m, i) => img('c3', src(m), i)).join('');
  // 리드를 가운데 두려고 앞줄을 반으로 갈라 양옆에 붙인다
  const h = Math.floor(frontRow.length / 2);
  front.innerHTML =
    frontRow.slice(0, h).map((m, i) => img('c2', src(m), i)).join('')
    + (lead ? img('c1', src(lead), 0) : '')
    + frontRow.slice(h).map((m, i) => img('c2', src(m), i + h)).join('');

  // 하늘 — 장착된 뽑기 동료. 없으면 줄 자체가 비어 공간을 안 먹는다.
  let eq = [];
  try { eq = skyCompanions(); } catch { eq = []; }
  sky.innerHTML = eq.map((c, i) => img('cs', `assets/comp/${c.id}.png`, i)).join('');
}

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
  buildCast();

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
