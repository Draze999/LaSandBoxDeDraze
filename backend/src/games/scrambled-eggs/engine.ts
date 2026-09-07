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
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++differences > 1) return false;
    return true;
  }
  const shorter = a.length < b.length ? a : b, longer = a.length < b.length ? b : a;
  let i = 0, j = 0, differences = 0;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) { i++; j++; }
    else { if (++differences > 1) return false; j++; }
  }
  return true;
}
function scramble(name: string) {
  const chars = [...name].filter(c => c !== " ");
  const original = chars.join("");
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = shuffle([...chars]).join("");
    if (result !== original || chars.length < 2) return result;
  }
  return chars.reverse().join("");
}

export class ScrambledEggsEngine {
  private states = new Map<string, ScrambledEggsState>();
  private cumulative = new Map<string, Record<string, number>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], category: ScrambledEggsCategory, timeLimit: number, totalRounds = 1) {
    if (playerIds.length < 2) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };
    return this.beginRound(roomCode, playerIds, category, timeLimit, Math.max(1, Math.min(10, totalRounds)));
  }

  private async beginRound(roomCode: string, playerIds: string[], category: ScrambledEggsCategory, timeLimit: number, totalRounds: number) {
    const row = category === "anime" ? await getRandomAnime() : await getRandomCharacter();
    if (!row?.name) return { ok: false as const, error: "NO_CONTENT" };
    const old = this.states.get(roomCode);
    const original = String(row.name);
    const seconds = timeLimit >= 30 && timeLimit <= 300 ? timeLimit : 301;
    const endsAt = seconds > 300 ? null : Date.now() + seconds * 1000;
    const previousTimer = this.timers.get(roomCode);
    if (previousTimer) clearTimeout(previousTimer);
    const state: ScrambledEggsState = {
      category, original, scrambled: scramble(original),
      spaceCount: (original.match(/ /g) ?? []).length,
      phase: "playing", endsAt, guesses: [],
      proposalCounts: Object.fromEntries(playerIds.map(id => [id, 0])),
      winnerId: null, winnerScore: 0,
      roundNumber: (old?.roundNumber ?? 0) + 1,
      totalRounds,
      timeLimit: seconds,
      cumulativeScores: this.cumulative.get(roomCode) ?? Object.fromEntries(playerIds.map(id => [id, 0])),
    };
    this.states.set(roomCode, state);
    if (endsAt !== null) this.timers.set(roomCode, setTimeout(() => this.finishRound(roomCode), seconds * 1000));
    this.onState(roomCode);
    return { ok: true as const };
  }

  get(code: string) { return this.states.get(code); }

  private finishRound(code: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return;
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
    if (state.roundNumber >= state.totalRounds) {
      state.phase = "finished";
      state.endsAt = null;
      this.onState(code);
      return;
    }
    state.phase = "between";
    state.endsAt = null;
    this.onState(code);
    const playerIds = Object.keys(state.proposalCounts);
    setTimeout(() => {
      const current = this.states.get(code);
      if (!current || current !== state || current.phase !== "between") return;
      void this.beginRound(code, playerIds, state.category, state.timeLimit, state.totalRounds).catch(error => {
        console.error(`[SCRAMBLED-EGGS][${code}] Erreur manche suivante`, error);
        this.clear(code);
      });
    }, 1800);
  }

  guess(code: string, playerId: string, text: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (state.endsAt !== null && Date.now() >= state.endsAt) { this.finishRound(code); return { ok: false as const, error: "TIME_OVER" }; }
    if (!Object.hasOwn(state.proposalCounts, playerId)) return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    const proposal = text.trim();
    if (!proposal) return { ok: false as const, error: "EMPTY_GUESS" };
    const currentCount = state.proposalCounts[playerId] ?? 0;
    const minCount = Math.min(...Object.values(state.proposalCounts));
    if (currentCount > minCount) return { ok: false as const, error: "WAIT_FOR_OTHERS" };
    const correct = editDistanceAtMostOne(normalize(proposal), normalize(state.original));
    state.proposalCounts[playerId] = currentCount + 1;
    state.guesses.unshift({ id: randomUUID(), authorId: playerId, text: proposal.slice(0, 120), correct });
    if (correct) {
      state.winnerId = playerId;
      state.winnerScore = Math.max(1, [...state.original].filter(c => c !== " ").length - 5);
      const scores = this.cumulative.get(code) ?? Object.fromEntries(Object.keys(state.proposalCounts).map(id => [id, 0]));
      scores[playerId] = (scores[playerId] ?? 0) + state.winnerScore;
      this.cumulative.set(code, scores);
      state.cumulativeScores = scores;
      this.finishRound(code);
    } else this.onState(code);
    return { ok: true as const, correct, finished: state.phase !== "playing", score: correct ? state.winnerScore : 0 };
  }

  snapshot(code: string, playerId: string): ScrambledEggsSnapshot | null {
    const state = this.states.get(code);
    if (!state) return null;
    return {
      ...state,
      original: state.phase !== "playing" ? state.original : null,
      canGuess: state.phase === "playing" && (state.proposalCounts[playerId] ?? 0) <= Math.min(...Object.values(state.proposalCounts)),
      playerId,
    };
  }
  score(code: string) { return this.cumulative.get(code) ?? {}; }
  clear(code: string) {
    const timer = this.timers.get(code); if (timer) clearTimeout(timer);
    this.timers.delete(code); this.states.delete(code); this.cumulative.delete(code);
  }
  removePlayer(code: string, playerId: string) {
    const state = this.states.get(code); if (!state) return;
    delete state.proposalCounts[playerId];
    if (!Object.keys(state.proposalCounts).length) this.clear(code); else this.onState(code);
  }
}
