import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import "./Chronologie.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Anime = { id: number; name: string; season: string; image_url: string | null; image_small_url: string | null };
type Proposal = { playerId: string; order: number[]; score: number | null };
type Snapshot = { phase: "playing" | "finished"; endsAt: number | null; anime: Anime[]; trueOrder: number[] | null; ownOrder: number[]; proposals: Record<string, Proposal> | null; playerId: string };
type Props = { room: Room; playerId: string; onExit: () => void };

export default function Chronologie({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [now, setNow] = useState(Date.now());
  const [dragged, setDragged] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const state = (snapshot: Snapshot) => setGame(snapshot);
    socket.on("game10:start", state);
    socket.on("game10:state", state);
    socket.emit("game10:request-state", (r: any) => { if (r?.ok) setGame(r.snapshot); });
    return () => { socket.off("game10:start", state); socket.off("game10:state", state); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);

  const byId = useMemo(() => new Map(game?.anime.map(a => [a.id, a]) ?? []), [game?.anime]);
  const remaining = game?.endsAt ? Math.max(0, Math.ceil((game.endsAt - now) / 1000)) : 0;
  const names = useMemo(() => new Map(room.players.map(p => [p.id, p.pseudo])), [room.players]);

  const move = (from: number, insertion: number) => {
    if (!game || game.phase !== "playing") return;
    const order = [...game.ownOrder];
    const [id] = order.splice(from, 1);
    let target = insertion;
    if (from < insertion) target--;
    target = Math.max(0, Math.min(order.length, target));
    order.splice(target, 0, id);
    setDragged(null);
    socket.emit("game10:reorder", { order }, (r: any) => {
      if (!r?.ok) setError(r?.error === "TIME_OVER" ? "Le temps est écoulé." : "Impossible de modifier ton classement.");
      else setError("");
    });
  };

  if (!game) return <main className="chrono-page"><section className="chrono-shell"><p>Chargement…</p></section></main>;

  if (game.phase === "playing") {
    return <main className="chrono-page"><section className="chrono-shell">
      <header className="chrono-header"><div><p className="eyebrow">Chronologie</p><h1>Remets les animés dans l'ordre</h1><p className="chrono-subtitle">Fais glisser les cartes et dépose-les entre deux animés.</p></div><div className={`chrono-timer ${remaining <= 10 ? "danger" : ""}`}>{remaining}s</div></header>
      <div className="chrono-board">
        <div className="chrono-order">
          <DropZone onDrop={() => dragged !== null && move(dragged, 0)} />
          {game.ownOrder.map((id, index) => {
            const anime = byId.get(id)!;
            return <div className="chrono-item-wrap" key={id}>
              <article className={`chrono-card ${dragged === index ? "dragging" : ""}`} draggable onDragStart={() => setDragged(index)} onDragEnd={() => setDragged(null)}>
                {anime.image_small_url || anime.image_url ? <img src={anime.image_small_url || anime.image_url || ""} alt="" draggable={false} /> : <div className="chrono-no-image" />}
                <div><strong>{anime.name}</strong><span>{anime.season}</span></div>
              </article>
              <DropZone onDrop={() => dragged !== null && move(dragged, index + 1)} />
            </div>;
          })}
        </div>
      </div>
      {error && <p className="chrono-error">{error}</p>}
      <p className="chrono-hint">Chaque séparation correspond à une comparaison. Une comparaison est réussie si l'animé de gauche est sorti avant celui de droite.</p>
    </section></main>;
  }

  const trueOrder = game.trueOrder ?? [];
  return <main className="chrono-page"><section className="chrono-shell chrono-results-shell">
    <header className="chrono-header"><div><p className="eyebrow">Chronologie · Résultats</p><h1>La vraie chronologie</h1><p className="chrono-subtitle">Les propositions sont comparées une par une. Les séparations vertes sont correctes, les rouges sont incorrectes.</p></div></header>
    <section className="chrono-correction">
      <h2>Ordre réel</h2>
      <div className="chrono-result-list">{trueOrder.map((id, i) => <ResultCard key={id} anime={byId.get(id)!} last={i === trueOrder.length - 1} valid={true} />)}</div>
    </section>
    <section className="chrono-proposals">
      <h2>Propositions des joueurs</h2>
      <div className="chrono-proposals-scroll">
        {Object.entries(game.proposals ?? {}).map(([id, proposal]) => <div className="chrono-player-result" key={id}>
          <div className="chrono-player-heading"><strong>{names.get(id) ?? "Joueur"}</strong><span>{proposal.score ?? 0} / {Math.max(0, proposal.order.length - 1)} point{proposal.score === 1 ? "" : "s"}</span></div>
          <div className="chrono-result-list">{proposal.order.map((animeId, i) => {
            const left = byId.get(animeId);
            const right = proposal.order[i + 1] ? byId.get(proposal.order[i + 1]) : null;
            const valid = right ? compare(left!, right!) : true;
            return <ResultCard key={animeId} anime={left!} last={!right} valid={valid} />;
          })}</div>
        </div>)}
      </div>
    </section>
    <button className="primary" onClick={onExit}>Retour au lobby</button>
  </section></main>;
}

function DropZone({ onDrop }: { onDrop: () => void }) {
  return <div className="chrono-drop-zone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(); }}><span>＋</span></div>;
}

function compare(a: Anime, b: Anime) {
  const order: Record<string, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };
  const parse = (value: string) => { const m = /^(Winter|Spring|Summer|Fall) (\d{4})$/i.exec(value); return m ? Number(m[2]) * 4 + order[m[1][0].toUpperCase() + m[1].slice(1).toLowerCase()] : Number.MAX_SAFE_INTEGER; };
  return parse(a.season) < parse(b.season);
}

function ResultCard({ anime, last, valid }: { anime: Anime; last: boolean; valid: boolean }) {
  return <div className="chrono-result-wrap"><article className="chrono-card result">{anime.image_small_url || anime.image_url ? <img src={anime.image_small_url || anime.image_url || ""} alt="" /> : <div className="chrono-no-image" />}<div><strong>{anime.name}</strong><span>{anime.season}</span></div></article>{!last && <div className={`chrono-separator ${valid ? "valid" : "invalid"}`}><span /></div>}</div>;
}
