// 스토어 스크린샷 촬영.
//
//   npm run dev            # 다른 터미널에서 서버를 띄워 두고
//   node tools/shots.mjs
//
// 브라우저 패널로는 1080x1920 이 안 나온다. 여기서는 설치된 크롬을 헤드리스로 띄워
// 뷰포트 540x960 · deviceScaleFactor 2 로 찍는다 → 정확히 1080x1920 (Play 스토어 휴대전화 규격).
//
// 각 장면은 **세이브를 직접 심어** 만든다. 실제로 그 지점까지 플레이해서 찍으려면
// 오래 걸리고 매번 다른 그림이 나온다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'store-assets');
const URL_BASE = process.env.SHOT_URL || 'http://localhost:5180/';
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const SAVE_KEY = 'monsteridle';

/** 세이브 한 벌. 장면마다 필요한 것만 덮어쓴다. */
const base = over => JSON.stringify({
  v: 1, Lg: 9, st: 5, best: 200, farm: 0, mon: 'slime', spd: 2, autoSkill: true,
  gem: 2400, shard: 180, ore: 90,
  lv: { atk: 120, hp: 420, def: 60, rec: 20, aspd: 24, crit: 60, cdmg: 40, nrm: 0, adv: 1, dbl: 0, trp: 0 },
  bp: { equip: 120, skill: 90, comp: 80 },
  inv: {
    equip: { 'armor|2|1': 1, 'fang|2|0': 1, 'ring|1|0': 2, 'blade|3|0': 1 },
    skill: { 'acid|2|0': 1, 'gust|2|0': 1, 'breath|3|0': 1, 'quake|1|0': 1 },
    comp: { 'slimelet|2|0': 1, 'bats|2|0': 1, 'spore|3|0': 1, 'wisp|1|0': 1, 'shard|2|0': 1 },
  },
  monLv: { slime: 42, goblin: 20, bat: 12, mushroom: 8 },
  mastery: { atk: 30, hp: 20, dps: 24 },
  rs: { lv: 6, startAt: 0 },
  mine: { pick: 18, t: 0, day: '', bomb: 2, grid: null, top: 0, depth: 0 },
  t: Date.now(),
  ...over,
});

// 전투 위주. 같은 화면만 네 장이면 지루하니 **지역·상황을 다르게** 고른다.
const SHOTS = [
  { file: 'shot-1-battle.png', name: '전투 · 숲', save: { st: 5, best: 200 }, settle: 2600 },
  // 보스는 그냥 두면 2초 만에 깨고 지나간다. 촬영 직전에 보스 스테이지로 들여보내고
  // 짧게 기다려 **싸우는 중**을 잡는다.
  { file: 'shot-2-boss.png', name: '전투 · 보스', save: { st: 55, best: 200 }, settle: 1800,
    act: async page => {
      await page.evaluate(async () => {
        const c = await import('/src/combat.js');
        c.enterStage(60, 'run');                 // 60 = 보스 (10의 배수)
      });
    }, after: 1100 },
  { file: 'shot-3-battle-cave.png', name: '전투 · 해골 동굴', save: { st: 35, best: 200 }, settle: 2600 },
  { file: 'shot-4-gacha.png', name: '뽑기', save: { st: 5, best: 200 }, tab: 'gacha', settle: 1500 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-lcd-text'],
});

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SHOTS) {
    // 장면마다 새 탭을 쓴다. 앞 장면의 페이지가 살아 있으면 그쪽 pagehide → save() 가
    // 내가 심은 세이브를 덮어쓴다 (실제로 첫 장이 기본 세이브로 찍혔다).
    const page = await browser.newPage();
    await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
    // 오리진을 먼저 잡고,
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
    // **게임 스크립트가 돌기 전에** 심는다 — 경합이 없다
    await page.evaluateOnNewDocument((k, v) => localStorage.setItem(k, v), SAVE_KEY, base(s.save));
    await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
    await sleep(s.settle);                       // 전투가 흘러 숫자·이펙트가 뜨게 둔다
    if (s.act) { await s.act(page); await sleep(s.after || 800); }
    if (s.tab) {
      await page.click(`.nav[data-t="${s.tab}"]`);
      await sleep(600);
    }
    const dest = path.join(OUT, s.file);
    await page.screenshot({ path: dest, type: 'png' });
    const b = fs.readFileSync(dest);
    // 세이브가 실제로 반영됐는지 확인한다 — 기본 세이브로 찍히면 알아채기 어렵다
    const best = await page.evaluate(() => window.MI?.S?.best ?? 0);
    const ok = best >= 200 ? '' : `  ⚠ 세이브 미반영 (best=${best})`;
    console.log(`  ${s.name.padEnd(16)} ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}  ${(b.length / 1024).toFixed(0)}KB  ${path.relative(ROOT, dest)}${ok}`);
    await page.close();
  }
} finally {
  await browser.close();
}
console.log('완료 — Play 스토어 휴대전화 규격 1080x1920');
