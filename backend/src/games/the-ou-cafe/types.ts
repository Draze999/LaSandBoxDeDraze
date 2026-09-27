import type { TheOuCafeCategory } from "./constants.js";

export type TheOuCafeQuestion = {
  id: string;
  authorId: string;
  left: string;
  right: string;
  chosen: "left" | "right" | "neither" | null;
  createdAt: number;
};

export type TheOuCafeAnswer = {
  id: string;
  authorId: string;
  text: string;
  status: "pending" | "accepted" | "rejected";
  createdAt: number;
};

export type TheOuCafeOption = {
  id: number;
  name: string;
  imageUrl?: string | null;
  animeName?: string | null;
};

export type TheOuCafeSnapshot = {
  category: TheOuCafeCategory;
  phase: "choosing" | "playing" | "finished";
  targetPlayerId: string;
  options?: TheOuCafeOption[];
  secret?: { id: number; name: string; imageUrl?: string | null; animeName?: string | null };
  questions: TheOuCafeQuestion[];
  answers: TheOuCafeAnswer[];
  questionCount: number;
  winnerId: string | null;
  roundScores: Record<string, number>;
  cumulativeScores: Record<string, number>;
  roundNumber: number;
};
