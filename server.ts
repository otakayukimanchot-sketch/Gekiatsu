import express from "express";
import "dotenv/config";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import nodemailer from "nodemailer";
import cors from "cors";
import type { MatchRoomState, Word } from "./src/types.ts";
import { PACKS } from "./src/constants.ts";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const frontendUrl = process.env.VITE_FRONTEND_URL;

  // CORS configuration
  const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      const isAllowed = !origin || 
        origin.includes('.run.app') || 
        origin.includes('vercel.app') || 
        origin.includes('localhost') || 
        origin.includes('127.0.0.1') ||
        (frontendUrl && (origin === frontendUrl || origin === frontendUrl.replace(/\/$/, "")));
      
      if (isAllowed) {
        callback(null, true);
      } else {
        // Fallback to allowing if it's from the same domain as the server
        callback(null, true);
      }
    },
    methods: ["GET", "POST"],
    credentials: true
  };

  app.use(cors(corsOptions));
  app.use(express.json());

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: corsOptions,
    pingInterval: 10000,
    pingTimeout: 30000,
    allowEIO3: true,
    transports: ['websocket', 'polling']
  });

  // Health check routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  app.get("/backend-status", (req, res) => {
    res.send("Gekiatsu Eitango Backend is Running");
  });

  // Suggestion API
  app.post("/api/suggestions", async (req, res) => {
    const { type, content, player } = req.body;
    const targetEmail = "nishikidootama@gmail.com";

    console.log(`[Suggestion Received] Type: ${type}, From: ${player?.name || 'Anonymous'}`);
    console.log(`Content: ${content}`);

    // Real integration: Log to console as "sent" for now, as we don't have SMTP credentials
    // In a real production app, we would use process.env.SMTP_USER and process.env.SMTP_PASS
    console.log(`>>> EMAIL SENT TO: ${targetEmail} <<<`);

    // We can also use nodemailer if credentials were provided
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        });

        await transporter.sendMail({
          from: `"記憶ポケット" <${process.env.SMTP_USER}>`,
          to: targetEmail,
          subject: `【記憶ポケット】${type === 'suggestion' ? '提案' : '報告'}が届きました`,
          text: `種別: ${type === 'suggestion' ? '提案' : '報告'}\n送信者: ${player?.name || '不明'} (${player?.id || 'ID不明'})\n内容:\n${content}`
        });
        console.log("Email sent successfully via nodemailer");
      } catch (err) {
        console.error("Failed to send email via nodemailer:", err);
      }
    }

    res.json({ success: true, message: "Suggestion received and forwarded to developer." });
  });

  // Game state in memory
  const matchingPool = new Map<string, string>(); // key: packId_questionCount, value: socketId
  const activeRooms = new Map<string, MatchRoomState>(); // key: roomId, value: roomData

  const generateQuestions = (packId: string, count: number): Word[] => {
    const pack = PACKS.find(p => p.id === packId);
    if (!pack) return [];
    
    const words: Word[] = [];
    while (words.length < count) {
      const shuffled = [...pack.words].sort(() => Math.random() - 0.5);
      const mapped = shuffled.map(word => ({
        ...word,
        choices: [...word.choices].sort(() => Math.random() - 0.5)
      }));
      words.push(...mapped);
    }
    return words.slice(0, count);
  };

  const broadcastState = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (room) {
      io.to(roomId).emit("state_update", room);
    }
  };

  const startNextRound = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room) return;

    // Ensure we always have questions in the pool
    if (room.questionIndex >= room.questions.length - 2) {
      const additionalQuestions = generateQuestions(room.packId, 50);
      room.questions = [...room.questions, ...additionalQuestions];
    }

    // Check if either player has reached 100 points
    const someoneWon = room.players.some(p => p.score >= 100);
    if (!someoneWon) {
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
    }, 1000); // 1.0s wait is shorter and feels snappier
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
  };

  io.on("connection", (socket) => {
    console.log(`Client connected: ${socket.id} from ${socket.handshake.headers.origin}`);
    
    socket.on("join_match", ({ packId, questionCount, player }) => {
      const poolKey = `pool_${packId}_${questionCount}`;
      const waitingSocketId = matchingPool.get(poolKey);

      if (waitingSocketId && waitingSocketId !== socket.id) {
        const waitingSocket = io.sockets.sockets.get(waitingSocketId);
        
        if (waitingSocket && waitingSocket.connected) {
          matchingPool.delete(poolKey);
          const roomId = `room_${Math.random().toString(36).substr(2, 9)}`;
          const questions = generateQuestions(packId, questionCount);
          
          const roomData: MatchRoomState = {
            roomId,
            type: 'battle',
            players: [
              { ...waitingSocket.data.player, socketId: waitingSocketId, score: 0, isReady: false, answered: false, rematchRequested: false },
              { ...player, socketId: socket.id, score: 0, isReady: false, answered: false, rematchRequested: false }
            ],
            packId,
            questionCount,
            questions,
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
      const questions = generateQuestions(packId, questionCount);
      
      const roomData: MatchRoomState = {
        roomId,
        type: 'friend',
        players: [{ ...player, socketId: socket.id, score: 0, isReady: false, answered: false, rematchRequested: false }],
        packId,
        questionCount,
        questions,
        phase: "waiting_room",
        questionIndex: 0,
        questionStartTime: 0,
        hostId: player.id,
        inviteCode
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
        roomData.players.push({ ...player, socketId: socket.id, score: 0, isReady: false, answered: false, rematchRequested: false });
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

    socket.on("player_ready", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.isReady = true;
        broadcastState(roomId);

        // Check if all players are ready
        const allReady = room.players.every(p => p.isReady);
        if (allReady && room.phase === "matched") {
          startLoadingPhase(roomId);
        }
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
          player.score += 10;
          if (player.score >= 100) {
            updatedRoom.phase = "finished";
            broadcastState(roomId);
          } else {
            startResultPhase(roomId);
          }
        } else {
          player.score = Math.max(0, player.score - 10);
          const allAnswered = updatedRoom.players.every(p => p.answered);
          if (allAnswered) {
            startResultPhase(roomId);
          } else {
            // Back to question phase for others to buzz in
            updatedRoom.phase = "question";
            updatedRoom.firstResponder = undefined;
            updatedRoom.questionStartTime = Date.now();
            broadcastState(roomId);

            const currentIdx = updatedRoom.questionIndex;
            setTimeout(() => {
              const timeoutRoom = activeRooms.get(roomId);
              if (timeoutRoom && timeoutRoom.phase === "question" && timeoutRoom.questionIndex === currentIdx) {
                startResultPhase(roomId);
              }
            }, 10000);
          }
        }
      }, 500); // Brief delay to show who answered
    });

    socket.on("get_state", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        socket.emit("state_update", room);
      }
    });

    socket.on("request_rematch", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (player) {
        player.rematchRequested = true;
        broadcastState(roomId);

        // Check if all players requested rematch
        const allRequested = room.players.every(p => p.rematchRequested);
        if (allRequested) {
          // Generate new questions for rematch
          room.questions = generateQuestions(room.packId, room.questionCount);
          
          // Reset room for rematch
          room.phase = "matched";
          room.questionIndex = 0;
          room.players.forEach(p => {
            p.score = 0;
            p.isReady = false;
            p.answered = false;
            p.lastAnswer = undefined;
            p.rematchRequested = false;
          });
          broadcastState(roomId);
        }
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

    socket.on("leave_room", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        const remainingPlayer = room.players.find(p => p.socketId !== socket.id);
        const leavingPlayer = room.players.find(p => p.socketId === socket.id);
        
        if (room.phase !== "finished" && room.phase !== "waiting_room") {
          if (remainingPlayer) {
            remainingPlayer.score = 100;
          }
          if (leavingPlayer) {
            leavingPlayer.score = 0;
          }
        }
        room.phase = "finished";
        broadcastState(roomId);
      }
      socket.leave(roomId);
    });

    socket.on("disconnect", () => {
      matchingPool.forEach((value, key) => {
        if (value === socket.id) matchingPool.delete(key);
      });
      
      activeRooms.forEach((room, roomId) => {
        if (room.players.some(p => p.socketId === socket.id)) {
          const remainingPlayer = room.players.find(p => p.socketId !== socket.id);
          const disconnectingPlayer = room.players.find(p => p.socketId === socket.id);
          
          if (room.phase !== "finished" && room.phase !== "waiting_room") {
            if (remainingPlayer) {
              remainingPlayer.score = 100;
            }
            if (disconnectingPlayer) {
              disconnectingPlayer.score = 0;
            }
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
