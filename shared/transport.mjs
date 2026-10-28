/** Compact, private wire format. No other player's hands or credentials exist here. */
import {view} from './engine.mjs';
const types=['escape','pirate','mermaid','king','tigress','whale','kraken','loot'];
const wireSuits=['green','yellow','purple','black'];
export const reasonTexts=[
 '크라켄: 트릭을 파괴합니다. 바다괴물을 도망으로 보았을 때의 승자가 다음 선공입니다.',
 '흰고래: 무늬를 무시한 최고 숫자가 승리합니다. 동률은 먼저 낸 카드입니다. 숫자 14 보너스는 보존됩니다.',
 '흰고래: 숫자 카드가 없어 승자가 없습니다. 바다괴물을 제외한 가상 승자가 다음 선공입니다.',
 '스컬킹이 해적과 숫자 카드를 이깁니다.', '인어가 스컬킹 또는 숫자 카드를 이깁니다.',
 '해적이 인어와 숫자 카드를 이깁니다.', '검은 해적기가 다른 숫자 무늬를 이깁니다.',
 '선행 무늬의 최고 숫자가 승리합니다.', '모두 도망 역할: 가장 먼저 낸 카드가 승리합니다.'
];
const offsets={escape:56,pirate:61,mermaid:66,king:68,tigress:69,whale:70,kraken:71,loot:72};
export function packCard(c){const v=c.type==='number'?wireSuits.indexOf(c.suit)*14+c.n-1:offsets[c.type]+Number(c.id.split('-').at(-1));return c.mode?[v,c.mode==='pirate'?1:0]:v;}
export function unpackCard(x){const v=Array.isArray(x)?x[0]:x;let c;if(v<56){const suit=wireSuits[Math.floor(v/14)],n=v%14+1;c={id:`${suit}-${n}`,type:'number',suit,n};}else{const type=types.find((t,i)=>v>=offsets[t]&&(i===types.length-1||v<offsets[types[i+1]]));c={id:`${type}-${v-offsets[type]}`,type};}if(Array.isArray(x))c.mode=x[1]?'pirate':'escape';return c;}
const compactResult=r=>[r.winner,r.leader,r.bonus,r.loot,reasonTexts.indexOf(r.reason)];
const expandResult=r=>({winner:r[0],leader:r[1],bonus:r[2],loot:r[3],reason:reasonTexts[r[4]]||'판정 완료'});
const compactTrick=t=>[t.round,t.number,t.cards.map(p=>[p.uid,packCard(p.card)]),compactResult(t.result)];
const expandTrick=t=>({round:t[0],number:t[1],cards:t[2].map(p=>({uid:p[0],card:unpackCard(p[1])})),result:expandResult(t[3])});
export function compactView(s,uid){const v=view(s,uid),r=v.rules;return {
 v:v.version,p:v.phase,o:v.host,r:v.round,n:v.cardsPerPlayer,q:[r.rounds,+r.whale,+r.kraken,+r.loot,r.scoring==='rascal'?1:0,r.creatureFollow==='book'?1:0],
 a:v.players.map(p=>[p.uid,p.name,p.score,+p.bot]),h:v.hand.map(packCard),t:v.trick.map(p=>[p.uid,packCard(p.card)]),
 l:v.lastTrick?compactTrick(v.lastTrick):null,g:v.trickLog.map(compactTrick),
 y:v.history.map(h=>[h.round,h.cards,h.rows.map(p=>[p.uid,p.bid,p.won,p.base,p.captured,p.potential,p.partnership,p.delta,p.total])]),
 b:v.bids,w:v.won,u:v.bonus,x:v.turn,z:v.tied,c:v.handCounts,
 m:v.chat.map(m=>[m.uid,m.text,m.at])
};}
export function expandView(v){const r=v.q;return {version:v.v,phase:v.p,host:v.o,round:v.r,cardsPerPlayer:v.n,rules:{rounds:r[0],whale:!!r[1],kraken:!!r[2],loot:!!r[3],scoring:r[4]?'rascal':'classic',creatureFollow:r[5]?'book':'faq'},players:v.a.map(p=>({uid:p[0],name:p[1],score:p[2],bot:!!p[3]})),hand:v.h.map(unpackCard),trick:v.t.map(p=>({uid:p[0],card:unpackCard(p[1])})),lastTrick:v.l?expandTrick(v.l):null,trickLog:v.g.map(expandTrick),history:v.y.map(h=>({round:h[0],cards:h[1],rows:h[2].map(p=>({uid:p[0],bid:p[1],won:p[2],base:p[3],captured:p[4],potential:p[5],partnership:p[6],delta:p[7],total:p[8]}))})),bids:v.b,won:v.w,bonus:v.u,turn:v.x,tied:v.z,handCounts:v.c,chat:v.m.map(m=>({uid:m[0],text:m[1],at:m[2]}))};}
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
/** Arrays that only grew are appended. Historic tricks/scores are never resent. */
export function makeDelta(before,after){
 const ops=[];
 for(const [k,value]of Object.entries(after)){
  if(eq(before[k],value))continue;
  if(k==='m'&&Array.isArray(before[k])&&before[k].length&&value.length===before[k].length){
   let drop=1;while(drop<before[k].length&&!before[k].slice(drop).every((v,i)=>eq(v,value[i])))drop++;
   if(drop<before[k].length){ops.push(['q',k,[drop,value.slice(value.length-drop)]]);continue;}
  }
  if(Array.isArray(value)&&Array.isArray(before[k])&&value.length>before[k].length&&before[k].every((v,i)=>eq(v,value[i])))ops.push(['a',k,value.slice(before[k].length)]);
  else ops.push(['s',k,value]);
 }
 return {t:'d',b:before.v,v:after.v,o:ops};
}
export function applyDelta(before,message){
 if(!before||before.v!==message.b)throw new Error('revision-gap');const next=structuredClone(before);
 for(const [op,k,value]of message.o){
  if(!Object.hasOwn(next,k)||!['a','s','q'].includes(op))throw new Error('invalid-patch');
  if(op==='a')next[k].push(...value);else if(op==='q')next[k]=[...next[k].slice(value[0]),...value[1]];else next[k]=value;
 }
 if(next.v!==message.v)throw new Error('invalid-version');return next;
}
