import test from 'node:test';
import assert from 'node:assert/strict';
import {deck,newRoom,act,view,resolve,score,legal,leadSuit,advanceBots,botDecision,shuffle} from '../shared/engine.mjs';
import {checkScenarios} from '../shared/scenarios.mjs';
let sequence=0;const request=()=>`request-${++sequence}`;
const seeded=seed=>{let n=seed;return max=>{n=(Math.imul(n,1664525)+1013904223)>>>0;return n%max;};};
const action=(s,u,a,r=seeded(42))=>act(s,u,{id:request(),at:1,...a},r);
const n=(suit,value)=>({id:`${suit}-${value}`,type:'number',suit,n:value});
const c=(type,mode)=>({id:`${type}-${sequence++}`,type,...(mode?{mode}:{})});
const trick=(...cards)=>cards.map((card,i)=>({uid:String(i),card}));
function makeRoom(){let s=newRoom('a','A');for(const u of ['b','c'])s=action(s,u,{type:'join',name:u});return s;}
test('70 basic cards, 74 with all options, 56 unique numeric cards',()=>{assert.equal(deck({}).length,70);assert.equal(deck().length,74);assert.equal(new Set(deck().map(c=>c.id)).size,74);assert.equal(deck().filter(c=>c.type==='number').length,56);assert.equal(deck().filter(c=>c.suit==='green').length,14);});
test('shuffle is a permutation; refuses unsafe RNG',()=>{const d=deck();assert.deepEqual(shuffle(d,seeded(1)).map(c=>c.id).sort(),d.map(c=>c.id).sort());assert.throws(()=>shuffle(d,()=>99));});
test('ten named official-rule scenarios',()=>{for(const t of checkScenarios())assert.ok(t.pass,t.title);});
test('ordinary off-suit 14 loses to leading 2; black 1 beats ordinary 14',()=>{assert.equal(resolve(trick(n('green',2),n('yellow',14))).winner,'0');assert.equal(resolve(trick(n('yellow',14),n('black',1))).winner,'1');});
test('first pirate/mermaid wins ties; cyclic hierarchy independent of play order',()=>{assert.equal(resolve(trick(c('pirate'),c('pirate'))).winner,'0');assert.equal(resolve(trick(c('mermaid'),c('mermaid'))).winner,'0');for(const types of [['pirate','king','mermaid'],['mermaid','pirate','king'],['king','mermaid','pirate']])assert.equal(resolve(trick(...types.map(t=>c(t)))).winner,String(types.indexOf('mermaid')));});
test('numeric and character bonuses are cumulative but only winner captures',()=>{assert.equal(resolve(trick(n('black',14),c('pirate'),c('king'))).bonus,50);assert.equal(resolve(trick(c('mermaid'),c('mermaid'),c('pirate'))).bonus,40);assert.equal(resolve(trick(c('pirate'),c('king'),c('mermaid'),n('yellow',14))).bonus,50);});
test('Tigress acts as selected role; escape Tigress gives no pirate capture bonus',()=>{assert.equal(resolve(trick(c('tigress','pirate'),c('mermaid'))).winner,'0');assert.equal(resolve(trick(c('tigress','escape'),c('king'))).bonus,0);});
test('escapes defer lead; character lead does not establish suit',()=>{assert.equal(leadSuit(trick(c('escape'),n('green',2))),'green');assert.equal(leadSuit(trick(c('pirate'),n('green',2))),null);assert.equal(resolve(trick(c('escape'),c('loot'),c('tigress','escape'))).winner,'0');});
test('follow suit enforced even when trump would win, specials always legal',()=>{const h=[n('green',2),n('black',5),c('escape')],t=trick(n('green',3));assert.equal(legal(h,h[1],t),false);assert.equal(legal(h,h[2],t),true);assert.equal(legal(h.slice(1),h[1],t),true);});
test('official FAQ and current book disagreement is selectable, default FAQ',()=>{const t=trick(n('green',3),c('whale'));assert.equal(leadSuit(t),'green');assert.equal(leadSuit(t,{creatureFollow:'book'}),null);assert.equal(leadSuit(trick(c('whale'),n('green',3))),null);});
test('Whale retains numeric-14 bonuses and earlier numeric tie winner',()=>{const r=resolve(trick(n('green',14),n('black',14),c('whale')));assert.equal(r.winner,'0');assert.equal(r.bonus,30);});
test('Whale all-specials uses hypothetical winner, not necessarily whale player',()=>{const r=resolve(trick(c('king'),c('mermaid'),c('whale')));assert.equal(r.winner,null);assert.equal(r.leader,'1');assert.equal(r.bonus,0);});
test('Kraken preserves original escape positions when finding hypothetical winner',()=>{const r=resolve(trick(c('kraken'),c('escape'),c('loot')));assert.equal(r.leader,'0');assert.equal(r.winner,null);assert.equal(r.bonus,0);});
test('only later creature active',()=>{assert.equal(resolve(trick(n('yellow',12),n('black',3),c('whale'),c('kraken'))).leader,'1');assert.equal(resolve(trick(n('yellow',12),n('black',3),c('kraken'),c('whale'))).winner,'0');});
test('classic exact, missed, zero bids and Rascal half bonuses',()=>{assert.equal(score(5,0,0,20),70);assert.equal(score(5,0,2,20),-50);assert.equal(score(5,3,1,20),-20);assert.equal(score(5,3,3,20),80);assert.equal(score(5,2,1,20,'rascal'),35);assert.equal(score(5,2,4,20,'rascal'),0);});
test('private views expose only own hand, no others bids until all submitted',()=>{let s=action(makeRoom(),'a',{type:'start'});s=action(s,'a',{type:'bid',bid:1});const v=view(s,'b');assert.equal(v.bids.a,null);assert.equal(v.hands,undefined);assert.equal(v.seen,undefined);assert.equal(v.hand.length,1);assert.throws(()=>view(s,'intruder'));s=action(s,'b',{type:'bid',bid:0});s=action(s,'c',{type:'bid',bid:0});assert.equal(view(s,'b').bids.a,1);});
test('authority, stale-version rejection, duplicate id is scoped to player',()=>{const s=makeRoom();assert.throws(()=>action(s,'b',{type:'bots',count:3}));assert.throws(()=>action(s,'b',{type:'start'}));assert.throws(()=>action(s,'a',{type:'start',expectedVersion:999}));let started=action(s,'a',{type:'start'});const a={id:'duplicate-123',type:'bid',bid:0};const next=act(started,'a',a,seeded(1));assert.deepEqual(act(next,'a',a,seeded(1)),next);assert.throws(()=>act(next,'intruder',a,seeded(1)));assert.equal(act(next,'b',a,seeded(1)).bids.b,0);});
test('bot count 0..3, host only, no client-supplied bot status on join',()=>{let s=newRoom('a','A');s=action(s,'a',{type:'bots',count:3});assert.equal(s.players.filter(p=>p.bot).length,3);s=action(s,'a',{type:'bots',count:2});assert.equal(s.players.length,3);s=action(s,'b',{type:'join',name:'B',bot:true});assert.equal(s.players.find(p=>p.uid==='b').bot,false);assert.throws(()=>action(s,'a',{type:'bots',count:4}));});
test('illegal card, role omission, double bid and out-of-turn play rejected',()=>{let s=action(makeRoom(),'a',{type:'start'});assert.throws(()=>action(s,'a',{type:'bid',bid:2}));s=action(s,'a',{type:'bid',bid:0});assert.throws(()=>action(s,'a',{type:'bid',bid:0}));s=action(s,'b',{type:'bid',bid:0});s=action(s,'c',{type:'bid',bid:0});assert.throws(()=>action(s,'a',{type:'play',cardId:'missing'}));assert.throws(()=>action(s,'b',{type:'play',cardId:s.hands.b[0].id}));s.hands.a=[c('tigress')];assert.throws(()=>action(s,'a',{type:'play',cardId:s.hands.a[0].id}));});
function lastTrickFixture(rules,lootPlayerBid=0,winnerBid=1){let s=makeRoom();s={...s,phase:'playing',round:1,cardsPerPlayer:1,rules:{...s.rules,rounds:1,...rules},turn:'c',hands:{a:[],b:[],c:[n('green',1)]},trick:[{uid:'a',card:c('loot')},{uid:'b',card:n('green',14)}],bids:{a:lootPlayerBid,b:winnerBid,c:1},won:{a:0,b:0,c:0},bonus:{a:0,b:0,c:0},loot:[]};return action(s,'c',{type:'play',cardId:'green-1'});}
test('round end itemizes loot only if both bids exact',()=>{const s=lastTrickFixture({});const a=s.history[0].rows.find(p=>p.uid==='a'),b=s.history[0].rows.find(p=>p.uid==='b');assert.equal(a.partnership,20);assert.equal(a.delta,30);assert.equal(b.captured,10);assert.equal(b.delta,50);const missed=lastTrickFixture({},1);assert.ok(missed.history[0].rows.every(p=>p.partnership===0));});
test('Rascal off-by-one can earn card half-bonus but cannot earn loot alliance',()=>{const s=lastTrickFixture({scoring:'rascal'},0,0);const b=s.history[0].rows.find(p=>p.uid==='b');assert.equal(b.base,5);assert.equal(b.captured,5);assert.equal(b.partnership,0);assert.equal(b.delta,10);});
test('tied final scores require extra round',()=>{let s=makeRoom();s={...s,phase:'playing',round:1,cardsPerPlayer:1,rules:{...s.rules,rounds:1},turn:'c',hands:{a:[],b:[],c:[n('yellow',1)]},trick:[{uid:'a',card:n('yellow',3)},{uid:'b',card:n('yellow',2)}],bids:{a:1,b:0,c:0},won:{a:0,b:0,c:0},bonus:{a:0,b:0,c:0}};s.players[1].score=10;s=action(s,'c',{type:'play',cardId:'yellow-1'});assert.equal(s.phase,'results');assert.equal(s.tied,true);s=action(s,'a',{type:'next'});assert.equal(s.round,2);});
test('8 players have 8 cards in rounds 9 and 10; zero-bid score uses dealt count',()=>{let s=newRoom('a','A');for(let i=1;i<8;i++)s=action(s,`h${i}`,{type:'join',name:`H${i}`});s.phase='results';s.round=8;s=action(s,'a',{type:'next'});assert.equal(s.cardsPerPlayer,8);assert.equal(s.hands.a.length,8);assert.equal(score(s.cardsPerPlayer,0,0),80);});
test('AI works using redacted own view only, handles Tigress',()=>{const v={...view(action(makeRoom(),'a',{type:'start'}),'a'),phase:'playing',turn:'a',hand:[c('tigress')],won:{a:0},bids:{a:0},trick:[]};assert.equal(botDecision(v,seeded(1)).mode,'escape');assert.equal(v.hands,undefined);});
test('100 seeded full games with 3 server AI finish; unique cards, legal moves, hidden hands',()=>{
 for(let seed=1;seed<=100;seed++){
  const random=seeded(seed);let s=action(newRoom('a','A'),'a',{type:'bots',count:3},random);s.rules.rounds=10;s=action(s,'a',{type:'start'},random);let steps=0;
  while(s.phase!=='finished'&&steps++<2500){
   s=advanceBots(s,random,request);
   if(s.phase==='bidding'){const cards=Object.values(s.hands).flat();assert.equal(new Set(cards.map(c=>c.id)).size,cards.length);const bid=botDecision(view(s,'a'),random);s=action(s,'a',bid,random);}
   else if(s.phase==='playing'){assert.equal(s.turn,'a');const choice=botDecision(view(s,'a'),random);assert.ok(s.hands.a.some(c=>c.id===choice.cardId));s=action(s,'a',choice,random);}
   else if(s.phase==='results')s=action(s,'a',{type:'next'},random);
  }
  assert.equal(s.phase,'finished',`seed ${seed}`);assert.ok(s.history.length>=10);assert.equal(Object.values(s.hands).flat().length,0);assert.deepEqual(JSON.parse(JSON.stringify(s)),s);
 }
});
test('all 8 option combinations with both scoring/follow profiles finish with two AI',()=>{
 for(let mask=0;mask<8;mask++)for(const profile of ['faq','book']){
  const random=seeded(900+mask);let s=action(newRoom('a','A'),'a',{type:'bots',count:2},random);
  const rules={...s.rules,rounds:3,whale:!!(mask&1),kraken:!!(mask&2),loot:!!(mask&4),scoring:profile==='faq'?'classic':'rascal',creatureFollow:profile};
  s=action(s,'a',{type:'settings',rules},random);s=action(s,'a',{type:'start'},random);let guard=0;
  while(s.phase!=='finished'&&guard++<1000){s=advanceBots(s,random,request);if(['bidding','playing'].includes(s.phase))s=action(s,'a',botDecision(view(s,'a'),random),random);else if(s.phase==='results')s=action(s,'a',{type:'next'},random);}
  assert.equal(s.phase,'finished');assert.equal(deck(rules).some(c=>c.type==='whale'),rules.whale);
 }
});
