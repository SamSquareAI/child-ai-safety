import { build } from 'esbuild';
import { Ajv2020 } from 'ajv/dist/2020.js';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'site');
await mkdir(output, { recursive: true });
const schema = JSON.parse(await readFile(resolve(root, 'src/protocol.schema.json'), 'utf8'));
const ajv = new Ajv2020({
  strict: true, allErrors: false, coerceTypes: false, useDefaults: false,
  removeAdditional: false, ownProperties: true, code: { source: true, esm: true },
});
ajv.addSchema(schema);
const definitions = Object.fromEntries(['profile', 'authority', 'capabilities', 'assessment', 'request', 'result', 'identifier']
  .map(name => ['valid' + name[0].toUpperCase() + name.slice(1), schema.$id + '#/$defs/' + name]));
const validators = standaloneCode(ajv, definitions);
await build({
  entryPoints: [resolve(root, 'demo/main.js')], bundle: true, format: 'esm',
  platform: 'browser', target: 'es2022', minify: true, outfile: resolve(output, 'main.js'),
  plugins: [{
    name: 'precompiled-browser-validation',
    setup(plugin) {
      plugin.onLoad({ filter: /[\/]src[\/]protocol.ts$/ }, () => ({
        contents: validators, loader: 'js', resolveDir: root,
      }));
    },
  }],
});
for (const file of ['index.html', 'style.css']) {
  await copyFile(resolve(root, 'demo', file), resolve(output, file));
}
await copyFile(resolve(root, 'docs/assets/browser-demo-outage.png'), resolve(output, 'demo-preview.png'));
await writeFile(resolve(output, '.nojekyll'), '');
console.log('Browser demo built in site/. Validators were compiled at build time.');
