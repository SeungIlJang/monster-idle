// 첫 화면. 켜면 이게 먼저 나오고, 시작을 누르면 전투로 들어간다.
//
// 방치형에서 타이틀이 매번 길게 걸리면 성가시다. 그래서 **한 번 누르면 끝**이고
// 애니메이션도 0.45초다. 대신 이어서 하는 사람에게는 "최고 몇 층" 을 보여줘서
// 누르기 전에 자기 진행 상황이 보이게 한다.
import { S } from './state.js';
import { B, chapterLabel } from './balance.js';

const $ = id => document.getElementById(id);

/**
 * @param onStart 시작 버튼을 누른 뒤 실행할 것 (오프라인 보상 등)
 */
export function showTitle(onStart) {
  const el = $('title');
  if (!el) { onStart?.(); return; }

  const fresh = S.best <= 1 && S.st <= 1;
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
    : `최고 <b style="color:#ffd34d">${chapterLabel(S.best)}</b> · ${lead}${josa(lead)} 함께`;
  $('tVer').textContent = 'v' + B.version;

  let done = false;
  const go = () => {
    if (done) return;            // 연타해도 한 번만
    done = true;
    el.classList.add('out');
    setTimeout(() => { el.classList.remove('on', 'out'); onStart?.(); }, 450);
  };
  $('tStart').onclick = go;
}
