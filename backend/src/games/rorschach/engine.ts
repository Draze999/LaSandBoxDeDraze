import { randomInt, randomUUID } from "node:crypto";
import type { RorschachGuess, RorschachPoint, RorschachSnapshot, RorschachState, RorschachStroke } from "./types.js";

type Callback = (roomCode: string) => void;
const COLORS = ["#e56b6f", "#4dabf7", "#ffd166", "#c77dff", "#2ec4b6", "#ff9f1c", "#ef476f", "#8ac926", "#06d6a0", "#118ab2", "#f15bb5", "#00bbf9"];
const distance = (a: RorschachPoint, b: RorschachPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const distanceToSegment=(p:RorschachPoint,a:RorschachPoint,b:RorschachPoint)=>{const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return distance(p,{x:a.x+t*dx,y:a.y+t*dy})};
const segmentIntersection = (a:RorschachPoint,b:RorschachPoint,c:RorschachPoint,d:RorschachPoint) => {
  const cross=(p:RorschachPoint,q:RorschachPoint,r:RorschachPoint)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const o1=cross(a,b,c),o2=cross(a,b,d),o3=cross(c,d,a),o4=cross(c,d,b);
  return ((o1>0&&o2<0)||(o1<0&&o2>0))&&((o3>0&&o4<0)||(o3<0&&o4>0));
};
function makeBase(): RorschachPoint[] {
  for(let attempt=0;attempt<100;attempt++) {
    const points=[{x:0.25+Math.random()*0.5,y:0.25+Math.random()*0.5}];
    const count=3+randomInt(3);
    for(let i=1;i<count;i++) {
      const prev=points[i-1];
      const angle=Math.random()*Math.PI*2;
      const len=0.10+Math.random()*0.12;
      points.push({x:Math.min(.9,Math.max(.1,prev.x+Math.cos(angle)*len)),y:Math.min(.9,Math.max(.1,prev.y+Math.sin(angle)*len))});
    }
    const total=points.slice(1).reduce((n,p,i)=>n+distance(points[i],p),0);
    let crossings=0;
    for(let i=0;i<points.length-1;i++) for(let j=i+2;j<points.length-1;j++) if(segmentIntersection(points[i],points[i+1],points[j],points[j+1])) crossings++;
    if(total>=0.28&&total<=0.65&&crossings<=1)return points;
  }
  return [{x:.28,y:.48},{x:.43,y:.35},{x:.58,y:.55},{x:.72,y:.42}];
}

export class RorschachEngine {
  private states=new Map<string,RorschachState>();
  private cumulative=new Map<string,Record<string,number>>();
  private timers=new Map<string,ReturnType<typeof setTimeout>>();
  constructor(private readonly onState:Callback){}
  start(code:string, playerIds:string[]) {
    if(playerIds.length<2)return{ok:false as const,error:"NOT_ENOUGH_PLAYERS"};
    const old=this.states.get(code); const previous=this.cumulative.get(code)??{};
    const colors:Record<string,string>={}; const pool=[...COLORS].sort(()=>Math.random()-.5); playerIds.forEach((id,i)=>colors[id]=pool[i%pool.length]);
    const cumulative=Object.fromEntries(playerIds.map(id=>[id,previous[id]??0])); this.cumulative.set(code,cumulative);
    const s:RorschachState={phase:"drawing",playerOrder:[...playerIds],base:makeBase(),strokes:[],colors,validated:Object.fromEntries(playerIds.map(id=>[id,false])),endsAt:Date.now()+300000,currentPlayerIndex:0,guesses:[],roundScores:Object.fromEntries(playerIds.map(id=>[id,0])),cumulativeScores:cumulative,roundNumber:(old?.roundNumber??0)+1};
    this.states.set(code,s); this.resetTimer(code,300000); this.onState(code); return{ok:true as const};
  }
  private resetTimer(code:string,ms:number){const old=this.timers.get(code);if(old)clearTimeout(old);this.timers.set(code,setTimeout(()=>this.finishDrawing(code),ms));}
  private finishDrawing(code:string){
    const s=this.states.get(code);
    if(!s || s.phase!=="drawing") return;
    const timer=this.timers.get(code);
    if(timer) clearTimeout(timer);
    this.timers.delete(code);
    s.phase="guessing";
    s.currentPlayerIndex=0;
    s.guesses=[];
    s.endsAt=0;
    this.onState(code);
  }
  snapshot(code:string,playerId:string):RorschachSnapshot|null{const s=this.states.get(code);if(!s)return null;const current=s.playerOrder[s.currentPlayerIndex]??null;const guesses=s.guesses.map(g=>({...g,authorId:s.phase==="judging"?"":g.authorId}));return{phase:s.phase,playerOrder:s.playerOrder,base:s.base,strokes:s.strokes,colors:s.colors,validated:s.validated,endsAt:s.endsAt,currentPlayerId:current,currentPlayerIndex:s.currentPlayerIndex,reviewTotal:s.playerOrder.length,guesses,roundScores:s.roundScores,cumulativeScores:s.cumulativeScores,roundNumber:s.roundNumber};}
  addStroke(code:string,playerId:string,points:RorschachPoint[]){const s=this.states.get(code);if(!s||s.phase!=="drawing")return{ok:false as const,error:"NOT_DRAWING"};if(!s.playerOrder.includes(playerId))return{ok:false as const,error:"PLAYER_NOT_FOUND"};if(Date.now()>s.endsAt)return{ok:false as const,error:"TIME_OVER"};if(!points||points.length<2)return{ok:false as const,error:"INVALID_STROKE"};s.strokes.push({id:randomUUID(),playerId,points:points.map(p=>({x:Math.max(0,Math.min(1,p.x)),y:Math.max(0,Math.min(1,p.y))}))});this.onState(code);return{ok:true as const};}
  undo(code:string,playerId:string){const s=this.states.get(code);if(!s||s.phase!=="drawing")return{ok:false as const,error:"NOT_DRAWING"};for(let i=s.strokes.length-1;i>=0;i--)if(s.strokes[i].playerId===playerId){s.strokes.splice(i,1);this.onState(code);return{ok:true as const};}return{ok:false as const,error:"NO_STROKE"};}
  erase(code:string,playerId:string,points:RorschachPoint[]){const s=this.states.get(code);if(!s||s.phase!=="drawing")return{ok:false as const,error:"NOT_DRAWING"};if(!points.length)return{ok:false as const,error:"INVALID_STROKE"};const before=s.strokes.length;s.strokes=s.strokes.filter(st=>{if(st.playerId!==playerId)return true;for(let i=0;i<st.points.length-1;i++)for(const p of points)if(distanceToSegment(p,st.points[i],st.points[i+1])<0.028)return false;return true});if(s.strokes.length!==before)this.onState(code);return{ok:true as const};}
  validate(code:string,playerId:string){
    const s=this.states.get(code);
    if(!s || s.phase!=="drawing") return {ok:false as const,error:"NOT_DRAWING"};
    if(!s.playerOrder.includes(playerId)) return {ok:false as const,error:"PLAYER_NOT_FOUND"};
    s.validated[playerId]=true;
    const everyoneValidated = s.playerOrder.length > 0 && s.playerOrder.every(id => s.validated[id] === true);
    if(everyoneValidated) this.finishDrawing(code);
    else this.onState(code);
    return {ok:true as const, advanced:everyoneValidated};
  }
  guess(code:string,authorId:string,text:string){const s=this.states.get(code);if(!s||s.phase!=="guessing")return{ok:false as const,error:"NOT_GUESSING"};const target=s.playerOrder[s.currentPlayerIndex];if(!target||target===authorId)return{ok:false as const,error:"CANNOT_GUESS_OWN"};if(!text.trim())return{ok:false as const,error:"EMPTY_GUESS"};if(s.guesses.some(g=>g.targetPlayerId===target&&g.authorId===authorId))return{ok:false as const,error:"ALREADY_GUESSED"};s.guesses.push({id:randomUUID(),authorId,targetPlayerId:target,text:text.trim().slice(0,160),accepted:null});if(s.guesses.filter(g=>g.targetPlayerId===target).length===s.playerOrder.length-1){if(s.currentPlayerIndex<s.playerOrder.length-1){s.currentPlayerIndex++;this.onState(code);}else{s.phase="judging";s.currentPlayerIndex=0;this.onState(code);}}else this.onState(code);return{ok:true as const};}
  judge(code:string,ownerId:string,guessId:string,accepted:boolean){const s=this.states.get(code);if(!s||s.phase!=="judging")return{ok:false as const,error:"NOT_JUDGING"};const owner=s.playerOrder[s.currentPlayerIndex];if(owner!==ownerId)return{ok:false as const,error:"NOT_YOUR_DRAWING"};const g=s.guesses.find(x=>x.id===guessId&&x.targetPlayerId===owner);if(!g)return{ok:false as const,error:"GUESS_NOT_FOUND"};if(g.accepted!==null)return{ok:false as const,error:"ALREADY_JUDGED"};g.accepted=accepted;if(accepted)s.roundScores[g.authorId]=(s.roundScores[g.authorId]??0)+1;const target=s.guesses.filter(x=>x.targetPlayerId===owner);if(target.length===s.playerOrder.length-1&&target.every(x=>x.accepted!==null)){const correct=target.filter(x=>x.accepted).length;s.roundScores[owner]=(s.roundScores[owner]??0)+correct;if(correct===s.playerOrder.length-1)s.roundScores[owner]+=2;if(s.currentPlayerIndex<s.playerOrder.length-1){s.currentPlayerIndex++;this.onState(code);}else{for(const id of s.playerOrder)s.cumulativeScores[id]=(s.cumulativeScores[id]??0)+(s.roundScores[id]??0);this.cumulative.set(code,s.cumulativeScores);s.phase="finished";this.onState(code);}}else this.onState(code);return{ok:true as const};}
  removePlayer(code:string,id:string){const s=this.states.get(code);if(!s)return;s.playerOrder=s.playerOrder.filter(x=>x!==id);delete s.validated[id];delete s.colors[id];delete s.roundScores[id];delete s.cumulativeScores[id];s.strokes=s.strokes.filter(x=>x.playerId!==id);this.onState(code);}
  clear(code:string){const t=this.timers.get(code);if(t)clearTimeout(t);this.timers.delete(code);this.states.delete(code);this.cumulative.delete(code);}
}
