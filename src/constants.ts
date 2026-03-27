import type { Pack } from './types.ts';
import { TOEIC_800_WORDS } from './data/toeic800.ts';
import { TOEIC_990_WORDS } from './data/toeic990.ts';
import { TRIVIA_WORDS } from './data/trivia.ts';
import { HIGH_LEVEL_TRIVIA_WORDS } from './data/highLevelTrivia.ts';
import { EIKEN1_WORDS } from './data/eiken1.ts';
import { HISTORY_WORDS } from './data/history.ts';
import { TODAI_KING_WORDS } from './data/todaiKing.ts';
import { TOEIC_BASIC_WORDS } from './data/toeicBasic.ts';
import { TOEIC_KING_WORDS } from './data/toeicKing.ts';
import { HISTORY_BASIC_WORDS } from './data/historyBasic.ts';
import { HISTORY_ADVANCED_WORDS } from './data/historyAdvanced.ts';
import { ELEMENTS_WORDS } from './data/elements.ts';
import { USAGE_WORDS } from './data/usage.ts';
import { EDO_CASTLE_WORDS } from './data/edoCastle.ts';
import { ENGLISH_TRIVIA_WORDS } from './data/englishTrivia.ts';
import { ATTACK25_WORDS } from './data/attack25.ts';

export const PACKS: Pack[] = [
  {
    id: 'todai-king',
    name: '東大王',
    description: '超難問クイズに挑戦！知識の限界を超えろ。',
    category: '雑学',
    color: 'bg-gradient-to-br from-red-600 to-red-800',
    words: TODAI_KING_WORDS,
  },
  {
    id: 'toeic-basic',
    name: 'TOEIC（基本）',
    description: 'TOEIC 600点を目指すための基礎単語集。',
    category: 'TOEIC',
    color: 'bg-gradient-to-br from-blue-400 to-blue-600',
    words: TOEIC_BASIC_WORDS,
  },
  {
    id: 'toeic-king',
    name: 'TOEICの王様',
    description: 'TOEIC 900点以上のハイスコアを目指す精鋭単語。',
    category: 'TOEIC',
    color: 'bg-gradient-to-br from-yellow-500 to-amber-700',
    words: TOEIC_KING_WORDS,
  },
  {
    id: 'history-basic',
    name: '日本史の基礎',
    description: '歴史の流れを掴むための重要用語。',
    category: '歴史',
    color: 'bg-gradient-to-br from-stone-400 to-stone-600',
    words: HISTORY_BASIC_WORDS,
  },
  {
    id: 'history-advanced',
    name: '日本史の発展',
    description: '難関大入試レベルの日本史用語。',
    category: '歴史',
    color: 'bg-gradient-to-br from-stone-700 to-neutral-900',
    words: HISTORY_ADVANCED_WORDS,
  },
  {
    id: 'elements',
    name: '元素記号',
    description: '化学の基本、元素記号をマスターしよう。',
    category: '理科',
    color: 'bg-gradient-to-br from-cyan-400 to-blue-500',
    words: ELEMENTS_WORDS,
  },
  {
    id: 'usage',
    name: '語法頻出問題',
    description: '間違いやすい英語の語法を徹底攻略。',
    category: '英語',
    color: 'bg-gradient-to-br from-emerald-400 to-teal-600',
    words: USAGE_WORDS,
  },
  {
    id: 'edo-castle',
    name: '江戸城再建計画',
    description: '江戸城の歴史と構造に迫るマニアッククイズ。',
    category: '歴史',
    color: 'bg-gradient-to-br from-orange-400 to-red-500',
    words: EDO_CASTLE_WORDS,
  },
  {
    id: 'toeic-800-essential',
    name: 'TOEIC対策（飛躍）',
    description: 'TOEIC 800点を目指すための必須単語集。',
    category: 'TOEIC',
    color: 'bg-gradient-to-br from-blue-500 to-cyan-600',
    words: TOEIC_800_WORDS,
  },
  {
    id: 'toeic-990-essential',
    name: 'TOEIC対策（極）',
    description: 'TOEIC 990点満点を目指す上級者向け単語集。',
    category: 'TOEIC',
    color: 'bg-gradient-to-br from-indigo-600 to-purple-700',
    words: TOEIC_990_WORDS,
  },
  {
    id: 'trivia-300',
    name: '雑学王',
    description: '日常のちょっとした雑学を学ぼう。',
    category: '雑学',
    color: 'bg-gradient-to-br from-amber-500 to-orange-600',
    words: TRIVIA_WORDS,
  },
  {
    id: 'high-level-trivia',
    name: 'ハイレベル雑学王',
    description: '難易度の高い雑学クイズ。知識の限界に挑戦。',
    category: '雑学',
    color: 'bg-gradient-to-br from-red-500 to-rose-600',
    words: HIGH_LEVEL_TRIVIA_WORDS,
  },
  {
    id: 'eiken-1',
    name: '英検一級合格に必須の300語',
    description: '英検一級合格に必要な語彙力を鍛える。',
    category: '英検',
    color: 'bg-gradient-to-br from-emerald-500 to-teal-600',
    words: EIKEN1_WORDS,
  },
  {
    id: 'high-level-history',
    name: 'ハイレベル日本史',
    description: '日本史の重要用語を英語でマスター。',
    category: '歴史',
    color: 'bg-gradient-to-br from-stone-600 to-neutral-700',
    words: HISTORY_WORDS,
  },
  {
    id: 'english-trivia',
    name: '英語の豆知識',
    description: '英語にまつわる面白い雑学や語源を学ぼう。',
    category: '英語',
    color: 'bg-gradient-to-br from-pink-400 to-rose-600',
    words: ENGLISH_TRIVIA_WORDS,
  },
  {
    id: 'attack-25',
    name: 'アタック25',
    description: 'あの人気クイズ番組のような一般常識問題に挑戦！',
    category: '雑学',
    color: 'bg-gradient-to-br from-red-500 to-orange-600',
    words: ATTACK25_WORDS,
  },
];
