import { randomInt, randomUUID } from "node:crypto";
import type { GameId, Player, Room, RoomSettings } from "./types.js";

const rooms = new Map<string, Room>();
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode() {
  for (;;) {
    let code = "";
    for (let i = 0; i < 5; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    if (!rooms.has(code)) return code;
  }
}

export function createRoom(
  gameId: GameId,
  host: Omit<Player, "isHost" | "joinedAt" | "reconnectToken">,
  settings: RoomSettings,
) {
  const player: Player = {
    ...host,
    isHost: true,
    joinedAt: Date.now(),
    reconnectToken: randomUUID(),
  };
  const room: Room = {
    code: generateCode(),
    gameId,
    hostId: player.id,
    players: new Map([[player.id, player]]),
    settings,
    createdAt: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

export const getRoom = (code: string) => rooms.get(code.toUpperCase());

export function addPlayer(
  room: Room,
  player: Omit<Player, "isHost" | "joinedAt" | "reconnectToken">,
) {
  if (room.players.size >= room.settings.maxPlayers) throw new Error("ROOM_FULL");
  const p: Player = {
    ...player,
    isHost: false,
    joinedAt: Date.now(),
    reconnectToken: randomUUID(),
  };
  room.players.set(p.id, p);
  return p;
}

export function reconnectPlayer(room: Room, playerId: string, reconnectToken: string, socketId: string) {
  const player = room.players.get(playerId);
  if (!player || player.reconnectToken !== reconnectToken) return null;
  player.socketId = socketId;
  delete player.disconnectedAt;
  return player;
}

export function disconnectPlayerBySocket(socketId: string) {
  for (const room of rooms.values()) {
    for (const player of room.players.values()) {
      if (player.socketId !== socketId) continue;
      player.socketId = "";
      player.disconnectedAt = Date.now();
      return { room, player };
    }
  }
  return null;
}

export function removePlayerById(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  if (!room) return null;
  const player = room.players.get(playerId);
  if (!player) return null;
  room.players.delete(playerId);

  if (room.hostId === playerId && room.players.size > 0) {
    // Prefer a currently connected player when transferring the host role.
    const next = [...room.players.values()].find((p) => p.socketId) ?? room.players.values().next().value as Player;
    room.hostId = next.id;
    next.isHost = true;
  }

  return { room, player };
}

export function removeRoom(roomCode: string) {
  return rooms.delete(roomCode.toUpperCase());
}

export function hasConnectedPlayers(room: Room) {
  for (const player of room.players.values()) if (player.socketId) return true;
  return false;
}

export function serializeRoom(room: Room) {
  return {
    code: room.code,
    gameId: room.gameId,
    hostId: room.hostId,
    settings: room.settings,
    createdAt: room.createdAt,
    players: [...room.players.values()].map(({ socketId: _socketId, reconnectToken: _reconnectToken, disconnectedAt: _disconnectedAt, ...p }) => p),
  };
}
