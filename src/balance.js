// balance.json 로더 + 파생 헬퍼.
// 상수는 전부 balance.json 에만 있다 — 시뮬레이터(tools/design-sim.cjs)도 같은 파일을 읽는다.
import { fromNum } from './logmath.js';
import { MANIFEST } from './sprites.js';      // sprites.js 는 아무것도 import 하지 않는다 — 순환 없음

const res = await fetch(new URL('./balance.json', import.meta.url));
if (!res.ok) throw new Error('balance.json 로드 실패: ' + res.status);

/** @type {any} */
export const B = await res.json();

// **그림이 들어온 몬스터만 게임에 넣는다** (매니페스트 mon 에 있는 것). 데이터를 먼저 넣고 그림은 나중에 오는데,
// 그림 없는 몬스터가 해금되면 도감엔 '?' 가 뜨고 전장엔 안 그려진다 — 레벨·마일스톤은 오르는데 몸이 없다.
// 여기서 거르면 해금·도감·수집·땅 동료·로드맵이 전부 B.roster.monsters 를 보므로 한 번에 숨는다.
// 그림을 들이는 날(tools/make-mon.mjs 가 매니페스트에 적는 순간) 저절로 나타난다 — 시뮬도 같은 기준으로 센다
// (design-sim.cjs MON_KINDS). 첫 몬스터(글룹)는 기본 리드라 무조건 남긴다.
// 2026-11-16: 루트링·그리플링·요툰·임피(120~180층)가 이 상태로 그림을 기다린다 — docs/new-monsters-4-handoff.md
B.roster.monsters = B.roster.monsters.filter((m, i) => i === 0 || MANIFEST.mon?.[m.key]);
// 적 용사도 같다 — 그림 없는 용사가 구역 대표가 되면 그 구역 내내 빈 자리와 싸운다(보스까지).
// 구역 순서(heroAt)가 이 배열을 돌므로 그림이 들어오는 날 순서가 한 번 밀린다(저장되는 값이 아니라 문제없다).
// 2026-11-16: 로완·토르빈·할든·그레타가 이 상태로 그림을 기다린다 — docs/new-heroes-4-handoff.md
B.roster.heroes = B.roster.heroes.filter((h, i) => i === 0 || MANIFEST.hero?.[h.key]);

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
 * 그래서 이번 구역의 용사를 leadFoePct 만큼 남기고 나머지를 **직전 몇 구역의 용사**로 채운다.
 *
 * 나머지를 "지금까지 나온 전원" 에서 고르던 때(대표 45%)는 그래도 정신없었다 — 36~400층 측정에서
 * 4기 웨이브에 평균 2.84종이 섞였고, 넷 다 다른 웨이브가 21%, 대표가 한 명도 없는 웨이브가 10.7%였다.
 * 지금은 대표 65% + 직전 2구역(restZones)이라 "이 구역의 적 + 막 지나온 구역의 잔당" 으로 읽힌다.
 *
 * 밸런스 영향 없음 — LeHP/LeATK/LeGOLD 는 누가 나오든 스테이지와 보스 여부만 본다.
 */
/** 대표 말고 섞여 나올 수 있는 용사 — 직전 restZones 구역의 대표들 (아직 안 나온 구역은 없다) */
export function restPool(stage) {
  const lead = heroAt(stage);
  const out = [];
  for (let k = 1; k <= (B.stage.restZones ?? 2); k++) {
    const s = stage - k * sceneEvery();
    if (s < 1) break;
    const h = heroAt(s);
    if (h !== lead && !out.includes(h)) out.push(h);
  }
  return out;
}

export function foeAt(stage, wave, slot) {
  const lead = heroAt(stage);
  const rest = restPool(stage);
  if (!rest.length) return lead;                       // 아직 한 종류뿐 (1~5층)
  const h = hash(stage, wave, slot);
  if (h % 100 < B.stage.leadFoePct) return lead;
  return rest[(h >>> 8) % rest.length];
}

/**
 * 웨이브 한 무리 — 뽑고, 고치고, 세운다. combat.spawnWave 가 이 순서 그대로 자리를 잡는다.
 *  1) 자리마다 foeAt
 *  2) 대표가 한 명도 없으면 한 자리를 대표로 — 그 구역의 적이라는 감각이 웨이브마다 끊기지 않게
 *  3) 지원형만 남지 않게 (fixSupportOnly)
 *  4) 진형: 근접 < 궁수 < 마법사 < 백마법사(roster.heroes[].row). 같은 줄 안에서는
 *     **대표가 앞, 같은 용사끼리 붙여** 세운다 — 뽑힌 순서대로 두면 "카엘 사일러스 카엘" 처럼 갈라졌다(9%).
 */
export function waveFoes(stage, wave, n) {
  const lead = heroAt(stage);
  let list = [...Array(n)].map((_, i) => foeAt(stage, wave, i));
  if (n > 0 && !list.includes(lead)) list[hash(stage, wave, 77) % n] = lead;
  list = fixSupportOnly(list, stage, wave);
  const order = h => B.roster.heroes.indexOf(h);
  return list.slice().sort((a, b) => (a?.row || 0) - (b?.row || 0)
    || (b === lead) - (a === lead) || order(a) - order(b));
}

/**
 * 지원형(백마법사 엘리라)은 **혼자 나오면 안 된다** — 아군을 채워 주는 역할이라
 * 지원할 대상이 없으면 말이 안 된다. 실측으로 전원 지원형 웨이브가 0.49% 나왔다
 * (9,000웨이브 중 44회, 23·24층처럼 초반에도).
 *
 * 한 기를 비지원형으로 바꿔서 고친다. 전부 새로 뽑지 않는 이유는 그러면 같은 시드에
 * 같은 결과가 안 나와 재현이 깨지기 때문이다 — **가장 뒤 슬롯 하나만** 바꾼다.
 */
export const isSupport = h => !!(h && h.support);
export function fixSupportOnly(list, stage, wave) {
  if (!list.length || !list.every(isSupport)) return list;
  // 섞여 나오는 풀(restPool)에서 먼저 찾는다 — 없을 때만 지금까지 나온 전원으로
  const near = restPool(stage).filter(h => !isSupport(h));
  const alt = near.length ? near : heroPool(stage).filter(h => !isSupport(h));
  if (!alt.length) return list;                        // 비지원형이 아직 없으면 어쩔 수 없다
  const out = list.slice();
  out[out.length - 1] = alt[hash(stage, wave, 99) % alt.length];
  return out;
}

/**
 * 보스는 그 구역의 용사 본인인데, 지원형이 걸리면 혼자 서게 된다.
 * 지금까지 안 걸린 건 sceneEvery(5)·bossEvery(10)·용사 수(8)가 **우연히** 안 겹쳐서다 —
 * 셋 중 하나만 바뀌면 조용히 깨진다. 명시적으로 막는다.
 */
export function bossHeroAt(stage) {
  const h = heroAt(stage);
  if (!isSupport(h)) return h;
  const pool = heroPool(stage).filter(x => !isSupport(x));
  return pool.length ? pool[(stage / B.stage.bossEvery | 0) % pool.length] : h;
}

/** 해금된 플레이어 몬스터 목록 */
export const unlockedMonsters = best => B.roster.monsters.filter(m => best >= m.unlock);
