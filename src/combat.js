// 실시간 전투. 설계 규칙(DESIGN.md §3~§4):
//   · 전투 중 회복 없음 — 회복 스탯은 웨이브 사이에만 작동
//   · 제한시간 없음 — 유일한 실패 조건은 사망
//   · 사망 시 직전 스테이지로 내려가 파밍하고, 플레이어가 재도전을 누른다
import { B, perWave, isBoss, isGate, gateCfg, LeHP, LeATK, LeGOLD, heroAt, foeAt,
  fixSupportOnly, bossHeroAt, chapterLabel } from './balance.js';
import { S, save } from './state.js';
import { LDPS, LHP, LDEF, nval, shots, critF, Linc, bestFarmStage, canClear, ab } from './stats.js';
import { bump as bumpDaily } from './daily.js';
import { recomputeGacha } from './gacha.js';
import { crossed } from './unlocks.js';
import { tickSkills, normalShare } from './skills.js';
import { L0, add, sub, ratio, fromNum, fmt } from './logmath.js';

export const MODE = { RUN: 'run', FARM: 'farm' };
// 파밍을 이만큼 돌면 전투력 판단과 무관하게 한 번 찔러본다 (canClear 가 보수적일 때의 안전장치)
export const AUTO_RETRY_CLEARS = 3;

export const R = {
  mode: MODE.RUN,
  stage: 1,
  boss: false,
  gate: false,       // 관문 보스인가 — 최대 체력 비례 피해가 붙는다
  waveIdx: 0,
  enemies: [],
  Lhp: L0,
  LhpMax: L0,
  atkT: 0,
  foeT: 0,
  atkAnimT: 0,      // 공격 애니 재생 잔여 시간
  pHitT: 0,         // 플레이어 피격 애니 잔여 시간
  skillCd: {},      // 스킬별 남은 쿨 (세이브하지 않는다 — 전투마다 새로 시작)
  skillFxT: 0,      // 스킬 섬광 잔여 시간
  skillFx: null,    // 어떤 스킬이 터졌나 (연출 구분용)
  bossIntroT: 0,    // 보스 등장 경고 잔여 시간
  bossSlainT: 0,    // 보스 처치 섬광 잔여 시간
  bolts: [],         // 날아가는 투사체 (연출 전용 — 피해는 발사 즉시 끝나 있다)
  foeBolts: [],      // 적 → 나. 같은 규칙이다 (피해는 이미 끝나 있다)
  hurtT: 0,          // 맞은 직후 화면 가장자리가 붉어지는 잔여 시간
  fx: [],            // 데미지 숫자 등 연출
  farmClears: 0,     // 파밍으로 클리어한 횟수 (자동 재도전 판단용)
  banner: '',
  bannerT: 0,
  bannerBig: false,       // 해금처럼 "사건" 인 알림은 크게 그린다
  shake: 0,
  heroName: '',
  stageTime: 0,      // 현재 스테이지에 쓴 시간(초) — "너무 느림" 안내용
  lastClearTime: 0,
};

let onEvent = () => {};
export const setEventHandler = fn => { onEvent = fn; };

function banner(text, sec = 1.6, big = false) { R.banner = text; R.bannerT = sec; R.bannerBig = big; }

function spawnWave() {
  const n = R.boss ? 1 : perWave(R.stage);
  const Lhp = LeHP(R.stage, R.boss);
  // 보스는 그 구역의 용사 **본인** 이다 — 섞지 않는다. 잡몹만 지금까지 본 용사들로 채운다.
  // 지원형(백마법사)은 혼자 설 수 없다 — 보스로도, 전원 지원형으로도 안 나온다.
  let heroes = R.boss
    ? [bossHeroAt(R.stage)]
    : fixSupportOnly([...Array(n)].map((_, i) => foeAt(R.stage, R.waveIdx, i)), R.stage, R.waveIdx);
  const period = 1 / B.enemy.aspd;
  R.enemies = heroes.map((hero, i) => ({
    Lhp, Lmax: Lhp, hitT: 0, healT: 0, ph: Math.random() * 6.28, hero,
    // 적마다 자기 타이머를 쥔다. 예전엔 그룹 1타이머라 **여덟 종이 동시에 같은 포즈**로
    // 바뀌어 기계처럼 보였다. 주기는 같고 시작 위상만 흩는다 —
    // 같은 시간에 같은 횟수를 때리므로 **총 피해는 그대로**다(시뮬 수식 불변).
    atkT: period * ((i + 0.5) / heroes.length),
    aPose: 0,                                  // 이 적의 공격 포즈 잔여 시간
  }));
}

/** 스테이지 진입. mode 가 FARM 이면 클리어해도 전진하지 않고 계속 반복한다. */
export function enterStage(stage, mode = MODE.RUN) {
  R.mode = mode;
  R.stage = Math.max(1, stage);
  R.boss = isBoss(R.stage);
  R.gate = R.boss && isGate(R.stage);
  // 스킬 쿨은 **초기화하지 않는다.** 초반 스테이지는 2초면 끝나는데 쿨은 5~13초라,
  // 진입마다 되돌리면 스킬이 영영 안 터지면서 평타만 35% 깎인 채로 남는다.
  R.waveIdx = 0;
  R.bolts = [];
  R.foeBolts = [];
  R.LhpMax = LHP();
  R.Lhp = R.LhpMax;
  R.atkT = 0;
  R.stageTime = 0;
  if (mode === MODE.RUN) R.farmClears = 0;
  R.heroName = heroAt(R.stage).name;
  // 보스 스테이지에 들어서는 순간은 10스테이지마다 오는 유일한 리듬이다. 경고를 띄운다.
  R.bossIntroT = R.boss ? 1.0 : 0;
  // 관문은 더 크게 알린다 — 규칙이 다른 싸움이라는 걸 모르면 그냥 억울하게 죽는다
  if (R.gate) {
    const soft = gateSoft(R.stage);
    banner('⛩️ 관문 — 오래 끌면 쓰러진다'
      + (soft < 1 ? ` (${Math.round((1 - soft) * 100)}% 약화됨)` : ''), 2.6, true);
  }
  spawnWave();
}

/**
 * 보스 광폭화 — 오래 끌수록 보스 공격력이 오른다.
 *
 * 10스테이지마다 오는 보스가 체력 6배일 뿐이라 긴 잡몹 전투와 다를 게 없었다.
 * 측정상 30일 동안 사망 12회가 전부 첫 1시간에 몰려 있었고, 그 뒤로는 공백에 쌓인
 * 골드 때문에 영원히 과강화라 긴장이 없다. 시간 제한이 아니라 **점점 세지는 압박**이라
 * 영구 벽이 되지 않는다(원칙 3) — 못 버티면 파밍하고 돌아오면 된다.
 *
 * after 를 보스 TTK 중위(90초)보다 짧게 잡아야 실제로 문다. 시뮬에서 60초는
 * 효과가 0 이었고 45초부터 보스 사망이 생겼다(30일 기준 0회 → 8회).
 */
export function enrage() {
  const e = R.gate ? (gateCfg().enrage || B.stage.bossEnrage) : B.stage.bossEnrage;
  if (!R.boss || !e) return 1;
  return Math.min(e.cap, 1 + Math.max(0, R.stageTime - e.after) * e.perSec);
}

// ── 관문 ─────────────────────────────────────────────────────
/** 이 관문이 실패로 얼마나 약해졌나 (1 = 그대로, 0.2 = 80% 약화) */
export function gateSoft(stage = R.stage) {
  const g = gateCfg();
  if (!g) return 1;
  const fails = S.gateFail?.[stage] || 0;
  return Math.max(1 - (g.weakenMax || 0), 1 - fails * (g.weakenPerFail || 0));
}

/**
 * 관문이 한 대에 깎는 비율 (최대 체력 대비). 광폭화가 붙어 시간이 갈수록 커진다.
 * **스탯으로 줄일 수 없다** — 이게 관문의 전부다. 빨리 죽이는 수밖에 없다.
 */
export function gateBite() {
  const g = gateCfg();
  if (!R.gate || !g || !(g.hpPct > 0)) return 0;
  return g.hpPct * gateSoft() * enrage();
}

/** 지금 속도로 관문을 버틸 수 있는 남은 시간(초). UI 가 경고에 쓴다 */
export function gateSecondsLeft() {
  const bite = gateBite();
  if (!(bite > 0)) return Infinity;
  const frac = R.LhpMax > L0 ? ratio(R.Lhp, R.LhpMax) : 0;
  return frac / (bite * B.enemy.aspd);
}

function front() {
  for (const e of R.enemies) if (e.Lhp > L0) return e;
  return null;
}
export const aliveCount = () => R.enemies.reduce((n, e) => n + (e.Lhp > L0 ? 1 : 0), 0);

/**
 * delay: 늦게 뜨기까지의 시간(초). 여러 발을 한 프레임에 겹쳐 띄우면 숫자가 포개져
 *        한 덩어리로 보인다 — 조금씩 어긋나야 "여러 번 맞았다" 로 읽힌다.
 * jx:    가로 흔들림. 같은 자리에 쌓이지 않게 한다.
 */
function fx(type, text, x, y, delay = 0) {
  R.fx.push({
    type, text, x, y, delay,
    life: type === 'crit' ? 1.0 : 0.8,
    vy: type === 'gold' ? -70 : -34,
    jx: (Math.random() - 0.5) * (type === 'gold' ? 34 : 30),
  });
  if (R.fx.length > 60) R.fx.shift();
}

/**
 * 투사체가 닿은 순간. **수치는 아무것도 바꾸지 않는다** — 맞은 티만 낸다.
 * 피격 포즈·화면 흔들림·파편·소리가 전부 여기로 모여서 한 박자로 터진다.
 */
function onImpact(b) {
  const e = R.enemies[b.idx];
  if (e) e.hitT = 0.12;
  R.shake = Math.max(R.shake, b.crit ? 0.16 : 0.07);
  const n = B.combatFx.shards;
  for (let i = 0; i < n; i++) {
    fx('shard', '', b.idx, -6);
    const c = R.fx[R.fx.length - 1];
    c.life = 0.22 + Math.random() * 0.12;
    c.vy = -40 - Math.random() * 90;
    c.vjx = (Math.random() - 0.5) * 240;
    c.jx = 0;
  }
  onEvent({ type: 'impact', crit: b.crit });
}

function gainGold() {
  // 리드 능력의 골드 배수(그릭 탐욕 등). 오프라인 보상은 offline.js 쪽에서 같이 건다.
  S.Lg = add(S.Lg, LeGOLD(R.stage, R.boss) + fromNum(ab('gold')));
}

function onKill(e, idx) {
  // 스킬 처치(fireSkill)도 이 함수를 거친다 — 여기 한 곳만 울려야 두 번 나지 않는다
  onEvent({ type: 'kill' });
  // dead 포즈 그림이 에셋에 있는데 안 쓰고 즉시 사라지고 있었다. 잠깐 쓰러뜨린다.
  // 전투 판정에는 영향이 없다 — front()/aliveCount() 는 Lhp 로만 판단한다.
  e.deadT = B.combatFx.deathSec;
  if (R.boss) { R.bossSlainT = 0.5; R.shake = Math.max(R.shake, 0.45); }
  gainGold();
  bumpDaily('kill');
  fx('gold', '+' + fmt(LeGOLD(R.stage, R.boss)), idx, -16);
  // 금화가 튀어 오른다. 숫자만 뜨는 것보다 "벌었다" 가 훨씬 잘 느껴진다.
  // 보스는 골드가 10배라 더 많이 튀게 한다.
  const coins = R.boss ? 9 : 5;
  for (let i = 0; i < coins; i++) {
    fx('coin', '', idx, -10, i * 0.035);
    const c = R.fx[R.fx.length - 1];
    c.vy = -150 - Math.random() * 90;
    c.vjx = (Math.random() - 0.5) * 120;    // 좌우로 흩어지며
    c.life = 0.75 + Math.random() * 0.3;
  }
  R.shake = Math.max(R.shake, R.boss ? 0.3 : 0.12);
  if (aliveCount() > 0) return;

  // 웨이브 클리어
  R.waveIdx++;
  const waves = R.boss ? 1 : B.stage.waves;
  if (R.waveIdx < waves) {
    // 웨이브 사이에만 회복 (전투 중에는 없다)
    const rec = nval('rec');
    if (rec > 0) R.Lhp = Math.min(R.LhpMax, add(R.Lhp, R.LhpMax + fromNum(rec)));
    onEvent({ type: 'wave' });     // 다음 웨이브로 — 전진 연출의 박자
    spawnWave();
    return;
  }

  // 스테이지 클리어
  R.lastClearTime = R.stageTime;
  if (R.mode === MODE.FARM) {
    // 파밍은 같은 스테이지 반복 — 단, 알아서 다시 도전해야 한다.
    // 수동 버튼만 두면 플레이어가 영원히 파밍에 갇힌다(실제로 그랬다: 5분에 스테이지 11,
    // 30분까지 그대로. 전투력은 충분한데 돌아가질 않았다).
    R.farmClears = (R.farmClears || 0) + 1;
    if (canClear(S.st) || R.farmClears >= AUTO_RETRY_CLEARS) { retry(); return; }
    enterStage(R.stage, MODE.FARM);
    return;
  }
  const cleared = R.stage;
  // 새로 열린 것이 있으면 사건으로 만든다. 조용히 탭이 하나 생기면 플레이어는
  // 모르고 지나간다(docs/reference-legend-of-slime.md §2).
  // 해금 알림은 **영구 기록** 기준이다. 환생 후 다시 올라올 때 이미 가진 해금이
  // 다시 '해금!' 으로 뜨면 거짓말이 된다.
  const opened = cleared > S.life ? crossed(S.life, cleared) : [];
  if (cleared > S.best) S.best = cleared;
  if (cleared > S.life) { S.life = cleared; recomputeGacha(); }   // 슬롯 해금 반영
  S.st = cleared + 1;
  bumpDaily('stage');     // 일일퀘스트: 스테이지 클리어 (파밍 반복은 위에서 걸러진다)
  if (opened.length) banner(opened.map(o => o.ic + ' ' + o.plain).join('   '), 3.2, true);
  else banner(isBoss(cleared) ? '👑 ' + R.heroName + ' 격파!' : '스테이지 클리어');
  onEvent({ type: 'stageClear', stage: cleared });
  save();
  enterStage(S.st, MODE.RUN);
}

function playerDied() {
  const retryAt = R.stage;
  // 관문에서 죽으면 그 관문이 약해진다. **벽을 구조적으로 막는 장치다** —
  // 없으면 관문 하나에서 7~20시간 막히는 게 시뮬에서 재현됐다(판정 1 위반).
  const wasGate = R.gate;
  if (wasGate) S.gateFail[retryAt] = (S.gateFail[retryAt] || 0) + 1;
  // 한 칸씩 내려가면 사망 연쇄에 빠진다 — 클리어 가능한 깊이를 바로 계산해서 간다
  const farmAt = S.farm > 0 ? S.farm : bestFarmStage(Math.max(1, retryAt - 1));
  R.farmClears = 0;
  // 어디로 왜 가는지 말해 준다. 측정해 보니 첫 1시간에 16~17번 죽는데(2~3분에 한 번),
  // 전부 자동 복구라 "졌다" 도 "돌아왔다" 도 체감되지 않았다. 사건이 보이지 않으면 긴장도 없다.
  banner(wasGate
    ? `관문에 막혔다 — 다음엔 ${Math.round((1 - gateSoft(retryAt)) * 100)}% 약해진다`
    : '쓰러졌다 — ' + chapterLabel(farmAt) + ' 에서 힘을 모은다', 2.4, true);
  onEvent({ type: 'death', stage: retryAt, farmAt });
  save();
  enterStage(farmAt, MODE.FARM);
}

/**
 * 스킬 한 방. 자동 발동과 스킬바 수동 발동이 **같은 경로**를 쓰도록 내보낸다.
 * secs = 이 한 방이 "DPS 몇 초치" 인가 (쿨 동안 모은 몫).
 */
export function fireSkill(sk, secs) {
  const tgt = front();
  if (!tgt) return false;        // 때릴 게 없으면 쿨을 쓰지 않는다 (몫이 증발하면 DPS 가 샌다)
  const Ldmg = LDPS(R.boss) + fromNum(secs);
  tgt.Lhp = sub(tgt.Lhp, Ldmg);
  tgt.hitT = 0.16;
  const idx = R.enemies.indexOf(tgt);
  fx('skill', sk.icon + ' ' + fmt(Ldmg), idx, -4);
  R.skillFxT = 0.35;
  R.skillFx = sk.id;
  R.shake = Math.max(R.shake, 0.2);
  if (tgt.Lhp <= L0) onKill(tgt, idx);
  return true;
}

export function tick(dt) {
  if (R.bannerT > 0) R.bannerT -= dt;
  if (R.shake > 0) R.shake -= dt;
  if (R.atkAnimT > 0) R.atkAnimT -= dt;
  if (R.pHitT > 0) R.pHitT -= dt;
  if (R.skillFxT > 0) R.skillFxT -= dt;
  if (R.bossIntroT > 0) R.bossIntroT -= dt;
  if (R.bossSlainT > 0) R.bossSlainT -= dt;
  // y 는 픽셀 오프셋(위로 떠오름). delay 가 남은 것은 아직 뜨지 않은 것이다.
  for (const f of R.fx) {
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.life -= dt;
    f.y += f.vy * dt;
    if (f.vjx) { f.jx += f.vjx * dt; f.vy += 320 * dt; }   // 금화는 중력을 받아 포물선을 그린다
  }
  if (R.fx.length) R.fx = R.fx.filter(f => f.life > 0);
  for (const e of R.enemies) {
    if (e.hitT > 0) e.hitT -= dt;
    if (e.deadT > 0) e.deadT -= dt;        // 쓰러지는 연출이 끝나야 화면에서 지운다
  }

  // ── 투사체 ──
  // 연출만 담당한다. 피해는 발사 시점에 이미 적용됐다.
  for (const b of R.bolts) {
    b.t += dt;
    if (b.t >= b.dur && !b.hit) { b.hit = true; onImpact(b); }
  }
  if (R.bolts.length) R.bolts = R.bolts.filter(b => b.t < b.dur + 0.06);

  // 적 쪽도 같은 규칙 — 날아오는 그림만이고 피해는 이미 끝나 있다.
  if (R.hurtT > 0) R.hurtT -= dt;
  for (const b of R.foeBolts) {
    b.t += dt;
    if (b.t >= b.dur && !b.hit) { b.hit = true; onFoeImpact(b); }
  }
  // 착탄 섬광(render)이 dur+0.12 까지 쓰므로 그보다 늦게 치운다
  if (R.foeBolts.length) R.foeBolts = R.foeBolts.filter(b => b.t < b.dur + 0.14);

  const f = front();
  if (!f) return;
  const t0 = R.stageTime;
  R.stageTime += dt;
  // 광폭화가 시작되는 순간은 **사건**이다 — 조용히 세지면 왜 죽었는지 알 수 없다
  if (R.boss && B.stage.bossEnrage && t0 <= B.stage.bossEnrage.after && R.stageTime > B.stage.bossEnrage.after) {
    banner('🔥 ' + R.heroName + ' 광폭화! 공격력이 계속 오른다', 2.6, true);
  }

  // 플레이어 공격
  R.atkT -= dt;
  const interval = 1 / nval('aspd');
  if (R.atkT <= 0) {
    R.atkT = interval;
    R.atkAnimT = Math.min(0.25, interval * 0.6);
    const crit = Math.random() < Math.min(1, nval('crit'));
    // 실제 피해를 **LDPS 에서 끌어온다.** 식을 두 벌 쓰면 반드시 어긋난다 —
    // 실제로 어긋나 있었다: gC(동료 배너)와 dpsMul(마스터리 광폭)이 표시 DPS 와
    // canClear 판단에만 있고 피해에는 없어서, 표시가 406배일 때 타격은 1.12배였다.
    // 동료 배너와 광폭 노드가 통째로 무력했고, 부풀려진 DPS 로 못 깨는 스테이지에
    // 계속 도전해 죽었다. 시뮬은 줄곧 올바른 쪽(LDPS)을 검증해 왔다.
    //
    // LDPS 는 기대 치명타(critF)와 공격속도를 포함하므로 둘을 덜어내고
    // 이번 타격의 실제 치명타 배수를 다시 곱한다 — 기댓값은 LDPS 와 같고 분산만 산다.
    const critMul = crit ? nval('cdmg') : 1;
    // normalShare() 는 스킬이 가져간 몫을 뺀 나머지다. 스킬이 없으면 1 이다.
    const Ldmg = LDPS(R.boss) - fromNum(nval('aspd')) - fromNum(critF())
               + fromNum(critMul * normalShare());
    // **피해는 여기서 끝난다.** 아래 연출이 늦게 오더라도 수치는 이미 적용됐다 —
    // 피해를 명중까지 미루면 DPS 가 비행시간만큼 깎여 시뮬과 어긋난다.
    f.Lhp = sub(f.Lhp, Ldmg);
    onEvent({ type: 'attack' });        // 실제 평타가 나간 순간 (연출이 아니라 사실)
    const idx = R.enemies.indexOf(f);
    // 투사체 한 발. 도착하면 숫자·피격·소리가 한꺼번에 터진다.
    const FXC = B.combatFx;
    R.bolts.push({ idx, t: 0, dur: FXC.boltSec, crit, ph: Math.random() * 6.28 });
    const T = FXC.boltSec;
    // 발수만큼 숫자를 나눠 띄운다. 연출이 아니라 사실이다 — 피해식에 shots() 가 이미 곱해져 있다.
    // shots() 는 더블샷·트리플샷이 확률 스탯이라 1~3 사이 실수다. 소수부를 확률로 처리하면
    // 평균 표시 발수가 기댓값과 정확히 맞고, 매 타격이 조금씩 달라져 보기에도 낫다.
    const s = shots();
    const n = Math.max(1, Math.floor(s) + (Math.random() < s % 1 ? 1 : 0));
    const per = fmt(Ldmg - Math.log10(n));     // log10 공간에서 나누기 = 빼기
    for (let i = 0; i < n; i++) {
      fx(crit ? 'crit' : 'hit', per, idx, 0, T + i * 0.07);   // 명중 시점에 맞춰 뜬다
      // 무작위로만 흩으면 겹칠 때가 있다. 발 순서대로 부채꼴로 벌리고 거기에만 흔들림을 더한다.
      const c = R.fx[R.fx.length - 1];
      // 숫자는 자릿수가 늘면 길어진다(4.56e42 같은 것도 뜬다). 가로로만 벌리면
      // 결국 겹치므로 세로로도 어긋나게 둔다.
      c.jx = (i - (n - 1) / 2) * 42 + (Math.random() - 0.5) * 10;
      c.y = -i * 13;
    }
    if (f.Lhp <= L0) onKill(f, idx);
  }

  // 스킬 — 쿨마다 모아둔 몫을 한 번에. 평타는 그만큼 줄어 있으므로 총량은 같다.
  tickSkills(R.skillCd, dt, fireSkill);

  // 적 공격 — **적마다 제 타이머**로 때린다.
  // 예전엔 그룹 1타이머가 살아있는 수에 비례한 피해를 한 번에 줬다. 총량은 같지만
  // 여덟 종이 동시에 같은 포즈로 바뀌어 적이 사실상 1종처럼 보였다.
  // 주기(1/aspd)와 한 기당 피해는 그대로라 **시간당 총 피해가 바뀌지 않는다** —
  // 시뮬의 `aspd × alive` 모델과 그대로 맞는다.
  const period = 1 / B.enemy.aspd;
  for (const e of R.enemies) {
    if (!(e.Lhp > L0)) continue;                 // 죽은 적은 안 때린다 (= 예전의 alive 비례)
    if (e.aPose > 0) e.aPose -= dt;
    if (e.healT > 0) e.healT -= dt;
    e.atkT -= dt;
    if (e.atkT > 0) continue;
    e.atkT += period;
    e.aPose = 0.22;
    // 힐러는 **때리지 않는다.** 아군 체력만 채운다 — 그래서 혼자 나올 수도 없다.
    if (e.hero?.support) { foeHeal(e); continue; }
    if (foeStrike(e)) return;                    // 죽었으면 더 처리하지 않는다
  }
}

/**
 * 힐러 한 번. 가장 많이 다친 **비힐러** 아군을 채운다.
 *
 * 회복량은 작다(최대 체력의 0.2%). 크게 주면 회복이 플레이어 DPS 를 넘는 순간
 * 적이 영영 안 죽어 벽이 된다 — 시뮬에서 0.003 부터 무진행이 6시간을 넘었다.
 * 작아도 역할은 분명하다: 긴 싸움일수록 누적이 커지고, 체력바가 **올라가는 게 보인다**.
 */
function foeHeal(healer) {
  const pct = healer.hero?.healPct || 0;
  if (!(pct > 0)) return;
  let tgt = null, worst = Infinity;
  for (const e of R.enemies) {
    if (e === healer || !(e.Lhp > L0) || e.hero?.support) continue;
    const frac = ratio(e.Lhp, e.Lmax);
    if (frac < worst && frac < 1) { worst = frac; tgt = e; }
  }
  if (!tgt) return;                              // 다친 아군이 없으면 아무 일도 없다
  tgt.Lhp = Math.min(tgt.Lmax, add(tgt.Lhp, tgt.Lmax + fromNum(pct)));
  tgt.healT = 0.45;                              // 회복 표시
  R.foeBolts.push({                              // 힐러 → 아군 광선 (적을 향하지 않는다)
    idx: R.enemies.indexOf(healer), to: R.enemies.indexOf(tgt),
    type: 'heal', t: 0, dur: 0.3, Ldmg: L0,
    color: healer.hero?.atk?.color || '#8ef0a8', shape: 'orb',
  });
}

/**
 * 적 공격 연출 한 발. 피해는 이미 끝나 있고 여기는 보이는 몫만 맡는다.
 * 근접(slash)은 날아갈 게 없어 바로 닿고, 투사체·광선은 적에서 나까지 날아온다.
 */
function spawnFoeBolt(e, Ldmg) {
  const idx = R.enemies.indexOf(e);
  const type = e.hero?.atk?.type || 'bolt';
  R.foeBolts.push({
    idx, type, t: 0, Ldmg,
    dur: type === 'slash' ? 0.07 : (B.combatFx?.boltSec || 0.16),
    color: e.hero?.atk?.color || '#ff8a8a',
    shape: e.hero?.atk?.shape || 'orb',
  });
  if (R.foeBolts.length > 24) R.foeBolts.shift();
}

/** 적 공격이 나에게 닿은 순간. **수치는 아무것도 바꾸지 않는다** — 맞은 티만 낸다. */
function onFoeImpact(b) {
  if (b.type === 'heal') return;        // 아군에게 간 광선이다 — 나는 맞지 않았다
  R.pHitT = 0.18;                                  // 피격 포즈
  R.hurtT = Math.max(R.hurtT, 0.22);               // 가장자리 붉어짐
  // 적이 때릴 때 화면이 전혀 안 흔들렸다 — 맞고 있다는 걸 체력바 숫자로만 알 수 있었다.
  // 내가 때릴 때(0.07)보다 약하게 준다. 매 초 여러 번 맞으므로 같게 주면 멀미가 난다.
  R.shake = Math.max(R.shake, R.boss ? 0.06 : 0.035);
  fx('foe', '-' + fmt(b.Ldmg), 0, -4);
  onEvent({ type: 'playerHit' });
}

/** 적 한 기의 타격. 죽었으면 true */
function foeStrike(e) {
  const Ldmg = LeATK(R.stage, R.boss) - LDEF() + fromNum(enrage());
  // 관문은 **최대 체력 비례** 로 한 번 더 문다. 방어·체력을 올려도 줄지 않는다 —
  // 이게 있어야 "빨리 못 죽이면 내가 죽는다" 가 성립한다(balance.json stage.gate 참조).
  // 관문은 보스전이라 적이 한 기뿐이므로 물리는 횟수가 예전과 같다.
  const bite = gateBite();
  const Lbite = bite > 0 ? R.LhpMax + fromNum(bite) : L0;
  const Ltotal = Lbite > L0 ? add(Ldmg, Lbite) : Ldmg;
  // 피해는 **지금** 들어간다. 날아가는 그림은 연출일 뿐이다(플레이어 투사체와 같은 규칙).
  if (Ltotal >= R.Lhp) { R.Lhp = L0; playerDied(); return true; }
  R.Lhp = sub(R.Lhp, Ltotal);
  spawnFoeBolt(e, Ltotal);
  return false;
}

/** 재도전: 최고 기록 다음 스테이지로 복귀 */
export function retry() {
  S.st = Math.max(1, S.best + (S.best >= 1 ? 1 : 0));
  if (S.st <= S.best) S.st = S.best + 1;
  enterStage(S.st, MODE.RUN);
  banner('재도전!');
  save();
}

/** 지금 스테이지가 얼마나 버거운지 (1.0 = 딱 버팀) — UI 안내용 */
export function toughness() {
  const ttk = ratio(LeHP(R.stage, R.boss), LDPS(R.boss));
  const need = ttk * (R.boss ? 1 : perWave(R.stage)) * (R.boss ? 1 : B.stage.waves);
  const survive = ratio(LHP(), Linc(R.stage, R.boss));
  return { ttk, need, survive, ratio: survive / Math.max(need, 1e-9) };
}
