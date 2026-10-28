// 진화 단계(2·3단계) 몬스터 그림을 프로젝트에 들인다.
//
//   node tools/make-mon-evo.mjs <준비된폴더>
//   node tools/make-mon-evo.mjs "D:/AI/workspace/game/games/output/monster-idle/mon-evo-v1"
//
// 준비된 폴더 모양:  <key>_t2_<pose>.png · <key>_t3_<pose>.png   (pose = idle/attack/hit/dead)
// 들어가는 곳:       assets/mon/<key>/t2_<pose>_1.png            (기본 그림은 건드리지 않는다)
//
// **make-mon.mjs 를 쓰지 않는 이유.** 저쪽은 `manifest[group][key] = entry` 로 항목을
// 통째로 갈아끼우고, 들이지 않은 파일을 쓸어낸다. 진화 그림을 넣은 뒤 기본 그림을 다시
// 들이면 `evo` 표시가 사라져 2·3단계가 통째로 폴백된다. 그래서 따로 둔다.
//
// 검사가 이 도구의 본론이다. 발 위치가 1px 만 어긋나도 레벨이 오르는 순간 캐릭터가
// 떠 보이고, 캔버스 안에서 그림이 커져 있으면 렌더러의 티어별 3% 확대와 겹쳐 두 번 커진다.
// 둘 다 "돌려 보면 어색한데 왜인지 모르는" 종류라 들이기 전에 숫자로 막는다.
//
// 빌드 시점 전용 — 런타임에서는 쓰지 않는다(DESIGN.md §12).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodePNG } from './png.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const POSES = ['idle', 'attack', 'hit', 'dead'];
const STAGES = [2, 3];
const CX_TOL = 0.6;        // 가로 중심 허용 오차(px)
// 크기 검사는 idle 과 나머지 포즈를 **다르게** 봐야 한다.
// 렌더러는 boxOf() 로 **idle 의 경계만** 읽어 전 포즈의 배율을 정한다(normalize-sprites 주석).
// 그래서 idle 이 기본보다 커져 있으면 티어별 3% 확대와 겹쳐 두 번 커지고 — 이건 막아야 한다.
// 반면 attack·dead 가 기본과 다른 건 작화 차이다(진화한 슬라임은 더 퍼져 쓰러진다).
// 포즈 쪽에서 봐야 할 건 절대 크기가 아니라 **자기 단계 idle 대비 비율** 이 기본과 같은가 —
// 그게 어긋나면 공격할 때 몸이 부풀었다 줄어든다. 실측 최대 편차는 11.2% 였다.
const IDLE_TOL = 14;       // idle 내용 크기 허용 오차(px) — 넘으면 확대가 중복된다
const RATIO_TOL = 0.15;    // 포즈/idle 크기비가 기본과 어긋나도 되는 폭

const src = process.argv[2];
if (!src || !fs.existsSync(src)) {
  console.error('사용법: node tools/make-mon-evo.mjs <준비된폴더>');
  process.exit(1);
}

const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const kb = n => (n / 1024).toFixed(0) + 'KB';

/** 알파>24 내용 경계 */
function bbox(img) {
  const { width: W, height: H, data: P } = img;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (P[(y * W + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1, cx: (x0 + x1) / 2 };
}

const manifestPath = path.join(ASSETS, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const stampPath = path.join(ASSETS, '.normalized.json');
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};

const reject = [];
let taken = 0, bytes = 0;

for (const key of Object.keys(manifest.mon || {})) {
  const entry = manifest.mon[key];
  const dir = path.join(ASSETS, 'mon', key);

  // 기준 — 기본 그림의 포즈별 경계와 캔버스 크기. 진화 그림은 여기에 맞아야 한다.
  const ref = {};
  let canvas = null;
  for (const pose of POSES) {
    const f = path.join(dir, `${pose}_1.png`);
    if (!fs.existsSync(f)) continue;
    const img = decodePNG(fs.readFileSync(f));
    ref[pose] = bbox(img);
    if (pose === 'idle') canvas = { w: img.width, h: img.height };
  }
  if (!ref.idle) continue;                       // 기본 그림이 없는 종(신규 2종)은 건너뛴다

  const got = [];
  const lines = [];
  for (const st of STAGES) {
    // 한 단계는 **포즈 네 장이 다 있어야** 들인다. 셋만 있으면 그 포즈만 기본으로
    // 폴백해 단계가 섞여 보인다 — 차라리 그 단계를 통째로 미루는 게 낫다.
    const files = POSES.map(p => path.join(src, `${key}_t${st}_${p}.png`));
    if (!files.every(f => fs.existsSync(f))) {
      if (files.some(f => fs.existsSync(f))) reject.push(`${key} t${st}: 포즈 4장이 다 없다 — 단계 전체를 미룬다`);
      continue;
    }

    // 포즈를 다 읽어 둔다 — 나머지 포즈 검사가 이 단계의 idle 경계를 기준으로 삼는다.
    const batch = [];
    let bad = false;
    for (let i = 0; i < POSES.length; i++) {
      const pose = POSES[i];
      const raw = fs.readFileSync(files[i]);
      const W = raw.readUInt32BE(16), H = raw.readUInt32BE(20), ct = raw[25];
      if (ct !== 6) { reject.push(`${key}_t${st}_${pose}: RGBA 가 아니다 (컬러타입 ${ct})`); bad = true; continue; }
      if (W !== canvas.w || H !== canvas.h) { reject.push(`${key}_t${st}_${pose}: 캔버스 ${W}×${H} ≠ 기본 ${canvas.w}×${canvas.h}`); bad = true; continue; }
      const b = bbox(decodePNG(raw));
      if (!b) { reject.push(`${key}_t${st}_${pose}: 내용이 없다`); bad = true; continue; }
      batch.push({ pose, raw, b });
    }
    if (bad) continue;

    const evoIdle = batch.find(x => x.pose === 'idle').b;
    for (const { pose, b } of batch) {
      const base = ref[pose] || ref.idle;
      // 발 — 1px 만 어긋나도 레벨이 오르는 순간 캐릭터가 뜬다
      if (b.y1 !== base.y1) { reject.push(`${key}_t${st}_${pose}: 발 ${b.y1} ≠ 기본 ${base.y1} (${b.y1 - base.y1}px) — 레벨업 순간 뜬다`); bad = true; }
      if (Math.abs(b.cx - base.cx) > CX_TOL) { reject.push(`${key}_t${st}_${pose}: 가로중심 ${b.cx} ≠ 기본 ${base.cx}`); bad = true; }
      if (pose === 'idle') {
        // idle 이 배율을 정한다 — 커져 있으면 티어별 3% 확대와 겹친다
        if (Math.abs(b.w - base.w) > IDLE_TOL || Math.abs(b.h - base.h) > IDLE_TOL) {
          reject.push(`${key}_t${st}_idle: 내용 ${b.w}×${b.h} vs 기본 ${base.w}×${base.h} — 확대가 중복된다`); bad = true;
        }
      } else {
        // 나머지 포즈는 idle 대비 비율만 본다 — 어긋나면 공격할 때 몸이 부푼다
        const dw = Math.abs(b.w / evoIdle.w - base.w / ref.idle.w);
        const dh = Math.abs(b.h / evoIdle.h - base.h / ref.idle.h);
        if (dw > RATIO_TOL || dh > RATIO_TOL) {
          reject.push(`${key}_t${st}_${pose}: idle 대비 크기비가 기본과 ${(Math.max(dw, dh) * 100).toFixed(0)}% 어긋난다 — 포즈가 바뀔 때 튄다`); bad = true;
        }
      }
    }
    if (bad) continue;

    // 원본 바이트를 그대로 쓴다. png.mjs 로 다시 인코딩하면 오히려 커진다(make-mon.mjs 주석).
    for (const b of batch) {
      const dest = path.join(dir, `t${st}_${b.pose}_1.png`);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dest, b.raw);
      // defringe 를 건너뛰게 등록한다 — 투명 픽셀이 (0,0,0) 인 생성 PNG 라 돌리면 가장자리가 망가진다
      stamp[path.relative(ASSETS, dest).replaceAll('\\', '/')] = hash(b.raw);
      taken++; bytes += b.raw.length;
    }
    got.push(st);
    lines.push(`${st}단계 ${kb(batch.reduce((a, b) => a + b.raw.length, 0))}`);
  }

  if (!got.length) continue;
  entry.evo = got;                               // sprites.js 가 이걸 보고 접두사를 고른다
  console.log(`  🐾 ${key.padEnd(10)} ${lines.join(' · ')}`);
}

if (reject.length) {
  console.log('\n떨어뜨림 — 들이지 않았다:');
  for (const r of reject) console.log('  ✗ ' + r);
}
if (!taken) {
  console.log('들인 게 없다. 매니페스트를 건드리지 않았다.');
  process.exit(reject.length ? 1 : 0);
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 0));
console.log(`\n진화 그림 ${taken}장 들임 (${(bytes / 1048576).toFixed(2)}MB)`);
console.log('다음: node tools/build-www.mjs');
