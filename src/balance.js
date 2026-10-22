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
  d.Lc0 = fromNum(d.c0);
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

/** 해금된 플레이어 몬스터 목록 */
export const unlockedMonsters = best => B.roster.monsters.filter(m => best >= m.unlock);
