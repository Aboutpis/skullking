import {applyDelta,expandView} from './transport.mjs';
const credentialKey=code=>`skullking-cf-seat-${code}`;
const token=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
const rid=()=>crypto.randomUUID();
export function validServer(input){const u=new URL(input);if(u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))throw new Error('HTTPS 게임 서버 주소가 필요합니다.');if(u.username||u.password||u.search||u.hash)throw new Error('게임 서버 기본 주소만 입력하세요.');return u.origin;}
export class GameConnection {
 constructor(base,{onState,onPresence,onStatus,onMetrics}={}){this.base=validServer(base);this.onState=onState||(()=>{});this.onPresence=onPresence||(()=>{});this.onStatus=onStatus||(()=>{});this.onMetrics=onMetrics||(()=>{});this.pending=new Map();this.closed=true;this.retry=0;this.wire=null;this.stats={inBytes:0,outBytes:0,inMessages:0,outMessages:0,reconnects:0};this.visible=()=>{if(document.visibilityState==='visible')this.check();};this.online=()=>this.check();}
 async api(path,body,key){const response=await fetch(this.base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(key?{Authorization:`Bearer ${key}`}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'서버 연결 실패');return result;}
 async create(name){const key=token(),result=await this.api('/api/rooms',{name,key});this.remember(result.code,{uid:result.uid,key});return result;}
 remember(code,seat){try{localStorage.setItem(credentialKey(code),JSON.stringify(seat));}catch{}return seat;}
 async join(code,name){let seat;try{seat=JSON.parse(localStorage.getItem(credentialKey(code)));}catch{}const key=seat?.key||token();const result=await this.api(`/api/rooms/${code}/join`,{name,key});this.seat=this.remember(code,{uid:result.uid,key});this.code=code;return result;}
 async open(code,name){const result=await this.join(code,name);this.closed=false;this.uid=result.uid;this.code=code;this.wire=null;this.retry=0;document.addEventListener('visibilitychange',this.visible);window.addEventListener('online',this.online);await new Promise((resolve,reject)=>{this.openResolve=resolve;this.openReject=reject;this.openTimer=setTimeout(()=>reject(new Error('연결 시간이 초과되었습니다. 서버 주소와 허용 앱 주소를 확인해 주세요.')),15000);this.connect();});return result;}
 connect(){if(this.closed)return;clearTimeout(this.retryTimer);this.onStatus('온라인 연결 중…');const url=new URL(`/api/rooms/${this.code}/socket`,this.base);url.protocol=url.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(url,['skullking',this.seat.key]);this.ws=ws;
  ws.onmessage=event=>{if(ws!==this.ws||this.closed)return;this.stats.inBytes+=new TextEncoder().encode(event.data).length;this.stats.inMessages++;if(event.data==='pong'){clearTimeout(this.pingTimer);return;}try{const message=JSON.parse(event.data);
   if(message.t==='s'){this.wire=message.s;this.retry=0;this.onState(expandView(this.wire));this.onStatus('온라인 연결됨');clearTimeout(this.openTimer);this.openResolve?.();this.openResolve=null;this.openReject=null;}
   else if(message.t==='d'){try{this.wire=applyDelta(this.wire,message);this.onState(expandView(this.wire));}catch{this.sendRaw({t:'sync'});}}
   else if(message.t==='p')this.onPresence(Object.fromEntries(Object.keys(message.o).map(u=>[u,{online:true}])));
   else if(message.t==='a'){const p=this.pending.get(message.id);if(p){clearTimeout(p.timer);p.resolve(message);this.pending.delete(message.id);}}
   else if(message.t==='e'){const p=this.pending.get(message.id);if(p){clearTimeout(p.timer);p.reject(new Error(message.error));this.pending.delete(message.id);}this.onStatus(message.error);}
   this.onMetrics({...this.stats});
  }catch{this.onStatus('서버 메시지를 읽지 못했습니다.');}};
  ws.onclose=event=>{if(ws!==this.ws||this.closed)return;clearTimeout(this.pingTimer);if([4001,4004].includes(event.code)){this.closed=true;this.onStatus(event.reason);clearTimeout(this.openTimer);this.openReject?.(new Error(event.reason));this.openReject=null;for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error(event.reason));}this.pending.clear();return;}this.onStatus('연결 끊김 · 재접속 대기');this.stats.reconnects++;const wait=Math.min(30000,1000*2**Math.min(this.retry++,5))+Math.random()*400;this.retryTimer=setTimeout(()=>this.connect(),wait);};
  ws.onerror=()=>this.onStatus('온라인 연결을 확인하고 있습니다.');
 }
 sendRaw(message){if(this.ws?.readyState!==WebSocket.OPEN)throw new Error('재접속 후 다시 선택해 주세요.');const text=typeof message==='string'?message:JSON.stringify(message);this.ws.send(text);this.stats.outBytes+=new TextEncoder().encode(text).length;this.stats.outMessages++;}
 command(action){if(this.pending.size)return Promise.reject(new Error('이전 행동을 처리 중입니다.'));const id=rid();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('응답이 지연되었습니다. 현재 화면을 확인한 뒤 다시 선택해 주세요.'));this.check();},12000);this.pending.set(id,{resolve,reject,timer});try{this.sendRaw({t:'c',id,a:action});}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}});}
 check(){if(this.closed)return;if(this.ws?.readyState!==WebSocket.OPEN){if(this.ws?.readyState!==WebSocket.CONNECTING)this.connect();return;}clearTimeout(this.pingTimer);try{this.sendRaw('ping');this.pingTimer=setTimeout(()=>{try{this.ws.close();}catch{}},10000);}catch{}}
 async metrics(){return this.api(`/api/rooms/${this.code}/metrics`,null,this.seat.key);}
 close(){this.closed=true;clearTimeout(this.retryTimer);clearTimeout(this.openTimer);clearTimeout(this.pingTimer);document.removeEventListener('visibilitychange',this.visible);window.removeEventListener('online',this.online);this.ws?.close(1000,'화면 나가기');for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new Error('화면을 나갔습니다.'));}this.pending.clear();}
}
