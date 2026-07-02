import type { Pack } from './types.ts';
import { TRIVIA_WORDS } from './data/trivia.ts';
import { HIGH_LEVEL_TRIVIA_WORDS } from './data/highLevelTrivia.ts';
import { EIKEN1_WORDS } from './data/eiken1.ts';
import { TODAI_KING_WORDS } from './data/todaiKing.ts';
import { TOEIC_KING_WORDS } from './data/toeicKing.ts';
import { ELEMENTS_WORDS } from './data/elements.ts';
import { USAGE_WORDS } from './data/usage.ts';
import { CONFUSING_C_WORDS } from './data/confusingC.ts';
import { CONFUSING_IDIOMS_WORDS } from './data/confusingIdioms.ts';
import { TOEIC_GOLD_WORDS } from './data/toeicGold.ts';
import { TOEIC_OVERLORD_WORDS } from './data/toeicOverlord.ts';
import { TOEIC_LISTENING_WORDS } from './data/listening.ts';
import { TOEIC_LISTENING_KAI_WORDS } from './data/listening_kai.ts';
import { SOCIAL_TRIVIA_WORDS } from './data/socialTrivia.ts';

export const PACKS: Pack[] = [
  // --- TOEIC ---
  {
    id: 'toeic-gold',
    name: 'TOEIC金のやつ',
    description: 'TOEIC頻出の「金のフレーズ」レベルの重要単語をマスター。',
    category: 'TOEIC',
    color: 'bg-gradient-to-br from-yellow-400 to-amber-600',
    words: TOEIC_GOLD_WORDS,
  },
  {
    id: 'toeic-overlord',
    name: 'TOEIC覇王',
    description: 'TOEIC 990点超え、真の英語力を手に入れるための究極単語集。',
    category: 'TOEIC',
    color: 'bg-gradient-to-br from-slate-800 to-black',
    words: TOEIC_OVERLORD_WORDS,
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
    id: 'toeic-listening',
    name: 'TOEICリスニング特訓',
    description: '音声を聞いて瞬時に理解する。先読みと瞬時理解を鍛える。',
    category: 'リスニング',
    color: 'bg-gradient-to-br from-red-500 to-rose-700',
    words: TOEIC_LISTENING_WORDS,
    type: 'listening',
  },
  {
    id: 'toeic-listening-kai',
    name: 'TOEICリスニング改',
    description: 'さらに実践的なリスニング問題で、耳を徹底的に鍛える。',
    category: 'リスニング',
    color: 'bg-gradient-to-br from-purple-500 to-indigo-700',
    words: TOEIC_LISTENING_KAI_WORDS,
    type: 'listening',
  },

  // --- 英語 ---
  {
    id: 'confusing-idioms',
    name: '紛らわしい英熟語',
    description: 'look after/look forなど、意味を間違えやすい英熟語をマスター。',
    category: '英語',
    color: 'bg-gradient-to-br from-teal-500 to-emerald-600',
    words: CONFUSING_IDIOMS_WORDS,
  },
  {
    id: 'confusing-c',
    name: 'Cから始まる紛らわしい単語',
    description: 'complement/complimentなど、Cから始まる紛らわしい単語をマスター。',
    category: '英語',
    color: 'bg-gradient-to-br from-violet-500 to-purple-600',
    words: CONFUSING_C_WORDS,
  },
  {
    id: 'usage',
    name: '語法頻出問題',
    description: '間違いやすい英語の語法を徹底攻略。',
    category: '英語',
    color: 'bg-gradient-to-br from-emerald-400 to-teal-600',
    words: USAGE_WORDS,
  },

  // --- その他 ---
  {
    id: 'todai-king',
    name: '東大王',
    description: '超難問クイズに挑戦！知識の限界を超えろ。',
    category: '雑学',
    color: 'bg-gradient-to-br from-red-600 to-red-800',
    words: TODAI_KING_WORDS,
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
    id: 'social-trivia',
    name: '社会予想問題',
    description: '地理・歴史・公民の重要トピックを網羅した、定期テストや受験対策に最適な社会科予想クイズ。',
    category: '社会',
    color: 'bg-gradient-to-br from-orange-600 to-amber-800',
    words: SOCIAL_TRIVIA_WORDS,
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
];
