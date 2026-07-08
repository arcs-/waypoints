#!/usr/bin/env bun
// Typecheck the app's own code. The vendored SDK and some deps (@protontech/crypto) ship
// TypeScript *source*, so vue-tsc necessarily pulls them into the program — and they don't
// pass this project's stricter flags (hundreds of upstream diagnostics we can't fix here;
// see proton-sdk/VENDORED.md for the keep-pristine policy). So: run vue-tsc over everything,
// then fail only on diagnostics in our files (src/, root *.ts) or path-less config errors.
import { spawnSync } from 'node:child_process';

const res = spawnSync('bunx', ['vue-tsc', '--noEmit', '--pretty', 'false'], { encoding: 'utf8' });
if (res.error) {
  console.error(`typecheck: failed to run vue-tsc: ${res.error.message}`);
  process.exit(1);
}

const FOREIGN = /^(node_modules[/\\]|\.\.[/\\]proton-sdk[/\\])/;
const kept = [];
let keep = false;
for (const line of `${res.stdout ?? ''}${res.stderr ?? ''}`.split('\n')) {
  // A diagnostic is one `path(line,col): error TS…` (or path-less `error TS…`) line followed
  // by indented elaboration lines; keep/drop the whole block by its first line.
  if (/^\S/.test(line)) keep = /\berror TS\d+/.test(line) && !FOREIGN.test(line);
  if (keep && line.trimEnd()) kept.push(line);
}

if (kept.length) {
  console.error(kept.join('\n'));
  console.error(`\ntypecheck: ${kept.filter((l) => /^\S/.test(l)).length} error(s) in app code.`);
  process.exit(1);
}
console.log('typecheck: app code clean (vendored-SDK/dependency diagnostics ignored)');
