// Builds /assets/web3d/ from src/. Run: npm ci && npm run build (in web3d/).
// Output is committed, because GitHub Pages serves the repo as-is.
// CI rebuilds it and fails if the committed files differ from the source.
import { build } from 'esbuild';
import { readdirSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outdir = fileURLToPath(new URL('../assets/web3d/', import.meta.url));
mkdirSync(outdir, { recursive: true });
for (const f of readdirSync(outdir)) {
  if (f.endsWith('.js')) rmSync(outdir + f); // images stay
}

await build({
  entryPoints: { websites: fileURLToPath(new URL('./src/websites.js', import.meta.url)) },
  bundle: true,
  splitting: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  outdir,
  entryNames: '[name]',
  chunkNames: '[name]-[hash]',
  legalComments: 'eof',
  logLevel: 'info',
});
