import test from 'node:test';import assert from 'node:assert/strict';import {Miniflare} from 'miniflare';
import {randomBytes,randomUUID} from 'node:crypto';import {writeFile,mkdir} from 'node:fs/promises';import {performance} from 'node:perf_hooks';
import {applyDelta,expandView} from '../shared/transport.mjs';import {botDecision} from '../shared/engine.mjs';
const origin='http://localhost:5173',key=()=>randomBytes(32).toString('hex');
function runtime(persist=false){return new Miniflare({modules:true,scriptPath:'.build/worker.mjs',compatibilityDate:'2026-07-01',bindings:{ALLOWED_ORIGINS:origin,COMMANDS_PER_10S:'1000'},durableObjects:{ROOMS:{className:'SkullRoom',useSQLite:true}},...(persist?{durableObjectsPersist:persist}:{})});}
async function api(mf,path,body,secret,extra={}){const r=await mf.dispatchFetch('http://localhost'+path,{method:body?'POST':'GET',headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(secret?{Authorization:`Bearer ${secret}`}:{}) ,...extra},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json()};}
const tick=()=>new Promise(resolve=>setTimeout(resolve,2));
class Client {
 constructor(ws,uid,secret){this.ws=ws;this.uid=uid;this.key=secret;this.wire=null;this.messages=[];this.waiters=[];this.bytes=0;this.sent=0;this.sentBytes=0;ws.addEventListener('message',event=>{this.bytes+=Buffer.byteLength(event.data);if(event.data==='pong'){this.messages.push({t:'pong'});return;}const m=JSON.parse(event.data);if(m.t==='s')this.wire=m.s;else if(m.t==='d')this.wire=applyDelta(this.wire,m);this.messages.push(m);for(const f of this.waiters)f();});ws.accept();}
 async wait(predicate,timeout=5000){const deadline=Date.now()+timeout;while(!predicate()){if(Date.now()>deadline)throw new Error('server wait timeout');await tick();}}
 async cmd(a,id=randomUUID()){const msg={t:'c',id,a:{...a,...(a.type==='chat'?{}:{expectedVersion:this.wire.v})}};const text=JSON.stringify(msg);this.ws.send(text);this.sent++;this.sentBytes+=Buffer.byteLength(text);await this.wait(()=>this.messages.some(m=>m.id===id&&['a','e'].includes(m.t)));const result=this.messages.find(m=>m.id===id&&['a','e'].includes(m.t));if(result.t==='e')throw new Error(result.error);return result;}
 get view(){return expandView(this.wire);}
 close(){this.ws.close(1000,'test close');}
}
async function open(mf,code,uid,secret){const r=await mf.dispatchFetch(`http://localhost/api/rooms/${code}/socket`,{headers:{Origin:origin,Upgrade:'websocket','Sec-WebSocket-Protocol':`skullking, ${secret}`}});assert.equal(r.status,101);const client=new Client(r.webSocket,uid,secret);await client.wait(()=>client.wire!==null);return client;}
async function make(mf,count=3){const secret=key(),made=await api(mf,'/api/rooms',{name:'선장',key:secret});assert.equal(made.status,200,JSON.stringify(made.body));const code=made.body.code;const clients=[await open(mf,code,'p0',secret)];for(let n=1;n<count;n++){const secret=key(),r=await api(mf,`/api/rooms/${code}/join`,{name:`선원${n}`,key:secret});assert.equal(r.status,200);clients.push(await open(mf,code,r.body.uid,secret));}await clients[0].wait(()=>clients[0].view.players.length===count);return {code,clients};}
async function everyone(clients,version){await Promise.all(clients.map(c=>c.wait(()=>c.wire.v>=version)));}
test('real workerd HTTP/WebSocket: origin/auth/host gates, privacy, idempotence and reconnect',async()=>{
 const mf=runtime();let cs=[];
 try{
  assert.equal((await api(mf,'/api/rooms',{name:'x',key:key()},null,{Origin:'https://evil.invalid'})).status,403);
  const {code,clients}=await make(mf);cs=clients;const host=clients[0];
  assert.equal((await api(mf,`/api/rooms/${code}/metrics`,null,key())).status,403);
  assert.equal((await api(mf,`/api/rooms/${code}/metrics`,null,clients[1].key)).status,403);
  await assert.rejects(()=>clients[1].cmd({type:'start'}));
  await host.cmd({type:'start'});await everyone(clients,host.wire.v);
  assert.equal(host.view.hand.length,1);assert.equal(host.view.hands,undefined);
  const id=randomUUID();await host.cmd({type:'bid',bid:0},id);await everyone(clients,host.wire.v);assert.equal(clients[1].view.bids.p0,null);
  const version=host.wire.v;await host.cmd({type:'bid',bid:0},id);assert.equal(host.wire.v,version);
  const secret=clients[1].key;clients[1].close();clients[1]=await open(mf,code,'p1',secret);cs=clients;assert.deepEqual(clients[1].view.hand.length,1);assert.equal(clients[1].view.bids.p0,null);
  const unauthorized=await mf.dispatchFetch(`http://localhost/api/rooms/${code}/socket`,{headers:{Origin:origin,Upgrade:'websocket','Sec-WebSocket-Protocol':`skullking, ${key()}`}});assert.equal(unauthorized.status,403);
  assert.equal((await mf.dispatchFetch('http://localhost/assets/card.webp',{headers:{Origin:origin}})).status,404);
 }finally{for(const c of cs)c.close();await mf.dispose();}
});
test('server AI and six real clients finish games; measure actual application bytes/SQL rows',async()=>{
 const reports=[];
 for(const count of [4,6]){
  const mf=runtime();let clients=[];const begun=performance.now();
  try{
   const made=await make(mf,count);clients=made.clients;const host=clients[0];
   await host.cmd({type:'settings',rules:{...host.view.rules,rounds:10}});await everyone(clients,host.wire.v);
   await host.cmd({type:'start'});await everyone(clients,host.wire.v);
   let guard=0,chat=0;let lastRound=0;
   while(host.view.phase!=='finished'&&guard++<1600){
    const s=host.view;let actor,action;
    if(s.phase==='bidding'){actor=clients.find(c=>!(c.uid in s.bids));action=botDecision(actor.view,n=>Math.floor(n/2));}
    else if(s.phase==='playing'){actor=clients.find(c=>c.uid===s.turn);action=botDecision(actor.view,n=>Math.floor(n/2));}
    else if(s.phase==='results'){actor=host;action={type:'next'};}else throw new Error(s.phase);
    const reply=await actor.cmd(action);await everyone(clients,reply.v);
    // Spread 100 short text messages across game, avoiding unrealistic floods.
    if(chat<100&&guard%3===0){const who=clients[chat%clients.length];const r=await who.cmd({type:'chat',text:`항해 ${chat+1}: 이번 트릭을 확인했어요.`});chat++;await everyone(clients,r.v);}
   }
   assert.equal(host.view.phase,'finished');assert.ok(host.view.history.length>=10);assert.ok(host.view.trickLog.length>=55);
   const measured=await api(mf,`/api/rooms/${made.code}/metrics`,null,host.key);assert.equal(measured.status,200);
   reports.push({players:count,rounds:host.view.round,tricks:host.view.trickLog.length,chat,clientInboundBytes:clients.reduce((n,c)=>n+c.bytes,0),clientOutboundBytes:clients.reduce((n,c)=>n+c.sentBytes,0),elapsedLocalMs:Math.round(performance.now()-begun),server:measured.body});
  }finally{for(const c of clients)c.close();await mf.dispose();}
 }
 // One human with 3 server-side AI, using the same secure message API.
 const mf=runtime();let host;
 try{const made=await make(mf,1);host=made.clients[0];await host.cmd({type:'bots',count:3});await host.cmd({type:'settings',rules:{...host.view.rules,rounds:3}});await host.cmd({type:'start'});let guard=0;while(host.view.phase!=='finished'&&guard++<100){const s=host.view;if(s.phase==='results')await host.cmd({type:'next'});else await host.cmd(botDecision(s,n=>Math.floor(n/2)));}assert.equal(host.view.phase,'finished');}finally{host?.close();await mf.dispose();}
 await mkdir('docs',{recursive:true});await writeFile('docs/LOCAL_MEASUREMENTS.json',JSON.stringify({measuredAt:new Date().toISOString(),environment:'Miniflare/workerd, application WebSocket bytes; excludes TCP/TLS/compression and production CPU/GB-s. Synthetic rapid game may trip anti-flood protection; not an elapsed play-duration benchmark.',reports},null,2));
 console.log(JSON.stringify(reports.map(r=>({players:r.players,rounds:r.rounds,outBytes:r.server.outBytes,inBytes:r.server.inBytes,writes:r.server.stateWrites,rowsWritten:r.server.sqlRowsWritten}))));
});
test('room, private seat and duplicate-command receipts survive a full runtime restart',async()=>{
 const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const dir=await mkdtemp(join(tmpdir(),'skullking-cf-'));let mf=runtime(dir),clients=[];
 try{
  const made=await make(mf,3);clients=made.clients;const host=clients[0];await host.cmd({type:'start'});await everyone(clients,host.wire.v);const commandId=randomUUID();await host.cmd({type:'bid',bid:0},commandId);await everyone(clients,host.wire.v);
  const secret=host.key,hand=host.view.hand,version=host.wire.v;for(const c of clients)c.close();clients=[];await mf.dispose();mf=runtime(dir);
  const restored=await open(mf,made.code,'p0',secret);clients=[restored];assert.deepEqual(restored.view.hand,hand);assert.equal(restored.wire.v,version);assert.equal(restored.view.bids.p0,0);await restored.cmd({type:'bid',bid:0},commandId);assert.equal(restored.wire.v,version);
 }finally{for(const c of clients)c.close();await mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('production browser connection class exchanges private deltas with real Durable Object',async()=>{
 const {GameConnection}=await import('../web/connection.mjs');const mf=runtime();const originals={fetch:globalThis.fetch,WebSocket:globalThis.WebSocket,document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage};const memory=new Map();let connection;
 try{
  globalThis.localStorage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)};
  globalThis.document=Object.assign(new EventTarget(),{visibilityState:'visible'});globalThis.window=new EventTarget();
  globalThis.fetch=(url,opts={})=>mf.dispatchFetch(url,{...opts,headers:{...opts.headers,Origin:origin}});
  class BrowserSocket {
   static OPEN=1;static CONNECTING=0;
   constructor(url,protocols){this.readyState=0;queueMicrotask(async()=>{try{const u=new URL(url);u.protocol='http:';const res=await mf.dispatchFetch(u,{headers:{Origin:origin,Upgrade:'websocket','Sec-WebSocket-Protocol':protocols.join(', ')}});if(res.status!==101)throw new Error('upgrade failed');this.inner=res.webSocket;this.inner.addEventListener('message',e=>this.onmessage?.({data:e.data}));this.inner.addEventListener('close',e=>{this.readyState=3;this.onclose?.(e);});this.readyState=1;this.inner.accept();}catch(e){this.readyState=3;this.onerror?.(e);this.onclose?.({code:1006});}});}
   send(m){this.inner.send(m);}close(code=1000,reason=''){this.readyState=3;this.inner?.close(code,reason);}
  }
  globalThis.WebSocket=BrowserSocket;
  let current;connection=new GameConnection('http://localhost:8787',{onState:s=>{current=s;}});const made=await connection.create('실제 클라이언트');await connection.open(made.code,'실제 클라이언트');
  assert.equal(current.host,connection.uid);await connection.command({type:'bots',count:3,expectedVersion:current.version});assert.equal(current.players.length,4);
  await connection.command({type:'start',expectedVersion:current.version});assert.equal(current.phase,'bidding');assert.equal(current.hand.length,1);assert.equal(current.hands,undefined);
  await connection.command({type:'bid',bid:0,expectedVersion:current.version});assert.equal(current.phase,'playing');assert.equal(current.turn,connection.uid);
  const m=await connection.metrics();assert.ok(m.deltas>0&&m.snapshots===1);connection.check();await tick();
 }finally{connection?.close();await mf.dispose();for(const [k,v]of Object.entries(originals)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
