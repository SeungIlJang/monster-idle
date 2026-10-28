// 부팅 + 메인 루프.
import { B } from './balance.js';
import { S, load, save } from './state.js';
import { enterStage, tick, setEventHandler, MODE, R } from './combat.js';
import { initRender, render, preloadFor, resize, bgAdvance } from './render.js';
import { initUI, refresh, toast } from './ui.js';
import { pendingOffline, claimOffline, fmtDuration } from './offline.js';
import { fmt } from './logmath.js';
import { initAds, playRewarded, isNative } from './ads.js';
import { renderSkillBar } from './ui-skills.js';
import { showTitle } from './ui-title.js';
import * as sfx from './audio.js';

load();

initAds().then(ok => console.log('[ads]', ok ? 'AdMob 초기화 완료' : (isNative() ? 'AdMob 실패 — 시뮬' : '웹 — 시뮬레이션')));

// 저장된 인벤토리에서 보유 효과를 다시 계산한다 (S.own 은 파생 캐시다)
const { recomputeGacha, ensureDaily: ensureFreePulls } = await import('./gacha.js');
const { ensureKeys } = await import('./dungeon.js');
const { ensureDaily } = await import('./daily.js');
const EV = await import('./events.js');
const { ensureLayer2 } = await import('./layer2.js');
recomputeGacha();
ensureFreePulls();
ensureKeys();
ensureDaily();
EV.ensureEvent();
EV.validate();          // 데이터가 젬 예산을 넘으면 콘솔 경고
ensureLayer2();

initRender(document.getElementById('game'));
initUI();
preloadFor(S.st);

// 전투는 **사건만 알린다.** 소리 연결은 여기서 한다 — combat.js 가 오디오를 직접 들면
// 전투 로직이 재생 실패에 얽힌다. 기존 동작(클리어 시 갱신·예열)은 그대로 둔다.
setEventHandler(ev => {
  switch (ev.type) {
    case 'attack':    break;                    // 발사 자체는 조용하다 — 소리는 닿을 때 난다
    case 'impact':    sfx.attack(); break;      // 투사체가 맞은 순간
    case 'playerHit': sfx.playerHit(); break;
    case 'kill':      sfx.kill(); break;
    case 'wave':      bgAdvance(); break;        // 웨이브를 넘길 때 한 걸음 더
    // 클리어마다 다음 장면 자원을 예열한다 (적·배경이 5스테이지마다 바뀐다)
    case 'stageClear': refresh(); preloadFor(ev.stage + 1); bgAdvance(1.1); break;   // 스테이지는 더 길게
    case 'death':      refresh(); break;
  }
});

// 오프라인 보상 — **타이틀을 닫은 뒤** 띄운다. 먼저 띄우면 타이틀 뒤에 가려진다.
const off = pendingOffline();
function showOfflineReward() {
  if (!off) return;
  const box = document.getElementById('offline');
  document.getElementById('offTime').textContent = fmtDuration(off.seconds) +
    (off.seconds > off.capped ? ' (최대 ' + B.offline.capHours + '시간까지)' : '');
  document.getElementById('offGold').textContent = '+ ' + fmt(off.Lgold);
  box.classList.add('on');
  document.getElementById('offClaim').onclick = () => {
    claimOffline(off, 1);
    save();
    box.classList.remove('on');
    refresh();
  };
  document.getElementById('offClaim2').onclick = async () => {
    if (!await playRewarded()) { toast('광고를 끝까지 봐야 보상을 받습니다'); return; }
    claimOffline(off, 2);
    save();
    box.classList.remove('on');
    refresh();
    toast('오프라인 보상 2배!');
  };
}

// 첫 화면 → (시작) → 오프라인 보상
showTitle(showOfflineReward, () => sfx.init());   // 입력 핸들러 안에서 컨텍스트를 깨운다

enterStage(S.st, MODE.RUN);
refresh();

let last = performance.now();
let acc = 0;
function loop(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;            // 탭 복귀 시 점프 방지
  // 배속은 **라이브 루프에만** 건다. 오프라인 보상은 실제 경과 시간으로 따로 계산하므로
  // 여기서 늘려도 그쪽은 영향받지 않는다(시뮬이 검증한 것도 전투 처리량뿐이다).
  const sdt = dt * (S.spd || 1);
  tick(sdt);
  render(sdt);
  renderSkillBar();        // 쿨 채움은 매 프레임 — DOM 은 구성이 바뀔 때만 다시 만든다
  acc += dt;
  if (acc > 0.25) { acc = 0; refresh(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

setInterval(save, 5000);
addEventListener('visibilitychange', () => {
  if (document.hidden) { save(); sfx.suspend(); }
  else sfx.resume();          // 밀린 소리는 suspend 에서 버렸으므로 몰아 울리지 않는다
});
addEventListener('pagehide', save);
// 패널을 열고 닫을 때 캔버스 크기가 바뀔 수 있다
new ResizeObserver(resize).observe(document.getElementById('game'));

// 디버그 훅 (브라우저 콘솔에서 상태 확인용)
window.MI = { S, R, B };
