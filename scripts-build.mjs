import {readFile,writeFile,mkdir,rm,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex').slice(0,16),out='dist';
await rm(out,{recursive:true,force:true});await mkdir(`${out}/assets`,{recursive:true});
const assets=new Map();
for(const file of await readdir('web/assets')){const bytes=await readFile(`web/assets/${file}`),dot=file.lastIndexOf('.'),target=`assets/${file.slice(0,dot)}.${hash(bytes)}${file.slice(dot)}`;assets.set(`assets/${file}`,target);await writeFile(`${out}/${target}`,bytes);}
const replaceAssets=text=>{for(const [source,target] of assets)text=text.replaceAll(source,target);return text;};
const modules=new Map();
async function moduleFile(file){if(modules.has(file))return modules.get(file);let text=await readFile(`web/${file}`,'utf8');const dependencies=[...text.matchAll(/from ['"]\.\/([^'"]+\.mjs)['"]/g)];for(const m of dependencies){const target=await moduleFile(m[1]);text=text.replace(m[0],`from './${target.split('/').at(-1)}'`);}text=replaceAssets(text);const name=`assets/${file.replace('.mjs','')}.${hash(text)}.mjs`;modules.set(file,name);await writeFile(`${out}/${name}`,text);return name;}
const app=await moduleFile('app.mjs');
const css=replaceAssets(await readFile('web/style.css','utf8')).replaceAll("url('assets/","url('./"),style=`assets/style.${hash(css)}.css`;await writeFile(`${out}/${style}`,css);
let html=await readFile('web/index.html','utf8');html=html.replace('href="style.css"',`href="${style}"`).replace('src="app.mjs"',`src="${app}"`);await writeFile(`${out}/index.html`,html);
const manifest={name:'Skull King · 바다의 전설',short_name:'Skull King',start_url:'./',scope:'./',display:'standalone',background_color:'#08131d',theme_color:'#091724'};
await writeFile(`${out}/manifest.webmanifest`,JSON.stringify(manifest));
await writeFile(`${out}/server-config.json`,await readFile('web/server-config.json','utf8'));
// Explicitly exclude every Pages path from Functions, even if an operator later
// accidentally enables a Function. No functions/ or _worker.js in Pages output.
await writeFile(`${out}/_routes.json`,JSON.stringify({version:1,include:['/*'],exclude:['/*']}));
await writeFile(`${out}/_headers`,`/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n/sw.js\n  Cache-Control: no-cache\n/index.html\n  Cache-Control: no-cache\n/server-config.json\n  Cache-Control: no-store\n`);
const files=['./','./index.html','./manifest.webmanifest',...assets.values(),style,...modules.values()];
const version=hash(JSON.stringify(files)+html);const sw=`const CACHE='skullking-static-${version}';\nconst FILES=${JSON.stringify(files)};\nself.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);for(const file of FILES){const url=new URL(file,self.registration.scope);const prior=url.pathname.includes('/assets/')?await caches.match(url):null;await cache.put(url,prior||await fetch(url,{cache:'no-cache'}));}})()));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{const keys=(await caches.keys()).filter(k=>k.startsWith('skullking-static-'));for(const key of keys.filter(k=>k!==CACHE).slice(0,-1))await caches.delete(key);await self.clients.claim();})()));\nself.addEventListener('fetch',event=>{const req=event.request,url=new URL(req.url);if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.endsWith('/server-config.json'))return;if(req.mode==='navigate'){event.respondWith(fetch(req).catch(()=>caches.match(new URL('index.html',self.registration.scope))));return;}if(url.pathname.includes('/assets/'))event.respondWith(caches.match(req).then(hit=>hit||fetch(req)));});\n`;
await writeFile(`${out}/sw.js`,sw);
await writeFile(`${out}/asset-manifest.json`,JSON.stringify({version,files},null,2));
console.log(`Pages static build: ${files.length} cached URLs, no server functions.`);
