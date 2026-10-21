// 동료 — 리드 몬스터 옆에서 같이 싸우는 조연들.
//
// **피해를 더하지 않는다.** 동료의 DPS 기여는 이미 `comp` 배너의 장착 효과로
// 계산에 들어가 있다(stats.js gC()). 여기서 또 때리면 이중 계산이 되고,
// 30/365/730일 시뮬 판정을 다시 받아야 한다. 이 파일이 하는 일은
// **이미 존재하는 수치에 몸을 주는 것**뿐이다.
//
// 누가 서는가: `comp` 배너에 자동 장착된 아이템 그대로(gacha.js equippedList).
// 몇 기가 서는가: 열린 슬롯 수 = activeSlots('comp') — 스테이지 10/40/100/200/400 에서 하나씩.
import { equippedList, CATALOG } from './gacha.js';

// comp 아이템 id → 대역으로 쓸 몬스터 스프라이트.
// assets/comp/<id>.png 를 넣으면 그쪽이 우선이다(배경과 같은 방식).
// 도깨비불·그림자가 둘 다 ghost 인 건 전용 그림이 없는 동안의 임시 조치다.
const STAND_IN = {
  slimelet: 'slime',
  bats: 'bat',
  spore: 'mushroom',
  wisp: 'ghost',
  shard: 'golem',
  shade: 'ghost',
};

// 리드 기준 상대 배치. x 는 캔버스 폭 비율, y 는 리드 키 비율(음수 = 위 = 멀리).
// 일부러 줄을 맞추지 않았다 — 줄을 세우면 "부대"가 아니라 "목록"으로 보인다.
//
// 크기가 중요하다. 처음에 0.70~0.80 으로 뒀더니 리드와 덩치가 비슷해서
// 다섯이 뭉친 게 "부대"가 아니라 "뭔지 모를 덩어리"로 보였다. 확실히 작아야
// 겹침이 거리감으로 읽힌다. 세로로 벌리는 게 가로보다 자리를 덜 먹는다.
const SLOTS = [
  { dx: -0.135, dy: -0.16, s: 0.50 },     // -0.085 였을 때 리드 뒤에 통째로 가려졌다
  { dx: -0.180, dy: -0.06, s: 0.46 },
  { dx: -0.065, dy: 0.10, s: 0.60 },
  { dx: -0.235, dy: 0.06, s: 0.52 },
  { dx: -0.155, dy: 0.18, s: 0.56 },
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
  const eq = equippedList('comp');
  const out = [];
  for (let i = 0; i < eq.length && i < SLOTS.length; i++) {
    const def = CATALOG.comp.find(c => c.id === eq[i].id);
    if (!def) continue;
    out.push({
      id: eq[i].id,
      name: def.name,
      rarity: eq[i].rarity,
      sprite: STAND_IN[eq[i].id] || 'slime',
      ...SLOTS[i],
      phase: i * 1.7,          // 흔들림이 겹치지 않게
      delay: i * 0.035,        // 공격이 리드보다 조금씩 늦게 — 어긋나야 여럿으로 보인다
    });
  }
  // 위에 있는(멀리 있는) 것부터 그려야 가까운 것이 앞에 온다
  return out.sort((a, b) => a.dy - b.dy);
}

/** 동료 슬롯이 하나라도 열렸는가 — UI 안내용 */
export const hasCompanions = () => equippedList('comp').length > 0;
