import { openProofSession } from '../src/proof.js';
import { parsePublicSignals } from '../src/reference.js';

let session;
try {
  const [command, ...args] = process.argv.slice(2);
  if ((command !== 'prove' && command !== 'verify') || args.length !== (command === 'verify' ? 2 : 0)) {
    throw new Error('Usage: prove OR verify COMMITMENT LABEL');
  }
  if (command === 'verify') parsePublicSignals(args);
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > 65536) throw new Error('Input too large');
  }
  const input = JSON.parse(text);
  session = await openProofSession({ proving: command === 'prove' });
  if (command === 'prove') {
    console.log(JSON.stringify(await session.prove(input)));
  } else {
    const verified = await session.verify(input, args);
    console.log(JSON.stringify({ verified }));
    if (!verified) process.exitCode = 1;
  }
} catch {
  // Do not echo private stdin or exception text. The pinned witness runtime may
  // separately report assertion locations on stderr; the circuit contains no logs.
  console.error('Proof command failed. Check command arguments, canonical input, and local setup.');
  process.exitCode = 1;
} finally {
  await session?.close();
}
