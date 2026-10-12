import { createHash } from 'node:crypto';
import { BN254, LIMITS } from './checker.js';

export class ArtifactError extends Error {
  constructor(code,message) { super(message); this.code = code; }
}
export function need(condition,code,message) {
  if (!condition) throw new ArtifactError(code,message);
}
const MAX_BYTES = 1_000_000;
const MAX_LABELS = 64;
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Independent bounded reader of standard R1CS v1 sections 1, 2, 3.
// Reject rather than ignore extensions, duplicate sections/terms, or trailing bytes.
export function parseR1cs(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length <= MAX_BYTES,'binary','invalid R1CS buffer/size');
  function reader(buffer) {
    let offset = 0;
    const take = (n) => {
      need(Number.isSafeInteger(n) && n >= 0 && offset+n <= buffer.length,'binary','truncated R1CS');
      const part = buffer.subarray(offset,offset+n); offset += n; return part;
    };
    const u32 = () => take(4).readUInt32LE();
    const bigint = (n) => { let value = 0n; const part = take(n);
      for (let i = part.length-1; i >= 0; i--) value = (value << 8n) + BigInt(part[i]); return value; };
    const size = () => { const n = bigint(8); need(n <= BigInt(MAX_BYTES),'binary','oversized section'); return Number(n); };
    return {take,u32,bigint,size,end:() => need(offset === buffer.length,'binary','trailing section data')};
  }
  const file = reader(bytes);
  need(file.take(4).equals(Buffer.from('r1cs')) && file.u32() === 1,'binary','unsupported R1CS magic/version');
  need(file.u32() === 3,'binary','expected exactly three standard sections');
  const sections = new Map();
  for (let i=0; i<3; i++) {
    const id = file.u32(), length = file.size();
    need([1,2,3].includes(id) && !sections.has(id),'binary','unknown/duplicate R1CS section');
    sections.set(id,file.take(length));
  }
  file.end();
  const h = reader(sections.get(1));
  need(h.u32() === 32,'field','expected 32-byte BN254 scalar field');
  const p = h.bigint(32);
  need(p === BN254,'field','unexpected scalar field');
  const nVars = h.u32(), nOutputs = h.u32(), nPubInputs = h.u32(), nPrvInputs = h.u32();
  const labels = h.bigint(8), nRows = h.u32(); h.end();
  need(nVars >= 1 && nVars <= LIMITS.wires && labels >= BigInt(nVars) && labels <= BigInt(MAX_LABELS)
    && nOutputs+nPubInputs < nVars && nPrvInputs < Number(labels) && nRows <= LIMITS.rows,
  'binary','header outside Stage 1 bounds');
  const nLabels = Number(labels), c = reader(sections.get(2)), rows = [];
  for (let r=0; r<nRows; r++) {
    const row = [];
    for (let part=0; part<3; part++) {
      const count = c.u32(), lc = [], seen = new Set();
      need(count <= nVars,'binary','oversized linear combination');
      for (let j=0; j<count; j++) {
        const wire = c.u32(), value = c.bigint(32);
        need(wire < nVars && !seen.has(wire) && value > 0n && value < p,
          'binary','duplicate/out-of-range wire or noncanonical coefficient');
        seen.add(wire); lc.push([wire,value]);
      }
      row.push(lc);
    }
    rows.push(row);
  }
  c.end();
  const m = reader(sections.get(3)), labelsByWire = [];
  for (let i=0; i<nVars; i++) {
    const label = m.bigint(8);
    need(label < labels,'mapping','wire label outside header bounds'); labelsByWire.push(Number(label));
  }
  m.end();
  need(labelsByWire[0] === 0 && new Set(labelsByWire).size === nVars,'mapping','constant/duplicate wire labels');
  return { p,nVars,nOutputs,nPubInputs,nPrvInputs,nLabels,rows,labelsByWire };
}

export function parseSym(bytes, system) {
  need(Buffer.isBuffer(bytes) && bytes.length <= MAX_BYTES,'symbols','invalid symbol buffer');
  const text = bytes.toString('utf8').trim();
  const entries = new Map(), names = new Set(), wires = new Set();
  for (const line of text ? text.split(/\r?\n/) : []) {
    const match = /^(\d+),(-1|\d+),(\d+),([A-Za-z_][A-Za-z0-9_.\[\]]*)$/.exec(line);
    need(match,'symbols','malformed symbol row');
    const [,a,b,c,name] = match, label = Number(a), wire = Number(b), component = Number(c);
    need(Number.isSafeInteger(label) && label > 0 && label < system.nLabels
      && Number.isSafeInteger(wire) && (wire === -1 || (wire > 0 && wire < system.nVars))
      && Number.isSafeInteger(component) && !entries.has(label) && !names.has(name),
    'symbols','invalid/duplicate symbol');
    if (wire !== -1) {
      need(!wires.has(wire) && system.labelsByWire[wire] === label,'symbols','symbol/binary wire map disagreement');
      wires.add(wire);
    }
    entries.set(label,{wire,component,name}); names.add(name);
  }
  need(entries.size === system.nLabels-1 && wires.size === system.nVars-1,
    'symbols','incomplete symbol or witness coverage');
  return entries;
}

// Restricted JSON grammar used by Circom substitution maps. Unlike JSON.parse,
// this rejects duplicate keys before they can silently overwrite each other.
export function parseSubstitutions(bytes) {
  need(Buffer.isBuffer(bytes) && bytes.length <= MAX_BYTES,'substitutions','invalid substitution buffer');
  const input = bytes.toString('utf8'); let at = 0;
  const whitespace = () => { while (/[ \t\r\n]/.test(input[at] ?? '') && at < input.length) at++; };
  const consume = (s) => { whitespace(); need(input[at] === s,'substitutions','malformed substitution JSON'); at++; };
  const string = () => { whitespace(); const m = /^"(0|[1-9][0-9]*)"/.exec(input.slice(at));
    need(m && m[1].length <= 78,'substitutions','expected bounded canonical decimal string');
    at += m[0].length; return m[1]; };
  function object(depth) {
    consume('{'); const result = new Map(); whitespace();
    if (input[at] !== '}') while (true) {
      const key = string(); need(!result.has(key),'substitutions','duplicate substitution key'); consume(':');
      result.set(key,depth === 0 ? object(1) : string()); whitespace();
      if (input[at] !== ',') break; at++;
    }
    consume('}'); return result;
  }
  const result = object(0); whitespace();
  need(at === input.length,'substitutions','trailing substitution JSON'); return result;
}

export function parsePair(raw, expected) {
  const keys = ['sourceR1cs','targetR1cs','sourceSym','targetSym','substitutions'].sort();
  need(raw && typeof raw === 'object' && Object.keys(raw).length === keys.length
    && Object.keys(raw).sort().every((key,i) => key === keys[i]),'binary','unexpected/missing artifact bundle keys');
  need(expected && typeof expected === 'object','interface','missing expected public manifest');
  const source = parseR1cs(raw.sourceR1cs), target = parseR1cs(raw.targetR1cs);
  const ss = parseSym(raw.sourceSym,source), ts = parseSym(raw.targetSym,target);
  need(source.nLabels === target.nLabels && source.nVars === source.nLabels,
    'mapping','Stage 1 requires a fully retained O0 label universe shared with O1');
  need(Array.isArray(expected.outputs) && Array.isArray(expected.inputs)
    && [...expected.outputs,...expected.inputs].every((x) => typeof x === 'string')
    && new Set([...expected.outputs,...expected.inputs]).size === expected.outputs.length+expected.inputs.length,
  'interface','invalid expected public manifest');
  for (const [s,symbols] of [[source,ss],[target,ts]]) {
    need(s.nOutputs === expected.outputs.length && s.nPubInputs === expected.inputs.length,
      'interface','public output/input counts differ from expected manifest');
    const names = [...expected.outputs,...expected.inputs];
    for (let i=0; i<names.length; i++) need(symbols.get(s.labelsByWire[i+1])?.name === names[i],
      'interface','ordered public identity differs from expected manifest');
    s.public = names.map((name,i) => `${i < s.nOutputs ? 'output' : 'input'}:${name}`);
  }
  for (const [label,a] of ss) {
    const b = ts.get(label);
    need(b && a.name === b.name && a.component === b.component,'symbols','O0/O1 label identity differs');
  }
  const sourceWire = new Map(source.labelsByWire.map((label,i) => [label,i]));
  const targetToSource = target.labelsByWire.map((label) => sourceWire.get(label));
  const retained = new Set(targetToSource), proposals = new Map();
  for (const [labelString,rhs] of parseSubstitutions(raw.substitutions)) {
    const label = Number(labelString), wire = sourceWire.get(label);
    need(Number.isSafeInteger(label) && wire !== undefined && wire > source.public.length && !retained.has(wire),
      'substitutions','substitution for unknown, public, constant, or retained wire');
    need(rhs.size <= 1,'unsupported','only aliases/constants supported in Stage 1');
    let step = {kind:'constant',wire,value:0n};
    for (const [dependencyString,valueString] of rhs) {
      const dependency = Number(dependencyString), value = BigInt(valueString);
      need(Number.isSafeInteger(dependency) && sourceWire.has(dependency) && value < BN254,
        'substitutions','unknown dependency or noncanonical coefficient');
      if (dependency === 0) step = {kind:'constant',wire,value};
      else {
        need(value === 1n,'unsupported','only unit aliases supported');
        step = {kind:'alias',wire,to:sourceWire.get(dependency)};
      }
    }
    proposals.set(wire,step);
  }
  const core = (s) => ({p:s.p,nVars:s.nVars,public:s.public,rows:s.rows});
  return {source:core(source),target:core(target),targetToSource,proposals,
    hashes:Object.fromEntries(Object.entries(raw).map(([key,value]) => [key,hash(value)]))};
}
