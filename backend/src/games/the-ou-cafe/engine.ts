import { randomUUID } from "node:crypto";
import { getRandomAnime, getRandomCharacter, getCharacterGameData } from "../../database/anime.js";
import {
  THE_OU_CAFE_MIN_POINTS,
  THE_OU_CAFE_MAX_POINTS,
  THE_OU_CAFE_TARGET_NO_FIND_POINTS,
  type TheOuCafeCategory,
} from "./constants.js";
import type { TheOuCafeAnswer, TheOuCafeQuestion, TheOuCafeSnapshot, TheOuCafeOption } from "./types.js";

type Callback = (roomCode: string) => void;

type State = {
  category: TheOuCafeCategory;
  targetPlayerId: string;
  secret: {
    id: number;
    name: string;
    imageUrl?: string | null;
    animeName?: string | null;
  };
  options: TheOuCafeOption[];
  questions: TheOuCafeQuestion[];
  answers: TheOuCafeAnswer[];
  phase: "choosing" | "playing" | "finished";
  winnerId: string | null;
  roundScores: Record<string, number>;
  roundNumber: number;
};

export class TheOuCafeEngine {
  private states = new Map<string, State>();
  private cumulative = new Map<string, Record<string, number>>();
  private orders = new Map<string, string[]>();
  private orderIndex = new Map<string, number>();

  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], category: TheOuCafeCategory) {
    if (playerIds.length < 2) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };

    let order = this.orders.get(roomCode);
    let index = this.orderIndex.get(roomCode) ?? 0;
    if (!order || index >= order.length) {
      order = [...playerIds].sort(() => Math.random() - 0.5);
      index = 0;
      this.orders.set(roomCode, order);
    }
    // Remove players who left and append new players.
    order = order.filter((id) => playerIds.includes(id));
    for (const id of playerIds) if (!order.includes(id)) order.push(id);
    if (index >= order.length) index = 0;
    const targetPlayerId = order[index];
    this.orderIndex.set(roomCode, index + 1);

    const options: TheOuCafeOption[] = [];
    const seenIds = new Set<number>();

    for (let attempt = 0; options.length < 3 && attempt < 12; attempt++) {
      const candidate = category === "anime" ? await getRandomAnime() : await getRandomCharacter();
      if (!candidate) continue;
      const id = Number(candidate.id);
      if (!Number.isFinite(id) || seenIds.has(id)) continue;

      let animeName: string | null = null;
      if (category === "character") {
        const characterData = await getCharacterGameData(candidate.id);
        animeName = characterData?.anime_name ?? null;
      }

      seenIds.add(id);
      options.push({
        id,
        name: String(candidate.name),
        imageUrl: candidate.image_url ?? null,
        animeName,
      });
    }

    if (!options.length) return { ok: false as const, error: "DATABASE_EMPTY" };

    const previous = this.cumulative.get(roomCode) ?? {};
    const cumulative = Object.fromEntries(playerIds.map((id) => [id, previous[id] ?? 0]));
    this.cumulative.set(roomCode, cumulative);

    const state: State = {
      category,
      targetPlayerId,
      secret: {
        id: options[0].id,
        name: options[0].name,
        imageUrl: options[0].imageUrl ?? null,
        animeName: options[0].animeName ?? null,
      },
      options,
      questions: [],
      answers: [],
      phase: "choosing",
      winnerId: null,
      roundScores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      roundNumber: (this.states.get(roomCode)?.roundNumber ?? 0) + 1,
    };
    this.states.set(roomCode, state);
    this.onState(roomCode);
    return { ok: true as const };
  }

  get(roomCode: string) { return this.states.get(roomCode); }

  private points(questionCount: number) {
    return Math.max(
      THE_OU_CAFE_MIN_POINTS,
      Math.round(THE_OU_CAFE_MAX_POINTS / Math.sqrt(Math.max(1, questionCount))),
    );
  }

  addQuestion(roomCode: string, authorId: string, left: string, right: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (authorId === s.targetPlayerId) return { ok: false as const, error: "TARGET_CANNOT_ASK" };
    left = left.trim().slice(0, 80); right = right.trim().slice(0, 80);
    if (!left || !right) return { ok: false as const, error: "EMPTY_QUESTION" };
    s.questions.push({ id: randomUUID(), authorId, left, right, chosen: null, createdAt: Date.now() });
    this.onState(roomCode);
    return { ok: true as const };
  }

  chooseQuestion(roomCode: string, playerId: string, questionId: string, side: "left"|"right"|"neither") {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (playerId !== s.targetPlayerId) return { ok: false as const, error: "NOT_TARGET" };
    const q = s.questions.find((x) => x.id === questionId);
    if (!q) return { ok: false as const, error: "QUESTION_NOT_FOUND" };
    q.chosen = side;
    this.onState(roomCode);
    return { ok: true as const };
  }

  selectSecret(roomCode: string, playerId: string, optionId: number) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "choosing") return { ok: false as const, error: "NOT_CHOOSING" };
    if (playerId !== s.targetPlayerId) return { ok: false as const, error: "NOT_TARGET" };

    const option = s.options.find((candidate) => candidate.id === optionId);
    if (!option) return { ok: false as const, error: "OPTION_NOT_FOUND" };

    s.secret = {
      id: option.id,
      name: option.name,
      imageUrl: option.imageUrl ?? null,
      animeName: option.animeName ?? null,
    };
    s.phase = "playing";
    this.onState(roomCode);
    return { ok: true as const };
  }

  addAnswer(roomCode: string, authorId: string, text: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (authorId === s.targetPlayerId) return { ok: false as const, error: "TARGET_CANNOT_ANSWER" };
    text = text.trim().slice(0, 120);
    if (!text) return { ok: false as const, error: "EMPTY_ANSWER" };
    s.answers.push({ id: randomUUID(), authorId, text, status: "pending", createdAt: Date.now() });
    this.onState(roomCode);
    return { ok: true as const };
  }

  judgeAnswer(roomCode: string, playerId: string, answerId: string, accepted: boolean) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (playerId !== s.targetPlayerId) return { ok: false as const, error: "NOT_TARGET" };
    const answer = s.answers.find((x) => x.id === answerId);
    if (!answer) return { ok: false as const, error: "ANSWER_NOT_FOUND" };
    if (accepted) {
      answer.status = "accepted";
      s.winnerId = answer.authorId;
      s.phase = "finished";
      const pts = this.points(s.questions.length);
      s.roundScores[answer.authorId] = (s.roundScores[answer.authorId] ?? 0) + pts;
      const totals = this.cumulative.get(roomCode) ?? {};
      totals[answer.authorId] = (totals[answer.authorId] ?? 0) + pts;
      this.cumulative.set(roomCode, totals);
    } else {
      answer.status = "rejected";
    }
    this.onState(roomCode);
    return { ok: true as const, finished: s.phase === "finished" };
  }

  noFind(roomCode: string, playerId: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (playerId !== s.targetPlayerId) return { ok: false as const, error: "NOT_TARGET" };
    s.phase = "finished";
    const pts = THE_OU_CAFE_TARGET_NO_FIND_POINTS;
    s.roundScores[playerId] = (s.roundScores[playerId] ?? 0) + pts;
    const totals = this.cumulative.get(roomCode) ?? {};
    totals[playerId] = (totals[playerId] ?? 0) + pts;
    this.cumulative.set(roomCode, totals);
    this.onState(roomCode);
    return { ok: true as const };
  }

  snapshot(roomCode: string, playerId?: string): TheOuCafeSnapshot | null {
    const s = this.states.get(roomCode);
    if (!s) return null;
    const snap: TheOuCafeSnapshot = {
      category: s.category,
      phase: s.phase,
      targetPlayerId: s.targetPlayerId,
      questions: s.questions,
      answers: s.answers,
      questionCount: s.questions.length,
      winnerId: s.winnerId,
      roundScores: s.roundScores,
      cumulativeScores: this.cumulative.get(roomCode) ?? {},
      roundNumber: s.roundNumber,
    };
    if (s.phase === "choosing" && playerId === s.targetPlayerId) {
      snap.options = s.options;
    }
    if (s.phase === "finished" || (s.phase !== "choosing" && playerId === s.targetPlayerId)) {
      snap.secret = s.secret;
    } else {
      delete snap.secret;
    }
    return snap;
  }

  removePlayer(roomCode: string, playerId: string) {
    const s = this.states.get(roomCode);
    if (!s) return;
    s.questions = s.questions.filter((q) => q.authorId !== playerId);
    s.answers = s.answers.filter((a) => a.authorId !== playerId);
    if (s.targetPlayerId === playerId && s.phase === "playing") this.noFind(roomCode, playerId);
    const order = this.orders.get(roomCode);
    if (order) this.orders.set(roomCode, order.filter((id) => id !== playerId));
    const totals = this.cumulative.get(roomCode);
    if (totals) delete totals[playerId];
    this.onState(roomCode);
  }

  clear(roomCode: string) {
    this.states.delete(roomCode);
    this.cumulative.delete(roomCode);
    this.orders.delete(roomCode);
    this.orderIndex.delete(roomCode);
  }
}
