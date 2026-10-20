// 최소 PNG 디코더/인코더 (node:zlib 만 사용, 외부 의존성 없음).
// 빌드 시점 스프라이트 가공 전용 — 런타임에서는 절대 쓰지 않는다(DESIGN.md §12).
// 지원: 8비트, 색상타입 0(회색)/2(RGB)/4(회색+A)/6(RGBA), 비인터레이스.
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** @returns {{width:number,height:number,data:Uint8Array}} data 는 RGBA */
export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 아님');
  let pos = 8, ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0), height: body.readUInt32BE(4),
        depth: body[8], color: body[9], interlace: body[12],
      };
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error('IHDR 없음');
  if (ihdr.depth !== 8) throw new Error('8비트만 지원 (depth=' + ihdr.depth + ')');
  if (ihdr.interlace) throw new Error('인터레이스 미지원');

  const CH = { 0: 1, 2: 3, 4: 2, 6: 4 }[ihdr.color];
  if (!CH) throw new Error('색상타입 ' + ihdr.color + ' 미지원');

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { width: W, height: H } = ihdr;
  const stride = W * CH;
  const out = new Uint8Array(W * H * 4);
  const line = new Uint8Array(stride);
  const prev = new Uint8Array(stride);
  let rp = 0;

  for (let y = 0; y < H; y++) {
    const filter = raw[rp++];
    for (let i = 0; i < stride; i++) line[i] = raw[rp + i];
    rp += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= CH ? line[i - CH] : 0;
      const b = prev[i];
      const c = i >= CH ? prev[i - CH] : 0;
      let v = line[i];
      switch (filter) {
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < W; x++) {
      const s = x * CH, d = (y * W + x) * 4;
      if (CH === 1) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = 255; }
      else if (CH === 2) { out[d] = out[d + 1] = out[d + 2] = line[s]; out[d + 3] = line[s + 1]; }
      else if (CH === 3) { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = 255; }
      else { out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3]; }
    }
    prev.set(line);
  }
  return { width: W, height: H, data: out };
}

export function encodePNG({ width, height, data }) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;                               // 필터 none
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride)
      .copy(raw, y * (stride + 1) + 1);
  }
  const chunk = (type, body) => {
    const b = Buffer.alloc(8 + body.length + 4);
    b.writeUInt32BE(body.length, 0);
    b.write(type, 4, 'ascii');
    body.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + body.length)), 8 + body.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** 사각 영역 잘라내기 */
export function crop(img, x0, y0, w, h) {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4, d = (y * w + x) * 4;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1];
      out[d + 2] = img.data[s + 2]; out[d + 3] = img.data[s + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * 테두리에서 연결된 밝은 배경만 투명하게 만든다.
 * 전역 "흰색 제거"를 쓰면 해골처럼 흰 캐릭터가 지워지므로 flood-fill 이어야 한다.
 */
export function floodClearBG(img, thresh = 226) {
  const { width: W, height: H, data: P } = img;
  const N = W * H;
  const bg = new Uint8Array(N);
  const st = new Int32Array(N);
  let top = 0;
  const bright = p => Math.min(P[p * 4], P[p * 4 + 1], P[p * 4 + 2]) >= thresh || P[p * 4 + 3] < 16;
  const seed = p => { if (!bg[p] && bright(p)) { bg[p] = 1; st[top++] = p; } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (top) {
    const q = st[--top], qx = q % W, qy = (q / W) | 0;
    if (qx > 0) seed(q - 1);
    if (qx < W - 1) seed(q + 1);
    if (qy > 0) seed(q - W);
    if (qy < H - 1) seed(q + W);
  }
  for (let p = 0; p < N; p++) if (bg[p]) P[p * 4 + 3] = 0;
  return img;
}

/**
 * 테두리에서 시작해 "이웃 픽셀과 색이 비슷하면" 배경으로 간주하며 번져나간다.
 * 밝기 임계값과 달리 그라데이션 배경을 따라가되 캐릭터 경계(색 급변)에서 멈춘다.
 * 배경이 흰색이 아닌 시트(어두운 갈색 등)에 쓴다.
 */
export function floodClearGradient(img, tol = 34) {
  const { width: W, height: H, data: P } = img;
  const N = W * H;
  const bg = new Uint8Array(N);
  const st = new Int32Array(N);
  const TOL2 = tol * tol;
  let top = 0;
  const push = p => { if (!bg[p]) { bg[p] = 1; st[top++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  const near = (a, b) => {
    const i = a * 4, j = b * 4;
    const dr = P[i] - P[j], dg = P[i + 1] - P[j + 1], db = P[i + 2] - P[j + 2];
    return dr * dr + dg * dg + db * db < TOL2;
  };
  while (top) {
    const q = st[--top], qx = q % W, qy = (q / W) | 0;
    const grow = r => { if (!bg[r] && near(q, r)) push(r); };
    if (qx > 0) grow(q - 1);
    if (qx < W - 1) grow(q + 1);
    if (qy > 0) grow(q - W);
    if (qy < H - 1) grow(q + W);
  }
  for (let p = 0; p < N; p++) if (bg[p]) P[p * 4 + 3] = 0;
  return img;
}

/** 불투명 영역에 딱 맞게 잘라낸다 */
export function trim(img, pad = 1) {
  const { width: W, height: H, data: P } = img;
  let mnx = W, mny = H, mxx = -1, mxy = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (P[(y * W + x) * 4 + 3] > 24) {
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
      }
    }
  }
  if (mxx < mnx) return img;
  mnx = Math.max(0, mnx - pad); mny = Math.max(0, mny - pad);
  mxx = Math.min(W - 1, mxx + pad); mxy = Math.min(H - 1, mxy + pad);
  return crop(img, mnx, mny, mxx - mnx + 1, mxy - mny + 1);
}

/**
 * 가장자리 검은 테두리(매트 프린지)를 없앤다.
 *
 * 에셋팩의 Transparent 변형은 알파만 0 으로 만들고 **RGB 는 원본 배경색(어두운 회색)을
 * 그대로 남겨둔다.** 캔버스 drawImage 는 비프리멀티플라이드 이미지의 RGB 와 알파를 따로
 * 보간하므로, 조금이라도 축소/확대하면 캐릭터 가장자리가 그 어두운 RGB 와 섞여
 * 검은 띠가 생긴다. 어두운 배경 위에서는 안 보이다가 밝은 배경을 깔면 드러난다.
 *
 * 두 단계로 푼다:
 *  1) 반투명 픽셀 언매트 — 저장된 색은 C = Cfg·α + Cbg·(1-α) 이므로 Cfg 로 되돌린다.
 *  2) 알파 블리딩 — 투명 픽셀의 RGB 를 이웃한 불투명 색으로 덮는다. 알파는 0 그대로라
 *     보이지는 않지만, 보간이 끌어오는 색이 검정이 아니라 캐릭터 색이 된다.
 */
export function defringe(img, { bleed = 4 } = {}) {
  const { width: W, height: H, data: P } = img;
  const N = W * H;

  // 완전 투명 픽셀에 남아 있는 색이 곧 원본 배경색이다
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let p = 0; p < N; p++) {
    if (P[p * 4 + 3] === 0) { br += P[p * 4]; bg += P[p * 4 + 1]; bb += P[p * 4 + 2]; bn++; }
  }
  if (!bn) return img;
  br /= bn; bg /= bn; bb /= bn;

  const clamp = v => (v < 0 ? 0 : v > 255 ? 255 : v);
  for (let p = 0; p < N; p++) {
    const a = P[p * 4 + 3];
    if (a === 0 || a === 255) continue;
    const f = a / 255, inv = 1 - f;
    P[p * 4] = clamp((P[p * 4] - br * inv) / f);
    P[p * 4 + 1] = clamp((P[p * 4 + 1] - bg * inv) / f);
    P[p * 4 + 2] = clamp((P[p * 4 + 2] - bb * inv) / f);
  }

  // 알파 블리딩: 불투명 영역에서 바깥으로 색을 번지게 한다
  const known = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (P[p * 4 + 3] > 0) known[p] = 1;
  for (let pass = 0; pass < bleed; pass++) {
    const add = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (known[p]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        const take = q => { if (known[q]) { r += P[q * 4]; g += P[q * 4 + 1]; b += P[q * 4 + 2]; n++; } };
        if (x > 0) take(p - 1);
        if (x < W - 1) take(p + 1);
        if (y > 0) take(p - W);
        if (y < H - 1) take(p + W);
        if (n) add.push([p, r / n, g / n, b / n]);
      }
    }
    if (!add.length) break;
    for (const [p, r, g, b] of add) {
      P[p * 4] = r; P[p * 4 + 1] = g; P[p * 4 + 2] = b; known[p] = 1;
    }
  }
  return img;
}

/** 가장 큰 연결 덩어리만 남긴다 (옆 칸에서 딸려온 조각 제거) */
export function keepLargestBlob(img) {
  const { width: W, height: H, data: P } = img;
  const N = W * H;
  const comp = new Int32Array(N).fill(-1);
  const st = new Int32Array(N);
  const solid = p => P[p * 4 + 3] > 24;
  let best = -1, bestSize = 0, cid = 0;
  for (let p = 0; p < N; p++) {
    if (!solid(p) || comp[p] >= 0) continue;
    let top = 0, size = 0;
    st[top++] = p; comp[p] = cid;
    while (top) {
      const q = st[--top], qx = q % W, qy = (q / W) | 0;
      size++;
      const push = r => { if (solid(r) && comp[r] < 0) { comp[r] = cid; st[top++] = r; } };
      if (qx > 0) push(q - 1);
      if (qx < W - 1) push(q + 1);
      if (qy > 0) push(q - W);
      if (qy < H - 1) push(q + W);
    }
    if (size > bestSize) { bestSize = size; best = cid; }
    cid++;
  }
  if (best < 0) return img;
  for (let p = 0; p < N; p++) if (comp[p] !== best) P[p * 4 + 3] = 0;
  return img;
}
