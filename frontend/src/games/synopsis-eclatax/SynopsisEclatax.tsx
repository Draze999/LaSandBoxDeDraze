import { useEffect, useRef, useState } from "react";
import { socket } from "../../socket";
import "./SynopsisEclatax.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Suggestion = { id: number; name: string };
type Snapshot = {
  synopsis: string;
  original: string | null;
  phase: "playing" | "between" | "finished";
  endsAt: number | null;
  roundNumber: number;
  totalRounds: number;
  foundIds: string[];
  failedIds: string[];
  roundWinnerIds: string[];
  cumulativeScores: Record<string, number>;
  playerId: string;
};

type Props = { room: Room; playerId: string; onExit: () => void };

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "https://api.lasandboxdedraze.xyz";

export default function SynopsisEclatax({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [searching, setSearching] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const state = (snapshot: Snapshot) => setGame(snapshot);
    socket.on("game9:start", state);
    socket.on("game9:state", state);
    socket.emit("game9:request-state", (r: any) => {
      if (r?.ok) setGame(r.snapshot);
    });
    return () => {
      socket.off("game9:start", state);
      socket.off("game9:state", state);
      searchAbort.current?.abort();
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const query = text.trim();
    if (query.length < 2 || game?.phase !== "playing" || game.foundIds.includes(playerId) || game.failedIds.includes(playerId)) {
      setSuggestions([]);
      setSearching(false);
      searchAbort.current?.abort();
      return;
    }

    const timer = window.setTimeout(async () => {
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      setSearching(true);
      try {
        const response = await fetch(`${API_BASE}/api/anime/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const payload = await response.json() as { results?: Suggestion[] };
        setSuggestions(payload.results ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 160);

    return () => clearTimeout(timer);
  }, [text, game?.phase, game?.foundIds, game?.failedIds, playerId]);

  const remaining = game?.endsAt === null || !game?.endsAt
    ? 0
    : Math.max(0, Math.ceil((game.endsAt - now) / 1000));

  const submit = (value = text) => {
    const guess = value.trim();
    if (!guess) return setError("Choisis un animé.");
    setError("");
    socket.emit("game9:guess", { text: guess }, (r: any) => {
      if (!r?.ok) {
        const messages: Record<string, string> = {
          NOT_PLAYING: "La manche est terminée.",
          TIME_OVER: "Le temps est écoulé.",
          EMPTY_GUESS: "Choisis un animé.",
          ALREADY_FOUND: "Tu as déjà trouvé cet animé.",
          ALREADY_FAILED: "Tu as déjà raté cette manche.",
          PLAYER_NOT_FOUND: "Joueur introuvable.",
        };
        setError(messages[r?.error] ?? "Impossible d'envoyer la réponse.");
        return;
      }
      if (r.correct) {
        setText("");
        setSuggestions([]);
        setError("");
      } else if (r.failed) {
        setText("");
        setSuggestions([]);
        setError("Raté ! Tu ne peux plus répondre pour cette manche.");
      }
    });
  };

  if (!game) {
    return <main className="game9-page"><section className="game9-shell loading"><p className="eyebrow">Synopsis éclatax</p><h1>Le synopsis le plus nul de l'histoire est en préparation…</h1></section></main>;
  }

  const names = new Map(room.players.map((player) => [player.id, player.pseudo]));
  const winnerNames = game.roundWinnerIds.map((id) => names.get(id) ?? "Joueur");
  const scores = Object.entries(game.cumulativeScores).sort(([, a], [, b]) => b - a);
  const alreadyFound = game.foundIds.includes(playerId);
  const alreadyFailed = game.failedIds.includes(playerId);
  const locked = alreadyFound || alreadyFailed;

  return (
    <main className="game9-page">
      <section className="game9-shell">
        <header className="game9-header">
          <div>
            <p className="eyebrow">Synopsis éclatax · Manche {game.roundNumber}/{game.totalRounds}</p>
            <h1>Devine l'animé.</h1>
            <p className="game9-subtitle">Un synopsis écrit par une IA qui a décidé de détester son travail.</p>
          </div>
          {game.phase === "playing" && <div className={`game9-timer ${remaining <= 15 ? "danger" : ""}`}>{remaining}s</div>}
        </header>

        <article className="game9-synopsis">
          <span className="game9-quote">“</span>
          <p>{game.synopsis}</p>
        </article>

        {game.phase === "playing" ? (
          <div className="game9-play">
            <div className="game9-input-wrap">
              <input
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submit(); }
                  if (e.key === "Escape") setSuggestions([]);
                }}
                placeholder={alreadyFound ? "Tu as trouvé !" : alreadyFailed ? "Raté !" : "Quel animé est-ce ?"}
                maxLength={160}
                disabled={locked}
              />
              {!locked && suggestions.length > 0 && (
                <div className="game9-suggestions">
                  {suggestions.map((suggestion) => (
                    <button key={suggestion.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setText(suggestion.name); setSuggestions([]); }}>
                      {suggestion.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="primary purple" onClick={() => submit()} disabled={locked}>
              {alreadyFound ? "Trouvé ✓" : alreadyFailed ? "Raté ✕" : "Deviner →"}
            </button>
          </div>
        ) : game.phase === "between" ? (
          <div className="game9-result">
            <p>Réponse : <strong>{game.original}</strong></p>
            {winnerNames.length > 0 ? <p>🏆 Trouvé par {winnerNames.join(", ")} · +1 point{winnerNames.length > 1 ? "s" : ""} chacun</p> : <p>Personne n'a trouvé cette manche.</p>}
            <p className="muted">Manche suivante dans un instant…</p>
          </div>
        ) : (
          <div className="game9-result">
            <p>Réponse : <strong>{game.original}</strong></p>
            {winnerNames.length > 0 ? <p>🏆 {winnerNames.join(", ")} {winnerNames.length === 1 ? "a trouvé" : "ont trouvé"} la dernière manche.</p> : <p>Personne n'a trouvé la dernière manche.</p>}
            <div className="game9-final-scores">
              {scores.map(([id, score]) => (
                <div key={id}><strong>{names.get(id) ?? "Joueur"}</strong><span>{score} point{score > 1 ? "s" : ""}</span></div>
              ))}
            </div>
            <button className="primary purple" onClick={onExit}>Retour à la room <span>←</span></button>
          </div>
        )}

        {searching && !alreadyFound && <p className="game9-searching">Recherche dans la base d'animés…</p>}
        {error && <p className="game9-error">{error}</p>}

        {game.phase === "playing" && (
          <div className="game9-status">
            {room.players.map((player) => {
              const found = game.foundIds.includes(player.id);
              const failed = game.failedIds.includes(player.id);
              return (
                <span key={player.id} className={found ? "found" : failed ? "failed" : ""}>
                  {found ? "✓ " : failed ? "✕ " : ""}{player.pseudo}
                </span>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
