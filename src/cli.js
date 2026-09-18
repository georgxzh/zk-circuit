import { readFileSync } from 'node:fs';
import { classify, quantizeInput, parseField } from './reference.js';

const usage = 'Usage: node src/cli.js <classify|quantize|statement> (one JSON object on stdin)';
try {
  const [command, ...extra] = process.argv.slice(2);
  if (extra.length || !['classify', 'quantize', 'statement'].includes(command)) throw new Error(usage);
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'), (_, value, context) => {
      // Inspect the original token so fractional text cannot round into an integer.
      if (typeof value === 'number'
          && /^-?(?:0|[1-9][0-9]*)$/.exec(context.source)?.[0] !== context.source) {
        throw new Error('non-integer numeric token');
      }
      return value;
    });
  } catch { throw new Error('stdin must contain valid JSON with integer numeric tokens; use strings for rationals'); }
  const keys = command === 'statement' ? ['x', 'salt'] : ['x'];
  if (!input || Array.isArray(input) || typeof input !== 'object'
      || Object.keys(input).length !== keys.length || keys.some((key) => !Object.hasOwn(input, key))) {
    throw new Error(`expected exactly these object fields: ${keys.join(', ')}`);
  }
  let result;
  if (command === 'classify') result = classify(input.x);
  if (command === 'quantize') result = { x: quantizeInput(input.x) };
  if (command === 'statement') {
    const { publicStatement } = await import('./commitment.js');
    result = { publicSignals: await publicStatement(input.x, parseField(input.salt)) };
  }
  process.stdout.write(`${JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value)}\n`);
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exitCode = 1;
}
