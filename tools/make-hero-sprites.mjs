// 일부 용사는 Unity 에셋팩의 낱장 프레임이 격자형(시트를 잘못 자른 것)이라 쓸 수 없다.
// 해당 용사만 도감 시트에서 대표 포즈 1장을 잘라 만든다. 나머지 용사는 프레임 애니를 그대로 쓴다.
//
// 이 시트들은 배경이 흰색이 아니라 어두운 그라데이션이라 밝기 임계값이 아니라
// "이웃과 색이 비슷하면 배경" 방식(floodClearGradient)으로 지운다.
//
// 사용: node tools/make-hero-sprites.mjs
import fs from 'node:fs';
import path from 'node:path';
import { decodePNG, encodePNG, crop, floodClearGradient, trim, keepLargestBlob } from './png.mjs';

const SHEETS = 'D:/AI/workspace/game/images/image/IdleRPG_Character_Enemy_Assets';
const HERE = path.resolve(import.meta.dirname, '..');
const OUT = path.join(HERE, 'assets', 'hero');

// 격자형이라 못 쓰는 용사들. 시트 레이아웃이 몬스터와 달라 전용 박스를 쓴다.
const BROKEN = [
  { key: 'emage', sheet: 'Hero_Terra_Stoneheart_EarthMage.png', box: { x0: 0.02, y0: 0.11, x1: 0.23, y1: 0.72 } },
  { key: 'dmage', sheet: 'Hero_Nyx_Shadowveil_DarkMage.png', box: { x0: 0.02, y0: 0.11, x1: 0.23, y1: 0.72 } },
];

const manifestPath = path.join(HERE, 'assets', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

for (const h of BROKEN) {
  const src = path.join(SHEETS, h.sheet);
  if (!fs.existsSync(src)) { console.log('  ' + h.key.padEnd(8) + '시트 없음: ' + h.sheet); continue; }
  const img = decodePNG(fs.readFileSync(src));
  const x0 = Math.round(img.width * h.box.x0);
  const y0 = Math.round(img.height * h.box.y0);
  const w = Math.round(img.width * (h.box.x1 - h.box.x0));
  const hh = Math.round(img.height * (h.box.y1 - h.box.y0));

  let cut = crop(img, x0, y0, w, hh);
  floodClearGradient(cut, 16);
  keepLargestBlob(cut);
  cut = trim(cut, 2);

  let opaque = 0;
  for (let p = 0; p < cut.width * cut.height; p++) if (cut.data[p * 4 + 3] > 24) opaque++;
  const pct = (opaque / (cut.width * cut.height)) * 100;

  const dir = path.join(OUT, h.key);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));   // 격자형 프레임 제거
  fs.writeFileSync(path.join(dir, 'idle_1.png'), encodePNG(cut));
  // tight = 여백 없이 내용에 딱 맞게 자른 스프라이트. 여백 있는 PNG 와 같은 높이로 그리면 커 보인다.
  manifest.hero[h.key] = { idle: 1, tight: true };
  console.log('  ' + h.key.padEnd(8) + `${cut.width}x${cut.height}  내용 ${pct.toFixed(0)}%` + (pct < 12 ? '  ⚠ 확인 필요' : ''));
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log('용사 스프라이트 보정 완료 (' + BROKEN.map(b => b.key).join(', ') + ')');
