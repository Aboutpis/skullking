import {DurableObject} from 'cloudflare:workers';
import {newRoom,act,advanceBots} from '../shared/engine.mjs';
import {compactView,makeDelta} from '../shared/transport.mjs';
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}});
const encoder=new TextEncoder(),size=x=>encoder.encode(typeof x==='string'?x:JSON.stringify(x)).length;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const hash=async key=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(key))));
const random=n=>{const b=new Uint32Array(1),limit=4294967296-4294967296%n;do{crypto.getRandomValues(b);}while(b[0]>=limit);return b[0]%n;};
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const roomCode=()=>Array.from({length:6},()=>alphabet[random(alphabet.length)]).join('');
function allowed(req,env){const origin=req.headers.get('Origin');return !!origin&&(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).includes(origin);}
function cors(req){return {'Access-Control-Allow-Origin':req.headers.get('Origin'),'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'POST, GET, OPTIONS','Access-Control-Max-Age':'86400'};}
export default {
 async fetch(req,env){
  const url=new URL(req.url);
  // No static asset binding, proxy, broad route, Pages Function, or image endpoint.
  if(url.pathname==='/health')return json({service:'skullking-game-server',version:'0.3.0'});
  if(!url.pathname.startsWith('/api/rooms'))return json({error:'이 주소는 게임 서버입니다. 앱은 Pages 주소로 접속하세요.'},404);
  if(!allowed(req,env))return json({error:'허용되지 않은 앱 주소입니다. ALLOWED_ORIGINS 설정을 확인해 주세요.'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors(req)});
  try{
   const match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join|socket|metrics)$/);
   let response;
   if(req.method==='POST'&&url.pathname==='/api/rooms'){
    if(Number(req.headers.get('Content-Length')||0)>2000)fail('요청이 너무 큽니다.',413);
    const body=await req.text();if(size(body)>2000)fail('요청이 너무 큽니다.',413);
    for(let retry=0;retry<5;retry++){
     const code=roomCode(),stub=env.ROOMS.get(env.ROOMS.idFromName(code));
     response=await stub.fetch(new Request('https://room.internal/create',{method:'POST',body,headers:{'x-room-code':code}}));
     if(response.status!==409)break;
    }
   }else if(match){
    const [,code,operation]=match;
    const stub=env.ROOMS.get(env.ROOMS.idFromName(code));
    const forwarded=new Request(`https://room.internal/${operation}`,req);
    forwarded.headers.set('x-room-code',code);
    response=await stub.fetch(forwarded);
   }else return json({error:'지원하지 않는 요청입니다.'},404,cors(req));
   if(response.status===101)return response;
   const headers=new Headers(response.headers);for(const [k,v]of Object.entries(cors(req)))headers.set(k,v);
   return new Response(response.body,{status:response.status,headers});
  }catch(e){return json({error:e.status?e.message:'서버 요청을 처리하지 못했습니다.'},e.status||500,cors(req));}
 }
};
const blankMetrics=()=>({httpRequests:0,wsConnections:0,inMessages:0,outMessages:0,inBytes:0,outBytes:0,accepted:0,rejected:0,snapshots:0,deltas:0,stateWrites:0,sqlRowsRead:0,sqlRowsWritten:0,handlerWallMs:0,maxStoredBytes:0});
export class SkullRoom extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);this.sql=ctx.storage.sql;
  this.sql.exec('CREATE TABLE IF NOT EXISTS room (id INTEGER PRIMARY KEY, body TEXT NOT NULL)');
  const cursor=this.sql.exec('SELECT body FROM room WHERE id=1'),rows=cursor.toArray();
  this.data=rows.length?JSON.parse(rows[0].body):null;
  if(this.data)this.data.metrics.sqlRowsRead+=cursor.rowsRead;
  this.rate=new Map();
  ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping','pong'));
 }
 get state(){return this.data?.state;}
 save(){
  const d=this.data;d.metrics.stateWrites++; // SQL row counters include physical operations, not estimates from message counts.
  let body=JSON.stringify(d);d.metrics.maxStoredBytes=Math.max(d.metrics.maxStoredBytes,size(body));body=JSON.stringify(d);
  const write=this.sql.exec('INSERT INTO room (id,body) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body',body);
  d.metrics.sqlRowsRead+=write.rowsRead;d.metrics.sqlRowsWritten+=write.rowsWritten;
 }
 transmit(packets){
  const encoded=packets.map(([ws,message])=>({ws,text:JSON.stringify(message),type:message.t}));
  for(const {text,type}of encoded){this.data.metrics.outMessages++;this.data.metrics.outBytes+=size(text);if(type==='s')this.data.metrics.snapshots++;if(type==='d')this.data.metrics.deltas++;}
  this.save(); // Commit the mutation and generated-message counters before any output.
  for(const {ws,text}of encoded)try{ws.send(text);}catch{}
 }
 send(ws,message){this.transmit([[ws,message]]);}
 sockets(){return this.ctx.getWebSockets().filter(ws=>ws.readyState===1);}
 presence(){const online={};for(const ws of this.sockets()){const u=ws.deserializeAttachment()?.uid;if(u)online[u]=1;}return online;}
 broadcastPresence(){const p={t:'p',o:this.presence()};const packets=this.sockets().map(ws=>[ws,p]);if(packets.length)this.transmit(packets);}
 publish(before,after,ack=null){const packets=[];for(const ws of this.sockets()){const uid=ws.deserializeAttachment()?.uid;if(!after.players.some(p=>p.uid===uid))continue;packets.push([ws,makeDelta(compactView(before,uid),compactView(after,uid))]);}if(ack)packets.push(ack);this.transmit(packets);}
 checkRate(key,max){const now=Date.now(),prev=this.rate.get(key),next=!prev||now-prev.at>10000?{at:now,n:0}:prev;if(++next.n>max)fail('요청이 많습니다. 잠시 기다려 주세요.',429);this.rate.set(key,next);}
 validKey(key){if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))fail('접속 키 형식 오류');}
 async authorize(key){this.validKey(key);const digest=await hash(key);const uid=this.data?.members[digest];if(!uid)fail('이 좌석의 재접속 정보가 없습니다.',403);return uid;}
 async input(req){const text=await req.text();if(size(text)>2000)fail('요청이 너무 큽니다.',413);try{return JSON.parse(text);}catch{fail('잘못된 JSON 요청');}}
 async fetch(req){
  const start=performance.now(),path=new URL(req.url).pathname;
  try{
   if(this.data)this.data.metrics.httpRequests++;
   if(path==='/create'&&req.method==='POST'){
    if(this.data)fail('방 코드 충돌',409);
    const {name,key}=await this.input(req);this.validKey(key);if(typeof name!=='string'||!name.trim()||name.length>20)fail('이름은 1~20자');
    const digest=await hash(key);if(this.data)fail('방 코드 충돌',409);
    this.data={schema:1,code:req.headers.get('x-room-code'),members:{[digest]:'p0'},state:newRoom('p0',name.trim()),createdAt:Date.now(),lastActive:Date.now(),metrics:blankMetrics()};
    this.data.metrics.httpRequests=1;this.save();await this.ctx.storage.setAlarm(Date.now()+48*60*60*1000);
    return json({code:this.data.code,uid:'p0'});
   }
   if(!this.data)fail('방이 없거나 만료되었습니다.',404);
   if(path==='/join'&&req.method==='POST'){
    this.checkRate('join',20);const {name,key}=await this.input(req);this.validKey(key);const digest=await hash(key);
    if(this.data.members[digest])return json({code:this.data.code,uid:this.data.members[digest]});
    const before=this.state,uid=`p${before.players.filter(p=>!p.bot).length}`;
    const next=act(before,uid,{id:crypto.randomUUID(),type:'join',name},random);
    this.data.members[digest]=uid;this.data.state=next;this.data.lastActive=Date.now();this.publish(before,next);
    return json({code:this.data.code,uid});
   }
   if(path==='/socket'&&req.method==='GET'&&req.headers.get('Upgrade')?.toLowerCase()==='websocket'){
    const protocols=(req.headers.get('Sec-WebSocket-Protocol')||'').split(',').map(x=>x.trim());
    if(protocols[0]!=='skullking'||protocols.length!==2)fail('접속 프로토콜 오류',403);
    const uid=await this.authorize(protocols[1]);
    this.checkRate(`connect:${uid}`,20);
    for(const old of this.sockets())if(old.deserializeAttachment()?.uid===uid)old.close(4001,'다른 창에서 재접속했습니다.');
    const [client,server]=Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);server.serializeAttachment({uid});
    this.data.metrics.wsConnections++;const packets=[[server,{t:'s',s:compactView(this.state,uid)}]];const p={t:'p',o:this.presence()};for(const ws of this.sockets())packets.push([ws,p]);this.transmit(packets);
    return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':'skullking'}});
   }
   if(path==='/metrics'&&req.method==='GET'){
    const key=req.headers.get('Authorization')?.replace(/^Bearer /,'');const uid=await this.authorize(key);
    if(uid!==this.state.host)fail('방장만 사용량을 볼 수 있습니다.',403);
    this.save();return json({code:this.data.code,...this.data.metrics,currentStoredBytes:size(JSON.stringify(this.data)),note:'Application bytes and local handler wall time; not network/TLS bytes or Cloudflare billed CPU/GB-s. Native auto ping/pong is not counted.'});
   }
   fail('지원하지 않는 방 요청',404);
  }catch(e){return json({error:e.message},e.status||400);}
  finally{if(this.data)this.data.metrics.handlerWallMs+=Math.max(0,performance.now()-start);}
 }
 webSocketMessage(ws,message){
  const start=performance.now();let commandId=null;
  try{
   if(!this.data)fail('만료된 방입니다.');
   if(typeof message!=='string'||size(message)>3000)fail('메시지 크기 오류');
   this.data.metrics.inMessages++;this.data.metrics.inBytes+=size(message);
   const uid=ws.deserializeAttachment()?.uid;if(!uid)fail('접속 정보 없음');const msg=JSON.parse(message);commandId=msg.id;this.checkRate(`message:${uid}`,Number(this.env.COMMANDS_PER_10S)||45);
   if(msg.t==='sync'){this.send(ws,{t:'s',s:compactView(this.state,uid)});return;}
   if(msg.t!=='c'||!msg.a||!['settings','bots','start','bid','play','next','rematch','chat'].includes(msg.a.type))fail('지원하지 않는 게임 명령');
   if(msg.a.type!=='chat'&&!Number.isInteger(msg.a.expectedVersion))fail('게임 버전 필요');
   const before=this.state;
   const next=advanceBots(act(before,uid,{...msg.a,id:msg.id,at:Date.now()},random),random,()=>crypto.randomUUID());
   if(next.version!==before.version){this.data.state=next;this.data.lastActive=Date.now();this.data.metrics.accepted++;this.publish(before,next,[ws,{t:'a',id:msg.id,v:next.version}]);}
   else this.send(ws,{t:'a',id:msg.id,v:next.version});
  }catch(e){if(this.data){this.data.metrics.rejected++;this.send(ws,{t:'e',id:commandId,error:e.message});}}
  finally{if(this.data)this.data.metrics.handlerWallMs+=Math.max(0,performance.now()-start);}
 }
 webSocketClose(ws,code,reason,wasClean){if(this.data)this.broadcastPresence();}
 webSocketError(ws){try{ws.close(1011,'연결 오류');}catch{}}
 async alarm(){
  if(!this.data)return;
  const expires=this.data.lastActive+48*60*60*1000;
  if(Date.now()<expires){await this.ctx.storage.setAlarm(expires);return;}
  for(const ws of this.sockets())ws.close(4004,'48시간 동안 사용하지 않은 방이 정리되었습니다.');
  this.sql.exec('DELETE FROM room WHERE id=1');this.data=null;
 }
}
