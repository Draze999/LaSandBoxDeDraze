export type GameId = "game-1" | "game-2" | "game-3" | "game-4";

export type Player = {
  id: string;
  pseudo: string;
  socketId: string;
  isHost: boolean;
  joinedAt: number;
};

export type RoomSettings = {
  name: string;
  maxPlayers: number;
  private: boolean;
  gameSettings?: {
    timeLimit?: number;
    theOuCafeCategory?: "anime" | "character";
  };
};

export type Room = {
  code: string;
  gameId: GameId;
  hostId: string;
  players: Map<string, Player>;
  settings: RoomSettings;
  createdAt: number;
};
