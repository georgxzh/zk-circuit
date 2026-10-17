import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { groth16, wtns, zKey } from 'snarkjs';
import { openProofSession } from '../src/pedersen-proof.js';
import { artifactNames, loadProofArtifacts, proofDirectory, proofSpec,
  profileSha256, sha256 } from '../src/pedersen-proof-artifacts.js';
import { loadProofArtifacts as loadPoseidon, proofDirectory as poseidonDirectory } from '../src/proof-artifacts.js';
import { circuitInput } from '../src/pedersen-circuit-input.js';
import { SUBGROUP_ORDER as ell } from '../src/pedersen-parameters.js';
import { FIELD_MODULUS as p } from '../src/reference.js';
import { root } from '../scripts/compiler.js';

const {vectors} = JSON.parse(await readFile(new URL('../spec/pedersen-vectors.json',import.meta.url)));
const signals = v => [...v.commitment,v.label];
const input = v => circuitInput(v.x,BigInt(v.r),signals(v));
const copy = structuredClone;
const packets = new Map();
const logger = {info(){},warn(){},error(){},debug(){}};
let session,artifacts;
before(async () => {
  artifacts=await loadProofArtifacts({proving:true});
  session=await openProofSession({proving:true});
});
after(async () => { await session?.close(); });
const wasm = () => artifacts.files['pedersen-inference.wasm'];
const r1cs = () => artifacts.files['pedersen-inference.r1cs'];
const key = () => artifacts.files['pedersen_final.zkey'];

for (const v of vectors) test('EC4 Groth16 fixture: '+v.id,async () => {
  const packet=await session.prove(await input(v));
  assert.deepEqual(packet.publicSignals,signals(v));
  assert.equal(packet.variant,proofSpec.variant);
  assert.equal(packet.profileSha256,profileSha256);
  assert.equal(await session.verify(packet,signals(v)),true);
  assert.deepEqual(Object.keys(packet).sort(),
    ['profileSha256','proof','publicSignals','variant','verificationKeySha256']);
  packets.set(v.id,packet);
});

test('EC4 repeats use fresh proof randomness for the same opening',async () => {
  const again=await session.prove(await input(vectors[0]));
  assert.deepEqual(again.publicSignals,packets.get('positive').publicSignals);
  assert.notDeepEqual(again.proof,packets.get('positive').proof);
});

test('EC4 fixed-opening wrong labels, valid wrong commitments, and different vectors fail witnesses',async () => {
  for (const v of vectors.slice(0,5)) {
    const bad=await input(v); bad.label=v.label === '1' ? '0':'1';
    await assert.rejects(session.prove(bad));
    await assert.rejects(wtns.calculate(bad,wasm(),{type:'mem'}));
  }
  const wrong=await input(vectors[0]);
  [wrong.commitmentX,wrong.commitmentY]=vectors[1].commitment;
  await assert.rejects(session.prove(wrong));
  await assert.rejects(wtns.calculate(wrong,wasm(),{type:'mem'}));
  const different=await input(vectors[0]); different.u=['8','8','8','8'];
  await assert.rejects(session.prove(different));
  await assert.rejects(wtns.calculate(different,wasm(),{type:'mem'}));
});

test('EC4 parser and raw WASM reject feature and scalar ranges independently',async () => {
  for (let i=0;i<4;i++) for (const value of ['16',String(p-1n)]) {
    const bad=await input(vectors[0]); bad.u[i]=value;
    await assert.rejects(session.prove(bad));
    await assert.rejects(wtns.calculate(bad,wasm(),{type:'mem'}));
  }
  for (const r of [ell,ell+1n,(1n<<251n)-1n,1n<<251n,p-1n]) {
    const bad={commitmentX:'0',commitmentY:'1',label:'0',u:['0','0','0','0'],r:String(r)};
    await assert.rejects(session.prove(bad));
    await assert.rejects(wtns.calculate(bad,wasm(),{type:'mem'}));
  }
  // Field aliases are a transport error; raw WASM reduction is not parser validation.
  for (const change of [{r:String(p)},{r:'01'},{r:'-1'},{label:'2'},
    {u:[String(p+9n),'8','8','9']},{commitmentX:String(p)},{commitmentX:'00'},
    {commitmentX:'0',commitmentY:'0'},{commitmentX:'0',commitmentY:String(p-1n)}]) {
    await assert.rejects(session.prove({...await input(vectors[0]),...change}));
  }
});

test('EC4 invalid raw witness fails R1CS and pairing even if low-level prove runs',async () => {
  const witness={type:'mem'};
  await wtns.calculate(await input(vectors[0]),wasm(),witness);
  assert.equal(await wtns.check(r1cs(),witness,logger),true);
  const data=Buffer.from(witness.data);
  assert.equal(data.subarray(0,4).toString(),'wtns'); assert.equal(data.readUInt32LE(4),2);
  let offset=12,found=false;
  for (let i=0;i<data.readUInt32LE(8);i++) {
    const section=data.readUInt32LE(offset), length=Number(data.readBigUInt64LE(offset+4));
    offset+=12;
    if (section === 2) {
      assert.equal(data[offset+96],1); // public label is wire 3, 32 bytes per element
      data[offset+96]=0; found=true;
    }
    offset+=length;
  }
  assert.equal(found,true);
  assert.equal(await wtns.check(r1cs(),data,logger),false);
  const invalid=await groth16.prove(key(),data);
  assert.equal(await groth16.verify(artifacts.verificationKey,invalid.publicSignals,invalid.proof),false);
  const packet={...packets.get('positive'),...invalid};
  assert.equal(await session.verify(packet,invalid.publicSignals),false);
});

test('EC4 pairing binds each public coordinate and label; application binds expected statement',async () => {
  const original=packets.get('positive'), expected=signals(vectors[0]);
  // Individual coordinate changes may be off-curve as commitments, but remain
  // canonical field inputs to the pairing verifier; this bypasses point parsing.
  for (const index of [0,1,2]) {
    const changed=[...expected];
    changed[index]=index === 2 ? '0':String((BigInt(changed[index])+1n)%p);
    assert.equal(await groth16.verify(artifacts.verificationKey,changed,original.proof),false);
    assert.equal(await session.verify({...original,publicSignals:changed},expected),false);
  }
  for (const expectedClaim of [[...vectors[1].commitment,'1'],[...vectors[0].commitment,'0']]) {
    assert.equal(await session.verify(original,expectedClaim),false);
    assert.equal(await session.verify({...original,publicSignals:expectedClaim},expectedClaim),false);
    assert.equal(await groth16.verify(artifacts.verificationKey,expectedClaim,original.proof),false);
  }
});

test('EC4 malformed statements and packets fail closed',async () => {
  const original=packets.get('positive'), expected=signals(vectors[0]);
  for (const changed of [[],expected.slice(0,2),[...expected,'0'],[expected[1],expected[0],'1'],
    [expected[0],expected[1],'2'],[expected[0],expected[1],1],['0','0','1'],
    ['0',String(p-1n),'1'],[String(p),expected[1],'1'],
    [String(BigInt(expected[0])+p),expected[1],'1'],['0'+expected[0],expected[1],'1'],
    [expected[0]+'\n',expected[1],'1']]) {
    assert.equal(await session.verify({...original,publicSignals:changed},expected),false);
  }
  for (const packet of [null,{},[],{...original,r:'0'},{...original,verificationKey:artifacts.verificationKey}]) {
    assert.equal(await session.verify(packet,expected),false);
  }
  await assert.rejects(session.verify(original,['0','0','1']));
  await assert.rejects(session.verify(original,[...expected,'0']));
});

test('EC4 malformed proof encodings, context and key identities are rejected',async () => {
  const original=packets.get('positive'), expected=signals(vectors[0]);
  for (const change of [
    q=>{q.proof.pi_a=q.proof.pi_c;}, q=>{q.proof.pi_a=['0','0','1'];},
    q=>{q.proof.pi_a[0]='-1';}, q=>{q.proof.pi_a[0]='0'.repeat(1000);},
    q=>{q.proof.pi_a[0]='21888242871839275222246405745257275088696311157297823662689037894645226208583';},
    q=>{q.proof.pi_a[2]='0';}, q=>{q.proof.pi_b[2]=['0','0'];},
    q=>{q.proof.pi_b[0]=['1'];}, q=>{q.proof.curve='bls12381';},
    q=>{q.proof.protocol='plonk';}, q=>{q.proof.extra='0';},
    q=>{q.variant='poseidon';}, q=>{q.profileSha256='0'.repeat(64);},
    q=>{q.verificationKeySha256='0'.repeat(64);},
  ]) {
    const bad=copy(original); change(bad);
    assert.equal(await session.verify(bad,expected),false);
  }
});

test('EC4 different valid key and Poseidon key/packet substitutions fail',async () => {
  const original=packets.get('positive');
  const otherFile={type:'mem'};
  await zKey.contribute(key(),otherFile,'Public synthetic key substitution test',randomBytes(64).toString('hex'));
  const otherKey=await zKey.exportVerificationKey(otherFile);
  assert.equal(otherKey.nPublic,3);
  assert.equal(await groth16.verify(otherKey,original.publicSignals,original.proof),false);
  const witness={type:'mem'};
  await wtns.calculate(await input(vectors[0]),wasm(),witness);
  const otherPacket=await groth16.prove(otherFile,witness);
  // Even spoofing the selected key/profile metadata cannot rescue a foreign proof.
  assert.equal(await session.verify({...original,...otherPacket},signals(vectors[0])),false);
  const poseidon=await loadPoseidon({proving:true});
  await assert.rejects(loadProofArtifacts({directory:poseidonDirectory}),/manifest/);
  const {vectors:pv}=JSON.parse(await readFile(new URL('../spec/commitment-vectors.json',import.meta.url)));
  const v=pv[0], pw={type:'mem'};
  await wtns.calculate({commitment:v.commitment,label:v.label,salt:v.salt,
    u:v.x.map(x=>String(x+8))},poseidon.files['inference.wasm'],pw);
  const pp=await groth16.prove(poseidon.files['inference_final.zkey'],pw);
  assert.equal(await session.verify({...original,...pp},signals(vectors[0])),false);
  assert.equal(await session.verify({...original,proof:pp.proof},signals(vectors[0])),false);
});

test('EC4 local manifest binds profile, interface, artifact digests, and safe generation paths',async () => {
  const directory=await mkdtemp(join(proofDirectory,'test-integrity-'));
  const generation=join(directory,artifacts.manifest.generation);
  await mkdir(generation);
  const writeManifest=m=>writeFile(join(directory,'setup.json'),JSON.stringify(m));
  await writeManifest(artifacts.manifest);
  await writeFile(join(generation,'verification_key.json'),artifacts.files['verification_key.json']);
  assert.equal((await loadProofArtifacts({directory})).verificationKeySha256,artifacts.verificationKeySha256);
  await assert.rejects(loadProofArtifacts({directory,proving:true}));
  for (const change of [
    m=>{m.variant='poseidon';},m=>{m.profileSha256='0'.repeat(64);},
    m=>{m.generation='../escape';},m=>{m.powersOfTau=11;},
    m=>{m.publicSignals=['label','commitmentX','commitmentY'];},
    m=>{m.sha256['pedersen-inference.r1cs']='0'.repeat(64);},
    m=>{m.sha256['pedersen-inference.wasm']='0'.repeat(64);},
    m=>{delete m.sha256['pedersen_final.zkey'];},
  ]) {
    const m=copy(artifacts.manifest); change(m); await writeManifest(m);
    await assert.rejects(loadProofArtifacts({directory}),/manifest/);
  }
  await writeManifest(artifacts.manifest);
  for (const name of artifactNames) await writeFile(join(generation,name),artifacts.files[name]);
  for (const name of artifactNames) {
    await writeFile(join(generation,name),'corrupted');
    await assert.rejects(loadProofArtifacts({directory,proving:true}),/integrity failure/);
    await writeFile(join(generation,name),artifacts.files[name]);
  }
  const poseidon=await loadPoseidon(), badKey=Buffer.from(JSON.stringify(poseidon.verificationKey));
  const m=copy(artifacts.manifest); m.sha256['verification_key.json']=sha256(badKey);
  await writeManifest(m); await writeFile(join(generation,'verification_key.json'),badKey);
  await assert.rejects(loadProofArtifacts({directory}),/key interface/);
});

test('EC4 expected statements and packets are snapshotted; operations are sequential',async () => {
  const packet=copy(packets.get('positive')), expected=signals(vectors[0]);
  const pending=session.verify(packet,expected);
  packet.publicSignals[2]='0'; expected[2]='0';
  await assert.rejects(session.verify(packets.get('positive'),signals(vectors[0])),/sequential/);
  await assert.rejects(session.close(),/busy/);
  assert.equal(await pending,true);
});

test('EC4 CLI proves from private stdin, verifies explicit signals, and hides errors',async () => {
  const run=(args,stdin)=>spawnSync(process.execPath,['scripts/pedersen-proof-cli.js',...args],
    {cwd:root,input:stdin,encoding:'utf8',timeout:120000,windowsHide:true});
  const proved=run(['prove'],JSON.stringify(await input(vectors[0])));
  assert.equal(proved.status,0,proved.stderr); assert.equal(proved.stderr,'');
  const verified=run(['verify',...signals(vectors[0])],proved.stdout);
  assert.equal(verified.status,0,verified.stderr);
  assert.deepEqual(JSON.parse(verified.stdout),{verified:true});
  const wrong=run(['verify',...vectors[0].commitment,'0'],proved.stdout);
  assert.equal(wrong.status,1); assert.deepEqual(JSON.parse(wrong.stdout),{verified:false});
  for (const [args,stdin] of [[['verify'],'{}'],[['prove'],'PRIVATE_SENTINEL'],
    [['prove'],JSON.stringify({...await input(vectors[0]),label:'0'})],
    [['prove'],'x'.repeat(65537)]]) {
    const failed=run(args,stdin);
    assert.equal(failed.status,1); assert.equal(failed.stdout,'');
    assert.match(failed.stderr,/Pedersen proof command failed/);
    assert.doesNotMatch(failed.stderr,/PRIVATE_SENTINEL/);
  }
});

test('EC4 setup reuse preserves the selected key and baseline setup',async () => {
  const before=await readFile(join(proofDirectory,'setup.json'));
  const baseline=await readFile(join(poseidonDirectory,'setup.json'));
  const result=spawnSync(process.execPath,['scripts/setup-pedersen-proofs.js'],
    {cwd:root,encoding:'utf8',timeout:120000,windowsHide:true});
  assert.equal(result.status,0,result.stderr); assert.match(result.stdout,/Existing validated Pedersen setup/);
  assert.deepEqual(await readFile(join(proofDirectory,'setup.json')),before);
  assert.deepEqual(await readFile(join(poseidonDirectory,'setup.json')),baseline);
});

test('EC4 verification-only deployment needs only its trusted manifest and key',async () => {
  await session.close(); await session.close();
  await assert.rejects(session.verify(packets.get('positive'),signals(vectors[0])),/closed/);
  const directory=await mkdtemp(join(proofDirectory,'test-verifier-'));
  await mkdir(join(directory,artifacts.manifest.generation));
  await writeFile(join(directory,'setup.json'),JSON.stringify(artifacts.manifest));
  await writeFile(join(directory,artifacts.manifest.generation,'verification_key.json'),
    artifacts.files['verification_key.json']);
  const verifier=await openProofSession({directory});
  try {
    assert.equal(await verifier.verify(packets.get('positive'),signals(vectors[0])),true);
    await assert.rejects(verifier.prove(await input(vectors[0])),/no proving material/);
  } finally { await verifier.close(); }
});
