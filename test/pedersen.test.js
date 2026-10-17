import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  packInput, unpackInput, parseEncodedInput, parseScalar, scalarElement, parsePoint,
  parsePublicSignals, commitInput, publicStatement, checkOpening, randomBlindingScalar,
  SUBGROUP_ORDER as ell, GENERATORS, PEDERSEN_ID,
} from '../src/pedersen.js';
import { sampleScalarFrom } from '../src/pedersen-random.js';
import { classify } from '../src/reference.js';
import { p, O, mod, onCurve, add, multiply, commitment } from './support/pedersen-oracle.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url));
const fixture = JSON.parse(read('spec/pedersen-vectors.json'));
const vectors = fixture.vectors;
const strings = (point) => point.map(String);
const x0 = [-8,-8,-8,-8];

test('async APIs snapshot caller input, point, and expected statement before awaiting', async () => {
  const v = vectors[0], x = [...v.x];
  const statement = publicStatement(x, BigInt(v.r)); // First call: cold initialization.
  x.fill(-8);
  assert.deepEqual(await statement,[...v.commitment,v.label]);
  const pointText = [...v.commitment], pendingPoint = parsePoint(pointText);
  pointText.fill('0');
  assert.deepEqual(await pendingPoint,v.commitment.map(BigInt));
  const openingX = [...v.x], signals = [...v.commitment,v.label];
  const pendingCheck = checkOpening(openingX,BigInt(v.r),signals);
  openingX.fill(-8); signals.fill('0');
  assert.equal(await pendingCheck,true);
  const input = [...v.x], pendingCommit = commitInput(input,BigInt(v.r));
  input.fill(-8);
  assert.deepEqual(await pendingCommit,v.commitment.map(BigInt));
  const publicInput = [...v.commitment,v.label], pendingParse = parsePublicSignals(publicInput);
  publicInput.fill('0');
  assert.deepEqual(await pendingParse,{commitment:v.commitment.map(BigInt),label:BigInt(v.label)});
});

test('EC1 source/parameter audit passes and public fixtures identify its exact manifest', () => {
  const result = execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/check-pedersen-parameters.js',import.meta.url))],
    {encoding:'utf8',windowsHide:true});
  assert.equal(JSON.parse(result).status,'PASS');
  assert.equal(fixture.variant,PEDERSEN_ID);
  assert.match(fixture.note,/PUBLIC SYNTHETIC/);
  assert.equal(createHash('sha256').update(read('spec/pedersen-parameters.json')).digest('hex'),fixture.parametersSha256);
  assert.equal(vectors.length,13);
  assert.throws(()=>{GENERATORS.G[0]=0n;},TypeError);
  assert.throws(()=>{GENERATORS.H=[];},TypeError);
});

test('packing/unpacking exhaust all 65,536 inputs with feature zero in the low nibble', () => {
  const seen = new Set();
  let zeros = 0;
  for(let a=-8;a<=7;a++) for(let b=-8;b<=7;b++)
  for(let c=-8;c<=7;c++) for(let d=-8;d<=7;d++) {
    const x=[a,b,c,d], expected=(a+8)+16*(b+8)+256*(c+8)+4096*(d+8);
    const m=packInput(x);
    assert.equal(m,BigInt(expected));
    assert.deepEqual(unpackInput(m),x.map(BigInt));
    seen.add(m);
    if(classify(x).score===0n) { assert.equal(classify(x).label,1n); zeros++; }
  }
  assert.equal(seen.size,65536); assert.equal(zeros,930);
  assert.equal(packInput([-7,-8,-8,-8]),1n);
  assert.equal(packInput([-8,-7,-8,-8]),16n);
  assert.equal(packInput([0,0,0,0]),34952n);
  assert.deepEqual(unpackInput(65535),[7n,7n,7n,7n]);
});

test('packing and encoded-feature parsers reject ranges, fractional/coerced values and sparse arrays', () => {
  for(const x of [[],[0,0,0],[0,0,0,0,0],new Array(4),null,'0000']) assert.throws(()=>packInput(x));
  for(let i=0;i<4;i++) for(const bad of [-9,8,0.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'0',null,undefined,true]) {
    const x=[0,0,0,0]; x[i]=bad; assert.throws(()=>packInput(x));
  }
  for(const m of [-1n,65536n,ell,p,1.5,'0',undefined,NaN]) assert.throws(()=>unpackInput(m));
  assert.deepEqual(parseEncodedInput(['0','15','8','1']),[0n,15n,8n,1n]);
  for(const v of [new Array(4),['16','0','0','0'],['-1','0','0','0'],['00','0','0','0'],[0,'0','0','0']]) {
    assert.throws(()=>parseEncodedInput(v));
  }
});

const malformed = ['', '00','01','-0','-1','+1',' 1','1 ','1\n','1\r\n','1.0','1e0','0x1',
  '١','1_000',0,1n,null,undefined,true,{},new String('1')];

test('canonical scalar parsing enforces ell rather than the coordinate modulus or bit length', () => {
  for(const r of [0n,1n,1n<<250n,ell-1n]) {
    assert.equal(parseScalar(r.toString()),r); assert.equal(scalarElement(r),r);
  }
  for(const r of [...malformed,ell.toString(),(ell+1n).toString(),((1n<<251n)-1n).toString(),p.toString(),'9'.repeat(10000)]) {
    assert.throws(()=>parseScalar(r));
  }
  for(const r of [-1n,ell,p,0,'0',undefined]) assert.throws(()=>scalarElement(r));
});

test('affine point parser accepts subgroup points and identity without reducing encodings', async () => {
  for(const point of [O,GENERATORS.G,GENERATORS.H,...vectors.map(v=>v.commitment.map(BigInt))]) {
    assert.deepEqual(await parsePoint(strings(point)),point);
  }
  for(const value of malformed) {
    await assert.rejects(parsePoint([value,'1']));
    await assert.rejects(parsePoint(['0',value]));
  }
  for(const point of [[],['0'],['0','1','0'],new Array(2),null,new Uint8Array(32),['0','0'],['1','1'],
    [p.toString(),'1'],['0',p.toString()],[(p+GENERATORS.G[0]).toString(),GENERATORS.G[1].toString()]]) {
    await assert.rejects(parsePoint(point));
  }
});

test('on-curve points outside the prime subgroup are rejected, including mixed torsion', async () => {
  const torsion=[0n,p-1n];
  const fullGenerator=[
    995203441582195749578291179787384436505546430278305826713579947235728471134n,
    5472060717959818805561601436314318772137091100104008585924551046643952123905n,
  ];
  for(const point of [torsion,fullGenerator,add(GENERATORS.G,torsion)]) {
    assert.ok(onCurve(point)); assert.notDeepEqual(multiply(point,ell),O);
    await assert.rejects(parsePoint(strings(point)),RangeError);
  }
  assert.deepEqual(await parsePoint(['0','1']),O);
});

test('public interface is exactly X,Y,label with a canonical Boolean label', async () => {
  assert.deepEqual(await parsePublicSignals(['0','1','0']),{commitment:O,label:0n});
  for(const label of [...malformed,'2',ell.toString()]) {
    await assert.rejects(parsePublicSignals(['0','1',label]));
  }
  for(const signals of [[],['0','1'],['0','1','0','0'],new Array(3),null]) {
    await assert.rejects(parsePublicSignals(signals));
  }
  const v=vectors[0];
  await assert.rejects(parsePublicSignals([v.commitment[1],v.commitment[0],v.label]));
});

test('all 13 public fixtures agree with established arithmetic and an independent group calculation', async () => {
  for(const v of vectors) {
    const r=BigInt(v.r), expected=v.commitment.map(BigInt);
    assert.equal(packInput(v.x),BigInt(v.m));
    assert.deepEqual(classify(v.x),{score:BigInt(v.score),label:BigInt(v.label)});
    assert.deepEqual(commitment(v.x,r,GENERATORS.G,GENERATORS.H),expected,v.id);
    assert.deepEqual(await commitInput(Object.freeze([...v.x]),r),expected,v.id);
    assert.deepEqual(await publicStatement(v.x,r),[...v.commitment,v.label]);
    assert.equal(await checkOpening(v.x,r,[...v.commitment,v.label]),true);
  }
});

test('zero scalars, identity, one-message generator, and maximal scalar have expected group behavior', async () => {
  assert.deepEqual(await commitInput(x0,0n),O);
  assert.deepEqual(await publicStatement(x0,0n),['0','1','0']);
  assert.deepEqual(await commitInput([-7,-8,-8,-8],0n),GENERATORS.G);
  assert.deepEqual(await commitInput(x0,1n),GENERATORS.H);
  assert.deepEqual(await commitInput(x0,ell-1n),[mod(-GENERATORS.H[0]),GENERATORS.H[1]]);
  assert.deepEqual(add(GENERATORS.H,await commitInput(x0,ell-1n)),O);
  const result=await commitInput(x0,1n); result[0]=0n;
  assert.deepEqual(await commitInput(x0,1n),GENERATORS.H);
});

test('corners and spread of subgroup scalars cross-check independent arithmetic', async () => {
  for(let i=0;i<32;i++) {
    const x=i<16 ? [0,1,2,3].map(j=>(i>>j)&1?7:-8)
      : [i%16-8,(3*i+1)%16-8,(7*i+2)%16-8,(11*i+3)%16-8];
    const r=(ell-1n)*BigInt(i)/31n;
    assert.deepEqual(await commitInput(x,r),commitment(x,r,GENERATORS.G,GENERATORS.H));
  }
});

test('local opening checks reject fixed-opening mismatches and distinguish malformed points', async () => {
  for(const v of [vectors[0],vectors.find(v=>v.id==='zero')]) {
    const r=BigInt(v.r), signals=[...v.commitment,v.label];
    assert.equal(await checkOpening(v.x,r,[...v.commitment,v.label==='1'?'0':'1']),false);
    assert.equal(await checkOpening(v.x,r+1n,signals),false);
    assert.equal(await checkOpening(v.x,r,[...strings(GENERATORS.H),v.label]),false);
    assert.equal(await checkOpening([0,0,0,0],r,signals),false);
    await assert.rejects(checkOpening(v.x,r,['0','0',v.label]),RangeError);
  }
  const v=vectors[0];
  assert.equal(await checkOpening([0,1,0,1],BigInt(v.r),[...v.commitment,v.label]),false);
});

test('commitment APIs reject invalid blinders and features without implicit defaults', async () => {
  for(const r of [-1n,ell,ell+1n,p,'0',0,undefined]) {
    await assert.rejects(commitInput(x0,r));
    await assert.rejects(publicStatement(x0,r));
    await assert.rejects(checkOpening(x0,r,['0','1','0']));
  }
  for(const x of [[8,0,0,0],[-9,0,0,0],new Array(4),['0',0,0,0]]) {
    await assert.rejects(commitInput(x,0n));
    await assert.rejects(publicStatement(x,0n));
    await assert.rejects(checkOpening(x,0n,['0','1','0']));
  }
});

test('scalar sampling uses full 32-byte big-endian rejection with exact boundaries', () => {
  const bytes=(n)=>Buffer.from(n.toString(16).padStart(64,'0'),'hex');
  const draws=[bytes(ell),bytes((1n<<251n)-1n),bytes(p),Buffer.alloc(32,255),bytes(ell-1n)];
  let calls=0;
  assert.equal(sampleScalarFrom((size)=>{assert.equal(size,32);calls++;return draws.shift();}),ell-1n);
  assert.equal(calls,5);
  for(const n of [0n,1n,1n<<248n]) assert.equal(sampleScalarFrom(()=>bytes(n)),n);
  const backing=Buffer.concat([Buffer.alloc(5,255),bytes(1n),Buffer.alloc(7,255)]);
  assert.equal(sampleScalarFrom(()=>backing.subarray(5,37)),1n);
  assert.equal(sampleScalarFrom(()=>new Uint8Array(32)),0n);
  for(const invalid of [Buffer.alloc(31),Buffer.alloc(33),new Uint16Array(32),Array(32).fill(0),null,'bytes']) {
    assert.throws(()=>sampleScalarFrom(()=>invalid),TypeError);
  }
  assert.throws(()=>sampleScalarFrom(()=>{throw new Error('entropy unavailable');}),/entropy unavailable/);
  // Range smoke check only, not a statistical claim about entropy or independence.
  for(let i=0;i<8;i++) {const r=randomBlindingScalar();assert.ok(r>=0n&&r<ell);}
});
