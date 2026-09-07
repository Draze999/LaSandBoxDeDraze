import { randomInt, randomUUID } from "node:crypto";
import { getAllAnime } from "../../database/anime.js";
import { A_LA_SUITE_THEMES } from "./constants.js";
import type { ALaSuiteAnswer, ALaSuiteSnapshot, ALaSuiteState } from "./types.js";

type Callback = (roomCode: string) => void;
function shuffle<T>(items: T[]) { for (let i=items.length-1;i>0;i--){const j=randomInt(i+1);[items[i],items[j]]=[items[j],items[i]];} return items; }
function normalize(v:string){return v.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}

export class ALaSuiteEngine {
  private states = new Map<string, ALaSuiteState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly onState: Callback) {}

  async start(code:string, playerIds:string[], duration:number) {
    if(playerIds.length<2) return {ok:false as const,error:"NOT_ENOUGH_PLAYERS"};
    // Ensure the database has content before opening a round.
    if((await getAllAnime()).length===0) return {ok:false as const,error:"NO_CONTENT"};
    const themes = shuffle([...A_LA_SUITE_THEMES]);
    const players:Record<string,{id:string;theme:string;answers:ALaSuiteAnswer[]}> = {};
    playerIds.forEach((id,i)=>players[id]={id,theme:themes[i%themes.length],answers:[]});
    const old=this.timers.get(code); if(old) clearTimeout(old);
    const state:ALaSuiteState={phase:"playing",endsAt:Date.now()+duration*1000,players,answerOrder:[],currentJudgePlayerIndex:0,currentJudgeAnswerIndex:0,roundScores:Object.fromEntries(playerIds.map(id=>[id,0])),result:null};
    this.states.set(code,state);
    this.timers.set(code,setTimeout(()=>this.beginJudging(code),duration*1000));
    this.onState(code);
    return {ok:true as const};
  }

  get(code:string){return this.states.get(code);}
  private beginJudging(code:string){
    const s=this.states.get(code); if(!s||s.phase!=="playing")return;
    const timer=this.timers.get(code); if(timer)clearTimeout(timer); this.timers.delete(code);
    s.phase="judging"; s.endsAt=null;
    const ids=Object.keys(s.players);
    s.currentJudgePlayerIndex=0; s.currentJudgeAnswerIndex=0;
    s.answerOrder=ids.flatMap(owner=>s.players[owner].answers.map(a=>a.id));
    // Start on the first answer that someone other than its author can judge.
    this.advanceToJudgeable(code,s);
    this.onState(code);
  }

  private advanceToJudgeable(code:string,s:ALaSuiteState){
    while(s.currentJudgePlayerIndex<Object.keys(s.players).length){
      const owner=Object.keys(s.players)[s.currentJudgePlayerIndex];
      const answers=s.players[owner].answers;
      if(s.currentJudgeAnswerIndex<answers.length) {
        const a=answers[s.currentJudgeAnswerIndex];
        if(!a.finalized && owner!==Object.keys(s.players)[s.currentJudgePlayerIndex]) return;
      }
      s.currentJudgePlayerIndex++;
      s.currentJudgeAnswerIndex=0;
    }
    // The indexing above cannot judge because current owner equals judge. Instead,
    // judging is done per answer by all other players; find first unfinalized answer.
  }

  private firstPendingAnswer(s:ALaSuiteState){
    for(const owner of Object.keys(s.players)){
      const a=s.players[owner].answers.find(x=>!x.finalized);
      if(a)return {owner,a};
    }
    return null;
  }

  answer(code:string,playerId:string,text:string){
    const s=this.states.get(code); if(!s||s.phase!=="playing")return{ok:false as const,error:"NOT_PLAYING"};
    if(!s.players[playerId])return{ok:false as const,error:"PLAYER_NOT_FOUND"};
    if(s.endsAt!==null&&Date.now()>=s.endsAt){this.beginJudging(code);return{ok:false as const,error:"TIME_OVER"};}
    const value=text.trim(); if(!value)return{ok:false as const,error:"EMPTY_ANSWER"};
    if(s.players[playerId].answers.some(a=>normalize(a.text)===normalize(value)))return{ok:false as const,error:"DUPLICATE_ANSWER"};
    s.players[playerId].answers.push({id:randomUUID(),authorId:playerId,text:value.slice(0,160),acceptedVotes:0,rejectedVotes:0,finalized:false,accepted:null});
    this.onState(code); return{ok:true as const};
  }

  validate(code:string,judgeId:string,answerId:string,accepted:boolean){
    const s=this.states.get(code); if(!s||s.phase!=="judging")return{ok:false as const,error:"NOT_JUDGING"};
    let answer:ALaSuiteAnswer|undefined; let ownerId="";
    for(const [id,p] of Object.entries(s.players)){const found=p.answers.find(a=>a.id===answerId);if(found){answer=found;ownerId=id;break;}}
    if(!answer)return{ok:false as const,error:"ANSWER_NOT_FOUND"};
    if(ownerId===judgeId)return{ok:false as const,error:"CANNOT_JUDGE_OWN"};
    if(answer.finalized)return{ok:false as const,error:"ALREADY_JUDGED"};
    // Store each judge's vote implicitly by answer-vote counts; a judge cannot vote twice.
    const voteKey=`${answerId}:${judgeId}`;
    const stateAny=s as any;
    stateAny.votes ??= new Set<string>();
    if(stateAny.votes.has(voteKey))return{ok:false as const,error:"ALREADY_VOTED"};
    stateAny.votes.add(voteKey);
    if(accepted)answer.acceptedVotes++;else answer.rejectedVotes++;
    const totalJudges=Object.keys(s.players).length-1;
    if(answer.acceptedVotes+answer.rejectedVotes>=totalJudges){
      answer.finalized=true; answer.accepted=answer.acceptedVotes>answer.rejectedVotes;
      if(answer.accepted) s.roundScores[ownerId]=(s.roundScores[ownerId]??0)+1;
    }
    const pending=this.firstPendingAnswer(s);
    if(!pending){
      const counts=Object.fromEntries(Object.entries(s.roundScores));
      const min=Math.min(...Object.values(counts));
      s.result=Object.fromEntries(Object.entries(counts).map(([id,n])=>[id,Math.max(0,n-min)]));
      s.phase="finished";
    }
    this.onState(code); return{ok:true as const,finished:s.phase==="finished"};
  }

  snapshot(code:string,playerId:string):ALaSuiteSnapshot|null{
    const s=this.states.get(code);if(!s)return null;
    const pending=this.firstPendingAnswer(s);
    const currentJudgePlayerId=pending?pending.owner:null;
    const visible=s.phase==="playing"?{[playerId]:s.players[playerId]?.answers??[]}:Object.fromEntries(Object.entries(s.players).map(([id,p])=>[id,p.answers]));
    return {phase:s.phase,endsAt:s.endsAt,theme:s.players[playerId]?.theme??"",ownAnswers:s.players[playerId]?.answers??[],visibleAnswers:visible,currentJudgePlayerId,currentJudgeAnswerId:pending?.a.id??null,roundScores:s.roundScores,result:s.result,playerId,themes:s.phase==="playing"?{[playerId]:s.players[playerId]?.theme??""}:Object.fromEntries(Object.entries(s.players).map(([id,p])=>[id,p.theme])),myVotedAnswerIds:[...((s as any).votes ?? new Set<string>())].filter((key:string)=>key.endsWith(`:${playerId}`)).map((key:string)=>key.slice(0,key.lastIndexOf(":")))};
  }
  clear(code:string){const t=this.timers.get(code);if(t)clearTimeout(t);this.timers.delete(code);this.states.delete(code);}
  removePlayer(code:string,playerId:string){const s=this.states.get(code);if(!s)return;delete s.players[playerId];if(Object.keys(s.players).length===0)this.clear(code);else this.onState(code);}
}
