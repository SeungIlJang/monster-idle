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

/** 로드된 이미지 또는 null(아직 로딩 중/없음) */
export function frame(group, key, anim, i) {
  const n = frameCount(group, key, anim);
  if (!n) return null;
  const idx = ((i % n) + n) % n;
  const id = `${group}/${key}/${anim}_${idx + 1}`;
  let img = cache.get(id);
  if (img === undefined) {
    img = new Image();
    img.src = new URL(`${group}/${key}/${anim}_${idx + 1}.png`, base).href;
    cache.set(id, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 해당 캐릭터의 모든 프레임을 미리 받아둔다 */
export function preload(group, key) {
  const a = MANIFEST[group]?.[key];
  if (!a) return;
  for (const anim of Object.keys(a)) for (let i = 0; i < a[anim]; i++) frame(group, key, anim, i);
}

/** 그릴 수 있는 프레임을 애니 우선순위로 찾아준다 (없으면 idle 로 폴백) */
export function pick(group, key, anim, i) {
  return frame(group, key, anim, i) || frame(group, key, 'idle', i) || null;
}
