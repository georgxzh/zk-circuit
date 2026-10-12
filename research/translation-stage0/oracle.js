// Independent exhaustive oracle: evaluates raw A(w) B(w) = C(w), never
// imports the checker or performs polynomial normalization/substitution.
const BUDGET = 100_000;
export function* assignments(s) {
  if (!Number.isInteger(s.p) || s.p < 2 || s.p > 251 || !Number.isInteger(s.nVars)
    || s.nVars < 1 || s.nVars > 8 || s.p ** (s.nVars-1) > BUDGET) {
    throw new RangeError('oracle assignment budget or domain exceeded');
  }
  for (let code = 0; code < s.p ** (s.nVars-1); code++) {
    let rest = code;
    const w = [1];
    for (let i = 1; i < s.nVars; i++) { w.push(rest % s.p); rest = Math.floor(rest / s.p); }
    yield w;
  }
}
// Input schema is the documented tiny-system schema; malformed-input checking
// belongs to the checker tests, not this semantic oracle.
export function satisfies(s, w) {
  if (w.length !== s.nVars || w[0] !== 1 || !w.every((x) => Number.isInteger(x) && x >= 0 && x < s.p)) return false;
  const lc = (terms) => terms.reduce((sum, [i, c]) => (sum+c*w[i]) % s.p, 0);
  return s.rows.every(([a, b, c]) => (lc(a)*lc(b)) % s.p === lc(c));
}
export function publicRelation(s) {
  const relation = new Set();
  for (const w of assignments(s)) if (satisfies(s, w)) relation.add(JSON.stringify(w.slice(1, 1+s.public.length)));
  return relation;
}
export function compareRelations(source, target) {
  if (source.p !== target.p || JSON.stringify(source.public) !== JSON.stringify(target.public)) {
    throw new TypeError('oracle requires the same field and ordered public interface');
  }
  const a = publicRelation(source), b = publicRelation(target);
  const sourceOnly = [...a].filter((x) => !b.has(x)).map(JSON.parse);
  const targetOnly = [...b].filter((x) => !a.has(x)).map(JSON.parse);
  return { equivalent: !sourceOnly.length && !targetOnly.length,
    sourceStatements: a.size, targetStatements: b.size, sourceOnly, targetOnly };
}
