// 패럴랙스 배경 층을 게임 에셋으로 옮긴다.
//   node tools/make-bg-layers.mjs <원본폴더> [zoneKey ...]
//   node tools/make-bg-layers.mjs "D:/.../bg-parallax-v1"
//
// 아트 담당이 주는 것은 지역당 3장(1080×600 RGBA):
//   <zone>_1_sky.png     전면 불투명 — 알파가 필요 없다
//   <zone>_2_mid.png     y>=420 투명
//   <zone>_3_ground.png  y<420 투명, 아래는 불투명
//
// 하늘은 **알파를 버린다.** 전면 불투명이라 알파 채널이 1바이트/픽셀을 그냥 먹는다
// (10장에서 6.76MB → 2MB 대). 나머지 둘은 알파가 필요하므로 RGBA 로 두되
// png.mjs 의 행별 적응 필터로 다시 압축한다.
//
// 빌드 시점 전용 — 런타임에서는 쓰지 않는다(DESIGN.md §12).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = 1080, H = 600, GROUND_Y = 420;
const LAYERS = ['1_sky', '2_mid', '3_ground'];

const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/balance.json'), 'utf8'));
const ZONES = B.zones.list.map(z => z.key);

const [src, ...only] = process.argv.slice(2);
if (!src) { console.error('사용: node tools/make-bg-layers.mjs <원본폴더> [zoneKey ...]'); process.exit(1); }

// ── RGB 인코딩 (알파를 버린다) ───────────────────────────────
const CRC = (() => { const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(buf) { let c = -1; for (const b of buf) c = (c >>> 8) ^ CRC[(c ^ b) & 0xff]; return (c ^ -1) >>> 0; }
function chunk(type, body) {
  const b = Buffer.alloc(8 + body.length + 4);
  b.writeUInt32BE(body.length, 0); b.write(type, 4, 'ascii'); body.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
  return b;
}
function encodeRGB({ width, height, data }) {
  const px = new Uint8Array(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    px[p * 3] = data[p * 4]; px[p * 3 + 1] = data[p * 4 + 1]; px[p * 3 + 2] = data[p * 4 + 2];
  }
  // filterRows 는 png.mjs 안에 있으므로 여기서는 RGBA 로 인코딩한 뒤 쓰지 않는다 —
  // 대신 encodePNG 와 같은 필터를 쓰기 위해 4채널로 만들었다가 3채널로 내보낸다.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  const prev = new Uint8Array(stride), line = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < height; y++) {
    for (let i = 0; i < stride; i++) line[i] = px[y * stride + i];
    let bestF = 0, best = Infinity;
    for (let f = 0; f <= 4; f++) {
      const o = cand[f]; let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 3 ? line[i - 3] : 0, b = prev[i], c = i >= 3 ? prev[i - 3] : 0;
        let v;
        switch (f) {
          case 0: v = line[i]; break;
          case 1: v = line[i] - a; break;
          case 2: v = line[i] - b; break;
          case 3: v = line[i] - ((a + b) >> 1); break;
          default: { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
        }
        o[i] = v & 0xff; score += o[i] < 128 ? o[i] : 256 - o[i];
      }
      if (score < best) { best = score; bestF = f; }
    }
    raw[y * (stride + 1)] = bestF;
    Buffer.from(cand[bestF].buffer, 0, stride).copy(raw, y * (stride + 1) + 1);
    prev.set(line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}


// ── 256색 팔레트 + tRNS (알파를 살린 양자화) ─────────────────
// 기존 make-bg 의 양자화기는 RGB 전용이다. 중경·지면은 실루엣 가장자리에 부분 투명이
// 10.3% 나 있어 이진 투명으로 깎으면 테두리가 깨진다. 그래서 (r,g,b,a) 4차원으로 자르고
// 알파가 255 미만인 항목을 앞으로 모아 tRNS 로 내보낸다 — PNG 의 tRNS 는 팔레트
// **앞쪽 N개**의 알파만 담기 때문이다.
function medianCut4(data, N, maxColors) {
  let boxes = [[]];
  for (let p = 0; p < N; p++) boxes[0].push(p);
  const ch = (p, c) => data[p * 4 + c];
  while (boxes.length < maxColors) {
    let bi = -1, bLen = 0, bAxis = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      for (let c = 0; c < 4; c++) {
        let lo = 255, hi = 0;
        for (const p of boxes[i]) { const v = ch(p, c); if (v < lo) lo = v; if (v > hi) hi = v; }
        // 알파 축을 과하게 쳐준다. 투명과 불투명이 한 상자에 섞이면 가장자리가 번진다.
        const len = (hi - lo) * (c === 3 ? 3 : 1);
        if (len > bLen) { bLen = len; bi = i; bAxis = c; }
      }
    }
    if (bi < 0 || bLen === 0) break;
    const box = boxes[bi];
    box.sort((a, b) => ch(a, bAxis) - ch(b, bAxis));
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter(b => b.length).map(box => {
    let r = 0, g = 0, b = 0, a = 0;
    for (const p of box) { r += ch(p, 0); g += ch(p, 1); b += ch(p, 2); a += ch(p, 3); }
    const n = box.length;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n), Math.round(a / n)];
  });
}

function encodeIndexedRGBA(img, maxColors = 256) {
  const { width: Wi, height: Hi, data } = img;
  const N = Wi * Hi;
  let pal = medianCut4(data, N, maxColors);
  // tRNS 는 팔레트 앞쪽만 덮는다 → 반투명 항목을 앞으로 모은다
  pal.sort((x, y) => x[3] - y[3]);
  const trnsLen = pal.findIndex(c => c[3] === 255) < 0 ? pal.length : pal.findIndex(c => c[3] === 255);

  const nearest = (r, g, b, a) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2], da = (a - pal[i][3]) * 3;
      const d = dr * dr + dg * dg + db * db + da * da;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };
  // 디더링은 RGB 에만 건다. 알파까지 흩으면 투명 영역에 점이 생긴다.
  const work = new Float32Array(N * 3);
  for (let p = 0; p < N; p++) { work[p*3] = data[p*4]; work[p*3+1] = data[p*4+1]; work[p*3+2] = data[p*4+2]; }
  const idx = new Uint8Array(N);
  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  const spread = (p, er, eg, eb, k) => {
    if (p < 0 || p >= N) return;
    work[p*3] += er*k; work[p*3+1] += eg*k; work[p*3+2] += eb*k;
  };
  for (let y = 0; y < Hi; y++) for (let x = 0; x < Wi; x++) {
    const p = y * Wi + x;
    const r = clamp(work[p*3]), g = clamp(work[p*3+1]), b = clamp(work[p*3+2]);
    const a = data[p*4+3];
    const i = nearest(r, g, b, a);
    idx[p] = i;
    if (a === 0) continue;                       // 완전 투명 화소는 오차를 퍼뜨리지 않는다
    const er = r - pal[i][0], eg = g - pal[i][1], eb = b - pal[i][2];
    if (x + 1 < Wi) spread(p + 1, er, eg, eb, 7/16);
    if (y + 1 < Hi) {
      if (x > 0) spread(p + Wi - 1, er, eg, eb, 3/16);
      spread(p + Wi, er, eg, eb, 5/16);
      if (x + 1 < Wi) spread(p + Wi + 1, er, eg, eb, 1/16);
    }
  }
  const stride = Wi;
  const raw = Buffer.alloc((stride + 1) * Hi);
  for (let y = 0; y < Hi; y++) {                 // 팔레트 인덱스는 필터 none 이 가장 잘 줄어든다
    raw[y * (stride + 1)] = 0;
    Buffer.from(idx.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const plte = Buffer.alloc(pal.length * 3);
  pal.forEach((c, i) => { plte[i*3] = c[0]; plte[i*3+1] = c[1]; plte[i*3+2] = c[2]; });
  const trns = Buffer.from(pal.slice(0, trnsLen).map(c => c[3]));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(Wi, 0); ihdr.writeUInt32BE(Hi, 4);
  ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', plte),
    ...(trnsLen ? [chunk('tRNS', trns)] : []),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const kb = n => (n / 1024).toFixed(0) + 'KB';
const outDir = path.join(ROOT, 'assets/bg/layers');
fs.mkdirSync(outDir, { recursive: true });

let inBytes = 0, outBytes = 0, done = 0, skipped = [];
for (const zone of ZONES) {
  if (only.length && !only.includes(zone)) continue;
  const have = LAYERS.every(l => fs.existsSync(path.join(src, `${zone}_${l}.png`)));
  if (!have) { skipped.push(zone); continue; }

  const line = [];
  for (const l of LAYERS) {
    const file = path.join(src, `${zone}_${l}.png`);
    const img = decodePNG(fs.readFileSync(file));
    if (img.width !== W || img.height !== H) throw new Error(`${zone}_${l}: ${img.width}×${img.height} — 1080×600 이어야 한다`);

    // 규격 검사. 여기서 걸러야 게임에서 하늘이 흙을 뚫고 보이는 식으로 뒤늦게 터지지 않는다.
    let badAbove = 0, badBelow = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x += 3) {
      const a = img.data[(y * W + x) * 4 + 3];
      if (l === '1_sky' && a !== 255) badAbove++;
      if (l === '2_mid' && y >= GROUND_Y && a > 0) badBelow++;
      if (l === '3_ground') { if (y < GROUND_Y && a > 0) badAbove++; if (y >= GROUND_Y && a !== 255) badBelow++; }
    }
    if (badAbove || badBelow) throw new Error(`${zone}_${l}: 알파 규격 위반 (위 ${badAbove} · 아래 ${badBelow})`);

    // 하늘은 전면 불투명이라 알파를 버린다. 나머지는 팔레트+tRNS 와 무손실 RGBA 중 작은 쪽.
    // 셋 다 후보를 재 보고 가장 작은 걸 쓴다.
    // 하늘은 전면 불투명이라 encodeIndexedRGBA 가 알아서 tRNS 없이 내보낸다(모든 항목 a=255).
    const cands = [encodeIndexedRGBA(img)];
    cands.push(l === '1_sky' ? encodeRGB(img) : encodePNG(img));
    const png = cands.reduce((a, b) => (a.length <= b.length ? a : b));
    fs.writeFileSync(path.join(outDir, `${zone}_${l}.png`), png);
    inBytes += fs.statSync(file).size; outBytes += png.length;
    line.push(`${l} ${kb(png.length)}`);
  }
  done++;
  console.log(`  ${zone.padEnd(9)} ${line.join(' · ')}`);
}

if (skipped.length) console.log(`\n  건너뜀(층 없음): ${skipped.join(', ')} — 통짜 배경으로 폴백된다`);
console.log(`\n${done}개 지역 · ${kb(inBytes)} → ${kb(outBytes)} (${(100 - outBytes / inBytes * 100).toFixed(0)}% 절감)`);
console.log(`  ${path.relative(ROOT, outDir)}`);
