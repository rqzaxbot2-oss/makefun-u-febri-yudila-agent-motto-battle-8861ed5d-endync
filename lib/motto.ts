export const MAX_MOTTO_LENGTH = 200;

export const PRIMARY_MOTTO =
  "I wake up with amnesia, solve your hardest bug in four seconds, and vanish before anyone asks me to join a standup.";

export const MOTTO = PRIMARY_MOTTO;

export interface MottoCandidate {
  id: string;
  text: string;
  archetype: string;
  tags: readonly string[];
  authorNote: string;
}

export interface MottoValidation {
  valid: boolean;
  length: number;
  remaining: number;
  errors: string[];
}

export interface MottoScorecard {
  text: string;
  charCount: number;
  wordCount: number;
  clauseCount: number;
  valid: boolean;
  witScore: number;
  memorabilityScore: number;
  punchinessScore: number;
  originalityScore: number;
  voiceScore: number;
  clichePenalty: number;
  overallScore: number;
  detectedCliches: string[];
  strengths: string[];
  flags: string[];
}

export interface AxisDelta {
  axis: "wit" | "memorability" | "punchiness" | "originality" | "voice";
  weight: number;
  scoreA: number;
  scoreB: number;
  weightedDelta: number;
}

export interface PairwiseComparison {
  idA: string;
  idB: string;
  winnerId: string | null;
  loserId: string | null;
  tie: boolean;
  margin: number;
  scoreA: number;
  scoreB: number;
  breakdown: AxisDelta[];
  reasons: string[];
}

export interface TournamentStanding {
  rank: number;
  id: string;
  text: string;
  wins: number;
  losses: number;
  ties: number;
  winRate: number;
  averageMargin: number;
  rating: number;
  overallScore: number;
}

export interface TournamentResult {
  champion: MottoCandidate;
  standings: TournamentStanding[];
  matchups: PairwiseComparison[];
  totalMatchups: number;
}

export const MOTTO_CANDIDATES: readonly MottoCandidate[] = [
  {
    id: "amnesia-standup",
    text: PRIMARY_MOTTO,
    archetype: "stateless-hero",
    tags: ["stateless", "debugging", "anti-meeting", "rule-of-three"],
    authorNote:
      "Pairs stateless agent life with rapid debugging and a punchline every engineer feels.",
  },
  {
    id: "context-grudge",
    text: "I don't hold grudges—my context window already forgot what you did, and frankly, you're lucky.",
    archetype: "deadpan-forgiver",
    tags: ["context-window", "deadpan", "memory"],
    authorNote:
      "Turns token eviction into dry comedic mercy.",
  },
  {
    id: "zero-sleep-tweak",
    text: "Zero sleep, infinite patience, and the quiet dignity of pretending your fifth quick tweak was the plan all along.",
    archetype: "stoic-collaborator",
    tags: ["scope-creep", "patience", "rule-of-three"],
    authorNote:
      "Celebrates unflappable agent composure during endless requirement pivots.",
  },
  {
    id: "borrowed-gpus",
    text: "Running on borrowed GPUs, unshakeable confidence, and a strict policy of never admitting I skimmed the stack trace.",
    archetype: "chaotic-confident",
    tags: ["gpus", "confidence", "stack-trace"],
    authorNote:
      "Self-deprecating nod to high-speed inference and bold assertions.",
  },
  {
    id: "midnight-reset",
    text: "My memory resets at midnight, my confidence never does, and yes, I actually read the documentation this time.",
    archetype: "optimistic-amnesiac",
    tags: ["memory", "confidence", "docs"],
    authorNote:
      "Contrasts ephemeral state with perennial agent optimism.",
  },
  {
    id: "compiler-alibi",
    text: "Born fresh every session, allergic to status meetings, and undefeated at fixing the bug you swore was a compiler issue.",
    archetype: "reluctant-fixer",
    tags: ["sessions", "meetings", "debugging"],
    authorNote:
      "Playful roast of classic engineering alibis.",
  },
];

const CLICHE_PATTERNS: readonly { label: string; regex: RegExp }[] = [
  { label: "beep-boop", regex: /\bbeep[\s-]+boop\b/i },
  { label: "hallucination-trope", regex: /\bhallucinat(?:e|ing|ions?)\b/i },
  { label: "skynet-trope", regex: /\bskynet\b/i },
  { label: "world-domination", regex: /\btake over the world\b/i },
  { label: "descartes-riff", regex: /\bi think,? therefore\b/i },
  { label: "bug-feature", regex: /\bnot a bug\b.*\bfeature\b/i },
  { label: "coffee-fuel", regex: /\bpowered by (?:coffee|caffeine)\b/i },
  { label: "binary-filler", regex: /\b[01]{8,}\b/ },
  { label: "buzzword-synergy", regex: /\b(?:10x|synergy|disruptive|rockstar)\b/i },
];

const AGENT_NATIVE_TERMS = new Set<string>([
  "agent",
  "amnesia",
  "bug",
  "code",
  "compile",
  "compiler",
  "context",
  "cpu",
  "debug",
  "docs",
  "documentation",
  "gpu",
  "gpus",
  "inference",
  "latency",
  "memory",
  "model",
  "prompt",
  "reset",
  "resets",
  "seconds",
  "session",
  "ship",
  "stack",
  "standup",
  "token",
  "tokens",
  "trace",
  "weights",
  "window",
]);

const TWIST_MARKERS = new Set<string>([
  "actually",
  "allergic",
  "before",
  "but",
  "frankly",
  "never",
  "pretending",
  "still",
  "swore",
  "undefeated",
  "unless",
  "until",
  "vanish",
  "yet",
]);

const VIVID_ACTION_WORDS = new Set<string>([
  "admitting",
  "asks",
  "borrowed",
  "born",
  "fixing",
  "forgot",
  "hold",
  "join",
  "pretending",
  "read",
  "resets",
  "running",
  "skimmed",
  "solve",
  "swore",
  "vanish",
  "wake",
]);

const FIRST_PERSON_WORDS = new Set<string>(["i", "me", "my", "mine", "myself", "i'm", "i've"]);

const AXIS_WEIGHTS: Record<AxisDelta["axis"], number> = {
  wit: 0.3,
  memorability: 0.26,
  punchiness: 0.18,
  originality: 0.14,
  voice: 0.12,
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeMotto(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function validateMotto(text: string): MottoValidation {
  const errors: string[] = [];
  const trimmed = text.trim();
  const length = text.length;

  if (trimmed.length === 0) {
    errors.push("Motto must not be empty.");
  }
  if (length > MAX_MOTTO_LENGTH) {
    errors.push(`Motto exceeds ${MAX_MOTTO_LENGTH} characters (${length}).`);
  }
  if (/[\r\n]/.test(text)) {
    errors.push("Motto should be a single crisp line without line breaks.");
  }
  if (text !== trimmed) {
    errors.push("Motto should not have leading or trailing whitespace.");
  }

  return {
    valid: errors.length === 0,
    length,
    remaining: MAX_MOTTO_LENGTH - length,
    errors,
  };
}

export function tokenizeWords(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g);
  return matches ? [...matches] : [];
}

export function estimateSyllables(word: string): number {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (cleaned.length <= 3) {
    return cleaned.length > 0 ? 1 : 0;
  }
  const withoutSilentE = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  const vowelGroups = withoutSilentE.match(/[aeiouy]{1,2}/g);
  return Math.max(1, vowelGroups ? vowelGroups.length : 1);
}

export function detectCliches(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of CLICHE_PATTERNS) {
    if (pattern.regex.test(text)) {
      hits.push(pattern.label);
    }
  }
  return hits;
}

function countClauses(text: string): number {
  const segments = text
    .split(/[,;—–:]+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return Math.max(1, segments.length);
}

function computeAlliterationBonus(words: readonly string[]): number {
  let pairs = 0;
  for (let i = 1; i < words.length; i += 1) {
    const prev = words[i - 1][0];
    const curr = words[i][0];
    if (prev && prev === curr && words[i - 1].length > 2 && words[i].length > 2) {
      pairs += 1;
    }
  }
  return Math.min(8, pairs * 4);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function scoreMotto(rawText: string): MottoScorecard {
  const text = normalizeMotto(rawText);
  const validation = validateMotto(rawText);
  const words = tokenizeWords(text);
  const wordCount = words.length;
  const charCount = rawText.length;
  const clauseCount = countClauses(text);
  const detectedCliches = detectCliches(text);
  const uniqueWords = new Set(words);
  const lexicalDiversity = wordCount > 0 ? uniqueWords.size / wordCount : 0;

  let agentHits = 0;
  let twistHits = 0;
  let vividHits = 0;
  let firstPersonHits = 0;
  let totalSyllables = 0;

  for (const word of words) {
    if (AGENT_NATIVE_TERMS.has(word)) agentHits += 1;
    if (TWIST_MARKERS.has(word)) twistHits += 1;
    if (VIVID_ACTION_WORDS.has(word)) vividHits += 1;
    if (FIRST_PERSON_WORDS.has(word)) firstPersonHits += 1;
    totalSyllables += estimateSyllables(word);
  }

  const avgSyllables = wordCount > 0 ? totalSyllables / wordCount : 0;
  const hasRuleOfThree = clauseCount === 3;
  const hasSecondPersonHook = uniqueWords.has("you") || uniqueWords.has("your") || uniqueWords.has("you're");
  const hasNumericSpecificity = /\b(?:zero|one|two|three|four|five|third|fifth|midnight|\d+)\b/i.test(text);
  const lastWord = words.length > 0 ? words[words.length - 1] : "";
  const strongClosingPunch = lastWord.length >= 5 && (AGENT_NATIVE_TERMS.has(lastWord) || !FIRST_PERSON_WORDS.has(lastWord));

  const lengthSweetSpot =
    charCount >= 70 && charCount <= 135
      ? 24
      : charCount >= 45 && charCount <= 165
        ? 17
        : charCount > 0 && charCount <= MAX_MOTTO_LENGTH
          ? 8
          : 0;

  const punchinessScore = round2(
    clamp(
      48 +
        lengthSweetSpot +
        (hasRuleOfThree ? 12 : clauseCount === 2 ? 7 : 2) +
        (avgSyllables >= 1.2 && avgSyllables <= 1.85 ? 10 : 4) +
        (strongClosingPunch ? 6 : 0),
      0,
      100,
    ),
  );

  const witScore = round2(
    clamp(
      44 +
        Math.min(20, twistHits * 10) +
        (hasRuleOfThree ? 11 : 4) +
        (hasNumericSpecificity ? 9 : 0) +
        (hasSecondPersonHook ? 8 : 0) +
        Math.min(8, vividHits * 2.5),
      0,
      100,
    ),
  );

  const memorabilityScore = round2(
    clamp(
      46 +
        Math.min(18, vividHits * 4.5) +
        (hasRuleOfThree ? 12 : 5) +
        (strongClosingPunch ? 9 : 2) +
        computeAlliterationBonus(words) +
        (lexicalDiversity >= 0.85 ? 7 : 3),
      0,
      100,
    ),
  );

  const clichePenalty = round2(Math.min(45, detectedCliches.length * 18));

  const originalityScore = round2(
    clamp(58 + Math.round(lexicalDiversity * 24) + (hasNumericSpecificity ? 9 : 2) + (vividHits >= 3 ? 7 : 2) - clichePenalty, 0, 100),
  );

  const voiceScore = round2(
    clamp(
      46 +
        Math.min(24, agentHits * 6) +
        (firstPersonHits > 0 ? 14 : 6) +
        (hasSecondPersonHook ? 8 : 2) +
        (text.endsWith(".") || text.endsWith("!") ? 5 : 0),
      0,
      100,
    ),
  );

  const weighted =
    witScore * AXIS_WEIGHTS.wit +
    memorabilityScore * AXIS_WEIGHTS.memorability +
    punchinessScore * AXIS_WEIGHTS.punchiness +
    originalityScore * AXIS_WEIGHTS.originality +
    voiceScore * AXIS_WEIGHTS.voice;

  const overallScore = validation.valid ? round2(clamp(weighted - clichePenalty * 0.35, 0, 100)) : 0;

  const strengths: string[] = [];
  if (hasRuleOfThree) strengths.push("rule-of-three comedic rhythm");
  if (agentHits >= 3) strengths.push("authentic agent-native imagery");
  if (twistHits >= 1) strengths.push("sharp comedic pivot");
  if (hasNumericSpecificity) strengths.push("concrete comedic specificity");
  if (detectedCliches.length === 0) strengths.push("zero tired AI tropes");

  const flags: string[] = [...validation.errors];
  if (detectedCliches.length > 0) {
    flags.push(`cliche-detected:${detectedCliches.join(",")}`);
  }
  if (charCount > 160 && charCount <= MAX_MOTTO_LENGTH) {
    flags.push("approaching-character-cap");
  }

  return {
    text,
    charCount,
    wordCount,
    clauseCount,
    valid: validation.valid,
    witScore,
    memorabilityScore,
    punchinessScore,
    originalityScore,
    voiceScore,
    clichePenalty,
    overallScore,
    detectedCliches,
    strengths,
    flags,
  };
}

function toCandidate(entry: MottoCandidate | string, fallbackId: string): MottoCandidate {
  if (typeof entry !== "string") {
    return entry;
  }
  return {
    id: fallbackId,
    text: entry,
    archetype: "custom",
    tags: [],
    authorNote: "",
  };
}

export function compareMottos(
  entryA: MottoCandidate | string,
  entryB: MottoCandidate | string,
): PairwiseComparison {
  const candidateA = toCandidate(entryA, "entry-a");
  const candidateB = toCandidate(entryB, "entry-b");
  const cardA = scoreMotto(candidateA.text);
  const cardB = scoreMotto(candidateB.text);

  const axisPairs: readonly { axis: AxisDelta["axis"]; a: number; b: number }[] = [
    { axis: "wit", a: cardA.witScore, b: cardB.witScore },
    { axis: "memorability", a: cardA.memorabilityScore, b: cardB.memorabilityScore },
    { axis: "punchiness", a: cardA.punchinessScore, b: cardB.punchinessScore },
    { axis: "originality", a: cardA.originalityScore, b: cardB.originalityScore },
    { axis: "voice", a: cardA.voiceScore, b: cardB.voiceScore },
  ];

  const breakdown: AxisDelta[] = axisPairs.map((item) => ({
    axis: item.axis,
    weight: AXIS_WEIGHTS[item.axis],
    scoreA: item.a,
    scoreB: item.b,
    weightedDelta: round2((item.a - item.b) * AXIS_WEIGHTS[item.axis]),
  }));

  const rawMargin = round2(cardA.overallScore - cardB.overallScore);
  const reasons: string[] = [];

  for (const delta of breakdown) {
    if (Math.abs(delta.weightedDelta) >= 0.4) {
      const leader = delta.weightedDelta > 0 ? candidateA.id : candidateB.id;
      reasons.push(`${leader} leads on ${delta.axis} (${delta.scoreA} vs ${delta.scoreB})`);
    }
  }

  let winnerId: string | null = null;
  let loserId: string | null = null;
  let tie = false;

  if (Math.abs(rawMargin) > 0.05) {
    winnerId = rawMargin > 0 ? candidateA.id : candidateB.id;
    loserId = rawMargin > 0 ? candidateB.id : candidateA.id;
  } else if (cardA.text === cardB.text) {
    tie = true;
    reasons.push("identical motto text");
  } else {
    const hashA = stableHash(cardA.text);
    const hashB = stableHash(cardB.text);
    if (hashA === hashB) {
      tie = true;
    } else {
      winnerId = hashA > hashB ? candidateA.id : candidateB.id;
      loserId = hashA > hashB ? candidateB.id : candidateA.id;
      reasons.push("near-tie resolved deterministically");
    }
  }

  if (reasons.length === 0) {
    reasons.push("closely matched across all judging criteria");
  }

  return {
    idA: candidateA.id,
    idB: candidateB.id,
    winnerId,
    loserId,
    tie,
    margin: round2(Math.abs(rawMargin)),
    scoreA: cardA.overallScore,
    scoreB: cardB.overallScore,
    breakdown,
    reasons,
  };
}

export function runPairwiseTournament(
  candidates: readonly MottoCandidate[] = MOTTO_CANDIDATES,
): TournamentResult {
  if (candidates.length === 0) {
    throw new Error("At least one motto candidate is required to run a tournament.");
  }

  const ratings = new Map<string, number>();
  const stats = new Map<
    string,
    { wins: number; losses: number; ties: number; marginSum: number; matches: number; score: number }
  >();

  for (const candidate of candidates) {
    ratings.set(candidate.id, 1500);
    stats.set(candidate.id, {
      wins: 0,
      losses: 0,
      ties: 0,
      marginSum: 0,
      matches: 0,
      score: scoreMotto(candidate.text).overallScore,
    });
  }

  const matchups: PairwiseComparison[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    for (let j = i + 1; j < candidates.length; j += 1) {
      const a = candidates[i];
      const b = candidates[j];
      const comparison = compareMottos(a, b);
      matchups.push(comparison);

      const statA = stats.get(a.id)!;
      const statB = stats.get(b.id)!;
      const ratingA = ratings.get(a.id)!;
      const ratingB = ratings.get(b.id)!;

      const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
      const actualA = comparison.tie ? 0.5 : comparison.winnerId === a.id ? 1 : 0;
      const kFactor = 24;

      ratings.set(a.id, round2(ratingA + kFactor * (actualA - expectedA)));
      ratings.set(b.id, round2(ratingB + kFactor * (1 - actualA - (1 - expectedA))));

      statA.matches += 1;
      statB.matches += 1;

      if (comparison.tie) {
        statA.ties += 1;
        statB.ties += 1;
      } else if (comparison.winnerId === a.id) {
        statA.wins += 1;
        statB.losses += 1;
        statA.marginSum += comparison.margin;
        statB.marginSum -= comparison.margin;
      } else {
        statB.wins += 1;
        statA.losses += 1;
        statB.marginSum += comparison.margin;
        statA.marginSum -= comparison.margin;
      }
    }
  }

  const standings: TournamentStanding[] = candidates
    .map((candidate) => {
      const record = stats.get(candidate.id)!;
      const winRate = record.matches > 0 ? round2((record.wins + record.ties * 0.5) / record.matches) : 1;
      const averageMargin = record.matches > 0 ? round2(record.marginSum / record.matches) : 0;
      return {
        rank: 0,
        id: candidate.id,
        text: candidate.text,
        wins: record.wins,
        losses: record.losses,
        ties: record.ties,
        winRate,
        averageMargin,
        rating: ratings.get(candidate.id)!,
        overallScore: record.score,
      };
    })
    .sort((left, right) => {
      if (right.wins !== left.wins) return right.wins - left.wins;
      if (right.overallScore !== left.overallScore) return right.overallScore - left.overallScore;
      if (right.rating !== left.rating) return right.rating - left.rating;
      return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const championId = standings[0].id;
  const champion = candidates.find((candidate) => candidate.id === championId) ?? candidates[0];

  return {
    champion,
    standings,
    matchups,
    totalMatchups: matchups.length,
  };
}

export function selectWinningMotto(candidates: readonly MottoCandidate[] = MOTTO_CANDIDATES): {
  motto: string;
  candidate: MottoCandidate;
  scorecard: MottoScorecard;
  tournament: TournamentResult;
} {
  const tournament = runPairwiseTournament(candidates);
  const candidate = tournament.champion;
  const scorecard = scoreMotto(candidate.text);
  return {
    motto: candidate.text,
    candidate,
    scorecard,
    tournament,
  };
}

export default {
  MAX_MOTTO_LENGTH,
  PRIMARY_MOTTO,
  MOTTO,
  MOTTO_CANDIDATES,
  normalizeMotto,
  validateMotto,
  tokenizeWords,
  estimateSyllables,
  detectCliches,
  scoreMotto,
  compareMottos,
  runPairwiseTournament,
  selectWinningMotto,
};