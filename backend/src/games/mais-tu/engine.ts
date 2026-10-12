import { randomUUID } from "node:crypto";
import { getAllCharacters, getRandomCharacter } from "../../database/anime.js";
import type { MaisTuCharacter, MaisTuSnapshot, MaisTuState } from "./types.js";

type Callback = (roomCode: string) => void;
const WRITING_MS = 90_000;
const VOTING_MS = 35_000;
const RESULTS_MS = 4_500;

export class MaisTuEngine {
  private states = new Map<string, MaisTuState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], totalRounds = 5) {
    if (playerIds.length < 2) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };
    this.clear(roomCode);
    const rounds = Math.max(1, Math.min(10, Math.floor(totalRounds)));
    const state: MaisTuState = {
      phase: "writing", character: { id: 0, name: "", image_url: null, image_small_url: null },
      endsAt: null, roundNumber: 1, totalRounds: rounds, playerIds: [...playerIds],
      submissions: {}, answerIds: {}, votes: {}, roundVotes: {}, bonusIds: [],
      cumulativeScores: Object.fromEntries(playerIds.map((id) => [id, 0])), usedCharacterIds: [],
    };
    this.states.set(roomCode, state);
    return this.startRound(roomCode);
  }

  get(code: string) { return this.states.get(code); }

  private async startRound(code: string) {
    const state = this.states.get(code);
    if (!state) return { ok: false as const, error: "GAME_NOT_FOUND" };
    try {
      let character: any = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        const candidate = await getRandomCharacter();
        // Certaines configurations Supabase peuvent renvoyer un résultat vide
        // via la RPC même si la table characters contient des entrées.
        if (!candidate?.name) continue;
        character = candidate;
        if (!state.usedCharacterIds.includes(Number(candidate.id))) break;
      }
      if (!character?.name) {
        const fallbackCharacters = await getAllCharacters();
        const usable = fallbackCharacters.filter((item: any) => item?.name);
        if (usable.length) {
          const unused = usable.filter((item: any) => !state.usedCharacterIds.includes(Number(item.id)));
          const pool = unused.length ? unused : usable;
          character = pool[Math.floor(Math.random() * pool.length)];
        }
      }
      if (!character?.name) { this.clear(code); return { ok: false as const, error: "NO_CONTENT" }; }
      state.character = {
        id: Number(character.id), name: String(character.name),
        image_url: character.image_url ?? null, image_small_url: character.image_small_url ?? null,
      } satisfies MaisTuCharacter;
      state.usedCharacterIds.push(state.character.id);
      state.phase = "writing";
      state.endsAt = Date.now() + WRITING_MS;
      state.submissions = {};
      state.answerIds = {};
      state.votes = {};
      state.roundVotes = {};
      state.bonusIds = [];
      this.schedule(code, WRITING_MS, () => this.beginVoting(code));
      this.onState(code);
      return { ok: true as const };
    } catch (error) {
      console.error(`[MAIS-TU][${code}] Impossible de charger un personnage`, error);
      this.clear(code);
      return { ok: false as const, error: "CONTENT_LOAD_FAILED" };
    }
  }

  submit(code: string, playerId: string, text: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "writing") return { ok: false as const, error: "NOT_WRITING" };
    if (!state.playerIds.includes(playerId)) return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    if (state.submissions[playerId]) return { ok: false as const, error: "ALREADY_SUBMITTED" };
    if (state.endsAt !== null && Date.now() >= state.endsAt) { this.beginVoting(code); return { ok: false as const, error: "TIME_OVER" }; }
    const answer = text.trim();
    if (!answer) return { ok: false as const, error: "EMPTY_ANSWER" };
    state.submissions[playerId] = answer.slice(0, 180);
    state.answerIds[playerId] = randomUUID();
    if (Object.keys(state.submissions).length >= state.playerIds.length) this.beginVoting(code);
    else this.onState(code);
    return { ok: true as const };
  }

  vote(code: string, playerId: string, answerId: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "voting") return { ok: false as const, error: "NOT_VOTING" };
    if (!state.playerIds.includes(playerId)) return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    if (state.votes[playerId]) return { ok: false as const, error: "ALREADY_VOTED" };
    const authorId = Object.keys(state.answerIds).find((id) => state.answerIds[id] === answerId);
    if (!authorId) return { ok: false as const, error: "ANSWER_NOT_FOUND" };
    if (authorId === playerId) return { ok: false as const, error: "OWN_ANSWER" };
    state.votes[playerId] = answerId;
    if (this.eligibleVoters(state).every((id) => Boolean(state.votes[id]))) this.finishVoting(code);
    else this.onState(code);
    return { ok: true as const };
  }

  private eligibleVoters(state: MaisTuState) {
    return state.playerIds.filter((voterId) => Object.keys(state.answerIds).some((authorId) => authorId !== voterId));
  }

  private beginVoting(code: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "writing") return;
    this.clearTimer(code);
    if (Object.keys(state.submissions).length === 0) { this.finishRound(code); return; }
    state.phase = "voting";
    state.endsAt = Date.now() + VOTING_MS;
    this.schedule(code, VOTING_MS, () => this.finishVoting(code));
    if (this.eligibleVoters(state).length === 0) this.finishVoting(code);
    else this.onState(code);
  }

  private finishVoting(code: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "voting") return;
    this.clearTimer(code);
    state.roundVotes = Object.fromEntries(Object.keys(state.submissions).map((id) => [id, 0]));
    for (const answerId of Object.values(state.votes)) {
      const authorId = Object.keys(state.answerIds).find((id) => state.answerIds[id] === answerId);
      if (authorId) state.roundVotes[authorId] = (state.roundVotes[authorId] ?? 0) + 1;
    }
    for (const [authorId, count] of Object.entries(state.roundVotes)) {
      state.cumulativeScores[authorId] = (state.cumulativeScores[authorId] ?? 0) + count;
    }
    const highest = Math.max(0, ...Object.values(state.roundVotes));
    state.bonusIds = highest > 0 ? Object.entries(state.roundVotes).filter(([, count]) => count === highest).map(([id]) => id) : [];
    for (const id of state.bonusIds) state.cumulativeScores[id] = (state.cumulativeScores[id] ?? 0) + 1;
    this.finishRound(code);
  }

  private finishRound(code: string) {
    const state = this.states.get(code);
    if (!state) return;
    this.clearTimer(code);
    state.endsAt = null;
    if (state.roundNumber >= state.totalRounds) {
      state.phase = "finished";
      this.onState(code);
      return;
    }
    state.phase = "results";
    this.onState(code);
    this.schedule(code, RESULTS_MS, () => {
      const current = this.states.get(code);
      if (!current || current.phase !== "results") return;
      current.roundNumber++;
      void this.startRound(code);
    });
  }

  snapshot(code: string, playerId: string): MaisTuSnapshot | null {
    const state = this.states.get(code);
    if (!state) return null;
    const reveal = state.phase === "results" || state.phase === "finished";
    const answers = state.phase === "writing" ? [] : Object.keys(state.submissions).map((authorId) => ({
      id: state.answerIds[authorId], text: state.submissions[authorId], ...(reveal ? { playerId: authorId } : {}),
    }));
    return {
      phase: state.phase, character: state.character, endsAt: state.endsAt,
      roundNumber: state.roundNumber, totalRounds: state.totalRounds,
      submittedPlayerIds: Object.keys(state.submissions),
      ownSubmission: state.submissions[playerId] ?? null,
      ownAnswerId: state.answerIds[playerId] ?? null,
      answers, ownVoteId: state.votes[playerId] ?? null,
      voteCount: Object.keys(state.votes).length,
      roundVotes: reveal ? { ...state.roundVotes } : null,
      bonusIds: [...state.bonusIds], cumulativeScores: { ...state.cumulativeScores }, playerId,
    };
  }

  private schedule(code: string, ms: number, callback: () => void) {
    this.clearTimer(code);
    this.timers.set(code, setTimeout(() => { this.timers.delete(code); callback(); }, ms));
  }
  private clearTimer(code: string) { const timer = this.timers.get(code); if (timer) clearTimeout(timer); this.timers.delete(code); }
  clear(code: string) { this.clearTimer(code); this.states.delete(code); }
  removePlayer(code: string, playerId: string) {
    const state = this.states.get(code);
    if (!state) return;
    state.playerIds = state.playerIds.filter((id) => id !== playerId);
    delete state.submissions[playerId]; delete state.answerIds[playerId]; delete state.votes[playerId];
    if (!state.playerIds.length) this.clear(code);
    else this.onState(code);
  }
}
