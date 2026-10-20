// 몬스터 도감 시트에서 "좌측 대표 포즈" 한 장을 잘라 스프라이트로 만든다.
//
// 왜 이렇게 하나: Unity 에셋팩의 Enemies/*/Transparent/ 프레임은 시트를 잘못 자른 것이라
// (옆 칸이 딸려 들어오고 배경도 남아있다) 그대로 쓸 수 없다. 용사(Heroes)는 멀쩡하다.
// 몬스터는 대표 포즈 1장만 쓰고 애니메이션은 렌더에서 스쿼시·바운스로 만든다(DESIGN.md §12).
//
// 사용: node tools/make-monster-sprites.mjs [--debug]
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG, encodePNG, crop, floodClearBG, trim, keepLargestBlob } from './png.mjs';

const SHEETS = 'D:/AI/workspace/game/images/image/IdleRPG_Character_Enemy_Assets';
const HERE = path.resolve(import.meta.dirname, '..');
const OUT = path.join(HERE, 'assets', 'mon');
const B = JSON.parse(fs.readFileSync(path.join(HERE, 'src', 'balance.json'), 'utf8'));

// 시트 레이아웃은 전부 동일하다: 상단에 이름표 pill, 그 아래 왼쪽에 큰 대표 포즈.
// 이름표를 피해서 넉넉히 잡고, 가장 큰 덩어리만 남긴 뒤 내용에 맞게 다시 자른다.
const BOX = { x0: 0.02, y0: 0.17, x1: 0.40, y1: 0.52 };

let ok = 0;
const report = [];

for (const m of B.roster.monsters) {
  const src = path.join(SHEETS, m.sheet);
  if (!fs.existsSync(src)) { report.push([m.key, '시트 없음: ' + m.sheet]); continue; }
  try {
    const img = decodePNG(fs.readFileSync(src));
    const x0 = Math.round(img.width * BOX.x0);
    const y0 = Math.round(img.height * BOX.y0);
    const w = Math.round(img.width * (BOX.x1 - BOX.x0));
    const h = Math.round(img.height * (BOX.y1 - BOX.y0));

    let cut = crop(img, x0, y0, w, h);
    // 임계값 212: 캐릭터 아래 연한 회색 그림자까지 지운다.
    // 그림자를 남기면 아래 칸 피규어와 한 덩어리로 이어져 keepLargestBlob 이 같이 살려버린다.
    floodClearBG(cut, 212);
    keepLargestBlob(cut);
    cut = trim(cut, 2);

    // 남은 내용이 너무 적으면 크롭이 빗나간 것이다
    let opaque = 0;
    for (let p = 0; p < cut.width * cut.height; p++) if (cut.data[p * 4 + 3] > 24) opaque++;
    const pct = (opaque / (cut.width * cut.height)) * 100;

    const dir = path.join(OUT, m.key);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'idle_1.png'), encodePNG(cut));
    ok++;
    report.push([m.key, `${cut.width}x${cut.height}  내용 ${pct.toFixed(0)}%` + (pct < 12 ? '  ⚠ 확인 필요' : '')]);
  } catch (e) {
    report.push([m.key, '실패: ' + e.message]);
  }
}

// 시트에서 만든 몬스터는 idle 1장만 쓴다 — 매니페스트를 그에 맞게 갱신
const manifestPath = path.join(HERE, 'assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
for (const m of B.roster.monsters) {
  // 잘못 잘린 프레임들은 지우고 idle 1장만 남긴다
  const dir = path.join(OUT, m.key);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f !== 'idle_1.png') fs.unlinkSync(path.join(dir, f));
    }
  }
  manifest.mon[m.key] = { idle: 1 };
}
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(`몬스터 스프라이트 ${ok}/${B.roster.monsters.length}장 생성`);
for (const [k, v] of report) console.log('  ' + k.padEnd(10) + v);
