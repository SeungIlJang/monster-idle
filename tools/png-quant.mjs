// PNG 팔레트 압축 — RGBA 를 256색(반투명 포함) 팔레트 PNG 로 줄인다.
//
//   node tools/png-quant.mjs <입력.png> [출력.png]     ← 시험용: 크기·오차만 보고, 출력 경로를 주면 쓴다
//   import { quantizePNG } from './png-quant.mjs'      ← 들이기 도구(make-anim.mjs)가 쓴다
//
// 왜 직접 만들었나. 압축 라이브러리를 들이지 않는 프로젝트라(DESIGN.md §12 — 빌드 도구는 Node 내장만)
// pngquant 를 못 쓴다. 이 게임 그림은 두꺼운 외곽선 + 플랫 셰이딩이라 색 수가 적어서
// 256색이면 눈에 띄는 손실이 거의 없다. 실측은 아래 CLI 로 본다.
//
// 방법: 완전 투명은 0번 한 칸에 몰고, 나머지는 RGBA 공간에서 중앙값 분할로 255칸을 만든 뒤
// k-평균을 두 번 돌려 다듬는다. 디더링은 하지 않는다 — 플랫 그림에 점무늬가 생긴다.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { decodePNG } from './png.mjs';

const AW = 1.6;            // 알파 차이 가중 — 가장자리 반투명이 뭉개지면 외곽선이 계단져 보인다

// ── CRC (png.mjs 와 같은 다항식) ──
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
const crc32 = buf => { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

/** 이미지(RGBA)의 고유 색과 개수. 완전 투명은 빼고 센다 */
function histogram(data) {
  const map = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const k = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
    map.set(k, (map.get(k) || 0) + 1);
  }
  const n = map.size, cols = new Uint8Array(n * 4), cnt = new Float64Array(n);
  let j = 0;
  for (const [k, c] of map) {
    cols[j * 4] = k >>> 24; cols[j * 4 + 1] = (k >>> 16) & 255; cols[j * 4 + 2] = (k >>> 8) & 255; cols[j * 4 + 3] = k & 255;
    cnt[j++] = c;
  }
  return { n, cols, cnt };
}

/** 중앙값 분할 — idx 배열(색 번호들)을 K 상자로 나눈다 */
function medianCut(h, K) {
  const all = Array.from({ length: h.n }, (_, i) => i);
  const boxes = [all];
  const stat = box => {
    let mn = [255, 255, 255, 255], mx = [0, 0, 0, 0], w = 0;
    for (const i of box) {
      for (let c = 0; c < 4; c++) { const v = h.cols[i * 4 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
      w += h.cnt[i];
    }
    const rng = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], (mx[3] - mn[3]) * AW];
    let ch = 0; for (let c = 1; c < 4; c++) if (rng[c] > rng[ch]) ch = c;
    return { ch, score: rng[ch] * Math.sqrt(w), w };
  };
  while (boxes.length < K) {
    let bi = -1, best = 0, bs = null;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const s = stat(boxes[i]);
      if (s.score > best) { best = s.score; bi = i; bs = s; }
    }
    if (bi < 0) break;
    const box = boxes[bi], ch = bs.ch;
    box.sort((a, b) => h.cols[a * 4 + ch] - h.cols[b * 4 + ch]);
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length; i++) { acc += h.cnt[box[i]]; if (acc >= bs.w / 2) { cut = Math.min(box.length - 1, Math.max(1, i + 1)); break; } }
    boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut));
  }
  return boxes;
}

const dist = (p, q, a, b) => {      // RGBA 제곱 거리 (알파 가중)
  const dr = p[a] - q[b], dg = p[a + 1] - q[b + 1], db = p[a + 2] - q[b + 2], da = (p[a + 3] - q[b + 3]) * AW;
  return dr * dr + dg * dg + db * db + da * da;
};

/**
 * RGBA → 팔레트. 돌려주는 palette 는 [r,g,b,a]*K, indices 는 픽셀마다 팔레트 번호.
 * 0번은 늘 완전 투명이다.
 */
export function quantize({ width, height, data }, maxColors = 256) {
  const h = histogram(data);
  const K = Math.min(maxColors - 1, h.n);
  const boxes = medianCut(h, K);
  let pal = new Float64Array(boxes.length * 4);
  boxes.forEach((box, b) => {
    let w = 0; const s = [0, 0, 0, 0];
    for (const i of box) { const c = h.cnt[i]; w += c; for (let k = 0; k < 4; k++) s[k] += h.cols[i * 4 + k] * c; }
    for (let k = 0; k < 4; k++) pal[b * 4 + k] = s[k] / w;
  });
  // k-평균 2회 — 중앙값 분할의 경계가 어긋난 색을 가까운 칸으로 옮긴다
  const assign = new Int32Array(h.n);
  for (let it = 0; it < 3; it++) {
    for (let i = 0; i < h.n; i++) {
      let bi = 0, bd = Infinity;
      for (let b = 0; b < boxes.length; b++) { const d = dist(h.cols, pal, i * 4, b * 4); if (d < bd) { bd = d; bi = b; } }
      assign[i] = bi;
    }
    if (it === 2) break;
    const sum = new Float64Array(pal.length), w = new Float64Array(boxes.length);
    for (let i = 0; i < h.n; i++) { const b = assign[i], c = h.cnt[i]; w[b] += c; for (let k = 0; k < 4; k++) sum[b * 4 + k] += h.cols[i * 4 + k] * c; }
    for (let b = 0; b < boxes.length; b++) if (w[b]) for (let k = 0; k < 4; k++) pal[b * 4 + k] = sum[b * 4 + k] / w[b];
  }
  // 팔레트 확정: 0번 = 투명, 나머지는 반올림. 알파가 낮은 칸을 앞에 두면 tRNS 가 짧아진다
  const order = Array.from({ length: boxes.length }, (_, b) => b).sort((a, b) => pal[a * 4 + 3] - pal[b * 4 + 3]);
  const remap = new Int32Array(boxes.length);
  const out = new Uint8Array((boxes.length + 1) * 4);          // 0번은 0,0,0,0
  order.forEach((b, j) => { remap[b] = j + 1; for (let k = 0; k < 4; k++) out[(j + 1) * 4 + k] = Math.round(pal[b * 4 + k]); });
  const key2pal = new Map();
  for (let i = 0; i < h.n; i++) {
    const k = ((h.cols[i * 4] << 24) | (h.cols[i * 4 + 1] << 16) | (h.cols[i * 4 + 2] << 8) | h.cols[i * 4 + 3]) >>> 0;
    key2pal.set(k, remap[assign[i]]);
  }
  const indices = new Uint8Array(width * height);
  for (let p = 0, i = 0; p < indices.length; p++, i += 4) {
    if (data[i + 3] === 0) { indices[p] = 0; continue; }
    const k = ((data[i] << 24) | (data[i + 1] << 16) | (data[i + 2] << 8) | data[i + 3]) >>> 0;
    indices[p] = key2pal.get(k);
  }
  return { width, height, palette: out, indices };
}

/** 팔레트 PNG (색상타입 3 + PLTE + tRNS) */
export function encodeIndexed({ width, height, palette, indices }) {
  const n = palette.length / 4;
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {                    // 필터 0 — 팔레트 그림은 필터를 안 쓰는 쪽이 작다
    raw[y * (width + 1)] = 0;
    raw.set(indices.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  }
  const chunk = (type, body) => {
    const b = Buffer.alloc(8 + body.length + 4);
    b.writeUInt32BE(body.length, 0); b.write(type, 4, 'ascii'); body.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 3; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const plte = Buffer.alloc(n * 3);
  let lastA = 0;
  for (let i = 0; i < n; i++) { plte[i * 3] = palette[i * 4]; plte[i * 3 + 1] = palette[i * 4 + 1]; plte[i * 3 + 2] = palette[i * 4 + 2]; if (palette[i * 4 + 3] < 255) lastA = i; }
  const trns = Buffer.alloc(lastA + 1);
  for (let i = 0; i <= lastA; i++) trns[i] = palette[i * 4 + 3];
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('tRNS', trns),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** RGBA 와 압축본의 차이 — 불투명 쪽 평균 오차(0~255)와 최대 오차 */
export function errorOf(img, q) {
  let sum = 0, n = 0, max = 0;
  for (let p = 0, i = 0; p < q.indices.length; p++, i += 4) {
    const a = img.data[i + 3];
    if (a === 0) continue;
    const j = q.indices[p] * 4;
    const e = (Math.abs(img.data[i] - q.palette[j]) + Math.abs(img.data[i + 1] - q.palette[j + 1])
      + Math.abs(img.data[i + 2] - q.palette[j + 2]) + Math.abs(a - q.palette[j + 3])) / 4;
    sum += e * (a / 255); n += a / 255; if (e > max) max = e;
  }
  return { mean: n ? sum / n : 0, max };
}

/** 파일 → 압축 버퍼. 결과가 원본보다 크면 원본을 그대로 돌려준다 */
export function quantizePNG(buf) {
  const img = decodePNG(buf);
  const q = quantize(img);
  const out = encodeIndexed(q);
  return { buf: out.length < buf.length ? out : buf, err: errorOf(img, q), colors: q.palette.length / 4 };
}

// ── CLI: 시험용 ──
if (process.argv[1] && process.argv[1].endsWith('png-quant.mjs')) {
  const [inp, outp] = process.argv.slice(2);
  if (!inp) { console.log('쓰는 법: node tools/png-quant.mjs <입력.png> [출력.png]'); process.exit(1); }
  const src = fs.readFileSync(inp);
  const t0 = Date.now();
  const r = quantizePNG(src);
  console.log(`${(src.length / 1024).toFixed(1)}KB → ${(r.buf.length / 1024).toFixed(1)}KB (${(100 * r.buf.length / src.length).toFixed(0)}%) · ${r.colors}색 · 평균 오차 ${r.err.mean.toFixed(2)} · 최대 ${r.err.max.toFixed(0)} · ${Date.now() - t0}ms`);
  if (outp) fs.writeFileSync(outp, r.buf);
}
