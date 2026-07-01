import { GoogleGenAI, Modality } from "@google/genai";
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Smile, Ghost, Rocket, Gamepad2, Zap, 
  Wifi, WifiOff, Trophy, Home, RotateCcw, 
  CheckCircle2, XCircle, Crown, Users, 
  Play, Settings, Info, ChevronRight, ChevronLeft,
  LogOut, MessageSquare, Send, Volume2, VolumeX,
  LogIn, QrCode, Scan, X, Copy, Check, Star, Share2, ExternalLink, Github,
  Search, BookOpen, Headphones, Moon, Sun, Trash2, Flame, Globe
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { QRCodeSVG } from 'qrcode.react';
import { PACKS } from './constants';
import { Pack, Word, Player, MatchRoomState } from './types';
import { auth, signOut, db, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, handleFirestoreError, OperationType } from './firebase';

// --- Icons for Player ---
const PLAYER_ICONS = [
  { id: 'smile', icon: Smile, color: 'text-yellow-500' },
  { id: 'ghost', icon: Ghost, color: 'text-purple-500' },
  { id: 'rocket', icon: Rocket, color: 'text-blue-500' },
  { id: 'gamepad', icon: Gamepad2, color: 'text-emerald-500' },
  { id: 'zap', icon: Zap, color: 'text-orange-500' },
];

// --- Audio Effects ---
const playSound = (type: 'correct' | 'wrong' | 'click') => {
  const sfx = {
    correct: 'https://cdn.pixabay.com/audio/2021/08/04/audio_bb4308a973.mp3', // Success chime
    wrong: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c35278d32e.mp3',   // Error/Fail
    click: 'https://assets.mixkit.co/sfx/preview/mixkit-modern-click-box-check-1120.mp3'
  };
  const audio = new Audio(sfx[type]);
  audio.volume = 0.5;
  audio.play().catch((e) => console.warn("Audio play blocked:", e));
};

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [view, setView] = useState<'setup' | 'tutorial' | 'home' | 'solo_packs' | 'online_lobby' | 'review_hub' | 'training_config' | 'training' | 'matching' | 'battle' | 'result' | 'suggestion' | 'friend_match_setup' | 'friend_match_waiting' | 'friend_match_join'>('setup');
  const [player, setPlayer] = useState<Player | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hasSeenTutorial, setHasSeenTutorial] = useState<boolean>(() => {
    return localStorage.getItem('pokepoke_tutorial_seen') === 'true';
  });
  const [selectedPack, setSelectedPack] = useState<Pack | null>(PACKS[0]);
  const [questionCount, setQuestionCount] = useState<number>(50);
  const [matchState, setMatchState] = useState<MatchRoomState | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [listeningCountdown, setListeningCountdown] = useState<number | null>(null);
  const [audioPlayed, setAudioPlayed] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const isPlayingAudioRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const stopAudio = () => {
    setIsAudioPlaying(false);
    isPlayingAudioRef.current = false;
    fetchInProgressRef.current = false;
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch (e) {}
      audioContextRef.current = null;
    }
    window.speechSynthesis.cancel();
  };

  const playPcmAudio = (base64Data: string, sampleRate: number = 24000) => {
    try {
      setIsAudioPlaying(true);
      isPlayingAudioRef.current = true;

      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const int16Array = new Int16Array(bytes.buffer);
      const float32Array = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32Array[i] = int16Array[i] / 32768;
      }

      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      
      const audioBuffer = audioContext.createBuffer(1, float32Array.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.start();
      audioSourceRef.current = source;

      source.onended = () => {
        if (audioSourceRef.current === source) {
          audioSourceRef.current = null;
        }
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
      };
    } catch (e) {
      console.error("Error playing PCM audio:", e);
      setIsAudioPlaying(false);
    }
  };
  const [quizQuestions, setQuizQuestions] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState(10);
  const [answerStatus, setAnswerStatus] = useState<'idle' | 'correct' | 'wrong' | 'timeout' | 'opponent_won'>('idle');
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('pokepoke_dark_mode');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [isAutoSpeechEnabled, setIsAutoSpeechEnabled] = useState<boolean>(() => {
    return localStorage.getItem('pokepoke_auto_speech') !== 'false'; // Default to true
  });
  const [answerHistory, setAnswerHistory] = useState<{ word: string, meaning: string, status: 'correct' | 'wrong' | 'lost' }[]>([]);

  // Derived Battle State
  const myState = matchState?.players?.find(p => p.id === player?.id);
  const myScore = matchState ? (myState?.score || 0) : score;
  const opponent = matchState?.players?.find(p => p.id !== player?.id);
  const opponentScore = opponent?.score || 0;
  const opponentAnswer = opponent?.lastAnswer;
  const isRematchRequested = !!myState?.rematchRequested;

  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const reconnectSocket = () => {
    if (socketRef.current) {
      console.log('Manually reconnecting socket...');
      
      // Trigger wake-up again on manual reconnect
      const isAiStudio = window.location.hostname.includes('.run.app');
      const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
      let socketUrl = window.location.origin;
      if (!isAiStudio) {
        if (backendUrl) socketUrl = backendUrl;
        else if (window.location.hostname.includes('vercel.app')) socketUrl = 'https://server-jv1l.onrender.com';
      }
      
      if (socketUrl.includes('onrender.com')) {
        fetch(`${socketUrl.replace(/\/$/, '')}/api/health`).catch(() => {});
      }

      socketRef.current.disconnect();
      socketRef.current.connect();
    }
  };

  const playAudio = async (text: string) => {
    if (answerStatus !== 'idle' || fetchInProgressRef.current) return;
    
    stopAudio();
    setIsAudioPlaying(true);
    isPlayingAudioRef.current = true;
    fetchInProgressRef.current = true;

    try {
      // Use Gemini TTS for high quality and gender selection
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const useFemale = Math.random() > 0.5;
      const voiceName = useFemale ? 'Kore' : 'Puck'; // Kore is female, Puck is male
      
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say clearly: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName },
            },
          },
        },
      });

      if (!fetchInProgressRef.current) return;

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        playPcmAudio(base64Audio);
        setAudioPlayed(true);
      } else {
        throw new Error("No audio data in response");
      }
    } catch (error) {
      if (!fetchInProgressRef.current) return;
      console.warn("Gemini TTS failed, falling back to window.speechSynthesis:", error);
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9; // Slightly slower for clarity
      utterance.onend = () => {
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
      };
      utterance.onerror = () => {
        setIsAudioPlaying(false);
        isPlayingAudioRef.current = false;
      };
      window.speechSynthesis.speak(utterance);
      setAudioPlayed(true);
    } finally {
      fetchInProgressRef.current = false;
    }
  };

  // --- Stop Audio on view or question change ---
  useEffect(() => {
    stopAudio();
  }, [view, currentIndex, answerStatus]);

  // --- Scroll to top on view change ---
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo(0, 0);
    }
  }, [view]);

  // --- Splash Setup ---
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => setShowSplash(false), 800);
          return 100;
        }
        return prev + 2;
      });
    }, 30);
    return () => clearInterval(interval);
  }, []);

  // --- BGM Setup ---
  const menuBgmUrl = 'https://cdn.pixabay.com/audio/2022/03/15/audio_783d1a0e02.mp3';
  const quizBgmUrl = 'https://cdn.pixabay.com/audio/2022/01/18/audio_d0a13f69d2.mp3';
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const handleInteraction = () => {
      setHasInteracted(true);
      if (bgmRef.current && !isMusicMuted) {
        bgmRef.current.play().catch(() => {});
      }
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    window.addEventListener('touchstart', handleInteraction);
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  useEffect(() => {
    if (!bgmRef.current) {
      bgmRef.current = new Audio();
      bgmRef.current.loop = true;
      bgmRef.current.volume = 0.1;
    }

    const isQuizView = ['training', 'battle', 'battle_start'].includes(view);
    const isListeningQuiz = isQuizView && selectedPack?.type === 'listening';
    const targetUrl = isQuizView ? quizBgmUrl : menuBgmUrl;
    
    // Update source if it's different
    const currentSrc = bgmRef.current.src;
    const targetFilename = targetUrl.split('/').pop();
    if (!currentSrc || !currentSrc.includes(targetFilename!)) {
      console.log('Switching BGM to:', targetUrl);
      bgmRef.current.src = targetUrl;
      bgmRef.current.load();
    }

    // Play/Pause logic
    if (hasInteracted && !isMusicMuted && !showSplash && !isListeningQuiz) {
      console.log('Attempting to play BGM:', targetUrl);
      bgmRef.current.play().catch((err) => {
        console.warn("BGM play failed:", err);
      });
    } else {
      console.log('Pausing BGM. hasInteracted:', hasInteracted, 'isMusicMuted:', isMusicMuted, 'showSplash:', showSplash, 'isListeningQuiz:', isListeningQuiz);
      bgmRef.current.pause();
    }
  }, [isMusicMuted, view, hasInteracted, showSplash, selectedPack]);

  useEffect(() => {
    localStorage.setItem('pokepoke_dark_mode', isDarkMode.toString());
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.backgroundColor = '#020617';
      document.body.style.backgroundColor = '#020617';
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.backgroundColor = '#f8fafc';
      document.body.style.backgroundColor = '#f8fafc';
      document.documentElement.style.colorScheme = 'light';
    }
    
    // Update theme-color meta tag for mobile browser status bar
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', isDarkMode ? '#020617' : '#f8fafc');
  }, [isDarkMode]);

  // --- Player Setup ---
  useEffect(() => {
    const savedPlayer = localStorage.getItem('pokepoke_player');
    if (savedPlayer) {
      try {
        const parsed = JSON.parse(savedPlayer);
        setPlayer(parsed);
        setView('home');

        // Fetch fresh wrong questions from Firestore if online!
        if (isOnline) {
          getDocs(query(collection(db, 'wrongQuestions'), where('userId', '==', parsed.id)))
            .then(snapshot => {
              const wrongFromDb: Word[] = [];
              snapshot.forEach(docSnap => {
                const data = docSnap.data();
                wrongFromDb.push({
                  word: data.word,
                  meaning: data.meaning,
                  choices: data.choices || []
                });
              });
              
              if (wrongFromDb.length > 0) {
                const combined = [...wrongFromDb, ...(parsed.wrongQuestions || [])];
                const unique = combined.filter((word, index, self) => 
                  index === self.findIndex((t) => t.word === word.word)
                ).slice(0, 30);
                
                const updated = { ...parsed, wrongQuestions: unique };
                setPlayer(updated);
                localStorage.setItem('pokepoke_player', JSON.stringify(updated));
              }
            })
            .catch(err => console.warn("Failed to fetch wrong questions on start:", err));
        }
      } catch (e) {
        setPlayer(null);
        setView('setup');
      }
    } else {
      setPlayer(null);
      setView('setup');
    }
    setIsAuthReady(true);
  }, [isOnline]);

  const handleToggleFavorite = async (packId: string) => {
    if (!player) return;
    
    const currentFavorites = player.favorites || [];
    const isFavorited = currentFavorites.includes(packId);
    const newFavorites = isFavorited
      ? currentFavorites.filter(id => id !== packId)
      : [...currentFavorites, packId];
    
    const updatedPlayer = { ...player, favorites: newFavorites };
    setPlayer(updatedPlayer);
    playSound('click');
    localStorage.setItem('pokepoke_player', JSON.stringify(updatedPlayer));
  };

  const handleSaveWrongQuestions = async (newWrongWords: Word[]) => {
    if (!player) return;
    
    const currentWrong = player.wrongQuestions || [];
    // Add new wrong words to the front (newest first)
    // We reverse newWrongWords assuming they are in chronological order from the session
    const combined = [...[...newWrongWords].reverse(), ...currentWrong];
    
    // Filter out duplicates (keeping the first occurrence, which is the newest)
    // and limit to the latest 30 questions (deleting oldest from the end)
    const unique = combined.filter((word, index, self) => 
      index === self.findIndex((t) => t.word === word.word)
    ).slice(0, 30);

    const updatedPlayer = { ...player, wrongQuestions: unique };
    setPlayer(updatedPlayer);
    localStorage.setItem('pokepoke_player', JSON.stringify(updatedPlayer));

    // Async sync to Firestore wrongQuestions collection if online!
    if (isOnline) {
      try {
        for (const item of newWrongWords) {
          const docId = `${player.id}_${encodeURIComponent(item.word)}`;
          await setDoc(doc(db, 'wrongQuestions', docId), {
            userId: player.id,
            word: item.word,
            meaning: item.meaning,
            choices: item.choices || [],
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        console.warn("Firestore sync of wrong questions failed:", err);
      }
    }
  };

  const handleDeleteWrongWord = async (wordStr: string) => {
    if (!player) return;
    const currentWrong = player.wrongQuestions || [];
    const updatedWrong = currentWrong.filter(w => w.word !== wordStr);
    
    const updatedPlayer = { ...player, wrongQuestions: updatedWrong };
    setPlayer(updatedPlayer);
    localStorage.setItem('pokepoke_player', JSON.stringify(updatedPlayer));
    playSound('click');

    if (isOnline) {
      try {
        const docId = `${player.id}_${encodeURIComponent(wordStr)}`;
        await deleteDoc(doc(db, 'wrongQuestions', docId));
      } catch (err) {
        console.warn("Firestore delete failed:", err);
      }
    }
  };

  const handleClearAllWrongQuestions = async () => {
    if (!player) return;
    const updatedPlayer = { ...player, wrongQuestions: [] };
    setPlayer(updatedPlayer);
    localStorage.setItem('pokepoke_player', JSON.stringify(updatedPlayer));
    playSound('click');

    if (isOnline) {
      try {
        const snapshot = await getDocs(query(collection(db, 'wrongQuestions'), where('userId', '==', player.id)));
        const batchPromises = snapshot.docs.map(docSnap => deleteDoc(docSnap.ref));
        await Promise.all(batchPromises);
      } catch (err) {
        console.warn("Firestore bulk delete failed:", err);
      }
    }
  };

  useEffect(() => {
    if (view !== 'training' && view !== 'battle') return;
    if (answerStatus !== 'idle') return;
    if (selectedPack?.type === 'listening' && (listeningCountdown !== null || isAudioPlaying || isPlayingAudioRef.current)) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAnswer(null); // Timeout
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [view, currentIndex, answerStatus, selectedPack, listeningCountdown, isAudioPlaying]);

  // Listening Countdown Effect
  useEffect(() => {
    if (view !== 'training' && view !== 'battle') return;
    if (selectedPack?.type !== 'listening') return;
    if (listeningCountdown === null) return;

    const interval = setInterval(() => {
      setListeningCountdown(prev => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(interval);
          playAudio(quizQuestions[currentIndex].word);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [view, selectedPack, listeningCountdown, currentIndex, quizQuestions]);

  // --- Socket Setup ---
  useEffect(() => {
    // In AI Studio environment, we should default to the current origin for the backend
    const isAiStudio = window.location.hostname.includes('.run.app');
    const backendUrl = import.meta.env.VITE_BACKEND_URL || '';
    
    // Determine the most stable socket URL
    let socketUrl = window.location.origin;
    if (!isAiStudio) {
      if (backendUrl) {
        socketUrl = backendUrl;
      } else if (window.location.hostname.includes('vercel.app')) {
        // Fallback for Vercel deployment if VITE_BACKEND_URL is missing
        socketUrl = 'https://server-jv1l.onrender.com';
      }
    }

    // Clean up socketUrl (remove trailing slash)
    socketUrl = socketUrl.replace(/\/$/, '');

    // Wake up the backend if it's on Render (free tier sleeps)
    if (socketUrl.includes('onrender.com')) {
      console.log('Waking up Render backend...');
      fetch(`${socketUrl}/api/health`).catch(() => {});
    }

    console.log('Initializing socket connection to:', socketUrl);
    
    socketRef.current = io(socketUrl, {
      // Use websocket first to avoid proxy/load-balancer limitations on long polling.
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnectionAttempts: 30, // Increased
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 90000 // Increased to 90 seconds
    });
    
    socketRef.current.on('connect', () => {
      console.log('Connected to server:', socketUrl || 'current origin');
      setIsOnline(true);
      setConnectionError(null);
    });
    
    socketRef.current.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message, err);
      setIsOnline(false);
      
      let errorMsg = `Connection failed: ${err.message}.`;
      if (err.message === 'xhr poll error' || err.message === 'timeout' || err.message === 'server error') {
        errorMsg += ' The server might be sleeping or unreachable. Please wait a moment and try again.';
      }
      setConnectionError(errorMsg);
      
      if (backendUrl && !window.location.hostname.includes('localhost')) {
        console.warn(`Failed to connect to backend at: ${backendUrl}. Please ensure VITE_BACKEND_URL is correct in Vercel settings.`);
      }
    });

    socketRef.current.on('reconnect_attempt', (attempt) => {
      console.log(`Socket reconnection attempt #${attempt}`);
      setConnectionError(`Reconnecting... (Attempt ${attempt})`);
    });

    socketRef.current.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      setConnectionError('Connection lost. Please refresh the page.');
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
      setIsOnline(false);
      if (reason === 'io server disconnect') {
        // the disconnection was initiated by the server, you need to reconnect manually
        socketRef.current?.connect();
      }
    });

    socketRef.current.on('state_update', (state: MatchRoomState) => {
      setMatchState(state);
    });

    socketRef.current.on('friend_match_created', ({ inviteCode }) => {
      setInviteCode(inviteCode);
      setView('friend_match_waiting');
    });

    socketRef.current.on('error', ({ message }) => {
      alert(message);
      setView('home');
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // --- Handle Match State Changes ---
  useEffect(() => {
    if (!matchState) return;

    const state = matchState;

    // Capture invite code whenever it's available in the state
    if (state.inviteCode) {
      setInviteCode(state.inviteCode);
    }

    // Handle view transitions based on phase
    if (state.phase === 'matching') {
      setView('matching');
      setQuizQuestions([]);
    } else if (state.phase === 'matched') {
      setView('battle_start');
      setCountdown(null);
      setQuizQuestions([]);
      setAnswerHistory([]);
    } else if (state.phase === 'loading') {
      setView('battle_start');
    } else if (state.phase === 'waiting_room') {
      setView('friend_match_waiting');
      setInviteCode(state.inviteCode || null);
    } else if (state.phase === 'countdown') {
      setView('battle_start');
      setCountdown(state.countdown ?? null);
    } else if (state.phase === 'question' || state.phase === 'answering') {
      setView('battle');
      
      // If question index changed, reset local answer state
      if (state.questionIndex !== currentIndex) {
        // Record previous question as wrong if not already recorded
        if (quizQuestions[currentIndex] && answerHistory.length <= currentIndex) {
          setAnswerHistory(prev => [...prev, { word: quizQuestions[currentIndex].word, meaning: quizQuestions[currentIndex].meaning, status: 'wrong' }]);
        }
        setCurrentIndex(state.questionIndex);
        setAnswerStatus('idle');
        setSelectedChoice(null);
        setTimeLeft(10);
      }

      // Check if opponent won the current question
      const opponent = state.players.find(p => p.id !== player?.id);
      if (opponent?.lastAnswer?.questionIndex === state.questionIndex && opponent.lastAnswer.isCorrect) {
        if (answerStatus === 'idle') {
          setAnswerStatus('opponent_won');
          playSound('wrong');
          const currentWord = quizQuestions[state.questionIndex];
          if (currentWord && answerHistory.length <= state.questionIndex) {
            setAnswerHistory(prev => [...prev, { word: currentWord.word, meaning: currentWord.meaning, status: 'lost' }]);
          }
        }
      }
      
      // Prepare questions if not already done
      if (quizQuestions.length === 0 && state.packId) {
        if (state.questions && state.questions.length > 0) {
          setQuizQuestions(state.questions);
        } else {
          const pack = PACKS.find(p => p.id === state.packId);
          if (pack) {
            setSelectedPack(pack);
            prepareQuestions(pack, state.questionCount, state.roomId);
          }
        }
      }
    } else if (state.phase === 'result') {
      setView('battle');
    } else if (state.phase === 'finished') {
      setView('result');
      setEndTime(Date.now());
    }
  }, [matchState, currentIndex, quizQuestions.length]);

  // --- Quiz Logic Helper ---
  const prepareQuestions = (pack: Pack, count: number, roomId: string) => {
    setIsLoading(true);
    
    // Seeded random shuffle based on roomId for consistent questions in battle
    const seed = roomId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const shuffled = [...pack.words];
    
    // Simple seeded shuffle
    let currentSeed = seed;
    const seededRandom = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(seededRandom() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const selected = shuffled.slice(0, count).map(word => {
      const wordChoices = [...word.choices];
      for (let i = wordChoices.length - 1; i > 0; i--) {
        const j = Math.floor(seededRandom() * (i + 1));
        [wordChoices[i], wordChoices[j]] = [wordChoices[j], wordChoices[i]];
      }
      return { ...word, choices: wordChoices };
    });
    setQuizQuestions(selected);
    
    // Only reset to 0 if we are in training or if it's the start of a match
    if (view === 'training') {
      setCurrentIndex(0);
    }
    
    setIsLoading(false);
  };

  const handleNextQuestion = () => {
    if (currentIndex < quizQuestions.length - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      setTimeLeft(10);
      setAnswerStatus('idle');
      setSelectedChoice(null);
      setAudioPlayed(false);
      if (selectedPack?.type === 'listening') {
        setListeningCountdown(3);
      } else {
        setListeningCountdown(null);
      }
    } else {
      setView('result');
      if (score > (quizQuestions.length / 2)) confetti({ particleCount: 20, spread: 50, origin: { y: 0.8 } });
    }
  };

  const handleAnswer = async (choice: string | null) => {
    if (answerStatus !== 'idle') return;
    
    stopAudio();
    const currentWord = quizQuestions[currentIndex];
    const isCorrect = choice === currentWord.meaning;
    
    setSelectedChoice(choice);
    if (answerHistory.length <= currentIndex) {
      setAnswerHistory(prev => [...prev, { word: currentWord.word, meaning: currentWord.meaning, status: isCorrect ? 'correct' : 'wrong' }]);
    }
    
    if (view === 'battle') {
      socketRef.current?.emit('answer', {
        roomId: matchState?.roomId,
        playerId: player?.id,
        isCorrect,
        questionIndex: currentIndex,
        choice
      });

      // In battle mode, we wait for server to broadcast results
      // But we can show local feedback for responsiveness
      if (isCorrect) {
        setAnswerStatus('correct');
        playSound('correct');
      } else {
        setAnswerStatus(choice === null ? 'timeout' : 'wrong');
        playSound('wrong');
      }
    } else {
      // Training Mode
      if (isCorrect) {
        setAnswerStatus('correct');
        setScore(prev => prev + 1);
        playSound('correct');
      } else {
        setAnswerStatus(choice === null ? 'timeout' : 'wrong');
        setWrongCount(prev => prev + 1);
        playSound('wrong');
      }
      setTimeout(handleNextQuestion, 1000);
    }
  };

  const handleSetup = (name: string, iconId: string) => {
    const newPlayer: Player = {
      id: `user_${Math.random().toString(36).substr(2, 9)}`,
      name,
      icon: iconId,
      favorites: [],
      wrongQuestions: []
    };
    setPlayer(newPlayer);
    localStorage.setItem('pokepoke_player', JSON.stringify(newPlayer));
    
    if (localStorage.getItem('pokepoke_tutorial_seen') !== 'true') {
      setView('tutorial');
    } else {
      setView('home');
    }
  };

  const startTraining = (count: number) => {
    setMatchState(null);
    setQuestionCount(count);
    setIsLoading(true);
    setView('training');
    
    // Shuffle and select questions
    const shuffled = [...selectedPack!.words].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, count).map(word => ({
      ...word,
      choices: [...word.choices].sort(() => 0.5 - Math.random())
    }));
    
    setQuizQuestions(selected);
    setAnswerHistory([]);
    setCurrentIndex(0);
    setScore(0);
    setWrongCount(0);
    setStartTime(Date.now());
    setTimeLeft(10);
    setAnswerStatus('idle');
    setSelectedChoice(null);
    setAudioPlayed(false);
    if (selectedPack?.type === 'listening') {
      setListeningCountdown(3);
    } else {
      setListeningCountdown(null);
    }
    setIsLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('pokepoke_player');
    setPlayer(null);
    setView('setup');
  };

  const handleQuit = () => {
    if (view === 'battle' && matchState?.roomId) {
      socketRef.current?.emit('leave_room', { roomId: matchState.roomId });
    }
    setView('home');
    setMatchState(null);
    setQuizQuestions([]);
    setCurrentIndex(0);
    setScore(0);
    setWrongCount(0);
  };

  const handleSuggestionSubmit = async (type: string, content: string) => {
    if (!content.trim()) return;
    try {
      const response = await fetch('/api/suggestions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type, content, player }),
      });
      
      if (response.ok) {
        alert('送信しました！ありがとうございます。（nishikidootama@gmail.com へ送信されました）');
        setView('home');
      } else {
        throw new Error('Failed to submit');
      }
    } catch (error) {
      console.error('Suggestion submission error:', error);
      alert('送信に失敗しました。時間をおいて再度お試しください。');
    }
  };

  const handleStartWrongQuestionsQuiz = () => {
    if (!player?.wrongQuestions || player.wrongQuestions.length === 0) {
      alert('保存された間違えた問題はありません。');
      return;
    }
    
    const wrongPack: Pack = {
      id: 'wrong_questions',
      name: '間違えた問題',
      description: '最近間違えた問題の復習パックです（最大30問）',
      category: '復習',
      color: 'bg-red-500',
      words: player.wrongQuestions,
      type: 'vocabulary'
    };
    
    setSelectedPack(wrongPack);
    setView('training_config');
  };

  // --- Views ---
  if (showSplash) return <SplashView progress={loadProgress} isDarkMode={isDarkMode} />;
  
  if (!isAuthReady) return (
    <div className={`min-h-[100dvh] flex flex-col items-center justify-center transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mb-4 ${isDarkMode ? 'border-indigo-500' : 'border-indigo-600'}`}></div>
      <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Checking Auth State...</p>
    </div>
  );

  if (view === 'setup') return (
    <SetupView 
      onComplete={handleSetup} 
      isMusicMuted={isMusicMuted} 
      onToggleMute={() => setIsMusicMuted(!isMusicMuted)}
      isDarkMode={isDarkMode}
      onToggleTheme={() => setIsDarkMode(!isDarkMode)}
      isOnline={isOnline}
      connectionError={connectionError}
      onReconnect={reconnectSocket}
    />
  );
  if (view === 'tutorial') return (
    <TutorialView 
      isDarkMode={isDarkMode}
      onSkip={() => {
        localStorage.setItem('pokepoke_tutorial_seen', 'true');
        setHasSeenTutorial(true);
        setView('home');
      }} 
    />
  );
  
  return (
    <div className={`min-h-[100dvh] transition-colors duration-300 flex flex-col font-sans relative ${isDarkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {/* Offline Banner */}
      {!isOnline && (
        <div className="bg-red-600 text-white text-[10px] font-black py-1.5 px-4 text-center z-50 flex items-center justify-center gap-2 sticky top-0">
          <WifiOff className="w-3 h-3" />
          <span>OFFLINE: {connectionError || 'Server Connection Failed'}</span>
          <button 
            onClick={reconnectSocket}
            className="ml-2 px-3 py-0.5 bg-white text-red-600 rounded-full hover:bg-red-50 transition-colors text-[8px] uppercase tracking-widest"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Header */}
      <header className={`p-4 flex justify-between items-center border-b sticky top-0 z-10 shadow-sm transition-colors ${isDarkMode ? 'bg-slate-900/80 border-slate-800 backdrop-blur-md' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
            {player && React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: "w-6 h-6 text-indigo-600" })}
          </div>
          <div>
            <h2 className={`text-sm font-black tracking-tighter uppercase leading-none ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{player?.name}</h2>
            <div className="flex items-center gap-1 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          {(view === 'training' || view === 'battle') && (
            <button 
              onClick={() => {
                playSound('click');
                setShowQuitConfirm(true);
              }}
              className="p-2 transition-colors text-red-500 hover:text-red-650"
              title="Stop/Exit"
            >
              <LogOut className="w-5 h-5 -scale-x-100" />
            </button>
          )}
          {['solo_packs', 'online_lobby', 'review_hub', 'friend_match_setup', 'friend_match_join', 'training_config', 'suggestion'].includes(view) && (
            <button 
              onClick={() => {
                playSound('click');
                setView('home');
              }}
              className={`p-2 rounded-lg transition-colors flex items-center gap-1 font-bold text-xs ${isDarkMode ? 'bg-slate-800 text-indigo-400 hover:bg-slate-700' : 'bg-slate-100 text-indigo-600 hover:bg-slate-200'}`}
              title="Dashboard"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">ダッシュボード</span>
            </button>
          )}
          <button 
            onClick={() => setView('tutorial')}
            className={`p-2 transition-colors ${isDarkMode ? 'text-slate-500 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`}
            title="How to Use"
          >
            <Info className="w-5 h-5" />
          </button>
          
          <button 
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-800 text-yellow-500' : 'hover:bg-slate-100 text-slate-400'}`}
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <button 
            onClick={() => setIsMusicMuted(!isMusicMuted)}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-800' : 'hover:bg-slate-100'}`}
          >
            {isMusicMuted ? <VolumeX className="w-5 h-5 text-slate-400" /> : <Volume2 className="w-5 h-5 text-indigo-600" />}
          </button>
          <div className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${isDarkMode ? 'bg-slate-900/50' : 'bg-slate-50'}`}>
            {isOnline ? (
              <Wifi className="w-4 h-4 text-emerald-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            <div className="flex gap-0.5 items-end h-3">
              {[1,2,3,4].map(i => (
                <div key={i} className={`w-1 rounded-full transition-all ${isOnline && i <= 3 ? 'bg-emerald-500 h-full' : 'bg-slate-300 h-1/2'}`}></div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pokepoke-scroll">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <DashboardHubView 
              player={player}
              isDarkMode={isDarkMode}
              onSelectSolo={() => { playSound('click'); setView('solo_packs'); }}
              onSelectOnline={() => { playSound('click'); setView('online_lobby'); }}
              onSelectReview={() => { playSound('click'); setView('review_hub'); }}
              onSelectSuggestion={() => { playSound('click'); setView('suggestion'); }}
              onLogout={handleLogout}
            />
          )}
          {view === 'solo_packs' && (
            <HomeView 
              player={player}
              isDarkMode={isDarkMode}
              onSelectPack={(pack) => { 
                playSound('click');
                setSelectedPack(pack); 
                setView('training_config'); 
              }} 
              onWrongQuestions={handleStartWrongQuestionsQuiz}
              onFriendMatch={() => {
                playSound('click');
                setView('friend_match_setup');
              }}
              onToggleFavorite={handleToggleFavorite}
              onBack={() => setView('home')}
            />
          )}
          {view === 'online_lobby' && (
            <OnlineLobbyView 
              player={player}
              isDarkMode={isDarkMode}
              onBack={() => setView('home')}
              onStartRandomBattle={(pack, count) => {
                playSound('click');
                setSelectedPack(pack);
                setQuestionCount(count);
                setView('matching');
                socketRef.current?.emit('join_match', { packId: pack.id, questionCount: count, player });
              }}
              onStartGroupBattle={(pack) => {
                playSound('click');
                setSelectedPack(pack);
                setQuestionCount(50); // Set high count since group match is score-based up to 100
                setView('matching');
                socketRef.current?.emit('join_group_match', { packId: pack.id, player });
              }}
              onFriendMatch={() => {
                playSound('click');
                setView('friend_match_setup');
              }}
            />
          )}
          {view === 'review_hub' && (
            <ReviewHubView 
              player={player}
              isDarkMode={isDarkMode}
              onBack={() => setView('home')}
              onStartReviewTest={handleStartWrongQuestionsQuiz}
              onDeleteWord={handleDeleteWrongWord}
              onClearAll={handleClearAllWrongQuestions}
              playAudio={playAudio}
              isAudioPlaying={isAudioPlaying}
            />
          )}
          {view === 'suggestion' && (
            <SuggestionFormView 
              isDarkMode={isDarkMode}
              onSubmit={handleSuggestionSubmit}
              onBack={() => setView('home')}
            />
          )}
          {view === 'training_config' && (
            <TrainingConfigView 
              pack={selectedPack!} 
              isDarkMode={isDarkMode}
              onStartTraining={startTraining}
              onStartBattle={(count) => {
                setQuestionCount(count);
                setView('matching');
                socketRef.current?.emit('join_match', { packId: selectedPack?.id, questionCount: count, player });
              }}
              onBack={() => {
                if (selectedPack?.id === 'wrong_questions') {
                  setView('review_hub');
                } else {
                  setView('solo_packs');
                }
              }}
            />
          )}
          {view === 'matching' && (
            <MatchingView 
              isDarkMode={isDarkMode}
              onCancel={() => {
                socketRef.current?.emit('cancel_match');
                setView('online_lobby');
              }} 
              matchState={matchState} 
            />
          )}
          {view === 'friend_match_setup' && (
            <FriendMatchSetupView 
              pack={selectedPack}
              isDarkMode={isDarkMode}
              onBack={() => setView('online_lobby')}
              onSelectPack={(p) => setSelectedPack(p)}
              onCreateMatch={(count) => {
                setQuestionCount(count);
                socketRef.current?.emit('create_friend_match', { packId: selectedPack?.id, questionCount: count, player });
              }}
              onJoinMatch={() => setView('friend_match_join')}
            />
          )}
          {view === 'friend_match_waiting' && (
            <FriendMatchWaitingView 
              inviteCode={inviteCode!}
              isDarkMode={isDarkMode}
              onCancel={() => {
                if (matchState?.roomId) {
                  socketRef.current?.emit('leave_room', { roomId: matchState.roomId });
                }
                setMatchState(null);
                setView('online_lobby');
              }}
              matchState={matchState}
              player={player}
              onStart={() => socketRef.current?.emit('start_friend_match', { roomId: matchState?.roomId })}
            />
          )}
          {view === 'friend_match_join' && (
            <FriendMatchJoinView 
              isDarkMode={isDarkMode}
              onBack={() => setView('online_lobby')}
              onJoin={(code) => {
                socketRef.current?.emit('join_friend_match', { inviteCode: code, player });
              }}
            />
          )}
          {view === 'battle_start' && (
            <BattleStartView 
              player={player!} 
              isDarkMode={isDarkMode}
              opponent={matchState?.players?.find(p => p.id !== player?.id) || player!} 
              countdown={countdown}
              onReady={() => socketRef.current?.emit('player_ready', { roomId: matchState?.roomId })}
              matchState={matchState}
            />
          )}
          {(view === 'training' || view === 'battle') && (
            <QuizView 
              mode={view}
              isLoading={isLoading}
              isDarkMode={isDarkMode}
              currentIndex={currentIndex}
              total={quizQuestions.length}
              question={quizQuestions[currentIndex]}
              timeLeft={timeLeft}
              answerStatus={answerStatus}
              selectedChoice={selectedChoice}
              onAnswer={handleAnswer}
              onBuzzIn={() => {
                socketRef.current?.emit('buzz_in', { roomId: matchState?.roomId });
              }}
              opponent={view === 'battle' ? opponent : undefined}
              opponentAnswer={opponentAnswer}
              player={player}
              score={myScore}
              opponentScore={opponentScore}
              matchState={matchState}
              listeningCountdown={listeningCountdown}
              selectedPack={selectedPack}
              isAutoSpeechEnabled={isAutoSpeechEnabled}
              onToggleAutoSpeech={() => {
                const newValue = !isAutoSpeechEnabled;
                setIsAutoSpeechEnabled(newValue);
                localStorage.setItem('pokepoke_auto_speech', String(newValue));
                playSound('click');
              }}
              playAudio={playAudio}
            />
          )}
          {view === 'result' && (
            <ResultView 
              mode={matchState ? 'battle' : 'training'}
              score={myScore} 
              wrongCount={wrongCount}
              total={quizQuestions.length} 
              timeTaken={Math.floor((endTime - startTime) / 1000)}
              opponentScore={opponentScore}
              answerHistory={answerHistory}
              onSaveWrongQuestions={handleSaveWrongQuestions}
              onRetry={() => {
                if (matchState) {
                  if (matchState.roomId) {
                    socketRef.current?.emit('leave_room', { roomId: matchState.roomId });
                  }
                  setMatchState(null);
                  setView('home');
                } else {
                  startTraining(questionCount);
                }
              }}
              onHome={() => {
                if (matchState?.roomId) {
                  socketRef.current?.emit('leave_room', { roomId: matchState.roomId });
                }
                setMatchState(null);
                setView('home');
              }}
              isRematchRequested={isRematchRequested}
              onRematch={() => socketRef.current?.emit('request_rematch', { roomId: matchState?.roomId })}
              matchState={matchState}
              player={player}
              isDarkMode={isDarkMode}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Quit Confirmation Overlay */}
      {showQuitConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md flex items-center justify-center z-[150] p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`w-full max-w-sm rounded-[2rem] p-8 shadow-2xl border text-center relative overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}
          >
            {/* Subtle aesthetic accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-red-500" />

            <h3 className={`text-xl font-black mb-6 mt-2 tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Are you sure you want to quit?
            </h3>
            
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => {
                  playSound('click');
                  setShowQuitConfirm(false);
                  handleQuit();
                }}
                className="flex-1 py-4 px-6 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl shadow-lg shadow-red-500/10 active:scale-95 transition-all text-base cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={() => {
                  playSound('click');
                  setShowQuitConfirm(false);
                }}
                className={`flex-1 py-4 px-6 font-black rounded-xl border-2 transition-all active:scale-95 text-base cursor-pointer ${
                  isDarkMode 
                    ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                No
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function SplashView({ progress, isDarkMode }: { progress: number, isDarkMode: boolean }) {
  return (
    <div className={`min-h-[100dvh] flex flex-col items-center justify-center p-6 transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center"
      >
        <h1 className={`text-6xl md:text-8xl font-black tracking-tighter italic mb-12 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          激アツ英単語
        </h1>
        <div className={`w-64 md:w-96 h-2 rounded-full overflow-hidden relative transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
          <motion.div 
            className="absolute inset-0 bg-indigo-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-4 text-xs font-black text-slate-400 uppercase tracking-widest">
          Loading Assets... {progress}%
        </p>
      </motion.div>
    </div>
  );
}

function BattleStartView({ player, opponent, countdown, isDarkMode, onReady, matchState }: { player: Player, opponent: Player, countdown: number | null, isDarkMode: boolean, onReady: () => void, matchState: MatchRoomState | null }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (matchState?.phase === 'matched') {
      setIsReady(false);
    }
  }, [matchState?.phase]);

  const opponentState = matchState?.players?.find(p => p.id === opponent?.id);
  const isOpponentReady = !!opponentState?.isReady;

  if (matchState?.type === 'group') {
    return (
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`min-h-[80dvh] flex flex-col items-center justify-center p-6 overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-indigo-900'}`}
      >
        <AnimatePresence mode="wait">
          {matchState.phase === 'loading' ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center"
            >
              <div className={`w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6 ${isDarkMode ? 'border-indigo-500' : 'border-indigo-300'}`}></div>
              <p className="text-white font-black text-2xl uppercase tracking-widest italic">Extracting Questions...</p>
            </motion.div>
          ) : countdown !== null ? (
            <motion.div
              key="countdown"
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              className="text-9xl font-black text-white italic animate-bounce"
            >
              {countdown === 0 ? 'START!' : countdown}
            </motion.div>
          ) : (
            <div className="flex flex-col items-center w-full">
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="text-center mb-8"
              >
                <h2 className="text-5xl font-black text-white tracking-tighter mb-2 uppercase italic animate-pulse">
                  対戦開始！ (GROUP MATCH)
                </h2>
                <div className="h-1 w-24 bg-red-500 mx-auto rounded-full mb-4"></div>
                <p className="text-indigo-200 font-bold">メンバーがマッチしました。100点先取の早押しクイズ開始まであと数秒...！</p>
              </motion.div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 w-full max-w-lg">
                {matchState.players.map((p, idx) => (
                  <motion.div 
                    key={p.id}
                    initial={{ scale: 0, rotate: -15 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", delay: idx * 0.1 }}
                    className="flex flex-col items-center gap-3 p-4 rounded-3xl bg-white/10 border border-white/20 backdrop-blur-sm"
                  >
                    <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center text-3xl shadow-lg">
                      {p.icon}
                    </div>
                    <p className="text-white font-black text-sm truncate max-w-[100px]">{p.name}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`min-h-[80dvh] flex flex-col items-center justify-center p-6 overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-indigo-900'}`}
    >
      <AnimatePresence mode="wait">
        {matchState?.phase === 'loading' ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <div className={`w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-6 ${isDarkMode ? 'border-indigo-500' : 'border-indigo-300'}`}></div>
            <p className="text-white font-black text-2xl uppercase tracking-widest italic">Extracting Questions...</p>
          </motion.div>
        ) : countdown !== null ? (
          <motion.div
            key="countdown"
            initial={{ scale: 2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="text-9xl font-black text-white italic"
          >
            {countdown === 0 ? 'START!' : countdown}
          </motion.div>
        ) : (
          <div className="flex flex-col items-center w-full">
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center mb-12"
            >
              <h2 className="text-6xl font-black text-white tracking-tighter mb-2 uppercase italic">
                {matchState?.phase === 'matched' ? 'matched!' : 'matching!'}
              </h2>
              <div className="h-1 w-24 bg-indigo-500 mx-auto rounded-full mb-4"></div>
              {matchState?.type === 'friend' && matchState.inviteCode && (
                <div className={`backdrop-blur-md px-6 py-4 rounded-3xl border transition-colors ${isDarkMode ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-white/10 border-white/20'} inline-flex flex-col items-center gap-1`}>
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest">Invite Code</p>
                  <p className="text-4xl font-black text-white tracking-[0.2em] leading-none">{matchState.inviteCode}</p>
                </div>
              )}
            </motion.div>

            <div className="flex items-center gap-8 md:gap-16 mb-12">
              <motion.div 
                initial={{ x: -100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", delay: 0.2 }}
                className="flex flex-col items-center gap-4"
              >
                <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center shadow-2xl relative overflow-hidden group transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'bg-indigo-900/20' : 'bg-indigo-50'}`}></div>
                  {React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: "w-14 h-14 text-indigo-600 relative z-10" })}
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-white font-black text-2xl tracking-tight">{player.name}</p>
                  {isReady && <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mt-1">READY</span>}
                </div>
              </motion.div>

              <motion.div 
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.6, type: "spring", damping: 12 }}
                className="relative"
              >
                <div className="text-7xl font-black text-indigo-500 italic uppercase">vs</div>
                <motion.div 
                  animate={{ scale: [1, 1.5, 1], opacity: [0, 0.5, 0] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute inset-0 bg-indigo-500 rounded-full blur-2xl -z-10"
                ></motion.div>
              </motion.div>

              <motion.div 
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ type: "spring", delay: 0.4 }}
                className="flex flex-col items-center gap-4"
              >
                <div className={`w-28 h-28 rounded-[2rem] flex items-center justify-center shadow-2xl relative overflow-hidden group transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-white'}`}>
                  <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity ${isDarkMode ? 'bg-red-900/20' : 'bg-red-50'}`}></div>
                  {React.createElement(PLAYER_ICONS.find(i => i.id === opponent.icon)?.icon || Smile, { className: "w-14 h-14 text-red-600 relative z-10" })}
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-white font-black text-2xl tracking-tight">{opponent.name}</p>
                  {isOpponentReady && <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest mt-1">READY</span>}
                </div>
              </motion.div>
            </div>

            {!isReady ? (
              <button
                onClick={() => { setIsReady(true); onReady(); }}
                className="px-12 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95"
              >
                READY?
              </button>
            ) : (
              <div className="text-indigo-400 font-black text-xl animate-pulse">
                WAITING FOR OPPONENT...
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function QuizView({ 
  mode, isLoading, isDarkMode, currentIndex, total, question, timeLeft, 
  answerStatus, selectedChoice, onAnswer, onBuzzIn, opponent, opponentAnswer,
  player, score, opponentScore, matchState, listeningCountdown, selectedPack,
  isAutoSpeechEnabled, onToggleAutoSpeech, playAudio
}: { 
  mode: 'training' | 'battle', isLoading: boolean, isDarkMode: boolean, currentIndex: number, total: number, 
  question: Word, timeLeft: number, answerStatus: string, 
  selectedChoice: string | null, onAnswer: (choice: string | null) => void,
  onBuzzIn?: () => void,
  opponent?: Player, opponentAnswer?: any,
  player?: Player | null, score: number, opponentScore: number,
  matchState?: MatchRoomState | null,
  listeningCountdown: number | null,
  selectedPack: Pack | null,
  isAutoSpeechEnabled: boolean,
  onToggleAutoSpeech: () => void,
  playAudio: (text: string) => void
}) {
  // --- Auto Speech Logic ---
  useEffect(() => {
    if (isLoading || !question || !isAutoSpeechEnabled || answerStatus !== 'idle') return;
    
    // Only play if it's a single word (no spaces)
    const isSingleWord = !question.word.trim().includes(' ');
    const isListening = selectedPack?.type === 'listening';
    
    if (isSingleWord && !isListening) {
      playAudio(question.word);
    }
  }, [currentIndex, isAutoSpeechEnabled, isLoading, question, selectedPack, answerStatus]);
  if (isLoading) {
    return (
      <div className="min-h-[80dvh] flex flex-col items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full mb-4"
        />
        <p className="font-black text-indigo-600 tracking-widest">LOADING...</p>
      </div>
    );
  }

  if (!question) return null;

  const isGroup = matchState?.type === 'group';
  const isAnswerLocked = isGroup 
    ? (matchState?.phase !== 'answering' || matchState?.firstResponder !== player?.id)
    : (matchState?.phase === 'answering');
  const myState = matchState?.players?.find(p => p.id === player?.id);
  const isMyTurn = mode === 'training' || (isGroup 
    ? (matchState?.phase === 'answering' && matchState?.firstResponder === player?.id)
    : (matchState?.phase === 'question' && !myState?.answered));

  const isListening = selectedPack?.type === 'listening';
  const showCountdown = isListening && listeningCountdown !== null;
  const hideQuestion = isListening && answerStatus === 'idle';

  const getFontSize = (text: string) => {
    const len = text.length;
    if (len > 40) return 'text-lg md:text-xl';
    if (len > 30) return 'text-xl md:text-2xl';
    if (len > 20) return 'text-2xl md:text-4xl';
    if (len > 15) return 'text-3xl md:text-5xl';
    return 'text-5xl md:text-7xl';
  };

  const getChoiceFontSize = (text: string) => {
    const len = text.length;
    if (len > 20) return 'text-sm md:text-base';
    if (len > 15) return 'text-base md:text-lg';
    if (len > 10) return 'text-lg md:text-xl';
    return 'text-xl md:text-2xl';
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full h-full flex flex-col justify-center">
      <div className="flex justify-between items-center mb-4 md:mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-14 h-14 rounded-2xl border-4 flex items-center justify-center font-black text-2xl shadow-sm transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800 text-indigo-400' : 'bg-white border-indigo-100 text-indigo-600'}`}>
              {timeLeft}
            </div>
            <svg className="absolute -inset-1 w-16 h-16 -rotate-90 pointer-events-none">
              <circle
                cx="32" cy="32" r="30"
                fill="none" stroke="currentColor" strokeWidth="4"
                className={isDarkMode ? 'text-slate-800' : 'text-slate-100'}
              />
              <motion.circle
                cx="32" cy="32" r="30"
                fill="none" stroke="currentColor" strokeWidth="4"
                strokeDasharray="188.5"
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: 188.5 - (timeLeft / 10) * 188.5 }}
                className={timeLeft < 3 ? 'text-red-500' : 'text-indigo-500'}
              />
            </svg>
          </div>
        </div>
        
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end mb-1">
            <span className="px-2 py-0.5 bg-slate-900 text-white text-[10px] font-black rounded uppercase tracking-tighter">
              {mode === 'battle' ? 'Battle' : 'Training'}
            </span>
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button 
              onClick={onToggleAutoSpeech}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 transition-all ${
                isAutoSpeechEnabled 
                  ? (isDarkMode ? 'bg-indigo-950 border-indigo-900 text-indigo-400' : 'bg-indigo-50 border-indigo-200 text-indigo-600')
                  : (isDarkMode ? 'bg-slate-900 border-slate-800 text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-400')
              }`}
            >
              {isAutoSpeechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="text-[10px] font-black uppercase tracking-tighter">
                音声{isAutoSpeechEnabled ? 'オン' : 'オフ'}
              </span>
            </button>
            <p className={`text-2xl font-black tracking-tighter transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {mode === 'battle' ? `ROUND ${currentIndex + 1}` : `${currentIndex + 1} / ${total}`}
            </p>
          </div>
        </div>
      </div>

      {mode === 'battle' && matchState?.type === 'group' ? (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex flex-wrap gap-2 justify-center py-2 px-2 rounded-3xl bg-slate-100/50 dark:bg-slate-900/50 border border-slate-200/40 dark:border-slate-800/40">
            {matchState.players.map((p) => {
              const isMe = p.id === player?.id;
              const isBuzzed = matchState.phase === 'answering' && matchState.firstResponder === p.id;
              return (
                <div 
                  key={p.id} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border transition-all ${
                    isBuzzed 
                      ? 'bg-red-500 border-red-600 text-white shadow-lg scale-105 ring-2 ring-red-300' 
                      : isMe 
                        ? 'bg-indigo-100 border-indigo-200 dark:bg-indigo-950 dark:border-indigo-900 text-indigo-900 dark:text-indigo-100' 
                        : 'bg-white border-slate-100 dark:bg-slate-800 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  <span className="text-sm">{p.icon}</span>
                  <div className="text-left leading-none">
                    <p className="text-[9px] font-bold uppercase tracking-tight truncate max-w-[55px] opacity-70">
                      {isMe ? 'YOU' : p.name}
                    </p>
                    <p className="text-xs font-black">{p.score} pt</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : mode === 'battle' && opponent ? (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
               <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-colors ${isDarkMode ? 'bg-indigo-950 border-indigo-900' : 'bg-indigo-100 border-indigo-200'}`}>
                 {player && React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: "w-5 h-5 text-indigo-600" })}
               </div>
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-0.5">YOU</p>
                 <p className={`text-lg font-black leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{score}</p>
               </div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-black text-slate-300 uppercase italic">VS</div>
              <div className={`w-1 h-4 rounded-full ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
            </div>

            <div className="flex items-center gap-2 text-right">
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-0.5">{opponent.name}</p>
                 <p className={`text-lg font-black leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{opponentScore}</p>
               </div>
               <div className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-colors ${isDarkMode ? 'bg-red-950 border-red-900' : 'bg-red-100 border-red-200'}`}>
                 {React.createElement(PLAYER_ICONS.find(i => i.id === opponent.icon)?.icon || Smile, { className: "w-5 h-5 text-red-600" })}
               </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className={`h-1.5 w-full rounded-full overflow-hidden flex transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (score / 100) * 100)}%` }}
              className="h-full bg-indigo-500"
            />
            <div className="flex-1"></div>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (opponentScore / 100) * 100)}%` }}
              className="h-full bg-red-500"
            />
          </div>

          {/* Opponent Status Indicator */}
          <div className="flex justify-end">
            {matchState?.phase === 'answering' ? (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-colors ${isDarkMode ? 'bg-emerald-950/50 border-emerald-900' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className={`text-[8px] font-black uppercase ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  {matchState?.players?.find(p => p.lastAnswer?.questionIndex === currentIndex)?.name} Answered!
                </span>
              </div>
            ) : opponentAnswer && opponentAnswer.questionIndex === currentIndex ? (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-colors ${isDarkMode ? 'bg-emerald-950/50 border-emerald-900' : 'bg-emerald-50 border-emerald-100'}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className={`text-[8px] font-black uppercase ${isDarkMode ? 'text-emerald-400' : 'text-emerald-600'}`}>Opponent Answered</span>
              </div>
            ) : (
              <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                <span className="text-[8px] font-black text-slate-400 uppercase">Opponent Thinking...</span>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <motion.div 
        key={currentIndex}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={`rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-12 shadow-2xl border mb-4 md:mb-8 text-center relative overflow-hidden card-pack-shadow flex items-center justify-center min-h-[140px] md:min-h-[200px] transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500"></div>
        <div className="w-full">
          {showCountdown ? (
            <motion.div 
              key={listeningCountdown}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-7xl font-black text-indigo-600 italic"
            >
              {listeningCountdown}
            </motion.div>
          ) : hideQuestion ? (
            <div className="flex flex-col items-center gap-4">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className={`w-20 h-20 rounded-full flex items-center justify-center border-4 transition-colors ${isDarkMode ? 'bg-indigo-950 border-indigo-900' : 'bg-indigo-50 border-indigo-100'}`}
              >
                <Volume2 className="w-10 h-10 text-indigo-600" />
              </motion.div>
              <p className="text-2xl font-black text-indigo-600 uppercase tracking-widest italic animate-pulse">Listen!</p>
            </div>
          ) : (
            <>
              <h3 className={`${getFontSize(question.word)} font-black mb-4 tracking-tight break-words transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {question.word}
              </h3>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Select the correct meaning</p>
            </>
          )}
        </div>

        {/* Feedback Overlay - Full Screen */}
        <AnimatePresence>
          {(answerStatus !== 'idle' || matchState?.phase === 'result' || matchState?.phase === 'answering') && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className={`fixed inset-0 flex items-center justify-center z-[100] transition-colors ${isDarkMode ? 'bg-slate-950/95' : 'bg-white/90'}`}
            >
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col items-center w-full px-6"
              >
                {matchState?.phase === 'result' ? (
                  <div className="space-y-6 w-full max-w-md">
                    <h4 className={`text-2xl font-black uppercase tracking-tighter mb-4 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Round Results</h4>
                    <div className="space-y-3">
                      {matchState.players.map(p => (
                        <div key={p.id} className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.lastAnswer?.isCorrect ? 'bg-emerald-100' : 'bg-red-100'}`}>
                              {p.lastAnswer?.isCorrect ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <XCircle className="w-6 h-6 text-red-600" />}
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-black text-slate-400 uppercase leading-none mb-1">{p.name}</p>
                              <p className={`text-lg font-black leading-none truncate max-w-[150px] transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{p.lastAnswer?.choice || 'No Answer'}</p>
                            </div>
                          </div>
                          {p.lastAnswer?.reactionTime !== undefined && (
                            <div className="text-right">
                              <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Reaction</p>
                              <p className="text-sm font-black text-indigo-600">{p.lastAnswer.reactionTime.toFixed(3)}s</p>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className={`mt-4 text-xl font-bold px-6 py-2 rounded-full inline-block transition-colors ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-500 bg-slate-100'}`}>Answer: {question.meaning}</p>
                    {isListening && question.explanation && (
                      <div className={`mt-4 p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-indigo-950/30 border-indigo-900 text-indigo-200' : 'bg-indigo-50 border-indigo-100 text-indigo-900'}`}>
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                        <p className="text-sm font-bold leading-relaxed">{question.explanation}</p>
                      </div>
                    )}
                  </div>
                ) : matchState?.phase === 'answering' ? (
                  <div className="flex flex-col items-center">
                    <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-colors ${isDarkMode ? 'bg-indigo-950' : 'bg-indigo-100'}`}>
                      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-3xl font-black text-indigo-600 tracking-tighter uppercase italic">Someone Answered!</p>
                    <p className="mt-2 text-slate-400 font-bold uppercase tracking-widest text-xs">Waiting for server...</p>
                  </div>
                ) : answerStatus === 'correct' ? (
                  <>
                    <motion.div 
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className={`w-40 h-40 rounded-full flex items-center justify-center mb-6 shadow-xl ${isDarkMode ? 'bg-emerald-950/50 shadow-emerald-950' : 'bg-emerald-100 shadow-emerald-200'}`}
                    >
                      <CheckCircle2 className="w-24 h-24 text-emerald-500" />
                    </motion.div>
                    <p className="text-6xl font-black text-emerald-600 tracking-tighter drop-shadow-sm">
                      CORRECT!
                    </p>
                    {isListening && (
                      <div className="w-full max-w-md mt-8 space-y-4">
                        <div className={`p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Script</p>
                          <p className={`text-lg font-black leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{question.word}</p>
                        </div>
                        {question.explanation && (
                          <div className={`p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-indigo-950/30 border-indigo-900 text-indigo-200' : 'bg-indigo-50 border-indigo-100 text-indigo-900'}`}>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                            <p className="text-sm font-bold leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : answerStatus === 'opponent_won' ? (
                  <>
                    <div className={`w-40 h-40 rounded-full flex items-center justify-center mb-6 shadow-2xl ${isDarkMode ? 'bg-red-950/50 shadow-red-950' : 'bg-red-100 shadow-red-200'}`}>
                      <XCircle className="w-24 h-24 text-red-500" />
                    </div>
                    <p className="text-3xl font-black text-red-600 tracking-tighter uppercase">{opponent?.name} GOT IT!</p>
                    <p className={`mt-4 text-xl font-bold px-6 py-2 rounded-full transition-colors ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-500 bg-slate-100'}`}>Answer: {question.meaning}</p>
                    {isListening && (
                      <div className="w-full max-w-md mt-6 space-y-4">
                        <div className={`p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Script</p>
                          <p className={`text-lg font-black leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{question.word}</p>
                        </div>
                        {question.explanation && (
                          <div className={`p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-indigo-950/30 border-indigo-900 text-indigo-200' : 'bg-indigo-50 border-indigo-100 text-indigo-900'}`}>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                            <p className="text-sm font-bold leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <motion.div 
                      initial={{ scale: 0.5 }}
                      animate={{ scale: 1 }}
                      className={`w-40 h-40 rounded-full flex items-center justify-center mb-6 shadow-xl ${isDarkMode ? 'bg-red-950/50 shadow-red-950' : 'bg-red-100 shadow-red-200'}`}
                    >
                      <XCircle className="w-24 h-24 text-red-500" />
                    </motion.div>
                    <p className="text-6xl font-black text-red-600 tracking-tighter drop-shadow-sm">MISS!</p>
                    <p className={`mt-4 text-xl font-bold px-6 py-2 rounded-full transition-colors ${isDarkMode ? 'text-slate-300 bg-slate-800' : 'text-slate-500 bg-slate-100'}`}>Correct: {question.meaning}</p>
                    {isListening && (
                      <div className="w-full max-w-md mt-6 space-y-4">
                        <div className={`p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Script</p>
                          <p className={`text-lg font-black leading-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{question.word}</p>
                        </div>
                        {question.explanation && (
                          <div className={`p-4 rounded-2xl border text-left transition-colors ${isDarkMode ? 'bg-indigo-950/30 border-indigo-900 text-indigo-200' : 'bg-indigo-50 border-indigo-100 text-indigo-900'}`}>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                            <p className="text-sm font-bold leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {isGroup && matchState?.phase === 'question' ? (
        <div className="flex flex-col items-center justify-center py-12">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              playSound('click');
              if (onBuzzIn) onBuzzIn();
            }}
            className="w-48 h-48 rounded-full bg-gradient-to-r from-red-500 to-rose-600 border-b-8 border-red-700 hover:from-red-600 hover:to-rose-700 text-white font-black text-4xl flex items-center justify-center shadow-2xl animate-pulse cursor-pointer select-none active:border-b-0 active:translate-y-2 transition-all focus:outline-none ring-4 ring-red-300"
          >
            早押し!
          </motion.button>
          <p className="mt-6 text-slate-400 font-bold uppercase tracking-widest text-xs animate-bounce">一番早くボタンを押した人が解答権を獲得！</p>
        </div>
      ) : (
        <>
          {isGroup && matchState?.phase === 'answering' && matchState?.firstResponder !== player?.id && (
            <div className="mb-4 p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200 text-center font-bold">
              📣 {matchState?.players?.find(p => p.id === matchState.firstResponder)?.name || '誰か'} が早押し成功！解答権を獲得しました。解答を待っています...
            </div>
          )}
          {isGroup && matchState?.phase === 'answering' && matchState?.firstResponder === player?.id && (
            <div className="mb-4 p-4 rounded-2xl bg-emerald-500 border border-emerald-600 text-white text-center font-black animate-pulse shadow-md">
              👑 あなたが早押し成功！10秒以内に解答を選択してください！
            </div>
          )}
          <div className="grid grid-cols-1 gap-4">
            {question.choices.map((choice, idx) => {
              const isSelected = selectedChoice === choice;
              const isCorrect = choice === question.meaning;
              
              let bgColor = isDarkMode ? 'bg-slate-900' : 'bg-white';
              let borderColor = isDarkMode ? 'border-slate-800' : 'border-slate-200';
              let textColor = isDarkMode ? 'text-white' : 'text-slate-800';

              if (answerStatus !== 'idle' || matchState?.phase === 'result') {
                if (isCorrect) {
                  bgColor = 'bg-emerald-500';
                  borderColor = 'border-emerald-600';
                  textColor = 'text-white';
                } else if (isSelected) {
                  bgColor = 'bg-red-500';
                  borderColor = 'border-red-600';
                  textColor = 'text-white';
                } else {
                  if (isDarkMode) {
                    bgColor = 'bg-slate-950/40';
                    textColor = 'text-slate-700';
                    borderColor = 'border-slate-900';
                  } else {
                    bgColor = 'bg-slate-50';
                    textColor = 'text-slate-300';
                    borderColor = 'border-slate-100';
                  }
                }
              } else {
                if (isSelected) {
                  bgColor = 'bg-indigo-600';
                  borderColor = 'border-indigo-700';
                  textColor = 'text-white';
                }
              }

              return (
                <motion.button
                  key={idx}
                  whileTap={{ scale: 0.98 }}
                  disabled={!isMyTurn || isAnswerLocked}
                  onClick={() => { playSound('click'); onAnswer(choice); }}
                  className={`w-full py-3 md:py-6 px-4 md:px-8 rounded-2xl md:rounded-3xl border-b-4 ${borderColor} ${bgColor} ${textColor} font-black ${getChoiceFontSize(choice)} text-left transition-all flex justify-between items-center shadow-lg active:translate-y-1 active:border-b-0`}
                >
                  <span>{choice}</span>
                  <div className="flex gap-2">
                    {(answerStatus !== 'idle' || matchState?.phase === 'result') && isCorrect && <CheckCircle2 className="w-8 h-8" />}
                    {(answerStatus !== 'idle' || matchState?.phase === 'result') && isSelected && !isCorrect && <XCircle className="w-8 h-8" />}
                  </div>
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function HomeView({ player, isDarkMode, onSelectPack, onWrongQuestions, onFriendMatch, onToggleFavorite, onBack }: { 
  player: Player | null, 
  isDarkMode: boolean,
  onSelectPack: (pack: Pack) => void, 
  onWrongQuestions: () => void,
  onFriendMatch: () => void,
  onToggleFavorite: (packId: string) => void,
  onBack: () => void
}) {
  const [activeTab, setActiveTab] = useState<'vocabulary' | 'listening'>('vocabulary');
  const [searchQuery, setSearchQuery] = useState('');
  const favorites = player?.favorites || [];
  const wrongQuestions = player?.wrongQuestions || [];
  
  const filteredPacks = PACKS.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const favoritePacks = filteredPacks.filter(p => favorites.includes(p.id)).filter(p => {
    if (activeTab === 'vocabulary') return p.category !== 'リスニング';
    return p.category === 'リスニング';
  });

  const baseCategories = Array.from(new Set(filteredPacks.map(p => p.category)))
    .filter(c => {
      if (activeTab === 'vocabulary') return c !== 'リスニング';
      return c === 'リスニング';
    })
    .sort((a, b) => {
      const order = ['TOEIC', '英語', '英検'];
      const indexA = order.indexOf(a);
      const indexB = order.indexOf(b);
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      return a.localeCompare(b);
    });

  const categories = favoritePacks.length > 0 ? ['お気に入り', ...baseCategories] : baseCategories;

  const [expandedCategories, setExpandedCategories] = useState<string[]>(categories);

  useEffect(() => {
    setExpandedCategories(categories);
  }, [activeTab, searchQuery]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category) 
        : [...prev, category]
    );
  };

  return (
    <div className="p-6 pb-24 max-w-4xl mx-auto w-full">
      <button onClick={onBack} className={`mb-8 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> ダッシュボードに戻る
      </button>

      <div className="mb-8 text-center">
        <h1 className="text-xs font-black text-slate-400 uppercase tracking-widest">トレーニング用パックを選択</h1>
      </div>

      {/* Search Input */}
      <div className="mb-8 max-w-sm mx-auto">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="パック名や説明で検索..."
            className={`w-full pl-12 pr-10 py-3 rounded-2xl border-2 outline-none transition-all font-bold ${
              isDarkMode 
                ? 'bg-slate-900 border-slate-800 text-white focus:border-indigo-500' 
                : 'bg-white border-slate-100 text-slate-900 focus:border-indigo-500'
            }`}
          />
          <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Tab Switcher */}
      <div className={`flex p-1 rounded-2xl mb-8 max-w-sm mx-auto transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
        <button
          onClick={() => setActiveTab('vocabulary')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
            activeTab === 'vocabulary' 
              ? (isDarkMode ? 'bg-slate-800 text-indigo-400 shadow-lg' : 'bg-white text-indigo-600 shadow-sm')
              : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>単語</span>
        </button>
        <button
          onClick={() => setActiveTab('listening')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-black text-sm transition-all ${
            activeTab === 'listening' 
              ? (isDarkMode ? 'bg-slate-800 text-indigo-400 shadow-lg' : 'bg-white text-indigo-600 shadow-sm')
              : (isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600')
          }`}
        >
          <Headphones className="w-4 h-4" />
          <span>リスニング</span>
        </button>
      </div>

      <div className="space-y-6">
        {categories.map(category => {
          const isExpanded = expandedCategories.includes(category);
          let categoryPacks: Pack[] = [];
          
          if (category === 'お気に入り') {
            categoryPacks = favoritePacks;
          } else {
            categoryPacks = PACKS.filter(p => p.category === category);
          }

          return (
            <section key={category} className={`${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} rounded-[2rem] border overflow-hidden shadow-sm transition-colors`}>
              <button 
                onClick={() => toggleCategory(category)}
                className={`w-full flex items-center justify-between p-6 transition-colors ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`h-1 w-8 ${category === 'お気に入り' ? 'bg-amber-400' : 'bg-indigo-600'} rounded-full`}></div>
                  <h2 className={`text-xl font-black uppercase tracking-tighter ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{category}</h2>
                </div>
                <motion.div
                  animate={{ rotate: isExpanded ? 90 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronRight className="w-6 h-6 text-slate-400" />
                </motion.div>
              </button>
              
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="flex overflow-x-auto gap-6 pb-8 px-6 pokepoke-scroll snap-x">
                      {categoryPacks.map((pack) => (
                        <motion.div
                          key={pack.id}
                          whileHover={{ y: -10 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => onSelectPack(pack)}
                          className="relative flex-shrink-0 w-72 rounded-[2.5rem] aspect-[3/4.5] group card-pack-shadow overflow-hidden snap-center cursor-pointer"
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              onSelectPack(pack);
                            }
                          }}
                        >
                          <div className={`absolute inset-0 ${pack.color}`}>
                             <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle, white 2px, transparent 2px)', backgroundSize: '20px 20px' }}></div>
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"></div>
                          
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
                            <span className="text-[15rem] font-black text-white/10 select-none transform translate-y-4">
                              {pack.name.charAt(0)}
                            </span>
                          </div>
                          
                          <div className="absolute inset-0 p-8 flex flex-col justify-end text-white text-left">
                            <h3 className="text-2xl font-black leading-tight tracking-tighter uppercase whitespace-pre-wrap mb-2">
                              {pack.name}
                            </h3>
                            <p className="text-[10px] font-bold text-white/70 line-clamp-2 leading-relaxed">
                              {pack.description}
                            </p>
                          </div>

                          <div className="absolute top-6 left-6 right-6 flex justify-between items-start z-10">
                             <div className="px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-[10px] font-black text-white uppercase tracking-widest">Official</div>
                             <button 
                               onClick={(e) => {
                                 e.stopPropagation();
                                 onToggleFavorite(pack.id);
                               }}
                               className="p-2 -m-2 hover:bg-white/10 rounded-full transition-colors pointer-events-auto"
                             >
                               <Star className={`w-6 h-6 ${favorites.includes(pack.id) ? 'text-amber-400 fill-amber-400' : 'text-white/50'}`} />
                             </button>
                          </div>

                          <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          );
        })}
        
        {PACKS.length === 0 && (
          <div className={`w-full py-20 flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <Rocket className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No packs available</p>
          </div>
        )}
      </div>

    </div>
  );
}

function SuggestionFormView({ onSubmit, onBack, isDarkMode }: { onSubmit: (type: string, content: string) => void, onBack: () => void, isDarkMode: boolean }) {
  const [type, setType] = useState('suggestion');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    if (!content.trim()) {
      setError('内容を入力してください');
      return;
    }

    if (type === 'problem') {
      const lines = content.split('\n').filter(l => l.trim());
      for (const line of lines) {
        const parts = line.split('.');
        if (parts.length !== 5) {
          setError('問題の形式が正しくありません。半角ドット(.)で5つの要素に分けてください。');
          return;
        }
        if (parts.some(p => !p.trim())) {
          setError('空の要素が含まれています。');
          return;
        }
      }
    }

    onSubmit(type, content);
    setError(null);
  };

  return (
    <motion.div 
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="p-6 max-w-2xl mx-auto w-full"
    >
      <button onClick={onBack} className={`mb-8 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <div className={`rounded-[2.5rem] p-8 shadow-2xl border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
        <h2 className={`text-3xl font-black mb-2 tracking-tighter uppercase ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>提案・報告</h2>
        <p className={`font-bold text-[10px] mb-8 uppercase tracking-widest ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>Contact: nishikidootama@gmail.com</p>
        
        <div className="space-y-6">
          <div>
            <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>種別</label>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => { setType('suggestion'); setError(null); }}
                className={`flex-1 min-w-[100px] py-3 rounded-xl font-bold transition-all ${type === 'suggestion' ? 'bg-indigo-600 text-white' : (isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500')}`}
              >
                提案
              </button>
              <button 
                onClick={() => { setType('report'); setError(null); }}
                className={`flex-1 min-w-[100px] py-3 rounded-xl font-bold transition-all ${type === 'report' ? 'bg-red-600 text-white' : (isDarkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500')}`}
              >
                報告
              </button>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>内容</label>
            <textarea 
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(null); }}
              placeholder="こちらに内容を入力してください"
              rows={5}
              className={`w-full px-4 py-3 rounded-xl border-2 outline-none transition-all font-bold resize-none ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-white border-slate-100 text-slate-900 focus:border-indigo-500'}`}
            />
          </div>

          {error && (
            <p className="text-red-500 text-xs font-bold uppercase tracking-widest">{error}</p>
          )}

          <button 
            onClick={handleSubmit}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl"
          >
            送信する
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function TrainingConfigView({ pack, onStartTraining, onStartBattle, onBack, isDarkMode }: { 
  pack: Pack, 
  onStartTraining: (count: number) => void,
  onStartBattle: (count: number) => void,
  onBack: () => void,
  isDarkMode: boolean
}) {
  const [selectedCount, setSelectedCount] = useState(50);

  return (
    <motion.div 
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="p-6 max-w-2xl mx-auto w-full"
    >
      <button onClick={onBack} className={`mb-8 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> Back to Packs
      </button>

      <div className="relative rounded-[2.5rem] p-10 overflow-hidden mb-10 card-pack-shadow">
        <div className={`absolute inset-0 ${pack.color} opacity-90`}></div>
        <div className="relative z-10 text-white">
          <h2 className="text-4xl font-black leading-tight tracking-tighter uppercase whitespace-pre-wrap">
            {pack.name}
            <div className="text-base text-white/80 font-medium normal-case tracking-normal mt-1">{pack.description}</div>
          </h2>
        </div>
        <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      <div className="space-y-10">
        <section>
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-xl font-black uppercase tracking-tighter transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Select Mode</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Choose your challenge</span>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <div className={`rounded-3xl p-6 border-2 shadow-sm transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-indigo-950' : 'bg-indigo-100'}`}>
                  <Play className="w-5 h-5 text-indigo-600 fill-current" />
                </div>
                <span className={`font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>トレーニングモード</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[10, 30, 50, 100, 150].map(count => (
                  <button
                    key={count}
                    onClick={() => {
                      playSound('click');
                      onStartTraining(count);
                    }}
                    className={`py-4 border-2 border-transparent rounded-2xl font-black transition-all ${isDarkMode ? 'bg-slate-800 text-slate-300 hover:border-indigo-500 hover:text-indigo-400' : 'bg-slate-50 text-slate-700 hover:border-indigo-500 hover:bg-white hover:text-indigo-600'}`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Word List Display */}
          <div className={`mt-8 rounded-3xl p-6 border-2 shadow-sm transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
            <h3 className={`font-black uppercase tracking-tight mb-4 flex items-center gap-2 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              <Info className="w-5 h-5 text-indigo-600" />
              収録内容一覧（{pack.words.length}問）
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {pack.words.map((w, i) => (
                <div key={i} className={`text-[10px] font-bold px-2 py-1 rounded border truncate transition-colors ${isDarkMode ? 'text-slate-400 bg-slate-950 border-slate-800' : 'text-slate-500 bg-slate-50 border-slate-100'}`}>
                  {w.word}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </motion.div>
  );
}

function MatchingView({ onCancel, matchState, isDarkMode }: { onCancel: () => void, matchState?: MatchRoomState | null, isDarkMode: boolean }) {
  if (matchState?.type === 'group') {
    return (
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`min-h-[80dvh] flex flex-col items-center justify-center p-6 text-center transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="mb-8"
        >
          <h2 className="text-4xl font-black text-indigo-600 tracking-tighter uppercase italic">「みんなで対戦」マッチング中</h2>
          <p className="text-slate-400 font-bold mt-2">メンバーが集まるまでしばらくお待ちください (3〜8人)</p>
        </motion.div>

        {matchState.countdown !== null && matchState.countdown !== undefined && (
          <div className="mb-8 p-4 bg-red-500 text-white font-black text-xl rounded-2xl animate-pulse inline-block">
            🔔 最小人数(3人)を突破！あと {matchState.countdown} 秒でゲームが開始します！
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 w-full max-w-lg">
          {matchState.players.map((p) => (
            <div key={p.id} className={`flex flex-col items-center gap-2 p-4 rounded-3xl border-2 transition-all ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
              <div className="text-3xl">{p.icon}</div>
              <p className={`font-black uppercase text-xs truncate max-w-[100px] transition-colors ${isDarkMode ? 'text-slate-300' : 'text-slate-900'}`}>{p.name}</p>
              <span className="text-[10px] bg-indigo-100 text-indigo-600 font-black px-2 py-0.5 rounded-full">CONNECTED</span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 8 - matchState.players.length) }).map((_, i) => (
            <div key={i} className={`flex flex-col items-center justify-center gap-2 p-4 rounded-3xl border-2 border-dashed border-slate-300 min-h-[100px] opacity-40`}>
              <Users className="w-8 h-8 text-slate-400 animate-pulse" />
              <p className="text-[10px] text-slate-400 font-bold">空きスロット</p>
            </div>
          ))}
        </div>

        <button 
          onClick={onCancel}
          className={`px-8 py-3 rounded-xl font-bold transition-all ${isDarkMode ? 'bg-slate-900 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          キャンセル
        </button>
      </motion.div>
    );
  }

  if (matchState?.players?.length === 2) {
    return (
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`min-h-[80dvh] flex flex-col items-center justify-center p-6 text-center transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="mb-8"
        >
          <h2 className="text-6xl font-black text-indigo-600 tracking-tighter uppercase italic">matching!</h2>
        </motion.div>
        
        <div className="flex items-center gap-6 mb-8">
          {matchState.players.map((p, i) => (
            <React.Fragment key={p.id}>
              <div className="flex flex-col items-center gap-2">
                <div className={`w-20 h-20 rounded-2xl shadow-xl flex items-center justify-center border-2 transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                  <div className="text-4xl">{p.icon}</div>
                </div>
                <p className={`font-black uppercase text-xs transition-colors ${isDarkMode ? 'text-slate-300' : 'text-slate-900'}`}>{p.name}</p>
              </div>
              {i === 0 && <div className={`text-2xl font-black italic transition-colors ${isDarkMode ? 'text-slate-800' : 'text-slate-300'}`}>VS</div>}
            </React.Fragment>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className={`min-h-[80dvh] flex flex-col items-center justify-center p-6 transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <div className="relative mb-8">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className={`w-32 h-32 rounded-full flex items-center justify-center transition-colors ${isDarkMode ? 'bg-indigo-950/40' : 'bg-indigo-100'}`}
        >
          <Users className="w-16 h-16 text-indigo-600" />
        </motion.div>
      </div>
      <h2 className={`text-2xl font-black mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>matching..</h2>
      <p className="text-slate-500 mb-8">対戦相手を探しています</p>
      
      <button 
        onClick={onCancel}
        className={`px-8 py-3 rounded-xl font-bold transition-all ${isDarkMode ? 'bg-slate-900 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
      >
        キャンセル
      </button>
    </div>
  );
}

function FriendMatchSetupView({ pack, onBack, onCreateMatch, onJoinMatch, onSelectPack, isDarkMode }: { 
  pack: Pack | null, 
  onBack: () => void,
  onCreateMatch: (count: number) => void,
  onJoinMatch: () => void,
  onSelectPack: (pack: Pack) => void,
  isDarkMode: boolean
}) {
  const nonListeningPacks = PACKS.filter(p => p.type !== 'listening');
  // If the pack is "wrong_questions" or is a listening pack, we must force selection of a real pack
  const initialIsSelecting = !pack || pack.id === 'wrong_questions' || pack.type === 'listening';
  const [isSelectingPack, setIsSelectingPack] = useState(initialIsSelecting);

  if (isSelectingPack) {
    return (
      <motion.div 
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="p-6 max-w-2xl mx-auto w-full"
      >
        <button onClick={onBack} className={`mb-8 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <h2 className={`text-3xl font-black mb-8 tracking-tighter uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Select Pack for Friend Match</h2>
        <div className="grid grid-cols-1 gap-4">
          {nonListeningPacks.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelectPack(p); setIsSelectingPack(false); }}
              className={`p-6 rounded-3xl border-2 flex items-center justify-between group transition-all ${pack?.id === p.id ? 'border-indigo-600 bg-indigo-50' : (isDarkMode ? 'border-slate-800 bg-slate-900 hover:border-indigo-500/50' : 'border-slate-100 bg-white hover:border-indigo-300')}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl ${p.color} flex items-center justify-center text-white font-black`}>
                  {p.name.charAt(0)}
                </div>
                <div className="text-left">
                  <h3 className={`font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{p.name}</h3>
                  <p className="text-xs text-slate-400 font-bold">{p.words.length} Questions</p>
                </div>
              </div>
              <ChevronRight className={`w-6 h-6 ${pack?.id === p.id ? 'text-indigo-600' : 'text-slate-300'}`} />
            </button>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div 
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="p-6 max-w-2xl mx-auto w-full"
    >
      <button onClick={onBack} className={`mb-8 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <h2 className={`text-3xl font-black mb-8 tracking-tighter uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Friend Match</h2>

      <div className="grid grid-cols-1 gap-6">
        <div className={`rounded-[2.5rem] p-8 shadow-xl border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-indigo-950/40' : 'bg-indigo-50'}`}>
                <QrCode className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className={`font-black uppercase tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Create Match</h3>
                <p className="text-xs text-slate-400 font-bold">QRコードを表示して友達を招待</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSelectingPack(true)}
              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              CHANGE PACK
            </button>
          </div>

          <div className={`mb-6 p-4 rounded-2xl border flex items-center gap-3 transition-colors ${isDarkMode ? 'bg-indigo-950/20 border-indigo-900' : 'bg-indigo-50 border-indigo-100'}`}>
             <div className={`w-10 h-10 rounded-xl ${pack?.color || 'bg-slate-200'} flex items-center justify-center text-white font-black text-xs`}>
                {pack?.name.charAt(0) || '?'}
             </div>
             <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Selected Pack</p>
                <h4 className={`font-black uppercase text-sm ${isDarkMode ? 'text-indigo-300' : 'text-indigo-900'}`}>{pack?.name}</h4>
             </div>
          </div>
          
          <button
            onClick={() => onCreateMatch(999)}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            ルームを作成する
          </button>
        </div>

        <button 
          onClick={onJoinMatch}
          className={`rounded-[2.5rem] p-8 shadow-xl flex items-center justify-between group active:scale-95 transition-all ${isDarkMode ? 'bg-indigo-950/30 ring-1 ring-white/10' : 'bg-indigo-900'}`}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-indigo-500/10 group-hover:bg-indigo-500/20' : 'bg-white/10 group-hover:bg-white/20'}`}>
              <Scan className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-black text-white uppercase tracking-tight">Join Match</h3>
              <p className="text-xs text-white/50 font-bold">友達のQRコードを読み取る</p>
            </div>
          </div>
          <ChevronRight className="w-8 h-8 text-white/30 group-hover:text-white transition-colors" />
        </button>
      </div>
    </motion.div>
  );
}

function FriendMatchWaitingView({ inviteCode, onCancel, matchState, player, onStart, isDarkMode }: { 
  inviteCode: string, 
  onCancel: () => void,
  matchState?: MatchRoomState | null,
  player?: Player | null,
  onStart?: () => void,
  isDarkMode: boolean
}) {
  const joinUrl = `${window.location.origin}/join/${inviteCode}`;
  const isHost = matchState?.hostId === player?.id;
  const canStart = (matchState?.players?.length || 0) >= 2;

  return (
    <div className={`min-h-[80dvh] flex flex-col items-center justify-center p-6 text-center transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <div className={`p-8 rounded-[3rem] shadow-2xl border transition-colors max-w-md w-full ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100 mb-8'}`}>
        <h2 className={`text-2xl font-black mb-2 uppercase tracking-tighter transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Waiting Room</h2>
        <p className="text-slate-400 font-bold text-sm mb-8">友達にこのQRコードを見せてください</p>
        
        <div className={`p-4 rounded-3xl border-4 inline-block mb-8 transition-colors ${isDarkMode ? 'bg-white border-indigo-600' : 'bg-white border-slate-900'}`}>
          <QRCodeSVG value={joinUrl} size={200} />
        </div>

        <div className={`mb-8 p-6 rounded-3xl relative group border-2 transition-colors ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invite Code</p>
          <p className={`text-5xl font-black tracking-[0.2em] leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{inviteCode}</p>
        </div>

        <div className="space-y-3 mb-8">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-left px-2">Players ({matchState?.players?.length || 0}/4)</p>
          {matchState?.players?.map(p => (
            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl border-2 shadow-sm transition-colors ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-100'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-slate-100'}`}>
                {p.icon}
              </div>
              <div className="flex-1 text-left">
                <p className={`font-black transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{p.name}</p>
                {p.id === matchState?.hostId && <p className="text-[10px] font-black text-indigo-500 uppercase">Host</p>}
              </div>
              {p.id === player?.id && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>}
            </div>
          ))}
          {[...Array(4 - (matchState?.players?.length || 0))].map((_, i) => (
            <div key={i} className={`flex items-center gap-3 p-3 rounded-2xl border-2 border-dashed transition-colors ${isDarkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50/50 border-slate-200'}`}>
              <div className={`w-10 h-10 rounded-xl border-2 border-dashed transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}></div>
              <p className="text-slate-300 font-bold text-sm">Waiting...</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          {isHost && (
            <button 
              onClick={onStart}
              disabled={!canStart}
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
            >
              START GAME
            </button>
          )}
          <button 
            onClick={onCancel}
            className={`w-full py-3 rounded-2xl font-bold transition-all ${isDarkMode ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

function FriendMatchJoinView({ onBack, onJoin, isDarkMode }: { onBack: () => void, onJoin: (code: string) => void, isDarkMode: boolean }) {
  const [code, setCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    
    if (isScanning) {
      setError(null);
      html5QrCode = new Html5Qrcode("reader");
      
      const config = { fps: 10, qrbox: { width: 250, height: 250 } };
      
      html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        (decodedText) => {
          const match = decodedText.match(/\/join\/([A-Z0-9]+)/);
          const extractedCode = match ? match[1] : decodedText;
          onJoin(extractedCode);
          html5QrCode?.stop().then(() => {
            setIsScanning(false);
          }).catch(err => console.error("Stop error", err));
        },
        undefined
      ).catch(err => {
        console.error("Start error", err);
        setError("カメラの起動に失敗しました。設定を確認してください。");
        setIsScanning(false);
      });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch(e => console.error("Cleanup stop error", e));
      }
    };
  }, [isScanning, onJoin]);

  return (
    <motion.div 
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="p-6 max-w-2xl mx-auto w-full"
    >
      <button onClick={onBack} className={`mb-8 flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <h2 className={`text-3xl font-black mb-8 tracking-tighter uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Join Match</h2>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-600 font-bold text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div className={`rounded-[2.5rem] p-8 shadow-xl border transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Enter Invite Code</label>
          <div className="flex gap-3">
            <input 
              type="text" 
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6-DIGIT CODE"
              maxLength={6}
              className={`flex-1 px-6 py-4 rounded-2xl border-2 outline-none transition-all font-black text-2xl tracking-widest uppercase ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500' : 'bg-white border-slate-100 text-slate-900 focus:border-indigo-500'}`}
            />
            <button 
              onClick={() => onJoin(code)}
              disabled={code.length !== 6}
              className="px-8 bg-indigo-600 text-white rounded-2xl font-black hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
            >
              JOIN
            </button>
          </div>
        </div>

        <div className="relative flex items-center py-4">
          <div className={`flex-grow border-t transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}></div>
          <span className="flex-shrink mx-4 text-slate-300 text-xs font-black uppercase tracking-widest">OR</span>
          <div className={`flex-grow border-t transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}></div>
        </div>

        <div className={`rounded-[2.5rem] p-8 shadow-xl text-center transition-colors ${isDarkMode ? 'bg-slate-900' : 'bg-slate-900'}`}>
          {!isScanning ? (
            <button 
              onClick={() => setIsScanning(true)}
              className="w-full py-8 border-4 border-dashed border-white/20 rounded-3xl flex flex-col items-center gap-4 hover:border-white/40 transition-all group"
            >
              <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
                <Scan className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-white font-black text-xl uppercase tracking-tight">Scan QR Code</p>
                <p className="text-white/40 text-xs font-bold">友達の画面をスキャン</p>
              </div>
            </button>
          ) : (
            <div className="space-y-4">
              <div id="reader" className="overflow-hidden rounded-2xl bg-black aspect-square"></div>
              <button 
                onClick={() => setIsScanning(false)}
                className="text-white/50 font-black text-xs uppercase tracking-widest hover:text-white transition-colors"
              >
                Cancel Scanning
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
function ResultView({ mode, score, wrongCount, total, timeTaken, opponentScore, onRetry, onHome, isRematchRequested, onRematch, matchState, player, answerHistory, onSaveWrongQuestions, isDarkMode }: { 
  mode: 'training' | 'battle', 
  score: number, 
  wrongCount: number,
  total: number, 
  timeTaken: number,
  opponentScore?: number,
  onRetry: () => void, 
  onHome: () => void,
  isRematchRequested?: boolean,
  onRematch?: () => void,
  matchState?: MatchRoomState | null,
  player?: Player | null,
  answerHistory: { word: string, meaning: string, status: 'correct' | 'wrong' | 'lost' }[],
  onSaveWrongQuestions: (words: Word[]) => void,
  isDarkMode: boolean
}) {
  const isGroup = matchState?.type === 'group';
  const sortedPlayers = isGroup 
    ? [...(matchState?.players || [])].sort((a, b) => b.score - a.score)
    : [];
  const myRankIndex = sortedPlayers.findIndex(p => p.id === player?.id);
  const myRank = myRankIndex !== -1 ? myRankIndex + 1 : 1;

  const isWin = mode === 'battle' ? (opponentScore !== undefined && score > opponentScore) : true;
  const isDraw = mode === 'battle' && opponentScore !== undefined && score === opponentScore;
  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;

  const opponent = matchState?.players?.find(p => p.id !== player?.id);
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    // Automatically save mistakes to notebook when results view is shown
    const wrongWords = answerHistory
      .filter(item => item.status === 'wrong' || item.status === 'lost')
      .map(item => {
        for (const pack of PACKS) {
          const found = pack.words.find(w => w.word === item.word);
          if (found) return found;
        }
        return { word: item.word, meaning: item.meaning, choices: [] };
      });
    
    if (wrongWords.length > 0) {
      onSaveWrongQuestions(wrongWords as Word[]);
    }
  }, [answerHistory, onSaveWrongQuestions]);

  const handleSaveWrong = () => {
    const wrongWords = answerHistory
      .filter(item => item.status === 'wrong' || item.status === 'lost')
      .map(item => {
        // Try to find the full Word object in PACKS
        for (const pack of PACKS) {
          const found = pack.words.find(w => w.word === item.word);
          if (found) return found;
        }
        return { word: item.word, meaning: item.meaning, choices: [] };
      });
    
    if (wrongWords.length > 0) {
      onSaveWrongQuestions(wrongWords as Word[]);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000);
      playSound('correct');
    }
  };

  const handleShare = async () => {
    const wrongWords = answerHistory.filter(item => item.status === 'wrong').map(item => `・${item.word} (${item.meaning})`);
    const lostWords = answerHistory.filter(item => item.status === 'lost').map(item => `・${item.word} (${item.meaning})`);

    let shareText = `【激アツ英単語 - 復習リスト】\nアプリで英単語を特訓中！🔥\nhttps://ais-pre-rr2ttfs754ir6fyylr5a4z-247786600891.asia-northeast1.run.app\n\n`;

    if (wrongWords.length > 0) {
      shareText += `■ 間違えた問題 (×)\n${wrongWords.join('\n')}\n\n`;
    }

    if (lostWords.length > 0) {
      shareText += `■ 押し負けた問題 (△)\n${lostWords.join('\n')}\n\n`;
    }

    if (wrongWords.length === 0 && lostWords.length === 0) {
      shareText += `全問正解！完璧です！✨\n`;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: '激アツ英単語 復習リスト',
          text: shareText,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
      } catch (err) {
        console.error('Clipboard failed:', err);
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-6 max-w-2xl mx-auto w-full"
    >
      <div className={`rounded-[3rem] p-8 md:p-12 shadow-2xl border text-center relative overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
        {mode === 'battle' ? (
          <>
            {isGroup ? (
              <>
                {/* Group Leaderboard Ranking */}
                <div className="mb-8 text-center">
                  <div className={`inline-flex items-center gap-2 px-6 py-2 rounded-full font-black uppercase tracking-widest text-sm mb-4 transition-colors ${isDarkMode ? 'bg-indigo-950/40 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                    <Trophy className="w-5 h-5 animate-bounce" /> 対戦結果 (RANKING)
                  </div>
                  <h2 className={`text-4xl font-black tracking-tighter mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    あなたの順位: <span className="text-indigo-600 text-5xl">{myRank}</span> / {sortedPlayers.length}位
                  </h2>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Final Standings</p>
                </div>

                <div className="space-y-3 mb-8">
                  {sortedPlayers.map((p, idx) => {
                    const isMe = p.id === player?.id;
                    const medal = idx === 0 ? '👑 1位' : idx === 1 ? '🥈 2位' : idx === 2 ? '🥉 3位' : `${idx + 1}位`;
                    const medalColor = idx === 0 ? 'text-yellow-500 font-black' : idx === 1 ? 'text-slate-400' : idx === 2 ? 'text-amber-600' : 'text-slate-400';
                    return (
                      <div 
                        key={p.id} 
                        className={`flex items-center justify-between p-4 rounded-3xl border-2 transition-all ${
                          isMe 
                            ? 'bg-indigo-50 border-indigo-500 dark:bg-indigo-950/30 dark:border-indigo-800 ring-2 ring-indigo-300' 
                            : (isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100')
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`text-lg font-black ${medalColor} w-12 text-left`}>{medal}</div>
                          <div className="text-3xl">{p.icon}</div>
                          <div className="text-left">
                            <p className={`font-black text-sm leading-none mb-1 ${isMe ? 'text-indigo-600' : (isDarkMode ? 'text-white' : 'text-slate-900')}`}>
                              {p.name} {isMe && '(YOU)'}
                            </p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">SCORE</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl font-black text-indigo-600">{p.score}</span>
                          <span className="text-[10px] text-slate-400 font-bold ml-1">pts</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                {/* Top Section: Scores */}
                <div className="flex justify-between items-center mb-12 px-4">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-5xl font-black text-indigo-600">{score}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your Score</div>
                  </div>
                  <div className={`h-12 w-px transition-colors ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}></div>
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-5xl font-black text-red-600">{opponentScore ?? 0}</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opponent</div>
                  </div>
                </div>

                {/* Middle Section: Icons and WIN/LOSE */}
                <div className="flex items-center justify-center gap-8 md:gap-16 mb-8">
                  {/* Player */}
                  <div className="flex flex-col items-center gap-4">
                    <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-xl relative transition-colors ${isWin && !isDraw ? (isDarkMode ? 'bg-emerald-950/30 ring-4 ring-emerald-500' : 'bg-emerald-50 ring-4 ring-emerald-500') : (isDarkMode ? 'bg-slate-800' : 'bg-slate-50')}`}>
                      {player && React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: `w-12 h-12 ${isWin && !isDraw ? 'text-emerald-600' : 'text-slate-400'}` })}
                      {isWin && !isDraw && <Crown className="absolute -top-4 -right-4 w-10 h-10 text-yellow-500 drop-shadow-lg rotate-12" />}
                    </div>
                    <div className={`font-black text-2xl italic uppercase tracking-tighter ${isWin && !isDraw ? 'text-emerald-600' : isDraw ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSE'}
                    </div>
                  </div>

                  <div className={`text-4xl font-black italic transition-colors ${isDarkMode ? 'text-slate-800' : 'text-slate-200'}`}>VS</div>

                  {/* Opponent */}
                  <div className="flex flex-col items-center gap-4">
                    <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-xl relative transition-colors ${!isWin && !isDraw ? (isDarkMode ? 'bg-emerald-950/30 ring-4 ring-emerald-500' : 'bg-emerald-50 ring-4 ring-emerald-500') : (isDarkMode ? 'bg-slate-800' : 'bg-slate-50')}`}>
                      {opponent && React.createElement(PLAYER_ICONS.find(i => i.id === opponent.icon)?.icon || Smile, { className: `w-12 h-12 ${!isWin && !isDraw ? 'text-emerald-600' : 'text-slate-400'}` })}
                      {!isWin && !isDraw && <Crown className="absolute -top-4 -right-4 w-10 h-10 text-yellow-500 drop-shadow-lg rotate-12" />}
                    </div>
                    <div className={`font-black text-2xl italic uppercase tracking-tighter ${!isWin && !isDraw ? 'text-emerald-600' : isDraw ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {isDraw ? 'DRAW' : !isWin ? 'WIN' : 'LOSE'}
                    </div>
                  </div>
                </div>

                {/* Invite Code for Friend Match */}
                {matchState?.type === 'friend' && matchState.inviteCode && (
                  <div className={`mb-12 p-6 rounded-3xl border-2 inline-block transition-colors ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invite Code</p>
                    <p className={`text-4xl font-black tracking-[0.2em] leading-none transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{matchState.inviteCode}</p>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <div className="mb-8">
              <div className={`inline-flex items-center gap-2 px-6 py-2 rounded-full font-black uppercase tracking-widest text-sm mb-4 transition-colors ${isDarkMode ? 'bg-indigo-950/40 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
                <Trophy className="w-5 h-5" /> Training Complete
              </div>
              <h2 className={`text-6xl font-black tracking-tighter mb-2 transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {score}<span className={`text-2xl mx-1 transition-colors ${isDarkMode ? 'text-slate-700' : 'text-slate-300'}`}>/</span><span className={`text-2xl transition-colors ${isDarkMode ? 'text-slate-500' : 'text-slate-300'}`}>{total}</span>
              </h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Final Score</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-12">
              <div className={`p-4 rounded-3xl transition-colors ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accuracy</p>
                <p className={`text-xl font-black transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{accuracy}%</p>
              </div>
              <div className={`p-4 rounded-3xl transition-colors ${isDarkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Incorrect</p>
                <p className="text-xl font-black text-red-500">{wrongCount}</p>
              </div>
            </div>
          </>
        )}

        <div className="flex flex-col gap-3">
          {mode === 'battle' && onRematch && (
            <button
              onClick={() => { playSound('click'); onRematch(); }}
              className={`w-full py-5 rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isRematchRequested 
                ? 'bg-orange-500 text-white animate-pulse' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <RotateCcw className="w-6 h-6" />
              {isRematchRequested ? 'ACCEPT REMATCH!' : 'REMATCH?'}
            </button>
          )}
          <button
            onClick={() => { playSound('click'); onRetry(); }}
            className={`w-full py-5 rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${isDarkMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
          >
            <Play className="w-6 h-6" /> {mode === 'battle' ? 'NEW MATCH' : 'TRY AGAIN'}
          </button>
          
          <button
            onClick={() => { playSound('click'); onHome(); }}
            className={`w-full py-5 rounded-2xl font-black text-xl border-2 transition-all active:scale-95 flex items-center justify-center gap-2 ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-white border-slate-100 text-slate-600 hover:bg-slate-50'}`}
          >
            <Home className="w-6 h-6" /> EXIT TO HOME
          </button>
          
          {answerHistory.filter(i => i.status !== 'correct').length > 0 ? (
            <div className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border-2 transition-all ${
              isDarkMode 
              ? 'bg-emerald-950/20 border-emerald-900/50 text-emerald-400' 
              : 'bg-emerald-50 border-emerald-100 text-emerald-600'
            }`}>
              <Check className="w-5 h-5 text-emerald-500 animate-bounce" />
              <span>間違えた問題を復習帳に自動保存しました！</span>
            </div>
          ) : (
            <div className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 border-2 transition-all ${
              isDarkMode 
              ? 'bg-amber-950/20 border-amber-900/50 text-amber-400 animate-pulse' 
              : 'bg-amber-50 border-amber-100 text-amber-600'
            }`}>
              <Trophy className="w-5 h-5 text-amber-500" />
              <span>全問正解！完璧です！✨</span>
            </div>
          )}
        </div>

        {/* Answer History List */}
        {answerHistory.length > 0 && (
          <div className={`mt-12 pt-12 border-t transition-colors ${isDarkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Review Questions</h3>
            <div className="space-y-3 pr-2">
              {answerHistory.map((item, idx) => (
                <div key={idx} className={`flex items-center justify-between p-4 rounded-2xl border transition-colors ${isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-100'}`}>
                  <div className="flex flex-col items-start text-left">
                    <span className={`font-black tracking-tight transition-colors ${isDarkMode ? 'text-white' : 'text-slate-700'}`}>{item.word}</span>
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest leading-none mt-1">{item.meaning}</span>
                  </div>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-lg flex-shrink-0 ${
                    item.status === 'correct' ? 'text-emerald-500 bg-emerald-50' : 
                    item.status === 'lost' ? 'text-orange-500 bg-orange-50' : 
                    'text-red-500 bg-red-50'
                  }`}>
                    {item.status === 'correct' ? '〇' : item.status === 'lost' ? '△' : '×'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function TutorialView({ onSkip, isDarkMode }: { onSkip: () => void, isDarkMode: boolean }) {
  const [step, setStep] = useState(0);
  const [shared, setShared] = useState(false);
  const steps = [
    {
      title: "激アツ英単語へようこそ！",
      desc: "このアプリは、ハイスピードで英単語をマスターし、ライバルと競い合うバトルアプリです。",
      icon: Zap,
      color: "bg-orange-500"
    },
    {
      title: "トレーニングモード",
      desc: "一人でじっくり語彙力を鍛えましょう。好きなパックと問題数を選んでスタート！",
      icon: Play,
      color: "bg-indigo-600"
    },
    {
      title: "リアルタイム対戦",
      desc: "オンラインで他のプレイヤーと対戦！スピードと正確さが勝利の鍵です。",
      icon: Trophy,
      color: "bg-emerald-500"
    },
    {
      title: "フレンドマッチ",
      desc: "ルームを作成して、QRコードやリンクで友達を招待！プライベートな対戦が楽しめます。",
      icon: Users,
      color: "bg-purple-500"
    }
  ];

  const current = steps[step];

  return (
    <div className={`min-h-[100dvh] flex flex-col items-center justify-center p-6 font-sans transition-colors ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      <motion.div 
        key={step}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`w-full max-w-md rounded-[3rem] p-12 shadow-2xl border relative overflow-hidden transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'} text-center`}
      >
        <div className={`w-24 h-24 ${current.color} rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-lg`}>
          <current.icon className="w-12 h-12 text-white" />
        </div>
        
        <h2 className={`text-3xl font-black mb-4 tracking-tighter uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{current.title}</h2>
        <p className={`font-bold leading-relaxed mb-12 transition-colors ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{current.desc}</p>

        <div className="flex flex-col gap-4">
          <button 
            onClick={() => {
              playSound('click');
              if (step < steps.length - 1) setStep(step + 1);
              else onSkip();
            }}
            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95 cursor-pointer"
          >
            {step === steps.length - 1 ? 'スタート！' : '次へ'}
          </button>
          <button 
            onClick={() => { playSound('click'); onSkip(); }}
            className={`font-black text-sm uppercase tracking-widest transition-colors cursor-pointer ${isDarkMode ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
          >
            チュートリアルをスキップ
          </button>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-indigo-600' : (isDarkMode ? 'w-2 bg-slate-800' : 'w-2 bg-slate-200')}`} 
            />
          ))}
        </div>

        {/* Sharing Section */}
        <div className={`mt-8 pt-6 border-t ${isDarkMode ? 'border-slate-800' : 'border-slate-100'} flex flex-col items-center gap-4`}>
          <div className="flex items-center gap-2 justify-center flex-wrap">
            <span className={`text-xs font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>アプリをシェア:</span>
            <a 
              href="https://gekiatsu.vercel.app/" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-xs font-black text-indigo-500 hover:text-indigo-600 underline break-all"
            >
              https://gekiatsu.vercel.app/
            </a>
          </div>
          <button
            onClick={() => {
              playSound('click');
              navigator.clipboard.writeText("https://gekiatsu.vercel.app/");
              setShared(true);
              setTimeout(() => setShared(false), 2000);
            }}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-2xl border transition-all cursor-pointer ${
              shared 
                ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg' 
                : (isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100')
            }`}
          >
            <Share2 className="w-4 h-4" />
            <span className="text-xs font-black uppercase tracking-wider">{shared ? 'リンクをコピーしました！' : 'シェアリンクをコピー'}</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function SetupView({ onComplete, isMusicMuted, onToggleMute, isDarkMode, onToggleTheme, isOnline, connectionError, onReconnect }: { 
  onComplete: (name: string, iconId: string) => void, 
  isMusicMuted: boolean, 
  onToggleMute: () => void,
  isDarkMode: boolean,
  onToggleTheme: () => void,
  isOnline: boolean,
  connectionError: string | null,
  onReconnect: () => void
}) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('smile');

  return (
    <div className={`min-h-[100dvh] flex flex-col items-center justify-center p-6 relative overflow-hidden transition-colors duration-300 ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      {/* Offline Banner for Setup */}
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-[10px] font-black py-1.5 px-4 text-center z-50 flex items-center justify-center gap-2">
          <WifiOff className="w-3 h-3" />
          <span>OFFLINE: {connectionError || 'Server Connection Failed'}</span>
          <button 
            onClick={onReconnect}
            className="ml-2 px-3 py-0.5 bg-white text-red-600 rounded-full hover:bg-red-50 transition-colors text-[8px] uppercase tracking-widest"
          >
            Reconnect
          </button>
        </div>
      )}

      {/* Control Buttons for Setup */}
      <div className="absolute top-6 right-6 z-20 flex gap-2">
        <button 
          onClick={onToggleTheme}
          className={`p-3 backdrop-blur-sm border rounded-2xl shadow-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-900/80 border-slate-800 text-yellow-500' : 'bg-white/80 border-slate-100 text-slate-600'}`}
        >
          {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
        <button 
          onClick={onToggleMute}
          className={`p-3 backdrop-blur-sm border rounded-2xl shadow-sm transition-all active:scale-95 ${isDarkMode ? 'bg-slate-900/80 border-slate-800' : 'bg-white/80 border-slate-100'}`}
        >
          {isMusicMuted ? <VolumeX className="w-6 h-6 text-slate-400" /> : <Volume2 className="w-6 h-6 text-indigo-600" />}
        </button>
      </div>
      {/* Animated Background - Removed as requested */}
      <div className={`absolute inset-0 z-0 ${isDarkMode ? 'bg-slate-900/20' : 'bg-slate-50/50'}`}></div>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`backdrop-blur-xl rounded-[3rem] p-8 md:p-12 w-full max-w-md relative z-10 transition-colors ${isDarkMode ? 'bg-slate-900/80 border border-slate-800' : 'bg-white/80'}`}
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            className="inline-block px-4 py-1 bg-orange-100 text-orange-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4"
          >
            Hot & Exciting!
          </motion.div>
          <h1 className={`text-4xl md:text-5xl font-black tracking-tighter leading-none mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>激アツ英単語</h1>
          <p className={`${isDarkMode ? 'text-slate-400' : 'text-slate-500'} font-bold`}>名前を入力して始めよう！</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>プレイヤー名を入力</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名前を入力"
              className={`w-full px-4 py-3 rounded-xl border-2 outline-none transition-all font-bold ${isDarkMode ? 'bg-slate-800 border-slate-700 text-white focus:border-indigo-500' : 'bg-white border-slate-100 text-slate-900 focus:border-indigo-500'}`}
            />
          </div>

          <div>
            <label className={`block text-sm font-bold mb-2 ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>アイコンを選択</label>
            <div className="flex justify-between gap-2">
              {PLAYER_ICONS.map((item) => (
                <button 
                  key={item.id}
                  onClick={() => setSelectedIcon(item.id)}
                  className={`flex-1 p-3 rounded-xl border-2 transition-all flex items-center justify-center ${selectedIcon === item.id ? 'border-indigo-500 bg-indigo-50 scale-105' : (isDarkMode ? 'border-slate-800 bg-slate-800 hover:border-slate-600' : 'border-slate-100 bg-white hover:border-slate-200')}`}
                >
                  <item.icon className={`w-8 h-8 ${item.color}`} />
                </button>
              ))}
            </div>
          </div>

          <button 
            disabled={!name.trim()}
            onClick={() => onComplete(name, selectedIcon)}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
          >
            スタート！
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ==========================================
// 1. DASHBOARD HUB VIEW
// ==========================================
function DashboardHubView({ 
  player, 
  isDarkMode, 
  onSelectSolo, 
  onSelectOnline, 
  onSelectReview, 
  onSelectSuggestion,
  onLogout 
}: { 
  player: Player | null, 
  isDarkMode: boolean, 
  onSelectSolo: () => void, 
  onSelectOnline: () => void, 
  onSelectReview: () => void, 
  onSelectSuggestion: () => void,
  onLogout: () => void 
}) {
  const wrongCount = player?.wrongQuestions?.length || 0;
  const favoritesCount = player?.favorites?.length || 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      className="p-6 max-w-4xl mx-auto w-full space-y-8 pb-24"
    >
      {/* Welcome Banner */}
      <div className={`rounded-[2.5rem] p-8 md:p-12 relative overflow-hidden transition-all shadow-xl ${isDarkMode ? 'bg-gradient-to-br from-slate-900 to-indigo-950/40 border border-indigo-900/40' : 'bg-gradient-to-br from-indigo-50 to-white border border-indigo-100/50'}`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-4 ${isDarkMode ? 'bg-indigo-950/55 text-indigo-400' : 'bg-indigo-100/50 text-indigo-700'}`}>
              <Flame className="w-3.5 h-3.5 text-orange-500 animate-pulse" />
              <span>Gekiatsu English Challenge</span>
            </div>
            <h1 className={`text-4xl md:text-5xl font-black tracking-tight uppercase leading-tight mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              ハロー、{player?.name || 'ゲスト'}！
            </h1>
            <p className={`text-sm font-bold ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              ボキャブラリーとリスニング力を鍛え上げ、日本中のライバル達とリアルタイム対戦しよう！
            </p>
          </div>
          <div className="flex gap-4">
            <div className={`px-6 py-4 rounded-3xl text-center shadow-sm border ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-100'}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">お気に入り</p>
              <p className="text-2xl font-black text-indigo-600">{favoritesCount} <span className="text-xs text-slate-400">パック</span></p>
            </div>
            <div className={`px-6 py-4 rounded-3xl text-center shadow-sm border ${isDarkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-100'}`}>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">間違えた問題</p>
              <p className={`text-2xl font-black ${wrongCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>{wrongCount} <span className="text-xs text-slate-400">問</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Modes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Solo Play Card */}
        <motion.button
          whileHover={{ y: -6, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectSolo}
          className={`rounded-[2.5rem] p-8 text-left border-2 shadow-sm transition-all flex flex-col justify-between group h-64 ${
            isDarkMode 
              ? 'bg-slate-900 border-slate-800 hover:border-indigo-500' 
              : 'bg-white border-slate-100 hover:border-indigo-500'
          }`}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-slate-800 group-hover:bg-indigo-600' : 'bg-indigo-50 group-hover:bg-indigo-600'}`}>
            <BookOpen className={`w-7 h-7 transition-colors ${isDarkMode ? 'text-indigo-400 group-hover:text-white' : 'text-indigo-600 group-hover:text-white'}`} />
          </div>
          <div>
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">SOLO PLAY</span>
            <h2 className={`text-2xl font-black tracking-tight leading-none mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              自主トレ（ソロプレイ）
            </h2>
            <p className={`text-xs font-bold leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              自分のペースで公式の単語・リスニング問題集をサクサク学習！お気に入り登録も可能です。
            </p>
          </div>
        </motion.button>

        {/* Online Battle Card */}
        <motion.button
          whileHover={{ y: -6, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSelectOnline}
          className={`rounded-[2.5rem] p-8 text-left border-2 shadow-sm transition-all flex flex-col justify-between group h-64 ${
            isDarkMode 
              ? 'bg-slate-900 border-slate-800 hover:border-orange-500' 
              : 'bg-white border-slate-100 hover:border-orange-500'
          }`}
        >
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors ${isDarkMode ? 'bg-slate-800 group-hover:bg-orange-600' : 'bg-orange-50 group-hover:bg-orange-600'}`}>
            <Gamepad2 className={`w-7 h-7 transition-colors ${isDarkMode ? 'text-orange-400 group-hover:text-white' : 'text-orange-600 group-hover:text-white'}`} />
          </div>
          <div>
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-1">ONLINE PLAY</span>
            <h2 className={`text-2xl font-black tracking-tight leading-none mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              オンライン対戦（バトル）
            </h2>
            <p className={`text-xs font-bold leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              全国の英語学習者とリアルタイムスピード対戦！友達とルーム対戦（フレンドマッチ）も。
            </p>
          </div>
        </motion.button>
      </div>

      {/* Review Hub Highlight Card */}
      <motion.button
        whileHover={{ y: -4, scale: 1.005 }}
        whileTap={{ scale: 0.99 }}
        onClick={onSelectReview}
        className={`w-full rounded-[2.5rem] p-8 text-left border-2 shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group relative overflow-hidden ${
          isDarkMode 
            ? 'bg-slate-900 border-slate-800 hover:border-red-500/50' 
            : 'bg-white border-slate-100 hover:border-red-500/50'
        }`}
      >
        <div className="flex items-center gap-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors flex-shrink-0 ${isDarkMode ? 'bg-slate-800 group-hover:bg-red-600' : 'bg-red-50 group-hover:bg-red-600'}`}>
            <RotateCcw className={`w-7 h-7 transition-colors ${isDarkMode ? 'text-red-400 group-hover:text-white' : 'text-red-600 group-hover:text-white'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">WRONG QUESTIONS REVIEW</span>
              {wrongCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500 text-white font-black text-[9px] rounded-full uppercase animate-pulse">
                  復習が必要！
                </span>
              )}
            </div>
            <h2 className={`text-2xl font-black tracking-tight leading-none mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              苦手克服（マイ復習帳）
            </h2>
            <p className={`text-xs font-bold leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              間違えた問題を自動で蓄積。カード型暗記、音声再生機能、専用テストで弱点をピンポイント消去！
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xl font-black px-4 py-2 rounded-2xl ${wrongCount > 0 ? 'bg-red-500/10 text-red-500' : 'bg-slate-100 text-slate-400'}`}>
            {wrongCount} 問
          </span>
          <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
        </div>
      </motion.button>

      {/* Footer Utility Actions */}
      <div className="flex items-center justify-between gap-4 pt-4 flex-wrap border-t border-slate-100/50">
        <button 
          onClick={onSelectSuggestion}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-slate-200' : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'}`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>アプリの改善要望を送る</span>
        </button>

        <button 
          onClick={onLogout}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold text-red-500 hover:bg-red-50/50 transition-all`}
        >
          <LogOut className="w-4 h-4" />
          <span>サインアウト / ログアウト</span>
        </button>
      </div>
    </motion.div>
  );
}

// ==========================================
// 2. ONLINE LOBBY VIEW
// ==========================================
function OnlineLobbyView({ 
  player, 
  isDarkMode, 
  onBack, 
  onStartRandomBattle, 
  onStartGroupBattle,
  onFriendMatch 
}: { 
  player: Player | null, 
  isDarkMode: boolean, 
  onBack: () => void, 
  onStartRandomBattle: (pack: Pack, count: number) => void, 
  onStartGroupBattle: (pack: Pack) => void,
  onFriendMatch: () => void 
}) {
  const nonListeningPacks = PACKS.filter(p => p.type !== 'listening');
  const [selectedPackId, setSelectedPackId] = useState(nonListeningPacks[0]?.id || PACKS[0].id);
  const [questionCount, setQuestionCount] = useState(15);

  const activePack = nonListeningPacks.find(p => p.id === selectedPackId) || nonListeningPacks[0] || PACKS[0];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-6 max-w-2xl mx-auto w-full space-y-8 pb-24"
    >
      {/* Back to Hub Link */}
      <button onClick={onBack} className={`flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> ダッシュボードに戻る
      </button>

      <div>
        <h1 className={`text-3xl font-black mb-2 tracking-tighter uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
          オンラインバトル
        </h1>
        <p className="text-slate-400 font-bold text-sm">
          他のプレイヤーとスピードクイズ対戦！回答スピードが命です。
        </p>
      </div>

      {/* Online Options */}
      <div className="space-y-6">
        {/* Mode 1: Random Battle Maker */}
        <div className={`rounded-[2.5rem] p-8 border-2 shadow-sm transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-indigo-950/40 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`font-black text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                1. 全国ランダムマッチ
              </h2>
              <p className="text-xs text-slate-400">現在オンラインのプレイヤーから自動で相手を探します</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Questions</label>
              <select 
                value={selectedPackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border-2 outline-none transition-all font-bold ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500' : 'bg-white border-slate-100 text-slate-900 focus:border-indigo-500'}`}
              >
                {nonListeningPacks.map(p => (
                  <option key={p.id} value={p.id}>{p.category} - {p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => onStartRandomBattle(activePack, questionCount)}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-lg rounded-2xl shadow-lg transition-all active:scale-95"
          >
            対戦相手を探す（マッチング開始！）
          </button>
        </div>

        {/* Mode 1.5: Group Battle Maker ("みんなで対戦") */}
        <div className={`rounded-[2.5rem] p-8 border-2 shadow-sm transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDarkMode ? 'bg-indigo-950/40 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}`}>
              <Users className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className={`font-black text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                2. みんなで対戦
              </h2>
              <p className="text-xs text-slate-400">3〜8人でマッチングして100点先取の早押しクイズ対戦！</p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Questions</label>
              <select 
                value={selectedPackId}
                onChange={(e) => setSelectedPackId(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border-2 outline-none transition-all font-bold ${isDarkMode ? 'bg-slate-950 border-slate-800 text-white focus:border-indigo-500' : 'bg-white border-slate-100 text-slate-900 focus:border-indigo-500'}`}
              >
                {nonListeningPacks.map(p => (
                  <option key={p.id} value={p.id}>{p.category} - {p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={() => onStartGroupBattle(activePack)}
            className="w-full py-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-black text-lg rounded-2xl shadow-lg transition-all active:scale-95"
          >
            みんなで対戦に参加する（早押しクイズ！）
          </button>
        </div>

        {/* Mode 2: Friend Battle Launcher */}
        <div className={`rounded-[2.5rem] p-8 border-2 shadow-sm transition-all group ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? 'bg-purple-950/40 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h2 className={`font-black text-lg transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                  3. 友達とルーム対戦（フレンドマッチ）
                </h2>
                <p className="text-xs text-slate-400">QRコードや招待コードを送って、特定の友達とスピード対戦できます</p>
              </div>
            </div>
            <button
              onClick={onFriendMatch}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl transition-all active:scale-95 flex-shrink-0 text-center"
            >
              フレンドマッチを起動
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ==========================================
// 3. REVIEW HUB VIEW
// ==========================================
function ReviewHubView({ 
  player, 
  isDarkMode, 
  onBack, 
  onStartReviewTest, 
  onDeleteWord, 
  onClearAll,
  playAudio,
  isAudioPlaying
}: { 
  player: Player | null, 
  isDarkMode: boolean, 
  onBack: () => void, 
  onStartReviewTest: () => void, 
  onDeleteWord: (word: string) => void,
  onClearAll: () => void,
  playAudio: (word: string, fallbackText: string) => void,
  isAudioPlaying: boolean
}) {
  const wrongWords = player?.wrongQuestions || [];
  const [flippedWord, setFlippedWord] = useState<string | null>(null);

  const toggleFlip = (word: string) => {
    if (flippedWord === word) {
      setFlippedWord(null);
    } else {
      setFlippedWord(word);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="p-6 max-w-4xl mx-auto w-full space-y-8 pb-24"
    >
      {/* Back Button */}
      <button onClick={onBack} className={`flex items-center gap-2 font-black uppercase text-xs tracking-widest transition-colors ${isDarkMode ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'}`}>
        <ChevronLeft className="w-5 h-5" /> ダッシュボードに戻る
      </button>

      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className={`text-3xl font-black mb-2 tracking-tighter uppercase transition-colors ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
            苦手克服帳（マイ復習帳）
          </h1>
          <p className="text-slate-400 font-bold text-sm">
            対戦やトレーニング中に間違えた問題が自動でここに保存されます。覚えたら「覚えた！」で削除。
          </p>
        </div>
        {wrongWords.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm("復習帳をすべてクリアしますか？")) {
                onClearAll();
              }
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 transition-colors border border-red-100"
          >
            復習帳をすべて削除
          </button>
        )}
      </div>

      {wrongWords.length > 0 ? (
        <div className="space-y-8">
          {/* Practice Test Launcher */}
          <div className={`rounded-[2.5rem] p-8 border-2 shadow-sm text-center relative overflow-hidden ${isDarkMode ? 'bg-gradient-to-r from-red-950/20 to-slate-900 border-red-900/30' : 'bg-gradient-to-r from-red-50/50 to-white border-red-100/50'}`}>
            <div className="max-w-lg mx-auto">
              <span className="px-3 py-1 bg-red-500 text-white font-black text-[9px] rounded-full uppercase tracking-wider mb-4 inline-block">
                復習テスト
              </span>
              <h2 className={`text-2xl font-black tracking-tight mb-2 ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                苦手克服特訓（実力テスト）を開始する
              </h2>
              <p className={`text-xs font-bold mb-6 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                現在保存されている {wrongWords.length} 個の間間違え問題からランダムでテストを生成します！完璧を目指してトライ！
              </p>
              <button
                onClick={onStartReviewTest}
                className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-black text-lg rounded-2xl shadow-lg transition-all active:scale-95 cursor-pointer"
              >
                テスト開始！
              </button>
            </div>
          </div>

          {/* Cards Guide */}
          <div className="text-center">
            <p className="text-xs text-slate-400 font-bold">カードをタップすると日本語の意味が反転表示（フリップ）します！</p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {wrongWords.map((item) => {
              const isFlipped = flippedWord === item.word;
              return (
                <div 
                  key={item.word} 
                  className={`perspective-1000 h-48 relative group`}
                >
                  <div 
                    onClick={() => toggleFlip(item.word)}
                    className={`w-full h-full duration-500 transform-style-3d relative cursor-pointer ${
                      isFlipped ? 'rotate-y-180' : ''
                    }`}
                  >
                    {/* Front of Card */}
                    <div className={`absolute inset-0 backface-hidden rounded-[2rem] border-2 p-6 flex flex-col justify-between transition-colors shadow-sm ${
                      isDarkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-800'
                    }`}>
                      <div className="flex justify-between items-start">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            playAudio(item.word, item.word);
                          }}
                          className={`p-2 rounded-xl transition-colors ${
                            isDarkMode ? 'bg-slate-800 text-indigo-400 hover:bg-slate-700' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                          }`}
                          title="発音を聴く"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWord(item.word);
                          }}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                          title="覚えたので削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div>
                        <h3 className="text-2xl font-black tracking-tight uppercase leading-none break-all">
                          {item.word}
                        </h3>
                        <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mt-1">Tap to Flip</p>
                      </div>
                    </div>

                    {/* Back of Card */}
                    <div className={`absolute inset-0 backface-hidden rotate-y-180 rounded-[2rem] border-2 p-6 flex flex-col justify-between transition-colors shadow-md ${
                      isDarkMode ? 'bg-slate-950 border-red-950 text-white' : 'bg-red-50/40 border-red-100 text-slate-800'
                    }`}>
                      <div className="text-right">
                        <span className="px-2.5 py-0.5 bg-red-100 text-red-600 rounded-full text-[8px] font-black uppercase">意味</span>
                      </div>

                      <div className="text-center my-auto">
                        <h4 className="text-xl font-black text-red-600 leading-tight">
                          {item.meaning}
                        </h4>
                      </div>

                      <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold">
                        <span>タップで戻る</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteWord(item.word);
                          }}
                          className="text-red-500 font-bold hover:underline"
                        >
                          覚えた！
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className={`w-full py-20 flex flex-col items-center justify-center rounded-[2.5rem] border-2 border-dashed transition-colors ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <Trophy className="w-16 h-16 text-slate-300 mb-4" />
          <p className="text-slate-500 font-black uppercase tracking-widest text-xs mb-2">復習帳はクリアです！</p>
          <p className="text-slate-400 text-xs text-center max-w-xs">
            クイズで間違えた単語がここに追加されます。対戦をプレイしてトレーニングしましょう！
          </p>
        </div>
      )}
    </motion.div>
  );
}

