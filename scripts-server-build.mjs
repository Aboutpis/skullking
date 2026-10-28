import {build} from 'esbuild';
await build({entryPoints:['server/index.mjs'],outfile:'.build/worker.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022',external:['cloudflare:workers']});
