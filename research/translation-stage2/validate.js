import { ArtifactError, need, parsePair } from '../translation-stage1/artifacts.js';
import { checkCertificate as coreCheck, polynomial, canonical, createReplay } from '../translation-stage1/checker.js';

export const LIMITS = Object.freeze({wires:4096,rows:4096,labels:8192,bytes:16_000_000,terms:128,products:1_000_000});
export const checkCertificate = (s,t,c) => coreCheck(s,t,c,LIMITS);

// Compiler replacements remain proposals. Index only possible current pivots;
// the separate core checker rechecks every chosen pivot and the complete residual.
export function proposeCertificate({source,targetToSource,proposals}) {
  // Some compiler aliases point to other eliminated labels, including constants.
  // Resolve the proposal DAG, but require a current defining row for each result.
  const normalized = new Map(), visiting = new Set();
  function resolve(wire) {
    if (normalized.has(wire)) return normalized.get(wire);
    need(!visiting.has(wire),'cycle','cyclic compiler substitutions');
    visiting.add(wire); const c = proposals.get(wire); let resolved = c;
    if (c.kind === 'alias' && proposals.has(c.to)) {
      const rhs = resolve(c.to);
      resolved = rhs.kind === 'constant' ? {kind:'constant',wire,value:rhs.value} : {kind:'alias',wire,to:rhs.to};
    }
    visiting.delete(wire); normalized.set(wire,resolved); return resolved;
  }
  for (const wire of proposals.keys()) resolve(wire);
  const retained = new Set(targetToSource), active = new Set(Array.from({length:source.nVars},(_,i) => i));
  const pending = new Set([...active].filter((i) => !retained.has(i)));
  const replay = createReplay(source.rows.map((r) => polynomial(r,source.p)),source.p);
  const pivots = new Map(), rowKeys = new Map();
  function indexRow(id) {
    const old = rowKeys.get(id); if (old) pivots.get(old).delete(id);
    rowKeys.delete(id);
    const row = replay.rows[id];
    if (row.size < 1 || row.size > 2 || [...row.keys()].some((key) => !key.startsWith('0,'))) return;
    const key = canonical(row,source.p);
    if (!pivots.has(key)) pivots.set(key,new Set()); pivots.get(key).add(id); rowKeys.set(id,key);
  }
  replay.rows.forEach((_,i) => indexRow(i));
  const steps = [];
  while (pending.size) {
    let progress = false;
    for (const wire of pending) {
      const c = normalized.get(wire); let step;
      if (!c) {
        if (replay.using(wire).size) continue;
        step = {kind:'unused',wire};
      } else {
        if (c.kind === 'alias' && (!active.has(c.to) || c.to === wire)) continue;
        const key = canonical(polynomial([[],[],[[wire,1n],[c.kind === 'alias' ? c.to : 0,
          c.kind === 'alias' ? -1n : -c.value]]],source.p),source.p);
        const row = pivots.get(key)?.values().next().value;
        if (row === undefined) continue;
        step = {...c,row};
        replay.replace(wire,c.kind === 'alias' ? c.to : 0,c.kind === 'alias' ? 1n : c.value).forEach(indexRow);
      }
      steps.push(step); active.delete(wire); pending.delete(wire); progress = true;
    }
    need(progress,'missing-evidence',`unsupported or unjustified eliminations: ${[...pending].slice(0,8).join(',')}`);
  }
  return {version:1,steps,targetToSource};
}

export function validatePair(raw,expected) {
  try {
    const pair = parsePair(raw,expected,LIMITS), certificate = proposeCertificate(pair);
    return {...checkCertificate(pair.source,pair.target,certificate),certificate,
      source:pair.source,target:pair.target,hashes:pair.hashes};
  } catch (error) {
    if (!(error instanceof ArtifactError)) throw error;
    return {accepted:false,code:error.code,reason:error.message};
  }
}
