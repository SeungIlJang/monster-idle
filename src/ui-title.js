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
 * 출연진 — 예전 구성(가운데 리드 · 왼쪽 포자 버섯 · 오른쪽 박쥐)에서 시작해
 * **가진 몬스터·동료가 늘수록 양옆 바깥으로 더 선다.**
 *
 * 한 줄이다. 여러 줄로 쌓았더니(뒷줄·앞줄·하늘) 세로로 늘어선 목록처럼 보여 예전 느낌이 사라졌다.
 * 바깥으로 갈수록 작아지고 살짝 겹친다 — 세로 가운데 정렬이라 작은 것이 조금 위에 서서 멀리 있는 것으로 읽힌다.
 * 화면 폭을 넘는 만큼은 세우지 않는다(레벨 높은 몬스터가 리드 가까이 선다).
 */
const DECOR = ['spore', 'bats'];           // 예전 화면의 두 동료 — 신규 유저도 이 셋으로 시작한다
const OV = 0.42;                           // 바깥 것이 안쪽 이웃과 겹치는 비율
// 몬스터 그림은 투명 여백이 동료 그림보다 커서 같은 상자면 작고 흐릿하게 뭉친다 — 상자를 키워 눈에 보이는 크기를 맞춘다
const MON_BOX = 1.2;
function buildCast() {
  const row = $('tRow');
  if (!row) return;
  const W = Math.min(row.parentElement?.clientWidth || window.innerWidth || 360, 540) - 12;

  const owned = B.roster.monsters.filter(m => S.life >= m.unlock);
  const lead = owned.find(m => m.key === S.mon) || owned[0] || B.roster.monsters[0];
  const monSrc = m => `assets/mon/${m.key}/${evoPrefix('mon', m.key, monTier(m.key))}idle_1.png`;
  const compSrc = id => `assets/comp/${id}.png`;

  // 가진 뽑기 동료 종류 (인벤토리 키 "id|등급|강화")
  const compIds = [...new Set(Object.entries(S.inv?.comp || {})
    .filter(([, n]) => n > 0).map(([k]) => k.split('|')[0]))];
  const mons = owned.filter(m => m !== lead)
    .sort((a, b) => ((S.monLv[b.key] || 0) - (S.monLv[a.key] || 0)) || a.unlock - b.unlock)
    .map(m => ({ src: monSrc(m), box: MON_BOX }));
  const comps = compIds.filter(id => !DECOR.includes(id)).map(id => ({ src: compSrc(id), box: 1 }));

  // 리드 바로 옆은 예전 그 둘(왼쪽 포자 · 오른쪽 박쥐). 그 바깥은 몬스터와 동료를 짝지어 양쪽에 섞는다.
  // 그냥 번갈아 넣으면 좌우도 번갈아 채워져서 왼쪽은 몬스터만, 오른쪽은 동료만 섰다.
  // 짝마다 먼저 갈 쪽을 바꾸고, 늘 덜 찬 쪽에 넣는다.
  const Lq = [{ src: compSrc(DECOR[0]), box: 1 }], Rq = [{ src: compSrc(DECOR[1]), box: 1 }];
  for (let i = 0; i < Math.max(mons.length, comps.length); i++) {
    for (const it of (i % 2 ? [comps[i], mons[i]] : [mons[i], comps[i]])) {
      if (it) (Lq.length <= Rq.length ? Lq : Rq).push(it);
    }
  }

  // 크기 — 많아지면 리드도 조금 줄인다. 바깥 k 번째는 0.88^k 로 작아지고 안쪽 이웃과 절반 겹친다.
  // 스프라이트에 투명 여백이 있어서 상자를 절반 겹쳐도 그림은 덜 가린다. 28% 로는 375px 폭에 양옆 2개씩뿐이었다.
  const many = Lq.length + Rq.length > 4;
  const leadW = many ? 112 : 128, base = many ? 56 : 62;
  const sideW = (k, box = 1) => Math.round(Math.max(30, base * Math.pow(0.88, k)) * box);
  const step = (k, box) => (k === 0 ? sideW(0, box) + 4 : Math.round(sideW(k, box) * (1 - OV)));   // 이 칸이 차지하는 가로
  const room = (W - leadW) / 2;
  // 안쪽부터 채우다 화면 밖으로 넘으면 거기서 멈춘다 (레벨 높은 몬스터가 안쪽에 있다)
  const fit = q => {
    const out = []; let used = 0;
    for (const it of q) {
      const need = step(out.length, it.box);
      if (used + need > room) break;
      out.push(it); used += need;
    }
    return out;
  };
  const L = fit(Lq), R = fit(Rq);

  let n = 0;
  const img = (src, w, k, toward) => {
    const ov = k === 0 ? -4 : Math.round(w * OV);             // 안쪽(리드 쪽)으로 겹친다
    const m = toward === 'R' ? `margin-right:${-ov}px` : `margin-left:${-ov}px`;
    const depth = `brightness(${(1 - k * 0.05).toFixed(2)})`;
    return `<img src="${src}" alt="" onerror="this.style.display='none'" style="width:${w}px;${m};`
      + `z-index:${20 - k};filter:drop-shadow(0 6px 10px rgba(0,0,0,.45)) ${depth};`
      + `animation-delay:${((n++ * 0.37) % 2.4).toFixed(2)}s">`;
  };
  // 왼쪽은 바깥부터 그려야 순서가 맞는다 (바깥 … 안쪽 · 리드 · 안쪽 … 바깥)
  const left = L.map((it, k) => ({ it, k })).reverse().map(o => img(o.it.src, sideW(o.k, o.it.box), o.k, 'R')).join('');
  const right = R.map((it, k) => img(it.src, sideW(k, it.box), k, 'L')).join('');
  row.innerHTML = left
    + `<img src="${monSrc(lead)}" alt="" onerror="this.src='assets/mon/slime/idle_1.png'" style="width:${leadW}px;z-index:30;`
    + `filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))">`
    + right;
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
