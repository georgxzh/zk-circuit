import { checkCertificate } from './checker.js';
import { compareRelations } from './oracle.js';
import { examples } from './examples.js';

for (const example of examples()) {
  const result = checkCertificate(example.source, example.target, example.certificate);
  const oracle = compareRelations(example.source, example.target);
  console.log(JSON.stringify({ example: example.name, checker: result.accepted ? 'accept' : 'reject',
    rejection: result.code ?? null, oracle }));
}
