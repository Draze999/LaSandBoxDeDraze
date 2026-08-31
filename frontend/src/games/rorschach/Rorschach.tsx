import { useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from "react";
import { socket } from "../../socket";
import "./Rorschach.css";

type Player={id:string;pseudo:string;isHost:boolean};
type Room={hostId:string;players:Player[]};
type Point={x:number;y:number};
type Stroke={id:string;playerId:string;points:Point[]};
type Guess={id:string;authorId:string;targetPlayerId:string;text:string;accepted:boolean|null};
type Snapshot={phase:"drawing"|"guessing"|"judging"|"finished";playerOrder:string[];base:Point[];strokes:Stroke[];colors:Record<string,string>;validated:Record<string,boolean>;endsAt:number;currentPlayerId:string|null;currentPlayerIndex:number;reviewTotal:number;guesses:Guess[];roundScores:Record<string,number>;cumulativeScores:Record<string,number>;roundNumber:number};

function drawCanvas(canvas:HTMLCanvasElement,s:Snapshot,targetId:string,preview:Stroke|null=null){
  const rect=canvas.getBoundingClientRect();
  const d=Math.min(devicePixelRatio||1,2);
  const width=Math.max(1,Math.round(rect.width*d));
  const height=Math.max(1,Math.round(rect.height*d));
  if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
  const ctx=canvas.getContext("2d")!;
  ctx.setTransform(width,0,0,height,0,0);
  ctx.clearRect(0,0,1,1);
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,1,1);
  const line=(points:Point[],color:string,size:number)=>{
    if(points.length<2)return;
    ctx.strokeStyle=color;ctx.lineWidth=size;ctx.lineCap="round";ctx.lineJoin="round";ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(const point of points.slice(1))ctx.lineTo(point.x,point.y);
    ctx.stroke();
  };
  for(const stroke of s.strokes.filter(item=>item.playerId===targetId)) line(stroke.points,s.colors[stroke.playerId]??"#777",0.006);
  if(preview && preview.playerId===targetId) line(preview.points,s.colors[targetId]??"#777",0.006);
  // Toujours au premier plan : le trait de base noir est intouchable.
  line(s.base,"#111",0.008);
}

function DrawingCanvas({snapshot,targetId,preview=null,className=""}:{snapshot:Snapshot;targetId:string;preview?:Stroke|null;className?:string}){
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{const render=()=>{if(ref.current)drawCanvas(ref.current,snapshot,targetId,preview)};render();window.addEventListener("resize",render);return()=>window.removeEventListener("resize",render)},[snapshot,targetId,preview]);
  return <canvas ref={ref} className={className}/>;
}

export default function Rorschach({room,playerId,onExit}:{room:Room;playerId:string;onExit:()=>void}){
  const [game,setGame]=useState<Snapshot|null>(null),[guess,setGuess]=useState(""),[error,setError]=useState(""),[now,setNow]=useState(Date.now()),[tool,setTool]=useState<"pencil"|"eraser">("pencil"),[preview,setPreview]=useState<Point[]>([]);
  const canvasRef=useRef<HTMLCanvasElement>(null);const drawing=useRef(false);const currentStroke=useRef<Point[]>([]);
  const player=(id:string)=>room.players.find(p=>p.id===id)?.pseudo??"Joueur";
  useEffect(()=>{const start=(s:Snapshot)=>{setGame(s);setGuess("");setError("");setPreview([])};const state=(s:Snapshot)=>setGame(s);socket.on("game5:start",start);socket.on("game5:state",state);socket.emit("game5:request-state",(r:any)=>r?.ok&&setGame(r.snapshot));const sync=window.setInterval(()=>socket.emit("game5:request-state",(r:any)=>{if(r?.ok&&r.snapshot)setGame(r.snapshot)}),500);return()=>{window.clearInterval(sync);socket.off("game5:start",start);socket.off("game5:state",state)}},[]);
  useEffect(()=>{const id=window.setInterval(()=>setNow(Date.now()),100);return()=>clearInterval(id)},[]);
  const remaining=game?.phase==="drawing"?Math.max(0,Math.ceil((game.endsAt-now)/1000)):0;
  const emit=(event:string,payload?:any)=>socket.emit(event,payload,(r:any)=>{if(!r?.ok)setError(r?.error??"Une erreur est survenue.");else setError("")});
  const point=(e:PointerEvent<HTMLCanvasElement>)=>{const rect=e.currentTarget.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))}};
  const down=(e:PointerEvent<HTMLCanvasElement>)=>{if(game?.phase!=="drawing"||game.validated[playerId])return;e.currentTarget.setPointerCapture(e.pointerId);drawing.current=true;const p=point(e);currentStroke.current=[p];setPreview([p])};
  const move=(e:PointerEvent<HTMLCanvasElement>)=>{if(!drawing.current)return;const p=point(e);currentStroke.current.push(p);setPreview([...currentStroke.current]);};
  const up=()=>{if(!drawing.current)return;drawing.current=false;const points=currentStroke.current;if(points.length>=2)emit(tool==="pencil"?"game5:stroke":"game5:erase",{points});currentStroke.current=[];setPreview([])};
  const undo=()=>emit("game5:undo");
  useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.ctrlKey&&e.key.toLowerCase()==="z"&&game?.phase==="drawing"){e.preventDefault();undo()}};window.addEventListener("keydown",key);return()=>window.removeEventListener("keydown",key)},[game?.phase]);
  const target=game?.currentPlayerId??"";const own=target===playerId;const targetGuesses=game?.guesses.filter(g=>g.targetPlayerId===target)||[];
  const ranking=useMemo(()=>room.players.map(p=>({...p,total:game?.cumulativeScores[p.id]??0,gain:game?.roundScores[p.id]??0})).sort((a,b)=>b.total-a.total||b.gain-a.gain),[room.players,game]);
  if(!game)return <main className="game5-page"><section className="game5-shell game5-loading"><p className="eyebrow">Le jeu de Rorschach</p><h1>Préparation…</h1></section></main>;
  if(game.phase==="finished")return <main className="game5-page"><section className="game5-shell"><p className="eyebrow">Le jeu de Rorschach · Manche {game.roundNumber} terminée</p><h1>Classement</h1><div className="game5-ranking">{ranking.map((p,i)=><div className="game5-rank" key={p.id}><span>#{i+1}</span><i>{p.pseudo[0]?.toUpperCase()}</i><strong>{p.pseudo}{p.id===playerId&&<small> VOUS</small>}</strong><b>{p.total} <em>(+{p.gain})</em></b></div>)}</div><button className="primary purple" onClick={onExit}>Retour à la room <span>←</span></button></section></main>;
  if(game.phase==="drawing")return <main className="game5-page"><section className="game5-shell"><header className="game5-header"><div><p className="eyebrow">Le jeu de Rorschach · Manche {game.roundNumber}</p><h1>Qui sera le plus créatif ? ✏️</h1><p className="game5-subtitle">Pars du trait noir et dessine quelque chose en rapport avec les animés.</p></div><div className={`game5-timer ${remaining<=30?"danger":""}`}>{remaining}s</div></header><div className="game5-layout"><div className="game5-canvas-wrap"><canvas ref={canvasRef} className="game5-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}/>{preview.length>1&&<div className="game5-drawing-indicator" style={{borderColor:game.colors[playerId]}}>Trait en cours</div>}</div><aside className="game5-tools"><button className={`game5-tool ${tool==="pencil"?"selected":""}`} onClick={()=>setTool("pencil")}>✏️ Crayon</button><button className={`game5-tool ${tool==="eraser"?"selected":""}`} onClick={()=>setTool("eraser")}>⌫ Gomme</button><button className="game5-tool" onClick={undo}>↶ Annuler / Ctrl+Z</button><div className="game5-color"><span className="game5-swatch" style={{background:game.colors[playerId]}}/> Ta couleur</div></aside></div><div className="game5-actions"><span className="game5-status">{game.validated[playerId]?"✓ Dessin validé — en attente des autres…":"Le trait noir est intouchable et reste au premier plan."}</span><button className="primary purple" disabled={game.validated[playerId]} onClick={()=>emit("game5:validate")}>{game.validated[playerId]?"Validé":"Valider le dessin →"}</button></div>{error&&<div className="game5-error">{error}</div>}<DrawingPreviewOverlay snapshot={game} playerId={playerId} preview={preview} canvasRef={canvasRef}/></section></main>;
  if(game.phase==="guessing")return <main className="game5-page"><section className="game5-shell"><header className="game5-header"><div><p className="eyebrow">Le jeu de Rorschach · Devine · {game.currentPlayerIndex+1}/{game.reviewTotal}</p><h1>Dessin de <span>{player(target)}</span></h1><p className="game5-subtitle">Que représente ce dessin ?</p></div></header><div className="game5-review-layout"><div><DrawingCanvas snapshot={game} targetId={target}/><div className="game5-status">{own?"C'est ton dessin. Observe les propositions des autres joueurs.":"Propose ce que tu penses reconnaître."}</div></div><aside className="game5-side">{own?<><h3>Propositions</h3>{targetGuesses.map(g=><div className="game5-guess" key={g.id}><span>{g.text}</span><small>En attente de la correction</small></div>)}</>:<><h3>Ta proposition</h3>{targetGuesses.some(g=>g.authorId===playerId)?<p className="game5-status">Proposition envoyée.</p>:<div className="game5-guess-form"><input value={guess} onChange={e=>setGuess(e.target.value)} placeholder="Que représente le dessin ?" maxLength={160}/><button className="primary purple" onClick={()=>{if(!guess.trim())return setError("Écris une proposition.");emit("game5:guess",{text:guess});setGuess("")}}>Envoyer →</button></div>}<h3>Propositions reçues</h3>{targetGuesses.map(g=><div className="game5-guess" key={g.id}><span>{g.text}</span></div>)}</>}</aside></div>{error&&<div className="game5-error">{error}</div>}</section></main>;
  return <main className="game5-page"><section className="game5-shell"><header className="game5-header"><div><p className="eyebrow">Le jeu de Rorschach · Correction · {game.currentPlayerIndex+1}/{game.reviewTotal}</p><h1>Dessin de <span>{player(target)}</span></h1><p className="game5-subtitle">Le dessinateur juge les propositions sans voir leurs auteurs.</p></div></header><div className="game5-review-layout"><div><DrawingCanvas snapshot={game} targetId={target}/></div><aside className="game5-side"><h3>Propositions anonymes</h3>{targetGuesses.map(g=><div className={`game5-guess ${g.accepted===true?"accepted":g.accepted===false?"rejected":""}`} key={g.id}><span>{g.text}</span>{own&&g.accepted===null?<div className="game5-guess-actions"><button className="primary green" onClick={()=>emit("game5:judge",{guessId:g.id,accepted:true})}>✓ Valider</button><button className="primary red" onClick={()=>emit("game5:judge",{guessId:g.id,accepted:false})}>✕ Refuser</button></div>:<small>{g.accepted===true?"✓ Correct":g.accepted===false?"✕ Refusé":"En attente"}</small>}</div>)}</aside></div>{error&&<div className="game5-error">{error}</div>}</section></main>;
}

function DrawingPreviewOverlay({snapshot,playerId,preview,canvasRef}:{snapshot:Snapshot;playerId:string;preview:Point[];canvasRef:RefObject<HTMLCanvasElement | null>}){
 useEffect(()=>{const render=()=>{const canvas=canvasRef.current;if(!canvas)return;drawCanvas(canvas,snapshot,playerId,preview.length>1?{id:"local",playerId,points:preview}:null)};render()},[snapshot,playerId,preview,canvasRef]);
 return null;
}
