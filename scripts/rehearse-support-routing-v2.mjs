import { rehearseSupportRouting } from '../evaluation/support-routing-v2.mjs';
try {
  if (process.argv.length !== 2) throw new Error('arguments');
  console.log(JSON.stringify(await rehearseSupportRouting(), null, 2));
} catch {
  console.error('Offline support-routing rehearsal failed. No provider calls were made.');
  process.exitCode = 1;
}
