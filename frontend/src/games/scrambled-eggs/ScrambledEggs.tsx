import { useEffect, useState } from "react";
import { socket } from "../../socket";
import "./ScrambledEggs.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Guess = { id: string; authorId: string; text: string; correct: boolean };
type Snapshot = {
  category: "anime" | "character";
  original: string | null;
  scrambled: string;
  spaceCount: number;
  phase: "playing" | "finished";
  endsAt: number | null;
  guesses: Guess[];
  proposalCounts: Record<string, number>;
  winnerId: string | null;
  winnerScore: number;
  roundNumber: number;
  canGuess: boolean;
  playerId: string;
};

type Props = { room: Room; playerId: string; onExit: () => void };

export default function ScrambledEggs({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const state = (snapshot: Snapshot) => setGame(snapshot);
    socket.on("game6:start", state);
    socket.on("game6:state", state);
    socket.emit("game6:request-state", (r: any) => {
      if (r?.ok) setGame(r.snapshot);
    });
    return () => {
      socket.off("game6:start", state);
      socket.off("game6:state", state);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, []);

  const remaining = game?.endsAt === null || !game?.endsAt
    ? null
    : Math.max(0, Math.ceil((game.endsAt - now) / 1000));

  const submit = () => {
    if (!guess.trim()) return setError("Écris une proposition.");
    setError("");
    socket.emit("game6:guess", { text: guess }, (r: any) => {
      if (!r?.ok) {
        const messages: Record<string, string> = {
          NOT_PLAYING: "La partie est terminée.",
          TIME_OVER: "Le temps est écoulé.",
          EMPTY_GUESS: "Écris une proposition.",
          WAIT_FOR_OTHERS: "Attends que les autres joueurs aient proposé.",
          PLAYER_NOT_FOUND: "Joueur introuvable.",
        };
        setError(messages[r?.error] ?? "Impossible d'envoyer la proposition.");
        return;
      }
      setGuess("");
    });
  };

  if (!game) {
    return <main className="game6-page"><section className="game6-shell loading"><p className="eyebrow">Scrambled Eggs</p><h1>Préparation de la partie…</h1></section></main>;
  }

  const winner = room.players.find((p) => p.id === game.winnerId);
  const letters = [...game.scrambled].map((char, i) => (
    <span key={`${char}-${i}`} className="scramble-letter">{char}</span>
  ));

  return (
    <main className="game6-page">
      <section className="game6-shell">
        <header className="game6-header">
          <div>
            <p className="eyebrow">Scrambled Eggs · {game.category === "anime" ? "Animé" : "Personnage"}</p>
            <h1>Quel est le nom ?</h1>
            <p className="game6-subtitle">
              Toutes les lettres sont mélangées. Les espaces ont été retirés.
            </p>
          </div>
          <div className={`game6-timer ${remaining !== null && remaining <= 10 ? "danger" : ""}`}>
            {remaining === null ? "∞" : `${remaining}s`}
          </div>
        </header>

        <div className="game6-hint">
          <strong>{game.spaceCount}</strong>
          <span>{game.spaceCount === 1 ? "espace" : "espaces"} dans le nom d'origine</span>
        </div>

        <div className="scrambled-word" aria-label="Lettres mélangées">
          {letters}
        </div>

        {game.phase === "playing" ? (
          <div className="game6-form">
            <input
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Écris le nom d'origine…"
              maxLength={120}
              disabled={!game.canGuess}
            />
            <button className="primary purple" onClick={submit} disabled={!game.canGuess}>
              {game.canGuess ? "Proposer →" : "En attente des autres…"}
            </button>
          </div>
        ) : (
          <div className="game6-result">
            {winner ? (
              <>
                <p>🏆 {winner.pseudo} a trouvé !</p>
                <strong>{game.original}</strong>
                <span>+{game.winnerScore} point{game.winnerScore > 1 ? "s" : ""}</span>
              </>
            ) : (
              <>
                <p>Personne n'a trouvé à temps.</p>
                <strong>{game.original}</strong>
              </>
            )}
            <button className="primary purple" onClick={onExit}>Retour à la room <span>←</span></button>
          </div>
        )}

        {error && <div className="game6-error">{error}</div>}

        <div className="game6-proposals">
          <div className="game6-proposals-head">
            <h2>Propositions</h2>
            <span>Tu peux proposer librement, mais après une erreur tu dois laisser les autres jouer.</span>
          </div>
          {game.guesses.length === 0 ? (
            <p className="muted">Aucune proposition pour le moment.</p>
          ) : (
            game.guesses.map((g) => (
              <div className={`game6-guess ${g.correct ? "correct" : ""}`} key={g.id}>
                <strong>{room.players.find((p) => p.id === g.authorId)?.pseudo ?? "Joueur"}</strong>
                <span>{g.text}</span>
                <em>{g.correct ? "✓ Correct" : "✕ Incorrect"}</em>
              </div>
            ))
          )}
        </div>

        {game.phase === "playing" && (
          <div className="game6-counts">
            {room.players.map((p) => (
              <span key={p.id}>{p.pseudo} · {game.proposalCounts[p.id] ?? 0}</span>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
