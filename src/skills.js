// 액티브 스킬 — 스킬 배너에 장착된 것이 쿨타임마다 터진다.
//
// **피해를 더하지 않는다.** 총 DPS 의 `skills.dpsShare` 만큼을 평타에서 떼어
// 스킬 버스트로 돌린다. 평균은 그대로다:
//
//   평타      = DPS × (1 - share)
//   스킬 i    = DPS × share / N  를 쿨타임 cd_i 동안 모았다가 한 번에
//             → 한 방 = DPS × share / N × cd_i
//
// 더하는 쪽을 택하지 않은 이유는 배속 검증에서 나왔다 — 곡선이 로그라 처리량을
// 늘려도 스테이지는 상수만큼만 오른다. 더해봐야 의미가 없고 판정만 다시 받아야 한다.
// 동료 때와 같이 **이미 있는 수치에 몸을 주는 것**이 맞다(DESIGN.md).
import { B } from './balance.js';
import { S } from './state.js';
import { equippedList, CATALOG } from './gacha.js';

const CFG = B.skills;

/** 지금 장착된 스킬들. 쿨타임까지 붙여서 돌려준다. */
export function equippedSkills() {
  const out = [];
  for (const it of equippedList('skill')) {
    const def = CATALOG.skill.find(s => s.id === it.id);
    if (!def) continue;
    out.push({ id: it.id, name: def.name, icon: def.icon, rarity: it.rarity, cd: CFG.cd[it.id] || 8 });
  }
  return out;
}

/** 스킬이 가져가는 DPS 비율. 장착한 게 없으면 0 — 평타가 100% 를 낸다. */
export const dpsShare = () => (equippedSkills().length ? CFG.dpsShare : 0);

/** 평타에 곱할 배수 (1 - share) */
export const normalShare = () => 1 - dpsShare();

/**
 * 쿨타임을 진행시키고 준비된 스킬을 터뜨린다.
 * @param st  { [id]: 남은쿨 } — 전투 런타임이 들고 있는다(세이브 대상 아님)
 * @param fire(skill, mul)  mul = 이 한 방이 "DPS 몇 초치" 인가
 */
export function tickSkills(st, dt, fire) {
  const list = equippedSkills();
  if (!list.length) return;
  const share = CFG.dpsShare / list.length;
  for (const sk of list) {
    if (st[sk.id] === undefined) st[sk.id] = sk.cd * Math.random();   // 처음엔 흩어서 시작
    st[sk.id] -= dt;
    if (st[sk.id] > 0) continue;
    // 수동 모드면 0 에서 멈춰 "준비됨" 으로 기다린다. 여기서 쿨을 더해버리면
    // 준비 상태가 한 프레임도 유지되지 않아 누를 수가 없다.
    if (S.autoSkill === false) { st[sk.id] = 0; continue; }
    // 때릴 대상이 없으면 터뜨리지 않고 준비된 채로 기다린다 — 쿨만 쓰고 피해가
    // 사라지면 그만큼 DPS 가 샌다(평타는 이미 깎여 있다).
    if (fire(sk, share * sk.cd)) st[sk.id] += sk.cd;
    else st[sk.id] = 0;
  }
}

/** 바에 그릴 상태 (0~1 채움) */
export function skillBar(st) {
  return equippedSkills().map(sk => ({
    ...sk,
    fill: st[sk.id] === undefined ? 0 : Math.max(0, Math.min(1, 1 - st[sk.id] / sk.cd)),
  }));
}

/** 수동 발동 — 준비된 것만 */
export function fireNow(st, id, fire) {
  const list = equippedSkills();
  const sk = list.find(s => s.id === id);
  if (!sk || !(st[id] <= 0.0001)) return false;
  if (!fire(sk, (CFG.dpsShare / list.length) * sk.cd)) return false;
  st[id] = sk.cd;
  return true;
}
