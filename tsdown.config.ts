import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', png: 'src/png.ts', payloads: 'src/payloads.ts', render: 'src/render.ts', secure: 'src/secure.ts', styled: 'src/styled.ts', logo: 'src/logo.ts', decode: 'src/decode.ts', advanced: 'src/advanced.ts' },
  format: ['esm', 'cjs'],
  target: 'es2020',
  // package.json exports refer to .js/.cjs and .d.ts/.d.cts.
  fixedExtension: false,
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
})
