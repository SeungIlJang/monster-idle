// 파생 스탯. tools/design-sim.cjs 의 같은 이름 함수와 반드시 일치해야 한다.
// 큰 값은 log10 으로 돌려준다(접두사 L).
import { B, STAT_KEYS, perWave, isBoss, LeATK, LeHP } from './balance.js';
import { S } from './state.js';
import { fromNum, geoSum, ratio, sub } from './logmath.js';
import { atkMul, hpMul, dpsMul } from './layer2.js';
import { Lsoul } from './prestige.js';

const SD = k => B.stats[k];

export function unlocked(k) {
  const d = SD(k);
  if (d.reqStage && S.life < d.reqStage) return false;   // 해금은 영구 기록 기준 (환생해도 안 잠긴다)
  if (d.req && S.lv[d.req[0]] < d.req[1]) return false;
  return true;
}
export function maxed(k) {
  const d = SD(k);
  return d.max !== undefined && S.lv[k] >= d.max;
}
/** 다음 1레벨 비용 (log10) */
export const Lcost = k => {
  const d = SD(k);
  return d.Lc0 + S.lv[k] * d.Lg;
};
/** N레벨 한꺼번에 사는 비용 (log10) */
export const LcostN = (k, N) => {
  const d = SD(k);
  return Lcost(k) + geoSum(d.Lg, d.g, N);
};
/** 'mul' 스탯의 현재 값 (log10) */
export const Lval = k => {
  const d = SD(k);
  return d.Lbase + (S.lv[k] - (d.base === 1 ? 0 : 1)) * d.Lr;
};
/** 'add' 스탯의 현재 값 (실수) */
// ── 리드 몬스터 고유 능력 ────────────────────────────────────
// 전부 **사이드그레이드** 다 — 한 축을 올리면 다른 축이 내려간다.
// 상한 없는 순수 상승이면 "제일 센 놈" 하나만 남아 선택이 사라지고(그러면 수집이 외형일 뿐이다),
// 곡선도 깨진다(해금 스탯에서 겪었다: 성장 트랙을 더하면 전투력이 적을 앞지른다).
const ABIL = {};
for (const m of B.roster.monsters) ABIL[m.key] = m.ability || {};
/** 지금 리드의 능력치 배수. 없는 항목은 1(= 영향 없음) */
export const ab = (k, dflt = 1) => {
  const v = ABIL[S.mon]?.[k];
  return typeof v === 'number' ? v : dflt;
};
export const abilityOf = key => ABIL[key] || null;

export const nval = k => {
  const d = SD(k);
  let v = d.base + d.a * S.lv[k];
  // 능력은 스탯 **실효값** 에 건다 — 그래야 공격속도 변화가 실제 타격 간격까지 간다.
  // 단 nrm(일반적 피해)은 여기서 건드리면 안 된다. max(0, (1+v)*0.95-1) 로 깎았더니
  // 레벨 1~2 에서 값이 0 에 머물러, 탐욕적 구매기가 gain=0 을 보고 nrm 트랙을 영영 안 샀다
  // (최대 +4000% 짜리 트랙이 통째로 날아가 30일차가 14,041 → 7,043 이 됐다).
  // 잡몹 배수는 LDPS 에서 boss 와 대칭으로 건다.
  if (k === 'aspd' || k === 'cdmg' || k === 'rec') v *= ab(k);
  if (k === 'crit') v = Math.max(0, v + ab('critAdd', 0));
  if (k === 'dbl') v = Math.max(0, v + ab('dblAdd', 0));   // 아라크네 맹독
  return v;
};

// ── 가챠 보유 효과 (배너별 합 %) ──────────────────────────────
// 보유 효과 + 장착 효과가 같은 축에 곱해진다 (DESIGN.md §7.4)
export const gE = () => S.own.equip + S.eqv.equip;
export const gS = () => S.own.skill + S.eqv.skill;
export const gC = () => S.own.comp + S.eqv.comp;

// ── 전투 스탯 ────────────────────────────────────────────────
// 상급공격력은 해금 전에도 레벨 1 이라 ×1.024 가 적용되고 있었다 — 잠겼으면 ×1 이어야 한다
// 공격·체력 배수 트랙. 어떤 스탯이 어느 트랙인지는 balance.json 의 `track` 이 정한다.
// 수식에 키를 박아 두면 **깊은 층 해금 스탯을 하나 넣을 때마다 두 파일을 고쳐야 한다** —
// 해금 사다리가 3,000층에서 끊긴 걸 데이터로 메우려면 여기가 열려 있어야 한다.
const TRACK = t => STAT_KEYS.filter(k => B.stats[k].kind === 'mul' && B.stats[k].track === t);
const ATK_T = TRACK('atk'), HP_T = TRACK('hp');
const Ltrack = ks => ks.reduce((a, k) => a + (unlocked(k) ? Lval(k) : 0), 0);

export const LATK = () => Ltrack(ATK_T) + fromNum((1 + gE() / 100) * atkMul());
export const LHP  = () => Ltrack(HP_T) + fromNum((1 + gE() / 200) * hpMul() * ab('hp'));
// dr(피해감소)은 방어력 배수로 들어간다 — 적 피해가 LDEF 로 나눠지므로 올리면 덜 맞는다
export const LDEF = () => Lval('def') + fromNum(ab('dr'));
export const Lburst = () => fromNum(1.5 * (1 + gS() / 100));

export const shots = () => 1 + Math.min(1, nval('dbl')) + Math.min(1, nval('trp'));
export const critF = () => 1 + Math.min(1, nval('crit')) * (nval('cdmg') - 1);

export function LDPS(boss) {
  const nrmF = boss ? 1 : 1 + nval('nrm');
  const Lp = Lsoul();                      // 환생 상점 보너스 (승산 → 로그에서는 덧셈)
  // dmg 는 전체, boss/잡몹 배수는 상대에 따라 갈린다 (nrm 쪽은 nval('nrm') 에서 이미 반영됐다)
  let L = LATK() + fromNum(critF() * shots() * nrmF * nval('aspd') * (1 + gC() / 100) * dpsMul()
                           * ab('dmg') * (boss ? ab('boss') : ab('nrm'))) + Lp;
  if (boss) L += Lburst();
  return L;
}

/** 스테이지 s 에서 초당 받는 피해 (log10). 방어 비율감소 반영 */
export const Linc = (s, boss) =>
  LeATK(s, boss) + fromNum(B.enemy.aspd * (boss ? 1 : perWave(s))) - LDEF();

/** 전투력 = DPS × 버티는 시간 (log10). 지출 우선순위 판단에 쓴다 */
export function Lpower(s, boss) {
  const waves = boss ? 1 : B.stage.waves;
  const Lehp = LHP() + fromNum(1 + (waves - 1) * nval('rec'));
  return LDPS(boss) + Lehp - Linc(s, boss);
}

/** 표시용 전투력 (log10) — 스테이지 의존을 뺀 단순 지표 */
export const Lrating = () => LDPS(false) + LHP() + LDEF();

// ── 구매 ─────────────────────────────────────────────────────
/** 살 수 있는 최대 레벨 수 */
export function affordable(k) {
  const d = SD(k);
  if (!unlocked(k) || maxed(k)) return 0;
  const diff = S.Lg - Lcost(k);
  if (diff < 0) return 0;
  const a = Math.pow(10, Math.min(300, diff));
  let N = Math.floor(Math.log(1 + a * (d.g - 1)) / Math.log(d.g));
  if (!Number.isFinite(N) || N < 1) N = 1;
  if (d.max !== undefined) N = Math.min(N, d.max - S.lv[k]);
  return Math.max(0, N);
}

/** N레벨 구매. 실제로 산 레벨 수를 돌려준다 */
export function buy(k, N = 1) {
  const can = affordable(k);
  if (can < 1) return 0;
  const n = Math.min(N, can);
  const paid = LcostN(k, n);
  if (paid > S.Lg) return 0;
  S.Lg = sub(S.Lg, paid);
  S.lv[k] += n;
  return n;
}

/** 그 스테이지를 지금 전투력으로 여유있게 클리어할 수 있는가 */
export function canClear(s, margin = 1.5) {
  const boss = isBoss(s);
  const ttk = ratio(LeHP(s, boss), LDPS(boss));
  if (!(ttk > 0) || !isFinite(ttk)) return false;
  const per = boss ? 1 : perWave(s);
  const waves = boss ? 1 : B.stage.waves;
  const need = ttk * per * waves;
  if (need > B.player.giveUpSeconds) return false;
  const Lehp = LHP() + fromNum(1 + (waves - 1) * nval('rec'));
  const survive = ratio(Lehp, Linc(s, boss));
  return survive > need * margin;
}

/**
 * 사망 후 돌아갈 파밍 스테이지.
 * 한 칸씩 내려가면 1.12^스테이지 성장 때문에 복구가 사실상 불가능하므로(사망 연쇄),
 * 지금 전투력으로 클리어 가능한 가장 깊은 스테이지를 이분탐색으로 바로 찾는다.
 */
export function bestFarmStage(maxStage) {
  const hiLimit = Math.max(1, maxStage);
  if (!canClear(1)) return 1;
  let lo = 1, hi = hiLimit;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (canClear(mid)) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** 전투력 증가율 ÷ 비용 이 가장 큰 스탯 (자동 강화·추천 표시용) */
export function bestBuy(s, boss) {
  const p0 = Lpower(s, boss);
  let best = null;
  for (const k of STAT_KEYS) {
    if (!unlocked(k) || maxed(k)) continue;
    const c = Lcost(k);
    if (c > S.Lg) continue;
    S.lv[k]++;
    const gain = ratio(Lpower(s, boss), p0) - 1;
    S.lv[k]--;
    if (!(gain > 0)) continue;
    const score = Math.log10(gain) - c;
    if (!best || score > best.score) best = { key: k, score };
  }
  return best;
}
