import test from 'node:test';
import assert from 'node:assert/strict';
import { checkCertificate } from '../research/translation-stage0/checker.js';
import { assignments, satisfies, compareRelations } from '../research/translation-stage0/oracle.js';
import { examples } from '../research/translation-stage0/examples.js';

for (const p of [2,3,5,7]) for (const e of examples(p)) {
  test(`stage0 F_${p}: ${e.name}`, () => {
    const checked = checkCertificate(e.source,e.target,e.certificate);
    assert.equal(checked.accepted,e.accepted,checked.reason);
    if (!checked.accepted) assert.equal(checked.code,e.code);
    const oracle = compareRelations(e.source,e.target);
    assert.equal(oracle.equivalent,e.equivalent,JSON.stringify(oracle));
    if (checked.accepted) {
      for (const w of assignments(e.source)) if (satisfies(e.source,w)) {
        const v = checked.project(w);
        assert.ok(satisfies(e.target,v),'projection must preserve every satisfying assignment');
        assert.deepEqual(v.slice(0,1+e.source.public.length),w.slice(0,1+e.source.public.length));
      }
      for (const v of assignments(e.target)) if (satisfies(e.target,v)) {
        const w = checked.lift(v);
        assert.ok(satisfies(e.source,w),'lifting must preserve every satisfying assignment');
        assert.deepEqual(w.slice(0,1+e.source.public.length),v.slice(0,1+e.source.public.length));
        assert.deepEqual(checked.project(w),v);
      }
    }
  });
}

test('crucial counterexample has source-only public statements, not just a failed certificate', () => {
  const e = examples().find((e) => e.name === 'crucial-invalid-t-equals-one');
  assert.equal(checkCertificate(e.source,e.target,e.certificate).code,'unjustified-substitution');
  const result = compareRelations(e.source,e.target);
  assert.deepEqual(result,{equivalent:false,sourceStatements:5,targetStatements:1,
    sourceOnly:[[1],[2],[3],[4]],targetOnly:[]});
  assert.ok(satisfies(e.source,[1,1,0])); // a=1,t=0; target has no witness for a=1.
  assert.equal(satisfies(e.target,[1,1]),false);
});

test('unused witnesses need not be recovered by lift after projection', () => {
  const e = examples().find((e) => e.name === 'unused-private');
  const c = checkCertificate(e.source,e.target,e.certificate);
  assert.deepEqual(c.lift(c.project([1,2,4])),[1,2,0]);
  const nonunique = examples().find((e) => e.name === 'nonunique-retained');
  assert.equal([...assignments(nonunique.source)].filter((w) => w[1] === 0 && satisfies(nonunique.source,w)).length,5);
});

test('malformed systems and certificates fail closed with explicit rejection', () => {
  const base = examples().find((e) => e.name === 'alias-chain-constant');
  const mutations = [
    [e => { e.source.p = 9; },'field'],
    [e => { e.target.p = 7; },'field'],
    [e => { e.source.p = 257; },'field'],
    [e => { e.source.nVars = 9; },'malformed'],
    [e => { e.source.rows[0][2][0][1] = 5; },'malformed'],
    [e => { e.source.rows[0][2][0][1] = -1; },'malformed'],
    [e => { e.source.rows[0][2][0][0] = 99; },'malformed'],
    [e => { e.source.rows[0][2].push([2,1]); },'malformed'],
    [e => { delete e.source.rows[0][2][0]; },'malformed'],
    [e => { e.target.public = ['different']; },'interface'],
    [e => { e.certificate.version = 2; },'malformed'],
    [e => { e.certificate.extra = true; },'malformed'],
    [e => { delete e.certificate.steps; delete e.certificate.targetToSource;
      e.certificate['steps,targetToSource'] = []; },'malformed'],
    [e => { e.certificate.steps[0].wire = 0; },'protected-wire'],
    [e => { e.certificate.steps[0].wire = 1; },'protected-wire'],
    [e => { e.certificate.steps[0].to = 0; },'dependency'],
    [e => { delete e.certificate.steps[0].to; },'malformed'],
    [e => { e.certificate.steps[0].row = 99; },'pivot'],
    [e => { e.certificate.steps[2].value = 5; },'malformed'],
    [e => { e.certificate.steps[1] = structuredClone(e.certificate.steps[0]); },'mapping'],
    [e => { e.certificate.steps[0].kind = 'affine'; },'malformed'],
    [e => { e.certificate.targetToSource[1] = 99; },'mapping'],
    [e => { delete e.certificate.targetToSource[1]; },'mapping'],
    [e => { e.certificate.targetToSource[1] = '1'; },'mapping'],
  ];
  for (const [mutate,code] of mutations) {
    const e = structuredClone(base); mutate(e);
    const result = checkCertificate(e.source,e.target,e.certificate);
    assert.equal(result.accepted,false); assert.equal(result.code,code);
  }
  for (const bad of [null,[],{},'certificate']) assert.equal(checkCertificate(base.source,base.target,bad).accepted,false);
});

test('accepted transport is isolated from input mutations and rejects invalid wire zero', () => {
  const e = structuredClone(examples()[0]);
  const result = checkCertificate(e.source,e.target,e.certificate);
  const before = result.lift([1,2]);
  e.certificate.steps[2].value = 0; e.certificate.targetToSource.reverse(); e.source.nVars = 1;
  assert.deepEqual(result.lift([1,2]),before);
  assert.throws(() => result.lift([0,2]),TypeError);
  assert.throws(() => result.lift([1,5]),TypeError);
  assert.throws(() => result.project([0,2,2,2,1]),TypeError);
});

test('oracle enforces an explicit exhaustive enumeration budget', () => {
  assert.throws(() => [...assignments({p:251,nVars:8})],RangeError);
});

test('systematic F_3 family: every accepted certificate preserves the public relation and witnesses', (t) => {
  // 729 source rows t*(alpha*a + beta*t + gamma) = delta*a + epsilon*t + zeta.
  // Four proposals each: t=0, t=1, t=2, t=a. Targets are built directly here,
  // independently of the checker's polynomial expansion and substitution code.
  const lc = (coefficients) => coefficients.map((c,i) => [i,c % 3]).filter(([,c]) => c);
  const counts = { accepted:0, rejectedEquivalent:0, rejectedInequivalent:0 };
  for (let encoded = 0; encoded < 3**6; encoded++) {
    let digits = encoded;
    const [alpha,beta,gamma,delta,epsilon,zeta] = Array.from({length:6}, () => {
      const digit = digits % 3; digits = Math.floor(digits / 3); return digit;
    });
    const source = {p:3,nVars:3,public:['a'],rows:[[
      [[2,1]],lc([gamma,alpha,beta]),lc([zeta,delta,epsilon]),
    ]]};
    for (const replacement of [0,1,2,'a']) {
      const alias = replacement === 'a';
      const target = {p:3,nVars:2,public:['a'],rows:[alias
        ? [[[1,1]],lc([gamma,alpha+beta]),lc([zeta,delta+epsilon])]
        : [lc([replacement]),lc([beta*replacement+gamma,alpha]),lc([epsilon*replacement+zeta,delta])],
      ]};
      const certificate = {version:1,targetToSource:[0,1],steps:[alias
        ? {kind:'alias',wire:2,to:1,row:0}
        : {kind:'constant',wire:2,value:replacement,row:0}]};
      const checked = checkCertificate(source,target,certificate);
      const oracle = compareRelations(source,target);
      if (checked.accepted) {
        counts.accepted++;
        assert.equal(oracle.equivalent,true,`unsound acceptance: ${encoded}, ${replacement}`);
        for (const w of assignments(source)) if (satisfies(source,w)) assert.ok(satisfies(target,checked.project(w)));
        for (const v of assignments(target)) if (satisfies(target,v)) {
          assert.ok(satisfies(source,checked.lift(v)));
          assert.deepEqual(checked.project(checked.lift(v)),v);
        }
      } else counts[oracle.equivalent ? 'rejectedEquivalent' : 'rejectedInequivalent']++;
    }
  }
  assert.equal(counts.accepted+counts.rejectedEquivalent+counts.rejectedInequivalent,2916);
  assert.ok(counts.accepted > 0 && counts.rejectedEquivalent > 0 && counts.rejectedInequivalent > 0);
  t.diagnostic(JSON.stringify(counts));
});
