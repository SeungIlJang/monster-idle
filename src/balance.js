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

/** 현재 스테이지에서 등장하는 적(용사) */
export const heroAt = s => {
  const list = B.roster.heroes;
  return list[Math.floor((s - 1) / B.stage.bossEvery) % list.length];
};

/** 해금된 플레이어 몬스터 목록 */
export const unlockedMonsters = best => B.roster.monsters.filter(m => best >= m.unlock);
