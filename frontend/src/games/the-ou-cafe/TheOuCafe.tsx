import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import "./TheOuCafe.css";

type Player = { id: string; pseudo: string; isHost: boolean };
type Room = { code: string; hostId: string; players: Player[] };
type Question = {
  id: string;
  authorId: string;
  left: string;
  right: string;
  chosen: "left" | "right" | "none" | null;
};
type Suggestion = { id: number; name: string };

const API_BASE = import.meta.env.DEV ? "http://localhost:3001" : "https://api.lasandboxdedraze.xyz";

type Answer = {
  id: string;
  authorId: string;
  text: string;
  status: "pending" | "accepted" | "rejected";
};
type Snapshot = {
  category: "anime" | "character";
  phase: "choosing" | "playing" | "finished";
  targetPlayerId: string;
  candidates: Array<{ id: number; name: string; imageUrl?: string | null }>;
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
  const [answerSuggestions, setAnswerSuggestions] = useState<Suggestion[]>([]);
  const answerSearchAbort = useRef<AbortController | null>(null);
  const isTarget = game?.targetPlayerId === playerId;
  const player = (id: string) =>
    room.players.find((p) => p.id === id)?.pseudo ?? "Joueur";

  useEffect(() => {
    const query = answer.trim();
    if (query.length < 2 || !game || game.phase !== "playing" || isTarget) {
      setAnswerSuggestions([]);
      answerSearchAbort.current?.abort();
      return;
    }
    const timer = window.setTimeout(async () => {
      answerSearchAbort.current?.abort();
      const controller = new AbortController();
      answerSearchAbort.current = controller;
      try {
        const endpoint = game.category === "character" ? "/api/characters/search" : "/api/anime/search";
        const response = await fetch(`${API_BASE}${endpoint}?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const payload = await response.json() as { results?: Suggestion[] };
        setAnswerSuggestions(payload.results ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setAnswerSuggestions([]);
      }
    }, 160);
    return () => clearTimeout(timer);
  }, [answer, game?.phase, game?.category, isTarget]);

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

  if (game.phase === "choosing")
    return (
      <main className="game1-page">
        <section className="game1-shell">
          <header className="game1-header">
            <div>
              <p className="eyebrow">Thé ou Café · Manche {game.roundNumber}</p>
              <h1>{isTarget ? "Choisis ton élément secret" : "Le maître choisit son élément…"}</h1>
              <p className="game1-subtitle">
                {isTarget
                  ? "Choisis une des trois propositions. Les autres joueurs ne verront pas ton choix."
                  : `${player(game.targetPlayerId)} choisit parmi 3 propositions.`}
              </p>
            </div>
          </header>

          {isTarget ? (
            <div className="game1-candidates">
              {game.candidates.map((candidate) => (
                <button
                  className="game1-candidate"
                  key={candidate.id}
                  onClick={() => {
                    socket.emit(
                      "game1:select-secret",
                      { candidateId: candidate.id },
                      (r: any) => {
                        if (!r?.ok) return;
                      },
                    );
                  }}
                >
                  {candidate.imageUrl && <img src={candidate.imageUrl} alt="" />}
                  <strong>{candidate.name}</strong>
                </button>
              ))}
            </div>
          ) : (
            <div className="game1-panel loading-choice">
              <p>En attente du choix de {player(game.targetPlayerId)}…</p>
            </div>
          )}
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
                    className={q.chosen === "left" ? "chosen-word" : q.chosen === "none" ? "none-word" : ""}
                  >
                    {q.left}
                  </strong>{" "}
                  ou{" "}
                  <strong
                    className={q.chosen === "right" ? "chosen-word" : q.chosen === "none" ? "none-word" : ""}
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
              <div className="answer-form autocomplete-field">
                <div className="autocomplete-input-wrap">
                  <input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setAnswerSuggestions([]); }}
                    placeholder="Qui/quoi est l'élément secret ?"
                  />
                  {answerSuggestions.length > 0 && (
                    <div className="autocomplete-suggestions">
                      {answerSuggestions.map((suggestion) => (
                        <button key={suggestion.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setAnswer(suggestion.name); setAnswerSuggestions([]); }}>
                          {suggestion.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                  <div className="judge-choice-buttons">
                    <button
                      className={q.chosen === "left" ? "chosen" : ""}
                      onClick={() =>
                        socket.emit(
                          "game1:choose",
                          { questionId: q.id, side: "left" },
                          (r: any) => {
                            if (r?.ok) setGame((current) => current ? { ...current, questions: current.questions.map((question) => question.id === q.id ? { ...question, chosen: "left" } : question) } : current);
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
                            if (r?.ok) setGame((current) => current ? { ...current, questions: current.questions.map((question) => question.id === q.id ? { ...question, chosen: "right" } : question) } : current);
                          }
                        )
                      }
                    >
                      {q.right}
                    </button>

                    <button
                      className={`none-choice ${q.chosen === "none" ? "chosen" : ""}`}
                      onClick={() =>
                        socket.emit(
                          "game1:choose",
                          { questionId: q.id, side: "none" },
                          (r: any) => {
                            if (r?.ok) setGame((current) => current ? { ...current, questions: current.questions.map((question) => question.id === q.id ? { ...question, chosen: "none" } : question) } : current);
                          }
                        )
                      }
                    >
                      Aucun
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
