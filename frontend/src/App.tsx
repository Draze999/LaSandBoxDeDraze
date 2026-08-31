import { FormEvent, useEffect, useRef, useState } from "react";
import { socket } from "./socket";
import PetitBac from "./games/petit-bac/PetitBac";
import TheOuCafe from "./games/the-ou-cafe/TheOuCafe";
import FauxFan from "./games/faux-fan/FauxFan";
import Tierlists from "./games/tierlists/Tierlists";

type Game = {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
};
type Player = { id: string; pseudo: string; isHost: boolean };
type Room = {
  code: string;
  gameId: string;
  hostId: string;
  settings: { name: string; maxPlayers: number; private: boolean; gameSettings?: { timeLimit?: number; theOuCafeCategory?: "anime" | "character"; fauxFanCategory?: "anime" | "character"; tierlistCategory?: "anime" | "character"; tierlistItemCount?: number } };
  players: Player[];
};

const games: Game[] = [
  {
    id: "game-1",
    name: "Thé ou Café",
    description: "Plutôt Rapide ou Efficace ?",
    color: "#3d8b78",
    icon: "🍵",
  },
  {
    id: "game-2",
    name: "Le Faux Fan",
    description: "Est-ce possible de tromper tes amis ?",
    color: "#4e78c8",
    icon: "🎭",
  },
  {
    id: "game-3",
    name: "Petit Bac",
    description: "Qui aura le plus de points ?",
    color: "#8b3d3d",
    icon: "📝",
  },
  {
    id: "game-4",
    name: "Les Tierlists",
    description: "Ce jeu lancera t-il un débat ?",
    color: "#9a7042",
    icon: "📋",
  },
];

function Background() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current!,
      x = c.getContext("2d")!;
    let w = 0,
      h = 0,
      raf = 0;
    let ps: { x: number; y: number; vx: number; vy: number }[] = [];
    const resize = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth;
      h = innerHeight;
      c.width = w * d;
      c.height = h * d;
      c.style.width = w + "px";
      c.style.height = h + "px";
      x.setTransform(d, 0, 0, d, 0, 0);
      const n = Math.min(75, Math.max(35, Math.floor((w * h) / 17000)));
      ps = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12,
        vy: (Math.random() - 0.5) * 0.12,
      }));
    };
    const draw = () => {
      x.clearRect(0, 0, w, h);
      for (const p of ps) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -20 || p.x > w + 20) p.vx *= -1;
        if (p.y < -20 || p.y > h + 20) p.vy *= -1;
      }
      for (let i = 0; i < ps.length; i++)
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i],
            b = ps[j],
            d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 200) {
            x.strokeStyle = `rgba(145,158,190,${Math.min(0.75, (1 - d / 200) * 0.075)})`;
            x.lineWidth = 2.5;
            x.beginPath();
            x.moveTo(a.x, a.y);
            x.lineTo(b.x, b.y);
            x.stroke();
          }
        }
      for (const p of ps) {
        x.fillStyle = "rgba(170,184,215,.30)";
        x.beginPath();
        x.arc(p.x, p.y, 3.0, 0, Math.PI * 2);
        x.fill();
      }
      raf = requestAnimationFrame(draw);
    };
    resize();
    addEventListener("resize", resize);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
    };
  }, []);
  return <canvas className="background" ref={ref} />;
}

export default function App() {
  const [createPseudo, setCreatePseudo] = useState(""),
    [joinPseudo, setJoinPseudo] = useState(""),
    [code, setCode] = useState(""),
    [selectedGame, setSelectedGame] = useState("game-1"),
    [room, setRoom] = useState<Room | null>(null),
    [playerId, setPlayerId] = useState(""),
    [error, setError] = useState(""),
    [started, setStarted] = useState(false);
  useEffect(() => {
    const updated = (r: Room) => setRoom(r);
    const start = () => setStarted(true);
    const startGame3 = () => setStarted(true);
    const startGame1 = () => setStarted(true);
    const startGame2 = () => setStarted(true);
    const startGame4 = () => setStarted(true);
    socket.on("room:updated", updated);
    socket.on("game:start", start);
    socket.on("game3:start", startGame3);
    socket.on("game1:start", startGame1);
    socket.on("game2:start", startGame2);
    socket.on("game4:start", startGame4);
    return () => {
      socket.off("room:updated", updated);
      socket.off("game:start", start);
      socket.off("game3:start", startGame3);
      socket.off("game1:start", startGame1);
      socket.off("game2:start", startGame2);
      socket.off("game4:start", startGame4);
    };
  }, []);
  const connect = () => {
    if (!socket.connected) socket.connect();
  };
  const create = (e: FormEvent) => {
    e.preventDefault();
    if (!createPseudo.trim()) return setError("Choisis un pseudo.");
    setError("");
    connect();
    socket.emit(
      "room:create",
      {
        pseudo: createPseudo,
        gameId: selectedGame,
        settings: { name: "Ma partie", maxPlayers: 8, private: true, gameSettings: { timeLimit: 60, fauxFanCategory: "anime", tierlistCategory: "anime", tierlistItemCount: 10 } },
      },
      (r: any) => {
        if (!r?.ok) return setError(r?.error ?? "Erreur");
        setPlayerId(r.playerId);
        setRoom(r.room);
      },
    );
  };
  const join = (e: FormEvent) => {
    e.preventDefault();
    if (!joinPseudo.trim()) return setError("Choisis un pseudo.");
    if (code.length !== 5)
      return setError("Le code doit contenir 5 caractères.");
    setError("");
    connect();
    socket.emit("room:join", { pseudo: joinPseudo, code }, (r: any) => {
      if (!r?.ok)
        return setError(
          r?.error === "ROOM_NOT_FOUND"
            ? "Room introuvable."
            : r?.error === "ROOM_FULL"
              ? "Room pleine."
              : "Impossible de rejoindre.",
        );
      setPlayerId(r.playerId);
      setRoom(r.room);
    });
  };
  const update = (patch: any) =>
    socket.emit("room:update-settings", patch, (r: any) => {
      if (!r?.ok) setError("Impossible de modifier les paramètres.");
    });
  if (room && room.gameId === "game-1" && started)
    return (
      <div className="app">
        <Background />
        <main className="room-page">
          <header className="topbar">
            <button className="brand" onClick={() => setStarted(false)}>
              <span className="brand-mark">A</span> L'Atelier de Draze
            </button>
            <span className="status"><i /> Partie en cours</span>
          </header>
          <TheOuCafe room={room} playerId={playerId} onExit={() => setStarted(false)} />
        </main>
      </div>
    );

  if (room && room.gameId === "game-2" && started)
    return (
      <div className="app">
        <Background />
        <main className="room-page">
          <header className="topbar">
            <button className="brand" onClick={() => setStarted(false)}>
              <span className="brand-mark">A</span> L'Atelier de Draze
            </button>
            <span className="status"><i /> Partie en cours</span>
          </header>
          <FauxFan room={room} playerId={playerId} onExit={() => setStarted(false)} />
        </main>
      </div>
    );

  if (room && room.gameId === "game-4" && started)
    return (
      <div className="app">
        <Background />
        <main className="room-page">
          <header className="topbar">
            <button className="brand" onClick={() => setStarted(false)}>
              <span className="brand-mark">A</span> L'Atelier de Draze
            </button>
            <span className="status"><i /> Partie en cours</span>
          </header>
          <Tierlists room={room} playerId={playerId} onExit={() => setStarted(false)} />
        </main>
      </div>
    );

  if (room && room.gameId === "game-3" && started)
    return (
      <div className="app">
        <Background />
        <main className="room-page">
          <header className="topbar">
            <button
              className="brand"
              onClick={() => {
                setStarted(false);
              }}
            >
              <span className="brand-mark">A</span> L'Atelier de Draze
            </button>
            <span className="status">
              <i /> Partie en cours
            </span>
          </header>
          <PetitBac
            room={room}
            playerId={playerId}
            onExit={() => setStarted(false)}
          />
        </main>
      </div>
    );

  if (room)
    return (
      <div className="app">
        <Background />
        <main className="room-page">
          <header className="topbar">
            <button
              className="brand"
              onClick={() => {
                socket.disconnect();
                setRoom(null);
                setStarted(false);
              }}
            >
              <span className="brand-mark">A</span> L'Atelier de Draze
            </button>
            <span className="status">
              <i /> Connecté
            </span>
          </header>
          <section className="room-card">
            <p className="eyebrow">Salle de jeu</p>
            <h1>
              Room <span>{room.code}</span>
            </h1>
            <p className="muted">
              {room.settings.name} · {room.players.length}/
              {room.settings.maxPlayers} joueurs
            </p>
            <div className="room-grid">
              <div className="panel">
                <span className="panel-label">Joueurs</span>
                {room.players.map((p) => (
                  <div className="player" key={p.id}>
                    <span className="avatar">{p.pseudo[0].toUpperCase()}</span>
                    {p.pseudo}
                    {p.isHost && <b>HÔTE</b>}
                    {p.id === playerId && <b>VOUS</b>}
                  </div>
                ))}
                <div className="selected-game">
                  <span className="panel-label">Jeu</span>
                  {games.find((g) => g.id === room.gameId)?.name}
                </div>
              </div>
              <div className="panel settings">
                <span className="panel-label">Paramètres</span>
                <label>
                  Nom
                  <input
                    defaultValue={room.settings.name}
                    onBlur={(e) => {
                      if (room.hostId === playerId)
                        update({ name: e.target.value });
                    }}
                  />
                </label>
                <label>
                  Maximum
                  <select
                    defaultValue={room.settings.maxPlayers}
                    disabled={room.hostId !== playerId}
                    onChange={(e) =>
                      update({ maxPlayers: Number(e.target.value) })
                    }
                  >
                    {[2, 4, 6, 8, 12].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                {room.gameId === "game-1" && (
                  <label>
                    Type de contenu
                    <select
                      value={room.settings.gameSettings?.theOuCafeCategory ?? "anime"}
                      disabled={room.hostId !== playerId}
                      onChange={(e) =>
                        update({ gameSettings: { theOuCafeCategory: e.target.value } })
                      }
                    >
                      <option value="anime">Animé</option>
                      <option value="character">Personnage</option>
                    </select>
                  </label>
                )}
                {room.gameId === "game-2" && (
                  <label>
                    Type de contenu
                    <select
                      value={room.settings.gameSettings?.fauxFanCategory ?? "anime"}
                      disabled={room.hostId !== playerId}
                      onChange={(e) =>
                        update({ gameSettings: { fauxFanCategory: e.target.value } })
                      }
                    >
                      <option value="anime">Animé</option>
                      <option value="character">Personnage</option>
                    </select>
                  </label>
                )}
                {room.gameId === "game-4" && (
                  <>
                    <label>
                      Type de contenu
                      <select
                        value={room.settings.gameSettings?.tierlistCategory ?? "anime"}
                        disabled={room.hostId !== playerId}
                        onChange={(e) => update({ gameSettings: { tierlistCategory: e.target.value } })}
                      >
                        <option value="anime">Animés</option>
                        <option value="character">Personnages</option>
                      </select>
                    </label>
                    <label>
                      Nombre d'éléments : <strong>{room.settings.gameSettings?.tierlistItemCount ?? 10}</strong>
                      <input
                        type="range" min={10} max={30} step={5}
                        value={room.settings.gameSettings?.tierlistItemCount ?? 10}
                        disabled={room.hostId !== playerId}
                        onChange={(e) => update({ gameSettings: { tierlistItemCount: Number(e.target.value) } })}
                        style={{ width: "100%" }}
                      />
                    </label>
                  </>
                )}
                {room.gameId === "game-3" && (
                  <label>
                    Temps du Petit Bac :{" "}
                    <strong>{room.settings.gameSettings?.timeLimit ?? 60}s</strong>

                    <input
                      type="range"
                      min={20}
                      max={240}
                      step={5}
                      value={room.settings.gameSettings?.timeLimit ?? 60}
                      disabled={room.hostId !== playerId}
                      onChange={(e) =>
                        update({
                          gameSettings: {
                            timeLimit: Number(e.target.value),
                          },
                        })
                      }
                      style={{ width: "100%" }}
                    />
                  </label>
                )}
                {room.hostId === playerId ? (
                  <button
                    className="primary purple"
                    onClick={() => socket.emit("room:start")}
                  >
                    Lancer la partie <span>→</span>
                  </button>
                ) : (
                  <p className="waiting">En attente du lancement par l'hôte…</p>
                )}
              </div>
            </div>
            {started && (
              <div className="started">
                La partie va commencer. Branche ton jeu dans le gestionnaire de
                lancement.
              </div>
            )}
          </section>
        </main>
      </div>
    );
  return (
    <div className="app">
      <Background />
      <main className="home">
        <header className="hero">
          <div className="brand">
            <span className="brand-mark">A</span> L'Atelier de Draze
          </div>
          <div className="hero-copy">
            <p className="eyebrow">Play together · simply</p>
            <h1>
              Crée une partie.
              <br />
              <span>Invite tes amis.</span>
            </h1>
            <p className="subtitle">
              Choisis un jeu, partage un code et lance ta partie en quelques
              secondes.
            </p>
          </div>
        </header>
        <section className="actions">
          <form className="card create-card" onSubmit={create}>
            <div className="card-head">
              <span className="step purple-bg">01</span>
              <div>
                <p className="eyebrow">Nouvelle partie</p>
                <h2>Créer une room</h2>
              </div>
            </div>
            <label>
              Pseudo <em>obligatoire</em>
              <input
                value={createPseudo}
                onChange={(e) => setCreatePseudo(e.target.value)}
                placeholder="Ton pseudo"
                maxLength={20}
              />
            </label>
            <div className="label-line">
              <span>Choisis un jeu</span>
              <span className="optional">4 disponibles</span>
            </div>
            <div className="games">
              {games.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className={`game-button ${selectedGame === g.id ? "selected" : ""}`}
                  style={{ "--game": g.color } as React.CSSProperties}
                  onClick={() => setSelectedGame(g.id)}
                >
                  <span className="game-icon">{g.icon}</span>
                  <span>
                    <strong>{g.name}</strong>
                    <small>{g.description}</small>
                  </span>
                  <i className="check">✓</i>
                </button>
              ))}
            </div>
            <button className="primary purple">
              Créer la room <span>→</span>
            </button>
          </form>
          <div className="divider">
            <span>ou</span>
          </div>
          <form className="card join-card" onSubmit={join}>
            <div className="card-head">
              <span className="step blue-bg">02</span>
              <div>
                <p className="eyebrow">Partie existante</p>
                <h2>Rejoindre une room</h2>
              </div>
            </div>
            <label>
              Pseudo <em>obligatoire</em>
              <input
                value={joinPseudo}
                onChange={(e) => setJoinPseudo(e.target.value)}
                placeholder="Ton pseudo"
                maxLength={20}
              />
            </label>
            <label>
              Code de la room <span className="optional">5 caractères</span>
              <input
                className="code-input"
                value={code}
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  )
                }
                placeholder="XXXXX"
                maxLength={5}
              />
            </label>
            <div className="join-space" />
            <button className="primary blue">
              Rejoindre la room <span>→</span>
            </button>
          </form>
        </section>
        {error && <div className="toast">{error}</div>}
        <footer>L'Atelier de Draze · connexion temps réel active</footer>
      </main>
    </div>
  );
}
