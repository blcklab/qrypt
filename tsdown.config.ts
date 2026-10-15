import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts', png: 'src/png.ts' },
  format: ['esm', 'cjs'],
  target: 'es2020',
  dts: true,
  clean: true,
  minify: false,
  sourcemap: true,
})
