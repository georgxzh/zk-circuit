import { readFileSync } from 'node:fs';
import { FIELD_MODULUS as p, classify } from '../../src/reference.js';
import { circuitInput } from '../../src/circuit-input.js';

const small = (name,outputs,inputs=[]) => ({id:name,name,source:`research/translation-stage2/circuits/${name}.circom`,outputs,inputs,sanity:2});
export const corpus = [
  ...[
    ['alias',[],['main.a']],['interface',['main.out'],['main.a','main.b','main.c']],['nonunique',[],['main.a']],
  ].map(([name,outputs,inputs]) => ({...small(name,outputs,inputs),source:`research/translation-stage1/circuits/${name}.circom`})),
  small('nested',Array.from({length:8},(_,i) => `main.y[${i}]`)),
  small('selection',['main.selected','main.less']),
  small('inverse',['main.zero'],['main.x']),
  small('publics',['main.out[0]','main.out[1]'],['main.a']),
  small('affine',['main.y']),
  {...small('unsat',[],['main.a']),unsatisfiable:true},
  {...small('arithmetic',[],['main.label']),source:'test/circuits/arithmetic.circom'},
  {...small('hash',['main.out']),source:'test/circuits/hash.circom'},
  {...small('inference',[],['main.commitment','main.label']),source:'circuits/inference.circom'},
];
for (const name of ['nested','inference']) corpus.push({...corpus.find((c) => c.name === name),id:`${name}-sanity0`,sanity:0});

// Explicitly public synthetic inputs; no user data or witnesses are persisted.
export function samples(name) {
  const values = [0n,1n,7n,9007199254740993n,p-1n];
  switch (name) {
    case 'alias': return [{a:0},{a:1}];
    case 'interface': return values.map((x) => ({a:x,b:x,c:7,x,spare:p-1n}));
    case 'nonunique': return values.flatMap((x) => [{a:x,t:0},{a:0,t:x}]);
    case 'nested': return values.map((x) => ({x:Array.from({length:8},(_,i) => (x+BigInt(i))%p)}));
    case 'selection': return [{x:0,y:255,choose:0},{x:255,y:0,choose:1},{x:7,y:7,choose:1}];
    case 'inverse': return values.map((x) => ({x}));
    case 'publics': return [{a:0},{a:1}];
    case 'affine': return values.map((x) => ({x,unused:p-1n}));
    case 'unsat': return [];
    case 'hash': return values.map((x) => ({inputs:[1n,x,2n,3n,4n,5n]}));
    case 'arithmetic': return [[-8,-8,-8,-8],[7,7,7,7],[1,1,0,1],[0,0,0,0]]
      .map((x) => ({u:x.map((v) => v+8),label:classify(x).label}));
    case 'inference': return JSON.parse(readFileSync(new URL('../../spec/commitment-vectors.json',import.meta.url))).vectors
      .map((v) => circuitInput(v.x,BigInt(v.salt),[v.commitment,v.label]));
    default: throw new Error(`unknown sample fixture: ${name}`);
  }
}
