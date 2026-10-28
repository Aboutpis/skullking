import {resolve} from './engine.mjs';
const n=(suit,n)=>({id:`${suit}-${n}`,type:'number',suit,n});
const c=(type,mode)=>({id:type,type,...(mode?{mode}:{})});
const sample=(id,title,cards,winner,bonus,note)=>({id,title,trick:cards.map((card,i)=>({uid:`p${i+1}`,card})),expected:{winner:winner?`p${winner}`:null,bonus},note});
export const scenarios=[
 sample('trump','검은색 1 vs 일반 14',[n('yellow',14),n('black',1),n('yellow',13)],2,10,'검은 해적기는 일반 숫자보다 강합니다. 획득한 일반 14는 보너스 10점입니다.'),
 sample('cycle','해적 · 스컬킹 · 인어',[c('pirate'),c('king'),c('mermaid')],3,40,'세 종류가 함께 나오면 인어 승리. 스컬킹 포획 40점만 얻습니다.'),
 sample('king','스컬킹의 해적 포획',[c('pirate'),c('tigress','pirate'),c('king')],3,60,'해적 2장 포획으로 보너스 60점. 해적으로 낸 티그리스도 포함됩니다.'),
 sample('whale','흰고래와 최고 숫자 동률',[n('green',14),n('black',14),c('whale')],1,30,'무늬를 무시한 최고 숫자 중 먼저 낸 카드가 승리. 획득한 14 두 장의 보너스는 30점입니다.'),
 sample('whale-empty','숫자 없는 흰고래 트릭',[c('king'),c('mermaid'),c('whale')],null,0,'승자 없음. 현재 영문 룰북의 가상 승자 기준으로 인어를 낸 2번이 다음 선공입니다.'),
 sample('kraken','크라켄이 트릭 파괴',[n('yellow',14),n('black',3),c('kraken')],null,0,'트릭과 보너스는 사라집니다. 가상 승자인 검은색 3의 2번이 다음 선공입니다.'),
 sample('creatures','흰고래 다음 크라켄',[n('yellow',12),n('black',3),c('whale'),c('kraken')],null,0,'뒤에 낸 크라켄만 유효합니다. 2번이 다음 선공입니다.'),
 sample('creatures-reverse','크라켄 다음 흰고래',[n('yellow',12),n('black',3),c('kraken'),c('whale')],1,0,'뒤에 낸 흰고래만 유효합니다. 색을 무시한 숫자 12가 승리합니다.'),
 sample('escapes','모두 도망일 때',[c('escape'),c('tigress','escape'),c('loot')],1,0,'먼저 낸 도망이 승리. 전리품을 낸 3번과 1번 사이에 동맹이 생깁니다.'),
 sample('loot','전리품과 동맹',[c('loot'),n('purple',12),n('purple',7)],2,0,'1번과 승자인 2번이 둘 다 입찰을 맞혀야 각각 20점을 얻습니다. 즉시 점수가 아닙니다.'),
];
export function checkScenarios(){return scenarios.map(s=>({...s,result:resolve(s.trick),pass:resolve(s.trick).winner===s.expected.winner&&resolve(s.trick).bonus===s.expected.bonus}));}
