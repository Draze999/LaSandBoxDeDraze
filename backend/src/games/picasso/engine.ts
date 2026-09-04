import sharp from "sharp";
import { getRandomAnime, getRandomCharacter } from "../../database/anime.js";
import { randomInt } from "node:crypto";
import { PICASSO_FILTERS } from "./filters/index.js";
import type { PicassoCategory, PicassoSnapshot } from "./types.js";

type State = {
  category: PicassoCategory;
  original: string;
  imageDataUrl: string;
  phase: "playing" | "finished";
  endsAt: number | null;
  winnerId: string | null;
  winnerScore: number;
  abandonedIds: Set<string>;
  playerIds: Set<string>;
  roundNumber: number;
};

type Callback = (roomCode: string) => void;

export class PicassoEngine {
  private states = new Map<string, State>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private cumulative = new Map<string, number>();

  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], category: PicassoCategory, timeLimit: number) {
    if (playerIds.length < 2) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };

    const row = category === "anime" ? await getRandomAnime() : await getRandomCharacter();
    if (!row?.name || !row?.image_url) return { ok: false as const, error: "NO_CONTENT" };

    const originalImage = await fetchImage(String(row.image_url));
    const selected = chooseFilters(3);

    console.log(
      `[PICASSO][${roomCode}] Filtres sélectionnés : ${selected.map((filter) => `${filter.id} (${filter.name})`).join(" | ")}`
    );

    let image = sharp(originalImage).rotate().resize(720, 720, { fit: "inside", withoutEnlargement: true });

    for (const filter of selected) {
      console.log(`[PICASSO][${roomCode}] Application du filtre : ${filter.id} (${filter.name})`);
      try {
        image = await filter.apply(image);
        console.log(`[PICASSO][${roomCode}] Filtre OK : ${filter.id} (${filter.name})`);
      } catch (error) {
        console.error(`[PICASSO][${roomCode}] ERREUR filtre : ${filter.id} (${filter.name})`, error);
        throw error;
      }
    }

    console.log(`[PICASSO][${roomCode}] Génération de l'image finale...`);
    const output = await image.webp({ quality: 68 }).toBuffer();
    console.log(`[PICASSO][${roomCode}] Image finale générée avec succès.`);
    const seconds = timeLimit >= 30 && timeLimit <= 300 ? timeLimit : 301;
    const endsAt = seconds > 300 ? null : Date.now() + seconds * 1000;

    const previous = this.timers.get(roomCode);
    if (previous) clearTimeout(previous);

    this.states.set(roomCode, {
      category,
      original: String(row.name),
      imageDataUrl: `data:image/webp;base64,${output.toString("base64")}`,
      phase: "playing",
      endsAt,
      winnerId: null,
      winnerScore: 0,
      abandonedIds: new Set(),
      playerIds: new Set(playerIds),
      roundNumber: (this.states.get(roomCode)?.roundNumber ?? 0) + 1,
    });

    if (endsAt !== null) {
      this.timers.set(roomCode, setTimeout(() => this.finish(roomCode), seconds * 1000));
    }
    this.onState(roomCode);
    return { ok: true as const };
  }

  get(code: string) {
    return this.states.get(code);
  }

  private finish(code: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return;
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
    state.phase = "finished";
    state.endsAt = null;
    this.onState(code);
  }

  guess(code: string, playerId: string, text: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (state.abandonedIds.has(playerId)) return { ok: false as const, error: "ABANDONED" };
    if (state.endsAt !== null && Date.now() >= state.endsAt) {
      this.finish(code);
      return { ok: false as const, error: "TIME_OVER" };
    }
    const guess = text.trim();
    if (!guess) return { ok: false as const, error: "EMPTY_GUESS" };
    if (normalize(guess) === normalize(state.original)) {
      state.phase = "finished";
      state.winnerId = playerId;
      state.winnerScore = 1;
      this.cumulative.set(code, (this.cumulative.get(code) ?? 0) + 1);
      const timer = this.timers.get(code);
      if (timer) clearTimeout(timer);
      this.timers.delete(code);
      this.onState(code);
      return { ok: true as const, correct: true, finished: true, score: 1 };
    }
    this.onState(code);
    return { ok: true as const, correct: false, finished: false, score: 0 };
  }

  abandon(code: string, playerId: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    state.abandonedIds.add(playerId);
    if (state.playerIds.size > 0 && state.abandonedIds.size >= state.playerIds.size) {
      this.finish(code);
      return { ok: true as const, finished: true };
    }
    this.onState(code);
    return { ok: true as const, finished: false };
  }

  snapshot(code: string, playerId: string): PicassoSnapshot | null {
    const state = this.states.get(code);
    if (!state) return null;
    return {
      category: state.category,
      imageDataUrl: state.imageDataUrl,
      original: state.phase === "finished" ? state.original : null,
      phase: state.phase,
      endsAt: state.endsAt,
      winnerId: state.winnerId,
      winnerScore: state.winnerScore,
      abandonedIds: [...state.abandonedIds],
      playerId,
    };
  }

  removePlayer(code: string, playerId: string) {
    const state = this.states.get(code);
    if (!state) return;
    state.playerIds.delete(playerId);
    state.abandonedIds.delete(playerId);
    if (state.phase === "playing" && state.playerIds.size > 0 && state.abandonedIds.size >= state.playerIds.size) {
      this.finish(code);
    } else {
      this.onState(code);
    }
  }

  clear(code: string) {
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
    this.states.delete(code);
    this.cumulative.delete(code);
  }
}

async function fetchImage(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Impossible de récupérer l'image (${response.status}).`);
  return Buffer.from(await response.arrayBuffer());
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function chooseFilters(count: number) {
  const pool = [...PICASSO_FILTERS];
  const chosen = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const index = randomInt(pool.length);
    chosen.push(pool.splice(index, 1)[0]);
  }
  return chosen;
}
