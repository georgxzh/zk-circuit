// Test-only encoder, deliberately permitting malformed header/term values.
export function encode(s) {
  const integer = (n,width) => { const b=Buffer.alloc(width); let v=BigInt(n);
    for(let i=0;i<width;i++) { b[i]=Number(v&255n); v>>=8n; } return b; };
  const u32=(x)=>integer(x,4),u64=(x)=>integer(x,8);
  const header=Buffer.concat([u32(32),integer(s.p,32),u32(s.nVars),u32(s.nOutputs),u32(s.nPubInputs),
    u32(s.nPrvInputs),u64(s.nLabels),u32(s.rows.length)]);
  const rows=Buffer.concat(s.rows.flat().flatMap((lc)=>[u32(lc.length),...lc.flatMap(([i,c])=>[u32(i),integer(c,32)])]));
  const sections=[header,rows,Buffer.concat(s.labelsByWire.map(u64))]
    .map((body,i)=>Buffer.concat([u32(i+1),u64(body.length),body]));
  return Buffer.concat([Buffer.from('r1cs'),u32(1),u32(3),...sections]);
}
