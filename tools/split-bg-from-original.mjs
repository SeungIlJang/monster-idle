// 원본 통짜 배경(assets/bg/<zone>.png)에서 패럴랙스 3층을 "분해"한다.
//   node tools/split-bg-from-original.mjs [출력폴더] [zoneKey ...]
//
// 재요청서(docs/parallax-rerequest.md) 핵심:
//   - 하늘·중경도 원본에서 떠와야 경계가 구조적으로 맞는다(생성 금지).
//   - _2_mid 의 y≈360~419 에 원근 지면을 포함해 뒤쪽 레인 바닥을 만든다.
//   - check-bg-layers.mjs 를 통과해야 한다.
//
// 분해 규칙:
//   _1_sky    : 원본 전체(전면 불투명). 뒤에 깔리므로 원본 그대로가 가장 안전.
//   _2_mid    : 원본의 y<420 을 불투명으로, y>=420 은 투명.
//               → sky 위에 얹으면 y<420 합성 결과가 원본과 동일 → 경계가 원본값에 수렴.
//               → y360~419 도 불투명이라 뒤쪽 레인 바닥이 자동 확보된다.
//   _3_ground : 원본의 y>=420 을 불투명으로, y<420 은 투명.
//
// 깊이감(패럴랙스)은 런타임의 층별 스크롤 속도차(0.15 / 0.45 / 1.0)로 생긴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1080, H = 600, GROUND_Y = 420;

const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/balance.json'), 'utf8'));
const ZONES = B.zones.list.map(z => z.key);

const args = process.argv.slice(2);
const outDir = args[0] && !ZONES.includes(args[0])
  ? args[0]
  : path.join(ROOT, 'games-out-bg-parallax-v2');
const only = args.filter(a => ZONES.includes(a));
fs.mkdirSync(outDir, { recursive: true });

function newImg() {
  return { width: W, height: H, data: new Uint8Array(W * H * 4) };
}

// src 의 [y0,y1) 행을 dst 로 복사하고 알파를 a 로 설정. 그 밖은 투명(0) 유지.
function bandCopy(src, y0, y1, a) {
  const dst = newImg();
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < W; x++) {
      const s = (y * W + x) * 4;
      dst.data[s] = src.data[s];
      dst.data[s + 1] = src.data[s + 1];
      dst.data[s + 2] = src.data[s + 2];
      dst.data[s + 3] = a;
    }
  }
  return dst;
}

// sky: 원본 전체, 전면 불투명
function makeSky(src) {
  const dst = newImg();
  for (let p = 0; p < W * H; p++) {
    dst.data[p * 4] = src.data[p * 4];
    dst.data[p * 4 + 1] = src.data[p * 4 + 1];
    dst.data[p * 4 + 2] = src.data[p * 4 + 2];
    dst.data[p * 4 + 3] = 255;
  }
  return dst;
}

let done = 0, skipped = [];
for (const zone of ZONES) {
  if (only.length && !only.includes(zone)) continue;
  const orig = path.join(ROOT, 'assets', 'bg', `${zone}.png`);
  if (!fs.existsSync(orig)) { skipped.push(zone); continue; }
  const im = decodePNG(fs.readFileSync(orig));
  if (im.width !== W || im.height !== H) {
    console.error(`  ${zone}: ${im.width}x${im.height} — 1080x600 아님, 건너뜀`);
    skipped.push(zone); continue;
  }
  const sky = makeSky(im);
  const mid = bandCopy(im, 0, GROUND_Y, 255);        // y<420 불투명, 나머지 투명
  const ground = bandCopy(im, GROUND_Y, H, 255);     // y>=420 불투명, 나머지 투명

  fs.writeFileSync(path.join(outDir, `${zone}_1_sky.png`), encodePNG(sky));
  fs.writeFileSync(path.join(outDir, `${zone}_2_mid.png`), encodePNG(mid));
  fs.writeFileSync(path.join(outDir, `${zone}_3_ground.png`), encodePNG(ground));
  done++;
  console.log(`  ${zone.padEnd(9)} 분해 완료`);
}

if (skipped.length) console.log(`\n  건너뜀(원본 없음): ${skipped.join(', ')}`);
console.log(`\n${done}개 지역 분해 → ${path.relative(ROOT, outDir)}`);
