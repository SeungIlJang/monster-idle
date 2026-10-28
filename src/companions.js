// 동료 — 리드 몬스터 옆에서 같이 싸우는 조연들.
//
// **피해를 더하지 않는다.** 동료의 DPS 기여는 이미 `comp` 배너의 장착 효과로
// 계산에 들어가 있다(stats.js gC()). 여기서 또 때리면 이중 계산이 되고,
// 30/365/730일 시뮬 판정을 다시 받아야 한다. 이 파일이 하는 일은
// **이미 존재하는 수치에 몸을 주는 것**뿐이다.
//
// 누가 서는가: **내가 수집한 몬스터** 중 리드를 뺀 상위 레벨 순.
// 몇 기가 서는가: 열린 슬롯 수 = activeSlots('comp') — 스테이지 10/40/100/200/400/14500.
import { activeSlots } from './gacha.js';
import { B } from './balance.js';
import { S } from './state.js';
import { monLevel } from './layer2.js';

// 리드 기준 상대 배치. x 는 캔버스 폭 비율, y 는 리드 키 비율(음수 = 위 = 멀리).
// 일부러 줄을 맞추지 않았다 — 줄을 세우면 "부대"가 아니라 "목록"으로 보인다.
//
// 크기가 중요하다. 처음에 0.70~0.80 으로 뒀더니 리드와 덩치가 비슷해서
// 다섯이 뭉친 게 "부대"가 아니라 "뭔지 모를 덩어리"로 보였다. 확실히 작아야
// 겹침이 거리감으로 읽힌다. 세로로 벌리는 게 가로보다 자리를 덜 먹는다.
// d 는 깊이(0 = 맨 뒤 · 1 = 맨 앞). 리드는 0.45 에 선다.
// 리드와 깊이가 겹치지 않게 앞뒤로 갈라 두면 겹쳐도 가리는 게 아니라 거리로 읽힌다.
// s 는 리드 대비 크기. 0.80 으로 뒀더니 동료가 리드만큼 커서 누가 주인공인지
// 흐려졌다 — 프롬프트에 적은 규격(0.75)보다 더 줄여야 실제로 작아 보인다.
const SLOTS = [
  { dx: -0.080, d: 0.12, s: 0.60 },
  { dx: -0.175, d: 0.30, s: 0.58 },
  { dx: -0.045, d: 0.68, s: 0.64 },
  { dx: -0.215, d: 0.56, s: 0.60 },
  { dx: -0.130, d: 0.88, s: 0.62 },
  // 6번째(14,500층 해금). 리드 뒤가 2칸, 앞이 3칸이라 **뒤쪽**에 넣어 균형을 맞춘다.
  // 깊이 0.41 은 리드(0.45) 바로 뒤이고, 이웃(-0.175@0.30 / -0.215@0.56)과
  // 가로·깊이 모두 벌어져 있어 겹쳐 보이지 않는다.
  { dx: -0.110, d: 0.41, s: 0.59 },
];

const IMG = new Map();
/** assets/comp/<id>.png 가 있으면 그것, 없으면 null (대역 스프라이트로 폴백) */
export function compImage(id) {
  if (!IMG.has(id)) {
    const im = new Image();
    im.src = new URL('../assets/comp/' + id + '.png', import.meta.url).href;
    im.onerror = () => IMG.set(id, null);
    IMG.set(id, im);
  }
  const im = IMG.get(id);
  return im && im.complete && im.naturalWidth > 0 ? im : null;
}

/**
 * 지금 화면에 세울 동료들. 배치까지 붙여서 돌려준다.
 * 장착 목록이 슬롯보다 적으면 그만큼만 — 빈 자리를 채우지 않는다.
 */
export function activeCompanions() {
  // 전장에 서는 건 **내가 수집한 몬스터** 다. 리드를 뺀 나머지 중 레벨이 높은 순으로 세운다.
  //
  // 예전엔 동료 뽑기 아이템(작은 슬라임·박쥐 떼…)이 섰고, 그마저 전용 그림이 없어
  // STAND_IN 으로 몬스터 그림을 빌려 쓰고 있었다. 그래서 화면에 버섯이 서 있어도
  // "내가 키운 스포어링" 이 아니라 "스포어링 그림을 빌린 동료" 였다 —
  // 9종을 모으고 레벨을 올려도 전장에 흔적이 없었다.
  //
  // 밸런스는 그대로다. 동료 뽑기 효과(gC)는 LDPS 에 따로 들어가고 여기서는
  // **누가 서는지**만 정한다. 슬롯 수도 예전처럼 동료 배너의 해금 수를 쓴다.
  const slots = Math.min(activeSlots('comp'), SLOTS.length);
  const squad = B.roster.monsters
    .filter(m => m.key !== S.mon && S.life >= m.unlock)   // 리드는 가운데 따로 선다
    .sort((a, b) => (monLevel(b.key) - monLevel(a.key)) || a.unlock - b.unlock)
    .slice(0, slots);

  const out = squad.map((m, i) => ({
    id: m.key,
    name: m.name,
    lv: monLevel(m.key),
    tier: monTier(m.key),      // 마일스톤 티어 — 레벨이 오르면 겉모습이 달라진다
    sprite: m.key,
    ...SLOTS[i],
    phase: i * 1.7,          // 흔들림이 겹치지 않게
    delay: i * 0.035,        // 공격이 리드보다 조금씩 늦게 — 어긋나야 여럿으로 보인다
  }));
  // 뒤에 있는 것부터 그려야 가까운 것이 앞에 온다
  return out.sort((a, b) => a.d - b.d);
}

/**
 * 마일스톤 티어 (0~5). 레벨 10·25·50·75·100 을 넘을 때마다 1 씩 오른다.
 * 외형 변화의 단위다 — 레벨 1 마다 바꾸면 변화가 안 읽히고, 마일스톤은 이미
 * 공격력 보너스를 주는 지점이라 "뭔가 달라졌다" 와 보상이 같이 온다.
 */
export function monTier(key) {
  const lv = monLevel(key);
  return (B.layer2.collect.milestoneLevels || []).filter(x => lv >= x).length;
}

/** 동료 슬롯이 하나라도 열렸는가 — UI 안내용 */
export const hasCompanions = () => activeCompanions().length > 0;
