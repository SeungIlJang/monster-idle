// 스프라이트 로더. assets/manifest.json 이 "실제로 존재하는 프레임 수"를 들고 있다
// (에셋팩에 용사별로 프레임이 4~6장으로 들쭉날쭉해서, 기대값이 아니라 실측값을 써야 한다).
// 런타임 이미지 처리는 하지 않는다 — Transparent 원본을 그대로 그린다.
const res = await fetch(new URL('../assets/manifest.json', import.meta.url));
export const MANIFEST = await res.json();

const cache = new Map();
const base = new URL('../assets/', import.meta.url);

/**
 * 캔버스 대비 "캐릭터가 실제로 차지하는 영역"(0~1 비율).
 * 캔버스 크기는 같아도 캐릭터 크기는 제각각이라, 이걸 기준으로 그려야 크기가 통일된다.
 */
export const boxOf = (group, key) => MANIFEST[group]?.[key]?.box ?? { x: 0, y: 0, w: 1, h: 1 };

export function frameCount(group, key, anim) {
  return MANIFEST[group]?.[key]?.[anim] ?? 0;
}

// ── 진화 단계 ────────────────────────────────────────────────
// 레벨 마일스톤 티어(companions.js monTier)가 겉모습을 정한다.
// 마일스톤이 [10,25,50,75,100] 이라 티어는 0~5 고, 그림은 세 벌뿐이다:
//   티어 0·1 (Lv 0~24) → 기본      티어 2·3 (Lv 25~74) → t2_      티어 4·5 (Lv 75~) → t3_
// 마일스톤마다 한 벌씩 그리는 건 10종 × 6단계 = 240장이라 현실적이지 않고,
// 티어마다 3% 커지는 연출이 이미 "조금씩 자란다" 를 맡고 있어 세 벌이면 충분하다.
// **그림이 커진 게 아니라 모습만 바뀐다** — 크기 변화는 렌더러의 tierScale 가 전담한다
// (들일 때 idle 경계가 기본과 같은지 make-mon-evo.mjs 가 검사한다).
const EVO_OF_TIER = [0, 0, 2, 2, 3, 3];

/** 이 티어에 쓸 파일 접두사. 그림이 없으면 아래 단계로, 끝내 없으면 기본('')으로 내려간다 */
export function evoPrefix(group, key, tier = 0) {
  const want = EVO_OF_TIER[Math.min(tier, EVO_OF_TIER.length - 1)] || 0;
  if (!want) return '';
  const have = MANIFEST[group]?.[key]?.evo;
  if (!have) return '';
  for (let s = want; s >= 2; s--) if (have.includes(s)) return `t${s}_`;
  return '';
}

/** 지금 보이는 겉모습 단계 번호 (1 = 기본) */
export const evoStage = (group, key, tier = 0) => {
  const p = evoPrefix(group, key, tier);
  return p ? +p[1] : 1;
};

/** 다음에 모습이 바뀌는 티어. 더 없거나 그림이 없으면 0 — "언제 변하나" 를 UI 가 알려주려고 쓴다 */
export function evoNextTier(group, key, tier = 0) {
  const have = MANIFEST[group]?.[key]?.evo;
  if (!have) return 0;
  const now = EVO_OF_TIER[Math.min(tier, EVO_OF_TIER.length - 1)] || 0;
  for (let t = tier + 1; t < EVO_OF_TIER.length; t++) {
    const s = EVO_OF_TIER[t] || 0;
    if (s > now && have.includes(s)) return t;
  }
  return 0;
}

/** 로드된 이미지 또는 null(아직 로딩 중/없음) */
export function frame(group, key, anim, i, tier = 0) {
  const n = frameCount(group, key, anim);
  if (!n) return null;
  const idx = ((i % n) + n) % n;
  const name = `${evoPrefix(group, key, tier)}${anim}_${idx + 1}`;
  const id = `${group}/${key}/${name}`;
  let img = cache.get(id);
  if (img === undefined) {
    img = new Image();
    img.src = new URL(`${group}/${key}/${name}.png`, base).href;
    cache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/**
 * 해당 캐릭터의 프레임을 미리 받아둔다 — **지금 쓰는 단계만**.
 * 세 단계를 다 받으면 한 종에 12장(약 950KB)이고 동료까지 6종이면 5MB 가 넘는다.
 * 모바일 데이터로 그걸 당길 이유가 없다 — 단계는 레벨이 올라야 바뀌고, 바뀔 때 받으면 된다.
 */
export function preload(group, key, tier = 0) {
  const a = MANIFEST[group]?.[key];
  if (!a) return;
  for (const anim of Object.keys(a)) {
    if (typeof a[anim] !== 'number') continue;        // box·evo 같은 건 프레임 수가 아니다
    for (let i = 0; i < a[anim]; i++) frame(group, key, anim, i, tier);
  }
}

/**
 * 그릴 수 있는 프레임을 우선순위로 찾아준다.
 * 포즈가 없으면 idle, 진화 그림이 아직 안 받아졌으면 기본 단계로 내려간다 —
 * 그래야 레벨이 오른 직후 한 프레임도 빈 화면이 되지 않고 받아지는 대로 바뀐다.
 */
export function pick(group, key, anim, i, tier = 0) {
  return frame(group, key, anim, i, tier) || frame(group, key, 'idle', i, tier)
      || (tier ? pick(group, key, anim, i, 0) : null);
}
