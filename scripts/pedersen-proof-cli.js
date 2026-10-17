import { openProofSession } from '../src/pedersen-proof.js';
import { parsePublicSignals } from '../src/pedersen.js';

let session;
try {
  const [command,...args] = process.argv.slice(2);
  if ((command !== 'prove' && command !== 'verify') ||
      args.length !== (command === 'verify' ? 3 : 0)) {
    throw new Error('Usage: prove OR verify COMMITMENT_X COMMITMENT_Y LABEL');
  }
  if (command === 'verify') await parsePublicSignals(args);
  let text='';
  for await (const chunk of process.stdin) {
    text+=chunk;
    if (text.length > 65536) throw new Error('Input too large');
  }
  const input = JSON.parse(text);
  session = await openProofSession({proving:command === 'prove'});
  if (command === 'prove') console.log(JSON.stringify(await session.prove(input)));
  else {
    const verified = await session.verify(input,args);
    console.log(JSON.stringify({verified}));
    if (!verified) process.exitCode=1;
  }
} catch {
  // Never echo private stdin or exception contents. The witness runtime may
  // report assertion locations to stderr; the circuit contains no logging.
  console.error('Pedersen proof command failed. Check arguments, canonical input, and local setup.');
  process.exitCode=1;
} finally { await session?.close(); }
