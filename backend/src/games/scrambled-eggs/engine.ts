import { randomInt, randomUUID } from "node:crypto";
import { getRandomAnime, getRandomCharacter } from "../../database/anime.js";
import type { ScrambledEggsCategory } from "./constants.js";
import type { ScrambledEggsSnapshot, ScrambledEggsState } from "./types.js";

type Callback = (roomCode: string) => void;

function shuffle<T>(items: T[]) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function normalize(text: string) {
  return text.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function editDistanceAtMostOne(a: string, b: string) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;

  if (a.length === b.length) {
    let differences = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i] && ++differences > 1) return false;
    }
    return true;
  }

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let differences = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else {
      if (++differences > 1) return false;
      j++;
    }
  }
  return true;
}

function scramble(name: string) {
  const chars = [...name].filter((char) => char !== " ");
  // Try to avoid returning the exact same sequence when there is more than one
  // character, while keeping the operation random.
  const original = chars.join("");
  for (let attempt = 0; attempt < 8; attempt++) {
    const result = shuffle([...chars]).join("");
    if (result !== original || chars.length < 2) return result;
  }
  return chars.reverse().join("");
}

export class ScrambledEggsEngine {
  private states = new Map<string, ScrambledEggsState>();
  private cumulative = new Map<string, number>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], category: ScrambledEggsCategory, timeLimit: number) {
    if (playerIds.length < 2) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };

    const row = category === "anime" ? await getRandomAnime() : await getRandomCharacter();
    if (!row?.name) return { ok: false as const, error: "NO_CONTENT" };

    const original = String(row.name);
    const spaceCount = (original.match(/ /g) ?? []).length;
    const seconds = timeLimit >= 30 && timeLimit <= 300 ? timeLimit : 301;
    const endsAt = seconds > 300 ? null : Date.now() + seconds * 1000;

    const oldTimer = this.timers.get(roomCode);
    if (oldTimer) clearTimeout(oldTimer);

    const state: ScrambledEggsState = {
      category,
      original,
      scrambled: scramble(original),
      spaceCount,
      phase: "playing",
      endsAt,
      guesses: [],
      proposalCounts: Object.fromEntries(playerIds.map((id) => [id, 0])),
      winnerId: null,
      winnerScore: 0,
      roundNumber: (this.states.get(roomCode)?.roundNumber ?? 0) + 1,
    };

    this.states.set(roomCode, state);
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
    if (state.endsAt !== null && Date.now() >= state.endsAt) {
      this.finish(code);
      return { ok: false as const, error: "TIME_OVER" };
    }
    if (!state.proposalCounts[playerId] && !Object.hasOwn(state.proposalCounts, playerId)) {
      return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    }

    const proposal = text.trim();
    if (!proposal) return { ok: false as const, error: "EMPTY_GUESS" };

    const currentCount = state.proposalCounts[playerId] ?? 0;
    const minCount = Math.min(...Object.values(state.proposalCounts));
    if (currentCount > minCount) return { ok: false as const, error: "WAIT_FOR_OTHERS" };

    const correct = editDistanceAtMostOne(normalize(proposal), normalize(state.original));
    state.proposalCounts[playerId] = currentCount + 1;
    state.guesses.unshift({ id: randomUUID(), authorId: playerId, text: proposal.slice(0, 120), correct });

    if (correct) {
      state.phase = "finished";
      state.winnerId = playerId;
      state.winnerScore = Math.max(1, [...state.original].filter((c) => c !== " ").length - 5);
      this.cumulative.set(code, (this.cumulative.get(code) ?? 0) + state.winnerScore);
      const timer = this.timers.get(code);
      if (timer) clearTimeout(timer);
      this.timers.delete(code);
    }

    this.onState(code);
    return { ok: true as const, correct, finished: state.phase === "finished", score: correct ? state.winnerScore : 0 };
  }

  snapshot(code: string, playerId: string): ScrambledEggsSnapshot | null {
    const state = this.states.get(code);
    if (!state) return null;
    return {
      ...state,
      original: state.phase === "finished" ? state.original : null,
      canGuess: state.phase === "playing" && (
        (state.proposalCounts[playerId] ?? 0) <= Math.min(...Object.values(state.proposalCounts))
      ),
      playerId,
    };
  }

  score(code: string) {
    return this.cumulative.get(code) ?? 0;
  }

  clear(code: string) {
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
    this.states.delete(code);
    this.cumulative.delete(code);
  }

  removePlayer(code: string, playerId: string) {
    const state = this.states.get(code);
    if (!state) return;
    delete state.proposalCounts[playerId];
    if (!Object.keys(state.proposalCounts).length) this.clear(code);
    else this.onState(code);
  }
}
