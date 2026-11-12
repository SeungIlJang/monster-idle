// 스토어 스크린샷 촬영.
//
//   npm run dev                       # 다른 터미널에서 서버를 띄워 두고
//   node tools/shots.mjs              # 한국어 → store-assets/
//   node tools/shots.mjs --lang=en    # 영어   → store-assets/en/
//   node tools/shots.mjs --lang=ja    # 일본어 → store-assets/ja/
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
// 언어팩(src/i18n.js)이 localStorage 'monsteridle.lang' 을 먼저 본다 — 기기 언어와 상관없이 고정된다
const LANG = (process.argv.find(a => a.startsWith('--lang=')) || '--lang=ko').slice(7);
if (!['ko', 'en', 'ja'].includes(LANG)) { console.error('언어는 ko · en · ja'); process.exit(1); }
const OUT = LANG === 'ko' ? path.join(ROOT, 'store-assets') : path.join(ROOT, 'store-assets', LANG);
const URL_BASE = process.env.SHOT_URL || 'http://localhost:5180/';
const CHROME = process.env.CHROME_PATH ||
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const SAVE_KEY = 'monsteridle';

/** 세이브 한 벌. 장면마다 필요한 것만 덮어쓴다. */
const base = over => JSON.stringify({
  // 자동 강화는 끈다 — 켜 두면 심어 둔 골드로 스탯을 사들여 몇 초 만에 다음 지역으로 넘어간다(숲 장면이 동굴로 찍혔다)
  v: 1, Lg: 9, st: 5, best: 200, farm: 0, mon: 'slime', spd: 2, autoSkill: true, autoBuy: false,
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

// 시작 화면은 **모은 것이 다 서 있을 때** 가 보기 좋다 — 12종 전부 · 뽑기 동료 6종 · 진화한 모습
const ALL_MON = { slime: 100, goblin: 80, bat: 60, mushroom: 76, skeleton: 52, wolf: 75, ghost: 30, orc: 26, golem: 25, dragon: 75, spider: 25, wyrm: 12 };
const ALL_COMP = { 'slimelet|2|0': 1, 'bats|2|0': 1, 'spore|3|0': 1, 'wisp|2|0': 1, 'shard|2|0': 1, 'shade|3|0': 1 };

// 전투 위주. 같은 화면만 네 장이면 지루하니 **지역·상황을 다르게** 고른다.
// title: true 면 시작 화면을 찍는다. 아니면 '시작' 을 눌러 전투로 들어간 뒤 찍는다.
const SHOTS = [
  // 지역은 층 묶음마다 돈다(balance.zoneAt) — 숲 49~53 · 해골 동굴 14~18, 64~68. 시간에 맡기면 다음 지역으로 넘어가 있으니
  // 보스처럼 찍기 직전에 그 층으로 들여보낸다. 동굴을 16층으로 하면 1초 안에 깨서 적이 거의 없이 찍힌다 → 66층.
  { file: 'shot-1-battle.png', name: '전투 · 숲', save: { st: 5, best: 200 }, settle: 1500, act: enter(52), after: 1200 },
  // 보스는 그냥 두면 2초 만에 깨고 지나간다. 촬영 직전에 보스 스테이지로 들여보내고
  // 짧게 기다려 **싸우는 중**을 잡는다.
  { file: 'shot-2-boss.png', name: '전투 · 보스', save: { st: 55, best: 200 }, settle: 1800,
    act: async page => {
      await page.evaluate(async () => {
        const c = await import('/src/combat.js');
        c.enterStage(60, 'run');                 // 60 = 보스 (10의 배수)
      });
    }, after: 1100 },
  { file: 'shot-3-battle-cave.png', name: '전투 · 해골 동굴', save: { st: 5, best: 200 }, settle: 1500, act: enter(66), after: 1200 },
  { file: 'shot-4-gacha.png', name: '뽑기', save: { st: 5, best: 200 }, tab: 'gacha', settle: 1500, skip: true },   // 스토어 구성에서 빠졌다
  { file: 'shot-5-start.png', name: '시작 화면', save: { st: 30000, best: 30000, life: 30000, monLv: ALL_MON,
      inv: { equip: {}, skill: {}, comp: ALL_COMP } }, title: true, settle: 1600 },
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
function enter(stage) {
  return async page => page.evaluate(async st => {
    const c = await import('/src/combat.js');
    c.enterStage(st, 'run');
  }, stage);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-lcd-text'],
});

try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of SHOTS) {
    if (s.skip) continue;
    // 장면마다 새 탭을 쓴다. 앞 장면의 페이지가 살아 있으면 그쪽 pagehide → save() 가
    // 내가 심은 세이브를 덮어쓴다 (실제로 첫 장이 기본 세이브로 찍혔다).
    const page = await browser.newPage();
    await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 2 });
    // 오리진을 먼저 잡고,
    await page.goto(URL_BASE, { waitUntil: 'domcontentloaded' });
    // **게임 스크립트가 돌기 전에** 심는다 — 경합이 없다
    await page.evaluateOnNewDocument((k, v, lang) => {
      localStorage.setItem(k, v);
      localStorage.setItem('monsteridle.lang', lang);
    }, SAVE_KEY, base(s.save), LANG);
    await page.goto(URL_BASE, { waitUntil: 'networkidle2' });
    // 시작 화면이 먼저 뜬다. 전투 장면은 '시작' 을 눌러 넘긴다(페이드 0.45초)
    if (!s.title) { await page.click('#tStart'); await sleep(700); }
    await sleep(s.settle);                       // 전투가 흘러 숫자·이펙트가 뜨게 둔다
    if (s.act) { await s.act(page); await sleep(s.after || 800); }
    if (s.tab) {
      await page.click(`.nav[data-t="${s.tab}"]`);
      await sleep(600);
    }
    // 'Stage clear' 같은 안내 글자가 겹쳐 찍히지 않게 **막아 둔다**(화면 연출만, 진행에는 영향 없음).
    // 0 으로 한 번 지우기만 하면 찍는 사이에 층을 깨서 다시 뜬다(실제로 동굴 장면에 크게 찍혔다)
    await page.evaluate(() => {
      const R = window.MI?.R;
      if (R) Object.defineProperty(R, 'bannerT', { get: () => 0, set() {}, configurable: true });
    });
    await sleep(120);
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
console.log(`완료 (${LANG}) — Play 스토어 휴대전화 규격 1080x1920 · ${path.relative(ROOT, OUT) || '.'}`);
