import { randomInt } from "node:crypto";
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
export function createRoom(gameId: GameId, host: Omit<Player,"isHost"|"joinedAt">, settings: RoomSettings) {
  const player: Player = {...host, isHost:true, joinedAt:Date.now()};
  const room: Room = {code:generateCode(), gameId, hostId:player.id, players:new Map([[player.id,player]]), settings, createdAt:Date.now()};
  rooms.set(room.code, room); return room;
}
export const getRoom = (code:string) => rooms.get(code.toUpperCase());
export function addPlayer(room:Room, player:Omit<Player,"isHost"|"joinedAt">) {
  if (room.players.size >= room.settings.maxPlayers) throw new Error("ROOM_FULL");
  const p:Player = {...player,isHost:false,joinedAt:Date.now()}; room.players.set(p.id,p); return p;
}
export function removePlayerBySocket(socketId:string) {
  for (const room of rooms.values()) for (const player of room.players.values()) {
    if (player.socketId !== socketId) continue;
    room.players.delete(player.id);
    if (room.players.size === 0) { rooms.delete(room.code); return {room,player}; }
    if (room.hostId === player.id) { const next = room.players.values().next().value as Player; room.hostId=next.id; next.isHost=true; }
    return {room,player};
  }
  return null;
}
export function serializeRoom(room:Room) {
  return {code:room.code,gameId:room.gameId,hostId:room.hostId,settings:room.settings,createdAt:room.createdAt,
    players:[...room.players.values()].map(({socketId:_socketId,...p})=>p)};
}