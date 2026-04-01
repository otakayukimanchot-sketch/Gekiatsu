import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Html5Qrcode } from 'html5-qrcode';
import { 
  Smile, Ghost, Rocket, Gamepad2, Zap, 
  Wifi, WifiOff, Trophy, Home, RotateCcw, 
  CheckCircle2, XCircle, Crown, Users, 
  Play, Settings, Info, ChevronRight, ChevronLeft,
  LogOut, MessageSquare, Send, Volume2, VolumeX,
  LogIn, QrCode, Scan, X, Copy, Check, Star, Share2
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { QRCodeSVG } from 'qrcode.react';
import { PACKS } from './constants';
import { Pack, Word, Player, MatchRoomState } from './types';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db, collection, doc, setDoc, getDoc, getDocs, deleteDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, handleFirestoreError, OperationType } from './firebase';

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
  const [view, setView] = useState<'setup' | 'tutorial' | 'home' | 'training_config' | 'training' | 'matching' | 'battle' | 'result' | 'suggestion' | 'friend_match_setup' | 'friend_match_waiting' | 'friend_match_join'>('setup');
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
  
  // Quiz State
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
  const [isMuted, setIsMuted] = useState(false);
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
      socketRef.current.disconnect();
      socketRef.current.connect();
    }
  };

  const playAudio = (text: string) => {
    if (isMuted) return;
    // Cancel any ongoing speech before starting new one
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = 0.9; // Slightly slower for clarity
    window.speechSynthesis.speak(utterance);
    setAudioPlayed(true);
  };

  // --- Stop Audio on view or question change ---
  useEffect(() => {
    window.speechSynthesis.cancel();
  }, [view, currentIndex]);

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
      if (bgmRef.current && !isMuted) {
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
    if (hasInteracted && !isMuted && !showSplash && !isListeningQuiz) {
      console.log('Attempting to play BGM:', targetUrl);
      bgmRef.current.play().catch((err) => {
        console.warn("BGM play failed:", err);
      });
    } else {
      console.log('Pausing BGM. hasInteracted:', hasInteracted, 'isMuted:', isMuted, 'showSplash:', showSplash, 'isListeningQuiz:', isListeningQuiz);
      bgmRef.current.pause();
    }
  }, [isMuted, view, hasInteracted, showSplash, selectedPack]);

  // --- Auth Setup ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Fetch favorites from Firestore
        let favorites: string[] = [];
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            favorites = userDoc.data().favorites || [];
          } else {
            // Initialize user document
            await setDoc(userDocRef, {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || null,
              photoURL: user.photoURL || null,
              createdAt: serverTimestamp(),
              favorites: []
            });
          }
        } catch (error) {
          console.error("Error fetching/initializing user data:", error);
          handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
        }

        setPlayer({
          id: user.uid,
          name: user.displayName || 'Player',
          icon: 'smile',
          favorites
        });
        
        // Show tutorial if not seen
        if (localStorage.getItem('pokepoke_tutorial_seen') !== 'true') {
          setView('tutorial');
        } else {
          setView('home');
        }
      } else {
        setPlayer(null);
        setView('setup');
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleToggleFavorite = async (packId: string) => {
    if (!player) return;
    
    const currentFavorites = player.favorites || [];
    const isFavorited = currentFavorites.includes(packId);
    const newFavorites = isFavorited
      ? currentFavorites.filter(id => id !== packId)
      : [...currentFavorites, packId];
    
    setPlayer({ ...player, favorites: newFavorites });
    playSound('click');

    // Persist to Firestore
    try {
      await setDoc(doc(db, 'users', player.id), {
        favorites: newFavorites
      }, { merge: true });
    } catch (error) {
      console.error("Error saving favorites:", error);
      handleFirestoreError(error, OperationType.WRITE, `users/${player.id}`);
    }
  };

  useEffect(() => {
    if (view !== 'training' && view !== 'battle') return;
    if (answerStatus !== 'idle') return;
    if (selectedPack?.type === 'listening' && listeningCountdown !== null) return;

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
  }, [view, currentIndex, answerStatus, selectedPack, listeningCountdown]);

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

    // Wake up the backend if it's on Render (free tier sleeps)
    if (socketUrl.includes('onrender.com')) {
      fetch(`${socketUrl}/api/health`).catch(() => {});
    }

    console.log('Initializing socket connection to:', socketUrl);
    
    socketRef.current = io(socketUrl, {
      // Use polling first, then upgrade to websocket. 
      // This is more reliable in environments with proxies like AI Studio.
      transports: ['polling', 'websocket'],
      withCredentials: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 60000 // 60 seconds timeout
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
      if (err.message === 'xhr poll error' || err.message === 'timeout') {
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
  }, [player]);

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
      if (score > (quizQuestions.length / 2)) confetti();
    }
  };

  const handleAnswer = async (choice: string | null) => {
    if (answerStatus !== 'idle') return;
    
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
      setTimeout(handleNextQuestion, 2000);
    }
  };

  const handleSetup = (name: string, iconId: string) => {
    const newPlayer: Player = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      icon: iconId
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setPlayer(null);
      setView('setup');
    } catch (error) {
      console.error('Logout error:', error);
    }
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

  // --- Views ---
  if (showSplash) return <SplashView progress={loadProgress} />;
  
  if (!isAuthReady) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Checking Auth State...</p>
    </div>
  );

  if (view === 'setup') return (
    <SetupView 
      onComplete={handleSetup} 
      isMuted={isMuted} 
      onToggleMute={() => setIsMuted(!isMuted)}
      isOnline={isOnline}
      connectionError={connectionError}
      onReconnect={reconnectSocket}
    />
  );
  if (view === 'tutorial') return (
    <TutorialView 
      onSkip={() => {
        localStorage.setItem('pokepoke_tutorial_seen', 'true');
        setHasSeenTutorial(true);
        setView('home');
      }} 
    />
  );
  
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative">
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
      <header className="p-4 flex justify-between items-center bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
            {player && React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: "w-6 h-6 text-indigo-600" })}
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-900 tracking-tighter uppercase leading-none">{player?.name}</h2>
            <div className="flex items-center gap-1 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                {isOnline ? 'Online' : 'Offline'}
              </p>
            </div>
            {!isOnline && (
              <p className="text-[6px] text-red-400 font-bold uppercase tracking-tighter mt-0.5">
                Server Connection Failed
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setView('tutorial')}
            className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
            title="How to Use"
          >
            <Info className="w-5 h-5" />
          </button>
          {(view === 'training' || view === 'battle') && (
            <button 
              onClick={handleQuit}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg font-black text-xs hover:bg-red-100 transition-all border border-red-100"
            >
              <XCircle className="w-4 h-4" />
              <span>中断</span>
            </button>
          )}
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-slate-400" /> : <Volume2 className="w-5 h-5 text-indigo-600" />}
          </button>
          <div className="flex flex-col items-end">
             <div className="flex gap-0.5">
               {[1,2,3,4].map(i => (
                 <div key={i} className={`w-1 h-3 rounded-full ${isOnline && i <= 3 ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>
               ))}
             </div>
             <p className="text-[8px] font-black text-slate-400 mt-0.5">PING: 24MS</p>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5 text-slate-400" />
          </button>
        </div>
      </header>

      <main ref={mainRef} className="flex-1 overflow-y-auto pokepoke-scroll">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <HomeView 
              player={player}
              onSelectPack={(pack) => { 
                playSound('click');
                setSelectedPack(pack); 
                setView('training_config'); 
              }} 
              onSuggestion={() => {
                playSound('click');
                setView('suggestion');
              }}
              onFriendMatch={() => {
                playSound('click');
                setView('friend_match_setup');
              }}
              onToggleFavorite={handleToggleFavorite}
            />
          )}
          {view === 'suggestion' && (
            <SuggestionFormView 
              onSubmit={handleSuggestionSubmit}
              onBack={() => setView('home')}
            />
          )}
          {view === 'training_config' && (
            <TrainingConfigView 
              pack={selectedPack!} 
              onStartTraining={startTraining}
              onStartBattle={(count) => {
                setQuestionCount(count);
                setView('matching');
                socketRef.current?.emit('join_match', { packId: selectedPack?.id, questionCount: count, player });
              }}
              onBack={() => setView('home')}
            />
          )}
          {view === 'matching' && (
            <MatchingView 
              onCancel={() => {
                socketRef.current?.emit('cancel_match');
                setView('home');
              }} 
              matchState={matchState} 
            />
          )}
          {view === 'friend_match_setup' && (
            <FriendMatchSetupView 
              pack={selectedPack}
              onBack={() => setView('home')}
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
              onCancel={() => setView('home')}
              matchState={matchState}
              player={player}
              onStart={() => socketRef.current?.emit('start_friend_match', { roomId: matchState?.roomId })}
            />
          )}
          {view === 'friend_match_join' && (
            <FriendMatchJoinView 
              onBack={() => setView('home')}
              onJoin={(code) => {
                socketRef.current?.emit('join_friend_match', { inviteCode: code, player });
              }}
            />
          )}
          {view === 'battle_start' && (
            <BattleStartView 
              player={player!} 
              opponent={matchState?.players?.find(p => p.id !== player?.id)!} 
              countdown={countdown}
              onReady={() => socketRef.current?.emit('player_ready', { roomId: matchState?.roomId })}
              matchState={matchState}
            />
          )}
          {(view === 'training' || view === 'battle') && (
            <QuizView 
              mode={view}
              isLoading={isLoading}
              currentIndex={currentIndex}
              total={quizQuestions.length}
              question={quizQuestions[currentIndex]}
              timeLeft={timeLeft}
              answerStatus={answerStatus}
              selectedChoice={selectedChoice}
              onAnswer={handleAnswer}
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
            />
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub-components ---

function SplashView({ progress }: { progress: number }) {
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        className="text-center"
      >
        <h1 className="text-6xl md:text-8xl font-black text-slate-900 tracking-tighter italic mb-12">
          激アツ英単語
        </h1>
        <div className="w-64 md:w-96 h-2 bg-slate-100 rounded-full overflow-hidden relative">
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

function BattleStartView({ player, opponent, countdown, onReady, matchState }: { player: Player, opponent: Player, countdown: number | null, onReady: () => void, matchState: MatchRoomState | null }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (matchState?.phase === 'matched') {
      setIsReady(false);
    }
  }, [matchState?.phase]);

  const opponentState = matchState?.players?.find(p => p.id === opponent.id);
  const isOpponentReady = !!opponentState?.isReady;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-[80vh] flex flex-col items-center justify-center p-6 bg-indigo-900 overflow-hidden"
    >
      <AnimatePresence mode="wait">
        {matchState?.phase === 'loading' ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center"
          >
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
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
                <div className="bg-white/10 backdrop-blur-md px-6 py-4 rounded-3xl border border-white/20 inline-flex flex-col items-center gap-1">
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
                <div className="w-28 h-28 rounded-[2rem] bg-white flex items-center justify-center shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
                <div className="w-28 h-28 rounded-[2rem] bg-white flex items-center justify-center shadow-2xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
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
  mode, isLoading, currentIndex, total, question, timeLeft, 
  answerStatus, selectedChoice, onAnswer, opponent, opponentAnswer,
  player, score, opponentScore, matchState, listeningCountdown, selectedPack,
  isAutoSpeechEnabled, onToggleAutoSpeech, playAudio
}: { 
  mode: 'training' | 'battle', isLoading: boolean, currentIndex: number, total: number, 
  question: Word, timeLeft: number, answerStatus: string, 
  selectedChoice: string | null, onAnswer: (choice: string | null) => void,
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
      <div className="min-h-[80vh] flex flex-col items-center justify-center">
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

  const isAnswerLocked = matchState?.phase === 'answering';
  const myState = matchState?.players?.find(p => p.id === player?.id);
  const isMyTurn = mode === 'training' || (matchState?.phase === 'question' && !myState?.answered);

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
            <div className="w-14 h-14 rounded-2xl border-4 border-indigo-100 flex items-center justify-center font-black text-2xl text-indigo-600 bg-white shadow-sm">
              {timeLeft}
            </div>
            <svg className="absolute -inset-1 w-16 h-16 -rotate-90 pointer-events-none">
              <circle
                cx="32" cy="32" r="30"
                fill="none" stroke="currentColor" strokeWidth="4"
                className="text-slate-100"
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
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-600' 
                  : 'bg-slate-50 border-slate-200 text-slate-400'
              }`}
            >
              {isAutoSpeechEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span className="text-[10px] font-black uppercase tracking-tighter">
                音声{isAutoSpeechEnabled ? 'オン' : 'オフ'}
              </span>
            </button>
            <p className="text-2xl font-black text-slate-900 tracking-tighter">
              {currentIndex + 1} <span className="text-slate-300 mx-1">/</span> {total}
            </p>
          </div>
        </div>
      </div>

      {mode === 'battle' && opponent && (
        <div className="flex flex-col gap-2 mb-4">
          <div className="flex justify-between items-center px-2">
            <div className="flex items-center gap-2">
               <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center border border-indigo-200">
                 {player && React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: "w-5 h-5 text-indigo-600" })}
               </div>
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-0.5">YOU</p>
                 <p className="text-lg font-black text-slate-900 leading-none">{score}</p>
               </div>
            </div>
            
            <div className="flex flex-col items-center">
              <div className="text-[10px] font-black text-slate-300 uppercase italic">VS</div>
              <div className="w-1 h-4 bg-slate-100 rounded-full"></div>
            </div>

            <div className="flex items-center gap-2 text-right">
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase leading-none mb-0.5">{opponent.name}</p>
                 <p className="text-lg font-black text-slate-900 leading-none">{opponentScore}</p>
               </div>
               <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center border border-red-200">
                 {React.createElement(PLAYER_ICONS.find(i => i.id === opponent.icon)?.icon || Smile, { className: "w-5 h-5 text-red-600" })}
               </div>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(score / total) * 100}%` }}
              className="h-full bg-indigo-500"
            />
            <div className="flex-1"></div>
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${(opponentScore / total) * 100}%` }}
              className="h-full bg-red-500"
            />
          </div>

          {/* Opponent Status Indicator */}
          <div className="flex justify-end">
            {matchState?.phase === 'answering' ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-emerald-600 uppercase">
                  {matchState?.players?.find(p => p.lastAnswer?.questionIndex === currentIndex)?.name} Answered!
                </span>
              </div>
            ) : opponentAnswer && opponentAnswer.questionIndex === currentIndex ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 rounded-full border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                <span className="text-[8px] font-black text-emerald-600 uppercase">Opponent Answered</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 rounded-full border border-slate-100">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                <span className="text-[8px] font-black text-slate-400 uppercase">Opponent Thinking...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <motion.div 
        key={currentIndex}
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-12 shadow-2xl border border-slate-100 mb-4 md:mb-8 text-center relative overflow-hidden card-pack-shadow flex items-center justify-center min-h-[140px] md:min-h-[200px]"
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
                className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center border-4 border-indigo-100"
              >
                <Volume2 className="w-10 h-10 text-indigo-600" />
              </motion.div>
              <p className="text-2xl font-black text-indigo-600 uppercase tracking-widest italic animate-pulse">Listen!</p>
            </div>
          ) : (
            <>
              <h3 className={`${getFontSize(question.word)} font-black text-slate-900 mb-4 tracking-tight break-words`}>
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
              transition={{ duration: 0.15 }}
              className="fixed inset-0 flex items-center justify-center bg-white/95 backdrop-blur-xl z-[100]"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", damping: 20, stiffness: 300 }}
                className="flex flex-col items-center w-full px-6"
              >
                {matchState?.phase === 'result' ? (
                  <div className="space-y-6 w-full max-w-md">
                    <h4 className="text-2xl font-black text-slate-900 uppercase tracking-tighter mb-4">Round Results</h4>
                    <div className="space-y-3">
                      {matchState.players.map(p => (
                        <div key={p.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${p.lastAnswer?.isCorrect ? 'bg-emerald-100' : 'bg-red-100'}`}>
                              {p.lastAnswer?.isCorrect ? <CheckCircle2 className="w-6 h-6 text-emerald-600" /> : <XCircle className="w-6 h-6 text-red-600" />}
                            </div>
                            <div className="text-left">
                              <p className="text-xs font-black text-slate-400 uppercase leading-none mb-1">{p.name}</p>
                              <p className="text-lg font-black text-slate-900 leading-none truncate max-w-[150px]">{p.lastAnswer?.choice || 'No Answer'}</p>
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
                    <p className="mt-4 text-xl font-bold text-slate-500 bg-slate-100 px-6 py-2 rounded-full inline-block">Answer: {question.meaning}</p>
                    {isListening && question.explanation && (
                      <div className="mt-4 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-left">
                        <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                        <p className="text-sm font-bold text-indigo-900 leading-relaxed">{question.explanation}</p>
                      </div>
                    )}
                  </div>
                ) : matchState?.phase === 'answering' ? (
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center mb-6">
                      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <p className="text-3xl font-black text-indigo-600 tracking-tighter uppercase italic">Someone Answered!</p>
                    <p className="mt-2 text-slate-400 font-bold uppercase tracking-widest text-xs">Waiting for server...</p>
                  </div>
                ) : answerStatus === 'correct' ? (
                  <>
                    <motion.div 
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ duration: 0.2 }}
                      className="w-40 h-40 rounded-full bg-emerald-100 flex items-center justify-center mb-6 shadow-2xl shadow-emerald-200"
                    >
                      <CheckCircle2 className="w-24 h-24 text-emerald-500" />
                    </motion.div>
                    <p className="text-6xl font-black text-emerald-600 tracking-tighter drop-shadow-sm">
                      CORRECT!
                    </p>
                    {isListening && (
                      <div className="w-full max-w-md mt-8 space-y-4">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Script</p>
                          <p className="text-lg font-black text-slate-900 leading-tight">{question.word}</p>
                        </div>
                        {question.explanation && (
                          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-left">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                            <p className="text-sm font-bold text-indigo-900 leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : answerStatus === 'opponent_won' ? (
                  <>
                    <div className="w-40 h-40 rounded-full bg-red-100 flex items-center justify-center mb-6 shadow-2xl shadow-red-200">
                      <XCircle className="w-24 h-24 text-red-500" />
                    </div>
                    <p className="text-3xl font-black text-red-600 tracking-tighter uppercase">{opponent?.name} GOT IT!</p>
                    <p className="mt-4 text-xl font-bold text-slate-500 bg-slate-100 px-6 py-2 rounded-full">Answer: {question.meaning}</p>
                    {isListening && (
                      <div className="w-full max-w-md mt-6 space-y-4">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Script</p>
                          <p className="text-lg font-black text-slate-900 leading-tight">{question.word}</p>
                        </div>
                        {question.explanation && (
                          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-left">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                            <p className="text-sm font-bold text-indigo-900 leading-relaxed">{question.explanation}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <motion.div 
                      animate={{ x: [-5, 5, -5, 5, 0] }}
                      transition={{ duration: 0.2 }}
                      className="w-40 h-40 rounded-full bg-red-100 flex items-center justify-center mb-6 shadow-2xl shadow-red-200"
                    >
                      <XCircle className="w-24 h-24 text-red-500" />
                    </motion.div>
                    <p className="text-6xl font-black text-red-600 tracking-tighter drop-shadow-sm">MISS!</p>
                    <p className="mt-4 text-xl font-bold text-slate-500 bg-slate-100 px-6 py-2 rounded-full">Correct: {question.meaning}</p>
                    {isListening && (
                      <div className="w-full max-w-md mt-6 space-y-4">
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-left">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Script</p>
                          <p className="text-lg font-black text-slate-900 leading-tight">{question.word}</p>
                        </div>
                        {question.explanation && (
                          <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 text-left">
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Explanation</p>
                            <p className="text-sm font-bold text-indigo-900 leading-relaxed">{question.explanation}</p>
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

      <div className="grid grid-cols-1 gap-4">
        {question.choices.map((choice, idx) => {
          const isSelected = selectedChoice === choice;
          const isCorrect = choice === question.meaning;
          const isOpponentSelected = opponentAnswer?.playerId !== undefined && opponentAnswer.isCorrect && choice === question.meaning;
          
          let bgColor = 'bg-white';
          let borderColor = 'border-slate-200';
          let textColor = 'text-slate-800';

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
              bgColor = 'bg-slate-50';
              textColor = 'text-slate-300';
              borderColor = 'border-slate-100';
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
    </div>
  );
}

function HomeView({ player, onSelectPack, onSuggestion, onFriendMatch, onToggleFavorite }: { 
  player: Player | null, 
  onSelectPack: (pack: Pack) => void, 
  onSuggestion: () => void,
  onFriendMatch: () => void,
  onToggleFavorite: (packId: string) => void
}) {
  const favorites = player?.favorites || [];
  const favoritePacks = PACKS.filter(p => favorites.includes(p.id));

  const baseCategories = Array.from(new Set(PACKS.map(p => p.category))).sort((a, b) => {
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

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category) 
        : [...prev, category]
    );
  };

  return (
    <div className="p-6 pb-24">
      <div className="mb-8 text-center">
        <h1 className="text-xs font-black text-slate-400 uppercase tracking-widest">SELECT A PACK TO START</h1>
      </div>

      <div className="space-y-6">
        {categories.map(category => {
          const isExpanded = expandedCategories.includes(category);
          const categoryPacks = category === 'お気に入り' 
            ? favoritePacks 
            : PACKS.filter(p => p.category === category);

          return (
            <section key={category} className="bg-white rounded-[2rem] border border-slate-100 overflow-hidden shadow-sm">
              <button 
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-1 w-8 ${category === 'お気に入り' ? 'bg-amber-400' : 'bg-indigo-600'} rounded-full`}></div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter">{category}</h2>
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
          <div className="w-full py-20 flex flex-col items-center justify-center bg-white rounded-[2.5rem] border-2 border-dashed border-slate-200">
            <Rocket className="w-12 h-12 text-slate-300 mb-4" />
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No packs available</p>
          </div>
        )}
      </div>

      <div className="mt-12">
        <h3 className="text-xl font-black text-slate-900 mb-4 tracking-tighter uppercase">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-4">
           <button 
             onClick={() => { playSound('click'); onFriendMatch(); }}
             className="p-6 bg-white rounded-3xl border-2 border-slate-100 flex flex-col items-center gap-3 shadow-sm hover:border-indigo-500 transition-all group"
           >
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 transition-colors">
                 <QrCode className="w-6 h-6 text-indigo-600 group-hover:text-white" />
              </div>
              <span className="font-black text-slate-700 text-sm">Friend Match</span>
           </button>
           <button 
              onClick={onSuggestion}
              className="p-6 bg-white rounded-3xl border-2 border-slate-100 flex flex-col items-center gap-3 shadow-sm hover:border-indigo-500 transition-all group"
            >
              <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center group-hover:bg-emerald-600 transition-colors">
                 <MessageSquare className="w-6 h-6 text-emerald-600 group-hover:text-white" />
              </div>
              <span className="font-black text-slate-700 text-sm">提案・報告</span>
           </button>
        </div>
      </div>
    </div>
  );
}

function SuggestionFormView({ onSubmit, onBack }: { onSubmit: (type: string, content: string) => void, onBack: () => void }) {
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
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-900 transition-colors">
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-100">
        <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tighter uppercase">提案・報告</h2>
        <p className="text-slate-400 font-bold text-[10px] mb-8 uppercase tracking-widest">Contact: nishikidootama@gmail.com</p>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">種別</label>
            <div className="flex flex-wrap gap-2">
              <button 
                onClick={() => { setType('suggestion'); setError(null); }}
                className={`flex-1 min-w-[100px] py-3 rounded-xl font-bold transition-all ${type === 'suggestion' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-500'}`}
              >
                提案
              </button>
              <button 
                onClick={() => { setType('report'); setError(null); }}
                className={`flex-1 min-w-[100px] py-3 rounded-xl font-bold transition-all ${type === 'report' ? 'bg-red-600 text-white' : 'bg-slate-50 text-slate-500'}`}
              >
                報告
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">内容</label>
            <textarea 
              value={content}
              onChange={(e) => { setContent(e.target.value); setError(null); }}
              placeholder="こちらに内容を入力してください"
              rows={5}
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none transition-all font-bold resize-none"
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

function TrainingConfigView({ pack, onStartTraining, onStartBattle, onBack }: { 
  pack: Pack, 
  onStartTraining: (count: number) => void,
  onStartBattle: (count: number) => void,
  onBack: () => void 
}) {
  const [selectedCount, setSelectedCount] = useState(50);

  return (
    <motion.div 
      initial={{ x: 50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="p-6 max-w-2xl mx-auto w-full"
    >
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-900 transition-colors">
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
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Select Mode</h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Choose your challenge</span>
          </div>
          
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-white rounded-3xl p-6 border-2 border-slate-100 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                  <Play className="w-5 h-5 text-indigo-600 fill-current" />
                </div>
                <span className="font-black text-slate-900 uppercase tracking-tight">トレーニングモード</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[10, 30, 50, 100, 150].map(count => (
                  <button
                    key={count}
                    onClick={() => {
                      playSound('click');
                      onStartTraining(count);
                    }}
                    className="py-4 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-slate-700 hover:border-indigo-500 hover:bg-white hover:text-indigo-600 transition-all"
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-indigo-900 rounded-3xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <span className="font-black text-white uppercase tracking-tight">リアルタイムバトル</span>
              </div>
              <div className="flex flex-wrap gap-3 mb-6">
                {[10, 30, 50, 100].map(count => (
                  <button
                    key={count}
                    onClick={() => setSelectedCount(count)}
                    className={`flex-1 min-w-[100px] py-4 rounded-2xl font-black transition-all ${
                      selectedCount === count ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white/50 hover:bg-white/20'
                    }`}
                  >
                    {count} Questions
                  </button>
                ))}
              </div>
              <button
                onClick={() => onStartBattle(selectedCount)}
                className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-xl flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl"
              >
                FIND MATCH <ChevronRight className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Word List Display */}
          <div className="mt-8 bg-white rounded-3xl p-6 border-2 border-slate-100 shadow-sm">
            <h3 className="font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-indigo-600" />
              収録内容一覧（{pack.words.length}問）
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {pack.words.map((w, i) => (
                <div key={i} className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100 truncate">
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

function MatchingView({ onCancel, matchState }: { onCancel: () => void, matchState?: MatchRoomState | null }) {
  if (matchState?.players?.length === 2) {
    return (
      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center"
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
                <div className="w-20 h-20 rounded-2xl bg-white shadow-xl flex items-center justify-center border-2 border-slate-100">
                  <div className="text-4xl">{p.icon}</div>
                </div>
                <p className="font-black text-slate-900 uppercase text-xs">{p.name}</p>
              </div>
              {i === 0 && <div className="text-2xl font-black text-slate-300 italic">VS</div>}
            </React.Fragment>
          ))}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6">
      <div className="relative mb-8">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-32 h-32 bg-indigo-100 rounded-full flex items-center justify-center"
        >
          <Users className="w-16 h-16 text-indigo-600" />
        </motion.div>
      </div>
      <h2 className="text-2xl font-black text-slate-900 mb-2">matching..</h2>
      <p className="text-slate-500 mb-8">対戦相手を探しています</p>
      
      <button 
        onClick={onCancel}
        className="px-8 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
      >
        キャンセル
      </button>
    </div>
  );
}

function FriendMatchSetupView({ pack, onBack, onCreateMatch, onJoinMatch, onSelectPack }: { 
  pack: Pack | null, 
  onBack: () => void,
  onCreateMatch: (count: number) => void,
  onJoinMatch: () => void,
  onSelectPack: (pack: Pack) => void
}) {
  const [isSelectingPack, setIsSelectingPack] = useState(!pack);

  if (isSelectingPack) {
    return (
      <motion.div 
        initial={{ x: 50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="p-6 max-w-2xl mx-auto w-full"
      >
        <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-900 transition-colors">
          <ChevronLeft className="w-5 h-5" /> Back
        </button>
        <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter uppercase">Select Pack for Friend Match</h2>
        <div className="grid grid-cols-1 gap-4">
          {PACKS.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelectPack(p); setIsSelectingPack(false); }}
              className={`p-6 rounded-3xl border-2 flex items-center justify-between group transition-all ${pack?.id === p.id ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 bg-white hover:border-indigo-300'}`}
            >
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl ${p.color} flex items-center justify-center text-white font-black`}>
                  {p.name.charAt(0)}
                </div>
                <div className="text-left">
                  <h3 className="font-black text-slate-900 uppercase tracking-tight">{p.name}</h3>
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
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-900 transition-colors">
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter uppercase">Friend Match</h2>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                <QrCode className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight">Create Match</h3>
                <p className="text-xs text-slate-400 font-bold">QRコードを表示して友達を招待</p>
              </div>
            </div>
            <button 
              onClick={() => setIsSelectingPack(true)}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200 transition-all"
            >
              CHANGE PACK
            </button>
          </div>

          <div className="mb-6 p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center gap-3">
             <div className={`w-10 h-10 rounded-xl ${pack.color} flex items-center justify-center text-white font-black text-xs`}>
                {pack.name.charAt(0)}
             </div>
             <div>
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Selected Pack</p>
                <h4 className="font-black text-indigo-900 uppercase text-sm">{pack.name}</h4>
             </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3 mb-6">
            {[10, 30, 50, 100].map(count => (
              <button
                key={count}
                onClick={() => onCreateMatch(count)}
                className="py-4 bg-slate-50 border-2 border-transparent rounded-2xl font-black text-slate-700 hover:border-indigo-500 hover:bg-white hover:text-indigo-600 transition-all"
              >
                {count} Questions
              </button>
            ))}
          </div>
        </div>

        <button 
          onClick={onJoinMatch}
          className="bg-indigo-900 text-white rounded-[2.5rem] p-8 shadow-xl flex items-center justify-between group active:scale-95 transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:bg-white/20 transition-colors">
              <Scan className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <h3 className="font-black uppercase tracking-tight">Join Match</h3>
              <p className="text-xs text-white/50 font-bold">友達のQRコードを読み取る</p>
            </div>
          </div>
          <ChevronRight className="w-8 h-8 text-white/30 group-hover:text-white transition-colors" />
        </button>
      </div>
    </motion.div>
  );
}

function FriendMatchWaitingView({ inviteCode, onCancel, matchState, player, onStart }: { 
  inviteCode: string, 
  onCancel: () => void,
  matchState?: MatchRoomState | null,
  player?: Player | null,
  onStart?: () => void
}) {
  const joinUrl = `${window.location.origin}/join/${inviteCode}`;
  const isHost = matchState?.hostId === player?.id;
  const canStart = (matchState?.players?.length || 0) >= 2;

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-slate-100 mb-8 max-w-md w-full">
        <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Waiting Room</h2>
        <p className="text-slate-400 font-bold text-sm mb-8">友達にこのQRコードを見せてください</p>
        
        <div className="bg-white p-4 rounded-3xl border-4 border-slate-900 inline-block mb-8">
          <QRCodeSVG value={joinUrl} size={200} />
        </div>

        <div className="bg-slate-50 p-6 rounded-3xl mb-8 relative group border-2 border-slate-100">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invite Code</p>
          <p className="text-5xl font-black text-slate-900 tracking-[0.2em] leading-none">{inviteCode}</p>
        </div>

        <div className="space-y-3 mb-8">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-left px-2">Players ({matchState?.players?.length || 0}/4)</p>
          {matchState?.players?.map(p => (
            <div key={p.id} className="flex items-center gap-3 bg-white p-3 rounded-2xl border-2 border-slate-100 shadow-sm">
              <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-xl">
                {p.icon}
              </div>
              <div className="flex-1 text-left">
                <p className="font-black text-slate-900">{p.name}</p>
                {p.id === matchState?.hostId && <p className="text-[10px] font-black text-indigo-500 uppercase">Host</p>}
              </div>
              {p.id === player?.id && <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>}
            </div>
          ))}
          {[...Array(4 - (matchState?.players?.length || 0))].map((_, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-50/50 p-3 rounded-2xl border-2 border-dashed border-slate-200">
              <div className="w-10 h-10 rounded-xl border-2 border-dashed border-slate-200"></div>
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
            className="w-full py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}

function FriendMatchJoinView({ onBack, onJoin }: { onBack: () => void, onJoin: (code: string) => void }) {
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
      <button onClick={onBack} className="mb-8 flex items-center gap-2 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-900 transition-colors">
        <ChevronLeft className="w-5 h-5" /> Back
      </button>

      <h2 className="text-3xl font-black text-slate-900 mb-8 tracking-tighter uppercase">Join Match</h2>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border-2 border-red-100 rounded-2xl text-red-600 font-bold text-sm">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100">
          <label className="block text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Enter Invite Code</label>
          <div className="flex gap-3">
            <input 
              type="text" 
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6-DIGIT CODE"
              maxLength={6}
              className="flex-1 px-6 py-4 rounded-2xl border-2 border-slate-100 focus:border-indigo-500 outline-none transition-all font-black text-2xl tracking-widest uppercase"
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
          <div className="flex-grow border-t border-slate-100"></div>
          <span className="flex-shrink mx-4 text-slate-300 text-xs font-black uppercase tracking-widest">OR</span>
          <div className="flex-grow border-t border-slate-100"></div>
        </div>

        <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-xl text-center">
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
function ResultView({ mode, score, wrongCount, total, timeTaken, opponentScore, onRetry, onHome, isRematchRequested, onRematch, matchState, player, answerHistory }: { 
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
  answerHistory: { word: string, meaning: string, status: 'correct' | 'wrong' | 'lost' }[]
}) {
  const isWin = mode === 'battle' ? (opponentScore !== undefined && score > opponentScore) : true;
  const isDraw = mode === 'battle' && opponentScore !== undefined && score === opponentScore;
  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;

  const opponent = matchState?.players?.find(p => p.id !== player?.id);
  const [isCopied, setIsCopied] = useState(false);

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
      <div className="bg-white rounded-[3rem] p-8 md:p-12 shadow-2xl border border-slate-100 text-center relative overflow-hidden">
        {mode === 'battle' ? (
          <>
            {/* Top Section: Scores */}
            <div className="flex justify-between items-center mb-12 px-4">
              <div className="flex flex-col items-center gap-2">
                <div className="text-5xl font-black text-indigo-600">{score}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Your Score</div>
              </div>
              <div className="h-12 w-px bg-slate-100"></div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-5xl font-black text-red-600">{opponentScore ?? 0}</div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Opponent</div>
              </div>
            </div>

            {/* Middle Section: Icons and WIN/LOSE */}
            <div className="flex items-center justify-center gap-8 md:gap-16 mb-8">
              {/* Player */}
              <div className="flex flex-col items-center gap-4">
                <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-xl relative ${isWin && !isDraw ? 'bg-emerald-50 ring-4 ring-emerald-500' : 'bg-slate-50'}`}>
                  {player && React.createElement(PLAYER_ICONS.find(i => i.id === player.icon)?.icon || Smile, { className: `w-12 h-12 ${isWin && !isDraw ? 'text-emerald-600' : 'text-slate-400'}` })}
                  {isWin && !isDraw && <Crown className="absolute -top-4 -right-4 w-10 h-10 text-yellow-500 drop-shadow-lg rotate-12" />}
                </div>
                <div className={`font-black text-2xl italic uppercase tracking-tighter ${isWin && !isDraw ? 'text-emerald-600' : isDraw ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {isDraw ? 'DRAW' : isWin ? 'WIN' : 'LOSE'}
                </div>
              </div>

              <div className="text-4xl font-black text-slate-200 italic">VS</div>

              {/* Opponent */}
              <div className="flex flex-col items-center gap-4">
                <div className={`w-24 h-24 rounded-[2rem] flex items-center justify-center shadow-xl relative ${!isWin && !isDraw ? 'bg-emerald-50 ring-4 ring-emerald-500' : 'bg-slate-50'}`}>
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
              <div className="mb-12 bg-slate-50 p-6 rounded-3xl border-2 border-slate-100 inline-block">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Invite Code</p>
                <p className="text-4xl font-black text-slate-900 tracking-[0.2em] leading-none">{matchState.inviteCode}</p>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-6 py-2 bg-indigo-50 text-indigo-600 rounded-full font-black uppercase tracking-widest text-sm mb-4">
                <Trophy className="w-5 h-5" /> Training Complete
              </div>
              <h2 className="text-6xl font-black text-slate-900 tracking-tighter mb-2">
                {score}<span className="text-2xl text-slate-300"> / {total}</span>
              </h2>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Final Score</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-12">
              <div className="bg-slate-50 p-4 rounded-3xl">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Accuracy</p>
                <p className="text-xl font-black text-slate-900">{accuracy}%</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-3xl">
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
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-slate-800 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Play className="w-6 h-6" /> {mode === 'battle' ? 'NEW MATCH' : 'TRY AGAIN'}
          </button>
          <button
            onClick={() => { playSound('click'); onHome(); }}
            className="w-full py-5 bg-white text-slate-600 rounded-2xl font-black text-xl border-2 border-slate-100 hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Home className="w-6 h-6" /> EXIT TO HOME
          </button>
          
          <button
            onClick={() => { playSound('click'); handleShare(); }}
            className={`w-full py-5 rounded-2xl font-black text-xl transition-all active:scale-95 flex items-center justify-center gap-2 border-2 ${
              isCopied 
              ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
              : 'bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100'
            }`}
          >
            {isCopied ? <Check className="w-6 h-6" /> : <Share2 className="w-6 h-6" />}
            {isCopied ? 'COPIED TO CLIPBOARD!' : 'SHARE WRONG QUESTIONS'}
          </button>
        </div>

        {/* Answer History List */}
        {answerHistory.length > 0 && (
          <div className="mt-12 pt-12 border-t border-slate-100">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Review Questions</h3>
            <div className="space-y-3 pr-2">
              {answerHistory.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="flex flex-col items-start text-left">
                    <span className="font-black text-slate-700 tracking-tight">{item.word}</span>
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

function TutorialView({ onSkip }: { onSkip: () => void }) {
  const [step, setStep] = useState(0);
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
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <motion.div 
        key={step}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl border border-slate-100 text-center relative overflow-hidden"
      >
        <div className={`w-24 h-24 ${current.color} rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-lg`}>
          <current.icon className="w-12 h-12 text-white" />
        </div>
        
        <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tighter uppercase">{current.title}</h2>
        <p className="text-slate-500 font-bold leading-relaxed mb-12">{current.desc}</p>

        <div className="flex flex-col gap-4">
          <button 
            onClick={() => {
              if (step < steps.length - 1) setStep(step + 1);
              else onSkip();
            }}
            className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
          >
            {step === steps.length - 1 ? 'スタート！' : '次へ'}
          </button>
          <button 
            onClick={onSkip}
            className="text-slate-400 font-black text-sm uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            チュートリアルをスキップ
          </button>
        </div>

        {/* Progress Dots */}
        <div className="flex justify-center gap-2 mt-8">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`h-2 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-indigo-600' : 'w-2 bg-slate-200'}`} 
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function SetupView({ onComplete, isMuted, onToggleMute, isOnline, connectionError, onReconnect }: { 
  onComplete: (name: string, iconId: string) => void, 
  isMuted: boolean, 
  onToggleMute: () => void,
  isOnline: boolean,
  connectionError: string | null,
  onReconnect: () => void
}) {
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('smile');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        setAuthError('ログイン画面が閉じられました。もう一度お試しください。');
      } else if (error.code === 'auth/cancelled-popup-request') {
        setAuthError('別のログインリクエストが進行中です。');
      } else if (error.code === 'auth/popup-blocked') {
        setAuthError('ポップアップがブロックされました。ブラウザの設定で許可してください。');
      } else {
        setAuthError(`ログインに失敗しました: ${error.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
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

      {/* Mute Button for Setup */}
      <div className="absolute top-6 right-6 z-20">
        <button 
          onClick={onToggleMute}
          className="p-3 bg-white/80 backdrop-blur-sm border border-slate-100 rounded-2xl shadow-sm hover:bg-slate-50 transition-all active:scale-95"
        >
          {isMuted ? <VolumeX className="w-6 h-6 text-slate-400" /> : <Volume2 className="w-6 h-6 text-indigo-600" />}
        </button>
      </div>
      {/* Animated Background - Removed as requested */}
      <div className="absolute inset-0 z-0 bg-slate-50/50"></div>

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-8 md:p-12 w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <motion.div
            initial={{ y: -20 }}
            animate={{ y: 0 }}
            className="inline-block px-4 py-1 bg-orange-100 text-orange-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4"
          >
            Hot & Exciting!
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter leading-none mb-2">激アツ英単語</h1>
          <p className="text-slate-500 font-bold">ログインして始めよう！</p>
        </div>
        
        <div className="space-y-4">
          {authError && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-xs font-bold"
            >
              {authError}
            </motion.div>
          )}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoggingIn}
            className="w-full py-3 bg-white border-2 border-slate-100 rounded-2xl font-black text-base flex items-center justify-center gap-3 hover:bg-slate-50 transition-all active:scale-95 shadow-sm disabled:opacity-50"
          >
            {isLoggingIn ? (
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <LogIn className="w-5 h-5 text-indigo-600" />
            )}
            {isLoggingIn ? 'ログイン中...' : 'Googleでログイン'}
          </button>

          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-slate-100"></div>
            <span className="flex-shrink mx-4 text-slate-300 text-xs font-bold uppercase tracking-widest">OR</span>
            <div className="flex-grow border-t border-slate-100"></div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">ゲストとして名前を入力</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="プレイヤー名を入力"
              className="w-full px-4 py-3 rounded-xl border-2 border-slate-100 focus:border-indigo-500 outline-none transition-all font-bold"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">アイコンを選択</label>
            <div className="flex justify-between gap-2">
              {PLAYER_ICONS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedIcon(item.id)}
                  className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                    selectedIcon === item.id ? 'bg-indigo-100 ring-2 ring-indigo-500 scale-110' : 'bg-slate-50'
                  }`}
                >
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </button>
              ))}
            </div>
          </div>

          <button
            disabled={!name.trim()}
            onClick={() => onComplete(name, selectedIcon)}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50 disabled:shadow-none transition-all active:scale-95"
          >
            ゲストでスタート！
          </button>
        </div>
      </motion.div>
    </div>
  );
}

