// 언어팩 — 한국어 · English · 日本語.
//
// 고르는 순서: 설정에서 고른 언어(localStorage) → 기기 언어(ko·ja 로 시작하면 그것) → 그 밖은 영어.
// 기존 한국 플레이어는 기기가 한국어라 아무것도 바뀌지 않는다.
//
// 팩은 src/lang/<언어>.json 의 평평한 { 키: 문구 }. 문구 안 {이름} 은 t() 의 변수로 채운다.
// 일부 문구는 <b> 같은 태그를 품는다 — 우리 팩만 들어가므로 innerHTML 로 넣어도 된다.
//
// balance.json 의 이름(몬스터·용사·유물·지역…)은 여기서 **한 번 덮어쓴다**(i18n-data.js).
// 그래서 나머지 코드는 m.name 을 그대로 읽으면 된다. balance.json 은 시뮬과 공유하는 원본이라 건드리지 않는다.
//
// 언어를 바꾸면 새로고침한다 — 화면 곳곳에 이미 그려진 글자를 하나하나 다시 그리는 것보다 확실하다.
import { B } from './balance.js';
import { dataFields } from './i18n-data.js';

export const LANGS = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
];
const STORE = 'monsteridle.lang';

function pick() {
  try {
    const saved = localStorage.getItem(STORE);
    if (LANGS.some(l => l.code === saved)) return saved;
  } catch {}
  const list = (typeof navigator !== 'undefined' && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  for (const l of list) {
    const c = String(l || '').toLowerCase();
    if (c.startsWith('ko')) return 'ko';
    if (c.startsWith('ja')) return 'ja';
    if (c.startsWith('en')) return 'en';
  }
  return 'en';
}

export const LANG = pick();
/** 숫자 자리 구분 등에 쓰는 로캘 */
export const LOCALE = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP' }[LANG];

const res = await fetch(new URL(`./lang/${LANG}.json`, import.meta.url));
if (!res.ok) throw new Error(`lang/${LANG}.json 로드 실패: ` + res.status);
const PACK = await res.json();

const missing = new Set();
/** 문구. 없는 키는 키 이름을 그대로 내고 콘솔에 한 번 알린다(tools/check-i18n.mjs 가 미리 막는다) */
export function t(key, vars) {
  let s = PACK[key];
  if (s === undefined) {
    if (!missing.has(key)) { missing.add(key); console.warn('[i18n] 없는 키', LANG, key); }
    s = key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  return s;
}
export const has = key => PACK[key] !== undefined;

/** 정수 자리 구분 (1,234) */
export const n0 = n => Math.floor(n).toLocaleString(LOCALE);

/** 한국어 '과/와' — 받침이 있으면 '과'. 다른 언어는 쓰지 않는다 */
export function josaWa(w) {
  const c = String(w).charCodeAt(String(w).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return '와';
  return (c - 0xac00) % 28 ? '과' : '와';
}

/** 시간 길이 — 3시간 5분 / 3h 5m / 3時間5分 */
export function dur(sec, withSec = false) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return t('time.hm', { h, m });
  if (m > 0) return withSec ? t('time.ms', { m, s }) : t('time.m', { m });
  return t('time.s', { s });
}

export function setLang(code) {
  try { localStorage.setItem(STORE, code); } catch {}
  location.reload();
}

/** index.html 의 고정 글자: data-i18n(글자) · data-i18n-html(태그 포함) · data-i18n-title(툴팁) */
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  document.documentElement.lang = LANG;
  document.title = t('app.title');
}

// balance.json 의 표시용 이름을 이 언어로 — 모듈이 처음 평가될 때 한 번
for (const [k, o, f] of dataFields(B)) {
  const v = PACK['d.' + k];
  if (v !== undefined) o[f] = v;
}
