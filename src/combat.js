// 실시간 전투. 설계 규칙(DESIGN.md §3~§4):
//   · 전투 중 회복 없음 — 회복 스탯은 웨이브 사이에만 작동
//   · 제한시간 없음 — 유일한 실패 조건은 사망
//   · 사망 시 직전 스테이지로 내려가 파밍하고, 플레이어가 재도전을 누른다
import { B, perWave, isBoss, isGate, gateCfg, LeHP, LeATK, LeGOLD, heroAt, waveFoes,
  bossHeroAt, chapterLabel } from './balance.js';
import { S, save } from './state.js';
import { LDPS, LHP, LDEF, nval, shots, critF, Linc, bestFarmStage, canClear, ab } from './stats.js';
import { bump as bumpDaily, killDrop } from './daily.js';
import { recomputeGacha } from './gacha.js';
import { crossed } from './unlocks.js';
import { tickSkills, normalShare } from './skills.js';
import { goldMul } from './layer2.js';
import { eff as relicEff } from './relics.js';
import { L0, add, sub, ratio, fromNum, fmt } from './logmath.js';
import { t as tr } from './i18n.js';
import { DEV } from './dev-flags.js';

export const MODE = { RUN: 'run', FARM: 'farm' };
// 파밍을 이만큼 돌면 전투력 판단과 무관하게 한 번 찔러본다 (canClear 가 보수적일 때의 안전장치)
export const AUTO_RETRY_CLEARS = 3;
/**
 * 처치 연쇄가 끊기기까지의 여유(초). 평타가 0.63초마다라 2.2초면
 * "쉬지 않고 쓸고 있다" 와 "막혔다" 가 갈린다 — 너무 길면 늘 켜져 있어 의미가 없다.
 */
const CHAIN_HOLD = 2.2;
/** 화면이 달아오르기 시작하는 연쇄 수 */
export const CHAIN_WARM = 3;
/** 이 비율 아래로 떨어지면 화면이 위험을 알린다 */
export const DANGER_AT = 0.30;
/** 웨이브 등장 연출 길이(초) — 렌더가 진입 거리를 계산할 때 쓴다 */
export const WAVE_IN_SEC = 0.45;

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
  // ── 히트스톱 ──
  // 큰 타격에 몇 프레임 멈춘다. 방치형은 플레이어가 **보고만 있는** 게임이라
  // 타격감이 거의 전부인데, 멈춤이 전혀 없어서 같은 숫자가 가볍게 지나갔다.
  //
  // **멈춘 시간은 버리지 않는다.** 치명타가 5.6초마다, 처치는 더 자주 오므로
  // 그냥 건너뛰면 전투 처리량이 1~3% 깎여 시뮬과 어긋난다.
  // 멈추는 동안의 dt 를 freezeBank 에 모아 두고 풀릴 때 한 번에 흘린다.
  freeze: 0,
  freezeBank: 0,
  // ── 처치 연쇄 ──
  // 연속으로 쓸면 화면이 달아오른다. 끊기면 식는다.
  // 전투의 1초차와 30초차가 똑같이 생긴 게 지루함의 뿌리였다 — 시간축에 변화를 준다.
  chain: 0,
  chainT: 0,
  // ── 낮은 체력 ──
  // 지금까지 체력바 색만 바뀌었다. 관문처럼 실제로 죽을 수 있는 자리에서도
  // "위험하다" 가 전달되지 않았다 — 화면이 말하게 한다.
  dangerT: 0,        // 다음 심장박동까지
  // ── 웨이브 등장 ──
  // 지금까지 다음 무리가 조용히 리스폰됐다. 적 4기를 쓸어도 아무 일이 없어서
  // "한 무리를 끝냈다" 가 생기지 않았다. 화면 밖에서 달려 들어오게 한다.
  waveInT: 0,
  fx: [],            // 데미지 숫자 등 연출
  // 강타 — 평타 4번째마다 돌진해 크게 친다. **피해는 평소와 같다**(연출 전용). 1초에 몇 번씩
  // 같은 몸짓만 반복되던 게 지루함의 큰 몫이라, 박자에 강약을 준다.
  combo: 0,          // 평타 횟수 (4번째마다 강타)
  heavyT: 0,         // 강타 돌진 잔여 시간
  rings: [],         // 강타 충격파 (연출 전용)
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

const WAVE_IN = 0.45;     // 몰려 들어오는 데 걸리는 시간(초)

function spawnWave() {
  R.waveInT = WAVE_IN;
  const n = R.boss ? 1 : perWave(R.stage);
  const Lhp = LeHP(R.stage, R.boss);
  // 보스는 그 구역의 용사 **본인** 이다 — 섞지 않는다. 잡몹만 지금까지 본 용사들로 채운다.
  // 지원형(백마법사)은 혼자 설 수 없다 — 보스로도, 전원 지원형으로도 안 나온다.
  // 진형 정렬까지 balance.waveFoes 가 한다: 근접 < 궁수 < 마법사 < 백마법사(맨 뒤), 같은 줄은 대표가 앞·같은 용사끼리.
  // 순서가 곧 자리(render)이고 맞는 순서다(앞에서부터 때린다).
  const heroes = R.boss ? [bossHeroAt(R.stage)] : waveFoes(R.stage, R.waveIdx, n);
  const period = 1 / B.enemy.aspd;

  // ── 물량전 (2026-11-16) ──
  // 첫 1시간 실측: 한 마리에 평타 11.7방 · 처치 9초에 한 번. 처치가 곧 보상의 순간(금화 · 연쇄 · 날아가는 몸)인데
  // 그게 9초에 한 번이라 화면에 '일' 이 거의 없었다. 웨이브를 **병사 떼 + 용사** 로 쪼갠다.
  //   병사 m = perHero × 용사 수, 웨이브 체력의 share 를 나눠 가진다 (12.5% 짜리 — 평타 1~2방)
  //   용사는 나머지(1 − share)를 한 기씩 — 예전보다 빨리 쓰러진다
  // **총량은 그대로 둔다** — 시뮬(design-sim attempt)이 검증하는 세 가지:
  //   체력: m·hm + n·hh = n (예전 용사 n 기)
  //   골드: 체력 몫만큼 나눠 준다 → 합이 n 기분
  //   받는 피해: 앞에서부터 쓰러뜨리면 적 i 가 살아서 때리는 시간 ∝ 그때까지의 누적 체력 C_i.
  //     예전 총량 I0 = Σ C_i = n(n+1)/2 (용사 체력 1 단위). 물량전은 공격력을 체력 몫에 비례시키고(w = c·hp),
  //     줄 서서 기다리는 병사는 때리지 않으므로(화면에 shown 기만) 병사 i 가 때리는 시간은 min(i, shown)·hm.
  //     I = Σ_병사 hm·min(i,shown)·hm + Σ_용사 hh·(m·hm + j·hh) 를 재서 c = I0 / I 로 맞춘다.
  // 보스 · 관문은 그대로 혼자 나온다 — 거기는 '센 놈 하나' 를 오래 때리는 자리다.
  const SW = !R.boss && B.stage.swarm?.share > 0 ? B.stage.swarm : null;
  const nh = heroes.length;
  const m = SW ? Math.max(1, Math.round(SW.perHero * nh)) : 0;
  const hm = SW ? SW.share * nh / m : 0;            // 병사 한 기 체력 (예전 용사 = 1)
  const hh = SW ? 1 - SW.share : 1;                 // 용사 한 기 체력
  let c = 1;
  if (SW) {
    const K = SW.shown || m;
    let I = 0;
    for (let i = 1; i <= m; i++) I += hm * Math.min(i, K) * hm;
    for (let j = 1; j <= nh; j++) I += hh * (m * hm + j * hh);
    c = (nh * (nh + 1) / 2) / I;
  }
  const grunt = heroes.find(h => !h?.support) || heroes[0];   // 병사 모습 — 힐러 모습으로 때리면 이상하다
  const total = m + nh;
  // ── 황금 병사 (뜻밖의 보상) ── 몇 웨이브에 한 번, 병사 하나가 금빛이고 골드를 J 배 준다.
  // 기댓값을 지킨다: 이 판의 모든 처치 골드에 a = nh / (nh + p·(J−1)·hm) 를 곱한다 — 황금이 안 나온 웨이브도 똑같이.
  // 그래야 웨이브 골드의 기댓값이 예전 nh 기분 그대로다(시뮬 불변).
  const LK = B.stage.luck || {};
  const p = SW ? (LK.goldenChance || 0) : 0, J = LK.goldenMul || 1;
  const La = p > 0 ? Math.log10(nh / (nh + p * (J - 1) * hm)) : 0;
  const goldenAt = p > 0 && Math.random() < p ? Math.floor(Math.random() * Math.min(m, SW.shown || m)) : -1;
  const make = (hero, share, minion, i) => ({
    Lhp: Lhp + Math.log10(share), Lmax: Lhp + Math.log10(share),
    hitT: 0, healT: 0, ph: Math.random() * 6.28, hero, minion,
    golden: minion && i === goldenAt,
    Lgold: Math.log10(share) + La + (minion && i === goldenAt ? Math.log10(J) : 0),   // 처치 골드 = 예전 한 기 × 체력 몫
    Latk: Math.log10(c * share),                    // 한 대 피해 = 예전 한 기 × c × 체력 몫
    // 힐러가 이번 웨이브에 채울 수 있는 총량(아군 최대체력 대비). 바닥나면 더 못 채운다 —
    // 이게 없으면 회복이 DPS 를 넘는 순간 적이 영영 안 죽는다(실측: 2분간 100% 고정).
    // 물량전에선 용사 체력이 hh 배라 같은 비율로 채우면 덜 채운다 — 1/hh 를 곱해 **채우는 양(절대값)** 을 맞춘다
    healMul: 1 / hh,
    healLeft: minion ? 0 : (hero?.healBudget || 0) * relicEff('healerBudget') / hh,   // 침묵의 종 유물이 줄인다
    // 적마다 자기 타이머를 쥔다. 예전엔 그룹 1타이머라 **여덟 종이 동시에 같은 포즈**로
    // 바뀌어 기계처럼 보였다. 주기는 같고 시작 위상만 흩는다 —
    // 같은 시간에 같은 횟수를 때리므로 **총 피해는 그대로**다(시뮬 수식 불변).
    atkT: period * ((i + 0.5) / total),
    aPose: 0,                                  // 이 적의 공격 포즈 잔여 시간
  });
  R.enemies = [
    ...Array.from({ length: m }, (_, i) => make(grunt, hm, true, i)),
    ...heroes.map((hero, j) => make(hero, hh, false, m + j)),
  ];

  // ── 적 개성 (⑦) · 보스 큰 공격 (⑥) — 전부 '나눠 쓰기' 다 ──
  // 한 기가 주는 피해 합 · 잡는 데 드는 시간은 예전과 같고 **박자만** 바뀐다. 그냥 두는 사람에겐 지금 밸런스 그대로이고,
  // 손을 대는 사람(모으는 동안 스킬을 직접 누름 · 방패를 내렸을 때 스킬)만 이득을 본다.
  for (const e of R.enemies) {
    const tt = !e.minion && !R.boss && e.hero?.trait;   // 보스는 개성 대신 '큰 공격' 하나만 (둘을 겹치면 대포 + 큰 공격이 같이 걸렸다)
    if (tt?.type === 'guard') {
      // 방패병: open 초 내리고 guard 초 올린다. 올린 동안 막으므로 체력을 open/(open+guard) 배로 — 평균 잡는 시간 같음
      const keep = tt.open / (tt.open + tt.guard);
      e.Lhp += Math.log10(keep); e.Lmax = e.Lhp;
      e.guardCyc = Math.random() * (tt.open + tt.guard);    // 여러 기가 같은 박자로 올리지 않게
    } else if (tt?.type === 'shell') {
      // 대포병: 평타 대신 장전(wind) → 포탄(units 몫). 주기 units/공속 — 합 같음
      e.shellCd = (tt.units / B.enemy.aspd - tt.wind) * Math.random();
      e.windT = 0;
    } else if (tt?.type === 'charge') {
      // 기병: 들어오자마자 돌진해 mul 몫으로 먼저 친다 — 그 뒤 첫 평타가 (mul−1) 주기 늦다(foeTick)
      e.atkT = 0.35; e.firstMul = tt.mul;
    }
  }
  const BH = B.stage.bossHeavy;
  if (R.boss && !R.gate && BH) {
    // 보스 큰 공격: every 초마다 wind 초 모았다가 units 몫 한 방. 모으는 동안은 평타를 쉬고 평소 평타를 f 배로 줄여
    // 한 주기 합을 맞춘다: (every − wind)·공속·f + units = every·공속. 관문은 체력 비례 피해라 건드리지 않는다.
    const e = R.enemies[0];
    const f = (BH.every * B.enemy.aspd - BH.units) / ((BH.every - BH.wind) * B.enemy.aspd);
    // 첫 예고 전까지는 제 세기로 친다 — 첫 큰 공격(first 초) 전에 끝나는 짧은 보스전이 그만큼 쉬워지지 않게(실측: 2초 보스전 받은 피해 −36%).
    // 첫 예고가 시작되는 순간(foeTick) 평타를 f 배로 낮춘다. 그 뒤로는 한 주기 합이 예전과 같다
    e.LatkHeavy = e.Latk + Math.log10(BH.units);
    e.LatkLow = e.Latk + Math.log10(f);
    e.heavyCd = BH.first; e.windT = 0;
  }
}

/** 이 적이 지금 방패를 들고 있나 (방패병 guard) */
const guarding = e => e.guardCyc !== undefined && e.guardCyc >= e.hero.trait.open;

/**
 * 스킬을 **직접** 눌렀을 때 — 힘을 모으던 적(보스 큰 공격 · 대포 장전)을 전부 끊는다. 그 한 방은 통째로 사라진다.
 * 자동 발동은 끊지 않는다 — 그냥 두는 사람의 밸런스는 지금 그대로여야 하고, 끊기는 손을 댄 보상이다.
 */
function interruptAll() {
  let n = 0;
  for (const e of R.enemies) {
    if (!(e.Lhp > L0) || !(e.windT > 0)) continue;
    e.windT = 0; n++;
    if (e.heavyCd !== undefined) e.heavyCd = B.stage.bossHeavy.every - B.stage.bossHeavy.wind;
    if (e.shellCd !== undefined) e.shellCd = e.hero.trait.units / B.enemy.aspd - e.hero.trait.wind;
    e.hitT = 0.3; e.kbT = 0.26;
    fx('cut', tr('cb.cut'), R.enemies.indexOf(e), -44);
  }
  if (n) { R.shake = Math.max(R.shake, 0.3); hitstop(0.08); onEvent({ type: 'cut' }); }
  return n;
}

/**
 * 여러 적에게 정해진 피해를 한꺼번에 (스킬 개성 — 범위 · 전체 · 마무리). 넘침은 없다.
 * 방패를 든 방패병은 막는다. **한 번에 쓰러뜨리는 용사는 하나까지** — 둘째부터는 1% 를 남긴다(물량전과 같은 상한:
 * 압도적일 때 층당 최소 시간 · 환생 재등반 속도가 바뀌지 않게). 쓰러뜨린 [적, 번호] 목록을 돌려준다.
 */
function hitList(pairs) {
  const out = [];
  let heroKills = 0;
  for (const [e, Ld] of pairs) {
    if (!(e.Lhp > L0)) continue;
    const i = R.enemies.indexOf(e);
    if (guarding(e)) { blocked(e, i); continue; }
    e.hitT = 0.16;
    let L = sub(e.Lhp, Ld);
    if (!(L > L0) && !e.minion && heroKills >= 1) L = e.Lmax - 2;   // 1% 남김
    e.Lhp = L;
    if (L > L0) continue;
    if (!e.minion) heroKills++;
    out.push([e, i]);
  }
  return out;
}

let lastBlockT = -9;
/** 방패에 막혔다 — 글자는 0.4초에 한 번만(평타가 빠르면 '막음' 이 줄줄이 뜬다) */
function blocked(e, i) {
  e.hitT = 0.08;
  if (R.stageTime - lastBlockT < 0.4) return;
  lastBlockT = R.stageTime;
  fx('block', tr('cb.block'), i, -20);
  onEvent({ type: 'block' });
}

/**
 * 맨 앞 적부터 피해를 넣는다. **병사를 쓰러뜨리고 남은 피해는 다음 적으로 넘어간다** —
 * 한 방에 병사 여럿이 날아가는 게 물량전의 맛이다. 넘친 피해를 버리면 병사(1~2방)마다 반 방씩 새서 DPS 가 준다.
 * 단 **용사를 쓰러뜨리면 거기서 멈춘다.** 공격 한 번에 용사 한 기 — 예전 상한과 같다. 압도적일 때
 * 한 층에 드는 최소 시간(시뮬 minSeconds · 환생 뒤 재등반 속도)이 예전과 같게 남는다.
 * 쓰러뜨린 [적, 번호] 목록을 돌려준다. 처치 처리(onKill)는 부르는 쪽이 한다 — 마지막 처치가 다음 웨이브를 깔기 때문.
 */
function strikeFront(Ldmg) {
  const out = [];
  let rest = Ldmg;
  for (let guard = 0; guard < 64; guard++) {
    const e = front();
    if (!e) break;
    if (guarding(e)) { blocked(e, R.enemies.indexOf(e)); break; }   // 방패를 든 방패병 — 막혀서 넘어가지도 않는다
    const before = e.Lhp;
    e.Lhp = sub(e.Lhp, rest);
    if (e.Lhp > L0) break;
    out.push([e, R.enemies.indexOf(e)]);
    if (!e.minion) break;
    rest = sub(rest, before);
    if (!(rest > L0)) break;
  }
  return out;
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
  R.chain = 0; R.chainT = 0;
  R.heavyT = 0; R.rings = [];
  R.freeze = 0; R.freezeBank = 0; lastStop = -9; lastHeavy = -9;
  if (mode === MODE.RUN) { R.farmClears = 0; R.sweepTo = 0; }
  R.heroName = heroAt(R.stage).name;
  // 보스 스테이지에 들어서는 순간은 10스테이지마다 오는 유일한 리듬이다. 경고를 띄운다.
  R.bossIntroT = R.boss ? 1.0 : 0;
  // 관문은 더 크게 알린다 — 규칙이 다른 싸움이라는 걸 모르면 그냥 억울하게 죽는다
  if (R.gate) {
    const soft = gateSoft(R.stage);
    banner(tr('cb.gate')
      + (soft < 1 ? ' ' + tr('cb.weak', { p: Math.round((1 - soft) * 100) }) : ''), 2.6, true);
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
  // 부적 유물: 첫 시도부터 이만큼 약하게 시작한다. 실패 누적과는 더 큰 쪽(= 더 약한 쪽)을 쓴다
  return Math.max(1 - (g.weakenMax || 0), Math.min(1 - fails * (g.weakenPerFail || 0), 1 - relicEff('gateSoft')));
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

/**
 * 몇 초 멈출지 요청한다. 더 센 요청이 이긴다 (겹칠 때 합치면 끈적해진다).
 *
 * **최소 간격을 둔다.** 처치가 초당 2회씩 나는 구간에서 매번 멈추면 전체 프레임의
 * 11% 가 정지해 타격감이 아니라 **끊김**으로 읽힌다(실측). 멈춤은 드물어야 무겁다.
 */
const HITSTOP_GAP = 0.30;
export const FOE_POSE = 0.22;     // 적 공격 포즈 길이 — 공격 프레임 진행도의 분모
export const HEAVY_EVERY = 4;     // 평타 몇 번째마다 강타인가
export const HEAVY_SEC = 0.34;    // 강타 돌진 길이
const HEAVY_GAP = 1.1;            // 강타 최소 간격(초)
let lastHeavy = -9;
let lastStop = -9;
function hitstop(sec) {
  if (R.stageTime - lastStop < HITSTOP_GAP) return;
  lastStop = R.stageTime;
  R.freeze = Math.max(R.freeze, sec);
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
  const lucky = type === 'golden' || type === 'chest' || type === 'gem' || type === 'cut';   // 뜻밖의 보상 · 끊기는 천천히 오래 뜬다
  R.fx.push({
    type, text, x, y, delay,
    life: lucky ? 1.6 : type === 'crit' ? 1.0 : 0.8,
    vy: lucky ? -26 : type === 'gold' || type === 'golden' ? -70 : -34,
    jx: lucky ? 0 : (Math.random() - 0.5) * (type === 'gold' ? 34 : 30),
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
  R.shake = Math.max(R.shake, b.heavy ? 0.22 : b.crit ? 0.16 : 0.07);
  if (b.heavy) {
    if (e) e.kbT = 0.26;                                   // 뒤로 밀려났다 돌아온다
    R.rings.push({ idx: b.idx, t: 0 });
    hitstop(0.04);                                         // 멈춤은 시간을 저금했다 돌려주므로 총 시간은 같다
  }
  if (b.crit) hitstop(0.035);          // 2프레임 — 치명타는 5.6초마다 온다
  const n = B.combatFx.shards;
  for (let i = 0; i < n; i++) {
    fx('shard', '', b.idx, -6);
    const c = R.fx[R.fx.length - 1];
    c.life = 0.22 + Math.random() * 0.12;
    c.vy = -40 - Math.random() * 90;
    c.vjx = (Math.random() - 0.5) * 240;
    c.jx = 0;
  }
  onEvent({ type: 'impact', crit: b.crit, heavy: b.heavy });
}

function gainGold(e) {
  // 리드 능력의 골드 배수(그릭 탐욕 등). 오프라인 보상은 offline.js 쪽에서 같이 건다.
  // 마스터리 탐식 노드가 여기 곱해진다 — 오프라인 보상도 offline.js 에서 같이 건다
  // 물량전: 체력 몫만큼만 준다(e.Lgold, log). 한 웨이브 합은 예전 용사 n 기분 그대로다
  S.Lg = add(S.Lg, LeGOLD(R.stage, R.boss) + fromNum(ab('gold') * goldMul()) + (e?.Lgold || 0));
}

function onKill(e, idx) {
  // 스킬 처치(fireSkill)도 이 함수를 거친다 — 여기 한 곳만 울려야 두 번 나지 않는다
  onEvent({ type: 'kill' });
  // 연쇄가 길수록 멈춤도 길어진다 — 몰아칠 때 화면이 같이 무거워져야 "달아오른다" 가 읽힌다
  R.chain++;
  R.chainT = CHAIN_HOLD + relicEff('chainHold');   // 전쟁 북 유물
  // 피버 게이지 — 처치로 찬다(켜져 있는 동안은 안 찬다). 다 차면 한 번 알린다 — 버튼이 빛나고 소리가 난다
  const F = B.stage.fever;
  if (F && !(R.feverT > 0)) {
    const was = R.feverG || 0;
    R.feverG = Math.min(F.goal, was + (R.boss ? F.fill.boss : e.minion ? F.fill.minion : F.fill.hero));
    if (was < F.goal && R.feverG >= F.goal) onEvent({ type: 'feverReady' });
  }
  // 평범한 처치에는 멈추지 않는다. 보스와 **연쇄 분기점**(5·10·15…)만 — 그래야 사건이 된다.
  if (R.boss) hitstop(0.10);
  else if (R.chain % 5 === 0) hitstop(0.06);
  // dead 포즈 그림이 에셋에 있는데 안 쓰고 즉시 사라지고 있었다. 잠깐 쓰러뜨린다.
  // 전투 판정에는 영향이 없다 — front()/aliveCount() 는 Lhp 로만 판단한다.
  e.deadT = B.combatFx.deathSec;
  if (R.boss) { R.bossSlainT = 0.5; R.shake = Math.max(R.shake, 0.45); }
  // ── 보스 상자 (뜻밖의 보상) ── 보스 골드에 나무 · 은 · 금 상자 배수. 기댓값 1.00 (balance.json luck.chest)
  let chest = -1;
  if (R.boss && B.stage.luck?.chest) {
    let r = Math.random();
    chest = B.stage.luck.chest.findIndex(([pr]) => (r -= pr) < 0);
    if (chest < 0) chest = 0;
    e.Lgold = (e.Lgold || 0) + Math.log10(B.stage.luck.chest[chest][1]);
  }
  gainGold(e);
  // 일일 퀘스트 '처치' 는 용사만 센다 — 병사까지 세면 웨이브마다 처치가 5배가 돼 퀘스트가 공짜가 된다
  if (!e.minion) {
    bumpDaily('kill');
    // 처치 퀘스트 보상에서 덜어 둔 젬이 그날 처음 40기 중 무작위 3번에 떨어진다(daily.killDrop — 합은 그대로)
    const g = killDrop();
    if (g) { fx('gem', '💎 +' + g, idx, -34); onEvent({ type: 'lucky', what: 'gem' }); }
  }
  const Lgot = LeGOLD(R.stage, R.boss) + (e.Lgold || 0);
  fx(e.golden ? 'golden' : 'gold', '+' + fmt(Lgot), idx, -16);
  if (e.golden) { banner(tr('cb.golden', { g: fmt(Lgot) }), 1.6); onEvent({ type: 'lucky', what: 'golden' }); }
  if (chest >= 0) {
    fx('chest', tr('cb.chest', { tier: [tr('chest.t0'), tr('chest.t1'), tr('chest.t2')][chest], m: B.stage.luck.chest[chest][1] }), idx, -48);
    if (chest > 0) onEvent({ type: 'lucky', what: 'chest' });
  }
  // 금화가 튀어 오른다. 숫자만 뜨는 것보다 "벌었다" 가 훨씬 잘 느껴진다.
  // 보스는 골드가 10배라 더 많이 튀게 한다. 병사는 몫이 작아 두 개만, 황금 병사는 한 움큼.
  const coins = e.golden ? 16 : R.boss ? 9 + Math.max(0, chest) * 5 : e.minion ? 2 : 5;
  for (let i = 0; i < coins; i++) {
    fx('coin', '', idx, -10, i * 0.035);
    const c = R.fx[R.fx.length - 1];
    c.vy = -150 - Math.random() * 90;
    c.vjx = (Math.random() - 0.5) * 120;    // 좌우로 흩어지며
    c.life = 0.75 + Math.random() * 0.3;
  }
  R.shake = Math.max(R.shake, R.boss ? 0.3 : e.minion ? 0.06 : 0.12);
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
    // 휩쓸기 — 같은 층을 세 번 도는 대신 한 층씩 **쓸어 올라간다**(playerDied 가 sweepTo 를 정한다).
    // 초당 골드는 층마다 거의 같다(한 층 아래 ×0.995 — hpGrow 1.12 · goldGrow 1.126) — 수입은 그대로, 장면만 바뀐다
    if (R.sweepTo && R.stage < R.sweepTo) {
      const next = R.stage + 1, to = R.sweepTo;
      enterStage(next, MODE.FARM);
      R.sweepTo = to;
      banner(tr('cb.sweep', { st: chapterLabel(next) }), 1.1);
      return;
    }
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
  else banner(isBoss(cleared) ? tr('cb.bossDown', { name: R.heroName }) : tr('cb.clear'));
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
  // 휩쓸기 — 예전엔 farmAt 한 층을 AUTO_RETRY_CLEARS(3)번 돌고 재도전했다. 첫 1시간의 37% 가 그 반복이었다.
  // 이제 farmAt 아래 두 층부터 한 층씩 올라오며 같은 3판을 쓴다(farmAt−2 → farmAt−1 → farmAt → 재도전).
  // 셋 다 farmAt 이하라 canClear 가 보장된다. 플레이어가 고른 파밍 층(S.farm)은 예전처럼 그 층만 돈다.
  const sweep = S.farm > 0 ? 0 : AUTO_RETRY_CLEARS - 1;
  const startAt = Math.max(1, farmAt - sweep);
  R.farmClears = 0;
  // 어디로 왜 가는지 말해 준다. 측정해 보니 첫 1시간에 16~17번 죽는데(2~3분에 한 번),
  // 전부 자동 복구라 "졌다" 도 "돌아왔다" 도 체감되지 않았다. 사건이 보이지 않으면 긴장도 없다.
  banner(wasGate
    ? tr('cb.gateFail', { p: Math.round((1 - gateSoft(retryAt)) * 100) })
    : tr('cb.died', { st: chapterLabel(startAt) }), 2.4, true);
  onEvent({ type: 'death', stage: retryAt, farmAt: startAt });
  save();
  enterStage(startAt, MODE.FARM);
  R.sweepTo = startAt < farmAt ? farmAt : 0;    // enterStage 뒤에 둔다 — 휩쓸기 목표(이 층까지 올라온 뒤 재도전)
}

/**
 * 스킬 한 방. 자동 발동과 스킬바 수동 발동이 **같은 경로**를 쓰도록 내보낸다.
 * secs = 이 한 방이 "DPS 몇 초치" 인가 (쿨 동안 모은 몫).
 */
export function fireSkill(sk, secs, manual = false) {
  const tgt = front();
  if (!tgt) return false;        // 때릴 게 없으면 쿨을 쓰지 않는다 (몫이 증발하면 DPS 가 샌다)
  // 직접 누른 스킬은 힘을 모으던 적(보스 큰 공격 · 대포 장전)을 끊는다 — 손을 댄 보상
  if (manual) interruptAll();
  const Ldmg = LDPS(R.boss) + fromNum(secs) + DEV.Ldmg;
  tgt.hitT = 0.16;
  const idx = R.enemies.indexOf(tgt);
  // ── 스킬 개성 (balance.json skills.kind) ── 피해량은 그대로, 맞는 곳만 다르다.
  // 여섯 종이 전부 '앞의 적 한 방' 이라 아이콘만 달랐다. 연출(skills.fx — 튀기기 · 원뿔 · 갈라짐 …)은 이미 각자 달랐는데 맞는 곳이 같았다.
  const kind = B.skills.kind?.[sk.id] || 'pierce';
  let killed;
  if (kind === 'pierce') {
    // 꿰뚫기 — 병사 떼를 앞에서부터 뚫고 지나간다(strikeFront 의 이월)
    killed = strikeFront(Ldmg);
  } else {
    const alive = R.enemies.filter(e => e.Lhp > L0);
    const heroes = alive.filter(e => !e.minion);
    let list, w;
    if (kind === 'splash') {            // 튀기기 — 앞 50% · 바로 뒤 둘 25%씩 (뒤가 없으면 앞으로 모인다)
      list = alive.slice(0, 3); w = [0.5, 0.25, 0.25].slice(0, list.length);
    } else if (kind === 'cone') {       // 화염 — 화면에 선 병사들 + 첫 용사에 고르게
      const shownMin = B.stage.swarm?.shown || 6;
      list = [...alive.filter(e => e.minion).slice(0, shownMin), ...heroes.slice(0, 1)];
    } else if (kind === 'quake') {      // 지진 — 줄 선 병사까지 살아 있는 전원에 고르게
      list = alive;
    } else if (kind === 'execute') {    // 마무리 — 가장 다친 용사 하나 (용사가 없으면 앞)
      list = heroes.length ? [heroes.reduce((a, b) => (ratio(a.Lhp, a.Lmax) <= ratio(b.Lhp, b.Lmax) ? a : b))] : [tgt];
    } else {                            // heroes — 용사들만 고르게 (병사는 건너뛴다)
      list = heroes.length ? heroes : [tgt];
    }
    if (!list.length) list = [tgt];
    if (!w) w = list.map(() => 1 / list.length);
    const sum = w.reduce((a, b) => a + b, 0);
    killed = hitList(list.map((e, i) => [e, Ldmg + Math.log10(w[i] / sum)]));
  }
  for (const [e] of killed) e.hitT = 0.16;
  fx('skill', sk.icon + ' ' + fmt(Ldmg), idx, -4);
  R.skillFxT = 0.35;
  R.skillFx = sk.id;
  R.shake = Math.max(R.shake, 0.2 + Math.min(4, killed.length) * 0.03);
  for (const [e, i] of killed) onKill(e, i);
  return true;
}

export function tick(dt) {
  if (R.bannerT > 0) R.bannerT -= dt;
  if (R.shake > 0) R.shake -= dt;
  if (R.heavyT > 0) R.heavyT -= dt;
  for (const r of R.rings) r.t += dt;
  if (R.rings.length) R.rings = R.rings.filter(r => r.t < 0.45);
  // 연쇄는 시간이 끊으면 식는다. 사망·스테이지 이동에서는 enterStage 가 0 으로 되돌린다.
  if (R.chainT > 0) { R.chainT -= dt; if (R.chainT <= 0) R.chain = 0; }
  if (R.waveInT > 0) R.waveInT -= dt;
  // 체력이 낮을수록 박동이 빨라진다. 30% 에서 1.0초, 5% 에서 0.42초 간격.
  const hpFrac = R.LhpMax > L0 ? ratio(R.Lhp, R.LhpMax) : 1;
  if (hpFrac > 0 && hpFrac < DANGER_AT) {
    R.dangerT -= dt;
    if (R.dangerT <= 0) {
      R.dangerT = 0.42 + (hpFrac / DANGER_AT) * 0.58;
      onEvent({ type: 'danger', frac: hpFrac });
    }
  } else R.dangerT = 0;
  if (R.atkAnimT > 0) R.atkAnimT -= dt;
  if (R.pHitT > 0) R.pHitT -= dt;
  if (R.skillFxT > 0) R.skillFxT -= dt;
  if (R.bossIntroT > 0) R.bossIntroT -= dt;
  if (R.bossSlainT > 0) R.bossSlainT -= dt;
  if (R.powerUp && R.powerUp.t > 0) R.powerUp.t -= dt;
  if (R.feverT > 0) R.feverT -= dt;
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
    if (e.kbT > 0) e.kbT -= dt;
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
    banner(tr('cb.enrage', { name: R.heroName }), 2.6, true);
  }

  // 플레이어 공격
  R.atkT -= dt;
  // 피버 중엔 공격속도 × aspdMul — 한 방 피해는 그대로라 그만큼 DPS 가 오른다(눌러야만 켜진다 · 시뮬 밖)
  const interval = 1 / (nval('aspd') * (R.feverT > 0 ? (B.stage.fever?.aspdMul || 1) : 1));
  if (R.atkT <= 0) {
    R.atkT = interval;
    R.atkAnimT = Math.min(0.25, interval * 0.6);
    R.atkAnimMax = R.atkAnimT;          // 공격 프레임(준비·타격·마무리) 진행도의 분모
    const crit = Math.random() < Math.min(1, nval('crit'));
    // 실제 피해를 **LDPS 에서 끌어온다.** 식을 두 벌 쓰면 반드시 어긋난다 —
    // 실제로 어긋나 있었다: gC(동료 배너)와 마스터리 노드가 표시 DPS 와
    // canClear 판단에만 있고 피해에는 없어서, 표시가 406배일 때 타격은 1.12배였다.
    // 동료 배너와 광폭 노드가 통째로 무력했고, 부풀려진 DPS 로 못 깨는 스테이지에
    // 계속 도전해 죽었다. 시뮬은 줄곧 올바른 쪽(LDPS)을 검증해 왔다.
    //
    // LDPS 는 기대 치명타(critF)와 공격속도를 포함하므로 둘을 덜어내고
    // 이번 타격의 실제 치명타 배수를 다시 곱한다 — 기댓값은 LDPS 와 같고 분산만 산다.
    const critMul = crit ? nval('cdmg') : 1;
    // normalShare() 는 스킬이 가져간 몫을 뺀 나머지다. 스킬이 없으면 1 이다.
    const Ldmg = LDPS(R.boss) - fromNum(nval('aspd')) - fromNum(critF())
               + fromNum(critMul * normalShare()) + DEV.Ldmg;   // DEV.Ldmg: 개발자 모드 피해 배수(보통 0)
    // **피해는 여기서 끝난다.** 아래 연출이 늦게 오더라도 수치는 이미 적용됐다 —
    // 피해를 명중까지 미루면 DPS 가 비행시간만큼 깎여 시뮬과 어긋난다.
    // 병사를 쓰러뜨리고 남은 피해는 뒤의 적으로 넘어간다(strikeFront).
    const idx = R.enemies.indexOf(f);
    const killed = strikeFront(Ldmg);
    onEvent({ type: 'attack' });        // 실제 평타가 나간 순간 (연출이 아니라 사실)
    // 투사체 한 발. 도착하면 숫자·피격·소리가 한꺼번에 터진다.
    const FXC = B.combatFx;
    // 4번째마다 강타. 공속이 아주 빠르면 1초에 여러 번 돌진해 정신없으므로 최소 간격을 둔다
    R.combo++;
    const heavy = R.combo % HEAVY_EVERY === 0 && R.stageTime - lastHeavy >= HEAVY_GAP;
    if (heavy) { lastHeavy = R.stageTime; R.heavyT = HEAVY_SEC; }
    R.bolts.push({ idx, t: 0, dur: FXC.boltSec, crit, heavy, ph: Math.random() * 6.28 });
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
    // 꿰뚫고 같이 쓰러진 뒤쪽 적에게도 한 발씩 — 맞은 게 보여야 '한 방에 여럿' 이 읽힌다
    for (let k = 1; k < killed.length; k++) {
      R.bolts.push({ idx: killed[k][1], t: 0, dur: T + k * 0.05, crit, heavy: false, ph: Math.random() * 6.28 });
    }
    for (const [e, i] of killed) onKill(e, i);
  }

  // 스킬 — 쿨마다 모아둔 몫을 한 번에. 평타는 그만큼 줄어 있으므로 총량은 같다.
  // 적이 힘을 모으는 동안(R.charging)은 자동 발동을 잠깐 쥐고 있는다 — 준비된 스킬을 **직접 눌러** 끊을 수 있게.
  // 한 방 몫은 쿨 동안 모은 양으로 정해져 있어 늦게 쏴도 피해는 같다(1~2초 늦을 뿐).
  tickSkills(R.skillCd, dt, fireSkill, R.charging);

  // 적 공격 — **적마다 제 타이머**로 때린다.
  // 예전엔 그룹 1타이머가 살아있는 수에 비례한 피해를 한 번에 줬다. 총량은 같지만
  // 여덟 종이 동시에 같은 포즈로 바뀌어 적이 사실상 1종처럼 보였다.
  // 주기(1/aspd)와 한 기당 피해는 그대로라 **시간당 총 피해가 바뀌지 않는다** —
  // 시뮬의 `aspd × alive` 모델과 그대로 맞는다.
  const period = 1 / B.enemy.aspd;
  // 줄 서서 기다리는(화면 밖) 병사는 때리지 않는다 — spawnWave 의 받는 피해 식이 그렇게 맞춰져 있다
  const shownMin = B.stage.swarm?.shown || Infinity;
  let minRank = 0;
  let charging = false;
  const BH = B.stage.bossHeavy;
  for (const e of R.enemies) {
    if (!(e.Lhp > L0)) continue;                 // 죽은 적은 안 때린다 (= 예전의 alive 비례)
    if (e.minion && minRank++ >= shownMin) continue;
    if (e.aPose > 0) e.aPose -= dt;
    if (e.healT > 0) e.healT -= dt;
    // 방패병 — 방패를 내렸다 올렸다 (guarding)
    if (e.guardCyc !== undefined) { const g = e.hero.trait; e.guardCyc = (e.guardCyc + dt) % (g.open + g.guard); }
    // ── 힘을 모으는 적: 보스 큰 공격(heavyCd) · 대포 장전(shellCd) ──
    if (e.heavyCd !== undefined || e.shellCd !== undefined) {
      if (e.windT > 0) {                         // 모으는 중 — 다 모이면 한 방
        charging = true;
        e.windT -= dt;
        if (e.windT > 0) continue;               // 모으는 동안은 평타를 쉰다
        e.windT = 0; e.aPose = FOE_POSE;
        const shell = e.shellCd !== undefined;
        if (shell) e.shellCd = e.hero.trait.units / B.enemy.aspd - e.hero.trait.wind;
        else e.heavyCd = BH.every - BH.wind;
        R.shake = Math.max(R.shake, shell ? 0.18 : 0.4);
        if (foeStrike(e, shell ? e.Latk + Math.log10(e.hero.trait.units) : e.LatkHeavy)) return;
        continue;
      }
      if (e.shellCd !== undefined) {             // 대포는 평타가 없다 — 장전만 기다린다
        e.shellCd -= dt;
        if (e.shellCd <= 0) { e.windT = e.hero.trait.wind; onEvent({ type: 'charge' }); }
        continue;
      }
      e.heavyCd -= dt;                           // 보스는 기다리는 동안 (줄인 세기로) 평타를 계속한다
      if (e.heavyCd <= 0) { e.windT = BH.wind; if (e.LatkLow !== undefined) { e.Latk = e.LatkLow; e.LatkLow = undefined; } onEvent({ type: 'charge', boss: true }); continue; }
    }
    e.atkT -= dt;
    if (e.atkT > 0) continue;
    e.atkT += period;
    e.aPose = FOE_POSE;
    // 힐러는 **때리지 않는다.** 아군 체력만 채운다 — 그래서 혼자 나올 수도 없다.
    if (e.hero?.support) { foeHeal(e); continue; }
    // 기병 돌진 — 첫 한 방이 mul 몫이고, 그만큼 다음 평타가 늦다(합 같음)
    let Lw;
    if (e.firstMul) { Lw = e.Latk + Math.log10(e.firstMul); e.atkT += period * (e.firstMul - 1); e.firstMul = 0; e.dashT = 0.3; }
    if (foeStrike(e, Lw)) return;                // 죽었으면 더 처리하지 않는다
  }
  R.charging = charging;
}

/** 피버 — 게이지가 찼으면 켠다. 버튼(ui-skills)이 부른다. 켜졌으면 true */
export function startFever() {
  const F = B.stage.fever;
  if (!F || R.feverT > 0 || (R.feverG || 0) < F.goal) return false;
  R.feverT = F.sec; R.feverG = 0;
  banner(tr('fv.go'), 1.2);          // 큰 배너는 '새로운 해금!' 머리말이 붙는다 — 보통 배너로
  onEvent({ type: 'fever' });
  return true;
}

/**
 * 힐러 한 번. 가장 많이 다친 **비힐러** 아군을 채운다.
 *
 * 회복량은 작다(최대 체력의 0.2%). 크게 주면 회복이 플레이어 DPS 를 넘는 순간
 * 적이 영영 안 죽어 벽이 된다 — 시뮬에서 0.003 부터 무진행이 6시간을 넘었다.
 * 작아도 역할은 분명하다: 긴 싸움일수록 누적이 커지고, 체력바가 **올라가는 게 보인다**.
 */
function foeHeal(healer) {
  // healMul: 물량전에선 용사 체력이 작아져서, 같은 양(절대값)을 채우려면 비율을 그만큼 키운다(spawnWave)
  const pct = Math.min((healer.hero?.healPct || 0) * (healer.healMul || 1), healer.healLeft);
  if (!(pct > 0)) return;                        // 총량이 바닥났으면 아무것도 안 한다
  let tgt = null, worst = Infinity;
  for (const e of R.enemies) {
    // 병사는 채우지 않는다 — 1~2방에 쓰러지는 것을 채워 봐야 보이지도 않고, 시뮬의 힐러 모델(용사 체력 증가)과도 어긋난다
    if (e === healer || !(e.Lhp > L0) || e.hero?.support || e.minion) continue;
    const frac = ratio(e.Lhp, e.Lmax);
    if (frac < worst && frac < 1) { worst = frac; tgt = e; }
  }
  if (!tgt) return;                              // 다친 아군이 없으면 아무 일도 없다
  tgt.Lhp = Math.min(tgt.Lmax, add(tgt.Lhp, tgt.Lmax + fromNum(pct)));
  healer.healLeft -= pct;                        // 쓴 만큼 줄어든다
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
function foeStrike(e, Lw = e.Latk) {
  // e.Latk: 물량전의 한 대 비중(체력 몫 × c, log). 예전 용사 한 기면 0
  const Ldmg = LeATK(R.stage, R.boss) + (Lw || 0) - LDEF() + fromNum(enrage());
  // 관문은 **최대 체력 비례** 로 한 번 더 문다. 방어·체력을 올려도 줄지 않는다 —
  // 이게 있어야 "빨리 못 죽이면 내가 죽는다" 가 성립한다(balance.json stage.gate 참조).
  // 관문은 보스전이라 적이 한 기뿐이므로 물리는 횟수가 예전과 같다.
  const bite = gateBite();
  const Lbite = bite > 0 ? R.LhpMax + fromNum(bite) : L0;
  const Ltotal = Lbite > L0 ? add(Ldmg, Lbite) : Ldmg;
  // 개발자 모드 무적 — 맞는 모습만 내고 체력은 그대로
  if (DEV.god) { spawnFoeBolt(e, Ltotal); return false; }
  // 피해는 **지금** 들어간다. 날아가는 그림은 연출일 뿐이다(플레이어 투사체와 같은 규칙).
  if (Ltotal >= R.Lhp) { R.Lhp = L0; playerDied(); return true; }
  R.Lhp = sub(R.Lhp, Ltotal);
  spawnFoeBolt(e, Ltotal);
  return false;
}

// ── 파워 업 박자 (2026-11-16) ──
// 자동 강화가 0.25초마다 조용히 스탯을 사서 "방금 세졌다" 는 순간이 화면에 없었다 — 강해지는 게 이 장르의 보상인데.
// 전투력(LDPS)이 직전에 알린 값보다 POWER_STEP 넘게 오르면 한 번 알린다(POWER_GAP 초에 한 번까지).
// 무엇 때문에 올랐는지는 묻지 않는다 — 자동 강화 · 직접 강화 · 뽑기 · 성장 전부 같은 박자로 읽힌다.
// 숫자(%) 대신 손에 잡히는 말을 먼저 쓴다: "용사 9방 → 7방". 수치는 아무것도 바꾸지 않는다.
const POWER_STEP = Math.log10(1.25);
const POWER_GAP = 6;
let powerRef = null, powerAtT = -1e9, powerClock = 0;
/** 지금 층의 용사 한 기를 평타 몇 방에 쓰러뜨리나 (물량전의 용사 몫 체력 기준) */
function heroHits(Ldps) {
  const share = B.stage.swarm?.share > 0 ? 1 - B.stage.swarm.share : 1;
  const Lhit = Ldps - fromNum(nval('aspd'));                 // 평타 한 방 ≈ DPS ÷ 공속
  return Math.ceil(Math.pow(10, LeHP(R.stage, false) + Math.log10(share) - Lhit));
}
/** main 루프가 0.25초마다 부른다 (dt = 그동안 흐른 실제 시간) */
export function powerPulse(dt) {
  powerClock += dt;
  const L = LDPS(false);
  if (!(L > L0)) return;
  if (powerRef === null || L < powerRef) { powerRef = L; return; }   // 처음 · 환생 뒤에는 기준만 다시 잡는다
  if (powerClock - powerAtT < POWER_GAP) return;
  // 알리는 순간: 용사를 쓰러뜨리는 데 드는 평타가 **한 방이라도 줄었을 때** — 손에 잡히는 변화다.
  // +25% 만 보던 첫 판은 1시간에 6번(10분에 한 번)뿐이라 '보이게' 가 안 됐다(실측). 한 방에 쓰러뜨릴 만큼 세면 +25% 로 센다.
  const from = heroHits(powerRef), to = heroHits(L);
  if (!(to < from) && L - powerRef < POWER_STEP) return;
  R.powerUp = { t: 1.8, pct: Math.round((Math.pow(10, L - powerRef) - 1) * 100), from, to };
  powerRef = L; powerAtT = powerClock;
  onEvent({ type: 'powerUp' });
}

/** 개발자 모드: 지금 무리를 한 번에 쓰러뜨린다. 처치 보상·웨이브/스테이지 클리어는 평소대로 흐른다 */
export function devKillAll() {
  const list = R.enemies;              // 마지막 처치가 다음 웨이브를 깔면 R.enemies 가 바뀐다
  list.forEach((e, i) => { if (e.Lhp > L0) { e.Lhp = L0; onKill(e, i); } });
}

/** 재도전: 최고 기록 다음 스테이지로 복귀 */
export function retry() {
  S.st = Math.max(1, S.best + (S.best >= 1 ? 1 : 0));
  if (S.st <= S.best) S.st = S.best + 1;
  enterStage(S.st, MODE.RUN);
  banner(tr('cb.retry'));
  save();
}

/** 지금 스테이지가 얼마나 버거운지 (1.0 = 딱 버팀) — UI 안내용 */
export function toughness() {
  const ttk = ratio(LeHP(R.stage, R.boss), LDPS(R.boss));
  const need = ttk * (R.boss ? 1 : perWave(R.stage)) * (R.boss ? 1 : B.stage.waves);
  const survive = ratio(LHP(), Linc(R.stage, R.boss));
  return { ttk, need, survive, ratio: survive / Math.max(need, 1e-9) };
}
