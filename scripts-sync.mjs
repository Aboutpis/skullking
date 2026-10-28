import {copyFile,mkdir} from 'node:fs/promises';
await mkdir('web',{recursive:true});
for(const file of ['engine.mjs','scenarios.mjs','transport.mjs'])await copyFile(`shared/${file}`,`web/${file}`);
