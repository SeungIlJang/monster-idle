// 가챠 3배너 — 배너 레벨 1~10, 보유 효과, 융합 (DESIGN.md §7)
//
// 설계의 핵심 두 가지:
//  1) 뽑을수록 배너 레벨이 올라 드롭 테이블 자체가 좋아진다 → 운이 나빠도 진행된다.
//  2) 보유 효과는 장착하지 않아도 적용된다 → 가챠 중복이 쓰레기가 되지 않는다.
//
// 장착 효과는 아직 넣지 않았다. 시뮬레이터가 검증한 밸런스는 보유 효과만 모델링하므로,
// 장착 효과를 얹으려면 시뮬에도 같이 넣고 판정을 다시 받아야 한다(§14).
import { B } from './balance.js';
import { S } from './state.js';
import { bump as bumpDaily } from './daily.js';

export const BANNERS = B.gacha.banners;            // [{key,name,icon,slots,affects}]
export const RARITIES = B.gacha.rarities;          // [{name,color,owned,equipped}]
const ENH_MUL = B.gacha.fuse.enhanceMul;           // 강화 레벨당 ×1.12
const PROMOTE_N = B.gacha.fuse.sameRarityToPromote; // 3개 → 상위 1개
const ENHANCE_N = B.gacha.fuse.dupToEnhance;        // 2개 → 강화 +1

// 배너별 아이템 종류. "같은 아이템 2개 = 강화" 규칙이 성립하려면 종류가 있어야 한다.
export const CATALOG = {
  equip: [
    { id: 'club', name: '가시 몽둥이', icon: '🏏' },
    { id: 'axe', name: '녹슨 도끼', icon: '🪓' },
    { id: 'shield', name: '뼈 방패', icon: '🛡️' },
    { id: 'armor', name: '이끼 갑옷', icon: '🥋' },
    { id: 'fang', name: '독니 목걸이', icon: '📿' },
    { id: 'ring', name: '마석 반지', icon: '💍' },
  ],
  skill: [
    { id: 'acid', name: '산성 침', icon: '🧪' },
    { id: 'gust', name: '돌풍', icon: '🌪️' },
    { id: 'grasp', name: '어둠의 손아귀', icon: '🖐️' },
    { id: 'breath', name: '화염 숨결', icon: '🔥' },
    { id: 'quake', name: '대지 가르기', icon: '🪨' },
    { id: 'shriek', name: '비명', icon: '💢' },
  ],
  comp: [
    { id: 'slimelet', name: '작은 슬라임', icon: '🟢' },
    { id: 'bats', name: '박쥐 떼', icon: '🦇' },
    { id: 'spore', name: '버섯 포자', icon: '🍄' },
    { id: 'wisp', name: '도깨비불', icon: '🔮' },
    { id: 'shard', name: '돌조각', icon: '🪨' },
    { id: 'shade', name: '그림자', icon: '👤' },
  ],
};

const itemDef = (banner, id) => CATALOG[banner].find(i => i.id === id);
const keyOf = (id, rarity, enh) => id + '|' + rarity + '|' + enh;
const parseKey = k => { const [id, r, e] = k.split('|'); return { id, rarity: +r, enh: +e }; };

// ── 배너 레벨 ────────────────────────────────────────────────
export function bannerLv(banner) {
  const pulls = S.bp[banner] || 0;
  const T = B.gacha.lvThresh;
  let lv = 1;
  for (let i = 0; i < T.length; i++) if (pulls >= T[i]) lv = i + 1;
  return lv;
}
export function lvProgress(banner) {
  const pulls = S.bp[banner] || 0;
  const T = B.gacha.lvThresh;
  const lv = bannerLv(banner);
  const cur = T[lv - 1];
  const next = lv < T.length ? T[lv] : null;
  return { lv, pulls, cur, next, frac: next === null ? 1 : (pulls - cur) / (next - cur) };
}
export const dropTable = banner => B.gacha.table[bannerLv(banner) - 1];

/** 뽑기 1회의 보유 효과 기대값(%) — UI 안내용 */
export function expectedOwnedPerPull(banner) {
  const t = dropTable(banner);
  let v = 0;
  for (let i = 0; i < RARITIES.length; i++) v += (t[i] / 100) * RARITIES[i].owned;
  return v;
}

// ── 장착 슬롯 ────────────────────────────────────────────────
/** 진행도에 따라 열린 슬롯 수 */
export function activeSlots(banner) {
  const b = BANNERS.find(x => x.key === banner);
  if (!b) return 0;
  return b.slotUnlock.filter(u => S.life >= u).length;      // 해금은 영구 기록 기준
}
/** 다음 슬롯이 열리는 스테이지 (전부 열렸으면 null) */
export function nextSlotAt(banner) {
  const b = BANNERS.find(x => x.key === banner);
  if (!b) return null;
  const next = b.slotUnlock.find(u => S.life < u);
  return next ?? null;
}
const equipValue = (rarity, enh) => RARITIES[rarity].equipped * Math.pow(ENH_MUL, enh);

/**
 * 자동 장착: 장착 효과가 높은 순으로 열린 슬롯을 채운다.
 * 수동 장착 UI 를 두지 않는 이유 — 최적해가 "가장 센 것 N개"로 자명해서
 * 플레이어에게 고르게 하면 번거롭기만 하고 선택의 의미가 없다.
 */
export function equippedList(banner) {
  const slots = activeSlots(banner);
  if (slots < 1) return [];
  const out = [];
  for (const it of inventoryOf(banner)) {       // 등급·강화 내림차순
    const val = equipValue(it.rarity, it.enh);
    for (let i = 0; i < it.count && out.length < slots; i++) out.push({ ...it, val });
    if (out.length >= slots) break;
  }
  return out;
}

// ── 보유 · 장착 효과 합계 ────────────────────────────────────
/**
 * 인벤토리에서 배너별 보유/장착 효과 합(%)을 다시 계산한다.
 * S.own / S.eqv 는 파생 캐시이므로 인벤토리나 진행도가 바뀔 때마다 불러야 한다.
 */
export function recomputeGacha() {
  for (const b of BANNERS) {
    const inv = S.inv[b.key] || {};
    let sum = 0;
    for (const k of Object.keys(inv)) {
      const { rarity, enh } = parseKey(k);
      sum += inv[k] * RARITIES[rarity].owned * Math.pow(ENH_MUL, enh);
    }
    S.own[b.key] = sum;
    S.eqv[b.key] = equippedList(b.key).reduce((a, x) => a + x.val, 0);
  }
}

// ── 뽑기 ─────────────────────────────────────────────────────
function rollRarity(banner) {
  const t = dropTable(banner);
  let r = Math.random() * 100;
  for (let i = 0; i < t.length; i++) {
    r -= t[i];
    if (r < 0) return i;
  }
  return 0;
}

function addItem(banner, id, rarity, enh = 0, n = 1) {
  const inv = (S.inv[banner] ||= {});
  const k = keyOf(id, rarity, enh);
  inv[k] = (inv[k] || 0) + n;
}

/** n회 뽑는다. 젬은 호출측에서 이미 확인·차감했다고 가정하지 않고 여기서 처리한다. */
export function pull(banner, n, { free = false } = {}) {
  const cost = free ? 0 : B.gacha.costPerPull * n;
  if (!free && S.gem < cost) return null;
  if (!free) S.gem -= cost;

  const results = [];
  for (let i = 0; i < n; i++) {
    const cat = CATALOG[banner];
    const def = cat[Math.floor(Math.random() * cat.length)];
    const rarity = rollRarity(banner);
    addItem(banner, def.id, rarity, 0, 1);
    S.bp[banner] = (S.bp[banner] || 0) + 1;
    results.push({ id: def.id, name: def.name, icon: def.icon, rarity });
  }
  bumpDaily('pull', n);
  recomputeGacha();
  return results;
}

// ── 무료 뽑기 (하루 배너당 N회) ──────────────────────────────
function today() {
  const d = new Date();
  return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}
export function ensureDaily() {
  const t = today();
  if (S.freeDay !== t) {
    S.freeDay = t;
    S.freeUsed = {};
    for (const b of BANNERS) S.freeUsed[b.key] = 0;
  }
}
export function freeLeft(banner) {
  ensureDaily();
  return Math.max(0, B.gacha.freeAdPullsPerBanner - (S.freeUsed[banner] || 0));
}
export function freePull(banner) {
  if (freeLeft(banner) < 1) return null;
  S.freeUsed[banner] = (S.freeUsed[banner] || 0) + 1;
  return pull(banner, 1, { free: true });
}

// ── 융합 ─────────────────────────────────────────────────────
/** 같은 등급 3개 → 상위 등급 1개. 등급당 보유효과가 3.6배라 항상 +20% 이득이다. */
export function promote(banner, id, rarity, enh) {
  const inv = S.inv[banner] || {};
  const k = keyOf(id, rarity, enh);
  if (rarity >= RARITIES.length - 1) return false;
  if ((inv[k] || 0) < PROMOTE_N) return false;
  inv[k] -= PROMOTE_N;
  if (inv[k] === 0) delete inv[k];
  addItem(banner, id, rarity + 1, enh, 1);
  recomputeGacha();
  return true;
}

/** 같은 아이템 2개 → 강화 +1 (보유 효과 ×1.12) */
export function enhance(banner, id, rarity, enh) {
  const inv = S.inv[banner] || {};
  const k = keyOf(id, rarity, enh);
  if ((inv[k] || 0) < ENHANCE_N) return false;
  inv[k] -= ENHANCE_N;
  if (inv[k] === 0) delete inv[k];
  addItem(banner, id, rarity, enh + 1, 1);
  recomputeGacha();
  return true;
}

/**
 * 가능한 융합을 전부 수행한다.
 * 승급을 먼저, 그 다음 강화를 한다 — 승급이 +20% 이득이라 항상 우선이다.
 * 승급이 새 재료를 만들어내므로 변화가 없을 때까지 반복한다.
 */
export function fuseAll(banner) {
  let promoted = 0, enhanced = 0, changed = true, guard = 0;
  while (changed && guard++ < 200) {
    changed = false;
    const inv = S.inv[banner] || {};
    for (const k of Object.keys(inv)) {
      const { id, rarity, enh } = parseKey(k);
      while (rarity < RARITIES.length - 1 && (S.inv[banner][k] || 0) >= PROMOTE_N) {
        if (!promote(banner, id, rarity, enh)) break;
        promoted++; changed = true;
      }
    }
    const inv2 = S.inv[banner] || {};
    for (const k of Object.keys(inv2)) {
      const { id, rarity, enh } = parseKey(k);
      // 최고 등급은 승급할 수 없으므로 강화로만 올린다
      while (rarity >= RARITIES.length - 1 && (S.inv[banner][k] || 0) >= ENHANCE_N) {
        if (!enhance(banner, id, rarity, enh)) break;
        enhanced++; changed = true;
      }
    }
  }
  return { promoted, enhanced };
}

/** 융합 가능한 묶음이 있는가 (UI 빨간 점) */
export function hasFusable(banner) {
  const inv = S.inv[banner] || {};
  for (const k of Object.keys(inv)) {
    const { rarity } = parseKey(k);
    if (rarity < RARITIES.length - 1 && inv[k] >= PROMOTE_N) return true;
    if (rarity >= RARITIES.length - 1 && inv[k] >= ENHANCE_N) return true;
  }
  return false;
}

// ── 조회 ─────────────────────────────────────────────────────
/** 인벤토리를 등급 내림차순으로 정리해서 돌려준다 */
export function inventoryOf(banner) {
  const inv = S.inv[banner] || {};
  return Object.keys(inv).map(k => {
    const p = parseKey(k);
    const def = itemDef(banner, p.id);
    const unit = RARITIES[p.rarity].owned * Math.pow(ENH_MUL, p.enh);
    return { ...p, key: k, count: inv[k], name: def?.name ?? p.id, icon: def?.icon ?? '❔', unit, total: unit * inv[k] };
  }).sort((a, b) => b.rarity - a.rarity || b.enh - a.enh || b.count - a.count);
}

export const totalItems = banner =>
  Object.values(S.inv[banner] || {}).reduce((a, n) => a + n, 0);
