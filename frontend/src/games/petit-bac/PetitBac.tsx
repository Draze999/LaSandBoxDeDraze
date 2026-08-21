import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../../socket";
import "./PetitBac.css";
import {
  PETIT_BAC_CATEGORIES,
  type PetitBacAnswers,
  type PetitBacSnapshot,
} from "./constants";

type Player = {
  id: string;
  pseudo: string;
  isHost: boolean;
};

type Room = {
  code: string;
  hostId: string;
  players: Player[];
};

type Props = {
  room: Room;
  playerId: string;
  onExit: () => void;
};

export default function PetitBac({ room, playerId, onExit }: Props) {
  const [game, setGame] = useState<PetitBacSnapshot | null>(null);
  const [answers, setAnswers] = useState<PetitBacAnswers>({});
  const [submitted, setSubmitted] = useState(false);
  const [myVotes, setMyVotes] = useState<Record<string, "accept" | "reject">>({});
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const answersRef = useRef<PetitBacAnswers>({});

  const isHost = room.hostId === playerId;

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    const onStart = (snapshot: PetitBacSnapshot) => {
      setGame(snapshot);
      setAnswers({});
      setSubmitted(false);
      setMyVotes({});
      setError("");
    };

    const onState = (snapshot: PetitBacSnapshot) => {
      setGame(snapshot);
    };

    socket.on("game3:start", onStart);
    socket.on("game3:state", onState);

    // Important : game3:start peut avoir été émis avant que ce composant
    // soit monté. On demande donc toujours l'état actuel au serveur.
    socket.emit("game3:request-state", (result: any) => {
      if (result?.ok && result.snapshot) {
        setGame(result.snapshot);
      }
    });

    return () => {
      socket.off("game3:start", onStart);
      socket.off("game3:state", onState);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setMyVotes({});
  }, [game?.currentPlayerId]);

  const remaining = useMemo(() => {
    if (!game) return 0;
    return Math.max(0, Math.ceil((game.endsAt - now) / 1000));
  }, [game, now]);

  // Sauvegarde automatique : on envoie la dernière version des champs juste
  // avant la fin du chrono. Cela se fait indépendamment sur CHAQUE client,
  // pas seulement chez l'hôte. Une seconde sauvegarde est tentée à 0 seconde
  // si nécessaire.
  useEffect(() => {
    if (!game || game.phase !== "playing" || submitted) return;

    const save = () => {
      if (submitted) return;
      socket.emit("game3:submit", { answers: answersRef.current }, (result: any) => {
        if (result?.ok) {
          setSubmitted(true);
        }
      });
    };

    const delay = Math.max(0, game.endsAt - Date.now() - 250);
    const timeout = window.setTimeout(save, delay);
    return () => window.clearTimeout(timeout);
  }, [game?.phase, game?.endsAt, submitted]);

  useEffect(() => {
    if (!game || game.phase !== "playing" || remaining > 0 || submitted) return;
    socket.emit("game3:submit", { answers: answersRef.current }, (result: any) => {
      if (result?.ok) setSubmitted(true);
    });
  }, [remaining, game?.phase, submitted]);

  const currentPlayer = room.players.find(
    (player) => player.id === game?.currentPlayerId,
  );

  const submit = () => {
    setError("");

    socket.emit("game3:submit", { answers }, (result: any) => {
      if (!result?.ok) {
        setError(
          result?.error === "TIME_OVER"
            ? "Le temps est écoulé."
            : "Impossible d'enregistrer tes réponses.",
        );
        return;
      }

      setSubmitted(true);
    });
  };

  const vote = (category: string, value: "accept" | "reject") => {
    setError("");

    socket.emit("game3:vote", { category, vote: value }, (result: any) => {
      if (!result?.ok) {
        setError(
          result?.error === "EMPTY_ANSWER"
            ? "Cette catégorie n'a pas de réponse."
            : "Ce vote n'est plus disponible.",
        );
        return;
      }

      setMyVotes((previous) => ({ ...previous, [category]: value }));
    });
  };

  const navigate = (direction: "next" | "previous") => {
    setError("");

    socket.emit("game3:navigate", { direction }, (result: any) => {
      if (!result?.ok) {
        if (result?.error === "ALREADY_FIRST") {
          return;
        }
        setError("Impossible de changer de joueur.");
      }
    });
  };

  if (!game) {
    return (
      <main className="game3-page">
        <section className="game3-shell game3-loading">
          <p className="eyebrow">Petit Bac</p>
          <h1>Préparation de la partie…</h1>
          <p className="game3-subtitle">
            Synchronisation avec le serveur…
          </p>
        </section>
      </main>
    );
  }

  if (game.phase === "finished") {
    const ranking = [...room.players]
      .map((player) => ({
        ...player,
        score: game.scores[player.id] ?? 0,
        roundScore: game.roundScores[player.id] ?? 0,
        cumulativeScore: game.cumulativeScores[player.id] ?? game.scores[player.id] ?? 0,
      }))
      .sort((a, b) => b.cumulativeScore - a.cumulativeScore || b.roundScore - a.roundScore);

    return (
      <main className="game3-page">
        <section className="game3-shell game3-results">
          <div className="game3-results-head">
            <div>
              <p className="eyebrow">Petit Bac · Partie terminée</p>
              <h1>Classement</h1>
            </div>
            <div className="game3-letter-badge">{game.letter}</div>
          </div>

          <div className="game3-ranking">
            {ranking.map((player, index) => (
              <div className="game3-ranking-row" key={player.id}>
                <span className="game3-rank">#{index + 1}</span>
                <span className="game3-avatar">
                  {player.pseudo[0]?.toUpperCase()}
                </span>
                <strong>{player.pseudo}</strong>
                {player.id === playerId && <small>VOUS</small>}
                <b className="game3-total-score">
                  {player.cumulativeScore} pt{player.cumulativeScore > 1 ? "s " : " "}
                  <b
                    className="game3-round-gain"
                    style={{
                      color: `rgb(${Math.round(224 - (224 - 127) * Math.min(player.roundScore, 11) / 11)}, ${Math.round(100 + (207 - 100) * Math.min(player.roundScore, 11) / 11)}, ${Math.round(100 + (155 - 100) * Math.min(player.roundScore, 11) / 11)})`,
                    }}
                  >
                    ‎ (+{player.roundScore})
                  </b>
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
  }

  if (game.phase === "reviewing") {
    const isOwnGrid = game.currentPlayerId === playerId;
    const isFirst = game.reviewIndex === 0;
    const isLast = game.reviewIndex === game.reviewTotal - 1;

    return (
      <main className="game3-page">
        <section className="game3-shell">
          <header className="game3-header">
            <div>
              <p className="eyebrow">
                Petit Bac · Correction {game.reviewIndex + 1}/{game.reviewTotal}
              </p>
              <h1>
                Réponses de <span>{currentPlayer?.pseudo ?? "Joueur"}</span>
              </h1>
              <p className="game3-subtitle">
                {isOwnGrid
                  ? "Les autres joueurs votent sur tes réponses."
                  : "Vote pour accepter ou refuser chaque réponse."}
              </p>
            </div>
            <div className="game3-letter-badge">{game.letter}</div>
          </header>

          <div className="game3-answer-list">
            {PETIT_BAC_CATEGORIES.map(([id, label]) => {
              const answer = game.currentPlayerAnswers?.[id] ?? "";
              const result = game.currentResults[id];
              const voted = myVotes[id] !== undefined;

              return (
                <article className="game3-answer" key={id}>
                  <div className="game3-answer-main">
                    <span className="game3-category">{label}</span>
                    <strong className={!answer ? "empty" : ""}>
                      {answer || "Aucune réponse"}
                    </strong>
                  </div>

                  {result ? (
                    <div
                      className={`game3-result ${
                        result.accepted ? "accepted" : "rejected"
                      }`}
                    >
                      <b>{result.accepted ? "✓ Acceptée" : "✕ Refusée"}</b>
                      <span>
                        {result.acceptedVotes} pour · {result.rejectedVotes} contre
                      </span>
                    </div>
                  ) : !answer ? (
                    <div className="game3-result neutral">
                      <span>Aucun point</span>
                    </div>
                  ) : isOwnGrid ? (
                    <div className="game3-vote-wait">Vote des joueurs…</div>
                  ) : (
                    <div className="game3-votes">
                      <button
                        className={`vote accept ${voted && myVotes[id] === "accept" ? "chosen" : ""}`}
                        disabled={voted}
                        onClick={() => vote(id, "accept")}
                        aria-label={`Accepter ${label}`}
                      >
                        ✓
                      </button>
                      <button
                        className={`vote reject ${voted && myVotes[id] === "reject" ? "chosen" : ""}`}
                        disabled={voted}
                        onClick={() => vote(id, "reject")}
                        aria-label={`Refuser ${label}`}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          <div className="game3-navigation">
            {isHost ? (
              <>
                <button
                  className="primary purple game3-nav-button"
                  disabled={isFirst}
                  onClick={() => navigate("previous")}
                >
                  ← Joueur précédent
                </button>

                <div className="game3-navigation-info">
                  <strong>
                    Joueur {game.reviewIndex + 1} / {game.reviewTotal}
                  </strong>
                  <span>
                    {isLast
                      ? "Termine la correction et affiche le classement."
                      : "Tu peux revenir sur un joueur déjà jugé."}
                  </span>
                </div>

                <button
                  className="primary purple game3-nav-button"
                  onClick={() => navigate("next")}
                >
                  {isLast ? "Afficher le classement" : "Joueur suivant"} <span>→</span>
                </button>
              </>
            ) : (
              <div className="game3-navigation-info game3-navigation-center">
                <strong>
                  Correction de {currentPlayer?.pseudo ?? "Joueur"}
                </strong>
                <span>
                  L'hôte décide quand passer au joueur suivant.
                </span>
              </div>
            )}
          </div>
        </section>

        {error && <div className="toast">{error}</div>}
      </main>
    );
  }

  return (
    <main className="game3-page">
      <section className="game3-shell">
        <header className="game3-header">
          <div>
            <p className="eyebrow">Petit Bac · Phase de réponse</p>
            <h1>
              Trouve des réponses en <span>{game.letter}</span>
            </h1>
            <p className="game3-subtitle">
              Remplis les catégories avant la fin du temps.
            </p>
          </div>

          <div
            className={`game3-timer ${remaining <= 10 ? "danger" : ""} ${
              submitted ? "submitted" : ""
            }`}
          >
            <small>{submitted ? "Réponses envoyées" : "Temps restant"}</small>
            {!submitted && <strong>{remaining}s</strong>}
            {submitted && <strong>✓</strong>}
          </div>
        </header>

        <div className="game3-letter-panel">
          <span>Lettre</span>
          <strong>{game.letter}</strong>
          <small>
            {submitted
              ? "Tu peux attendre la fin du temps."
              : "Les réponses peuvent être modifiées avant validation."}
          </small>
        </div>

        <div className="game3-form">
          {PETIT_BAC_CATEGORIES.map(([id, label]) => (
            <label className="game3-field" key={id}>
              <span>{label}</span>
              <input
                value={answers[id] ?? ""}
                disabled={submitted || remaining === 0}
                onChange={(event) =>
                  setAnswers((previous) => ({
                    ...previous,
                    [id]: event.target.value,
                  }))
                }
                maxLength={100}
                placeholder={`Réponse en ${game.letter}`}
              />
            </label>
          ))}
        </div>

        <div className="game3-actions">
          <span>
            {submitted
              ? "Réponses enregistrées."
              : "Tu peux valider une fois que tu as terminé."}
          </span>
          <button
            className="primary purple"
            disabled={submitted || remaining === 0}
            onClick={submit}
          >
            {submitted ? "Réponses envoyées" : "Valider mes réponses"}
            <span>→</span>
          </button>
        </div>
      </section>

      {error && <div className="toast">{error}</div>}
    </main>
  );
}
