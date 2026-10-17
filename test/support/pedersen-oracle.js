// Test-only independently constructed group calculations. No circomlib/ffjavascript.
// Published affine law: https://www.hyperelliptic.org/EFD/g1p/auto-twisted.html
import assert from 'node:assert/strict';
export const p = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
export const O = [0n,1n];
export const mod = (v) => ((v % p) + p) % p;
function inverse(value) {
  let r = p, next = mod(value), t = 0n, nextT = 1n;
  while (next !== 0n) {
    const q = r / next;
    [r,next] = [next,r-q*next];
    [t,nextT] = [nextT,t-q*nextT];
  }
  assert.equal(r,1n,'noninvertible denominator');
  return mod(t);
}
export function onCurve([x,y]) {
  return x >= 0n && x < p && y >= 0n && y < p &&
    mod(168700n*x*x + y*y - 1n - 168696n*x*x*y*y) === 0n;
}
export function add([x,y],[v,w]) {
  const d = mod(168696n*x*v*y*w);
  const result = [mod((x*w+y*v)*inverse(1n+d)),mod((y*w-168700n*x*v)*inverse(1n-d))];
  assert.ok(onCurve(result));
  return result;
}
export function multiply(point, scalar) {
  assert.ok(scalar >= 0n && onCurve(point));
  let acc = O;
  // Left-to-right (MSB first), unlike the library's right-to-left loop.
  for (const bit of scalar.toString(2)) {
    acc = add(acc,acc);
    if (bit === '1') acc = add(acc,point);
  }
  return acc;
}
export function commitment(x, r, G, H) {
  // Independent Horner packing, not the production bit-shift expression.
  let m = 0n;
  for (let i=3;i>=0;i--) m = 16n*m + BigInt(x[i]) + 8n;
  return add(multiply(G,m),multiply(H,r));
}
