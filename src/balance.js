// balance.json 로더 + 파생 헬퍼.
// 상수는 전부 balance.json 에만 있다 — 시뮬레이터(tools/design-sim.cjs)도 같은 파일을 읽는다.
import { fromNum } from './logmath.js';

const res = await fetch(new URL('./balance.json', import.meta.url));
if (!res.ok) throw new Error('balance.json 로드 실패: ' + res.status);

/** @type {any} */
export const B = await res.json();

// 자주 쓰는 로그 상수를 미리 계산
export const LG = {
  hp0: fromNum(B.enemy.hp0),
  hpGrow: fromNum(B.enemy.hpGrow),
  atk0: fromNum(B.enemy.atk0),
  atkGrow: fromNum(B.enemy.atkGrow),
  gold0: fromNum(B.enemy.gold0),
  goldGrow: fromNum(B.enemy.goldGrow),
  bossHp: fromNum(B.stage.bossHpMul),
  bossAtk: fromNum(B.stage.bossAtkMul),
  bossGold: fromNum(B.stage.bossGoldMul),
};

for (const k of Object.keys(B.stats)) {
  const d = B.stats[k];
  d.key = k;
  // 깊은 층에 해금되는 스탯은 시작 가격이 10^1000 을 넘어 JSON 숫자(double, 최대 ~1.8e308)
  // 로는 못 적는다 — 그런 것만 `c0log`(= log10 가격)로 직접 준다.
  d.Lc0 = d.c0log !== undefined ? d.c0log : fromNum(d.c0);
  d.Lg = fromNum(d.g);
  if (d.kind === 'mul') {
    d.Lbase = fromNum(d.base);
    d.Lr = fromNum(d.r);
  }
}

export const STAT_KEYS = Object.keys(B.stats);

/** 스테이지당 동시 등장 적 수 */
export const perWave = s => {
  const p = B.stage.perWave;
  return Math.min(p.cap, p.base + Math.floor(s / p.div));
};

export const isBoss = s => s % B.stage.bossEvery === 0;

/**
 * 관문 보스 — 일정 층마다 오는 **살아남는 시험**.
 *
 * 일반 보스는 체력만 6배라, 측정해 보니 1일차 이후로는 아무도 안 죽었다(365일 사망 127회가
 * 전부 1일차). 실패가 "죽음" 이 아니라 "너무 느림" 으로 바뀌어 있었다.
 * 적 공격력을 키우는 길은 막혀 있다 — 그걸로 죽이려면 배수가 10^6 은 돼야 했다.
 * 체력·방어가 적 공격력을 완전히 앞질러 자라기 때문이다.
 *
 * 그래서 관문은 **플레이어 최대 체력 비례**로 때린다. 스탯으로 못 피하고 DPS 로만 뚫린다.
 * 자세한 수치 근거는 balance.json 의 stage.gate 주석에 있다.
 */
export const gateCfg = () => B.stage.gate || null;
export const isGate = s => {
  const g = gateCfg();
  return !!g && g.every > 0 && s % g.every === 0;
};

/** 스테이지 s 의 적 수치 (log10) */
export const LeHP = (s, boss = isBoss(s)) => LG.hp0 + (s - 1) * LG.hpGrow + (boss ? LG.bossHp : 0);
export const LeATK = (s, boss = isBoss(s)) => LG.atk0 + (s - 1) * LG.atkGrow + (boss ? LG.bossAtk : 0);
export const LeGOLD = (s, boss = isBoss(s)) => LG.gold0 + (s - 1) * LG.goldGrow + (boss ? LG.bossGold : 0);

/** 챕터 = 10스테이지. 표시용 "324-7" */
export const chapterLabel = s => {
  const ch = Math.floor((s - 1) / B.stage.bossEvery) + 1;
  const idx = ((s - 1) % B.stage.bossEvery) + 1;
  return ch + '-' + idx;
};

/**
 * 적·지역 교체 주기. 보스 주기(10)와 **분리돼 있다.**
 * 둘이 같았을 때, 깊은 스테이지에서는 10스테이지가 40분이라 같은 적을 같은 배경에서
 * 40분 동안 상대했다(측정: 25층 한 판 250초). 그게 "같은 장면 반복" 의 정체였다.
 *
 * 밸런스에는 영향이 없다 — LeHP/LeATK/LeGOLD 는 스테이지와 보스 여부만 보고,
 * 어떤 적이 어느 지역에 나오는지는 이름과 그림뿐이다. 그래서 시뮬 재검증이 필요 없다.
 */
export const sceneEvery = () => B.stage.sceneEvery || B.stage.bossEvery;

// 적과 지역은 **주기는 같고 타이밍은 어긋나게** 바꾼다. 동시에 바꾸면 주기 내내
// 화면이 통째로 고정되지만, 절반씩 엇갈리면 2~3스테이지마다 둘 중 하나는 바뀐다.
// 용사 8종 × 지역 10종이라 조합은 200스테이지 동안 겹치지 않는다.
const rot = (list, s, shift = 0) => list[Math.floor((s - 1 + shift) / sceneEvery()) % list.length];

/** 현재 스테이지에서 등장하는 적(용사) */
export const heroAt = s => rot(B.roster.heroes, s);

/** 현재 스테이지의 지역 (배경 + 이름) */
export const zoneAt = s => rot(B.zones.list, s, Math.floor(sceneEvery() / 2));

/**
 * 스테이지 s 까지 등장한 용사 전원 = **다시 나올 수 있는 적의 풀.**
 * 1층에 나온 적은 2층에도 나올 수 있고, 10층에는 1~9층에 나온 적이 전부 나올 수 있다.
 * heroAt 은 `% length` 로 계속 순환하지만 풀은 전원에서 멈춘다.
 */
export const heroPool = s =>
  B.roster.heroes.slice(0, Math.min(B.roster.heroes.length, Math.floor((s - 1) / sceneEvery()) + 1));

// (stage, wave, slot) → 고정 난수. Math.random 을 쓰면 죽고 다시 들어올 때마다 편성이
// 바뀌어서 "장소" 가 아니라 슬롯머신이 된다. 같은 자리는 항상 같은 적이어야 한다.
function hash(a, b, c) {
  let x = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791);
  x = Math.imul(x ^ (x >>> 15), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * 적 한 기가 누구인지.
 *
 * 한 스테이지를 한 종류로만 채우면 깊은 스테이지는 한 판이 4분이라 4분 내내 같은 얼굴만 본다.
 * 그렇다고 전부 균등하게 섞으면 이번엔 **"이 구역의 적" 이라는 감각이 사라진다** —
 * 36층부터는 8종이 다 풀린 상태라 모든 스테이지가 똑같은 8종 수프가 되고,
 * 새 용사가 등장하는 순간도 사건으로 읽히지 않는다.
 * 그래서 이번 구역의 용사를 leadFoePct 만큼 남기고 나머지를 과거 용사로 채운다.
 *
 * 밸런스 영향 없음 — LeHP/LeATK/LeGOLD 는 누가 나오든 스테이지와 보스 여부만 본다.
 */
export function foeAt(stage, wave, slot) {
  const lead = heroAt(stage);
  const rest = heroPool(stage).filter(h => h !== lead);
  if (!rest.length) return lead;                       // 아직 한 종류뿐 (1~5층)
  const h = hash(stage, wave, slot);
  if (h % 100 < B.stage.leadFoePct) return lead;
  return rest[(h >>> 8) % rest.length];
}

/** 해금된 플레이어 몬스터 목록 */
export const unlockedMonsters = best => B.roster.monsters.filter(m => best >= m.unlock);
