// Entirely synthetic, hand-written systems. Coefficients are canonicalized here
// for readability; the checker itself rejects noncanonical serialized values.
export function examples(p = 5) {
  const mod = (n) => ((n % p)+p)%p;
  const lc = (terms) => terms.map(([i,c]) => [i,mod(c)]).filter(([,c]) => c !== 0);
  const linear = (terms) => [[], [], lc(terms)];
  const eq = (i,j) => linear([[i,1],[j,-1]]);
  const constant = (i,c) => linear([[i,1],[0,-c]]);
  const sys = (nVars, publics, rows) => ({ p, nVars, public: publics, rows });
  const cert = (targetToSource, steps = []) => ({ version: 1, steps, targetToSource });
  const alias = (wire,to,row) => ({ kind:'alias', wire,to,row });
  const fixed = (wire,value,row) => ({ kind:'constant',wire,value:mod(value),row });
  const unused = (wire) => ({ kind:'unused', wire });
  const allA = sys(2,['a'],[]), zeroA = sys(2,['a'],[constant(1,0)]);
  const chainSource = sys(5,['a'],[eq(2,3),eq(3,1),constant(4,1),[[[2,1]],[[4,1]],[[1,1]]]]);
  const chainCert = cert([0,1],[alias(2,3,0),alias(3,1,1),fixed(4,1,2)]);
  const publicEqSource = sys(4,['a','b'],[eq(3,1),eq(3,2)]);
  const publicEqTarget = sys(3,['a','b'],[eq(1,2)]);
  const publicConstantSource = sys(3,['a'],[constant(2,1),eq(1,2)]);
  const freeSource = sys(3,['a'],[]);
  const nonlinearSource = sys(3,['a'],[[[[2,1]],[[1,1]],[]]]);
  const nonlinearCert = cert([0,1],[fixed(2,1,0)]);
  const privatePermutationSource = sys(4,['a'],[[[[2,1]],[[3,1]],[[1,1]]],constant(2,1)]);
  const privatePermutationTarget = sys(4,['a'],[[[[3,1]],[[2,1]],[[1,1]]],constant(3,1)]);
  return [
    {name:'alias-chain-constant',source:chainSource,target:allA,certificate:chainCert,accepted:true,equivalent:true},
    {name:'public-equality-retained',source:publicEqSource,target:publicEqTarget,
      certificate:cert([0,1,2],[alias(3,1,0)]),accepted:true,equivalent:true},
    {name:'public-equality-dropped',source:publicEqSource,target:sys(3,['a','b'],[]),
      certificate:cert([0,1,2],[alias(3,1,0)]),accepted:false,code:'residual-mismatch',equivalent:false},
    {name:'public-constant-retained',source:publicConstantSource,target:sys(2,['a'],[constant(1,1)]),
      certificate:cert([0,1],[fixed(2,1,0)]),accepted:true,equivalent:true},
    {name:'public-constant-dropped',source:publicConstantSource,target:allA,
      certificate:cert([0,1],[fixed(2,1,0)]),accepted:false,code:'residual-mismatch',equivalent:false},
    {name:'unused-private',source:freeSource,target:allA,
      certificate:cert([0,1],[unused(2)]),accepted:true,equivalent:true},
    {name:'nonunique-retained',source:nonlinearSource,target:structuredClone(nonlinearSource),
      certificate:cert([0,1,2]),accepted:true,equivalent:true},
    {name:'crucial-invalid-t-equals-one',source:nonlinearSource,target:zeroA,
      certificate:nonlinearCert,accepted:false,code:'unjustified-substitution',equivalent:false},
    {name:'unjustified-but-equivalent',source:freeSource,target:allA,
      certificate:cert([0,1],[fixed(2,1,0)]),accepted:false,code:'pivot',equivalent:true},
    {name:'constrained-wire-not-unused',source:nonlinearSource,target:allA,
      certificate:cert([0,1],[unused(2)]),accepted:false,code:'not-unused',equivalent:true},
    {name:'wrong-constant',source:publicConstantSource,target:sys(2,['a'],[constant(1,0)]),
      certificate:cert([0,1],[fixed(2,0,0)]),accepted:false,code:'unjustified-substitution',equivalent:false},
    {name:'missing-elimination',source:chainSource,target:allA,
      certificate:cert([0,1],[alias(2,3,0),fixed(4,1,2)]),accepted:false,code:'mapping',equivalent:true},
    {name:'out-of-range-dependency',source:chainSource,target:allA,
      certificate:cert([0,1],[alias(2,9,0)]),accepted:false,code:'dependency',equivalent:true},
    {name:'dependency-already-eliminated',source:sys(4,['a'],[eq(2,1),eq(3,2)]),target:allA,
      certificate:cert([0,1],[alias(2,1,0),alias(3,2,1)]),accepted:false,code:'dependency',equivalent:true},
    {name:'cyclic-aliases',source:sys(4,['a'],[eq(2,3)]),target:allA,
      certificate:cert([0,1],[alias(2,3,0),alias(3,2,0)]),accepted:false,code:'cycle',equivalent:true},
    {name:'self-cycle',source:sys(3,['a'],[eq(2,1)]),target:allA,
      certificate:cert([0,1],[alias(2,2,0)]),accepted:false,code:'cycle',equivalent:true},
    {name:'public-slot-swap',source:sys(3,['a','b'],[]),target:sys(3,['a','b'],[]),
      certificate:cert([0,2,1]),accepted:false,code:'interface',equivalent:true},
    {name:'constant-wire-remap',source:allA,target:allA,
      certificate:cert([1,0]),accepted:false,code:'interface',equivalent:true},
    {name:'duplicate-retained-map',source:sys(3,['a'],[]),target:sys(3,['a'],[]),
      certificate:cert([0,1,1]),accepted:false,code:'mapping',equivalent:true},
    {name:'missing-retained-map',source:sys(3,['a'],[]),target:sys(3,['a'],[]),
      certificate:cert([0,1]),accepted:false,code:'mapping',equivalent:true},
    {name:'private-permutation',source:privatePermutationSource,target:privatePermutationTarget,
      certificate:cert([0,1,3,2]),accepted:true,equivalent:true},
    {name:'constant-nonlinear-collapse',source:sys(3,['a'],[constant(2,0),[[[2,1]],[[2,1]],[]]]),target:allA,
      certificate:cert([0,1],[fixed(2,0,0)]),accepted:true,equivalent:true},
    {name:'empty-public-interface',source:sys(2,[],[constant(1,1)]),target:sys(1,[],[]),
      certificate:cert([0],[fixed(1,1,0)]),accepted:true,equivalent:true},
    {name:'unsatisfiable-residual',source:sys(3,['a'],[constant(2,0),constant(2,1)]),
      target:sys(2,['a'],[linear([[0,1]])]),certificate:cert([0,1],[fixed(2,0,0)]),accepted:true,equivalent:true},
    {name:'row-scaling-and-reordering',source:sys(3,['a'],[eq(2,1),[[[2,1]],[[2,1]],[[2,1]]],constant(1,1)]),
      target:sys(2,['a'],[constant(1,1),[[[1,mod(-1)]],[[1,1]],[[1,mod(-1)]]]]),
      certificate:cert([0,1],[alias(2,1,0)]),accepted:true,equivalent:true},
    {name:'duplicate-row-deleted',source:sys(2,['a'],[constant(1,0),constant(1,0)]),target:zeroA,
      certificate:cert([0,1]),accepted:false,code:'residual-mismatch',equivalent:true},
  ];
}
