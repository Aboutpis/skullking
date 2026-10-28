import {newRoom,act,view,legal,leadSuit,botDecision} from './engine.mjs';
import {checkScenarios} from './scenarios.mjs';
import {GameConnection,validServer} from './connection.mjs';
const app=document.querySelector('#app'),status=document.querySelector('#status');
const $=s=>app.querySelector(s),all=s=>app.querySelectorAll(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storage={get(k){try{return localStorage.getItem(`skullking-cf-${k}`);}catch{return null;}},set(k,v){try{localStorage.setItem(`skullking-cf-${k}`,v);}catch{}},remove(k){try{localStorage.removeItem(`skullking-cf-${k}`);}catch{}}};
const id=()=>globalThis.crypto?.randomUUID?.()||`local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const rng=n=>{if(globalThis.crypto?.getRandomValues){const x=new Uint32Array(1);const limit=4294967296-(4294967296%n);do{crypto.getRandomValues(x);}while(x[0]>=limit);return x[0]%n;}return Math.floor(Math.random()*n);};
let state=null,v=null,uid='captain',local=true,code='',busy=false,auto=true,botTimer=null,network=null,unsubs=[],watchdog=null,polling=false,epoch=0,presence={},selectedCard=null,tigressMode='pirate',selectedBid=0,lastRound=0;
let apiBase=storage.get('server')||'';
let name=storage.get('name')||'선장',chatDraft='',rulesOpen=false,logOpen=false,settingsOpen=false,setupOpen=false,scenarioId='trump',toastTimer;
function toast(message){const el=document.querySelector('#toast');el.textContent=message;el.style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.style.display='none',4500);}
function persist(){if(local&&state)storage.set('practice',JSON.stringify(state));}
function cleanup(){network?.close();epoch++;clearTimeout(botTimer);botTimer=null;clearInterval(watchdog);for(const off of unsubs)off();unsubs=[];polling=false;}
function playerName(u){return v?.players.find(p=>p.uid===u)?.name||u;}
function home(){
  status.textContent=network?'온라인 연결됨':'AI 연습 · 바로 플레이';
  app.innerHTML=`<section class="hero"><div><div class="eyebrow">THE CAPTAIN’S TABLE</div><h1>한 수의 예측,<br>바다의 승부.</h1><p>당신의 입찰은 몇 승인가요?<br>AI 선원과 항해하며 스컬킹의 규칙을 확인하세요.</p><div class="panel"><label>닉네임<input id="nickname" maxlength="20" value="${esc(name)}" autocomplete="nickname"></label><div class="actions"><button class="primary" id="practice">AI와 연습하기</button>${storage.get('practice')?'<button id="resume">이전 연습 이어하기</button>':''}</div><button class="text-button" id="lab">특수 카드 판정 확인 →</button></div><div class="panel online-panel"><div class="eyebrow">PLAY WITH FRIENDS</div><h3>온라인 테이블</h3><div class="actions"><button id="create">방 만들기</button><input id="room-code" maxlength="6" placeholder="6자리 방 코드" aria-label="방 코드"><button id="join">참가</button></div><p class="hint">${apiBase?'Cloudflare 게임 서버 설정됨 · 접속할 때만 연결합니다.':'온라인 서버 배포 전 · AI 연습은 지금 사용할 수 있습니다.'}</p><button class="text-button" id="setup-toggle">온라인 연결 설정 ${setupOpen?'닫기':'열기'}</button><div ${setupOpen?'':'hidden'}><label>게임 서버 주소<input id="server-address" type="url" placeholder="https://서버이름.계정.workers.dev" value="${esc(apiBase)}"></label><button id="connect">서버 주소 저장</button><p class="hint">앱과 이미지는 Pages에서, 게임 진행만 이 서버에서 처리합니다.</p></div></div></div><div class="hero-reference"><img class="hero-art" src="assets/approved-title.jpg" alt="확정된 달빛 해적선 디자인 참조"><span>확정 디자인 참조 · 카드 원화 적용 전</span></div></section>`;
  $('#nickname').oninput=e=>{name=e.target.value.trim().slice(0,20)||'선장';storage.set('name',name);};
  $('#practice').onclick=()=>{cleanup();local=true;uid='captain';code='AI 연습';state=newRoom(uid,name);state=act(state,uid,{id:id(),type:'bots',count:3},rng);v=view(state,uid);selectedBid=0;lastRound=0;persist();render();};
  if($('#resume'))$('#resume').onclick=()=>{try{cleanup();local=true;uid='captain';code='AI 연습';state=JSON.parse(storage.get('practice'));v=view(state,uid);render();scheduleBot();}catch{storage.remove('practice');toast('이전 연습을 불러오지 못했습니다. 새 연습을 시작해 주세요.');home();}};
  $('#lab').onclick=lab;$('#setup-toggle').onclick=()=>{setupOpen=!setupOpen;home();};
  $('#connect').onclick=()=>{try{apiBase=validServer($('#server-address').value.trim());storage.set('server',apiBase);toast('게임 서버 주소를 저장했습니다.');home();}catch(e){toast(e.message);}};
  $('#create').onclick=()=>guard(async()=>{ensureOnline();const result=await network.create(name);await enter(result.code);});
  $('#join').onclick=()=>{const c=$('#room-code').value.trim().toUpperCase();guard(async()=>{await ensureOnline();await enter(c);});};
}
function ensureOnline(){if(!apiBase){setupOpen=true;home();throw new Error('서버 배포 후 게임 서버 주소를 입력하세요. AI 연습은 지금 가능합니다.');}if(!network||network.base!==apiBase)network=new GameConnection(apiBase,{onState:next=>{uid=network.uid;v=next;if(!local)render();},onPresence:next=>{presence=next;if(v&&!local)render();},onStatus:message=>{if(!local)status.textContent=message;}});}
async function enter(c){
 if(!/^[A-Z2-9]{6}$/.test(c))throw new Error('영문 대문자와 숫자로 된 6자리 코드가 필요합니다.');
 cleanup();ensureOnline();local=false;v=null;code=c;presence={};uid='';
 try{const result=await network.open(c,name);uid=result.uid;storage.set('room',code);render();}catch(e){network.close();local=true;v=null;home();throw e;}
}
async function refresh(){} // No periodic state fetch: WebSocket delivers private deltas.
async function guard(fn){if(busy)return;busy=true;try{await fn();}catch(e){toast(e.message);}finally{busy=false;}}
async function send(action){await guard(async()=>{
  const a={...action,id:id(),...(action.type==='chat'?{}:{expectedVersion:v.version})};
  if(local){state=act(state,uid,a,rng);v=view(state,uid);persist();render();scheduleBot();}
  else {await network.command(a);}
});}
function nextBot(){if(!state)return null;return state.phase==='bidding'?state.players.find(p=>p.bot&&!(p.uid in state.bids)):state.phase==='playing'?state.players.find(p=>p.bot&&p.uid===state.turn):null;}
function botStep(){clearTimeout(botTimer);botTimer=null;if(!local||!state)return;const bot=nextBot();if(!bot)return;try{const action=botDecision(view(state,bot.uid),rng);state=act(state,bot.uid,{...action,id:id()},rng);v=view(state,uid);persist();render();scheduleBot();}catch(e){toast(e.message);}}
function scheduleBot(){clearTimeout(botTimer);botTimer=null;if(local&&auto&&nextBot())botTimer=setTimeout(botStep,850);}
const labels={number:'숫자',pirate:'해적',escape:'도망',mermaid:'인어',king:'스컬킹',tigress:'티그리스',whale:'흰고래',kraken:'크라켄',loot:'전리품'};
const suits={green:'앵무새',yellow:'보물',purple:'지도',black:'해적기'};
const symbols={green:'❧',yellow:'◈',purple:'✥',black:'☠',pirate:'⚔',escape:'⚑',mermaid:'♆',king:'♛',tigress:'⚔',whale:'♒',kraken:'✺',loot:'◈'};
function cardLabel(c){return c.type==='number'?`${suits[c.suit]} ${c.n}`:`${labels[c.type]}${c.mode?' · '+(c.mode==='pirate'?'해적':'도망'):''}`;}
function cardHTML(c,clickable=false){
  const ok=clickable&&v.phase==='playing'&&v.turn===uid&&legal(v.hand,c,v.trick,v.rules);
  return `<${clickable?'button':'div'} class="card ${c.suit||c.type} ${selectedCard===c.id&&clickable?'selected':''}" ${clickable?`data-card="${esc(c.id)}" ${ok?'':'disabled'} aria-pressed="${selectedCard===c.id}"`:''} aria-label="${esc(cardLabel(c))}"><span class="card-top">${c.n||labels[c.type]}</span><span class="symbol" aria-hidden="true">${symbols[c.suit||c.type]}</span><span class="name">${c.type==='number'?suits[c.suit]:c.mode?(c.mode==='pirate'?'해적 역할':'도망 역할'):labels[c.type]}</span></${clickable?'button':'div'}>`;
}
function render(){
  if(!v)return;
  const focus=document.activeElement,chatFocused=focus?.id==='message',start=focus?.selectionStart,end=focus?.selectionEnd;
  const host=v.host===uid,results=['results','finished'].includes(v.phase),botCount=v.players.filter(p=>p.bot).length;
  if(lastRound!==v.round){lastRound=v.round;selectedBid=0;selectedCard=null;}
  if(!v.hand.some(c=>c.id===selectedCard))selectedCard=null;
  status.textContent=local?'AI 연습 · 기기에 자동 저장':'온라인 연결됨';
  const myTurn=v.phase==='playing'&&v.turn===uid;
  app.innerHTML=`<div class="game-heading"><div><div class="eyebrow">${local?'PRACTICE TABLE':'PRIVATE ONLINE TABLE'}</div><h2>${v.phase==='lobby'?'출항 대기실':`ROUND ${v.round}${v.round>v.rules.rounds?' · 연장전':''}`} <span class="room-code">${esc(code)}</span></h2></div><button id="leave" class="quiet">나가기</button></div>
  <div class="game-layout"><section class="play-area"><div class="crew-strip">${v.players.map(p=>`<div class="crew-seat ${v.phase==='playing'&&v.turn===p.uid?'active':''}"><span class="seat-avatar">${p.uid===v.host?'♛':p.bot?'⚙':'⚓'}</span><b>${esc(p.name)}${p.uid===uid?' · 나':''}</b><span>${p.bot?'AI':local?'나':presence[p.uid]?.online?'● 접속':'○ 미접속'} · ${p.score}점</span><small>${v.phase==='lobby'?'준비 완료':`${v.won[p.uid]||0}승 / ${p.uid in v.bids?(v.bids[p.uid]===null?'입찰 완료':v.bids[p.uid]+' 입찰'):'입찰 중'}`}</small></div>`).join('')}</div>
  ${v.phase==='lobby'?lobbyHTML(host,botCount):`<div class="table"><div class="table-label">${v.cardsPerPlayer} CARDS · TRICK ${Math.min(v.cardsPerPlayer,(v.cardsPerPlayer-(v.handCounts?.[uid]||0))+(v.trick.some(p=>p.uid===uid)?0:1))} / ${v.cardsPerPlayer}</div><h3>${v.phase==='bidding'?'입찰을 결정하세요':results?(v.phase==='finished'?'최종 순위':'라운드 종료'):myTurn?'당신의 차례입니다':esc(playerName(v.turn))+'의 차례'}</h3><div class="cards on-table">${(v.trick.length?v.trick:v.lastTrick?.cards||[]).map(p=>`<div class="played">${cardHTML(p.card)}<span>${esc(playerName(p.uid))}</span></div>`).join('')||'<span class="empty-table">☸</span>'}</div>${!v.trick.length&&v.lastTrick?`<div class="last-result">지난 트릭 · ${v.lastTrick.result.winner?esc(playerName(v.lastTrick.result.winner))+' 승리':'승자 없음'} · 보너스 후보 ${v.lastTrick.result.bonus}점</div>`:''}</div>
  ${v.phase==='bidding'?bidHTML():''}
  ${!results?`<div class="hand-title"><h3>내 손패 <small>${v.hand.length}장</small></h3><span>${myTurn?'카드 선택 → 제출':'상대 손패는 비공개'}</span></div><div class="cards hand">${v.hand.map(c=>cardHTML(c,true)).join('')}</div>${selectedCard?`<div class="submit-bar"><span>${esc(cardLabel(v.hand.find(c=>c.id===selectedCard)))}</span>${v.hand.find(c=>c.id===selectedCard)?.type==='tigress'?`<select id="tigress-mode" aria-label="티그리스 역할"><option value="pirate" ${tigressMode==='pirate'?'selected':''}>해적으로</option><option value="escape" ${tigressMode==='escape'?'selected':''}>도망으로</option></select>`:''}<button class="primary" id="submit" ${myTurn?'':'disabled'}>카드 제출</button></div>`:''}`:resultHTML(host)}
  ${v.lastTrick?`<details class="panel ruling" ${rulesOpen?'open':''}><summary>최근 트릭 판정 이유</summary><p>${esc(v.lastTrick.result.reason)}</p><p class="hint">다음 선공: ${esc(playerName(v.lastTrick.result.leader))} · 보너스 후보 ${v.lastTrick.result.bonus}점${v.lastTrick.result.loot.length?' · 전리품 동맹 '+v.lastTrick.result.loot.length+'건':''}</p></details>`:''}
  <details class="panel trick-log" ${logOpen?'open':''}><summary>전체 트릭 기록 · ${v.trickLog.length}개</summary>${[...v.trickLog].reverse().map(t=>`<article class="log-row"><b>R${t.round} · ${t.number}번째 트릭 · ${t.result.winner?esc(playerName(t.result.winner))+' 승리':'승자 없음'}</b><p>${t.cards.map(p=>esc(playerName(p.uid))+': '+esc(cardLabel(p.card))).join(' / ')}</p><p class="hint">${esc(t.result.reason)}</p></article>`).join('')||'<p>완료된 트릭이 없습니다.</p>'}</details>`}
  </section><aside class="sidebar">${local?`<div class="panel ai-panel"><div class="eyebrow">RULE CHECK</div><h3>AI 진행</h3><label class="toggle">자동 진행<input type="checkbox" id="auto-ai" ${auto?'checked':''}></label><button id="step-ai" ${nextBot()?'':'disabled'}>AI 한 수 진행</button><p class="hint">AI는 자기 손패와 공개 정보만 사용합니다. 잠시 멈추고 판정을 확인할 수 있습니다.</p><button class="text-button" id="open-lab">특수 카드 판정 확인 →</button></div>`:''}<div class="panel"><h3>선상 대화</h3><div class="chatlog">${v.chat.map(m=>`<div><b>${esc(playerName(m.uid))}</b> ${esc(m.text)}</div>`).join('')||'<p>선원들에게 인사를 남겨보세요.</p>'}</div><form class="chat-form"><input id="message" aria-label="채팅 메시지" maxlength="300" value="${esc(chatDraft)}" placeholder="메시지 입력…"><button type="submit">전송</button></form></div>${!local&&host?'<div class="panel"><button id="usage">방 사용량 확인</button><p class="hint" id="usage-result">요청·메시지·전송량을 확인합니다.</p></div>':''}<details class="panel rule-guide"><summary>적용 규칙</summary><p class="hint">흰고래 ${v.rules.whale?'ON':'OFF'} · 크라켄 ${v.rules.kraken?'ON':'OFF'} · 전리품 ${v.rules.loot?'ON':'OFF'}<br>${v.rules.scoring==='classic'?'기본 점수':'Rascal 점수'} · 바다괴물 등장 후 무늬: ${v.rules.creatureFollow==='faq'?'FAQ 유지 기준':'영문 룰북 해제 기준'}<br>해적 고유 능력·별도 확장팩·2인 더미 규칙 제외</p><p class="hint">선행 무늬가 있으면 같은 무늬의 숫자 카드 또는 특수 카드를 낼 수 있습니다. 입찰은 전원 확정 후 공개됩니다. 동점 1위는 추가 라운드를 진행합니다.</p></details></aside></div>`;
  $('#leave').onclick=async()=>{persist();cleanup();v=null;state=null;selectedCard=null;storage.remove('room');home();};
  if(v.phase==='lobby')wireLobby(host);
  if($('#usage'))$('#usage').onclick=()=>guard(async()=>{const m=await network.metrics();$('#usage-result').textContent=`수신 ${m.inMessages}건 / 전송 ${m.outMessages}건 · 앱 전송 ${(m.outBytes/1024).toFixed(1)}KB · 상태 저장 ${m.stateWrites}회 · 저장 ${(m.currentStoredBytes/1024).toFixed(1)}KB. 과금 CPU/실행시간은 콘솔에서 별도 확인합니다.`;});
  if($('#auto-ai'))$('#auto-ai').onchange=e=>{auto=e.target.checked;scheduleBot();};
  if($('#step-ai'))$('#step-ai').onclick=botStep;
  if($('#open-lab'))$('#open-lab').onclick=()=>{clearTimeout(botTimer);botTimer=null;lab();};
  for(const b of all('[data-bid]'))b.onclick=()=>{selectedBid=Number(b.dataset.bid);render();};
  if($('#bid'))$('#bid').onclick=()=>send({type:'bid',bid:selectedBid});
  for(const b of all('[data-card]'))b.onclick=()=>{selectedCard=b.dataset.card;render();};
  if($('#tigress-mode'))$('#tigress-mode').onchange=e=>{tigressMode=e.target.value;};
  if($('#submit'))$('#submit').onclick=()=>send({type:'play',cardId:selectedCard,mode:tigressMode});
  if($('#next'))$('#next').onclick=()=>send({type:'next'});
  if($('#rematch'))$('#rematch').onclick=()=>send({type:'rematch'});
  if($('.ruling'))$('.ruling').ontoggle=e=>{rulesOpen=e.target.open;};
  if($('.trick-log'))$('.trick-log').ontoggle=e=>{logOpen=e.target.open;};
  $('#message').oninput=e=>{chatDraft=e.target.value;};
  $('.chat-form').onsubmit=e=>{e.preventDefault();if(chatDraft.trim()){const text=chatDraft;chatDraft='';send({type:'chat',text});}};
  $('.chatlog').scrollTop=$('.chatlog').scrollHeight;
  if(chatFocused){$('#message').focus({preventScroll:true});$('#message').setSelectionRange(start,end);}
}
function lobbyHTML(host,count){return `<div class="panel lobby-settings"><h3>함께 항해할 선원</h3><label>AI 선원 수<select id="bot-count" ${host?'':'disabled'}>${[0,1,2,3].map(n=>`<option value="${n}" ${count===n?'selected':''}>${n}명${n===3?' · 나 + AI 3명':''}</option>`).join('')}</select></label><p class="hint">사람과 AI를 합쳐 3~8명으로 시작합니다. 혼자라면 AI 2명 또는 3명을 선택하세요.</p><div class="settings-grid">${['whale','kraken','loot'].map(k=>`<label class="toggle">${labels[k]}<input data-rule="${k}" type="checkbox" ${v.rules[k]?'checked':''} ${host?'':'disabled'}></label>`).join('')}</div><div class="settings-grid"><label>점수 방식<select id="scoring" ${host?'':'disabled'}><option value="classic" ${v.rules.scoring==='classic'?'selected':''}>기본 점수</option><option value="rascal" ${v.rules.scoring==='rascal'?'selected':''}>Rascal 점수</option></select></label><label>라운드 수<select id="rounds" ${host?'':'disabled'}>${[1,3,5,10].map(n=>`<option ${v.rules.rounds===n?'selected':''}>${n}</option>`).join('')}</select></label></div><details><summary>공식 자료 간 차이가 있는 규칙</summary><label>바다괴물을 트릭 중간에 낸 뒤<select id="creature-follow" ${host?'':'disabled'}><option value="faq" ${v.rules.creatureFollow==='faq'?'selected':''}>FAQ 기준 · 선행 무늬 유지</option><option value="book" ${v.rules.creatureFollow==='book'?'selected':''}>현재 영문 룰북 · 무늬 의무 해제</option></select></label><p class="hint">공식 FAQ와 현재 영문 PDF의 설명이 달라 선택할 수 있도록 표시했습니다. 흰고래 트릭의 14 보너스는 보존하고, 숫자 없는 경우 영문 룰북의 가상 승자를 다음 선공자로 적용합니다.</p></details>${host?`<div class="actions"><button id="start" class="primary" ${v.players.length<3?'disabled':''}>항해 시작 · ${v.players.length}명</button></div>`:'<p>방장이 시작하기를 기다립니다.</p>'}</div>`;}
function wireLobby(host){if(!host)return;$('#bot-count').onchange=e=>send({type:'bots',count:Number(e.target.value)});$('#start').onclick=()=>send({type:'start'});for(const el of all('[data-rule],#scoring,#rounds,#creature-follow'))el.onchange=()=>send({type:'settings',rules:{...v.rules,whale:$('[data-rule="whale"]').checked,kraken:$('[data-rule="kraken"]').checked,loot:$('[data-rule="loot"]').checked,scoring:$('#scoring').value,rounds:Number($('#rounds').value),creatureFollow:$('#creature-follow').value}});}
function bidHTML(){if(uid in v.bids)return '<div class="bid-wait">✓ 입찰 확정 · 다른 선원을 기다립니다.</div>';return `<section class="panel paper"><h3>이번 라운드에 몇 번 이길까요?</h3><div class="bidgrid">${Array.from({length:v.cardsPerPlayer+1},(_,i)=>`<button data-bid="${i}" class="${selectedBid===i?'selected':''}" aria-pressed="${selectedBid===i}">${i}</button>`).join('')}</div><div class="actions"><button id="bid" class="primary">${selectedBid}승 입찰 확정</button></div></section>`;}
function resultHTML(host){const last=v.history.at(-1),sorted=[...last.rows].sort((a,b)=>b.total-a.total);return `<section class="panel paper results"><h3>${v.phase==='finished'?'최종 결과':v.round>=v.rules.rounds&&v.tied?'공동 1위 · 연장전이 필요합니다':'라운드 결과'}</h3><div class="score-table"><table><thead><tr><th>선원</th><th>입찰/승리</th><th>기본</th><th>카드</th><th>동맹</th><th>합계</th><th>누적</th></tr></thead><tbody>${sorted.map(p=>`<tr><td>${esc(playerName(p.uid))}</td><td>${p.bid}/${p.won}</td><td>${p.base}</td><td>+${p.captured}</td><td>+${p.partnership}</td><td>${p.delta}</td><td><b>${p.total}</b></td></tr>`).join('')}</tbody></table></div><p class="score-note">기본 점수 + 획득 카드 보너스 + 전리품 동맹 보너스 = 라운드 합계</p>${host?`<div class="actions">${v.phase==='results'?'<button id="next" class="primary">'+(v.round>=v.rules.rounds?'연장전 시작':'다음 라운드')+'</button>':''}<button id="rematch">대기실로</button></div>`:''}</section>`;}
function lab(){const cases=checkScenarios(),s=cases.find(x=>x.id===scenarioId)||cases[0];app.innerHTML=`<div class="game-heading"><div><div class="eyebrow">RULE EXPLORER</div><h2>특수 카드 판정 확인</h2></div><button id="lab-back">${v?'게임으로':'처음으로'}</button></div><div class="panel"><label>확인할 상황<select id="scenario">${cases.map(c=>`<option value="${c.id}" ${s.id===c.id?'selected':''}>${esc(c.title)}</option>`).join('')}</select></label><div class="table"><div class="cards">${s.trick.map((p,i)=>`<div class="played">${cardHTML(p.card)}<span>${i+1}번 · ${p.uid===s.result.winner?'승리':'카드 제출'}</span></div>`).join('')}</div></div><div class="rule-answer"><h3>${s.result.winner?Number(s.result.winner.slice(1))+'번 승리':'승자 없음'} · 보너스 후보 ${s.result.bonus}점</h3><p>${esc(s.note)}</p><p>다음 선공: ${Number(s.result.leader.slice(1))}번</p><span class="hint">${cases.filter(c=>c.pass).length}/${cases.length} 시나리오 자동 검증 통과 · 카드 순서는 왼쪽부터</span></div></div>`;$('#scenario').onchange=e=>{scenarioId=e.target.value;lab();};$('#lab-back').onclick=()=>{if(v){render();scheduleBot();}else home();};}
async function init(){
 try{if(!apiBase){const response=await fetch('./server-config.json',{cache:'no-store'});if(response.ok){const config=await response.json();if(config.apiBase)apiBase=validServer(config.apiBase);}}}catch{}
 home();
 if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{});
 const saved=storage.get('room');if(saved&&apiBase){try{ensureOnline();await enter(saved);}catch(e){toast('방 복구: '+e.message);home();}}
}
init();
