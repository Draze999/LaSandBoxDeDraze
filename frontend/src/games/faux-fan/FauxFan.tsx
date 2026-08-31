import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import "./FauxFan.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[]; settings?: { gameSettings?: { fauxFanCategory?: "anime" | "character" } } };
type Question = { id: string; authorId: string; targetId: string; text: string; answer: string | null; createdAt: number };
type Snapshot = {
  category: "anime" | "character";
  phase: "questioning" | "voting" | "guessing" | "finished";
  isIntruder: boolean;
  secret: { name: string; imageUrl?: string | null; animeName?: string | null } | null;
  intruderId: string | null;
  questions: Question[];
  questionCounts: Record<string, number>;
  turnPlayerId: string | null;
  waitingForAnswerId: string | null;
  votes: { voterId: string; targetId: string }[];
  myVote: string | null;
  guess: string | null;
  guessVotes: { voterId: string; accepted: boolean }[];
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  roundNumber: number;
  result: { intruderWon: boolean; intruderVotedMajority: boolean; correctGuess: boolean | null } | null;
};

type Props = { room: Room; playerId: string; onExit: () => void };

const errorText: Record<string, string> = {
  NOT_ENOUGH_PLAYERS: "Il faut au moins 3 joueurs.",
  NOT_YOUR_TURN: "Ce n'est pas ton tour.",
  CANNOT_ASK_SELF: "Tu ne peux pas te poser une question à toi-même.",
  EMPTY_QUESTION: "Écris une question.",
  NOT_YOUR_ANSWER: "Cette question ne t'est pas destinée.",
  EMPTY_ANSWER: "Écris une réponse.",
  ALREADY_VOTED: "Tu as déjà voté.",
  CANNOT_VOTE_SELF: "Tu ne peux pas voter pour toi-même.",
  NOT_INTRUDER: "Seul l'intrus peut proposer une réponse.",
  ALREADY_GUESSED: "Une réponse a déjà été proposée.",
  NO_GUESS: "L'intrus n'a pas encore proposé de réponse.",
  INTRUDER_CANNOT_VOTE: "L'intrus ne participe pas au vote sur sa proposition.",
};

export default function FauxFan({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [question, setQuestion] = useState("");
  const [targetId, setTargetId] = useState("");
  const [answer, setAnswer] = useState("");
  const [guess, setGuess] = useState("");
  const [error, setError] = useState("");

  const player = (id: string) => room.players.find((p) => p.id === id)?.pseudo ?? "Joueur";
  const others = room.players.filter((p) => p.id !== playerId);
  const currentQuestion = game?.waitingForAnswerId === playerId
    ? [...(game?.questions ?? [])].reverse().find((q) => q.targetId === playerId && q.answer === null)
    : null;
  const myCount = game?.questionCounts[playerId] ?? 0;
  const isMyTurn = game?.phase === "questioning" && game.turnPlayerId === playerId && !game.waitingForAnswerId;

  useEffect(() => {
    const onStart = (snapshot: Snapshot) => { setGame(snapshot); setError(""); setQuestion(""); setAnswer(""); setGuess(""); };
    const onState = (snapshot: Snapshot) => setGame(snapshot);
    socket.on("game2:start", onStart);
    socket.on("game2:state", onState);
    socket.emit("game2:request-state", (result: any) => {
      if (result?.ok && result.snapshot) setGame(result.snapshot);
    });
    return () => {
      socket.off("game2:start", onStart);
      socket.off("game2:state", onState);
    };
  }, []);

  const submitQuestion = () => {
    setError("");
    if (!targetId) return setError("Choisis un joueur.");
    socket.emit("game2:ask", { targetId, text: question }, (r: any) => {
      if (!r?.ok) return setError(errorText[r?.error] ?? "Impossible d'envoyer la question.");
      setQuestion("");
      setTargetId("");
    });
  };

  const submitAnswer = () => {
    if (!currentQuestion) return;
    setError("");
    socket.emit("game2:answer", { questionId: currentQuestion.id, text: answer }, (r: any) => {
      if (!r?.ok) return setError(errorText[r?.error] ?? "Impossible d'envoyer la réponse.");
      setAnswer("");
    });
  };

  const vote = (id: string) => {
    setError("");
    socket.emit("game2:vote", { targetId: id }, (r: any) => {
      if (!r?.ok) setError(errorText[r?.error] ?? "Impossible d'enregistrer ton vote.");
    });
  };

  const submitGuess = () => {
    setError("");
    socket.emit("game2:guess", { guess }, (r: any) => {
      if (!r?.ok) return setError(errorText[r?.error] ?? "Impossible de proposer cette réponse.");
      setGuess("");
    });
  };

  const voteGuess = (accepted: boolean) => {
    setError("");
    socket.emit("game2:guess-vote", { accepted }, (r: any) => {
      if (!r?.ok) setError(errorText[r?.error] ?? "Impossible d'enregistrer ton vote.");
    });
  };

  const ranking = useMemo(() => room.players.map((p) => ({
    ...p,
    total: game?.cumulativeScores[p.id] ?? 0,
    gain: game?.roundScores[p.id] ?? 0,
  })).sort((a, b) => b.total - a.total || b.gain - a.gain), [room.players, game]);

  const historyPanel = (
    <div className="game2-panel game2-history-panel">
      <h2>Historique</h2>
      <div className="game2-history">
        {(game?.questions?.length ?? 0) === 0 ? (
          <p className="game2-empty">Aucune question pour le moment.</p>
        ) : (
          (game?.questions ?? []).map((q) => (
            <article key={q.id}>
              <div>
                <strong>{player(q.authorId)}</strong>
                <span>→</span>
                <strong>{player(q.targetId)}</strong>
              </div>
              <p>{q.text}</p>
              {q.answer && <small>↳ {q.answer}</small>}
            </article>
          ))
        )}
      </div>
    </div>
  );

  if (!game) return <main className="game2-page"><section className="game2-shell game2-loading"><p className="eyebrow">Le Faux Fan</p><h1>Préparation de la partie…</h1></section></main>;

  if (game.phase === "finished") {
    return <main className="game2-page">
      <section className="game2-shell">
        <header className="game2-header"><div><p className="eyebrow">Le Faux Fan · Manche {game.roundNumber} terminée</p><h1>Classement</h1><p className="game2-subtitle">Le secret était <strong>{game.secret?.name ?? "inconnu"}</strong>{game.category === "character" && game.secret?.animeName ? ` · ${game.secret.animeName}` : ""}.</p></div><div className="game2-secret-badge">🎭</div></header>
        {game.secret && <div className="game2-result-secret"><img src={game.secret.imageUrl ?? ""} alt=""/><div><small>Secret</small><strong>{game.secret.name}</strong>{game.category === "character" && game.secret.animeName && <span>{game.secret.animeName}</span>}</div></div>}
        <div className="game2-result-banner">
          <strong>{game.result?.intruderWon ? `L'intrus, ${player(game.intruderId ?? "")}, gagne la manche.` : `L'intrus, ${player(game.intruderId ?? "")}, a été démasqué.`}</strong>
          {game.result?.correctGuess !== null && <span>{game.result?.correctGuess ? "Son identification du secret est correcte." : "Son identification du secret est incorrecte."}</span>}
        </div>
        <div className="game2-ranking">{ranking.map((p, i) => <div className={`game2-rank ${p.id === game.intruderId ? "intruder" : "innocent"}`} key={p.id}><span>#{i + 1}</span><i>{p.pseudo[0]?.toUpperCase()}</i><strong>{p.pseudo}{p.id === playerId && <small> VOUS</small>}</strong><b>{p.total} <em>(+{p.gain})</em></b></div>)}</div>
        <button className="primary purple" onClick={onExit}>Retour à la room <span>←</span></button>
      </section>
    </main>;
  }

  return <main className="game2-page">
    <section className="game2-shell">
      <header className="game2-header">
        <div><p className="eyebrow">Le Faux Fan · Manche {game.roundNumber}</p><h1>{game.phase === "questioning" ? "Débusquez le faux fan." : game.phase === "voting" ? "Qui est l'intrus ?" : "Dernière chance pour l'intrus."}</h1><p className="game2-subtitle">{game.category === "anime" ? "Tout le monde sauf l'intrus connaît un animé." : "Tout le monde sauf l'intrus connaît un personnage."}</p></div>
        {game.isIntruder ? (
          <div className="game2-intruder-box">
            <span className="game2-intruder-icon">🎭</span>
            <small>RÔLE SECRET</small>
            <strong>FAUX FAN</strong>
            <span>Fonds-toi dans la masse et ne te fais pas repérer.</span>
          </div>
        ) : game.secret ? (
          <div className="game2-secret">
            {game.secret.imageUrl && <img src={game.secret.imageUrl} alt="" />}
            <div><small>Secret</small>
            <strong>{game.secret.name}</strong>
            {game.category === "character" && game.secret.animeName && (
              <span>{game.secret.animeName}</span>
            )}
            </div>
          </div>
        ) : null}
      </header>

      {game.phase === "questioning" && <>
        <div className="game2-turn"><span>Tour actuel</span><strong>{player(game.turnPlayerId ?? "")}</strong><small>{game.questionCounts[game.turnPlayerId ?? ""] ?? 0}/2 question{(game.questionCounts[game.turnPlayerId ?? ""] ?? 0) > 1 ? "s" : ""}</small></div>
        <div className="game2-layout">
          <div className="game2-panel">
            <h2>Questions</h2>
            {isMyTurn ? <div className="game2-form"><select value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">Choisir un joueur…</option>{others.map((p) => <option key={p.id} value={p.id}>{p.pseudo}</option>)}</select><textarea value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Pose ta question…" maxLength={200} /><button className="primary blue" onClick={submitQuestion}>Envoyer la question <span>→</span></button></div> : <div className="game2-wait">{game.waitingForAnswerId === "__TRANSITION_TO_VOTE__" ? "Passage au vote…" : game.waitingForAnswerId ? `En attente de la réponse de ${player(game.waitingForAnswerId)}…` : `En attente du tour de ${player(game.turnPlayerId ?? "")}…`}</div>}
            {currentQuestion && <div className="game2-answer-box"><b>{player(currentQuestion.authorId)} te demande :</b><p>{currentQuestion.text}</p><textarea value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Ta réponse…" maxLength={240} /><button className="primary green" onClick={submitAnswer}>Répondre <span>→</span></button></div>}
          </div>
          {historyPanel}
        </div>
      </>}

      {game.phase === "voting" && <div className="game2-phase-layout">
        <div className="game2-phase">
          <p className="game2-instruction">Les deux questions de chacun ont été posées. Vote pour le joueur que tu penses être l'intrus.</p>
          <div className="game2-vote-grid">{room.players.map((p) => <button key={p.id} className={`game2-vote-card ${game.myVote === p.id ? "selected" : ""}`} disabled={p.id === playerId || !!game.myVote} onClick={() => vote(p.id)}><i>{p.pseudo[0]?.toUpperCase()}</i><strong>{p.pseudo}</strong>{p.id === playerId && <small>TOI</small>}</button>)}</div>
          <div className="game2-vote-status">{game.votes.length}/{room.players.length} votes enregistrés.</div>
        </div>
        {historyPanel}
      </div>}

      {game.phase === "guessing" && <div className="game2-phase-layout">
        <div className="game2-phase">
        {game.isIntruder ? <><p className="game2-instruction">Tu as été désigné comme intrus. Tente maintenant de retrouver le secret.</p>{!game.guess ? <div className="game2-guess-form"><input value={guess} onChange={(e) => setGuess(e.target.value)} placeholder={game.category === "anime" ? "Nom de l'animé…" : "Nom du personnage…"} maxLength={120} /><button className="primary purple" onClick={submitGuess}>Proposer <span>→</span></button></div> : <div className="game2-guess-submitted">Ta proposition : <strong>{game.guess}</strong><span>Les autres joueurs doivent maintenant voter.</span></div>}</> : <><p className="game2-instruction">L'intrus propose une réponse. Accepte-la si tu penses qu'elle correspond au secret.</p>{game.guess ? <div className="game2-guess-card"><strong>{game.guess}</strong><div><button className="primary green" disabled={game.guessVotes.some(v => v.voterId === playerId)} onClick={() => voteGuess(true)}>✓ Correct</button><button className="primary red" disabled={game.guessVotes.some(v => v.voterId === playerId)} onClick={() => voteGuess(false)}>✕ Incorrect</button></div><small>{game.guessVotes.length}/{room.players.length - 1} votes</small></div> : <div className="game2-wait">L'intrus réfléchit à sa réponse…</div>}</>}
        </div>
        {historyPanel}
      </div>}
    </section>
    {error && <div className="toast">{error}</div>}
  </main>;
}
