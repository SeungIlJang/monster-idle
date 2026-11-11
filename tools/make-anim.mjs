// 전투 애니메이션 프레임을 프로젝트에 들인다 (docs/anim-frames-handoff.md 의 "이쪽에서 할 일").
//
//   node tools/make-anim.mjs <준비된폴더> [--dry]
//   node tools/make-anim.mjs "D:/AI/workspace/game/games/output/monster-idle/anim-v1"
//
// 하는 일:
//   1) tools/check-anim.mjs 로 검사 — 하나라도 실패하면 아무것도 쓰지 않는다
//   2) 256색 팔레트 압축(png-quant.mjs). **테두리 정리(defringe)는 하지 않는다** — 생성 PNG 는 투명 픽셀이
//      (0,0,0) 이라 defringe 가 그걸 배경색으로 보고 반투명 가장자리를 알파로 나눠 밝은 테를 만든다
//      (make-mon-evo 주석과 같은 이유). 1차 들이기 때 실제로 장당 가장자리 1,100~1,700픽셀이 평균 60~75 밝아졌다.
//   3) 이름을 바꿔 assets 로:
//        <key>_idle_2           → <group>/<key>/<단계>idle_2.png
//        <key>_attack_windup    → <group>/<key>/<단계>attack_1.png   (준비)
//        기존 <단계>attack_1     → <group>/<key>/<단계>attack_2.png   (타격 — 옮기기만)
//        <key>_attack_follow    → <group>/<key>/<단계>attack_3.png   (마무리)
//        comp_<id>_idle_2       → comp/<id>_2.png
//   4) 매니페스트 프레임 수: 기본 단계는 항목의 idle/attack 숫자, 진화 단계는 stageFrames["t2_"] 에 적는다.
//      프레임 수가 캐릭터마다 하나였을 때 기본만 3장으로 적으면 진화 단계도 3장인 줄 알고
//      없는 t2_attack_2 를 찾다가 엉뚱한 그림으로 떨어졌다(sprites.js frameCount 주석).
//   5) normalize-sprites 의 해시 기록(assets/.normalized.json)에 결과를 적는다 — 안 적으면 그 도구를
//      다시 돌릴 때 압축본을 원본 RGBA 로 되돌려 용량이 세 배가 된다.
//
// 기존 타격 그림을 두 번 옮기지 않는다 — 매니페스트의 공격 장수가 이미 3 이면 준비·마무리만 덮어쓴다.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { decodePNG } from './png.mjs';
import { quantize, encodeIndexed, errorOf } from './png-quant.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
const DRY = args.includes('--dry');
if (!dir || !fs.existsSync(dir)) { console.log('쓰는 법: node tools/make-anim.mjs <폴더> [--dry]'); process.exit(1); }

// 1) 검사
try {
  execFileSync(process.execPath, [path.join(ROOT, 'tools', 'check-anim.mjs'), dir], { stdio: 'pipe' });
} catch (e) {
  console.log(String(e.stdout || e.message));
  console.log('검사를 통과하지 못해 아무것도 쓰지 않았습니다.');
  process.exit(1);
}

const manifestPath = path.join(ASSETS, 'manifest.json');
const stampPath = path.join(ASSETS, '.normalized.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);

const RE = /^(mon|hero|comp)_([a-z0-9]+?)(?:_(t2|t3))?_(idle_2|attack_windup|attack_follow)\.png$/;
const jobs = new Map();               // "group/key/pre" → { idle_2, attack_windup, attack_follow }
for (const f of fs.readdirSync(dir).sort()) {
  const m = RE.exec(f);
  if (!m) continue;
  const [, group, key, stage = '', fr] = m;
  const id = `${group}/${key}/${stage ? stage + '_' : ''}`;
  if (!jobs.has(id)) jobs.set(id, { group, key, pre: stage ? stage + '_' : '' });
  jobs.get(id)[fr] = path.join(dir, f);
}

let inKB = 0, outKB = 0, written = 0, worst = 0;
const log = [];
/** 원본 → 팔레트 압축 → 쓰기 (테두리 정리 없음 — 위 주석) */
function put(src, dest) {
  const buf = fs.readFileSync(src);
  const img = decodePNG(buf);
  const q = quantize(img);
  let out = encodeIndexed(q);
  const err = errorOf(img, q);
  worst = Math.max(worst, err.mean);
  inKB += buf.length / 1024; outKB += out.length / 1024; written++;
  const rel = path.relative(ASSETS, dest).replaceAll('\\', '/');
  log.push(`  ${rel.padEnd(34)} ${(buf.length / 1024).toFixed(0).padStart(4)}KB → ${(out.length / 1024).toFixed(0).padStart(3)}KB · 오차 ${err.mean.toFixed(2)}`);
  if (!DRY) { fs.writeFileSync(dest, out); stamp[rel] = hash(out); }
}
function move(from, to) {
  const a = path.relative(ASSETS, from).replaceAll('\\', '/'), b = path.relative(ASSETS, to).replaceAll('\\', '/');
  log.push(`  ${a} → ${b}  (기존 타격 그림 옮김)`);
  if (DRY) return;
  fs.renameSync(from, to);
  if (stamp[a]) { stamp[b] = stamp[a]; delete stamp[a]; }
}

for (const j of jobs.values()) {
  const entry = manifest[j.group]?.[j.key];
  if (!entry) { console.log(`매니페스트에 ${j.group}/${j.key} 가 없습니다 — 건너뜀`); continue; }
  if (j.group === 'comp') {
    put(j.idle_2, path.join(ASSETS, 'comp', `${j.key}_2.png`));
    entry.idle = 2;
    continue;
  }
  const folder = path.join(ASSETS, j.group, j.key);
  // 이 단계의 지금 프레임 수 (기본은 항목 숫자, 진화 단계는 stageFrames — 없으면 1장)
  const cur = j.pre ? { idle: 1, attack: 1, hit: 1, dead: 1, ...(entry.stageFrames?.[j.pre] || {}) } : entry;
  const counts = { idle: cur.idle, attack: cur.attack };
  if (j.idle_2) { put(j.idle_2, path.join(folder, `${j.pre}idle_2.png`)); counts.idle = Math.max(2, counts.idle); }
  if (j.attack_windup && j.attack_follow) {
    if (counts.attack === 1) move(path.join(folder, `${j.pre}attack_1.png`), path.join(folder, `${j.pre}attack_2.png`));
    put(j.attack_windup, path.join(folder, `${j.pre}attack_1.png`));
    put(j.attack_follow, path.join(folder, `${j.pre}attack_3.png`));
    counts.attack = 3;
  }
  if (j.pre) {
    entry.stageFrames = entry.stageFrames || {};
    entry.stageFrames[j.pre] = { idle: counts.idle, attack: counts.attack, hit: cur.hit ?? 1, dead: cur.dead ?? 1 };
  } else {
    entry.idle = counts.idle; entry.attack = counts.attack;
  }
}

if (!DRY) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 0));
}
console.log(log.join('\n'));
console.log(`\n${DRY ? '[시험] ' : ''}${written}장 · ${(inKB / 1024).toFixed(2)}MB → ${(outKB / 1024).toFixed(2)}MB (${(100 * outKB / Math.max(1, inKB)).toFixed(0)}%) · 최대 평균오차 ${worst.toFixed(2)}`);
if (DRY) console.log('(--dry — 파일을 쓰지 않았습니다)');
