import { randomInt } from "node:crypto";
import { getRandomAnime } from "../../database/anime.js";
import type { SynopsisEclataxSnapshot, SynopsisEclataxState } from "./types.js";

type Callback = (roomCode: string) => void;

const ROUND_DURATION_MS = 120_000;
const NEXT_ROUND_DELAY_MS = 2_000;
const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.6-luna";

const DEVELOPER_PROMPT = `Tu écris les textes du jeu multijoueur « Synopsis éclatax ».

Ta mission : transformer le nom d'un animé donné en un synopsis volontairement catastrophique, très drôle, cynique et un peu vulgaire. Le but est que les joueurs puissent deviner l'animé, mais uniquement grâce à l'ambiance générale de la blague : le texte ne doit donner AUCUN indice concret permettant de reconnaître directement l'œuvre.

RÈGLES ABSOLUES :
- Maximum 3 phrases.
- N'écris jamais le nom de l'animé.
- N'utilise aucun nom propre, nom de personnage, lieu, titre, faction, organisation, objet, technique, pouvoir, créature, espèce, événement, citation, terme inventé ou autre élément propre à l'œuvre.
- N'utilise même pas un terme de genre ou de trope qui rendrait l'œuvre trop facile à identifier (par exemple « pirate », « ninja », « robot géant », « lycée de magie », « tueur de démons », etc.).
- Ne donne ni époque, ni pays, ni ville, ni décor précis, ni profession précise, ni pouvoir précis, ni élément de scénario reconnaissable.
- Évite aussi les détails qui deviennent des indices évidents par accumulation.
- Si un élément semble spécifique à l'œuvre, remplace-le par une formulation complètement générique.
- Le texte doit surtout se moquer du concept, de la narration, des personnages de manière générique, du rythme ou de l'expérience de spectateur.
- Ton : cynique, absurde, presque insultant, parfois cru, mais sans haine visant une personne réelle ou un groupe protégé.
- Pas de préambule, pas de guillemets, pas de liste, pas d'explication : uniquement le synopsis final.

Avant de répondre, fais silencieusement une vérification : si un mot peut révéler directement l'œuvre ou un élément qui lui est exclusivement associé, retire-le. Si le synopsis est trop précis, réécris-le en plus générique.

L'objectif est un synopsis qui donne envie de dire « mais c'est quoi cette merde ? » tout en laissant suffisamment de place au jeu de devinette.`;

export class SynopsisEclataxEngine {
  private states = new Map<string, SynopsisEclataxState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private nextRoundTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private readonly onState: Callback) {}

  async start(roomCode: string, playerIds: string[], totalRounds = 1) {
    if (playerIds.length < 2) return { ok: false as const, error: "NOT_ENOUGH_PLAYERS" };

    this.clearTimers(roomCode);
    const rounds = Math.max(1, Math.min(10, Math.floor(totalRounds)));
    const scores = Object.fromEntries(playerIds.map((id) => [id, 0]));
    this.states.delete(roomCode);

    return this.startRound(roomCode, playerIds, 1, rounds, scores);
  }

  get(code: string) {
    return this.states.get(code);
  }

  async startRound(
    roomCode: string,
    playerIds: string[],
    roundNumber: number,
    totalRounds: number,
    cumulativeScores: Record<string, number>,
  ) {
    try {
      const row = await getRandomAnime();
      if (!row?.name) return { ok: false as const, error: "NO_CONTENT" };

      const synopsis = await generateSynopsis(String(row.name));
      const endsAt = Date.now() + ROUND_DURATION_MS;

      const state: SynopsisEclataxState = {
        synopsis,
        original: String(row.name),
        phase: "playing",
        endsAt,
        roundNumber,
        totalRounds,
        playerIds: new Set(playerIds),
        foundIds: new Set(),
        failedIds: new Set(),
        roundWinnerIds: [],
        cumulativeScores,
      };

      this.states.set(roomCode, state);
      this.timers.set(roomCode, setTimeout(() => this.finishRound(roomCode), ROUND_DURATION_MS));
      this.onState(roomCode);
      return { ok: true as const };
    } catch (error) {
      console.error(`[SYNOPSIS-ECLATAX][${roomCode}] Génération impossible`, error);
      return {
        ok: false as const,
        error: error instanceof Error && error.message === "OPENAI_NOT_CONFIGURED"
          ? "OPENAI_NOT_CONFIGURED"
          : "AI_GENERATION_FAILED",
      };
    }
  }

  private finishRound(roomCode: string) {
    const state = this.states.get(roomCode);
    if (!state || state.phase !== "playing") return;

    this.clearTimer(roomCode);
    state.endsAt = null;

    if (state.roundNumber >= state.totalRounds) {
      state.phase = "finished";
      this.onState(roomCode);
      return;
    }

    state.phase = "between";
    this.onState(roomCode);

    const playerIds = [...state.playerIds];
    const roundNumber = state.roundNumber + 1;
    const totalRounds = state.totalRounds;
    const scores = { ...state.cumulativeScores };

    const timer = setTimeout(() => {
      this.nextRoundTimers.delete(roomCode);
      void this.startRound(roomCode, playerIds, roundNumber, totalRounds, scores).catch((error) => {
        console.error(`[SYNOPSIS-ECLATAX][${roomCode}] Manche suivante impossible`, error);
        this.clear(roomCode);
      });
    }, NEXT_ROUND_DELAY_MS);

    this.nextRoundTimers.set(roomCode, timer);
  }

  guess(code: string, playerId: string, text: string) {
    const state = this.states.get(code);
    if (!state || state.phase !== "playing") return { ok: false as const, error: "NOT_PLAYING" };
    if (!state.playerIds.has(playerId)) return { ok: false as const, error: "PLAYER_NOT_FOUND" };
    if (state.foundIds.has(playerId)) return { ok: false as const, error: "ALREADY_FOUND" };
    if (state.failedIds.has(playerId)) return { ok: false as const, error: "ALREADY_FAILED" };

    if (state.endsAt !== null && Date.now() >= state.endsAt) {
      this.finishRound(code);
      return { ok: false as const, error: "TIME_OVER" };
    }

    const guess = text.trim();
    if (!guess) return { ok: false as const, error: "EMPTY_GUESS" };

    if (normalize(guess) !== normalize(state.original)) {
      state.failedIds.add(playerId);

      const done = state.foundIds.size + state.failedIds.size >= state.playerIds.size;
      if (done) {
        this.finishRound(code);
        return { ok: true as const, correct: false, finished: true, failed: true };
      }

      this.onState(code);
      return { ok: true as const, correct: false, finished: false, failed: true };
    }

    state.failedIds.delete(playerId);
    state.foundIds.add(playerId);
    state.roundWinnerIds.push(playerId);
    state.cumulativeScores[playerId] = (state.cumulativeScores[playerId] ?? 0) + 1;

    if (state.foundIds.size >= state.playerIds.size) {
      this.finishRound(code);
      return { ok: true as const, correct: true, finished: true, score: 1 };
    }

    this.onState(code);
    return { ok: true as const, correct: true, finished: false, score: 1 };
  }

  snapshot(code: string, playerId: string): SynopsisEclataxSnapshot | null {
    const state = this.states.get(code);
    if (!state) return null;

    return {
      synopsis: state.synopsis,
      original: state.phase === "playing" ? null : state.original,
      phase: state.phase,
      endsAt: state.endsAt,
      roundNumber: state.roundNumber,
      totalRounds: state.totalRounds,
      foundIds: [...state.foundIds],
      failedIds: [...state.failedIds],
      roundWinnerIds: [...state.roundWinnerIds],
      cumulativeScores: { ...state.cumulativeScores },
      playerId,
    };
  }

  removePlayer(code: string, playerId: string) {
    const state = this.states.get(code);
    if (!state) return;
    state.playerIds.delete(playerId);
    state.foundIds.delete(playerId);
    state.failedIds.delete(playerId);
    delete state.cumulativeScores[playerId];

    if (state.phase === "playing" && state.playerIds.size > 0 && state.foundIds.size >= state.playerIds.size) {
      this.finishRound(code);
      return;
    }

    if (state.playerIds.size === 0) {
      this.clear(code);
      return;
    }

    this.onState(code);
  }

  clear(code: string) {
    this.clearTimers(code);
    this.states.delete(code);
  }

  private clearTimer(code: string) {
    const timer = this.timers.get(code);
    if (timer) clearTimeout(timer);
    this.timers.delete(code);
  }

  private clearTimers(code: string) {
    this.clearTimer(code);
    const next = this.nextRoundTimers.get(code);
    if (next) clearTimeout(next);
    this.nextRoundTimers.delete(code);
  }
}

async function generateSynopsis(animeName: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_NOT_CONFIGURED");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      store: false,
      input: [
        { role: "developer", content: DEVELOPER_PROMPT },
        {
          role: "user",
          content: `Anime à transformer : ${animeName}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`OPENAI_${response.status}: ${details.slice(0, 300)}`);
  }

  const payload = await response.json() as {
    output?: Array<{
      type?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
  };

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!text) throw new Error("OPENAI_EMPTY_RESPONSE");

  const cleaned = text.replace(/^['"]|['"]$/g, "").trim();
  const normalizedSynopsis = normalize(cleaned);
  const normalizedTitle = normalize(animeName);
  if (normalizedTitle && normalizedSynopsis.includes(normalizedTitle)) {
    throw new Error("OPENAI_LEAKED_TITLE");
  }

  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [];
  return sentences.slice(0, 3).join(" ").slice(0, 700).trim();
}

function normalize(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
