import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import "./ALaSuite.css";

type Player={id:string;pseudo:string;isHost:boolean};
type Room={code:string;hostId:string;players:Player[]};
type Answer={id:string;authorId:string;text:string;acceptedVotes:number;rejectedVotes:number;finalized:boolean;accepted:boolean|null};
type Snapshot={phase:"playing"|"judging"|"finished";endsAt:number|null;theme:string;ownAnswers:Answer[];visibleAnswers:Record<string,Answer[]>;currentJudgePlayerId:string|null;currentJudgeAnswerId:string|null;roundScores:Record<string,number>;result:Record<string,number>|null;playerId:string;myVotedAnswerIds:string[]};
type Props={room:Room;playerId:string;onExit:()=>void};

export default function ALaSuite({room,playerId,onExit}:Props){
 const [game,setGame]=useState<Snapshot|null>(null),[text,setText]=useState(""),[now,setNow]=useState(Date.now()),[error,setError]=useState("");
 useEffect(()=>{const st=(s:Snapshot)=>setGame(s);socket.on("game8:start",st);socket.on("game8:state",st);socket.emit("game8:request-state",(r:any)=>r?.ok&&setGame(r.snapshot));return()=>{socket.off("game8:start",st);socket.off("game8:state",st)}},[]);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(id)},[]);
 const remaining=game?.endsAt?Math.max(0,Math.ceil((game.endsAt-now)/1000)):0;
 const submit=()=>{const value=text.trim();if(!value)return;socket.emit("game8:answer",{text:value},(r:any)=>{if(!r?.ok){setError(errorMessage(r?.error));return}setText("");setError("")})};
 const validate=(id:string,accepted:boolean)=>socket.emit("game8:validate",{answerId:id,accepted},(r:any)=>{if(!r?.ok)setError(errorMessage(r?.error));else setError("")});
 const names=useMemo(()=>new Map(room.players.map(p=>[p.id,p.pseudo])),[room.players]);
 if(!game)return <main className="game8-page"><section className="game8-shell"><p>Chargement…</p></section></main>;
 if(game.phase==="playing") return <main className="game8-page"><section className="game8-shell">
   <header><div><p className="eyebrow">À la suite</p><h1>Trouve un maximum d'animés</h1><p className="game8-theme">{game.theme}</p></div><div className="game8-timer">{remaining}s</div></header>
   <div className="game8-play"><div className="game8-input"><input autoFocus value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();submit()}}} placeholder="Écris un animé puis Entrée…" maxLength={160}/><button onClick={submit}>Valider</button></div>
   <div className="game8-answers"><h3>Tes réponses · {game.ownAnswers.length}</h3>{game.ownAnswers.length===0?<p className="muted">Aucune réponse pour le moment.</p>:game.ownAnswers.map(a=><div className="game8-answer" key={a.id}>{a.text}</div>)}</div></div>
   {error&&<p className="game8-error">{error}</p>}
 </section></main>;
 if(game.phase==="judging"){
   const answer=Object.values(game.visibleAnswers).flat().find(a=>a.id===game.currentJudgeAnswerId);
   const owner=answer?names.get(answer.authorId):"Joueur";
   const already=answer?game.myVotedAnswerIds.includes(answer.id):false;
   return <main className="game8-page"><section className="game8-shell">
    <header><div><p className="eyebrow">À la suite · Validation</p><h1>Valide les réponses</h1><p className="game8-subtitle">Les autres joueurs décident si la réponse correspond bien au thème.</p></div><div className="game8-progress">{answer?`Réponse de ${owner}`:"Terminé"}</div></header>
    {answer?<div className="game8-judge"><div className="game8-big-answer">{answer.text}</div><p>Thème de {owner} : <strong>{game.theme}</strong></p>
      {answer.authorId===playerId?<p className="muted">Les autres joueurs valident cette réponse.</p>:already?<p className="muted">Ton vote est enregistré.</p>:<div className="game8-votes"><button onClick={()=>validate(answer.id,true)}>✓ Valider</button><button onClick={()=>validate(answer.id,false)}>✕ Refuser</button></div>}
      <p className="game8-vote-count">{answer.acceptedVotes} pour · {answer.rejectedVotes} contre</p></div>:<p>Préparation de la correction…</p>}
    <div className="game8-all-answers">{Object.entries(game.visibleAnswers).map(([id,answers])=><div key={id}><h3>{names.get(id)??"Joueur"} · {answers.filter(a=>a.accepted).length} validée(s)</h3>{answers.map(a=><span key={a.id} className={`mini-answer ${a.accepted===true?"yes":a.accepted===false?"no":""}`}>{a.text}</span>)}</div>)}</div>
    {error&&<p className="game8-error">{error}</p>}
   </section></main>;
 }
 return <main className="game8-page"><section className="game8-shell">
   <header><div><p className="eyebrow">À la suite · Résultats</p><h1>Résultats</h1></div></header>
   <div className="game8-results">{Object.entries(game.result??{}).sort(([,a],[,b])=>b-a).map(([id,score],i)=><div className="game8-result" key={id}><strong>#{i+1} {names.get(id)??"Joueur"}</strong><span>{score} point{score>1?"s":""}</span></div>)}</div>
   <button className="primary" onClick={onExit}>Retour au lobby</button>
 </section></main>;
}
function errorMessage(e:string){const m:Record<string,string>={NOT_PLAYING:"Le temps est écoulé.",EMPTY_ANSWER:"Réponse vide.",DUPLICATE_ANSWER:"Tu as déjà proposé cet animé.",NOT_JUDGING:"La validation est terminée.",ANSWER_NOT_FOUND:"Réponse introuvable.",CANNOT_JUDGE_OWN:"Tu ne peux pas valider ta propre réponse.",ALREADY_VOTED:"Tu as déjà voté pour cette réponse.",PLAYER_NOT_FOUND:"Joueur introuvable.",TIME_OVER:"Le temps est écoulé."};return m[e]??"Une erreur est survenue."}
