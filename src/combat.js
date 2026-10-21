// 실시간 전투. 설계 규칙(DESIGN.md §3~§4):
//   · 전투 중 회복 없음 — 회복 스탯은 웨이브 사이에만 작동
//   · 제한시간 없음 — 유일한 실패 조건은 사망
//   · 사망 시 직전 스테이지로 내려가 파밍하고, 플레이어가 재도전을 누른다
import { B, perWave, isBoss, LeHP, LeATK, LeGOLD, heroAt } from './balance.js';
import { S, save } from './state.js';
import { LDPS, LHP, LDEF, LATK, nval, shots, Linc, bestFarmStage, canClear } from './stats.js';
import { bump as bumpDaily } from './daily.js';
import { recomputeGacha } from './gacha.js';
import { crossed } from './unlocks.js';
import { L0, add, sub, ratio, fromNum, fmt } from './logmath.js';

export const MODE = { RUN: 'run', FARM: 'farm' };
// 파밍을 이만큼 돌면 전투력 판단과 무관하게 한 번 찔러본다 (canClear 가 보수적일 때의 안전장치)
const AUTO_RETRY_CLEARS = 3;

export const R = {
  mode: MODE.RUN,
  stage: 1,
  boss: false,
  waveIdx: 0,
  enemies: [],
  Lhp: L0,
  LhpMax: L0,
  atkT: 0,
  foeT: 0,
  atkAnimT: 0,      // 공격 애니 재생 잔여 시간
  pHitT: 0,         // 플레이어 피격 애니 잔여 시간
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
  R.enemies = [];
  for (let i = 0; i < n; i++) R.enemies.push({ Lhp, Lmax: Lhp, hitT: 0, ph: Math.random() * 6.28 });
}

/** 스테이지 진입. mode 가 FARM 이면 클리어해도 전진하지 않고 계속 반복한다. */
export function enterStage(stage, mode = MODE.RUN) {
  R.mode = mode;
  R.stage = Math.max(1, stage);
  R.boss = isBoss(R.stage);
  R.waveIdx = 0;
  R.LhpMax = LHP();
  R.Lhp = R.LhpMax;
  R.atkT = 0;
  R.foeT = 1 / B.enemy.aspd;      // 적이 선공하지 않도록 한 박자 늦게
  R.stageTime = 0;
  if (mode === MODE.RUN) R.farmClears = 0;
  R.heroName = heroAt(R.stage).name;
  spawnWave();
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

function gainGold() {
  S.Lg = add(S.Lg, LeGOLD(R.stage, R.boss));
}

function onKill(e, idx) {
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
  const opened = cleared > S.best ? crossed(S.best, cleared) : [];
  if (cleared > S.best) { S.best = cleared; recomputeGacha(); }   // 슬롯 해금 반영
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
  // 한 칸씩 내려가면 사망 연쇄에 빠진다 — 클리어 가능한 깊이를 바로 계산해서 간다
  const farmAt = S.farm > 0 ? S.farm : bestFarmStage(Math.max(1, retryAt - 1));
  R.farmClears = 0;
  banner('쓰러졌다… 파밍으로', 2.0);
  onEvent({ type: 'death', stage: retryAt, farmAt });
  save();
  enterStage(farmAt, MODE.FARM);
}

export function tick(dt) {
  if (R.bannerT > 0) R.bannerT -= dt;
  if (R.shake > 0) R.shake -= dt;
  if (R.atkAnimT > 0) R.atkAnimT -= dt;
  if (R.pHitT > 0) R.pHitT -= dt;
  // y 는 픽셀 오프셋(위로 떠오름). delay 가 남은 것은 아직 뜨지 않은 것이다.
  for (const f of R.fx) {
    if (f.delay > 0) { f.delay -= dt; continue; }
    f.life -= dt;
    f.y += f.vy * dt;
    if (f.vjx) { f.jx += f.vjx * dt; f.vy += 320 * dt; }   // 금화는 중력을 받아 포물선을 그린다
  }
  if (R.fx.length) R.fx = R.fx.filter(f => f.life > 0);
  for (const e of R.enemies) if (e.hitT > 0) e.hitT -= dt;

  const f = front();
  if (!f) return;
  R.stageTime += dt;

  // 플레이어 공격
  R.atkT -= dt;
  const interval = 1 / nval('aspd');
  if (R.atkT <= 0) {
    R.atkT = interval;
    R.atkAnimT = Math.min(0.25, interval * 0.6);
    const crit = Math.random() < Math.min(1, nval('crit'));
    const nrmF = R.boss ? 1 : 1 + nval('nrm');
    const Ldmg = LATK() + fromNum((crit ? nval('cdmg') : 1) * shots() * nrmF);
    f.Lhp = sub(f.Lhp, Ldmg);
    f.hitT = 0.12;
    const idx = R.enemies.indexOf(f);
    // 발수만큼 숫자를 나눠 띄운다. 연출이 아니라 사실이다 — 피해식에 shots() 가 이미 곱해져 있다.
    // shots() 는 더블샷·트리플샷이 확률 스탯이라 1~3 사이 실수다. 소수부를 확률로 처리하면
    // 평균 표시 발수가 기댓값과 정확히 맞고, 매 타격이 조금씩 달라져 보기에도 낫다.
    const s = shots();
    const n = Math.max(1, Math.floor(s) + (Math.random() < s % 1 ? 1 : 0));
    const per = fmt(Ldmg - Math.log10(n));     // log10 공간에서 나누기 = 빼기
    for (let i = 0; i < n; i++) {
      fx(crit ? 'crit' : 'hit', per, idx, 0, i * 0.07);
      // 무작위로만 흩으면 겹칠 때가 있다. 발 순서대로 부채꼴로 벌리고 거기에만 흔들림을 더한다.
      const c = R.fx[R.fx.length - 1];
      // 숫자는 자릿수가 늘면 길어진다(4.56e42 같은 것도 뜬다). 가로로만 벌리면
      // 결국 겹치므로 세로로도 어긋나게 둔다.
      c.jx = (i - (n - 1) / 2) * 42 + (Math.random() - 0.5) * 10;
      c.y = -i * 13;
    }
    if (crit) R.shake = Math.max(R.shake, 0.16);
    if (f.Lhp <= L0) onKill(f, idx);
  }

  // 적 공격 (그룹 1타이머 · 살아있는 수에 비례 · 방어 비율감소)
  R.foeT -= dt;
  if (R.foeT <= 0) {
    R.foeT = 1 / B.enemy.aspd;
    const n = aliveCount();
    if (n > 0) {
      const Ldmg = LeATK(R.stage, R.boss) + fromNum(n) - LDEF();
      if (Ldmg >= R.Lhp) { R.Lhp = L0; playerDied(); return; }
      R.Lhp = sub(R.Lhp, Ldmg);
      R.pHitT = 0.18;        // 피격 포즈
    }
  }
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
