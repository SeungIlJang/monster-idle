// 패럴랙스 배경 층 검수 — **아트 담당이 보내기 전에 직접 돌리는 용도**다.
//
//   node tools/check-bg-layers.mjs <레이어폴더>
//   node tools/check-bg-layers.mjs "D:/AI/workspace/game/games/output/monster-idle/bg-parallax-v2"
//
// v1 이 반려된 이유가 "규격은 다 맞는데 합쳐 놓으면 못 쓴다" 였다. 규격(크기·알파·위치)은
// 한 장씩 봐도 알 수 있지만 **경계가 이어지는지는 세 장을 합성해 봐야** 보인다.
// 그걸 보낼 때 확인할 방법이 없어서 30장이 통째로 되돌아갔다. 그래서 검사를 넘긴다.
//
// 판정 기준은 하나뿐이다 — 합성한 그림의 y=420 경계가 **기존 통짜 배경의 같은 자리만큼**
// 자연스러운가. 지면층이 원본의 아래쪽 절반 그대로이므로, 하늘·중경이 원본과 이어진다면
// 경계값이 원본의 경계값과 비슷해야 한다. 그게 도달 가능한 최선이고 기준이 된다.
//
// 고정 상한(처음엔 20 으로 뒀다)은 틀렸다. 통짜 배경 자체가 지역마다 4.4~23.0 이라
// ruins(20.5)·sky(23.0)는 **원본부터 20 을 넘는다.** 원본만큼 잘 만든 것을 반려하게 된다.
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG } from './png.mjs';

const W = 1080, H = 600, GROUND_Y = 420;
const LANE_BACK = 0.60, LANE_FRONT = 0.82;   // render.js 와 같아야 한다
const SLACK = 6;              // 원본 경계값에 이만큼까지는 더 벌어져도 눈에 안 띈다
const FLOOR = 20;             // 원본이 아주 매끄러운 지역(frost 4.4)에서 지나치게 빡세지 않게
const LAYERS = ['1_sky', '2_mid', '3_ground'];

const ROOT = path.resolve(import.meta.dirname, '..');
const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('사용: node tools/check-bg-layers.mjs <레이어폴더>');
  process.exit(1);
}
const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/balance.json'), 'utf8'));
const ZONES = B.zones.list.map(z => z.key);

const dist = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
/** 한 행의 픽셀 배열 */
const row = (im, y) => {
  const o = [];
  for (let x = 0; x < im.width; x++) { const s = (y * im.width + x) * 4; o.push([im.data[s], im.data[s + 1], im.data[s + 2], im.data[s + 3]]); }
  return o;
};
/** b 를 a 위에 알파 합성 */
const over = (a, b) => { const t = b[3] / 255; return [b[0] * t + a[0] * (1 - t), b[1] * t + a[1] * (1 - t), b[2] * t + a[2] * (1 - t), 255]; };
/** 두 행의 평균 색거리 */
function rowDist(p, q) {
  let s = 0;
  for (let x = 0; x < p.length; x++) s += dist(p[x], q[x]);
  return s / p.length;
}

let fail = 0, zonesOk = 0, checked = 0;
const lines = [];

for (const z of ZONES) {
  const files = LAYERS.map(L => path.join(src, `${z}_${L}.png`));
  if (!files.every(f => fs.existsSync(f))) continue;      // 안 보낸 지역은 건너뛴다
  checked++;
  const bad = [];
  const im = {};

  // ── 1. 규격 ──
  for (let i = 0; i < LAYERS.length; i++) {
    const raw = fs.readFileSync(files[i]);
    const w = raw.readUInt32BE(16), h = raw.readUInt32BE(20), ct = raw[25];
    if (w !== W || h !== H) bad.push(`${LAYERS[i]}: ${w}×${h} (≠ ${W}×${H})`);
    if (ct !== 6) bad.push(`${LAYERS[i]}: 컬러타입 ${ct} (RGBA=6 이어야 함)`);
    im[LAYERS[i]] = decodePNG(raw);
  }
  if (bad.length) { lines.push([z, null, bad]); fail++; continue; }

  // ── 2. 알파 규격 ──
  // 하늘은 전면 불투명, 중경은 y>=420 이 투명, 지면은 y<420 이 투명하고 아래는 불투명.
  // 이게 어긋나면 합성 결과가 층 순서와 달라져 경계 측정 자체가 무의미해진다.
  const opaque = (img, y0, y1) => {
    for (let y = y0; y < y1; y += 7) for (let x = 0; x < W; x += 11) if (img.data[(y * W + x) * 4 + 3] < 250) return false;
    return true;
  };
  const clear = (img, y0, y1) => {
    for (let y = y0; y < y1; y += 7) for (let x = 0; x < W; x += 11) if (img.data[(y * W + x) * 4 + 3] > 5) return false;
    return true;
  };
  if (!opaque(im['1_sky'], 0, H)) bad.push('1_sky: 전면 불투명이어야 합니다');
  if (!clear(im['2_mid'], GROUND_Y, H)) bad.push(`2_mid: y>=${GROUND_Y} 가 투명이어야 합니다`);
  if (!clear(im['3_ground'], 0, GROUND_Y)) bad.push(`3_ground: y<${GROUND_Y} 가 투명이어야 합니다`);
  if (!opaque(im['3_ground'], GROUND_Y, H)) bad.push(`3_ground: y>=${GROUND_Y} 가 불투명이어야 합니다`);

  // ── 3. 경계 (이게 본론) ──
  // 하늘+중경을 합성한 y=419 와 지면의 y=420 을 비교한다.
  // 기준은 **원본 통짜 배경의 같은 자리** 다 — 지면이 원본 그대로이므로, 하늘·중경이
  // 원본과 이어진다면 이 값이 원본값 근처로 떨어진다.
  const up = row(im['1_sky'], GROUND_Y - 1).map((c, i) => over(c, row(im['2_mid'], GROUND_Y - 1)[i]));
  const dn = row(im['3_ground'], GROUND_Y);
  const jump = rowDist(up, dn);

  // ── 4. 원본 대조 — 경계 기준값과 지면층 일치를 같이 본다 ──
  const orig = path.join(ROOT, 'assets', 'bg', `${z}.png`);
  let limit = FLOOR, ref = null;
  if (fs.existsSync(orig)) {
    const o = decodePNG(fs.readFileSync(orig));
    if (o.width === W && o.height === H) {
      ref = rowDist(row(o, GROUND_Y - 1), row(o, GROUND_Y));
      limit = Math.max(FLOOR, ref + SLACK);
      // 지면은 원본 y420~599 를 그대로 써야 한다. 어긋나면 폴백(통짜)과 패럴랙스 사이에서 튄다.
      let s = 0, n = 0;
      for (let y = GROUND_Y; y < H; y += 3) { s += rowDist(row(o, y), row(im['3_ground'], y)); n++; }
      const d = s / n;
      if (d > 12) bad.push(`지면층이 원본과 다릅니다 (평균 색차 ${d.toFixed(0)}) — 원본 y${GROUND_Y}~${H - 1} 을 그대로 쓰세요`);
    }
  }
  if (jump > limit) {
    bad.push(`경계 도약 ${jump.toFixed(0)} — 허용 ${limit.toFixed(0)}`
      + (ref === null ? '' : ` (원본 ${ref.toFixed(1)} + 여유 ${SLACK}), 원본의 ${(jump / Math.max(ref, 1)).toFixed(0)}배`));
  }

  // ── 5. 뒤쪽 레인이 밟을 바닥 ──
  // 적·동료 레인 절반은 발이 y=420 **위** 에 선다. laneY = H×(0.60+0.22d) 이고
  // 적 d=[0.04,0.16,0.34] → y 365·381·405, 동료 d=[0.12,0.30,0.41] → y 376·400·414.
  // 지면층은 y<420 이 통째로 투명하므로, 그 띠의 바닥은 중경이 맡아야 한다.
  // 비어 있으면 하늘이 보이고 캐릭터가 허공에 뜬다.
  const LANES = [0.04, 0.16, 0.34, 0.12, 0.30, 0.41]
    .map(d => Math.round(H * (LANE_BACK + d * (LANE_FRONT - LANE_BACK))))
    .filter(y => y < GROUND_Y)
    .sort((a, b) => a - b);
  const thin = [];
  for (const y of LANES) {
    let filled = 0, n = 0;
    for (let x = 0; x < W; x += 9) { n++; if (im['2_mid'].data[(y * W + x) * 4 + 3] > 200) filled++; }
    const pct = Math.round(100 * filled / n);
    if (pct < 60) thin.push(`y=${y} (${pct}%)`);
  }
  if (thin.length) {
    bad.push(`2_mid 에 뒤쪽 레인이 밟을 바닥이 없습니다 — ${thin.join(' · ')}`
      + `. 발이 뜨는 높이는 y=${LANES[0]}~${LANES[LANES.length - 1]} 입니다`);
  }

  lines.push([z, jump, bad, limit]);
  if (bad.length) fail++; else zonesOk++;
}

if (!checked) { console.log('검사할 지역이 없습니다. 파일 이름을 <zone>_1_sky.png 형태로 맞춰 주세요.'); process.exit(1); }

console.log(`지역 ${checked}개 검사\n`);
for (const [z, jump, bad, limit] of lines) {
  const head = `${z.padEnd(10)} 경계 ${jump === null ? '   —' : jump.toFixed(0).padStart(4)}`
    + (limit === undefined ? '' : ` / 허용 ${limit.toFixed(0)}`);
  console.log(bad.length ? `❌ ${head}` : `✅ ${head}`);
  for (const b of bad) console.log(`     · ${b}`);
}
console.log(`\n통과 ${zonesOk} / ${checked}` + (fail ? ` — ${fail}개 지역을 고쳐 주세요` : ' — 전부 통과했습니다. 보내 주세요.'));
process.exit(fail ? 1 : 0);
