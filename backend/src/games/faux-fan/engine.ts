import { randomUUID, randomInt } from "node:crypto";
import { getRandomAnime, getRandomCharacter, getCharacterGameData } from "../../database/anime.js";
import type { FauxFanCategory } from "./constants.js";
import type { FauxFanQuestion, FauxFanSnapshot, FauxFanState } from "./types.js";

type Callback = (roomCode: string) => void;

export class FauxFanEngine {
  private states = new Map<string, FauxFanState>();
  private cumulative = new Map<string, Record<string, number>>();

  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], category: FauxFanCategory) {
    if (playerIds.length < 3) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };

    // Tirage indépendant à chaque nouvelle manche : chaque joueur a exactement 1/N chance.
    // Il n'y a volontairement aucune "manche de grâce" pour l'ancien intrus.
    const intruderIndex = randomInt(0, playerIds.length);
    const intruderId = playerIds[intruderIndex];
    const secret = category === "anime" ? await getRandomAnime() : await getRandomCharacter();
    if (!secret) return { ok: false as const, error: "DATABASE_EMPTY" };

    let animeName: string | null = null;
    if (category === "character") {
      const data = await getCharacterGameData(Number(secret.id));
      animeName = data?.anime_name ?? null;
    }

    const previous = this.cumulative.get(roomCode) ?? {};
    const cumulative = Object.fromEntries(playerIds.map((id) => [id, previous[id] ?? 0]));
    this.cumulative.set(roomCode, cumulative);

    const state: FauxFanState = {
      category,
      intruderId,
      secret: {
        id: Number(secret.id),
        name: String(secret.name),
        imageUrl: secret.image_url ?? null,
        animeName,
      },
      phase: "questioning",
      questions: [],
      questionCounts: Object.fromEntries(playerIds.map((id) => [id, 0])),
      turnOrder: [...playerIds].sort(() => Math.random() - 0.5),
      turnIndex: 0,
      waitingForAnswerId: null,
      votes: [],
      guess: null,
      guessVotes: [],
      roundScores: Object.fromEntries(playerIds.map((id) => [id, 0])),
      cumulativeScores: cumulative,
      roundNumber: (this.states.get(roomCode)?.roundNumber ?? 0) + 1,
      result: null,
    };

    this.states.set(roomCode, state);
    this.onState(roomCode);
    return { ok: true as const };
  }

  get(roomCode: string) { return this.states.get(roomCode); }

  private finishQuestioning(roomCode: string, state: FauxFanState) {
    state.phase = "voting";
    state.waitingForAnswerId = null;
    state.turnIndex = 0;
    this.onState(roomCode);
  }

  ask(roomCode: string, authorId: string, targetId: string, text: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "questioning") return { ok: false as const, error: "NOT_QUESTIONING" };
    if (s.turnOrder[s.turnIndex] !== authorId) return { ok: false as const, error: "NOT_YOUR_TURN" };
    if (authorId === targetId) return { ok: false as const, error: "CANNOT_ASK_SELF" };
    if (!s.questionCounts[authorId] && s.questionCounts[authorId] !== 0) return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    if (s.questionCounts[authorId] >= 2) return { ok: false as const, error: "QUESTION_LIMIT" };
    if (!text.trim()) return { ok: false as const, error: "EMPTY_QUESTION" };

    const question: FauxFanQuestion = {
      id: randomUUID(),
      authorId,
      targetId,
      text: text.trim().slice(0, 200),
      answer: null,
      createdAt: Date.now(),
    };
    s.questions.push(question);
    s.questionCounts[authorId]++;
    s.waitingForAnswerId = targetId;
    this.onState(roomCode);
    return { ok: true as const };
  }

  answer(roomCode: string, playerId: string, questionId: string, text: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "questioning") return { ok: false as const, error: "NOT_QUESTIONING" };
    if (s.waitingForAnswerId !== playerId) return { ok: false as const, error: "NOT_YOUR_ANSWER" };
    const q = s.questions.find((x) => x.id === questionId);
    if (!q || q.targetId !== playerId || q.answer !== null) return { ok: false as const, error: "QUESTION_NOT_FOUND" };
    if (!text.trim()) return { ok: false as const, error: "EMPTY_ANSWER" };

    q.answer = text.trim().slice(0, 240);
    s.waitingForAnswerId = null;

    const next = s.turnOrder.findIndex((id, i) => i > s.turnIndex && s.questionCounts[id] < 2);
    if (next >= 0) {
      s.turnIndex = next;
      this.onState(roomCode);
    } else {
      const anyRemaining = s.turnOrder.findIndex((id) => s.questionCounts[id] < 2);
      if (anyRemaining >= 0) {
        s.turnIndex = anyRemaining;
        this.onState(roomCode);
      } else {
        // La dernière réponse vient d'être envoyée : on laisse
        // une seconde à tous les joueurs pour voir cette réponse
        // avant de passer à l'écran de vote.
        s.waitingForAnswerId = "__TRANSITION_TO_VOTE__";
        this.onState(roomCode);

        setTimeout(() => {
          const current = this.states.get(roomCode);
          if (current !== s || current.phase !== "questioning") return;
          if (current.waitingForAnswerId !== "__TRANSITION_TO_VOTE__") return;
          this.finishQuestioning(roomCode, current);
        }, 1000);
      }
    }

    return { ok: true as const };
  }

  vote(roomCode: string, voterId: string, targetId: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "voting") return { ok: false as const, error: "NOT_VOTING" };
    if (s.votes.some((v) => v.voterId === voterId)) return { ok: false as const, error: "ALREADY_VOTED" };
    if (voterId === targetId) return { ok: false as const, error: "CANNOT_VOTE_SELF" };
    if (!s.turnOrder.includes(targetId)) return { ok: false as const, error: "PLAYER_NOT_FOUND" };

    s.votes.push({ voterId, targetId });
    if (s.votes.length === s.turnOrder.length) this.resolveVotes(roomCode, s);
    else this.onState(roomCode);
    return { ok: true as const };
  }

  private resolveVotes(roomCode: string, s: FauxFanState) {
    const counts = new Map<string, number>();
    for (const vote of s.votes) counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1);
    const intruderVotes = counts.get(s.intruderId) ?? 0;
    const majority = intruderVotes > s.turnOrder.length / 2;
    s.result = { intruderWon: !majority, intruderVotedMajority: majority, correctGuess: null };

    if (!majority) {
      s.roundScores[s.intruderId] += s.votes.filter((v) => v.voterId !== s.intruderId && v.targetId !== s.intruderId).length;
      this.applyRoundToCumulative(s);
      s.phase = "finished";
    } else {
      for (const vote of s.votes) if (vote.targetId === s.intruderId) s.roundScores[vote.voterId] += 1;
      s.phase = "guessing";
    }
    this.onState(roomCode);
  }

  submitGuess(roomCode: string, playerId: string, guess: string) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "guessing") return { ok: false as const, error: "NOT_GUESSING" };
    if (playerId !== s.intruderId) return { ok: false as const, error: "NOT_INTRUDER" };
    if (s.guess !== null) return { ok: false as const, error: "ALREADY_GUESSED" };
    if (!guess.trim()) return { ok: false as const, error: "EMPTY_GUESS" };
    s.guess = guess.trim().slice(0, 120);
    this.onState(roomCode);
    return { ok: true as const };
  }

  voteGuess(roomCode: string, voterId: string, accepted: boolean) {
    const s = this.states.get(roomCode);
    if (!s || s.phase !== "guessing") return { ok: false as const, error: "NOT_GUESSING" };
    if (!s.guess) return { ok: false as const, error: "NO_GUESS" };
    if (voterId === s.intruderId) return { ok: false as const, error: "INTRUDER_CANNOT_VOTE" };
    if (s.guessVotes.some((v) => v.voterId === voterId)) return { ok: false as const, error: "ALREADY_VOTED" };

    s.guessVotes.push({ voterId, accepted });
    const others = s.turnOrder.length - 1;
    if (s.guessVotes.length === others) {
      const acceptedCount = s.guessVotes.filter((v) => v.accepted).length;
      const correct = acceptedCount > others / 2;
      s.result!.correctGuess = correct;
      if (correct) {
        // L'intrus gagne toujours 1 point pour avoir trouvé le secret,
        // puis 1 point supplémentaire par joueur qui n'a pas voté pour lui.
        const nonVoters = s.turnOrder.filter(
          (id) =>
            id !== s.intruderId &&
            !s.votes.some(
              (v) => v.voterId === id && v.targetId === s.intruderId,
            ),
        ).length;

        s.roundScores[s.intruderId] += 1 + nonVoters;
      } else {
        for (const id of s.turnOrder) if (id !== s.intruderId) s.roundScores[id] += 1;
      }
      this.applyRoundToCumulative(s);
      s.phase = "finished";
    }
    this.onState(roomCode);
    return { ok: true as const };
  }

  private applyRoundToCumulative(s: FauxFanState) {
    for (const id of s.turnOrder) s.cumulativeScores[id] = (s.cumulativeScores[id] ?? 0) + (s.roundScores[id] ?? 0);
    this.cumulative.set(this.findRoomForState(s), s.cumulativeScores);
  }

  private findRoomForState(state: FauxFanState) {
    for (const [code, candidate] of this.states.entries()) if (candidate === state) return code;
    return "";
  }

  snapshot(roomCode: string, playerId: string): FauxFanSnapshot | null {
    const s = this.states.get(roomCode);
    if (!s) return null;
    const isIntruder = playerId === s.intruderId;
    const visibleSecret = s.phase === "finished" ? s.secret : isIntruder ? null : s.secret;
    return {
      category: s.category,
      phase: s.phase,
      isIntruder,
      secret: visibleSecret ? { name: visibleSecret.name, imageUrl: visibleSecret.imageUrl, animeName: visibleSecret.animeName } : null,
      intruderId: s.phase === "finished" ? s.intruderId : null,
      questions: s.questions,
      questionCounts: s.questionCounts,
      turnPlayerId: s.phase === "questioning" ? s.turnOrder[s.turnIndex] ?? null : null,
      waitingForAnswerId: s.waitingForAnswerId,
      votes: s.votes,
      myVote: s.votes.find((v) => v.voterId === playerId)?.targetId ?? null,
      guess: s.guess,
      guessVotes: s.guessVotes,
      roundScores: s.roundScores,
      cumulativeScores: s.cumulativeScores,
      roundNumber: s.roundNumber,
      result: s.result,
    };
  }

  removePlayer(roomCode: string, playerId: string) {
    const s = this.states.get(roomCode);
    if (!s) return;
    if (s.turnOrder.includes(playerId) && s.phase !== "finished") {
      s.turnOrder = s.turnOrder.filter((id) => id !== playerId);
      delete s.questionCounts[playerId];
      if (s.phase === "questioning" && s.turnOrder.length < 3) this.clear(roomCode);
    }
  }

  clear(roomCode: string) {
    this.states.delete(roomCode);
    this.cumulative.delete(roomCode);
  }
}
