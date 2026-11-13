// 보상형 광고 — 폰에서는 AdMob, 웹/개발에서는 시뮬레이션.
//
// 호출부는 환경을 몰라야 한다. 전부 `await playRewarded()` 하나만 쓰고,
// true 일 때만 보상을 준다. 보상 지급을 광고 성공에 묶는 게 이 모듈의 존재 이유다.
//
// 구버전에서 배운 것: 광고 단위 ID 를 플레이스홀더로 두면 출시까지 그대로 간다.
// 그래서 실ID 가 비어 있는데 테스트 모드가 꺼져 있으면 보상을 주지 않고 경고를 찍는다.
import * as sfx from './audio.js';
import { t } from './i18n.js';
import { DEV } from './dev-flags.js';

const res = await fetch(new URL('./ads.json', import.meta.url));
const CFG = await res.json();

// 테스트 트랙(비공개 테스트) AAB 는 UA 에 MSAdsTest 가 붙어 있다(tools/set-ads-mode.mjs).
// 그 빌드는 구글 테스트 광고만 쓰므로 테스터가 눌러도 계정에 영향이 없다.
// 2026-11-02 에 무효 트래픽으로 계정이 29일 정지된 뒤 넣었다. ads.json 의 useTest 보다 우선한다.
if (typeof navigator !== 'undefined' && navigator.userAgent.includes('MSAdsTest')) CFG.useTest = true;

const $ = id => document.getElementById(id);
let admob = null;          // Capacitor AdMob 플러그인 (폰에서만)
let ready = false;

const plugin = () => window.Capacitor?.Plugins?.AdMob ?? null;
export const isNative = () => !!plugin();

/** 지금 쓸 광고 단위 ID. 설정이 잘못되면 null */
function unitId(kind) {
  if (CFG.useTest) return CFG.test[kind];
  const v = CFG.real?.[kind];
  if (!v) {
    console.warn(
      `[ads] useTest=false 인데 real.${kind} 가 비어 있습니다. ` +
      `src/ads.json 에 AdMob 광고 단위 ID 를 넣으세요. 그때까지 광고 보상은 지급되지 않습니다.`);
    return null;
  }
  return v;
}

// ⚠️ 광고 전면 중단 (2026-11-03 ~ 2026-12-02 AdMob 계정 정지)
// 무효 트래픽으로 정지됐고 기간 중 추가 위반이면 영구 정지라 광고 요청 자체를 끊는다.
// 12/2 이후 되살리려면 true 로 바꾸고 `npm run deploy` 로 games/monsteridle/ 까지 갱신할 것.
// 소스만 고치면 앱은 OTA 로 옛 사본을 계속 받는다.
const ADS_ENABLED = false;

export async function initAds() {
  if (!ADS_ENABLED) return false;
  const P = plugin();
  if (!P) return false;                   // 웹 — 시뮬로 간다
  try {
    await P.initialize({ initializeForTesting: CFG.useTest });
    admob = P;
    ready = true;
    if (CFG.banner?.enabled) await showBanner();
  } catch (e) {
    console.warn('[ads] AdMob 초기화 실패, 시뮬레이션으로 대체', e);
  }
  return ready;
}

// ── 웹 시뮬레이션 오버레이 ───────────────────────────────────
function overlay(text, sub) {
  const el = $('adOv');
  if (!el) return;
  el.querySelector('.msg').textContent = text;
  el.querySelector('.sub').textContent = sub || '';
  el.style.display = 'flex';
}
function hideOverlay() {
  const el = $('adOv');
  if (el) el.style.display = 'none';
}

function simulate() {
  return new Promise(resolve => {
    let n = CFG.simSeconds;
    overlay(t('ad.watching', { n }), t('ad.sim'));
    const iv = setInterval(() => {
      n--;
      if (n > 0) overlay(t('ad.watching', { n }), t('ad.sim'));
      else { clearInterval(iv); hideOverlay(); resolve(true); }
    }, 1000);
  });
}

// ── 실제 보상형 광고 ─────────────────────────────────────────
async function playNative() {
  const id = unitId('rewarded');
  if (!id) return false;

  let rewarded = false;
  let subReward = null, subDismiss = null, subFail = null;
  try {
    overlay(t('ad.preparing'), '');
    subReward = await admob.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
    await admob.prepareRewardVideoAd({ adId: id, isTesting: CFG.useTest });
    hideOverlay();

    await new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      admob.addListener('onRewardedVideoAdDismissed', finish).then(s => { subDismiss = s; });
      admob.addListener('onRewardedVideoAdFailedToShow', finish).then(s => { subFail = s; });
      admob.showRewardVideoAd().catch(finish);
      setTimeout(finish, 120000);          // 콜백이 끊겨도 영원히 멈추지 않게
    });
  } catch (e) {
    console.warn('[ads] 보상형 광고 실패', e);
  } finally {
    hideOverlay();
    for (const s of [subReward, subDismiss, subFail]) { try { s?.remove?.(); } catch {} }
  }
  return rewarded;
}

/**
 * 보상형 광고를 재생한다.
 * @returns {Promise<boolean>} 보상을 줘도 되는가 (끝까지 봤는가)
 */
export async function playRewarded() {
  if (DEV.adSkip) return true;          // 개발자 모드 '광고 건너뛰기' — 바로 보상
  // 광고가 뜨는 동안 효과음을 멈춘다. 보상 여부와 무관하게 끝나면 되살린다.
  sfx.suspend();
  try { return await playRewardedInner(); } finally { sfx.resume(); }
}

async function playRewardedInner() {
  // 광고 중단 기간엔 보상을 그대로 준다. 아래 '실광고를 띄울 수 없어 보상을 건너뜁니다'
  // 분기로 흘러가면 폰에서 리워드 버튼이 통째로 먹통이 된다.
  if (!ADS_ENABLED) return simulate();
  if (ready && admob) return playNative();
  // 폰이 아니거나 AdMob 이 죽었으면 시뮬레이션 — 개발 중 흐름이 막히지 않게
  if (!CFG.useTest && isNative()) {
    console.warn('[ads] 실광고를 띄울 수 없어 보상을 건너뜁니다.');
    return false;
  }
  return simulate();
}

// ── 배너 (기본 꺼짐) ─────────────────────────────────────────
let bannerUp = false;
export async function showBanner() {
  if (!ADS_ENABLED) return;
  const id = unitId('banner');
  if (!admob || !id || bannerUp) return;
  try {
    await admob.showBanner({ adId: id, adSize: 'BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: CFG.useTest });
    bannerUp = true;
    document.body.classList.add('has-banner');
  } catch (e) {
    console.warn('[ads] 배너 실패', e);
  }
}
export async function hideBanner() {
  if (!admob || !bannerUp) return;
  try { await admob.hideBanner(); } catch {}
  bannerUp = false;
  document.body.classList.remove('has-banner');
}

export const adConfig = () => CFG;
