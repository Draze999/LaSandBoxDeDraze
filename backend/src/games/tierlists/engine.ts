import { randomInt, randomUUID } from "node:crypto";
import { getAllAnime, getRandomCharacters } from "../../database/anime.js";
import { TIERLIST_ITEM_COUNTS, TIERLIST_THEMES, type TierlistCategory, type TierlistItemCount, type TierlistTier } from "./constants.js";
import type { TierlistBoard, TierlistGuess, TierlistItem, TierlistSnapshot, TierlistState } from "./types.js";

type AnimeRow = { id: number | string; name: string; image_url?: string | null };
type CharacterRow = { id: number | string; name: string; image_url?: string | null };

type Callback = (roomCode: string) => void;
const shuffle = <T,>(items: T[]) => { for (let i=items.length-1;i>0;i--){ const j=randomInt(i+1); [items[i],items[j]]=[items[j],items[i]]; } return items; };

export class TierlistEngine {
  private states = new Map<string, TierlistState>();
  private cumulative = new Map<string, Record<string, number>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], category: TierlistCategory, count: number) {
    if (playerIds.length < 2) return { ok:false as const, error:"NOT_ENOUGH_PLAYERS" };
    const validCount = TIERLIST_ITEM_COUNTS.includes(count as TierlistItemCount) ? count as TierlistItemCount : 10;
    const animeRows = (await getAllAnime()) as AnimeRow[];
    const characterRows = (await getRandomCharacters(validCount)) as CharacterRow[];
    const items: TierlistItem[] = category === "anime"
      ? animeRows.map((x: AnimeRow): TierlistItem => ({ id: Number(x.id), name: String(x.name), imageUrl: x.image_url ?? null, category: "anime" }))
      : characterRows.map((x: CharacterRow): TierlistItem => ({ id: Number(x.id), name: String(x.name), imageUrl: x.image_url ?? null, category: "character" }));
    if (items.length < validCount) return { ok:false as const, error:"NOT_ENOUGH_ITEMS" };
    const selected = shuffle(items).slice(0, validCount);
    const previous = this.cumulative.get(roomCode) ?? {};
    const cumulative = Object.fromEntries(playerIds.map(id=>[id, previous[id] ?? 0]));
    const themeList = shuffle([...TIERLIST_THEMES]);
    const themes = Object.fromEntries(playerIds.map((id,i)=>[id,themeList[i % themeList.length]]));
    const boards: Record<string,TierlistBoard> = Object.fromEntries(playerIds.map(id=>[id,{playerId:id,placements:Object.fromEntries(selected.map(x=>[String(x.id),null])),validated:false}]));
    const old=this.states.get(roomCode); if(this.timers.has(roomCode)) clearTimeout(this.timers.get(roomCode)!);
    const state:TierlistState={category,items:selected,themes,boards,phase:"sorting",currentPlayerIndex:0,turnOrder:[...playerIds],guesses:[],roundScores:Object.fromEntries(playerIds.map(id=>[id,0])),cumulativeScores:cumulative,roundNumber:(old?.roundNumber??0)+1,endsAt:Date.now()+300000,result:null};
    this.states.set(roomCode,state); this.cumulative.set(roomCode,cumulative); this.onState(roomCode);
    this.timers.set(roomCode,setTimeout(()=>this.finishSorting(roomCode),300000));
    return {ok:true as const};
  }
  get(code:string){return this.states.get(code);}
  private finishSorting(code:string){const s=this.states.get(code); if(!s||s.phase!=="sorting")return; s.phase="guessing"; s.currentPlayerIndex=0; s.guesses=[]; this.onState(code);}
  place(code:string,playerId:string,itemId:number,tier:TierlistTier|null){const s=this.states.get(code); if(!s||s.phase!=="sorting")return{ok:false as const,error:"NOT_SORTING"}; if(Date.now()>s.endsAt)return{ok:false as const,error:"TIME_OVER"}; const b=s.boards[playerId]; if(!b)return{ok:false as const,error:"PLAYER_NOT_FOUND"}; if(!s.items.some(x=>x.id===itemId))return{ok:false as const,error:"ITEM_NOT_FOUND"}; if(tier!==null&&!['S','A','B','C','D'].includes(tier))return{ok:false as const,error:"INVALID_TIER"}; b.placements[String(itemId)]=tier;b.validated=false;this.onState(code);return{ok:true as const};}
  validate(code:string,playerId:string){const s=this.states.get(code);if(!s||s.phase!=="sorting")return{ok:false as const,error:"NOT_SORTING"};const b=s.boards[playerId];if(!b)return{ok:false as const,error:"PLAYER_NOT_FOUND"};b.validated=true; if(s.turnOrder.every(id=>s.boards[id].validated)){const remaining=5000;s.endsAt=Date.now()+remaining;const oldTimer=this.timers.get(code);if(oldTimer)clearTimeout(oldTimer);this.timers.set(code,setTimeout(()=>this.finishSorting(code),remaining));this.onState(code);return{ok:true as const,advanced:true};}this.onState(code);return{ok:true as const,advanced:false};}
  guess(code:string,authorId:string,text:string){const s=this.states.get(code);if(!s||s.phase!=="guessing")return{ok:false as const,error:"NOT_GUESSING"};const target=s.turnOrder[s.currentPlayerIndex];if(authorId===target)return{ok:false as const,error:"CANNOT_GUESS_OWN"};if(!text.trim())return{ok:false as const,error:"EMPTY_GUESS"};if(s.guesses.some(g=>g.authorId===authorId&&g.targetPlayerId===target))return{ok:false as const,error:"ALREADY_GUESSED"};s.guesses.push({id:randomUUID(),authorId,targetPlayerId:target,text:text.trim().slice(0,160),accepted:null});const needed=s.turnOrder.length-1;const count=s.guesses.filter(g=>g.targetPlayerId===target).length;if(count===needed)this.advanceGuessing(code,s);else this.onState(code);return{ok:true as const};}
  private advanceGuessing(code:string,s:TierlistState){if(s.currentPlayerIndex<s.turnOrder.length-1){s.currentPlayerIndex++;this.onState(code);return;}s.phase="judging";s.currentPlayerIndex=0;this.onState(code);}
  judge(code:string,ownerId:string,guessId:string,accepted:boolean){const s=this.states.get(code);if(!s||s.phase!=="judging")return{ok:false as const,error:"NOT_JUDGING"};const owner=s.turnOrder[s.currentPlayerIndex];if(ownerId!==owner)return{ok:false as const,error:"NOT_YOUR_TIERLIST"};const g=s.guesses.find(x=>x.id===guessId&&x.targetPlayerId===owner);if(!g)return{ok:false as const,error:"GUESS_NOT_FOUND"};if(g.accepted!==null)return{ok:false as const,error:"ALREADY_JUDGED"};g.accepted=accepted;if(accepted){s.roundScores[g.authorId]++;s.roundScores[owner]++;}const pending=s.guesses.some(x=>x.targetPlayerId===owner&&x.accepted===null);if(!pending)this.advanceJudging(code,s);else this.onState(code);return{ok:true as const};}
  private advanceJudging(code:string,s:TierlistState){if(s.currentPlayerIndex<s.turnOrder.length-1){s.currentPlayerIndex++;this.onState(code);return;}for(const id of s.turnOrder)s.cumulativeScores[id]=(s.cumulativeScores[id]??0)+(s.roundScores[id]??0);this.cumulative.set(code,s.cumulativeScores);s.phase="finished";s.result={correctGuesses:s.guesses.filter(g=>g.accepted).length};this.onState(code);}
  snapshot(code:string,playerId:string):TierlistSnapshot|null{const s=this.states.get(code);if(!s)return null;const current=s.turnOrder[s.currentPlayerIndex]??null;const revealTheme=s.phase==="sorting" ? true : s.phase==="judging"||s.phase==="finished"||current===playerId;
    const themeOwner = s.phase === "sorting" ? playerId : (current ?? playerId);return{category:s.category,items:s.items,theme:revealTheme?s.themes[themeOwner]??null:null,boards:s.boards,phase:s.phase,currentPlayerId:current,currentPlayerIndex:s.currentPlayerIndex,reviewTotal:s.turnOrder.length,guesses:s.guesses,roundScores:s.roundScores,cumulativeScores:s.cumulativeScores,roundNumber:s.roundNumber,endsAt:s.endsAt,result:s.result};}
  clear(code:string){const t=this.timers.get(code);if(t)clearTimeout(t);this.timers.delete(code);this.states.delete(code);this.cumulative.delete(code);}
  removePlayer(code:string,id:string){const s=this.states.get(code);if(!s)return;s.turnOrder=s.turnOrder.filter(x=>x!==id);delete s.boards[id];delete s.themes[id];delete s.roundScores[id];delete s.cumulativeScores[id];if(!s.turnOrder.length)this.clear(code);else if(s.currentPlayerIndex>=s.turnOrder.length)s.currentPlayerIndex=0;this.onState(code);}
}
