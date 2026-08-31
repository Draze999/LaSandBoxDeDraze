import { randomInt } from "node:crypto";
import {
  PETIT_BAC_CATEGORIES,
  PETIT_BAC_LETTERS,
  type PetitBacCategory,
  type PetitBacTimeLimit,
} from "./constants.js";
import type {
  PetitBacAnswerMap,
  PetitBacCategoryResult,
  PetitBacSnapshot,
  PetitBacState,
  PetitBacVote,
} from "./types.js";

type EngineCallbacks = {
  onState: (roomCode: string) => void;
  onCategoryResult: (
    roomCode: string,
    payload: {
      playerId: string;
      category: PetitBacCategory;
      result: PetitBacCategoryResult;
    },
  ) => void;
};

function createEmptyAnswers(): PetitBacAnswerMap {
  return Object.fromEntries(
    PETIT_BAC_CATEGORIES.map(({ id }) => [id, ""]),
  ) as PetitBacAnswerMap;
}

function createPlayerState(playerId: string) {
  return {
    playerId,
    answers: createEmptyAnswers(),
    votes: Object.fromEntries(
      PETIT_BAC_CATEGORIES.map(({ id }) => [id, {}]),
    ) as Record<PetitBacCategory, Record<string, PetitBacVote>>,
    results: {},
  };
}

function randomLetter() {
  return PETIT_BAC_LETTERS[randomInt(PETIT_BAC_LETTERS.length)];
}

export class PetitBacEngine {
  private readonly states = new Map<string, PetitBacState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Score cumulé pendant toute la durée de vie de la room.
  // Il est volontairement stocké dans le moteur et n'est supprimé que lorsque
  // la room est supprimée / clear() est appelé.
  private readonly cumulativeScores = new Map<string, Record<string, number>>();
  private readonly roundScores = new Map<string, Record<string, number>>();

  constructor(private readonly callbacks: EngineCallbacks) {}

  start(roomCode: string, playerIds: string[], timeLimit: PetitBacTimeLimit) {
    this.clearGame(roomCode);

    const now = Date.now();
    const previousCumulative = this.cumulativeScores.get(roomCode) ?? {};
    const cumulative = Object.fromEntries(
      playerIds.map((id) => [id, previousCumulative[id] ?? 0]),
    );
    this.cumulativeScores.set(roomCode, cumulative);
    this.roundScores.set(roomCode, Object.fromEntries(playerIds.map((id) => [id, 0])));

    const state: PetitBacState = {
      letter: randomLetter(),
      timeLimit,
      phase: "playing",
      startedAt: now,
      endsAt: now + timeLimit * 1000,
      reviewIndex: 0,
      reviewOrder: [...playerIds],
      answers: new Map(playerIds.map((id) => [id, createPlayerState(id)])),
      scores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      advancing: false,
      submittedPlayers: Object.fromEntries(playerIds.map((id) => [id, false])),
    };

    this.states.set(roomCode, state);
    this.callbacks.onState(roomCode);

    this.timers.set(
      roomCode,
      setTimeout(() => this.startReview(roomCode), timeLimit * 1000 + 1200),
    );

    return state;
  }

  get(roomCode: string) {
    return this.states.get(roomCode);
  }

  submit(roomCode: string, playerId: string, answers: Partial<PetitBacAnswerMap>) {
    const state = this.states.get(roomCode);
    if (!state || state.phase !== "playing") {
      return { ok: false as const, error: "NOT_PLAYING" };
    }
    // Le client envoie aussi automatiquement les dernières réponses au moment
    // exact où le compteur arrive à 0. On laisse une petite marge technique
    // pour éviter une course entre le timer client et le timer serveur.
    if (Date.now() > state.endsAt + 250) {
      return { ok: false as const, error: "TIME_OVER" };
    }

    const player = state.answers.get(playerId);
    if (!player) return { ok: false as const, error: "PLAYER_NOT_FOUND" };

    for (const { id } of PETIT_BAC_CATEGORIES) {
      const value = answers[id];
      if (typeof value === "string") {
        player.answers[id] = value.trim().slice(0, 100);
      }
    }

    state.submittedPlayers[playerId] = true;

    const allSubmitted = [...state.answers.keys()].every(
      (id) => state.submittedPlayers[id],
    );

    if (allSubmitted) {
      this.startReview(roomCode);
      return { ok: true as const, advanced: true };
    }

    this.callbacks.onState(roomCode);
    return { ok: true as const, advanced: false };
  }

  vote(
    roomCode: string,
    voterId: string,
    category: PetitBacCategory,
    vote: PetitBacVote,
  ) {
    const state = this.states.get(roomCode);
    if (!state || state.phase !== "reviewing") {
      return { ok: false as const, error: "NOT_REVIEWING" };
    }

    const currentPlayerId = state.reviewOrder[state.reviewIndex];
    if (!currentPlayerId || voterId === currentPlayerId) {
      return { ok: false as const, error: "CANNOT_VOTE" };
    }

    const current = state.answers.get(currentPlayerId);
    if (!current) return { ok: false as const, error: "PLAYER_NOT_FOUND" };

    if (!current.answers[category]) {
      return { ok: false as const, error: "EMPTY_ANSWER" };
    }

    // Un vote peut être modifié tant que le joueur est en cours de correction.
    current.votes[category][voterId] = vote;
    this.tryResolveCategory(roomCode, currentPlayerId, category);

    return { ok: true as const };
  }

  private tryResolveCategory(
    roomCode: string,
    playerId: string,
    category: PetitBacCategory,
  ) {
    const state = this.states.get(roomCode);
    const player = state?.answers.get(playerId);
    if (!state || !player || !player.answers[category]) return;

    const voters = [...state.answers.keys()].filter((id) => id !== playerId);
    const allVoted = voters.every(
      (id) => player.votes[category][id] !== undefined,
    );

    if (!allVoted) return;

    const votes = Object.values(player.votes[category]);
    const acceptedVotes = votes.filter((value) => value === "accept").length;
    const rejectedVotes = votes.filter((value) => value === "reject").length;

    const result = {
      accepted: acceptedVotes >= rejectedVotes,
      acceptedVotes,
      rejectedVotes,
    };

    player.results[category] = result;
    this.recalculateScores(state);

    this.callbacks.onCategoryResult(roomCode, {
      playerId,
      category,
      result,
    });
  }

  private recalculateScores(state: PetitBacState) {
    const round = this.roundScores.get(
      [...this.states.entries()].find(([, value]) => value === state)?.[0] ?? "",
    );

    for (const playerId of state.scores ? Object.keys(state.scores) : []) {
      const player = state.answers.get(playerId);
      const score = player
        ? Object.values(player.results).filter((result) => result.accepted).length
        : 0;

      state.scores[playerId] = score;
      if (round) round[playerId] = score;
    }
  }

  private allCategoriesResolved(playerId: string, state: PetitBacState) {
    const player = state.answers.get(playerId);
    if (!player) return true;

    return PETIT_BAC_CATEGORIES.every(({ id }) => {
      if (!player.answers[id]) return true;
      return Boolean(player.results[id]);
    });
  }

  private startReview(roomCode: string) {
    const state = this.states.get(roomCode);
    if (!state || state.phase !== "playing") return;

    const timer = this.timers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.timers.delete(roomCode);

    state.phase = "reviewing";
    state.reviewIndex = 0;
    state.reviewOrder = [...state.answers.keys()];
    this.callbacks.onState(roomCode);
  }

  /**
   * L'hôte doit explicitement avancer.
   * Même un joueur sans aucune réponse reste donc affiché jusqu'au clic.
   */
  next(roomCode: string) {
    const state = this.states.get(roomCode);
    if (!state || state.phase !== "reviewing") {
      return { ok: false as const, error: "NOT_REVIEWING" };
    }

    if (state.reviewIndex >= state.reviewOrder.length - 1) {
      state.phase = "finished";
      this.recalculateScores(state);

      const cumulative = this.cumulativeScores.get(roomCode) ?? {};
      for (const playerId of state.reviewOrder) {
        cumulative[playerId] = (cumulative[playerId] ?? 0) + (state.scores[playerId] ?? 0);
      }
      this.cumulativeScores.set(roomCode, cumulative);

      this.callbacks.onState(roomCode);
      return { ok: true as const, finished: true };
    }

    state.reviewIndex += 1;
    this.callbacks.onState(roomCode);
    return { ok: true as const, finished: false };
  }

  previous(roomCode: string) {
    const state = this.states.get(roomCode);
    if (!state || state.phase !== "reviewing") {
      return { ok: false as const, error: "NOT_REVIEWING" };
    }

    if (state.reviewIndex <= 0) {
      return { ok: false as const, error: "ALREADY_FIRST" };
    }

    state.reviewIndex -= 1;
    this.callbacks.onState(roomCode);
    return { ok: true as const };
  }

  snapshot(roomCode: string): PetitBacSnapshot | null {
    const state = this.states.get(roomCode);
    if (!state) return null;

    const currentPlayerId =
      state.phase === "reviewing"
        ? state.reviewOrder[state.reviewIndex] ?? null
        : null;
    const current = currentPlayerId
      ? state.answers.get(currentPlayerId)
      : null;

    const cumulativeScores = this.cumulativeScores.get(roomCode) ?? {};
    const roundScores = this.roundScores.get(roomCode) ?? {};

    return {
      letter: state.letter,
      timeLimit: state.timeLimit,
      phase: state.phase,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      reviewIndex: state.reviewIndex,
      reviewTotal: state.reviewOrder.length,
      currentPlayerId,
      currentPlayerAnswers: current ? current.answers : null,
      currentResults: current ? current.results : {},
      scores: state.scores,
      roundScores,
      cumulativeScores,
      submittedPlayers: state.submittedPlayers,
    };
  }

  removePlayer(roomCode: string, playerId: string) {
    const state = this.states.get(roomCode);
    if (!state) return;

    state.answers.delete(playerId);
    delete state.submittedPlayers[playerId];
    delete state.scores[playerId];
    const cumulative = this.cumulativeScores.get(roomCode);
    if (cumulative) delete cumulative[playerId];
    const round = this.roundScores.get(roomCode);
    if (round) delete round[playerId];
    state.reviewOrder = state.reviewOrder.filter((id) => id !== playerId);

    for (const player of state.answers.values()) {
      for (const { id: categoryId } of PETIT_BAC_CATEGORIES) {
        delete player.votes[categoryId][playerId];
      }
    }

    this.recalculateScores(state);

    if (state.phase === "reviewing") {
      const currentId = state.reviewOrder[state.reviewIndex];

      if (!currentId) {
        state.phase = "finished";
      } else {
        if (state.reviewIndex >= state.reviewOrder.length) {
          state.reviewIndex = Math.max(0, state.reviewOrder.length - 1);
        }
        // Le retrait d'un joueur peut rendre un vote complet.
        const current = state.answers.get(state.reviewOrder[state.reviewIndex]);
        if (current) {
          for (const { id: categoryId } of PETIT_BAC_CATEGORIES) {
            this.tryResolveCategory(roomCode, current.playerId, categoryId);
          }
        }
      }

      this.callbacks.onState(roomCode);
    }
  }

  private clearGame(roomCode: string) {
    const timer = this.timers.get(roomCode);
    if (timer) clearTimeout(timer);
    this.timers.delete(roomCode);
    this.states.delete(roomCode);
    this.roundScores.delete(roomCode);
  }

  clear(roomCode: string) {
    this.clearGame(roomCode);
    this.cumulativeScores.delete(roomCode);
  }
}
