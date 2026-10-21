// 2단계 레이어 — 광산 → 몬스터 수집 → 마스터리 / 연구 (DESIGN.md §9)
//
// 설계 의도: 가챠 보유 효과는 시간에 "선형"으로만 쌓여 장기 곡선이 죽는다.
// 2단계는 시간에 "복리"로 붙는 승산 트랙이라 그 자리를 메운다.
// 시뮬(tools/design-sim.cjs)이 같은 수식으로 365일·730일을 검증했다.
import { B } from './balance.js';
import { S } from './state.js';
import { ensureMineDaily as _mineDaily, picks as _picks } from './mine.js';

const L2 = B.layer2;
const M = L2.mine;

export const MASTERY_NODES = L2.mastery.nodes;
export const MILESTONES = L2.collect.milestoneLevels;

function today() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// ══════════════════════════════════════════════ 광산
// 타일 채굴 미니게임은 mine.js 가 담당한다. 여기서는 다시 내보내기만 한다.
export {
  WIDTH, TILE, isDug, ensureGrid, rows, canDig, digTile, digAuto, bombAt,
  picks, nextPickIn, pickMax, bombLeft, ensureMineDaily, depth, depthMult,
  perPick, expectedPerPick,
} from './mine.js';

// ══════════════════════════════════════════════ 몬스터 수집
export const MONSTERS = B.roster.monsters;
export const monLevel = key => S.monLv[key] || 0;
/** 다음 레벨 비용 (조각) */
export const monCost = key => L2.collect.shardCostPerLevel * (monLevel(key) + 1);

export function levelUpMonster(key, times = 1) {
  let done = 0;
  for (let i = 0; i < times; i++) {
    const c = monCost(key);
    if (S.shard < c) break;
    S.shard -= c;
    S.monLv[key] = monLevel(key) + 1;
    done++;
  }
  return done;
}
/** 조각이 허락하는 만큼 전부 */
export function levelUpMonsterMax(key) { return levelUpMonster(key, 10000); }

export const totalMonLevels = () => MONSTERS.reduce((a, m) => a + monLevel(m.key), 0);
/** 달성한 마일스톤 수 (몬스터별로 센다) */
export const milestoneCount = () =>
  MONSTERS.reduce((a, m) => a + MILESTONES.filter(x => monLevel(m.key) >= x).length, 0);

// ══════════════════════════════════════════════ 마스터리
export const masteryPoints = () => totalMonLevels();
export const masterySpent = () => MASTERY_NODES.reduce((a, n) => a + (S.mastery[n.key] || 0), 0);
export const masteryFree = () => masteryPoints() - masterySpent();

export function spendMastery(nodeKey, times = 1) {
  let done = 0;
  for (let i = 0; i < times; i++) {
    if (masteryFree() < 1) break;
    S.mastery[nodeKey] = (S.mastery[nodeKey] || 0) + 1;
    done++;
  }
  return done;
}
export const masteryResetCost = () => L2.mastery.resetGems || 0;
/** @returns {boolean} 되돌렸는지 — 젬이 모자라거나 찍은 게 없으면 false */
export function resetMastery() {
  if (masterySpent() < 1) return false;
  const cost = masteryResetCost();
  if (S.gem < cost) return false;
  S.gem -= cost;
  for (const n of MASTERY_NODES) S.mastery[n.key] = 0;
  return true;
}
/** 노드 배수 (실수) */
export const masteryMul = nodeKey => Math.pow(L2.mastery.perPoint, S.mastery[nodeKey] || 0);

// ══════════════════════════════════════════════ 연구
export const researchLv = () => S.rs.lv || 0;
export const researchCost = () => Math.round(L2.research.oreC0 * Math.pow(L2.research.oreGrow, researchLv()));
/** 소요 시간(초) */
export const researchSeconds = () =>
  Math.min(L2.research.maxHours, L2.research.baseHours * Math.pow(L2.research.hourGrow, researchLv())) * 3600;

export const researchRunning = () => !!S.rs.startAt;
export function researchLeft() {
  if (!S.rs.startAt) return 0;
  return Math.max(0, Math.ceil((S.rs.startAt + researchSeconds() * 1000 - Date.now()) / 1000));
}
export const researchReady = () => researchRunning() && researchLeft() <= 0;

export function startResearch() {
  if (researchRunning()) return false;
  const c = researchCost();
  if (S.ore < c) return false;
  S.ore -= c;
  S.rs.startAt = Date.now();
  return true;
}
export function collectResearch() {
  if (!researchReady()) return false;
  S.rs.lv = researchLv() + 1;
  S.rs.startAt = 0;
  return true;
}
/** 광고로 30분 단축 */
export function rushResearch() {
  if (!researchRunning() || researchReady()) return false;
  S.rs.startAt -= 30 * 60000;
  return true;
}
export const researchMul = () => Math.pow(L2.research.atkPerLevel, researchLv());

// ══════════════════════════════════════════════ 전투 반영
/** 수집 마일스톤은 가산 보너스 */
export const milestoneMul = () => 1 + (milestoneCount() * L2.collect.milestoneAtkPct) / 100;
/** 공격력 배수 = 마스터리 공격 노드 × 연구 × 마일스톤 */
export const atkMul = () => masteryMul('atk') * researchMul() * milestoneMul();
export const hpMul = () => masteryMul('hp');
export const dpsMul = () => masteryMul('dps');

export function ensureLayer2() {
  _mineDaily();
  _picks();
}
