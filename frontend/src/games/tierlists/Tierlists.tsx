import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import "./Tierlists.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Props = { room: Room; playerId: string; onExit: () => void };

type Tier = "S" | "A" | "B" | "C" | "D";
type TierlistItem = { id: number; name: string; imageUrl: string | null; category: "anime" | "character" };
type TierlistBoard = { playerId: string; placements: Record<string, Tier | null>; validated: boolean };
type TierlistGuess = { id: string; authorId: string; targetPlayerId: string; text: string; accepted: boolean | null };
type TierlistSnapshot = { category: "anime" | "character"; items: TierlistItem[]; theme: string | null; boards: Record<string, TierlistBoard>; phase: "sorting" | "guessing" | "judging" | "finished"; currentPlayerId: string | null; currentPlayerIndex: number; reviewTotal: number; guesses: TierlistGuess[]; roundScores: Record<string, number>; cumulativeScores: Record<string, number>; roundNumber: number; endsAt: number; result: { correctGuesses: number } | null };
const TIERS: { id: Tier; label: string }[] = [
  { id: "S", label: "S" }, { id: "A", label: "A" }, { id: "B", label: "B" },
  { id: "C", label: "C" }, { id: "D", label: "D" },
];

function TierlistView({ snapshot, board, editable, onDrop }: { snapshot: TierlistSnapshot; board: TierlistBoard; editable: boolean; onDrop?: (itemId: number, tier: Tier | null) => void }) {
  const itemMap = useMemo(() => new Map(snapshot.items.map(item => [item.id, item])), [snapshot.items]);
  const placed = new Set(Object.entries(board.placements).filter(([, tier]) => tier !== null).map(([id]) => Number(id)));
  const drag = (e: React.DragEvent, id: number) => { if (!editable) return; e.dataTransfer.setData("text/plain", String(id)); e.dataTransfer.effectAllowed = "move"; };
  const drop = (e: React.DragEvent, tier: Tier | null) => { if (!editable) return; e.preventDefault(); const id = Number(e.dataTransfer.getData("text/plain")); if (Number.isFinite(id)) onDrop?.(id, tier); };
  const allow = (e: React.DragEvent) => { if (editable) e.preventDefault(); };
  const card = (id: number) => { const item = itemMap.get(id); if (!item) return null; return <div key={id} className="tier-item" draggable={editable} onDragStart={(e) => drag(e, id)} title={editable ? "Glisse-moi dans un rang" : item.name}><img src={item.imageUrl ?? ""} alt={item.name} title={item.name} /><span>{item.name}</span></div>; };
  return <div className="tierlist-board">
    <div className="tier-rows">
      {TIERS.map(t => <div key={t.id} className={`tier-row tier-${t.id}`} onDragOver={allow} onDrop={(e) => drop(e, t.id)}>
        <div className="tier-label">{t.label}</div>
        <div className="tier-items">{Object.entries(board.placements).filter(([, tier]) => tier === t.id).map(([id]) => card(Number(id)))}</div>
      </div>)}
    </div>
    <div className="tier-unranked" onDragOver={allow} onDrop={(e) => drop(e, null)}>
      <div className="unranked-title">À classer</div>
      <div className="tier-items">{snapshot.items.filter(item => !placed.has(item.id)).map(item => card(item.id))}</div>
    </div>
  </div>;
}

function GuessHistory({ guesses, players, targetId, onlyForTarget = false }: { guesses: TierlistGuess[]; players: Player[]; targetId?: string; onlyForTarget?: boolean }) {
  const list = onlyForTarget ? guesses.filter(g => g.targetPlayerId === targetId) : guesses;
  return <div className="guess-list">{list.length === 0 ? <p className="muted">Aucune proposition pour le moment.</p> : list.map(g => <div className="guess-card" key={g.id}>
    <strong>{players.find(p => p.id === g.authorId)?.pseudo ?? "Joueur"}</strong>
    <span>{g.text}</span>
    {g.accepted !== null && <em className={g.accepted ? "accepted" : "rejected"}>{g.accepted ? "✓ Correct" : "✕ Refusé"}</em>}
  </div>)}</div>;
}

export default function Tierlists({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<TierlistSnapshot | null>(null);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const isHost = room.hostId === playerId;

  useEffect(() => {
    const start = (snapshot: TierlistSnapshot) => { setGame(snapshot); setGuess(""); setError(""); };
    const state = (snapshot: TierlistSnapshot) => setGame(snapshot);
    socket.on("game4:start", start); socket.on("game4:state", state);
    socket.emit("game4:request-state", (r: any) => { if (r?.ok) setGame(r.snapshot); });
    const sync = window.setInterval(() => {
      socket.emit("game4:request-state", (r: any) => {
        if (r?.ok && r.snapshot) setGame(r.snapshot);
      });
    }, 500);

    return () => {
      window.clearInterval(sync);
      socket.off("game4:start", start);
      socket.off("game4:state", state);
    };
  }, []);

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 100); return () => clearInterval(id); }, []);
  const remaining = game?.phase === "sorting" ? Math.max(0, Math.ceil((game.endsAt - now) / 1000)) : 0;
  const me = room.players.find(p => p.id === playerId);
  const current = room.players.find(p => p.id === game?.currentPlayerId);
  const myBoard = game ? game.boards[playerId] : null;

  const action = (event: string, payload?: any) => {
    setError("");
    socket.emit(event, payload, (r: any) => { if (!r?.ok) setError(errorMessage(r?.error)); });
  };
  const place = (itemId: number, tier: Tier | null) => action("game4:place", { itemId, tier });
  const validate = () => action("game4:validate");
  const submitGuess = () => { if (!guess.trim()) return setError("Écris une proposition de thème."); action("game4:guess", { text: guess }); setGuess(""); };
  const judge = (guessId: string, accepted: boolean) => action("game4:judge", { guessId, accepted });

  if (!game) return <main className="game4-page"><section className="game4-shell game4-loading"><p className="eyebrow">Les Tierlists</p><h1>Préparation de la partie…</h1><p>Synchronisation avec le serveur…</p></section></main>;

  if (game.phase === "finished") {
    const ranking = room.players.map(p => ({ ...p, score: game.cumulativeScores[p.id] ?? 0, round: game.roundScores[p.id] ?? 0 })).sort((a,b) => b.score-a.score || b.round-a.round);
    return <main className="game4-page"><section className="game4-shell game4-results">
      <header className="game4-header"><div><p className="eyebrow">Les Tierlists · Partie terminée</p><h1>Classement</h1></div><div className="game4-round">#{game.roundNumber}</div></header>
      <div className="game4-ranking">{ranking.map((p,i)=><div className="game4-rank" key={p.id}><span>#{i+1}</span><i>{p.pseudo[0]?.toUpperCase()}</i><strong>{p.pseudo}</strong>{p.id===playerId&&<small>VOUS</small>}<b>{p.score} pt{p.score>1?"s":""} <em>(+{p.round})</em></b></div>)}</div>
      <button className="primary purple" onClick={onExit}>Retour à la room <span>←</span></button>
    </section></main>;
  }

  if (game.phase === "sorting") return <main className="game4-page"><section className="game4-shell">
    <header className="game4-header"><div><p className="eyebrow">Les Tierlists · Classement</p><h1>Ta tierlist</h1><p className="game4-subtitle">{game.theme}</p></div><div className={`game4-timer ${remaining <= 30 ? "danger" : ""}`}>{remaining}s</div></header>
    <div className="game4-theme"><span>Ton thème</span><strong>{game.theme}</strong></div>
    <TierlistView snapshot={game} board={myBoard!} editable={true} onDrop={place} />
    <div className="game4-actions"><span>{myBoard?.validated ? "✓ Tierlist validée" : "Déplace les éléments puis valide quand tu es prêt."}</span><button className="primary purple" disabled={myBoard?.validated} onClick={validate}>{myBoard?.validated ? "En attente des autres…" : "Valider la tierlist →"}</button></div>
    {error && <div className="game4-error">{error}</div>}
  </section></main>;

  if (game.phase === "guessing") {
    const target = current!;
    const board = game.boards[target.id];
    const own = target.id === playerId;
    const already = game.guesses.some(g => g.targetPlayerId === target.id && g.authorId === playerId);
    return <main className="game4-page"><section className="game4-shell">
      <header className="game4-header"><div><p className="eyebrow">Les Tierlists · Devine le thème · {game.currentPlayerIndex+1}/{game.reviewTotal}</p><h1>Tierlist de <span>{target.pseudo}</span></h1><p className="game4-subtitle">{own ? "C'est ta tierlist : observe les réactions des autres joueurs." : "Quel thème pourrait expliquer cette tierlist ?"}</p></div><div className="game4-round">{game.currentPlayerIndex+1}/{game.reviewTotal}</div></header>
      <div className="game4-review-layout"><div><TierlistView snapshot={game} board={board} editable={false} /></div><aside className="game4-side">
        {own ? <div className="game4-info"><span>Ton thème</span><strong>{game.theme}</strong><p>Les autres joueurs doivent le retrouver.</p></div> : <div className="game4-guess-form"><label>Ta proposition</label><input value={guess} onChange={e=>setGuess(e.target.value)} maxLength={160} placeholder="Quel est le thème ?" disabled={already}/><button className="primary purple" disabled={already} onClick={submitGuess}>{already ? "Proposition envoyée" : "Proposer le thème →"}</button></div>}
        <div><h3>Propositions</h3><GuessHistory guesses={game.guesses} players={room.players} targetId={target.id} onlyForTarget /></div>
      </aside></div>
      {error && <div className="game4-error">{error}</div>}
    </section></main>;
  }

  const target = current!; const board = game.boards[target.id]; const own = target.id === playerId; const targetGuesses = game.guesses.filter(g=>g.targetPlayerId===target.id);
  return <main className="game4-page"><section className="game4-shell">
    <header className="game4-header"><div><p className="eyebrow">Les Tierlists · Correction · {game.currentPlayerIndex+1}/{game.reviewTotal}</p><h1>Tierlist de <span>{target.pseudo}</span></h1><p className="game4-subtitle">{own ? "Valide ou refuse les propositions des autres joueurs." : "Le créateur de cette tierlist juge les propositions."}</p></div><div className="game4-round">{game.currentPlayerIndex+1}/{game.reviewTotal}</div></header>
    <div className="game4-theme"><span>Vrai thème</span><strong>{game.theme}</strong></div>
    <div className="game4-review-layout"><div><TierlistView snapshot={game} board={board} editable={false} /></div><aside className="game4-side"><h3>Propositions reçues</h3>{targetGuesses.length===0 ? <p className="muted">Personne n'a proposé de thème.</p> : targetGuesses.map(g=><div className={`judge-guess ${g.accepted===true?"accepted":g.accepted===false?"rejected":""}`} key={g.id}><strong>{room.players.find(p=>p.id===g.authorId)?.pseudo ?? "Joueur"}</strong><span>{g.text}</span>{own && g.accepted===null ? <div><button onClick={()=>judge(g.id,true)}>✓ Valider</button><button onClick={()=>judge(g.id,false)}>✕ Refuser</button></div> : g.accepted!==null ? <em>{g.accepted?"✓ Correct":"✕ Refusé"}</em> : <em>En attente du verdict</em>}</div>)}</aside></div>
    {error && <div className="game4-error">{error}</div>}
  </section></main>;
}

function errorMessage(error: string) { const map: Record<string,string> = { NOT_SORTING:"La phase de classement est terminée.", TIME_OVER:"Le temps est écoulé.", ITEM_NOT_FOUND:"Cet élément n'existe pas.", NOT_ENOUGH_ITEMS:"Pas assez d'éléments disponibles.", NOT_GUESSING:"La phase de devinettes est terminée.", CANNOT_GUESS_OWN:"Tu ne peux pas deviner ton propre thème.", EMPTY_GUESS:"Proposition vide.", ALREADY_GUESSED:"Tu as déjà proposé un thème pour cette tierlist.", NOT_JUDGING:"La phase de correction est terminée.", NOT_YOUR_TIERLIST:"Seul le créateur de cette tierlist peut la corriger.", GUESS_NOT_FOUND:"Proposition introuvable.", ALREADY_JUDGED:"Cette proposition a déjà été jugée." }; return map[error] ?? "Une erreur est survenue."; }
