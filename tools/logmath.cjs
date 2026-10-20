'use strict';
/* 로그 공간 수 표현 (log10 스칼라)
 *
 * 방치형은 금방 1e308(배정밀도 한계)을 넘는다. 스테이지 1,000만 가도 적 체력이 1e30 이고
 * 50,000 스테이지는 1e3700 이다. 그래서 큰 값은 전부 "log10(값)"으로 들고 다닌다.
 *
 * 규칙:
 *   - 0 은 -Infinity 로 표현한다 (log10(0))
 *   - 곱/나눗셈은 덧셈/뺄셈이 되어 공짜이고 오버플로가 없다
 *   - 비율(ttk, 생존여유 등)만 10^차 로 실수로 되돌린다 — 차이는 항상 작으므로 안전하다
 *
 * 게임 본체도 같은 표현을 쓴다(DESIGN.md §11). fmt() 가 표시용 포맷을 담당한다.
 */

const L0 = -Infinity;                       // 0
const fromNum = n => n > 0 ? Math.log10(n) : L0;
const toNum = L => Math.pow(10, L);         // 작은 값에만 쓸 것
const mul = (a, b) => a + b;
const div = (a, b) => a - b;
const powN = (a, k) => a * k;               // 값^k
const ratio = (a, b) => Math.pow(10, a - b);

// log10(10^a + 10^b)
function add(a, b) {
  if (a === L0) return b;
  if (b === L0) return a;
  const hi = a > b ? a : b, lo = a > b ? b : a;
  const d = lo - hi;
  if (d < -17) return hi;                   // 차이가 크면 작은 쪽은 무시(배정밀도 유효자리)
  return hi + Math.log10(1 + Math.pow(10, d));
}

// log10(10^a - 10^b).  b >= a 면 0 이하이므로 L0 를 돌려준다(호출측에서 부호를 먼저 판단할 것)
function sub(a, b) {
  if (b === L0) return a;
  if (b >= a) return L0;
  const d = b - a;
  if (d < -17) return a;
  const r = 1 - Math.pow(10, d);
  return r <= 0 ? L0 : a + Math.log10(r);
}

const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
// 표시용: log10 값 → "12.3M" / "4.56e42"
function fmt(L) {
  if (L === L0) return '0';
  if (!isFinite(L)) return '∞';
  if (L < 3) return toNum(L).toFixed(L < 1 ? 2 : 0);
  const tier = Math.floor(L / 3);
  if (tier < SUF.length) {
    const m = Math.pow(10, L - tier * 3);
    return (m >= 100 ? m.toFixed(0) : m.toFixed(2)) + SUF[tier];
  }
  const e = Math.floor(L), m = Math.pow(10, L - e);
  return m.toFixed(2) + 'e' + e;
}

module.exports = { L0, fromNum, toNum, mul, div, powN, ratio, add, sub, fmt };
