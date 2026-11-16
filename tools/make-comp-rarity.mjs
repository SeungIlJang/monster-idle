// 뽑기 동료 그림 들이기 — 등급 외형(docs/comp-rarity-art-handoff.md) · 새 동료(docs/comp-new-kinds-handoff.md)
//
//   node tools/make-comp-rarity.mjs <폴더> [--dry]
//
// 1) check-anim.mjs 로 검사한다 — 하나라도 틀리면 아무것도 쓰지 않고 멈춘다
// 2) 팔레트 압축 (png-quant — 256색, 평균 오차를 같이 찍는다)
// 3) **새 동료 기본 그림**(게임에 아직 없는 키만):
//    comp_<id>_idle_1.png → assets/comp/<id>.png   · 매니페스트 comp.<id> = { box, idle: 2 }
//    comp_<id>_idle_2.png → assets/comp/<id>_2.png
//    키는 src/gacha.js 의 CATALOG.comp 에 있어야 한다 — 매니페스트에 올라가는 순간 뽑기에 섞이고
//    (gacha.pullable) 시뮬의 동료 종류 수도 늘어나므로(design-sim COMP_KINDS), 게임이 모르는 키는 막는다.
//    comp_<id>_r<N>_idle_1.png → assets/comp/<id>_r<N>.png
//    comp_<id>_r<N>_idle_2.png → assets/comp/<id>_r<N>_2.png
// 4) 매니페스트 comp.<id>.rar 에 받은 등급을 적는다. sprites.rarSuffix 가 이걸 보고
//    **자기 등급 이하에서 가장 높은 변형**을 고른다(신화인데 r4 가 없으면 r3 → r2 → 기본).
//    적어 두지 않은 등급은 찾지 않는다 — 없는 파일을 매번 요청해 404 를 쌓지 않으려는 것이다.
// 5) assets/.normalized.json 에 해시를 적는다 — 안 적으면 normalize-sprites 를 다시 돌릴 때
//    압축본을 원본 RGBA 로 되돌려 용량이 세 배가 된다(make-anim.mjs 와 같은 이유).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decodePNG } from './png.mjs';
import { quantize, encodeIndexed, errorOf } from './png-quant.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const dir = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!dir || !fs.existsSync(dir)) { console.log('쓰는 법: node tools/make-comp-rarity.mjs <폴더> [--dry]'); process.exit(1); }

// 1) 검사 — 실패하면 check-anim 이 exit 1 을 낸다
try {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'check-anim.mjs'), dir], { stdio: 'pipe' });
} catch (e) {
  console.log(String(e.stdout || e.message));
  console.log('❌ 검사에서 걸렸다 — 아무것도 쓰지 않았다');
  process.exit(1);
}

const manifestPath = path.join(ASSETS, 'manifest.json');
const stampPath = path.join(ASSETS, '.normalized.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);

const RE = /^comp_([a-z0-9]+?)_r([234])_idle_([12])\.png$/;
const RE_BASE = /^comp_([a-z0-9]+?)_idle_([12])\.png$/;
let n = 0, before = 0, after = 0, worst = 0;
const got = new Map();                    // id → Set(등급)
const files = fs.readdirSync(dir).sort();

/** 압축해서 assets/<rel> 로 쓴다 */
function put(f, rel) {
  const src = fs.readFileSync(path.join(dir, f));
  const img = decodePNG(src);
  const q = quantize(img);
  let out = encodeIndexed(q);
  const err = errorOf(img, q);
  if (out.length >= src.length) out = src;          // 압축이 더 크면 원본
  if (!DRY) { fs.writeFileSync(path.join(ASSETS, rel), out); stamp[rel] = hash(out); }
  n++; before += src.length; after += out.length; worst = Math.max(worst, err.mean);
  console.log(`  ${f} → ${rel}  ${(src.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB · 오차 ${err.mean.toFixed(2)}`);
  return img;
}

// 새 동료 기본 그림 먼저 — 등급 외형이 매니페스트 항목을 필요로 한다
const catalogSrc = fs.readFileSync(path.join(ROOT, 'src', 'gacha.js'), 'utf8');
const compBlock = catalogSrc.slice(catalogSrc.indexOf('comp: ['), catalogSrc.indexOf('],', catalogSrc.indexOf('comp: [')));
const added = [];
const had = new Set(Object.keys(manifest.comp || {}));   // 이번에 들이기 **전에** 있던 동료 — idle_1 을 넣은 직후 idle_2 가 막히지 않게
for (const f of files) {
  const m = RE_BASE.exec(f);
  if (!m) continue;
  const [, id, fr] = m;
  if (had.has(id)) { console.log(`  건너뜀 ${f} — 이미 있는 동료 (기본 그림은 바꾸지 않는다)`); continue; }
  if (!compBlock.includes(`id: '${id}'`)) {
    console.log(`❌ ${f} — src/gacha.js CATALOG.comp 에 '${id}' 가 없다. 게임이 모르는 동료를 매니페스트에 올리면 시뮬 종류 수만 늘어난다 — 아무것도 쓰지 않았다`);
    process.exit(1);
  }
  const img = put(f, `comp/${id}${fr === '2' ? '_2' : ''}.png`);
  if (fr === '1') {
    // 내용 경계(make-mon.mjs 와 같은 식) — 렌더가 이걸로 크기를 맞춘다
    const { width: W, height: H, data: P } = img;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (P[(y * W + x) * 4 + 3] > 24) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const r4 = v => +v.toFixed(4);
    manifest.comp ||= {};
    manifest.comp[id] = { box: { x: r4(x0 / W), y: r4(y0 / H), w: r4((x1 - x0 + 1) / W), h: r4((y1 - y0 + 1) / H) }, idle: 2 };
    added.push(id);
  }
}

for (const f of files) {
  const m = RE.exec(f);
  if (!m) continue;
  const [, id, r, fr] = m;
  if (!manifest.comp?.[id]) { console.log(`  건너뜀 ${f} — 매니페스트에 없는 동료`); continue; }
  put(f, `comp/${id}_r${r}${fr === '2' ? '_2' : ''}.png`);
  if (!got.has(id)) got.set(id, new Set());
  got.get(id).add(+r);
}
for (const [id, set] of got) {
  const prev = manifest.comp[id].rar || [];
  manifest.comp[id].rar = [...new Set([...prev, ...set])].sort((a, b) => a - b);
}
if (!DRY) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 0));
}
console.log(`\n${DRY ? '(시험) ' : ''}${n}장 · ${(before / 1048576).toFixed(2)}MB → ${(after / 1048576).toFixed(2)}MB (${before ? Math.round(100 * after / before) : 0}%) · 평균 오차 최대 ${worst.toFixed(2)}/255`);
for (const [id] of got) console.log(`  comp.${id}.rar = ${JSON.stringify(manifest.comp[id].rar)}`);
if (added.length) {
  console.log(`\n새 동료 ${added.length}종: ${added.join(', ')} — 이제 뽑기에 섞인다(gacha.pullable). 동료 ${Object.keys(manifest.comp).length}종`);
  console.log('다음: npm run sim 으로 종류가 늘어난 만큼 확인 (6 → 8종이면 30일 최고 약 −0.9%)');
}
