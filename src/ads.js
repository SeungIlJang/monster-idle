// 보상형 광고 — 폰에서는 AdMob, 웹/개발에서는 시뮬레이션.
//
// 호출부는 환경을 몰라야 한다. 전부 `await playRewarded()` 하나만 쓰고,
// true 일 때만 보상을 준다. 보상 지급을 광고 성공에 묶는 게 이 모듈의 존재 이유다.
//
// 구버전에서 배운 것: 광고 단위 ID 를 플레이스홀더로 두면 출시까지 그대로 간다.
// 그래서 실ID 가 비어 있는데 테스트 모드가 꺼져 있으면 보상을 주지 않고 경고를 찍는다.
import * as sfx from './audio.js';

const res = await fetch(new URL('./ads.json', import.meta.url));
const CFG = await res.json();

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

export async function initAds() {
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
    overlay('📺 광고 시청 중… ' + n, '개발용 시뮬레이션');
    const iv = setInterval(() => {
      n--;
      if (n > 0) overlay('📺 광고 시청 중… ' + n, '개발용 시뮬레이션');
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
    overlay('광고 준비 중…', '');
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
  // 광고가 뜨는 동안 효과음을 멈춘다. 보상 여부와 무관하게 끝나면 되살린다.
  sfx.suspend();
  try { return await playRewardedInner(); } finally { sfx.resume(); }
}

async function playRewardedInner() {
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
