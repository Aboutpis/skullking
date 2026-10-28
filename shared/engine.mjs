/** Skull King base set + Whale / Kraken / Loot. Server-authoritative reducer. */
export const defaults = {rounds:10, whale:true, kraken:true, loot:true, scoring:'classic', creatureFollow:'faq'};
export const effectiveType = c => c.type === 'tigress' ? c.mode === 'pirate' ? 'pirate' : 'escape' : c.type;
const fail = message => { throw new Error(message); };
export function deck(rules=defaults) {
  const cards=[];
  for(const suit of ['green','yellow','purple','black']) for(let n=1;n<=14;n++) cards.push({id:`${suit}-${n}`,type:'number',suit,n});
  for(const [type,count] of [['escape',5],['pirate',5],['mermaid',2],['king',1],['tigress',1],['whale',rules.whale?1:0],['kraken',rules.kraken?1:0],['loot',rules.loot?2:0]])
    for(let i=0;i<count;i++) cards.push({id:`${type}-${i}`,type});
  return cards;
}
export function shuffle(cards,rng) {
  const out=[...cards];
  for(let i=out.length-1;i>0;i--){const j=rng(i+1);if(!Number.isInteger(j)||j<0||j>i)fail('난수 범위 오류');[out[i],out[j]]=[out[j],out[i]];}
  return out;
}
export function leadSuit(trick,rules=defaults) {
  if(rules.creatureFollow==='book' && trick.some(p=>['whale','kraken'].includes(effectiveType(p.card)))) return null;
  for(const p of trick){const t=effectiveType(p.card);if(['escape','loot'].includes(t))continue;return t==='number'?p.card.suit:null;}
  return null;
}
export function legal(hand,card,trick,rules=defaults) {
  const suit=leadSuit(trick,rules);
  return card.type!=='number'||!suit||card.suit===suit||!hand.some(c=>c.type==='number'&&c.suit===suit);
}
function ordinary(trick) {
  const king=trick.find(p=>effectiveType(p.card)==='king');
  const mermaid=trick.find(p=>effectiveType(p.card)==='mermaid');
  const pirate=trick.find(p=>effectiveType(p.card)==='pirate');
  if(king) return mermaid||king;
  if(pirate) return pirate;
  if(mermaid) return mermaid;
  const trump=trick.filter(p=>p.card.type==='number'&&p.card.suit==='black');
  const numbers=trick.filter(p=>p.card.type==='number');
  const suit=leadSuit(trick);
  const eligible=trump.length?trump:numbers.filter(p=>p.card.suit===suit);
  return eligible.reduce((a,b)=>!a||b.card.n>a.card.n?b:a,null)||trick[0];
}
const numberBonus = trick => trick.filter(p=>p.card.type==='number'&&p.card.n===14).reduce((sum,p)=>sum+(p.card.suit==='black'?20:10),0);
// Creature cards act as escapes when calculating the hypothetical winner. Preserve
// their positions: removing them would incorrectly change an all-escape leader.
const withoutCreatures = trick => trick.map(p=>['whale','kraken'].includes(effectiveType(p.card))?{...p,card:{id:p.card.id,type:'escape'}}:p);
export function resolve(trick) {
  if(!trick.length)fail('빈 트릭');
  const last=trick.filter(p=>['whale','kraken'].includes(effectiveType(p.card))).at(-1);
  const hypothetical=ordinary(withoutCreatures(trick));
  if(last?.card.type==='kraken')return {winner:null,leader:hypothetical.uid,bonus:0,loot:[],reason:'크라켄: 트릭을 파괴합니다. 바다괴물을 도망으로 보았을 때의 승자가 다음 선공입니다.'};
  if(last?.card.type==='whale') {
    const best=trick.filter(p=>p.card.type==='number').reduce((a,b)=>!a||b.card.n>a.card.n?b:a,null);
    return {winner:best?.uid??null,leader:best?.uid??hypothetical.uid,bonus:best?numberBonus(trick):0,loot:[],reason:best?'흰고래: 무늬를 무시한 최고 숫자가 승리합니다. 동률은 먼저 낸 카드입니다. 숫자 14 보너스는 보존됩니다.':'흰고래: 숫자 카드가 없어 승자가 없습니다. 바다괴물을 제외한 가상 승자가 다음 선공입니다.'};
  }
  const win=ordinary(trick),kind=effectiveType(win.card);
  let bonus=numberBonus(trick);
  if(kind==='king')bonus+=30*trick.filter(p=>effectiveType(p.card)==='pirate').length;
  if(kind==='pirate')bonus+=20*trick.filter(p=>effectiveType(p.card)==='mermaid').length;
  if(kind==='mermaid'&&trick.some(p=>effectiveType(p.card)==='king'))bonus+=40;
  const reason=kind==='king'?'스컬킹이 해적과 숫자 카드를 이깁니다.':kind==='mermaid'?'인어가 스컬킹 또는 숫자 카드를 이깁니다.':kind==='pirate'?'해적이 인어와 숫자 카드를 이깁니다.':kind==='number'?(win.card.suit==='black'?'검은 해적기가 다른 숫자 무늬를 이깁니다.':'선행 무늬의 최고 숫자가 승리합니다.'):'모두 도망 역할: 가장 먼저 낸 카드가 승리합니다.';
  return {winner:win.uid,leader:win.uid,bonus,loot:trick.filter(p=>p.card.type==='loot'&&p.uid!==win.uid).map(p=>[p.uid,win.uid]),reason};
}
export function score(cards,bid,won,bonus=0,scoring='classic') {
  const diff=Math.abs(bid-won);
  if(scoring==='rascal')return diff===0?10*cards+bonus:diff===1?(10*cards+bonus)/2:0;
  return bid===0?(won===0?10*cards+bonus:-10*cards):diff===0?20*bid+bonus:-10*diff;
}
export function newRoom(uid,name,rules={}) {
  return {host:uid,phase:'lobby',version:0,rules:{...defaults,...rules},players:[{uid,name,score:0,bot:false}],round:0,cardsPerPlayer:0,trick:[],hands:{},bids:{},won:{},bonus:{},loot:[],history:[],trickLog:[],chat:[],seen:{},lastTrick:null,turn:null,tied:false};
}
function deal(s,rng) {
  s.round++;s.cardsPerPlayer=Math.min(s.round,10,s.players.length===8?8:10);
  s.phase='bidding';s.trick=[];s.lastTrick=null;s.bids={};s.won={};s.bonus={};s.loot=[];s.hands={};
  const cards=shuffle(deck(s.rules),rng);if(s.cardsPerPlayer*s.players.length>cards.length)fail('카드 수 부족');
  for(const p of s.players){s.hands[p.uid]=[];s.won[p.uid]=0;s.bonus[p.uid]=0;}
  for(let n=0;n<s.cardsPerPlayer;n++)for(const p of s.players)s.hands[p.uid].push(cards.pop());
  s.turn=s.players[(s.round-1)%s.players.length].uid;
}
function finishRound(s) {
  const lootBonus={};
  for(const [x,y] of s.loot) if(s.bids[x]===s.won[x]&&s.bids[y]===s.won[y]){lootBonus[x]=(lootBonus[x]||0)+20;lootBonus[y]=(lootBonus[y]||0)+20;}
  const rows=s.players.map(p=>{
    const base=score(s.cardsPerPlayer,s.bids[p.uid],s.won[p.uid],0,s.rules.scoring);
    const captured=score(s.cardsPerPlayer,s.bids[p.uid],s.won[p.uid],s.bonus[p.uid],s.rules.scoring)-base;
    const partnership=lootBonus[p.uid]||0,delta=base+captured+partnership;p.score+=delta;
    return {uid:p.uid,bid:s.bids[p.uid],won:s.won[p.uid],base,captured,potential:s.bonus[p.uid],partnership,delta,total:p.score};
  });
  s.history.push({round:s.round,cards:s.cardsPerPlayer,rows});
  const top=Math.max(...s.players.map(p=>p.score));s.tied=s.players.filter(p=>p.score===top).length>1;
  s.phase=s.round>=s.rules.rounds&&!s.tied?'finished':'results';
}
export function act(input,uid,a,rng) {
  const s=structuredClone(input);
  if(typeof a.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(a.id))fail('요청 ID 오류');
  const member=s.players.find(p=>p.uid===uid);
  if(a.type!=='join'&&!member)fail('참가자 아님');
  const receipt=`${uid}:${a.id}`;if(s.seen[receipt])return s;
  if(a.expectedVersion!==undefined&&a.expectedVersion!==s.version)fail('화면이 갱신되었습니다. 다시 선택해 주세요.');
  if(a.type==='join') {
    if(!member){if(s.phase!=='lobby'||s.players.length>=8)fail('참가 불가');if(typeof a.name!=='string'||!a.name.trim()||a.name.length>20)fail('이름 오류');s.players.push({uid,name:a.name.trim(),score:0,bot:false});}
  } else if(a.type==='settings') {
    if(uid!==s.host||s.phase!=='lobby')fail('설정 불가');const r=a.rules;
    if(!r||!Number.isInteger(r.rounds)||r.rounds<1||r.rounds>10||!['classic','rascal'].includes(r.scoring)||!['faq','book'].includes(r.creatureFollow)||['whale','kraken','loot'].some(k=>typeof r[k]!=='boolean'))fail('규칙 오류');
    s.rules={rounds:r.rounds,scoring:r.scoring,whale:r.whale,kraken:r.kraken,loot:r.loot,creatureFollow:r.creatureFollow};
  } else if(a.type==='bots') {
    if(uid!==s.host||s.phase!=='lobby'||!Number.isInteger(a.count)||a.count<0||a.count>3)fail('AI 설정 불가');
    const humans=s.players.filter(p=>!p.bot);if(humans.length+a.count>8)fail('전체 인원은 8명 이하');
    s.players=[...humans,...Array.from({length:a.count},(_,i)=>({uid:`ai-${i+1}`,name:['검은수염','바다늑대','달빛해적'][i],score:0,bot:true}))];
  } else if(a.type==='start') {
    if(uid!==s.host||s.phase!=='lobby'||s.players.length<3)fail('AI와 사람을 합쳐 3~8명이 필요합니다.');deal(s,rng);
  } else if(a.type==='bid') {
    if(s.phase!=='bidding'||uid in s.bids||!Number.isInteger(a.bid)||a.bid<0||a.bid>s.cardsPerPlayer)fail('입찰 불가');
    s.bids[uid]=a.bid;if(Object.keys(s.bids).length===s.players.length)s.phase='playing';
  } else if(a.type==='play') {
    if(s.phase!=='playing'||uid!==s.turn)fail('차례가 아닙니다.');
    const hand=s.hands[uid],i=hand.findIndex(c=>c.id===a.cardId);if(i<0)fail('없는 카드');const card={...hand[i]};
    if(card.type==='tigress'){if(!['pirate','escape'].includes(a.mode))fail('티그리스 역할 선택 필요');card.mode=a.mode;}
    if(!legal(hand,card,s.trick,s.rules))fail('선행 무늬를 따라야 합니다. 특수 카드는 자유롭게 낼 수 있습니다.');
    hand.splice(i,1);s.trick.push({uid,card});
    if(s.trick.length===s.players.length) {
      const result=resolve(s.trick);s.lastTrick={round:s.round,number:s.cardsPerPlayer-hand.length,cards:s.trick,result};s.trickLog.push(s.lastTrick);
      if(result.winner){s.won[result.winner]++;s.bonus[result.winner]+=result.bonus;s.loot.push(...result.loot);}
      s.turn=result.leader;s.trick=[];
      if(Object.values(s.hands).every(h=>h.length===0))finishRound(s);
    } else s.turn=s.players[(s.players.findIndex(p=>p.uid===uid)+1)%s.players.length].uid;
  } else if(a.type==='next') {
    if(uid!==s.host||s.phase!=='results')fail('진행 불가');deal(s,rng);
  } else if(a.type==='rematch') {
    if(uid!==s.host||!['finished','results'].includes(s.phase))fail('재시작 불가');return {...newRoom(s.host,s.players.find(p=>p.uid===s.host).name,s.rules),players:s.players.map(p=>({...p,score:0})),version:s.version+1};
  } else if(a.type==='chat') {
    if(typeof a.text!=='string'||!a.text.trim()||a.text.length>300)fail('메시지는 1~300자');s.chat.push({uid,text:a.text.trim(),at:Number.isFinite(a.at)?a.at:0});s.chat=s.chat.slice(-60);
  } else fail('알 수 없는 요청');
  s.version++;s.seen[receipt]=true;const keys=Object.keys(s.seen);if(keys.length>500)delete s.seen[keys[0]];return s;
}
export function view(s,uid) {
  if(!s.players.some(p=>p.uid===uid))fail('참가자 아님');
  const {hands,bids,seen,...pub}=s;
  return {...pub,bids:s.phase==='bidding'?Object.fromEntries(Object.keys(bids).map(k=>[k,k===uid?bids[k]:null])):bids,hand:hands[uid]||[],handCounts:Object.fromEntries(Object.entries(hands).map(([k,v])=>[k,v.length]))};
}
/** AI accepts ONLY a player's redacted view; it cannot inspect other hands/bids. */
export function botDecision(v,rng) {
  const me=v.players.find(p=>p.uid===v.turn),hand=v.hand;
  if(v.phase==='bidding') {
    const estimate=hand.reduce((n,c)=>n+(c.type==='king'?.85:c.type==='pirate'?.7:c.type==='tigress'?.6:c.type==='mermaid'?.5:c.type==='number'?(c.suit==='black'?(c.n/14)*.65:Math.max(0,c.n-9)/14):0),0);
    return {type:'bid',bid:Math.min(v.cardsPerPlayer,Math.round(estimate))};
  }
  if(v.phase!=='playing'||!me)return null;
  const candidates=hand.filter(c=>legal(hand,c,v.trick,v.rules)).flatMap(c=>c.type==='tigress'?[{card:{...c,mode:'escape'},mode:'escape'},{card:{...c,mode:'pirate'},mode:'pirate'}]:[{card:c}]);
  const wants=v.won[v.turn]<v.bids[v.turn];
  const ranked=candidates.map(x=>{const result=resolve([...v.trick,{uid:v.turn,card:x.card}]);const win=['escape','loot'].includes(effectiveType(x.card))&&v.trick.length<v.players.length-1?false:result.winner===v.turn;const strength=x.card.type==='number'?x.card.n+(x.card.suit==='black'?14:0):({escape:0,loot:0,whale:8,kraken:2,mermaid:29,pirate:30,king:31})[effectiveType(x.card)]||0;return {...x,rank:(win===wants?100:0)+(wants?-strength:strength)+(rng(100)/1000)};}).sort((a,b)=>b.rank-a.rank);
  return {type:'play',cardId:ranked[0].card.id,...(ranked[0].mode?{mode:ranked[0].mode}:{})};
}
export function advanceBots(input,rng,idFactory) {
  let s=input;
  for(let guard=0;guard<100;guard++) {
    const bot=s.phase==='bidding'?s.players.find(p=>p.bot&&!(p.uid in s.bids)):s.phase==='playing'?s.players.find(p=>p.uid===s.turn&&p.bot):null;
    if(!bot)return s;
    const decision=botDecision(view(s,bot.uid),rng);if(!decision)return s;
    s=act(s,bot.uid,{...decision,id:idFactory()},rng);
  }
  fail('AI 진행 한도 초과');
}
