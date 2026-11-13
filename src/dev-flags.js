// 개발자 모드 실시간 스위치 — ui-dev.js 가 바꾸고 전투·메인 루프·광고·이벤트가 읽는다.
//
// **세이브에 넣지 않는다.** 새로고침하면 전부 꺼진다. 무적이나 피해 배수가 세이브에 남으면
// 개발용으로 켠 걸 잊고 밸런스를 보다가 판단이 통째로 틀어진다.
// 아무것도 import 하지 않는다 — combat·main 이 이걸 부르므로 거꾸로 부르면 순환이 된다.
export const DEV = {
  god: false,      // 무적: 적이 때리는 모습만 나오고 체력이 줄지 않는다 (combat.foeStrike)
  Ldmg: 0,         // 피해 배수 (log10). 0 = ×1, 3 = ×1000 (combat 평타·스킬)
  speed: 1,        // 전투 배속. 저장된 ×1/×2 위에 곱한다. 0 이면 멈춤 (main loop)
  adSkip: false,   // 보상형 광고를 건너뛰고 바로 보상 (ads.playRewarded)
  event: '',       // 기간과 상관없이 이 이벤트를 연다 (events.activeEvent)
};
