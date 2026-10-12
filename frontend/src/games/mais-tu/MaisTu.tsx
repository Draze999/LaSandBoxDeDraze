import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import "./MaisTu.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Answer = { id: string; text: string; playerId?: string };
type Snapshot = {
  phase: "writing" | "voting" | "results" | "finished";
  character: { id: number; name: string; image_url: string | null; image_small_url: string | null };
  endsAt: number | null; roundNumber: number; totalRounds: number;
  submittedPlayerIds: string[]; ownSubmission: string | null; ownAnswerId: string | null; answers: Answer[];
  ownVoteId: string | null; voteCount: number; roundVotes: Record<string, number> | null;
  bonusIds: string[]; cumulativeScores: Record<string, number>; playerId: string;
};
type Props = { room: Room; playerId: string; onExit: () => void };

export default function MaisTu({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const state = (snapshot: Snapshot) => { setGame(snapshot); setBusy(false); };
    socket.on("game11:start", state);
    socket.on("game11:state", state);
    socket.emit("game11:request-state", (r: any) => { if (r?.ok) setGame(r.snapshot); });
    return () => { socket.off("game11:start", state); socket.off("game11:state", state); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => { setText(""); setError(""); setBusy(false); }, [game?.roundNumber, game?.phase]);

  const names = useMemo(() => new Map(room.players.map((p) => [p.id, p.pseudo])), [room.players]);
  const remaining = game?.endsAt ? Math.max(0, Math.ceil((game.endsAt - now) / 1000)) : 0;
  const sortedScores = Object.entries(game?.cumulativeScores ?? {}).sort((a, b) => b[1] - a[1]);

  const submit = () => {
    if (!text.trim() || busy) return;
    setBusy(true); setError("");
    socket.emit("game11:submit", { text: text.trim() }, (r: any) => {
      setBusy(false);
      if (!r?.ok) {
        const messages: Record<string, string> = { NOT_WRITING: "La phase d'écriture est terminée.", ALREADY_SUBMITTED: "Tu as déjà envoyé ta contrainte.", TIME_OVER: "Le temps est écoulé.", EMPTY_ANSWER: "Écris une contrainte avant d'envoyer." };
        setError(messages[r?.error] ?? "Impossible d'envoyer ta contrainte.");
      }
    });
  };

  const vote = (answerId: string) => {
    if (busy || game?.ownVoteId) return;
    setBusy(true); setError("");
    socket.emit("game11:vote", { answerId }, (r: any) => {
      setBusy(false);
      if (!r?.ok) {
        const messages: Record<string, string> = { OWN_ANSWER: "Tu ne peux pas voter pour ta propre contrainte.", ALREADY_VOTED: "Tu as déjà voté.", NOT_VOTING: "La phase de vote est terminée." };
        setError(messages[r?.error] ?? "Impossible d'enregistrer ton vote.");
      }
    });
  };

  if (!game) return <main className="maistu-page"><section className="maistu-shell"><p className="eyebrow">Sabotage</p><h1>Chargement du prochain personnage…</h1></section></main>;

  const hasSubmitted = Boolean(game.ownSubmission);
  const finalPhase = game.phase === "finished";
  const reveal = game.phase === "results" || finalPhase;
  const displayedAnswers = [...game.answers].sort((a, b) => a.text.localeCompare(b.text, "fr"));

  return <main className="maistu-page"><section className="maistu-shell">
    <header className="maistu-header">
      <div><p className="eyebrow">Sabotage · Manche {game.roundNumber}/{game.totalRounds}</p><h1>Vous êtes <span>{game.character.name}</span>, mais…</h1><p className="maistu-subtitle">Sabotez ce personnage. La contrainte la plus populaire rapporte un bonus !</p></div>
      {!reveal && <div className={`maistu-timer ${remaining <= 10 ? "danger" : ""}`}><strong>{remaining}</strong><small>secondes</small></div>}
    </header>

    <div className="maistu-character">
      {game.character.image_url || game.character.image_small_url ? <img src={game.character.image_url || game.character.image_small_url || ""} alt={game.character.name} /> : <div className="maistu-no-image">?</div>}
      <div><span className="maistu-kicker">PERSONNAGE À SABOTER</span><h2>{game.character.name}</h2><p>Son pouvoir, son quotidien, son corps, sa destinée… rien n'est à l'abri.</p></div>
    </div>

    {game.phase === "writing" && <section className="maistu-panel">
      <div className="maistu-section-title"><div><span className="maistu-step">01</span><h2>Ajoute ta contrainte</h2></div><span>{game.submittedPlayerIds.length}/{room.players.length} réponses</span></div>
      {hasSubmitted ? <div className="maistu-submitted"><span>✓</span><div><strong>Ta contrainte est envoyée</strong><p>{game.ownSubmission}</p><small>Les autres joueurs sont encore en train d'écrire…</small></div></div> : <div className="maistu-compose"><textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={180} rows={3} placeholder="…ton corps est fait en glace, mais tu contrôles le feu." onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit(); }} /><div className="maistu-compose-footer"><span>{text.length}/180 · Ctrl + Entrée pour envoyer</span><button className="primary purple" onClick={submit} disabled={!text.trim() || busy}>{busy ? "Envoi…" : "Envoyer ma contrainte →"}</button></div></div>}
      <div className="maistu-player-status">{room.players.map((p) => <span key={p.id} className={game.submittedPlayerIds.includes(p.id) ? "done" : ""}>{game.submittedPlayerIds.includes(p.id) ? "✓ " : "◷ "}{p.pseudo}</span>)}</div>
    </section>}

    {game.phase === "voting" && <section className="maistu-panel">
      <div className="maistu-section-title"><div><span className="maistu-step">02</span><h2>Quelle contrainte est la pire ?</h2></div><span>{game.voteCount}/{room.players.length} votes</span></div>
      <p className="maistu-hint">Vote pour la proposition la plus drôle ou la plus catastrophique. Les auteurs restent anonymes.</p>
      <div className="maistu-answers">{displayedAnswers.map((answer, index) => {
        const own = answer.id === game.ownAnswerId;
        const selected = game.ownVoteId === answer.id;
        return <button key={answer.id} className={`maistu-answer ${selected ? "selected" : ""} ${own ? "own" : ""}`} disabled={Boolean(game.ownVoteId) || own || busy} onClick={() => vote(answer.id)}><span className="maistu-answer-number">{String(index + 1).padStart(2, "0")}</span><span className="maistu-answer-text">{answer.text}{own && <small>Ta proposition</small>}</span><span className="maistu-vote-mark">{selected ? "✓" : own ? "À toi" : "Voter ↗"}</span></button>;
      })}</div>
      {game.ownVoteId && <p className="maistu-voted">✓ Ton vote est enregistré. En attente des autres joueurs…</p>}
    </section>}

    {reveal && <section className="maistu-panel maistu-results">
      <div className="maistu-section-title"><div><span className="maistu-step">{finalPhase ? "★" : "03"}</span><h2>{finalPhase ? "Classement final" : "Résultats de la manche"}</h2></div></div>
      {game.answers.length === 0 ? <p>Aucune contrainte n'a été proposée cette manche.</p> : <div className="maistu-result-list">{[...game.answers].sort((a, b) => (game.roundVotes?.[b.playerId ?? ""] ?? 0) - (game.roundVotes?.[a.playerId ?? ""] ?? 0)).map((answer) => {
        const author = answer.playerId ?? ""; const count = game.roundVotes?.[author] ?? 0; const bonus = game.bonusIds.includes(author);
        return <article key={answer.id} className={`maistu-result-answer ${bonus ? "winner" : ""}`}><div className="maistu-result-top"><strong>{names.get(author) ?? "Joueur"}</strong><span>{count} vote{count !== 1 ? "s" : ""}{bonus ? " · +1 bonus 🏆" : ""}</span></div><p>{answer.text}</p><small>+{count + (bonus ? 1 : 0)} point{count + (bonus ? 1 : 0) !== 1 ? "s" : ""} cette manche</small></article>;
      })}</div>}
      <div className="maistu-scoreboard"><h3>{finalPhase ? "Vainqueur de la partie" : "Classement provisoire"}</h3>{sortedScores.map(([id, score], index) => <div className={index === 0 ? "leader" : ""} key={id}><span><b>{index + 1}</b>{names.get(id) ?? "Joueur"}</span><strong>{score} pt{score !== 1 ? "s" : ""}</strong></div>)}</div>
      {finalPhase ? <button className="primary purple maistu-exit" onClick={onExit}>Retour à la room <span>←</span></button> : <p className="maistu-next">Prochain personnage dans un instant…</p>}
    </section>}
    {error && <p className="maistu-error">{error}</p>}
  </section></main>;
}
