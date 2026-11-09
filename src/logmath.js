// 로그 공간 수 표현 (log10 스칼라) — tools/logmath.cjs 의 ESM 판본.
// 스테이지 6,000 에서 적 체력이 이미 1e316 이라 배정밀도(1e308)로는 담을 수 없다.
// 규칙: 0 은 -Infinity, 곱/나눗셈은 덧셈/뺄셈, 비율만 10^차 로 실수 복원.

export const L0 = -Infinity;
export const fromNum = n => (n > 0 ? Math.log10(n) : L0);
export const toNum = L => Math.pow(10, L);
export const ratio = (a, b) => Math.pow(10, a - b);

// log10(10^a + 10^b)
export function add(a, b) {
  if (a === L0) return b;
  if (b === L0) return a;
  const hi = a > b ? a : b;
  const lo = a > b ? b : a;
  const d = lo - hi;
  if (d < -17) return hi;
  return hi + Math.log10(1 + Math.pow(10, d));
}

// log10(10^a - 10^b). b >= a 면 결과가 0 이하이므로 L0 를 돌려준다.
export function sub(a, b) {
  if (b === L0) return a;
  if (b >= a) return L0;
  const d = b - a;
  if (d < -17) return a;
  const r = 1 - Math.pow(10, d);
  return r <= 0 ? L0 : a + Math.log10(r);
}

// 단위: K · M · B · T 다음은 aa, ab, … az, ba, … zz(10^2040 까지), 그 너머는 aaa…
// 예전엔 Dc(10^33) 다음이 지수 표기(3.02e50)였다. 방치형은 수백 자리까지 가므로 화면 숫자가
// 거의 늘 'e' 로 보였다 — 장르 관례인 알파벳 단위로 바꾼다. Qa·Qi·Sx 를 섞으면 헷갈려서 aa 로 통일.
const SUF = ['', 'K', 'M', 'B', 'T'];
function unit(tier) {
  if (tier < SUF.length) return SUF[tier];
  let n = tier - SUF.length, len = 2, span = 26 * 26;
  while (n >= span) { n -= span; len++; span *= 26; }
  let s = '';
  for (let i = 0; i < len; i++) { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

// 표시용. log10 값 → "12.3M" / "302al"
export function fmt(L) {
  if (L === L0) return '0';
  if (!isFinite(L)) return '∞';
  if (L < 3) {
    const v = toNum(L);
    return v < 10 ? v.toFixed(1) : v.toFixed(0);
  }
  let tier = Math.floor(L / 3);
  let m = Math.pow(10, L - tier * 3);
  // 앞자리: 1~9 는 소수 둘째, 10~99 는 첫째, 100~999 는 정수. 반올림이 1000 이 되면 다음 단위로
  let d = m < 10 ? 2 : m < 100 ? 1 : 0;
  if (Number(m.toFixed(d)) >= 1000) { tier++; m /= 1000; d = 2; }
  return m.toFixed(d) + unit(tier);
}

// 등비수열 합의 로그: log10( (g^N - 1) / (g - 1) ) — N 이 커도 오버플로하지 않게
export function geoSum(Lg, g, N) {
  const LgN = N * Lg;
  if (LgN > 12) return LgN - Math.log10(g - 1);
  return Math.log10((Math.pow(g, N) - 1) / (g - 1));
}
