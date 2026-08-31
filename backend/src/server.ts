import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server as SocketIOServer } from "socket.io";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  addPlayer,
  createRoom,
  getRoom,
  removePlayerBySocket,
  serializeRoom,
} from "./rooms.js";
import type { GameId } from "./types.js";
import { PETIT_BAC_CATEGORY_IDS } from "./games/petit-bac/constants.js";
import type { PetitBacCategory } from "./games/petit-bac/constants.js";
import { PetitBacEngine } from "./games/petit-bac/engine.js";
import { TheOuCafeEngine } from "./games/the-ou-cafe/engine.js";
import { FauxFanEngine } from "./games/faux-fan/engine.js";
import { TierlistEngine } from "./games/tierlists/engine.js";
import type { FauxFanCategory } from "./games/faux-fan/constants.js";
import { THE_OU_CAFE_CATEGORY_IDS, type TheOuCafeCategory } from "./games/the-ou-cafe/constants.js";
import type { TierlistCategory } from "./games/tierlists/constants.js";
import { RorschachEngine } from "./games/rorschach/engine.js";

const app = Fastify({ logger: true });
const PORT = Number(process.env.PORT ?? 3001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:5173";

await app.register(cors, {
  origin: CLIENT_ORIGIN,
  credentials: true,
});

const io = new SocketIOServer(app.server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const pseudo = z.string().trim().min(1).max(20);
const game = z.enum(["game-1", "game-2", "game-3", "game-4", "game-5"]);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{5}$/);
const timeLimit = z
  .number()
  .int()
  .min(20)
  .max(240)
  .refine((value) => value % 5 === 0);

const gameSettingsSchema = z.object({
  timeLimit: timeLimit.default(60),
  theOuCafeCategory: z.enum(["anime", "character"]).default("anime"),
  fauxFanCategory: z.enum(["anime", "character"]).default("anime"),
  tierlistCategory: z.enum(["anime", "character"]).default("anime"),
  tierlistItemCount: z.number().int().min(10).max(30).refine(v => v % 5 === 0).default(10),
});

const createSchema = z.object({
  pseudo,
  gameId: game,
  settings: z.object({
    name: z.string().trim().min(1).max(40).default("Ma partie"),
    maxPlayers: z.number().int().min(2).max(12).default(8),
    private: z.boolean().default(true),
    gameSettings: gameSettingsSchema.optional(),
  }).default({
    name: "Ma partie",
    maxPlayers: 8,
    private: true,
    gameSettings: { timeLimit: 60, theOuCafeCategory: "anime", fauxFanCategory: "anime", tierlistCategory: "anime", tierlistItemCount: 10 },
  }),
});

const joinSchema = z.object({ pseudo, code });

const theOuCafe = new TheOuCafeEngine((roomCode) => {
  const room = getRoom(roomCode);
  if (!room) return;
  for (const [playerId, player] of room.players.entries()) {
    const snapshot = theOuCafe.snapshot(roomCode, playerId);
    if (snapshot && player.socketId) {
      io.to(player.socketId).emit("game1:state", snapshot);
    }
  }
});

const fauxFan = new FauxFanEngine((roomCode) => {
  const room = getRoom(roomCode);
  if (!room) return;
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    const snapshot = fauxFan.snapshot(roomCode, player.id);
    if (snapshot) io.to(player.socketId).emit("game2:state", snapshot);
  }
});

const tierlist = new TierlistEngine((roomCode) => {
  const room = getRoom(roomCode);
  if (!room) return;
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    const snapshot = tierlist.snapshot(roomCode, player.id);
    if (snapshot) io.to(player.socketId).emit("game4:state", snapshot);
  }
});

const rorschach = new RorschachEngine((roomCode) => {
  const room = getRoom(roomCode);
  if (!room) return;
  for (const player of room.players.values()) {
    if (!player.socketId) continue;
    const snapshot = rorschach.snapshot(roomCode, player.id);
    if (snapshot) io.to(player.socketId).emit("game5:state", snapshot);
  }
});

const petitBac = new PetitBacEngine({
  onState: (roomCode) => {
    const snapshot = petitBac.snapshot(roomCode);
    if (snapshot) io.to(roomCode).emit("game3:state", snapshot);
  },
  onCategoryResult: (roomCode, payload) => {
    io.to(roomCode).emit("game3:category-result", payload);
    const snapshot = petitBac.snapshot(roomCode);
    if (snapshot) io.to(roomCode).emit("game3:state", snapshot);
  },
});

app.get("/health", async () => ({ ok: true, service: "roomhub-backend" }));

app.get("/api/rooms/:code", async (req, reply) => {
  const parsed = z.object({ code }).safeParse(req.params);
  if (!parsed.success) return reply.code(400).send({ error: "INVALID_CODE" });

  const room = getRoom(parsed.data.code);
  if (!room) return reply.code(404).send({ error: "ROOM_NOT_FOUND" });

  return { room: serializeRoom(room) };
});

io.on("connection", (socket) => {
  socket.on("room:create", (payload, cb) => {
    const parsed = createSchema.safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });

    const id = randomUUID();
    const room = createRoom(
      parsed.data.gameId as GameId,
      {
        id,
        pseudo: parsed.data.pseudo,
        socketId: socket.id,
      },
      parsed.data.settings,
    );

    socket.join(room.code);
    socket.data.playerId = id;
    socket.data.roomCode = room.code;

    cb?.({
      ok: true,
      playerId: id,
      room: serializeRoom(room),
    });

    io.to(room.code).emit("room:updated", serializeRoom(room));
  });

  socket.on("room:join", (payload, cb) => {
    const parsed = joinSchema.safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });

    const room = getRoom(parsed.data.code);
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });

    const id = randomUUID();

    try {
      addPlayer(room, {
        id,
        pseudo: parsed.data.pseudo,
        socketId: socket.id,
      });
    } catch (error) {
      return cb?.({
        ok: false,
        error: error instanceof Error ? error.message : "JOIN_FAILED",
      });
    }

    socket.join(room.code);
    socket.data.playerId = id;
    socket.data.roomCode = room.code;

    cb?.({
      ok: true,
      playerId: id,
      room: serializeRoom(room),
    });

    io.to(room.code).emit("room:updated", serializeRoom(room));
  });

  socket.on("room:update-settings", (payload, cb) => {
    const room = getRoom(socket.data.roomCode ?? "");
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });

    if (room.hostId !== socket.data.playerId) {
      return cb?.({ ok: false, error: "NOT_HOST" });
    }

    const schema = z.object({
      name: z.string().trim().min(1).max(40).optional(),
      maxPlayers: z.number().int().min(2).max(12).optional(),
      private: z.boolean().optional(),
      gameSettings: gameSettingsSchema.partial().optional(),
    });

    const parsed = schema.safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });

    if (
      parsed.data.maxPlayers !== undefined &&
      parsed.data.maxPlayers < room.players.size
    ) {
      return cb?.({ ok: false, error: "MAX_PLAYERS_TOO_LOW" });
    }

    room.settings = {
      ...room.settings,
      ...parsed.data,
      gameSettings: parsed.data.gameSettings
        ? { ...room.settings.gameSettings, ...parsed.data.gameSettings }
        : room.settings.gameSettings,
    };

    io.to(room.code).emit("room:updated", serializeRoom(room));
    cb?.({ ok: true });
  });

  socket.on("room:start", async (cb) => {
    const room = getRoom(socket.data.roomCode ?? "");
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });

    if (room.hostId !== socket.data.playerId) {
      return cb?.({ ok: false, error: "NOT_HOST" });
    }

    if (room.gameId === "game-1") {
      const category = room.settings.gameSettings?.theOuCafeCategory ?? "anime";
      const result = await theOuCafe.start(
        room.code,
        [...room.players.keys()],
        category as TheOuCafeCategory,
      );
      if (!result.ok) return cb?.(result);
      for (const [playerId, player] of room.players.entries()) {
        const snapshot = theOuCafe.snapshot(room.code, playerId);
        if (snapshot && player.socketId) {
          io.to(player.socketId).emit("game1:start", snapshot);
        }
      }
      return cb?.({ ok: true });
    }

    if (room.gameId === "game-2") {
      if (room.players.size < 3) {
        return cb?.({ ok: false, error: "NOT_ENOUGH_PLAYERS" });
      }
      const category = room.settings.gameSettings?.fauxFanCategory ?? "anime";
      const result = await fauxFan.start(room.code, [...room.players.keys()], category as FauxFanCategory);
      if (!result.ok) return cb?.(result);
      for (const player of room.players.values()) {
        const snapshot = fauxFan.snapshot(room.code, player.id);
        if (snapshot && player.socketId) io.to(player.socketId).emit("game2:start", snapshot);
      }
      return cb?.({ ok: true });
    }

    if (room.gameId === "game-4") {
      const category = room.settings.gameSettings?.tierlistCategory ?? "anime";
      const count = room.settings.gameSettings?.tierlistItemCount ?? 10;
      const result = await tierlist.start(room.code, [...room.players.keys()], category as TierlistCategory, count);
      if (!result.ok) return cb?.(result);
      for (const player of room.players.values()) {
        const snapshot = tierlist.snapshot(room.code, player.id);
        if (snapshot && player.socketId) io.to(player.socketId).emit("game4:start", snapshot);
      }
      return cb?.({ ok: true });
    }

    if (room.gameId === "game-5") {
      const result = rorschach.start(room.code, [...room.players.keys()]);
      if (!result.ok) return cb?.(result);
      for (const player of room.players.values()) {
        const snapshot = rorschach.snapshot(room.code, player.id);
        if (snapshot && player.socketId) io.to(player.socketId).emit("game5:start", snapshot);
      }
      return cb?.({ ok: true });
    }

    if (room.gameId === "game-3") {
      const selectedTime = room.settings.gameSettings?.timeLimit ?? 60;
      const validTime =
        selectedTime >= 20 &&
        selectedTime <= 240 &&
        selectedTime % 5 === 0
          ? selectedTime
          : 60;

      petitBac.start(
        room.code,
        [...room.players.keys()],
        validTime,
      );

      const snapshot = petitBac.snapshot(room.code);
      if (snapshot) io.to(room.code).emit("game3:start", snapshot);

      return cb?.({ ok: true });
    }

    io.to(room.code).emit("game:start", {
      room: serializeRoom(room),
      startedAt: Date.now(),
    });

    cb?.({ ok: true });
  });

  socket.on("game1:request-state", (cb) => {
    const snapshot = theOuCafe.snapshot(socket.data.roomCode ?? "", socket.data.playerId ?? "");
    if (!snapshot) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });
    cb?.({ ok: true, snapshot });
  });

  socket.on("game1:question", (payload, cb) => {
    const parsed = z.object({ left: z.string().max(80), right: z.string().max(80) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(theOuCafe.addQuestion(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.left, parsed.data.right));
  });

  socket.on("game1:choose", (payload, cb) => {
    const parsed = z.object({ questionId: z.string(), side: z.enum(["left", "right"]) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(theOuCafe.chooseQuestion(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.questionId, parsed.data.side));
  });

  socket.on("game1:answer", (payload, cb) => {
    const parsed = z.object({ text: z.string().max(120) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(theOuCafe.addAnswer(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.text));
  });

  socket.on("game1:judge", (payload, cb) => {
    const parsed = z.object({ answerId: z.string(), accepted: z.boolean() }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(theOuCafe.judgeAnswer(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.answerId, parsed.data.accepted));
  });

  socket.on("game1:no-find", (cb) => {
    cb?.(theOuCafe.noFind(socket.data.roomCode ?? "", socket.data.playerId ?? ""));
  });

  socket.on("game2:request-state", (cb) => {
    const snapshot = fauxFan.snapshot(socket.data.roomCode ?? "", socket.data.playerId ?? "");
    if (!snapshot) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });
    cb?.({ ok: true, snapshot });
  });

  socket.on("game2:ask", (payload, cb) => {
    const parsed = z.object({ targetId: z.string(), text: z.string().max(200) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(fauxFan.ask(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.targetId, parsed.data.text));
  });

  socket.on("game2:answer", (payload, cb) => {
    const parsed = z.object({ questionId: z.string(), text: z.string().max(240) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(fauxFan.answer(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.questionId, parsed.data.text));
  });

  socket.on("game2:vote", (payload, cb) => {
    const parsed = z.object({ targetId: z.string() }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(fauxFan.vote(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.targetId));
  });

  socket.on("game2:guess", (payload, cb) => {
    const parsed = z.object({ guess: z.string().max(120) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(fauxFan.submitGuess(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.guess));
  });

  socket.on("game2:guess-vote", (payload, cb) => {
    const parsed = z.object({ accepted: z.boolean() }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(fauxFan.voteGuess(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.accepted));
  });

  socket.on("game4:request-state", (cb) => {
    const snapshot = tierlist.snapshot(socket.data.roomCode ?? "", socket.data.playerId ?? "");
    if (!snapshot) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });
    cb?.({ ok: true, snapshot });
  });

  socket.on("game4:place", (payload, cb) => {
    const parsed = z.object({ itemId: z.number().int(), tier: z.enum(["S", "A", "B", "C", "D"]).nullable() }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(tierlist.place(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.itemId, parsed.data.tier));
  });

  socket.on("game4:validate", (cb) => {
    cb?.(tierlist.validate(socket.data.roomCode ?? "", socket.data.playerId ?? ""));
  });

  socket.on("game4:guess", (payload, cb) => {
    const parsed = z.object({ text: z.string().max(160) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(tierlist.guess(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.text));
  });

  socket.on("game4:judge", (payload, cb) => {
    const parsed = z.object({ guessId: z.string(), accepted: z.boolean() }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(tierlist.judge(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.guessId, parsed.data.accepted));
  });

  socket.on("game5:request-state", (cb) => {
    const snapshot = rorschach.snapshot(socket.data.roomCode ?? "", socket.data.playerId ?? "");
    if (!snapshot) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });
    cb?.({ ok: true, snapshot });
  });

  socket.on("game5:stroke", (payload, cb) => {
    const parsed = z.object({ points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(2).max(500) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(rorschach.addStroke(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.points));
  });

  socket.on("game5:undo", (cb) => {
    cb?.(rorschach.undo(socket.data.roomCode ?? "", socket.data.playerId ?? ""));
  });

  socket.on("game5:erase", (payload, cb) => {
    const parsed = z.object({ points: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(1).max(500) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(rorschach.erase(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.points));
  });

  socket.on("game5:validate", (cb) => {
    cb?.(rorschach.validate(socket.data.roomCode ?? "", socket.data.playerId ?? ""));
  });

  socket.on("game5:guess", (payload, cb) => {
    const parsed = z.object({ text: z.string().max(160) }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(rorschach.guess(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.text));
  });

  socket.on("game5:judge", (payload, cb) => {
    const parsed = z.object({ guessId: z.string(), accepted: z.boolean() }).safeParse(payload);
    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });
    cb?.(rorschach.judge(socket.data.roomCode ?? "", socket.data.playerId ?? "", parsed.data.guessId, parsed.data.accepted));
  });

  socket.on("game3:request-state", (cb) => {
    const roomCode = socket.data.roomCode ?? "";
    const snapshot = petitBac.snapshot(roomCode);
    if (!snapshot) return cb?.({ ok: false, error: "GAME_NOT_FOUND" });
    cb?.({ ok: true, snapshot });
  });

  socket.on("game3:navigate", (payload, cb) => {
    const room = getRoom(socket.data.roomCode ?? "");
    if (!room) return cb?.({ ok: false, error: "ROOM_NOT_FOUND" });
    if (room.gameId !== "game-3") return cb?.({ ok: false, error: "WRONG_GAME" });
    if (room.hostId !== socket.data.playerId) {
      return cb?.({ ok: false, error: "NOT_HOST" });
    }

    const parsed = z.object({
      direction: z.enum(["next", "previous"]),
    }).safeParse(payload);

    if (!parsed.success) return cb?.({ ok: false, error: "INVALID_DATA" });

    const result = parsed.data.direction === "next"
      ? petitBac.next(room.code)
      : petitBac.previous(room.code);

    cb?.(result);
  });

  socket.on("game3:submit", (payload, cb) => {
    const roomCode = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;

    if (!roomCode || !playerId) {
      return cb?.({ ok: false, error: "NOT_IN_ROOM" });
    }

    const parsed = z.object({
      answers: z.record(z.string(), z.string().max(100)),
    }).safeParse(payload);

    if (!parsed.success) {
      return cb?.({ ok: false, error: "INVALID_DATA" });
    }

    const result = petitBac.submit(roomCode, playerId, parsed.data.answers);
    cb?.(result);
  });

  socket.on("game3:vote", (payload, cb) => {
    const parsed = z.object({
      category: z.string(),
      vote: z.enum(["accept", "reject"]),
    }).safeParse(payload);

    if (!parsed.success || !PETIT_BAC_CATEGORY_IDS.includes(parsed.data.category as PetitBacCategory)) {
      return cb?.({ ok: false, error: "INVALID_DATA" });
    }

    const result = petitBac.vote(
      socket.data.roomCode ?? "",
      socket.data.playerId ?? "",
      parsed.data.category as PetitBacCategory,
      parsed.data.vote,
    );

    cb?.(result);
  });

  socket.on("disconnect", () => {
    const roomCode = socket.data.roomCode as string | undefined;
    const playerId = socket.data.playerId as string | undefined;

    const result = removePlayerBySocket(socket.id);

    if (roomCode && playerId) {
      petitBac.removePlayer(roomCode, playerId);
      theOuCafe.removePlayer(roomCode, playerId);
      fauxFan.removePlayer(roomCode, playerId);
      tierlist.removePlayer(roomCode, playerId);
      rorschach.removePlayer(roomCode, playerId);
    }

    if (result && result.room.players.size > 0) {
      io.to(result.room.code).emit("room:updated", serializeRoom(result.room));
    } else if (roomCode) {
      petitBac.clear(roomCode);
      theOuCafe.clear(roomCode);
      fauxFan.clear(roomCode);
      tierlist.clear(roomCode);
      rorschach.clear(roomCode);
    }
  });
});

app.listen({ port: PORT, host: "0.0.0.0" }).then(() => {
  app.log.info(`RoomHub backend on http://localhost:${PORT}`);
});
