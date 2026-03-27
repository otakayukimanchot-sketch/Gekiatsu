export interface Word {
  word: string;
  meaning: string;
  choices: string[];
}

export interface Pack {
  id: string;
  name: string;
  description: string;
  category: string;
  color: string;
  words: Word[];
}

export interface Player {
  id: string;
  name: string;
  icon: string;
}

export interface PlayerState extends Player {
  score: number;
  socketId: string;
  isReady: boolean;
  answered: boolean;
  rematchRequested?: boolean;
  lastAnswer?: {
    choice: string;
    isCorrect: boolean;
    reactionTime: number;
    questionIndex: number;
  };
}

export interface MatchRoomState {
  roomId: string;
  type: 'battle' | 'friend';
  players: PlayerState[];
  packId: string;
  questionCount: number;
  phase: 'matching' | 'matched' | 'loading' | 'waiting_room' | 'countdown' | 'question' | 'answering' | 'result' | 'finished';
  questionIndex: number;
  questionStartTime: number;
  questions: Word[];
  inviteCode?: string;
  countdown?: number;
  firstResponder?: string; // playerId
  hostId?: string;
}
