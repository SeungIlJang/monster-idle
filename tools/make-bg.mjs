// 생성된 배경 원본을 게임용 9:5 PNG 로 변환한다.
//   node tools/make-bg.mjs <원본경로> <zoneKey>
//   node tools/make-bg.mjs "D:/.../battle-grassland-day-v1.png" forest
//
// 하는 일: 9:5 로 크롭 → 1080x600 박스 축소 → 알파 버린 RGB + 행별 적응 필터로 재인코딩.
// 알파를 빼면 25%, 적응 필터는 평탄한 카툰 그림에서 다시 절반 넘게 줄어든다.
// 빌드 시점 전용 — 런타임에서는 쓰지 않는다(DESIGN.md §12).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decodePNG, crop } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_W = 1080, OUT_H = 600;            // 9:5, README 규격
const ASPECT = OUT_W / OUT_H;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = buf => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const chunk = (type, body) => {
  const b = Buffer.alloc(8 + body.length + 4);
  b.writeUInt32BE(body.length, 0);
  b.write(type, 4, 'ascii');
  body.copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
  return b;
};

/** 원본 비율을 유지한 채 9:5 가 되도록 잘라낸다. 가로가 남으면 가운데, 세로가 남으면 위(하늘)를 깎는다. */
function cropToAspect(img) {
  const a = img.width / img.height;
  if (Math.abs(a - ASPECT) < 1e-6) return img;
  if (a > ASPECT) {                                   // 너무 넓다 → 좌우 균등
    const w = Math.round(img.height * ASPECT);
    return crop(img, Math.round((img.width - w) / 2), 0, w, img.height);
  }
  const h = Math.round(img.width / ASPECT);           // 너무 높다 → 하늘을 깎는다
  return crop(img, 0, img.height - h, img.width, h);
}

/** 박스 평균 축소. 확대는 하지 않는다(원본이 작으면 그대로 둔다). */
function resize(img, W, H) {
  if (img.width === W && img.height === H) return img;
  const out = new Uint8Array(W * H * 4);
  const sx = img.width / W, sy = img.height / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = y0; j < y1; j++) {
        for (let i = x0; i < x1; i++) {
          const s = (j * img.width + i) * 4;
          r += img.data[s]; g += img.data[s + 1]; b += img.data[s + 2]; a += img.data[s + 3];
          n++;
        }
      }
      const d = (y * W + x) * 4;
      out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n; out[d + 3] = a / n;
    }
  }
  return { width: W, height: H, data: out };
}

/** 행마다 5개 필터를 다 해보고 절대값 합이 가장 작은 것을 고른다(PNG 표준 휴리스틱) */
function filterRows(px, W, H, CH) {
  const stride = W * CH;
  const raw = Buffer.alloc((stride + 1) * H);
  const prev = new Uint8Array(stride);
  const line = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < H; y++) {
    for (let i = 0; i < stride; i++) line[i] = px[y * stride + i];
    let bestF = 0, bestScore = Infinity;
    for (let f = 0; f <= 4; f++) {
      const o = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= CH ? line[i - CH] : 0, b = prev[i], c = i >= CH ? prev[i - CH] : 0;
        let v;
        switch (f) {
          case 0: v = line[i]; break;
          case 1: v = line[i] - a; break;
          case 2: v = line[i] - b; break;
          case 3: v = line[i] - ((a + b) >> 1); break;
          default: {
            const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
            v = line[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          }
        }
        o[i] = v & 0xff;
        score += o[i] < 128 ? o[i] : 256 - o[i];
      }
      if (score < bestScore) { bestScore = score; bestF = f; }
    }
    raw[y * (stride + 1)] = bestF;
    Buffer.from(cand[bestF].buffer, 0, stride).copy(raw, y * (stride + 1) + 1);
    prev.set(line);
  }
  return raw;
}

/**
 * 메디안 컷으로 팔레트를 뽑는다. 평탄한 카툰 그림은 원래 색 수가 적어서
 * 256색이면 하늘 그라데이션 말고는 손실이 거의 없다.
 */
function medianCut(data, N, maxColors) {
  let boxes = [[]];
  for (let p = 0; p < N; p++) boxes[0].push(p);
  const chan = (p, c) => data[p * 4 + c];
  while (boxes.length < maxColors) {
    // 가장 긴 변을 가진 상자를 쪼갠다
    let bi = -1, bLen = 0, bAxis = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      for (let c = 0; c < 3; c++) {
        let lo = 255, hi = 0;
        for (const p of boxes[i]) { const v = chan(p, c); if (v < lo) lo = v; if (v > hi) hi = v; }
        if (hi - lo > bLen) { bLen = hi - lo; bi = i; bAxis = c; }
      }
    }
    if (bi < 0 || bLen === 0) break;
    const box = boxes[bi];
    box.sort((a, b) => chan(a, bAxis) - chan(b, bAxis));
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }
  return boxes.filter(b => b.length).map(box => {
    let r = 0, g = 0, b = 0;
    for (const p of box) { r += chan(p, 0); g += chan(p, 1); b += chan(p, 2); }
    return [Math.round(r / box.length), Math.round(g / box.length), Math.round(b / box.length)];
  });
}

/** 색상타입 3(팔레트). 플로이드-스타인버그 디더링으로 하늘 밴딩을 막는다. */
function encodeIndexed(img, maxColors = 256) {
  const { width: W, height: H, data } = img;
  const N = W * H;
  const pal = medianCut(data, N, maxColors);

  // 최근접 팔레트 색 — 256색 선형 탐색이면 1080x600 에서도 1초 미만
  const nearest = (r, g, b) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const dr = r - pal[i][0], dg = g - pal[i][1], db = b - pal[i][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; bi = i; }
    }
    return bi;
  };

  const work = Float32Array.from({ length: N * 3 }, (_, i) =>
    data[((i / 3) | 0) * 4 + (i % 3)]);
  const idx = new Uint8Array(N);
  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  const spread = (p, er, eg, eb, k) => {
    if (p < 0 || p >= N) return;
    work[p * 3] += er * k; work[p * 3 + 1] += eg * k; work[p * 3 + 2] += eb * k;
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const r = clamp(work[p * 3]), g = clamp(work[p * 3 + 1]), b = clamp(work[p * 3 + 2]);
      const i = nearest(r, g, b);
      idx[p] = i;
      const er = r - pal[i][0], eg = g - pal[i][1], eb = b - pal[i][2];
      if (x + 1 < W) spread(p + 1, er, eg, eb, 7 / 16);
      if (y + 1 < H) {
        if (x > 0) spread(p + W - 1, er, eg, eb, 3 / 16);
        spread(p + W, er, eg, eb, 5 / 16);
        if (x + 1 < W) spread(p + W + 1, er, eg, eb, 1 / 16);
      }
    }
  }

  const raw = filterRows(idx, W, H, 1);
  const plte = Buffer.alloc(pal.length * 3);
  pal.forEach((c, i) => { plte[i * 3] = c[0]; plte[i * 3 + 1] = c[1]; plte[i * 3 + 2] = c[2]; });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 불투명 배경이므로 알파를 버리고 색상타입 2(RGB)로 쓴다 */
function encodeRGB(img) {
  const { width: W, height: H, data } = img;
  const px = new Uint8Array(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    px[p * 3] = data[p * 4]; px[p * 3 + 1] = data[p * 4 + 1]; px[p * 3 + 2] = data[p * 4 + 2];
  }
  const raw = filterRows(px, W, H, 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9, windowBits: 15 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [src, key] = process.argv.slice(2);
if (!src || !key) {
  console.error('사용법: node tools/make-bg.mjs <원본PNG> <zoneKey>');
  process.exit(1);
}
const balance = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/balance.json'), 'utf8'));
const zone = balance.zones.list.find(z => z.key === key);
if (!zone) {
  console.error(`zoneKey '${key}' 가 balance.json zones.list 에 없다. 가능: ` +
    balance.zones.list.map(z => z.key).join(', '));
  process.exit(1);
}

const img0 = decodePNG(fs.readFileSync(src));
const out = resize(cropToAspect(img0), OUT_W, OUT_H);

// 둘 다 만들어 보고 작은 쪽을 쓴다. 평탄한 카툰 그림은 보통 팔레트가 절반 이하로 작다.
const rgb = encodeRGB(out);
const idxPng = process.argv.includes('--rgb') ? null : encodeIndexed(out);
const useIdx = idxPng && idxPng.length < rgb.length;
const png = useIdx ? idxPng : rgb;

const dest = path.join(ROOT, 'assets/bg', `${key}.png`);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, png);

const kb = n => (n / 1024).toFixed(0) + 'KB';
console.log(`${zone.name} (${key})`);
console.log(`  ${img0.width}x${img0.height} ${kb(fs.statSync(src).size)} → ${out.width}x${out.height}`);
console.log(`  RGB ${kb(rgb.length)}` + (idxPng ? ` / 256색 ${kb(idxPng.length)}` : '') +
  `  → ${useIdx ? '256색' : 'RGB'} 채택`);
console.log(`  ${path.relative(ROOT, dest)}`);
