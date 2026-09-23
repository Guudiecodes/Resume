import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  plugins: [
    obfuscatorPlugin({
      apply: 'build', // don't obfuscate during `npm run dev` — only production builds
      // Your obfuscation settings have to live inside `options`, or this
      // plugin ignores them entirely and falls back to javascript-obfuscator's
      // own defaults — that was the bug in the version you pasted.
      options: {
        rotateStringArray: true,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayIndexShift: true,
        stringArrayRotate: true,
        stringArrayShuffle: true,
        splitStrings: true,
        splitStringsChunkLength: 10,
        compact: true,
        controlFlowFlattening: false, // enable only if you confirm it doesn't break the pinned ScrollTrigger timelines in main.js
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        debugProtection: false, // keep false — true breaks opening devtools to debug your own build
        disableConsoleOutput: true,
        identifierNamesGenerator: 'mangled',
        renameGlobals: false,
        transformObjectKeys: true,
        unicodeEscapeSequence: false,
      },
    }),
    viteSingleFile({
      // Real options only — removeConsole / removeDebugger / maxSizeInKb
      // aren't part of this plugin's API and were silently doing nothing.
      useRecommendedBuildConfig: true,
      removeViteModuleLoader: true,
    }),
  ],
  build: {
    minify: 'esbuild',
    cssMinify: true,
    cssCodeSplit: false,
    target: 'esnext',
    sourcemap: false,
    // useRecommendedBuildConfig above already sets assetsInlineLimit and
    // rollupOptions.output.inlineDynamicImports for you — left out here so
    // there's one source of truth instead of two configs that could drift.
  },
});