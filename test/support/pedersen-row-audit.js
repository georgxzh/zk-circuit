import assert from 'node:assert/strict';
import { GENERATORS, SUBGROUP_ORDER } from '../../src/pedersen-parameters.js';
import { add, mod } from './pedersen-oracle.js';
import { wire } from './r1cs.js';

// Index emitted quadratic polynomials, allowing nonzero rescaling of a row.
function polynomial([a,b,c]) {
  const terms = new Map();
  const put = (i,j,v) => {
    const key = i < j ? i+','+j : j+','+i;
    terms.set(key,mod((terms.get(key) ?? 0n)+v));
  };
  for (const [i,x] of a) for (const [j,y] of b) put(i,j,x*y);
  for (const [i,x] of c) put(0,i,-x);
  return [...terms].filter(([,v]) => v !== 0n).sort(([a],[b]) => a.localeCompare(b));
}
export function audit(circuit) {
  const index = new Map();
  circuit.constraints.forEach((row,i) => {
    const poly = polynomial(row), key = poly.map(([k]) => k).join(';');
    if (!index.has(key)) index.set(key,[]);
    index.get(key).push({ poly,i });
  });
  const checked = new Set(), trace = [];
  let family = "classifier";
  function find(a,b,c) {
    const want = polynomial([a,b,c]), key = want.map(([k]) => k).join(';');
    const match = index.get(key)?.find(({poly}) => poly.every(([,v],j) =>
      mod(v*want[0][1]-want[j][1]*poly[0][1]) === 0n));
    assert.ok(match,'missing emitted equation with monomials '+key);
    assert.ok(!checked.has(match.i), "duplicate expected row");
    checked.add(match.i);
    trace.push({family,row:match.i});
    return match.i;
  }
  const w = (name) => wire(circuit,'main.'+name);
  const term = (name,c=1n) => [w(name),c];
  const linear = (...terms) => find([],[],terms);
  const link = (a,b) => linear(term(a),term(b,-1n));
  const constant = (name,v) => linear(term(name),[0,-v]);
  function bitify(name,n) {
    const outer = family; family = name;
    const terms = [term(name+'.in',-1n)];
    for (let j=0;j<n;j++) {
      const bit = term(name+'.out['+j+']');
      find([bit],[bit,[0,-1n]],[]);
      terms.push([bit[0],1n<<BigInt(j)]);
    }
    linear(...terms);
    family = outer;
  }
  function adder(name) {
    const outer = family; family = name;
    const t = (s,c=1n) => term(name+'.'+s,c);
    find([t('x1')],[t('y2')],[t('beta')]);
    find([t('y1')],[t('x2')],[t('gamma')]);
    find([t('x1',-168700n),t('y1')],[t('x2'),t('y2')],[t('delta')]);
    find([t('beta')],[t('gamma')],[t('tau')]);
    find([[0,1n],t('tau',168696n)],[t('xout')],[t('beta'),t('gamma')]);
    find([[0,1n],t('tau',-168696n)],[t('yout')],
      [t('delta'),t('beta',168700n),t('gamma',-1n)]);
    family = outer;
  }
  for (let i=0;i<4;i++) {
    link('classifier.u['+i+']','u['+i+']');
    link('classifier.inputBits['+i+'].in','classifier.u['+i+']');
    bitify('classifier.inputBits['+i+']',4);
  }
  link('classifier.label','label');
  linear(term('classifier.score'),...[3n,-2n,1n,4n].map((v,i) =>
    term('classifier.u['+i+']',-v)),[0,53n]);
  linear(term('classifier.shiftedScore'),term('classifier.score',-1n),[0,-128n]);
  link('classifier.scoreBits.in','classifier.shiftedScore');
  bitify('classifier.scoreBits',8);
  link('classifier.label','classifier.scoreBits.out[7]');
  find([term('classifier.label')],[term('classifier.label'),[0,-1n]],[]);
  family = 'packing';
  linear(term('m'),...[1n,16n,256n,4096n].map((v,i) => term('u['+i+']',-v)));
  link('messageBits.in','m'); bitify('messageBits',16);
  family = 'scalarBound';
  link('scalarBits.in','r'); bitify('scalarBits',251);
  link('scalarBound.in[0]','r');
  constant('scalarBound.in[1]',SUBGROUP_ORDER);
  linear(term('scalarBound.n2b.in'),term('scalarBound.in[0]',-1n),
    term('scalarBound.in[1]'),[0,-(1n<<251n)]);
  bitify('scalarBound.n2b',252);
  linear(term('scalarBound.out'),term('scalarBound.n2b.out[251]'),[0,-1n]);
  const strictBoundRow = constant('scalarBound.out',1n);
  for (const [name,base,n,source] of [
    ['messageMul',GENERATORS.G,16,'messageBits'],
    ['blinderMul',GENERATORS.H,251,'scalarBits'],
  ]) {
    family = name;
    let point = base;
    constant(name+'.acc[0][0]',0n); constant(name+'.acc[0][1]',1n);
    for (let j=0;j<n;j++) {
      const bit = name+'.bits['+j+']', selected = name+'.selected['+j+']';
      link(bit,source+'.out['+j+']');
      find([term(bit)],[term(bit),[0,-1n]],[]);
      linear(term(selected+'[0]'),term(bit,-point[0]));
      linear(term(selected+'[1]'),term(bit,1n-point[1]),[0,-1n]);
      const prefix = name+'.adders['+j+']';
      link(prefix+'.x1',name+'.acc['+j+'][0]');
      link(prefix+'.y1',name+'.acc['+j+'][1]');
      link(prefix+'.x2',selected+'[0]'); link(prefix+'.y2',selected+'[1]');
      adder(prefix);
      link(name+'.acc['+(j+1)+'][0]',prefix+'.xout');
      link(name+'.acc['+(j+1)+'][1]',prefix+'.yout');
      point = add(point,point);
    }
    link(name+'.out[0]',name+'.acc['+n+'][0]');
    link(name+'.out[1]',name+'.acc['+n+'][1]');
  }
  family = 'commitment';
  link('sum.x1','messageMul.out[0]'); link('sum.y1','messageMul.out[1]');
  link('sum.x2','blinderMul.out[0]'); link('sum.y2','blinderMul.out[1]');
  adder('sum');
  const xRow = link('commitmentX','sum.xout');
  const yRow = link('commitmentY','sum.yout');
  assert.equal(checked.size,circuit.nConstraints,'uninspected or duplicate O0 rows');
  return { strictBoundRow,xRow,yRow,rows:checked.size,trace };
}
