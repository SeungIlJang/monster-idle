// 뽑기 동료 등급 외형 들이기 (docs/comp-rarity-art-handoff.md)
//
//   node tools/make-comp-rarity.mjs <폴더> [--dry]
//
// 1) check-anim.mjs 로 검사한다 — 하나라도 틀리면 아무것도 쓰지 않고 멈춘다
// 2) 팔레트 압축 (png-quant — 256색, 평균 오차를 같이 찍는다)
// 3) comp_<id>_r<N>_idle_1.png → assets/comp/<id>_r<N>.png
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
let n = 0, before = 0, after = 0, worst = 0;
const got = new Map();                    // id → Set(등급)
for (const f of fs.readdirSync(dir).sort()) {
  const m = RE.exec(f);
  if (!m) continue;
  const [, id, r, fr] = m;
  if (!manifest.comp?.[id]) { console.log(`  건너뜀 ${f} — 매니페스트에 없는 동료`); continue; }
  const src = fs.readFileSync(path.join(dir, f));
  const img = decodePNG(src);
  const q = quantize(img);
  let out = encodeIndexed(q);
  const err = errorOf(img, q);
  if (out.length >= src.length) out = src;          // 압축이 더 크면 원본
  const rel = `comp/${id}_r${r}${fr === '2' ? '_2' : ''}.png`;
  if (!DRY) { fs.writeFileSync(path.join(ASSETS, rel), out); stamp[rel] = hash(out); }
  if (!got.has(id)) got.set(id, new Set());
  got.get(id).add(+r);
  n++; before += src.length; after += out.length; worst = Math.max(worst, err.mean);
  console.log(`  ${f} → ${rel}  ${(src.length / 1024).toFixed(0)}KB → ${(out.length / 1024).toFixed(0)}KB · 오차 ${err.mean.toFixed(2)}`);
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
