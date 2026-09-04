import { io } from "socket.io-client";

const socketUrl = import.meta.env.DEV
  ? "http://localhost:3001"
  : "https://api.lasandboxdedraze.xyz";

export const socket = io(socketUrl, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 10000,
});
