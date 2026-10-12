// BigInt port of the Stage 0 checker, bounded for Stage 1 experiments.
// Small primes remain supported for exhaustive differential regression tests.
import { FIELD_MODULUS as BN254 } from '../../src/reference.js';
export { BN254 };
export const LIMITS = Object.freeze({ wires: 32, rows: 128 });
const mod = (x, p) => ((x % p) + p) % p;
class Rejection extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
function requireThat(condition, code, message) {
  if (!condition) throw new Rejection(code, message);
}
function shape(value, keys, where) {
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype, 'malformed', `${where}: expected plain object`);
  const actual = Object.keys(value).sort(), expected = [...keys].sort();
  requireThat(actual.length === expected.length && actual.every((key, i) => key === expected[i]),
    'malformed', `${where}: unexpected or missing keys`);
}
const index = (i, n) => Number.isInteger(i) && i >= 0 && i < n;
const residue = (c, p) => typeof c === 'bigint' && c >= 0n && c < p;
const array = (a) => Array.isArray(a) && Object.keys(a).length === a.length
  && Object.keys(a).every((key, i) => key === String(i));
function system(s) {
  shape(s, ['p', 'nVars', 'public', 'rows'], 'system');
  requireThat(typeof s.p === 'bigint' && (s.p === BN254 || (s.p >= 2n && s.p <= 251n)),
    'field', 'unsupported field');
  if (s.p !== BN254) for (let d = 2n; d*d <= s.p; d++) requireThat(s.p % d !== 0n, 'field', 'modulus is not prime');
  requireThat(Number.isInteger(s.nVars) && s.nVars >= 1 && s.nVars <= LIMITS.wires,
    'malformed', 'invalid wire count');
  requireThat(array(s.public) && s.public.length < s.nVars
    && s.public.every((x) => typeof x === 'string' && x.length > 0)
    && new Set(s.public).size === s.public.length, 'interface', 'invalid public interface');
  requireThat(array(s.rows) && s.rows.length <= LIMITS.rows, 'malformed', 'invalid rows');
  for (const row of s.rows) {
    requireThat(array(row) && row.length === 3, 'malformed', 'row must contain A, B, C');
    for (const lc of row) {
      requireThat(array(lc) && lc.length <= s.nVars, 'malformed', 'invalid linear combination');
      const seen = new Set();
      for (const term of lc) {
        requireThat(array(term) && term.length === 2 && index(term[0], s.nVars)
          && residue(term[1], s.p) && term[1] !== 0n && !seen.has(term[0]),
        'malformed', 'terms require unique in-range wires and nonzero canonical coefficients');
        seen.add(term[0]);
      }
    }
  }
}
function add(poly, i, j, c, p) {
  const key = i <= j ? `${i},${j}` : `${j},${i}`;
  const value = mod((poly.get(key) ?? 0n) + c, p);
  if (value) poly.set(key, value); else poly.delete(key);
}
export function polynomial([a, b, c], p) {
  const result = new Map();
  for (const [i, x] of a) for (const [j, y] of b) add(result, i, j, x*y, p);
  for (const [i, x] of c) add(result, 0, i, -x, p);
  return result;
}
function inverse(c, p) {
  let a = c, b = p, x = 1n, y = 0n;
  while (b) { const q = a / b; [a,b] = [b,a-q*b]; [x,y] = [y,x-q*y]; }
  if (a !== 1n) throw new Error('internal: noninvertible nonzero coefficient');
  return mod(x,p);
}
export function canonical(poly, p) {
  const entries = [...poly].sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return '';
  const scale = inverse(entries[0][1], p);
  return entries.map(([k, c]) => `${k}:${mod(c*scale, p)}`).join(';');
}
export function substitute(poly, wire, to, value, p) {
  const result = new Map();
  for (const [key, c] of poly) {
    let [i, j] = key.split(',').map(Number), coefficient = c;
    if (i === wire) { i = to; coefficient = mod(coefficient*value, p); }
    if (j === wire) { j = to; coefficient = mod(coefficient*value, p); }
    add(result, i, j, coefficient, p);
  }
  return result;
}
export function mentions(poly, wire) {
  return [...poly.keys()].some((key) => key.split(',').map(Number).includes(wire));
}
function bag(polys, p) {
  // Retain multiplicity; only zero polynomials are discarded.
  return polys.map((q) => canonical(q, p)).filter(Boolean).sort();
}
function witness(w, s) {
  if (!array(w) || w.length !== s.nVars || w[0] !== 1n
    || !w.every((x) => residue(x, s.p))) throw new TypeError('invalid canonical witness');
}

export function checkCertificate(source, target, certificate) {
  try {
    system(source); system(target);
    requireThat(source.p === target.p, 'field', 'different fields');
    requireThat(JSON.stringify(source.public) === JSON.stringify(target.public),
      'interface', 'ordered public interfaces differ');
    shape(certificate, ['version', 'steps', 'targetToSource'], 'certificate');
    requireThat(certificate.version === 1 && array(certificate.steps)
      && certificate.steps.length < source.nVars, 'malformed', 'invalid version or steps');
    const definitions = new Map();
    for (const step of certificate.steps) {
      const keys = step?.kind === 'alias' ? ['kind', 'wire', 'to', 'row']
        : step?.kind === 'constant' ? ['kind', 'wire', 'value', 'row']
          : ['kind', 'wire'];
      shape(step, keys, 'step');
      requireThat(['alias', 'constant', 'unused'].includes(step.kind), 'malformed', 'unknown step kind');
      requireThat(index(step.wire, source.nVars) && step.wire > source.public.length,
        'protected-wire', 'cannot eliminate constant or public wire');
      requireThat(!definitions.has(step.wire), 'mapping', 'duplicate elimination');
      if (step.kind === 'alias') requireThat(index(step.to, source.nVars) && step.to !== 0,
        'dependency', 'alias dependency is not a signal; use a constant step for wire zero');
      if (step.kind === 'constant') requireThat(residue(step.value, source.p), 'malformed', 'noncanonical constant');
      if (step.kind !== 'unused') requireThat(index(step.row, source.rows.length), 'pivot', 'missing pivot row');
      definitions.set(step.wire, step);
    }
    // Explicitly reject cycles, including self aliases, before replay.
    for (const start of definitions.keys()) {
      const seen = new Set(); let at = start;
      while (definitions.get(at)?.kind === 'alias') {
        requireThat(!seen.has(at), 'cycle', 'cyclic reconstruction');
        seen.add(at); at = definitions.get(at).to;
      }
    }
    const mapping = certificate.targetToSource;
    requireThat(array(mapping) && mapping.length === target.nVars
      && mapping.every((i) => index(i, source.nVars)) && new Set(mapping).size === mapping.length,
    'mapping', 'target map must be an injective, total coordinate map');
    for (let i = 0; i <= source.public.length; i++) {
      requireThat(mapping[i] === i, 'interface', 'constant and ordered public coordinates must be fixed');
    }
    const active = new Set(Array.from({ length: source.nVars }, (_, i) => i));
    let rows = source.rows.map((r) => polynomial(r, source.p));
    for (const step of certificate.steps) {
      if (step.kind === 'unused') {
        requireThat(rows.every((q) => !mentions(q, step.wire)), 'not-unused', 'wire occurs in a remaining equation');
      } else {
        if (step.kind === 'alias') requireThat(active.has(step.to), 'dependency', 'dependency was already eliminated');
        const expected = new Map();
        add(expected, 0, step.wire, 1n, source.p);
        add(expected, 0, step.kind === 'alias' ? step.to : 0,
          step.kind === 'alias' ? -1n : -step.value, source.p);
        requireThat(canonical(rows[step.row], source.p) === canonical(expected, source.p),
          'unjustified-substitution', 'pivot does not establish the proposed substitution');
        rows = rows.map((q) => substitute(q, step.wire,
          step.kind === 'alias' ? step.to : 0, step.kind === 'alias' ? 1n : step.value, source.p));
      }
      active.delete(step.wire);
    }
    requireThat(mapping.length === active.size && mapping.every((i) => active.has(i)),
      'mapping', 'map must cover exactly the retained source coordinates');
    const sourceToTarget = new Map(mapping.map((old, i) => [old, i]));
    rows = rows.map((q) => {
      const renamed = new Map();
      for (const [key, c] of q) {
        const [i, j] = key.split(',').map(Number);
        add(renamed, sourceToTarget.get(i), sourceToTarget.get(j), c, source.p);
      }
      return renamed;
    });
    requireThat(JSON.stringify(bag(rows, source.p)) === JSON.stringify(bag(target.rows.map((r) => polynomial(r, target.p)), target.p)),
      'residual-mismatch', 'transformed source and target rows differ');
    // Snapshot validated data: later caller mutations cannot change these maps.
    const s = structuredClone(source), t = structuredClone(target);
    const steps = structuredClone(certificate.steps), retained = [...mapping];
    return {
      accepted: true,
      project(w) { witness(w, s); return retained.map((i) => w[i]); },
      lift(v) {
        witness(v, t);
        const w = new Array(s.nVars);
        retained.forEach((old, i) => { w[old] = v[i]; });
        for (const step of [...steps].reverse()) w[step.wire] = step.kind === 'alias'
          ? w[step.to] : step.kind === 'constant' ? step.value : 0n;
        witness(w, s); return w;
      },
    };
  } catch (error) {
    if (!(error instanceof Rejection)) throw error;
    return { accepted: false, code: error.code, reason: error.message };
  }
}
