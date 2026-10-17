import {ArtifactError,parsePair} from '../translation-stage1/artifacts.js';
import {checkCertificate as coreCheck} from '../translation-stage1/checker.js';
import {proposeCertificate} from '../translation-stage2/validate.js';

// Separate EC profile. Original Stage 0/1/2 limits and rules stay unchanged.
// 251/252-bit recomposition needs up to 253 terms in one linear combination.
export const LIMITS=Object.freeze({
  wires:8192,rows:8192,labels:8192,bytes:16_000_000,terms:512,products:1_000_000,
});
export const expected=Object.freeze({outputs:Object.freeze([]),
  inputs:Object.freeze(['main.commitmentX','main.commitmentY','main.label'])});
export const checkCertificate=(source,target,certificate)=>coreCheck(source,target,certificate,LIMITS);
export function validatePair(raw,publicInterface=expected) {
  try {
    const pair=parsePair(raw,publicInterface,LIMITS), certificate=proposeCertificate(pair);
    return {...checkCertificate(pair.source,pair.target,certificate),certificate,
      source:pair.source,target:pair.target,hashes:pair.hashes};
  } catch(error) {
    if(!(error instanceof ArtifactError)) throw error;
    return {accepted:false,code:error.code,reason:error.message};
  }
}
