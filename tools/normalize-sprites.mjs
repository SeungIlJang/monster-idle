// 스프라이트 정규화 — 빌드 시점에 한 번 돌린다.
//
// 세 가지 문제를 푼다:
//
// 1) **못 쓰는 프레임 걸러내기.** 에셋팩의 낱장 프레임은 시트를 잘못 자른 것이라
//    뒤쪽 프레임이 쪼가리다(전사 idle_5 는 17x1 픽셀, idle_6 은 7x8). 그대로 재생하면
//    캐릭터가 사라졌다 나타난다. 1번 프레임과 키가 비슷한 **앞쪽 연속 구간만** 남긴다.
//
// 2) **보이는 크기 통일.** 캔버스는 128x128 로 같아도 캐릭터가 차지하는 영역은 제각각이라
//    (기사 77x80, 로그 85x109, 몬스터는 여백 없는 크롭) 같은 높이로 그리면 크기가 들쭉날쭉하다.
//    프레임의 내용 경계(bbox)를 매니페스트에 적어, 렌더가 **보이는 높이**를 기준으로 그리게 한다.
//
// 3) **검은 테두리 제거.** 투명 픽셀에 원본 배경색이 남아 있어 밝은 배경 위에서 검은 띠가
//    생긴다(png.mjs defringe 주석 참고). 배경 PNG 를 깔기 전에는 안 보이던 문제다.
//
// 사용: node tools/normalize-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decodePNG, encodePNG, defringe } from './png.mjs';

const HERE = path.resolve(import.meta.dirname, '..');
const ASSETS = path.join(HERE, 'assets');
const TOL = 0.12;            // 1번 프레임 대비 허용 키 차이

function bbox(file) {
  const img = decodePNG(fs.readFileSync(file));
  const { width: W, height: H, data: P } = img;
  let mnx = W, mny = H, mxx = -1, mxy = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (P[(y * W + x) * 4 + 3] > 24) {
        if (x < mnx) mnx = x; if (x > mxx) mxx = x;
        if (y < mny) mny = y; if (y > mxy) mxy = y;
      }
    }
  }
  if (mxx < 0) return null;
  return { x: mnx, y: mny, w: mxx - mnx + 1, h: mxy - mny + 1, cw: W, ch: H };
}

const manifestPath = path.join(ASSETS, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const report = [];
let defringed = 0, skipped = 0;

// defringe 는 "투명 픽셀에 원본 배경색이 남아 있다" 는 전제에 기댄다. 한 번 돌리면 그 전제가
// 깨지므로 두 번 돌리면 색이 망가진다. 처리한 결과의 내용 해시를 적어두고 그대로면 건너뛴다.
// mtime 이 아니라 해시인 이유: assets/ 는 git 에 커밋하는데, 새로 clone 하면 mtime 이 전부
// 체크아웃 시각으로 바뀌어 이미 처리된 파일을 다시 처리해 버린다.
const stampPath = path.join(ASSETS, '.normalized.json');
const stamp = fs.existsSync(stampPath) ? JSON.parse(fs.readFileSync(stampPath, 'utf8')) : {};
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);

for (const group of ['mon', 'hero']) {
  for (const key of Object.keys(manifest[group] || {})) {
    const entry = manifest[group][key];
    const dir = path.join(ASSETS, group, key);
    const out = {};
    let firstBox = null;

    for (const anim of Object.keys(entry)) {
      if (typeof entry[anim] !== 'number') continue;        // tight 같은 플래그는 건너뛴다
      const n = entry[anim];
      const boxes = [];
      for (let i = 1; i <= n; i++) {
        const f = path.join(dir, `${anim}_${i}.png`);
        boxes.push(fs.existsSync(f) ? bbox(f) : null);
      }
      if (!boxes[0]) { out[anim] = 0; continue; }

      // 1번 프레임과 키가 비슷한 앞쪽 연속 구간만 남긴다
      let keep = 1;
      for (let i = 1; i < boxes.length; i++) {
        const b = boxes[i];
        if (!b) break;
        if (Math.abs(b.h - boxes[0].h) / boxes[0].h > TOL) break;
        keep++;
      }
      // 잘린 프레임은 지운다 (www 용량도 줄어든다)
      for (let i = keep + 1; i <= n; i++) {
        const f = path.join(dir, `${anim}_${i}.png`);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      // 남긴 프레임만 테두리를 정리한다 (지울 프레임에 시간 쓰지 않는다)
      for (let i = 1; i <= keep; i++) {
        const f = path.join(dir, `${anim}_${i}.png`);
        if (!fs.existsSync(f)) continue;
        const rel = path.relative(ASSETS, f).replaceAll('\\', '/');
        const cur = fs.readFileSync(f);
        if (stamp[rel] === hash(cur)) { skipped++; continue; }
        const done = encodePNG(defringe(decodePNG(cur)));
        fs.writeFileSync(f, done);
        stamp[rel] = hash(done);
        defringed++;
      }
      out[anim] = keep;
      if (anim === 'idle') firstBox = boxes[0];
      if (keep < n) report.push(`  ${group}/${key}/${anim}: ${n} → ${keep}장`);
    }

    if (firstBox) {
      // 캔버스 대비 비율로 적는다 — 렌더가 "보이는 높이" 로 크기를 맞춘다
      out.box = {
        x: +(firstBox.x / firstBox.cw).toFixed(4),
        y: +(firstBox.y / firstBox.ch).toFixed(4),
        w: +(firstBox.w / firstBox.cw).toFixed(4),
        h: +(firstBox.h / firstBox.ch).toFixed(4),
      };
    }
    manifest[group][key] = out;
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
fs.writeFileSync(stampPath, JSON.stringify(stamp, null, 0));
console.log(`스프라이트 정규화 완료 — 테두리 정리 ${defringed}장` +
  (skipped ? ` (이미 처리된 ${skipped}장 건너뜀)` : ''));
if (report.length) { console.log('잘린 프레임 제거:'); for (const r of report) console.log(r); }
for (const g of ['mon', 'hero']) {
  const sample = Object.entries(manifest[g]).map(([k, v]) => `${k}:${v.idle}`).join(' ');
  console.log(`  ${g} idle 프레임 → ${sample}`);
}
