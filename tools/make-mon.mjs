// 생성한 몬스터·동료 스프라이트를 프로젝트에 들인다.
//
//   node tools/make-mon.mjs <준비된폴더>
//   node tools/make-mon.mjs "D:/AI/workspace/game/games/output/monster-idle/sprites-v1"
//
// 준비된 폴더는 아래 모양이어야 한다 (assets/mon/prompts.json · assets/comp/prompts.json 규격):
//   assets/mon/<key>/{idle,attack,hit,dead}_1.png   — 투명 RGBA, 포즈끼리 **같은 배율·하단 기준**
//   assets/comp/<id>.png                            — 투명 RGBA
//
// 하는 일: 검사 → (너무 크면) 축소 → 복사 → 매니페스트 갱신 → defringe 건너뛰기 등록.
//
// **마지막 단계가 중요하다.** normalize-sprites 의 defringe 는 "투명 픽셀에 원본 배경색이
// 남아 있다" 는 전제로 반투명 가장자리를 역보정한다. 생성 단계에서 받은 투명 PNG 는
// 투명 픽셀이 (0,0,0) 이라 그 전제가 틀리고, 돌리면 안티에일리어싱된 가장자리를
// 검정 기준으로 밝히며 망가뜨린다. 그래서 내용 해시를 .normalized.json 에 미리 적어
// 건너뛰게 한다(box 계산은 그대로 돈다).
//
// 빌드 시점 전용 — 런타임에서는 쓰지 않는다(DESIGN.md §12).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(ROOT, 'assets');
const ANIMS = ['idle', 'attack', 'hit', 'dead'];
const MAX_MON = 320;        // 화면 표시 높이의 약 4배. 이보다 크면 줄인다
const MAX_HERO = 320;       // 보스는 더 크게 그려지지만 320 이면 충분하다
const MAX_COMP = 240;

const src = process.argv[2];
if (!src) {
  console.error('사용법: node tools/make-mon.mjs <준비된폴더>');
  process.exit(1);
}
if (!fs.existsSync(src)) {
  console.error('폴더가 없다: ' + src);
  process.exit(1);
}

const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const kb = n => (n / 1024).toFixed(0) + 'KB';

/** 박스 평균 축소. 알파도 같이 평균낸다. 확대는 하지 않는다. */
function resize(img, max) {
  const big = Math.max(img.width, img.height);
  if (big <= max) return img;
  const k = max / big;
  const W = Math.max(1, Math.round(img.width * k));
  const H = Math.max(1, Math.round(img.height * k));
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
          // RGB 는 알파 가중으로 섞어야 투명한 검정이 색을 끌어내리지 않는다
          const w = img.data[s + 3] / 255;
          r += img.data[s] * w; g += img.data[s + 1] * w; b += img.data[s + 2] * w;
          a += img.data[s + 3]; n++;
        }
      }
      const aw = a / 255;
      const d = (y * W + x) * 4;
      out[d] = aw > 0 ? r / aw : 0;
      out[d + 1] = aw > 0 ? g / aw : 0;
      out[d + 2] = aw > 0 ? b / aw : 0;
      out[d + 3] = a / n;
    }
  }
  return { width: W, height: H, data: out };
}

/** 불투명 영역 경계와 투명 비율 — 검사용 */
function inspect(img) {
  const { width: W, height: H, data: P } = img;
  let mnx = W, mny = H, mxx = -1, mxy = -1, clear = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = P[(y * W + x) * 4 + 3];
      if (a === 0) { clear++; continue; }
      if (a > 24) {
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
      }
    }
  }
  return { box: [mnx, mny, mxx, mxy], clearPct: (100 * clear) / (W * H) };
}

const stampPath = path.join(ASSETS, '.normalized.json');
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};
const manifestPath = path.join(ASSETS, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const warn = [];

function take(srcFile, destFile, max) {
  const raw = fs.readFileSync(srcFile);
  const img0 = decodePNG(raw);
  const info = inspect(img0);
  if (info.clearPct < 5) warn.push(`${path.basename(destFile)}: 투명 영역이 ${info.clearPct.toFixed(0)}% — 배경이 안 지워진 듯하다`);
  if (info.box[2] < 0) { warn.push(`${path.basename(destFile)}: 내용이 없다 — 건너뜀`); return null; }

  // 줄일 필요가 없으면 **원본 바이트를 그대로** 쓴다. png.mjs 인코더는 필터를 쓰지 않아
  // 다시 인코딩하면 오히려 커진다(슬라임 idle 77KB → 107KB).
  const big = Math.max(img0.width, img0.height);
  const img = big > max ? resize(img0, max) : img0;
  const png = big > max ? encodePNG(img) : raw;
  fs.mkdirSync(path.dirname(destFile), { recursive: true });
  fs.writeFileSync(destFile, png);
  // defringe 를 건너뛰게 등록한다 (위 주석 참고)
  stamp[path.relative(ASSETS, destFile).replaceAll('\\', '/')] = hash(png);
  // 내용 경계(캔버스 대비 비율). 렌더가 "보이는 높이" 로 그리는 기준이다 —
  // 이게 없으면 240x240 캔버스 전체를 기준으로 그려 생물이 1/3 크기로 나온다.
  const b = big > max ? inspect(img).box : info.box;
  const box = {
    x: +(b[0] / img.width).toFixed(4),
    y: +(b[1] / img.height).toFixed(4),
    w: +((b[2] - b[0] + 1) / img.width).toFixed(4),
    h: +((b[3] - b[1] + 1) / img.height).toFixed(4),
  };
  return { from: `${img0.width}x${img0.height}`, to: `${img.width}x${img.height}`, bytes: png.length, box };
}

// ── 몬스터 · 용사 ────────────────────────────────────────────
// 둘 다 <group>/<key>/<anim>_1.png 모양이라 같은 절차다.
// box 는 normalize-sprites 가 idle 기준으로 다시 계산한다. 포즈가 같은 배율로
// 그려져 있으므로 idle 의 box 를 전 포즈가 공유하는 게 맞다 — 납작한 dead 를
// 따로 재면 같은 높이로 늘어나 납작함이 사라진다.
function importGroup(group, icon, max) {
  const dir = path.join(src, 'assets', group);
  let n = 0;
  if (!fs.existsSync(dir)) return n;
  manifest[group] = manifest[group] || {};
  for (const key of fs.readdirSync(dir)) {
    const entry = {};
    const lines = [];
    for (const anim of ANIMS) {
      const f = path.join(dir, key, `${anim}_1.png`);
      if (!fs.existsSync(f)) continue;
      const r = take(f, path.join(ASSETS, group, key, `${anim}_1.png`), max);
      if (!r) continue;
      entry[anim] = 1;
      lines.push(`${anim} ${kb(r.bytes)}`);
      n++;
    }
    if (!Object.keys(entry).length) continue;
    // 매니페스트를 통째로 갈아끼운다 — 옛 프레임 수가 남으면 없는 파일을 가리킨다.
    manifest[group][key] = entry;

    // 옛 파이프라인이 남긴 프레임을 지운다. 매니페스트가 1장만 가리켜도 파일은
    // 그대로 남아 저장소와 앱 용량만 먹는다(용사 8종에서 4.2MB 중 절반이 그랬다).
    const outDir = path.join(ASSETS, group, key);
    let swept = 0;
    for (const f of fs.readdirSync(outDir)) {
      const m = /^([a-z]+)_(\d+)\.png$/.exec(f);
      if (!m) continue;
      if (entry[m[1]] && +m[2] <= entry[m[1]]) continue;      // 지금 들인 것
      fs.unlinkSync(path.join(outDir, f));
      delete stamp[`${group}/${key}/${f}`];
      swept++;
    }
    console.log(`  ${icon} ${key.padEnd(10)} ${lines.join(' · ')}` + (swept ? `  (옛 프레임 ${swept}장 정리)` : ''));
  }
  return n;
}

const monCount = importGroup('mon', '🐾', MAX_MON) + importGroup('hero', '⚔️', MAX_HERO);

// ── 동료 ─────────────────────────────────────────────────────
// 그림 파일은 companions.js 가 경로로 직접 읽지만, **내용 경계는 매니페스트에 적는다** —
// normalize-sprites 는 mon/hero 만 돌아서 comp 의 box 를 계산해 주지 않는다.
const compDir = path.join(src, 'assets', 'comp');
let compCount = 0;
if (fs.existsSync(compDir)) {
  manifest.comp = manifest.comp || {};
  for (const f of fs.readdirSync(compDir)) {
    if (!f.endsWith('.png')) continue;
    const id = f.replace('.png', '');
    const r = take(path.join(compDir, f), path.join(ASSETS, 'comp', f), MAX_COMP);
    if (!r) continue;
    manifest.comp[id] = { box: r.box };
    compCount++;
    console.log(`  🐣 ${id.padEnd(10)} ${r.to} ${kb(r.bytes)} · 내용 ${(r.box.w * 100).toFixed(0)}x${(r.box.h * 100).toFixed(0)}%`);
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 0));
console.log(`몬스터·용사 ${monCount}장 · 동료 ${compCount}장 들임`);
if (warn.length) { console.log('확인 필요:'); for (const w of warn) console.log('  ⚠ ' + w); }
console.log('다음: node tools/normalize-sprites.mjs  (box 재계산 — defringe 는 건너뛴다)');
