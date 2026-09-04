import { useEffect, useMemo, useState } from "react";
import { socket } from "../../socket";
import "./TheOuCafe.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Question = {
  id: string;
  authorId: string;
  left: string;
  right: string;
  chosen: "left" | "right" | null;
};
type Answer = {
  id: string;
  authorId: string;
  text: string;
  status: "pending" | "accepted" | "rejected";
};
type Snapshot = {
  category: "anime" | "character";
  phase: "playing" | "finished";
  targetPlayerId: string;
  secret?: {
    id: number;
    name: string;
    imageUrl?: string | null;
    animeName?: string | null;
  };
  questions: Question[];
  answers: Answer[];
  questionCount: number;
  winnerId: string | null;
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  roundNumber: number;
};

export default function TheOuCafe({
  room,
  playerId,
  onExit,
}: {
  room: Room;
  playerId: string;
  onExit: () => void;
}) {
  const [game, setGame] = useState<Snapshot | null>(null);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [answer, setAnswer] = useState("");
  const isTarget = game?.targetPlayerId === playerId;
  const player = (id: string) =>
    room.players.find((p) => p.id === id)?.pseudo ?? "Joueur";

  useEffect(() => {
    const start = (s: Snapshot) => setGame(s);
    const state = (s: Snapshot) => setGame(s);
    socket.on("game1:start", start);
    socket.on("game1:state", state);
    socket.emit("game1:request-state", (r: any) => {
      if (r?.ok) setGame(r.snapshot);
    });
    return () => {
      socket.off("game1:start", start);
      socket.off("game1:state", state);
    };
  }, []);

  const ask = () => {
    socket.emit("game1:question", { left, right }, (r: any) => {
      if (r?.ok) {
        setLeft("");
        setRight("");
      }
    });
  };
  const sendAnswer = () => {
    socket.emit("game1:answer", { text: answer }, (r: any) => {
      if (r?.ok) setAnswer("");
    });
  };
  const ranking = useMemo(
    () =>
      room.players
        .map((p) => ({
          ...p,
          total: game?.cumulativeScores[p.id] ?? 0,
          gain: game?.roundScores[p.id] ?? 0,
        }))
        .sort((a, b) => b.total - a.total || b.gain - a.gain),
    [room.players, game],
  );

  if (!game)
    return (
      <main className="game1-page">
        <section className="game1-shell loading">
          <p>Thé ou Café</p>
          <h1>Préparation de la partie…</h1>
        </section>
      </main>
    );

  if (game.phase === "finished")
    return (
      <main className="game1-page">
        <section className="game1-shell">
          <p className="eyebrow">
            Thé ou Café · Manche {game.roundNumber} terminée
          </p>
          <h1>Classement</h1>
          {game.secret && <div className="game1-result-secret"><img src={game.secret.imageUrl ?? ""} alt=""/><div><small>Élément secret</small><strong>{game.secret.name}</strong>{game.category === "character" && game.secret.animeName && <span>{game.secret.animeName}</span>}</div></div>}
          <div className="game1-ranking">
            {ranking.map((p, i) => (
              <div className="game1-rank" key={p.id}>
                <span>#{i + 1}</span>
                <i>{p.pseudo[0]}</i>
                <strong>
                  {p.pseudo}
                  {p.id === playerId && <small> VOUS</small>}
                </strong>
                <b>
                  {p.total} <em>(+{p.gain})</em>
                </b>
              </div>
            ))}
          </div>
          <button className="primary purple" onClick={onExit}>
            Retour à la room <span>←</span>
          </button>
        </section>
      </main>
    );

  return (
    <main className="game1-page">
      <section className="game1-shell">
        <header className="game1-header">
          <div>
            <p className="eyebrow">Thé ou Café · Manche {game.roundNumber}</p>
            <h1>
              {isTarget ? "Tu connais la réponse." : "À toi de trouver !"}
            </h1>
            <p className="game1-subtitle">
              Mastermind : <strong>{player(game.targetPlayerId)}</strong>
            </p>
          </div>
          {isTarget && (
            <div className="secret">
              {game.secret?.imageUrl && <img src={game.secret.imageUrl} alt="" />}
              <div><small>Élément secret</small>
              <strong>{game.secret?.name}</strong>
              {game.category === "character" && game.secret?.animeName && (
                <span>{game.secret.animeName}</span>
              )}
              </div>
            </div>
          )}
        </header>

        {!isTarget ? (
          <div className="game1-columns">
            <div className="game1-panel">
              <h2>Plutôt… ou… ?</h2>
              <div className="question-form">
                <input
                  value={left}
                  onChange={(e) => setLeft(e.target.value)}
                  placeholder="Première proposition"
                />
                <span>ou</span>
                <input
                  value={right}
                  onChange={(e) => setRight(e.target.value)}
                  placeholder="Deuxième proposition"
                />
                <button className="primary green" onClick={ask}>
                  Soumettre
                </button>
              </div>
              <h3>Questions posées</h3>
              {[...game.questions].reverse().map((q) => (
              <div className="item" key={q.id}>
                <b>{player(q.authorId)}</b>

                <span>
                  Plutôt{" "}
                  <strong
                    className={q.chosen === "left" ? "chosen-word" : ""}
                  >
                    {q.left}
                  </strong>{" "}
                  ou{" "}
                  <strong
                    className={q.chosen === "right" ? "chosen-word" : ""}
                  >
                    {q.right}
                  </strong>{" "}
                  ?
                </span>
              </div>
            ))}
          </div>
            <div className="game1-panel">
              <h2>Ta réponse</h2>
              <div className="answer-form">
                <input
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Qui/quoi est l'élément secret ?"
                />
                <button className="primary blue" onClick={sendAnswer}>
                  Répondre
                </button>
              </div>
              <h3>Réponses proposées</h3>
              {[...game.answers].reverse().map((a) => (
                <div className={`item ${a.status}`} key={a.id}>
                  <b>{player(a.authorId)}</b>
                  <span>{a.text}</span>
                  <em>
                    {a.status === "accepted"
                      ? "✓ Acceptée"
                      : a.status === "rejected"
                        ? "✕ Refusée"
                        : "En attente"}
                  </em>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="game1-columns">
            <div className="game1-panel">
              <h2>Questions des joueurs</h2>
              {[...game.questions].reverse().map((q) => (
                <div className="judge-question" key={q.id}>
                  <b>{player(q.authorId)}</b>
                  <p>
                    Plutôt <strong>{q.left}</strong> ou{" "}
                    <strong>{q.right}</strong> ?
                  </p>
                  <div>
                    <button
                      className={q.chosen === "left" ? "chosen" : ""}
                      onClick={() =>
                        socket.emit(
                          "game1:choose",
                          { questionId: q.id, side: "left" },
                          (r: any) => {
                            if (r?.ok) {
                              socket.emit(
                                "game1:request-state",
                                (state: any) => {
                                  if (state?.ok) setGame(state.snapshot);
                                }
                              );
                            }
                          }
                        )
                      }
                    >
                      {q.left}
                    </button>

                    <button
                      className={q.chosen === "right" ? "chosen" : ""}
                      onClick={() =>
                        socket.emit(
                          "game1:choose",
                          { questionId: q.id, side: "right" },
                          (r: any) => {
                            if (r?.ok) {
                              socket.emit(
                                "game1:request-state",
                                (state: any) => {
                                  if (state?.ok) setGame(state.snapshot);
                                }
                              );
                            }
                          }
                        )
                      }
                    >
                      {q.right}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="game1-panel">
              <h2>Réponses des joueurs</h2>
              {[...game.answers].reverse().map((a) => (
                <div className={`judge-answer ${a.status}`} key={a.id}>
                  <b>{player(a.authorId)}</b>
                  <span>{a.text}</span>
                  {a.status === "pending" && (
                    <div>
                      <button
                        onClick={() =>
                          socket.emit(
                            "game1:judge",
                            { answerId: a.id, accepted: true },
                            (r: any) => {
                              if (r?.ok)
                                socket.emit(
                                  "game1:request-state",
                                  (state: any) => {
                                    if (state?.ok) setGame(state.snapshot);
                                  },
                                );
                            },
                          )
                        }
                      >
                        ✓ Valider
                      </button>
                      <button
                        onClick={() =>
                          socket.emit(
                            "game1:judge",
                            { answerId: a.id, accepted: false },
                            (r: any) => {
                              if (r?.ok)
                                socket.emit(
                                  "game1:request-state",
                                  (state: any) => {
                                    if (state?.ok) setGame(state.snapshot);
                                  },
                                );
                            },
                          )
                        }
                      >
                        ✕ Refuser
                      </button>
                    </div>
                  )}
                  <em>
                    {a.status === "accepted"
                      ? "Réponse validée"
                      : a.status === "rejected"
                        ? "Réponse refusée"
                        : ""}
                  </em>
                </div>
              ))}
              <button
                className="no-find"
                onClick={() => socket.emit("game1:no-find")}
              >
                Personne n'a trouvé
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
