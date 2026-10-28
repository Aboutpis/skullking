import {readFile,writeFile,readdir} from 'node:fs/promises';
const strip=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/\bexport /g,'');
const engine=strip(await readFile('shared/engine.mjs','utf8')),scenarios=strip(await readFile('shared/scenarios.mjs','utf8')),transport=strip(await readFile('shared/transport.mjs','utf8')),connection=strip(await readFile('web/connection.mjs','utf8')),app=strip(await readFile('web/app.mjs','utf8'));
let css=await readFile('web/style.css','utf8');
for(const file of await readdir('web/assets')){const mime=file.endsWith('.webp')?'image/webp':'image/jpeg';css=css.replaceAll(`assets/${file}`,`data:${mime};base64,${(await readFile('web/assets/'+file)).toString('base64')}`);}
const image='data:image/jpeg;base64,'+(await readFile('web/assets/approved-title.jpg')).toString('base64');
const js=`(()=>{\n${engine}\n${scenarios}\n${transport}\n${connection}\n${app.replaceAll('assets/approved-title.jpg',image)}\n})();`;
const html=(await readFile('web/index.html','utf8')).replace('<link rel="stylesheet" href="style.css">',`<style>${css}</style>`).replace('<script type="module" src="app.mjs"></script>',`<script>${js.replaceAll('</script','<\\/script')}</script>`);
await writeFile('web/play.html',html);await writeFile('docs/bundle-check.js',js);
console.log('Standalone AI practice generated.');
