import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import type { MatchRoomState } from "./src/types.ts";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const PORT = 3000;

  // Game state in memory
  const matchingPool = new Map<string, string>(); // key: packId_questionCount, value: socketId
  const activeRooms = new Map<string, MatchRoomState>(); // key: roomId, value: roomData

  const broadcastState = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (room) {
      io.to(roomId).emit("state_update", room);
    }
  };

  const startNextRound = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    if (room.questionIndex < room.questionCount - 1) {
      room.questionIndex += 1;
      room.phase = "question";
      room.questionStartTime = Date.now();
      room.firstResponder = undefined;
      room.players.forEach(p => {
        p.answered = false;
        p.lastAnswer = undefined;
      });
      broadcastState(roomId);
      
      // Timer for question timeout (10s)
      const currentIdx = room.questionIndex;
      setTimeout(() => {
        const timeoutRoom = activeRooms.get(roomId);
        if (timeoutRoom && timeoutRoom.phase === "question" && timeoutRoom.questionIndex === currentIdx) {
          startResultPhase(roomId);
        }
      }, 10000);
    } else {
      room.phase = "finished";
      broadcastState(roomId);
    }
  };

  const startResultPhase = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.phase = "result";
    broadcastState(roomId);

    setTimeout(() => {
      startNextRound(roomId);
    }, 1500); // 1.5s wait as requested
  };

  const startCountdown = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.phase = "countdown";
    broadcastState(roomId);

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        room.phase = "question";
        room.questionStartTime = Date.now();
        broadcastState(roomId);

        // Timer for question timeout (10s)
        const currentIdx = room.questionIndex;
        setTimeout(() => {
          const timeoutRoom = activeRooms.get(roomId);
          if (timeoutRoom && timeoutRoom.phase === "question" && timeoutRoom.questionIndex === currentIdx) {
            startResultPhase(roomId);
          }
        }, 10000);
      } else {
        broadcastState(roomId); // Broadcast for countdown update if needed (though client can handle local countdown, server-side is safer for sync)
      }
    }, 1000);
  };

  const startLoadingPhase = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.phase = "loading";
    broadcastState(roomId);

    setTimeout(() => {
      startCountdown(roomId);
    }, 2000); // Brief loading time
  };

  const startMatchedPhase = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.phase = "matched";
    broadcastState(roomId);

    setTimeout(() => {
      startLoadingPhase(roomId);
    }, 2000); // Brief matched display
  };

  io.on("connection", (socket) => {
    console.log("a user connected", socket.id);

    socket.on("join_match", ({ packId, questionCount, player }) => {
      const poolKey = `pool_${packId}_${questionCount}`;
      const waitingSocketId = matchingPool.get(poolKey);

      if (waitingSocketId && waitingSocketId !== socket.id) {
        const waitingSocket = io.sockets.sockets.get(waitingSocketId);
        
        if (waitingSocket && waitingSocket.connected) {
          matchingPool.delete(poolKey);
          const roomId = `room_${Math.random().toString(36).substr(2, 9)}`;
          
          const roomData: MatchRoomState = {
            roomId,
            type: 'battle',
            players: [
              { ...waitingSocket.data.player, socketId: waitingSocketId, score: 0, isReady: false, answered: false },
              { ...player, socketId: socket.id, score: 0, isReady: false, answered: false }
            ],
            packId,
            questionCount,
            phase: "matching",
            questionIndex: 0,
            questionStartTime: 0
          };

          activeRooms.set(roomId, roomData);
          socket.join(roomId);
          waitingSocket.join(roomId);
          
          startMatchedPhase(roomId);
        } else {
          // Stale socket in pool, replace with current
          socket.data.player = player;
          matchingPool.set(poolKey, socket.id);
          socket.emit("state_update", { 
            roomId: `waiting_${socket.id}`,
            phase: "matching", 
            players: [{ ...player, score: 0, isReady: false, answered: false, socketId: socket.id }],
            packId,
            questionCount,
            type: 'battle',
            questionIndex: 0,
            questionStartTime: 0
          });
        }
      } else {
        socket.data.player = player;
        matchingPool.set(poolKey, socket.id);
        socket.emit("state_update", { 
          roomId: `waiting_${socket.id}`,
          phase: "matching", 
          players: [{ ...player, score: 0, isReady: false, answered: false, socketId: socket.id }],
          packId,
          questionCount,
          type: 'battle',
          questionIndex: 0,
          questionStartTime: 0
        });
      }
    });

    socket.on("create_friend_match", ({ packId, questionCount, player }) => {
      const inviteCode = Math.random().toString(36).substr(2, 6).toUpperCase();
      const roomId = `friend_${inviteCode}`;
      
      const roomData: MatchRoomState = {
        roomId,
        type: 'friend',
        players: [{ ...player, socketId: socket.id, score: 0, isReady: false, answered: false }],
        packId,
        questionCount,
        phase: "waiting_room",
        questionIndex: 0,
        questionStartTime: 0,
        hostId: player.id
      };

      activeRooms.set(roomId, roomData);
      socket.join(roomId);
      socket.emit("friend_match_created", { inviteCode, roomId });
      broadcastState(roomId);
    });

    socket.on("join_friend_match", ({ inviteCode, player }) => {
      const roomId = `friend_${inviteCode}`;
      const roomData = activeRooms.get(roomId);
      if (roomData && roomData.players.length < 4 && roomData.phase === "waiting_room") {
        roomData.players.push({ ...player, socketId: socket.id, score: 0, isReady: false, answered: false });
        socket.join(roomId);
        broadcastState(roomId);
      } else {
        socket.emit("error", { message: "Room not found or full" });
      }
    });

    socket.on("start_friend_match", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room && room.players[0].socketId === socket.id) {
        startMatchedPhase(roomId);
      }
    });

    socket.on("answer", ({ roomId, choice, isCorrect, questionIndex }) => {
      const room = activeRooms.get(roomId);
      if (!room || (room.phase !== "question" && room.phase !== "answering")) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.answered) return;

      const answerTime = Date.now();
      const reactionTime = (answerTime - room.questionStartTime) / 1000;

      player.answered = true;
      player.lastAnswer = { choice, isCorrect, reactionTime, questionIndex };

      // Phase change to answering
      room.phase = "answering";
      room.firstResponder = player.id;
      broadcastState(roomId);

      setTimeout(() => {
        const updatedRoom = activeRooms.get(roomId);
        if (!updatedRoom) return;

        if (isCorrect) {
          player.score += 1;
          startResultPhase(roomId);
        } else {
          const allAnswered = updatedRoom.players.every(p => p.answered);
          if (allAnswered) {
            startResultPhase(roomId);
          } else {
            // Back to question phase for others
            updatedRoom.phase = "question";
            updatedRoom.firstResponder = undefined;
            broadcastState(roomId);
          }
        }
      }, 500); // Brief delay to show who answered
    });

    socket.on("rematch", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        // Reset room for rematch
        room.phase = "countdown";
        room.questionIndex = 0;
        room.players.forEach(p => {
          p.score = 0;
          p.isReady = false;
          p.answered = false;
          p.lastAnswer = undefined;
        });
        broadcastState(roomId);
        startCountdown(roomId);
      }
    });

    socket.on("cancel_match", () => {
      for (const [key, value] of matchingPool.entries()) {
        if (value === socket.id) {
          matchingPool.delete(key);
          break;
        }
      }
    });

    socket.on("disconnect", () => {
      matchingPool.forEach((value, key) => {
        if (value === socket.id) matchingPool.delete(key);
      });
      
      activeRooms.forEach((room, roomId) => {
        if (room.players.some(p => p.socketId === socket.id)) {
          // In a real app, handle player disconnection better
          // For now, just end the game if it's a battle
          if (room.type === 'battle') {
            room.phase = "finished";
            broadcastState(roomId);
          }
        }
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
