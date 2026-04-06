import type { Word } from '../types.ts';

export const TOEIC_PATTERN_WORDS: Word[] = [
  {
    "word": "interesting",
    "meaning": "冠詞＋副詞＋＿＿＋名詞 → 形容詞",
    "choices": ["interesting", "interestingly", "interest", "interested"]
  },
  {
    "word": "tallest",
    "meaning": "冠詞＋＿＿＋名詞 → 最上級の形容詞",
    "choices": ["tallest", "more tall", "most tallest", "tall"]
  },
  {
    "word": "cold",
    "meaning": "無冠詞＋＿＿＋名詞（不可算）→ 形容詞",
    "choices": ["cold", "coldly", "coldness", "cooled"]
  },
  {
    "word": "beautiful",
    "meaning": "such ＋ ＿＿ ＋ a ＋ 名詞",
    "choices": ["beautiful", "beautifully", "beauty", "more beautiful"]
  },
  {
    "word": "lovely",
    "meaning": "How ＋ ＿＿ ＋ a(n) ＋ 名詞",
    "choices": ["lovely", "lovelily", "love", "loveliness"]
  },
  {
    "word": "great",
    "meaning": "知覚動詞（sounds）＋ ＿＿ → 形容詞",
    "choices": ["great", "greatly", "greatness", "greater"]
  },
  {
    "word": "boring",
    "meaning": "find ＋ 目的語 ＋ ＿＿ → 形容詞",
    "choices": ["boring", "boringly", "bored", "bore"]
  },
  {
    "word": "open",
    "meaning": "leave ＋ 目的語 ＋ ＿＿ → 形容詞",
    "choices": ["open", "openly", "opened", "opening"]
  },
  {
    "word": "white",
    "meaning": "paint ＋ 目的語 ＋ ＿＿ → 形容詞",
    "choices": ["white", "whitely", "whiteness", "whiten"]
  },
  {
    "word": "going",
    "meaning": "前置詞（on）＋ ＿＿ → 名詞/動名詞",
    "choices": ["going", "go", "gone", "goer"]
  },
  {
    "word": "private",
    "meaning": "前置詞（in）＋ ＿＿（慣用句的名詞化）",
    "choices": ["private", "privately", "privacy", "privy"]
  },
  {
    "word": "of",
    "meaning": "a(n) ＋ 名詞 ＋ ＿＿ ＋ a(n) ＋ 名詞（強調）",
    "choices": ["of", "for", "with", "from"]
  },
  {
    "word": "better",
    "meaning": "否定語（Nothing）＋ 比較級",
    "choices": ["better", "good", "best", "well"]
  },
  {
    "word": "more",
    "meaning": "the ＋ 比較級（前）",
    "choices": ["more", "much", "most", "many"]
  },
  {
    "word": "better",
    "meaning": "the ＋ 比較級（後）",
    "choices": ["better", "good", "best", "well"]
  },
  {
    "word": "much",
    "meaning": "比較級の強調副詞",
    "choices": ["much", "very", "so", "too"]
  },
  {
    "word": "any other",
    "meaning": "比較級 ＋ than ＋ ＿＿ ＋ 単数名詞",
    "choices": ["any other", "any", "other", "another"]
  },
  {
    "word": "writes",
    "meaning": "無生物主語＋自動詞（受動的意味）",
    "choices": ["writes", "is written", "write", "written"]
  },
  {
    "word": "Had",
    "meaning": "仮定法過去完了 if 省略倒置",
    "choices": ["Had", "If", "Would", "Should"]
  },
  {
    "word": "Were",
    "meaning": "仮定法 if 倒置（were）",
    "choices": ["Were", "Was", "Is", "Are"]
  },
  {
    "word": "that",
    "meaning": "最上級の後ろの関係代名詞",
    "choices": ["that", "which", "who", "whom"]
  },
  {
    "word": "when",
    "meaning": "前置詞＋which の短縮形（年）",
    "choices": ["when", "where", "why", "which"]
  },
  {
    "word": "",
    "meaning": "関係代名詞の目的格省略（空欄可）",
    "choices": ["that", "which", "省略可", "who"]
  },
  {
    "word": "",
    "meaning": "in hospital（入院中）の冠詞",
    "choices": ["無冠詞", "the", "a", "an"]
  },
  {
    "word": "by",
    "meaning": "交通手段（by car）",
    "choices": ["by", "with", "on", "in"]
  },
  {
    "word": "special",
    "meaning": "不定代名詞（something）＋ 形容詞（後置）",
    "choices": ["special", "specially", "specialty", "specialize"]
  },
  {
    "word": "possible",
    "meaning": "最上級＋名詞＋形容詞（後置）",
    "choices": ["possible", "possibly", "possibility", "impossible"]
  },
  {
    "word": "enough",
    "meaning": "形容詞＋enough",
    "choices": ["enough", "sufficient", "sufficiently", "adequate"]
  },
  {
    "word": "have",
    "meaning": "否定語（Never）文頭倒置",
    "choices": ["have", "did", "was", "had"]
  },
  {
    "word": "had",
    "meaning": "No sooner … than 倒置",
    "choices": ["had", "did", "was", "would"]
  },
  {
    "word": "Poor",
    "meaning": "譲歩の倒置（形容詞＋as）",
    "choices": ["Poor", "Poorly", "Poverty", "Poorest"]
  },
  {
    "word": "went",
    "meaning": "It is time ＋ 主語 ＋ 過去形",
    "choices": ["went", "go", "have gone", "would go"]
  },
  {
    "word": "came",
    "meaning": "I would rather ＋ 主語 ＋ 過去形",
    "choices": ["came", "come", "have come", "would come"]
  },
  {
    "word": "were",
    "meaning": "as if ＋ 主語 ＋ 過去形（仮定法）",
    "choices": ["were", "was", "is", "are"]
  },
  {
    "word": "as",
    "meaning": "the same ＋ 名詞 ＋ as",
    "choices": ["as", "that", "which", "than"]
  },
  {
    "word": "so",
    "meaning": "so … that（so ＋ 形容詞）",
    "choices": ["so", "such", "very", "too"]
  },
  {
    "word": "yesterday",
    "meaning": "強調構文 It is … that",
    "choices": ["yesterday", "yesterday's", "on yesterday", "at yesterday"]
  },
  {
    "word": "done",
    "meaning": "with ＋ 名詞 ＋ 過去分詞",
    "choices": ["done", "doing", "do", "to do"]
  },
  {
    "word": "by",
    "meaning": "慣用句（by mistake）",
    "choices": ["by", "with", "in", "on"]
  },
  {
    "word": "President",
    "meaning": "役職＋固有名詞（無冠詞）",
    "choices": ["President", "The President", "A president", "Presidents"]
  },
  {
    "word": "animal",
    "meaning": "kind of ＋ 無冠詞単数名詞",
    "choices": ["animal", "an animal", "animals", "the animal"]
  },
  {
    "word": "",
    "meaning": "抽象名詞＋of＋固有名詞（無冠詞）",
    "choices": ["無冠詞", "The", "A", "An"]
  },
  {
    "word": "the",
    "meaning": "the ＋ 比較級 ＋ of the two",
    "choices": ["the", "a", "an", "無冠詞"]
  },
  {
    "word": "Poor",
    "meaning": "譲歩の倒置（形容詞＋though）",
    "choices": ["Poor", "Poorly", "Poverty", "Poorer"]
  },
  {
    "word": "So",
    "meaning": "so ＋ 形容詞 ＋ 倒置 ＋ that",
    "choices": ["So", "Such", "Very", "Too"]
  },
  {
    "word": "did",
    "meaning": "Not until ＋ 倒置（主節）",
    "choices": ["did", "had", "was", "would"]
  },
  {
    "word": "did",
    "meaning": "Not a single ＋ 名詞 ＋ 倒置",
    "choices": ["did", "had", "was", "would"]
  },
  {
    "word": "Be",
    "meaning": "be＋主語＋A or B（譲歩）",
    "choices": ["Be", "Is", "Are", "Being"]
  },
  {
    "word": "had studied",
    "meaning": "混合仮定法（if節過去完了）",
    "choices": ["had studied", "studied", "would study", "have studied"]
  },
  {
    "word": "Had",
    "meaning": "倒置混合仮定法",
    "choices": ["Had", "If", "Would", "Should"]
  },
  {
    "word": "Without",
    "meaning": "隠れ仮定法（without）",
    "choices": ["Without", "With", "But for", "Except"]
  },
  {
    "word": "go",
    "meaning": "仮定法現在（insist that ＋ 原形）",
    "choices": ["go", "goes", "went", "has gone"]
  },
  {
    "word": "Be",
    "meaning": "仮定法現在の受動態倒置",
    "choices": ["Be", "Is", "Are", "Being"]
  },
  {
    "word": "Weather",
    "meaning": "絶対分詞構文（独立主格）の主語",
    "choices": ["Weather", "If weather", "When weather", "Although weather"]
  },
  {
    "word": "closed",
    "meaning": "with ＋ his eyes ＋ 過去分詞",
    "choices": ["closed", "closing", "close", "to close"]
  },
  {
    "word": "stolen",
    "meaning": "have ＋ 目的語 ＋ 過去分詞（被害）",
    "choices": ["stolen", "steal", "stealing", "to steal"]
  },
  {
    "word": "as",
    "meaning": "three times as ＋ 形容詞 ＋ as",
    "choices": ["as", "than", "like", "so"]
  },
  {
    "word": "any other",
    "meaning": "比較級 ＋ than ＋ any other ＋ 単数名詞",
    "choices": ["any other", "any", "other", "another"]
  },
  {
    "word": "Less",
    "meaning": "劣勢比較の倒置（Less … than）",
    "choices": ["Less", "More", "Most", "Least"]
  },
  {
    "word": "the",
    "meaning": "the ＋ 比較級 ＋ reason",
    "choices": ["the", "a", "an", "無冠詞"]
  },
  {
    "word": "which",
    "meaning": "非制限whichで前文全体を受ける",
    "choices": ["which", "that", "what", "it"]
  },
  {
    "word": "which",
    "meaning": "前置詞＋which＋to不定詞",
    "choices": ["which", "that", "what", "it"]
  },
  {
    "word": "where",
    "meaning": "関係副詞whereの抽象用法",
    "choices": ["where", "when", "why", "which"]
  },
  {
    "word": "What",
    "meaning": "関係代名詞what（先行詞包含）",
    "choices": ["What", "That", "Which", "Who"]
  },
  {
    "word": "Not",
    "meaning": "not that … but that …",
    "choices": ["Not", "Only", "Just", "Even"]
  },
  {
    "word": "When",
    "meaning": "接続詞＋形容詞（省略構文）",
    "choices": ["When", "If", "Though", "Because"]
  },
  {
    "word": "what",
    "meaning": "echo question（倒置なし）",
    "choices": ["what", "did what", "what did", "that"]
  },
  {
    "word": "before",
    "meaning": "挿入句と倒置（Never ～ before）",
    "choices": ["before", "after", "then", "now"]
  },
  {
    "word": "present",
    "meaning": "後置修飾で意味が変わる形容詞",
    "choices": ["present", "absent", "here", "there"]
  },
  {
    "word": "had",
    "meaning": "Hardly … when の倒置",
    "choices": ["had", "did", "was", "would"]
  },
  {
    "word": "that",
    "meaning": "同格のthat（後ろに完全文）",
    "choices": ["that", "which", "what", "who"]
  },
  {
    "word": "to",
    "meaning": "擬似分裂文（what節＋be＋to不定詞）",
    "choices": ["to", "for", "with", "by"]
  },
  {
    "word": "to",
    "meaning": "代不定詞（toの残存）",
    "choices": ["to", "do", "it", "so"]
  },
  {
    "word": "is",
    "meaning": "There ＋ is ＋ 複数名詞（口語）",
    "choices": ["is", "are", "was", "were"]
  },
  {
    "word": "painted",
    "meaning": "進行形の受動態（being ＋ 過去分詞）",
    "choices": ["painted", "painting", "paint", "to paint"]
  },
  {
    "word": "any",
    "meaning": "否定文のany",
    "choices": ["any", "some", "no", "none"]
  },
  {
    "word": "than",
    "meaning": "否定語＋比較級＋than",
    "choices": ["than", "as", "like", "to"]
  },
  {
    "word": "without",
    "meaning": "never without（二重否定の強調）",
    "choices": ["without", "with", "by", "for"]
  }
];