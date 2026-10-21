// 부팅 + 메인 루프.
import { B } from './balance.js';
import { S, load, save } from './state.js';
import { enterStage, tick, setEventHandler, MODE, R } from './combat.js';
import { initRender, render, preloadFor, resize } from './render.js';
import { initUI, refresh, toast } from './ui.js';
import { pendingOffline, claimOffline, fmtDuration } from './offline.js';
import { fmt } from './logmath.js';
import { initAds, playRewarded, isNative } from './ads.js';

load();

initAds().then(ok => console.log('[ads]', ok ? 'AdMob 초기화 완료' : (isNative() ? 'AdMob 실패 — 시뮬' : '웹 — 시뮬레이션')));

// 저장된 인벤토리에서 보유 효과를 다시 계산한다 (S.own 은 파생 캐시다)
const { recomputeGacha, ensureDaily: ensureFreePulls } = await import('./gacha.js');
const { ensureKeys } = await import('./dungeon.js');
const { ensureDaily } = await import('./daily.js');
const { ensureLayer2 } = await import('./layer2.js');
recomputeGacha();
ensureFreePulls();
ensureKeys();
ensureDaily();
ensureLayer2();

initRender(document.getElementById('game'));
initUI();
preloadFor(S.st);

setEventHandler(ev => {
  if (ev.type === 'stageClear') refresh();
  if (ev.type === 'death') refresh();
});

// 오프라인 보상
const off = pendingOffline();
if (off) {
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
  acc += dt;
  if (acc > 0.25) { acc = 0; refresh(); }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

setInterval(save, 5000);
addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);
// 패널을 열고 닫을 때 캔버스 크기가 바뀔 수 있다
new ResizeObserver(resize).observe(document.getElementById('game'));

// 디버그 훅 (브라우저 콘솔에서 상태 확인용)
window.MI = { S, R, B };
