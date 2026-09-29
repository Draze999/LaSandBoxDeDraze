import { getAllAnime } from "../../database/anime.js";
import type { ChronologieAnime, ChronologieSnapshot, ChronologieState } from "./types.js";

type Callback = (roomCode: string) => void;

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const SEASON_ORDER: Record<string, number> = { Winter: 0, Spring: 1, Summer: 2, Fall: 3 };

function seasonKey(value: string) {
  const match = /^\s*(Winter|Spring|Summer|Fall)\s+(\d{4})\s*$/i.exec(value);
  if (!match) return null;
  const season = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
  const year = Number(match[2]);
  const order = SEASON_ORDER[season];
  return Number.isFinite(year) && order !== undefined ? year * 4 + order : null;
}

function scoreOrder(order: number[], animeById: Map<number, ChronologieAnime>) {
  let score = 0;
  for (let i = 0; i < order.length - 1; i++) {
    const a = seasonKey(animeById.get(order[i])?.season ?? "");
    const b = seasonKey(animeById.get(order[i + 1])?.season ?? "");
    if (a !== null && b !== null && a < b) score++;
  }
  return score;
}

export class ChronologieEngine {
  private states = new Map<string, ChronologieState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], durationSeconds = 45, itemCount = 8) {
    if (playerIds.length < 1) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };

    this.clear(roomCode);
    const duration = Math.max(30, Math.min(60, Math.floor(durationSeconds)));
    const count = Math.max(5, Math.min(12, Math.floor(itemCount)));
    const all = (await getAllAnime()) as ChronologieAnime[];

    // Only entries with a usable season can participate. One anime is selected
    // per season, which guarantees no duplicate season and no duplicate anime.
    const groups = new Map<number, ChronologieAnime[]>();
    for (const anime of all) {
      const key = seasonKey(anime.season);
      if (key === null) continue;
      const list = groups.get(key) ?? [];
      list.push(anime);
      groups.set(key, list);
    }

    const availableKeys = shuffle([...groups.keys()]);
    if (availableKeys.length < count) return { ok: false as const, error: "NOT_ENOUGH_ANIME" };

    const selected = availableKeys.slice(0, count).map((key) => {
      const options = groups.get(key)!;
      return options[Math.floor(Math.random() * options.length)];
    });
    const trueOrder = [...selected].sort((a, b) => (seasonKey(a.season)! - seasonKey(b.season)!)).map((a) => a.id);
    const initial = shuffle(selected).map((a) => a.id);
    const proposals = Object.fromEntries(playerIds.map((id) => [id, { playerId: id, order: [...initial], score: null }]));

    const state: ChronologieState = {
      phase: "playing",
      endsAt: Date.now() + duration * 1000,
      anime: selected,
      trueOrder,
      proposals,
    };
    this.states.set(roomCode, state);
    this.timers.set(roomCode, setTimeout(() => this.finish(roomCode), duration * 1000));
    this.onState(roomCode);
    return { ok: true as const };
  }

  get(code: string) {
    return this.states.get(code);
  }

  reorder(code: string, playerId: string, order: number[]) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (!state.proposals[playerId]) return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    if (state.endsAt !== null && Date.now() >= state.endsAt) {
      this.finish(code);
      return { ok: false as const, error: "TIME_OVER" };
    }
    const validIds = new Set(state.anime.map((a) => a.id));
    if (order.length !== state.anime.length || new Set(order).size !== state.anime.length || order.some((id) => !validIds.has(id))) {
      return { ok: false as const, error: "INVALID_ORDER" };
    }
    state.proposals[playerId].order = [...order];
    this.onState(code);
    return { ok: true as const };
  }

  finish(code: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return;
    const byId = new Map(state.anime.map((a) => [a.id, a]));
    for (const proposal of Object.values(state.proposals)) {
      proposal.score = scoreOrder(proposal.order, byId);
    }
    state.phase = "finished";
    state.endsAt = null;
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
    this.onState(code);
  }

  snapshot(code: string, playerId: string): ChronologieSnapshot | null {
    const state = this.states.get(code);
    if (!state) return null;
    const own = state.proposals[playerId]?.order ?? [];
    return {
      phase: state.phase,
      endsAt: state.endsAt,
      anime: state.anime,
      trueOrder: state.phase === "finished" ? state.trueOrder : null,
      ownOrder: own,
      proposals: state.phase === "finished" ? state.proposals : null,
      playerId,
    };
  }

  clear(code: string) {
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
    this.states.delete(code);
  }

  removePlayer(code: string, playerId: string) {
    const state = this.states.get(code);
    if (!state) return;
    delete state.proposals[playerId];
    if (Object.keys(state.proposals).length === 0) this.clear(code);
    else this.onState(code);
  }
}
