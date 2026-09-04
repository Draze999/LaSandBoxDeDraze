import { useEffect, useState } from "react";
import { socket } from "../../socket";
import "./Picasso.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Snapshot = {
  category: "anime" | "character";
  imageDataUrl: string;
  original: string | null;
  phase: "playing" | "finished";
  endsAt: number | null;
  winnerId: string | null;
  winnerScore: number;
  abandonedIds: string[];
  playerId: string;
};
type Props = { room: Room; playerId: string; onExit: () => void };

export default function Picasso({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [guess, setGuess] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const state = (snapshot: Snapshot) => setGame(snapshot);
    socket.on("game7:start", state);
    socket.on("game7:state", state);
    socket.emit("game7:request-state", (r: any) => { if (r?.ok) setGame(r.snapshot); });
    return () => {
      socket.off("game7:start", state);
      socket.off("game7:state", state);
    };
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const remaining = game?.endsAt == null ? null : Math.max(0, Math.ceil((game.endsAt - now) / 1000));
  const abandoned = game?.abandonedIds.includes(playerId) ?? false;
  const submit = () => {
    if (!guess.trim()) return setError("Écris une proposition.");
    setError("");
    socket.emit("game7:guess", { text: guess }, (r: any) => {
      if (!r?.ok) {
        const messages: Record<string,string> = {
          NOT_PLAYING: "La manche est terminée.",
          ABANDONED: "Tu as abandonné cette manche.",
          TIME_OVER: "Le temps est écoulé.",
          EMPTY_GUESS: "Écris une proposition.",
        };
        setError(messages[r?.error] ?? "Impossible d'envoyer la réponse.");
        return;
      }
      setGuess("");
    });
  };
  const abandon = () => {
    setError("");
    socket.emit("game7:abandon", (r: any) => {
      if (!r?.ok) setError(r?.error === "NOT_PLAYING" ? "La manche est terminée." : "Impossible d'abandonner.");
    });
  };

  if (!game) return <main className="game7-page"><section className="game7-shell loading"><p className="eyebrow">Picasso</p><h1>Préparation de l'image…</h1></section></main>;

  const winner = room.players.find(p => p.id === game.winnerId);
  return (
    <main className="game7-page">
      <section className="game7-shell">
        <header className="game7-header">
          <div><p className="eyebrow">Picasso · {game.category === "anime" ? "Animé" : "Personnage"}</p><h1>Qui est-ce ?</h1><p className="game7-subtitle">L'image a subi trois transformations. Saurez-vous reconnaître l'original ?</p></div>
          <div className={`game7-timer ${remaining !== null && remaining <= 10 ? "danger" : ""}`}>{remaining === null ? "∞" : `${remaining}s`}</div>
        </header>

        <div className="game7-image-wrap">
          <img src={game.imageDataUrl} alt={game.original ?? "Image transformée"} className="game7-image" />
        </div>

        {game.phase === "playing" ? (
          <div className="game7-form">
            <input value={guess} onChange={e => setGuess(e.target.value)} onKeyDown={e => { if(e.key === "Enter") submit(); }} placeholder="Nom de l'animé ou du personnage…" maxLength={160} disabled={abandoned} />
            <button className="primary purple" onClick={submit} disabled={abandoned}>{abandoned ? "Tu as abandonné" : "Répondre →"}</button>
            {!abandoned && <button className="game7-abandon" onClick={abandon}>J'abandonne</button>}
          </div>
        ) : (
          <div className="game7-result">
            {winner ? <><p>🏆 {winner.pseudo} a trouvé !</p><strong>{game.original}</strong><span>+1 point</span></> : <><p>La réponse était :</p><strong>{game.original}</strong><span>Aucun point cette manche.</span></>}
            <button className="primary purple" onClick={onExit}>Retour à la room <span>←</span></button>
          </div>
        )}

        {error && <div className="game7-error">{error}</div>}
        {game.phase === "playing" && <div className="game7-abandons">{room.players.map(p => <span key={p.id} className={game.abandonedIds.includes(p.id) ? "is-abandoned" : ""}>{p.pseudo}{game.abandonedIds.includes(p.id) ? " · abandon" : ""}</span>)}</div>}
      </section>
    </main>
  );
}
