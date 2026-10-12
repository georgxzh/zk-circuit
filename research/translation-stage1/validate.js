import { parsePair, ArtifactError, need } from './artifacts.js';
import { checkCertificate, polynomial, canonical, substitute, mentions } from './checker.js';

// Untrusted proposal construction. The checker independently replays every step.
// Compiler maps supply replacement expressions, not proof that they are valid.
export function proposeCertificate({source,targetToSource,proposals}) {
  const retained = new Set(targetToSource), pending = new Set();
  for (let i=1; i<source.nVars; i++) if (!retained.has(i)) pending.add(i);
  const active = new Set(Array.from({length:source.nVars},(_,i) => i));
  let rows = source.rows.map((r) => polynomial(r,source.p));
  const steps = [];
  while (pending.size) {
    let progress = false;
    for (const wire of pending) {
      const candidate = proposals.get(wire);
      let step;
      if (!candidate) {
        if (rows.some((r) => mentions(r,wire))) continue;
        step = {kind:'unused',wire};
      } else {
        if (candidate.kind === 'alias' && (!active.has(candidate.to) || candidate.to === wire)) continue;
        const expected = polynomial([[],[],[[wire,1n],
          [candidate.kind === 'alias' ? candidate.to : 0,candidate.kind === 'alias' ? -1n : -candidate.value]]],source.p);
        const row = rows.findIndex((r) => canonical(r,source.p) === canonical(expected,source.p));
        if (row === -1) continue;
        step = {...candidate,row};
        rows = rows.map((r) => substitute(r,wire,candidate.kind === 'alias' ? candidate.to : 0,
          candidate.kind === 'alias' ? 1n : candidate.value,source.p));
      }
      steps.push(step); pending.delete(wire); active.delete(wire); progress = true;
    }
    need(progress,'missing-evidence','cannot justify all proposed eliminations or unused wires');
  }
  return {version:1,steps,targetToSource};
}

export function validatePair(raw,expected) {
  try {
    const pair = parsePair(raw,expected);
    const certificate = proposeCertificate(pair);
    const checked = checkCertificate(pair.source,pair.target,certificate);
    return {...checked,certificate,source:pair.source,target:pair.target,hashes:pair.hashes};
  } catch (error) {
    if (!(error instanceof ArtifactError)) throw error;
    return {accepted:false,code:error.code,reason:error.message};
  }
}
