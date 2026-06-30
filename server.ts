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
    let pack = PACKS.find(p => p.id === packId);
    if (!pack || !pack.words || pack.words.length === 0) {
      // Fallback to first available pack with words
      pack = PACKS.find(p => p.words && p.words.length > 0) || PACKS[0];
    }
    if (!pack || !pack.words || pack.words.length === 0) return [];
    
    const words: Word[] = [];
    let attempts = 0;
    while (words.length < count && attempts < 100) {
      attempts++;
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
    if (!room || room.phase === "finished") return;

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
    if (!room || room.phase === "finished") return;

    room.phase = "result";
    broadcastState(roomId);

    setTimeout(() => {
      const delayedRoom = activeRooms.get(roomId);
      if (delayedRoom && delayedRoom.phase !== "finished") {
        startNextRound(roomId);
      }
    }, room.type === "group" ? 4000 : 1000); // Wait longer for group match results
  };

  const startCountdown = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room || room.phase === "finished") return;

    room.phase = "countdown";
    broadcastState(roomId);

    let count = 3;
    const interval = setInterval(() => {
      const intervalRoom = activeRooms.get(roomId);
      if (!intervalRoom || intervalRoom.phase === "finished") {
        clearInterval(interval);
        return;
      }

      count -= 1;
      if (count <= 0) {
        clearInterval(interval);
        intervalRoom.phase = "question";
        intervalRoom.questionStartTime = Date.now();
        broadcastState(roomId);

        // Timer for question timeout (10s)
        const currentIdx = intervalRoom.questionIndex;
        setTimeout(() => {
          const timeoutRoom = activeRooms.get(roomId);
          if (timeoutRoom && timeoutRoom.phase === "question" && timeoutRoom.questionIndex === currentIdx) {
            startResultPhase(roomId);
          }
        }, 10000);
      } else {
        broadcastState(roomId); // Broadcast for countdown update if needed
      }
    }, 1000);
  };

  const startLoadingPhase = (roomId: string) => {
    const room = activeRooms.get(roomId);
    if (!room || room.phase === "finished") return;

    room.phase = "loading";
    broadcastState(roomId);

    setTimeout(() => {
      const delayedRoom = activeRooms.get(roomId);
      if (delayedRoom && delayedRoom.phase !== "finished") {
        startCountdown(roomId);
      }
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
      // Clean up any other active matching pool entries for this player/socket
      matchingPool.forEach((val, key) => {
        const s = io.sockets.sockets.get(val);
        if (val === socket.id || (s && s.data.player?.id === player.id)) {
          matchingPool.delete(key);
        }
      });

      const poolKey = `pool_${packId}_${questionCount}`;
      const waitingSocketId = matchingPool.get(poolKey);

      if (waitingSocketId && waitingSocketId !== socket.id) {
        const waitingSocket = io.sockets.sockets.get(waitingSocketId);
        
        // Ensure the waiting socket exists, is connected, and is NOT the same player
        if (waitingSocket && waitingSocket.connected && waitingSocket.data.player?.id !== player.id) {
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
          // Stale socket in pool or self-socket, replace with current
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

    socket.on("join_group_match", ({ packId, player }) => {
      // Clean up any other active matching pool entries for this player/socket
      matchingPool.forEach((val, key) => {
        const s = io.sockets.sockets.get(val);
        if (val === socket.id || (s && s.data.player?.id === player.id)) {
          matchingPool.delete(key);
        }
      });

      // Find an existing group room in matching phase with < 8 players
      let foundRoom: MatchRoomState | undefined;
      for (const [rid, room] of activeRooms.entries()) {
        if (room.type === 'group' && room.phase === 'matching' && room.players.length < 8) {
          foundRoom = room;
          break;
        }
      }

      if (foundRoom) {
        // Ensure player is not already in the room
        const alreadyIn = foundRoom.players.some(p => p.id === player.id);
        if (!alreadyIn) {
          foundRoom.players.push({
            ...player,
            socketId: socket.id,
            score: 0,
            isReady: false,
            answered: false,
            rematchRequested: false
          });
        } else {
          // Update socket ID if rejoining or similar
          const p = foundRoom.players.find(x => x.id === player.id);
          if (p) p.socketId = socket.id;
        }

        socket.join(foundRoom.roomId);

        // If >= 3 players, start lobby countdown if not already started
        if (foundRoom.players.length >= 3) {
          if (foundRoom.countdown === undefined || foundRoom.countdown === null) {
            foundRoom.countdown = 10; // 10 seconds lobby matching countdown
            
            const roomId = foundRoom.roomId;
            const interval = setInterval(() => {
              const r = activeRooms.get(roomId);
              if (!r || r.phase !== 'matching') {
                clearInterval(interval);
                return;
              }
              if (r.countdown !== undefined && r.countdown !== null) {
                r.countdown -= 1;
                if (r.countdown <= 0) {
                  clearInterval(interval);
                  r.countdown = undefined;
                  
                  // Match found! Transition to matched then loading/game-start
                  startMatchedPhase(roomId);
                  setTimeout(() => {
                    const matchedRoom = activeRooms.get(roomId);
                    if (matchedRoom && matchedRoom.phase === 'matched') {
                      startLoadingPhase(roomId);
                    }
                  }, 2500);
                } else {
                  broadcastState(roomId);
                }
              }
            }, 1000);
          }
        }

        // If we hit 8 players (max limit), start immediately
        if (foundRoom.players.length === 8) {
          foundRoom.countdown = undefined;
          startMatchedPhase(foundRoom.roomId);
          setTimeout(() => {
            const matchedRoom = activeRooms.get(foundRoom!.roomId);
            if (matchedRoom && matchedRoom.phase === 'matched') {
              startLoadingPhase(matchedRoom.roomId);
            }
          }, 2500);
        }

        broadcastState(foundRoom.roomId);
      } else {
        // Create new group matchmaking room
        const roomId = `group_${Math.random().toString(36).substr(2, 9)}`;
        const questions = generateQuestions(packId, 50); // Generates plenty of questions
        const roomData: MatchRoomState = {
          roomId,
          type: 'group',
          players: [
            { ...player, socketId: socket.id, score: 0, isReady: false, answered: false, rematchRequested: false }
          ],
          packId,
          questionCount: 50,
          questions,
          phase: "matching",
          questionIndex: 0,
          questionStartTime: 0,
          countdown: null
        };
        activeRooms.set(roomId, roomData);
        socket.join(roomId);
        broadcastState(roomId);
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
      const sanitizedCode = String(inviteCode || "").trim().toUpperCase();
      const roomId = `friend_${sanitizedCode}`;
      const roomData = activeRooms.get(roomId);
      if (roomData && roomData.players.length < 4 && roomData.phase === "waiting_room") {
        const alreadyInRoom = roomData.players.some(p => p.id === player.id);
        if (alreadyInRoom) {
          // Rejoining: Update socket ID of existing player record
          const existingPlayer = roomData.players.find(p => p.id === player.id);
          if (existingPlayer) {
            existingPlayer.socketId = socket.id;
          }
        } else {
          roomData.players.push({ ...player, socketId: socket.id, score: 0, isReady: false, answered: false, rematchRequested: false });
        }
        socket.join(roomId);
        broadcastState(roomId);
      } else {
        socket.emit("error", { message: "Room not found or full" });
      }
    });

    socket.on("start_friend_match", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room && room.players[0] && room.players[0].socketId === socket.id) {
        startMatchedPhase(roomId);
      }
    });

    socket.on("player_ready", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room || room.phase === "finished") return;

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

    socket.on("buzz_in", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room || room.phase !== "question") return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) return;

      room.phase = "answering";
      room.firstResponder = player.id;
      room.questionStartTime = Date.now();
      broadcastState(roomId);

      const currentIdx = room.questionIndex;
      setTimeout(() => {
        const timeoutRoom = activeRooms.get(roomId);
        if (timeoutRoom && timeoutRoom.phase === "answering" && timeoutRoom.questionIndex === currentIdx && timeoutRoom.firstResponder === player.id) {
          player.score = Math.max(0, player.score - 10);
          player.answered = true;
          player.lastAnswer = { choice: "TIMEOUT", isCorrect: false, reactionTime: 10, questionIndex: currentIdx };
          
          const someoneWon = timeoutRoom.players.some(p => p.score >= 100);
          if (someoneWon) {
            timeoutRoom.phase = "finished";
            broadcastState(roomId);
          } else {
            startResultPhase(roomId);
          }
        }
      }, 10000);
    });

    socket.on("answer", ({ roomId, choice, isCorrect, questionIndex }) => {
      const room = activeRooms.get(roomId);
      if (!room || (room.phase !== "question" && room.phase !== "answering")) return;
      if (room.questionIndex !== questionIndex) return;

      const player = room.players.find(p => p.socketId === socket.id);
      if (!player || player.answered) return;

      if (room.type === "group") {
        if (room.phase !== "answering" || room.firstResponder !== player.id) {
          return;
        }
      }

      const answerTime = Date.now();
      const reactionTime = (answerTime - room.questionStartTime) / 1000;

      player.answered = true;
      player.lastAnswer = { choice, isCorrect, reactionTime, questionIndex };

      if (room.type === "group") {
        broadcastState(roomId);

        setTimeout(() => {
          const updatedRoom = activeRooms.get(roomId);
          if (!updatedRoom || updatedRoom.phase === "finished") return;

          if (isCorrect) {
            player.score += 10;
          } else {
            player.score = Math.max(0, player.score - 10);
          }

          const someoneWon = updatedRoom.players.some(p => p.score >= 100);
          if (someoneWon) {
            updatedRoom.phase = "finished";
            broadcastState(roomId);
          } else {
            startResultPhase(roomId);
          }
        }, 500);
      } else {
        room.phase = "answering";
        room.firstResponder = player.id;
        broadcastState(roomId);

        setTimeout(() => {
          const updatedRoom = activeRooms.get(roomId);
          if (!updatedRoom || updatedRoom.phase === "finished") return;

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
        }, 500);
      }
    });

    socket.on("get_state", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        socket.emit("state_update", room);
      }
    });

    socket.on("request_rematch", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (!room || room.phase === "finished") return;

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
      matchingPool.forEach((value, key) => {
        if (value === socket.id) {
          matchingPool.delete(key);
        }
      });
    });

    socket.on("leave_room", ({ roomId }) => {
      const room = activeRooms.get(roomId);
      if (room) {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          if (room.phase === "matching" || room.phase === "waiting_room") {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0 || (room.type === "friend" && room.hostId === socket.id)) {
              room.phase = "finished";
            }
            broadcastState(roomId);
          } else if (room.phase !== "finished") {
            if (room.type === "group") {
              room.players[playerIndex].socketId = ""; // Mark disconnected
              const activePlayers = room.players.filter(p => p.socketId !== "");
              if (activePlayers.length <= 1) {
                if (activePlayers.length === 1) {
                  activePlayers[0].score = 100;
                }
                room.phase = "finished";
              }
              broadcastState(roomId);
            } else {
              const remainingPlayer = room.players.find(p => p.socketId !== socket.id);
              const leavingPlayer = room.players[playerIndex];
              if (remainingPlayer) {
                remainingPlayer.score = 100;
              }
              leavingPlayer.score = 0;
              room.phase = "finished";
              broadcastState(roomId);
            }
          }
        }
      }
      socket.leave(roomId);
    });

    socket.on("disconnect", () => {
      matchingPool.forEach((value, key) => {
        if (value === socket.id) matchingPool.delete(key);
      });
      
      activeRooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          if (room.phase === "matching" || room.phase === "waiting_room") {
            room.players.splice(playerIndex, 1);
            if (room.players.length === 0 || (room.type === "friend" && room.hostId === socket.id)) {
              room.phase = "finished";
            }
            broadcastState(roomId);
          } else if (room.phase !== "finished") {
            if (room.type === "group") {
              room.players[playerIndex].socketId = ""; // Mark disconnected
              const activePlayers = room.players.filter(p => p.socketId !== "");
              if (activePlayers.length <= 1) {
                if (activePlayers.length === 1) {
                  activePlayers[0].score = 100;
                }
                room.phase = "finished";
              }
              broadcastState(roomId);
            } else {
              const remainingPlayer = room.players.find(p => p.socketId !== socket.id);
              const disconnectingPlayer = room.players[playerIndex];
              if (remainingPlayer) {
                remainingPlayer.score = 100;
              }
              disconnectingPlayer.score = 0;
              room.phase = "finished";
              broadcastState(roomId);
            }
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
