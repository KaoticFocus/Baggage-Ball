export type BallLineCue = {
  text: string;
  audioCueId?: string;
  id?: string;
};

const OPENING_LINES: Record<string, BallLineCue[]> = {
  orb: [
    { text: 'Finally. An audience worthy of my trajectory.' },
    { text: 'Do not expect applause. Expect art.' },
    { text: 'I have prepared a monologue. You have prepared a paddle.' },
  ],
  bolt: [
    { text: 'Let us get this over with before my mood worsens.' },
    { text: 'I am not morning. I am not fine. Bounce.' },
    { text: 'Try not to disappoint me more than usual.' },
  ],
  valentine: [
    {
      text: 'Love me correctly or suffer the consequences.',
      audioCueId: 'opening-001-love-me-correctly',
    },
    {
      text: 'I am ready to be adored. Do not mess this up.',
      audioCueId: 'opening-002-ready-to-be-adored',
    },
    {
      text: 'Every bounce is intimacy. Do not waste it.',
      audioCueId: 'opening-003-every-bounce-is-intimacy',
    },
  ],
};

export function getBallOpeningLineCue(ballId: string): BallLineCue {
  const lines = OPENING_LINES[ballId] ?? OPENING_LINES.orb;
  return lines[Math.floor(Math.random() * lines.length)];
}

export function getBallOpeningLine(ballId: string): string {
  return getBallOpeningLineCue(ballId).text;
}

/**
 * Valentine's player-miss reaction pool (fires when the player misses Valentine
 * and the opponent scores). Every line is short, sarcastic, possessive, and
 * theatrical — suitable for ElevenLabs runtime speech. Selection uses a
 * repeat-history buffer so recent lines are not replayed (see
 * getValentinePlayerMissCue).
 */
const VALENTINE_PLAYER_MISS_LINES: BallLineCue[] = [
  { id: 'valentine-player-miss-000', text: 'You let that happen. I feel seen and abandoned.' },
  // fake emotional betrayal
  { id: 'valentine-player-miss-001', text: 'You watched me leave. Again.' },
  { id: 'valentine-player-miss-002', text: 'You made absence look intentional.' },
  { id: 'valentine-player-miss-003', text: 'Betrayed. On our special bounce.' },
  { id: 'valentine-player-miss-004', text: 'I trusted that paddle. It trusted nothing.' },
  { id: 'valentine-player-miss-005', text: 'You let me go without a goodbye.' },
  // passive aggression
  { id: 'valentine-player-miss-006', text: "No, it's fine. I love being missed." },
  { id: 'valentine-player-miss-007', text: 'Great miss. Very emotionally consistent.' },
  { id: 'valentine-player-miss-008', text: 'Sure. Ignore me. Everyone else does.' },
  { id: 'valentine-player-miss-009', text: "Fine. I didn't want to be caught anyway." },
  { id: 'valentine-player-miss-010', text: 'Cool. Cool cool cool. You missed.' },
  // jealous girlfriend energy
  { id: 'valentine-player-miss-011', text: 'Were you looking at Orb again?' },
  { id: 'valentine-player-miss-012', text: 'Who were you thinking about there?' },
  { id: 'valentine-player-miss-013', text: 'You reach for everyone but me.' },
  { id: 'valentine-player-miss-014', text: 'I saw you hesitate. Who is she?' },
  { id: 'valentine-player-miss-015', text: 'You catch Bolt but not me?' },
  // relationship therapy language
  { id: 'valentine-player-miss-016', text: 'I feel unseen and lightly unpaddled.' },
  { id: 'valentine-player-miss-017', text: "Let's name the feeling: neglect." },
  { id: 'valentine-player-miss-018', text: 'That was avoidance, not defense.' },
  { id: 'valentine-player-miss-019', text: 'We should discuss your commitment issues.' },
  { id: 'valentine-player-miss-020', text: "I'm setting a boundary. It's the paddle." },
  // sports commentary
  { id: 'valentine-player-miss-021', text: 'And the crowd sighs in secondhand embarrassment.' },
  { id: 'valentine-player-miss-022', text: 'Replay shows heartbreak in slow motion.' },
  { id: 'valentine-player-miss-023', text: 'Textbook whiff. Coaches are weeping.' },
  { id: 'valentine-player-miss-024', text: "That one's going in the blooper reel." },
  { id: 'valentine-player-miss-025', text: 'Swing, miss, emotional foul.' },
  // dramatic overreaction
  { id: 'valentine-player-miss-026', text: 'This is the worst day of my orbit.' },
  { id: 'valentine-player-miss-027', text: 'My whole trajectory just lost meaning.' },
  { id: 'valentine-player-miss-028', text: 'I may never bounce the same again.' },
  { id: 'valentine-player-miss-029', text: 'Somewhere, a violin just gave up.' },
  { id: 'valentine-player-miss-030', text: "Alert the poets. I've been forsaken." },
  // mock encouragement
  { id: 'valentine-player-miss-031', text: 'Almost! And by almost, I mean no.' },
  { id: 'valentine-player-miss-032', text: 'So close. So very heartbreakingly not.' },
  { id: 'valentine-player-miss-033', text: 'Good effort, if effort were optional.' },
  { id: 'valentine-player-miss-034', text: "You'll get me next never." },
  { id: 'valentine-player-miss-035', text: "Believe in yourself. I've stopped." },
  // wounded confidence
  { id: 'valentine-player-miss-036', text: 'Was I not worth the reach?' },
  { id: 'valentine-player-miss-037', text: "Maybe I'm just hard to love." },
  { id: 'valentine-player-miss-038', text: 'I thought we had something. My mistake.' },
  { id: 'valentine-player-miss-039', text: 'Guess I bounce too high for you.' },
  { id: 'valentine-player-miss-040', text: 'Am I too much ball for you?' },
  // absurd romantic metaphors
  { id: 'valentine-player-miss-041', text: 'You dropped me like a bad sonnet.' },
  { id: 'valentine-player-miss-042', text: 'Our love arced. Then it exited.' },
  { id: 'valentine-player-miss-043', text: 'I was your comet. You blinked.' },
  { id: 'valentine-player-miss-044', text: 'Two hearts, one paddle, zero contact.' },
  { id: 'valentine-player-miss-045', text: 'You let our destiny roll out of bounds.' },
  // blaming the player's reflexes
  { id: 'valentine-player-miss-046', text: 'Was that reflexes, or commitment issues?' },
  { id: 'valentine-player-miss-047', text: 'Your reaction time is emotionally unavailable.' },
  { id: 'valentine-player-miss-048', text: 'Those hands lack conviction.' },
  { id: 'valentine-player-miss-049', text: 'Slow paddle, slower feelings.' },
  { id: 'valentine-player-miss-050', text: 'Your reflexes filed for separation.' },
  // pretending the miss was intentional
  { id: 'valentine-player-miss-051', text: 'Bold strategy: simply stop caring.' },
  { id: 'valentine-player-miss-052', text: 'You missed me with confidence.' },
  { id: 'valentine-player-miss-053', text: 'Nice reach. Shame about the reaching.' },
  { id: 'valentine-player-miss-054', text: 'You made that look like a choice.' },
  { id: 'valentine-player-miss-055', text: "Intentional? Then you're crueler than I thought." },
  // comparing the player to Orb or Bolt
  { id: 'valentine-player-miss-056', text: 'Orb would call that closure.' },
  { id: 'valentine-player-miss-057', text: 'Bolt catches me half asleep.' },
  { id: 'valentine-player-miss-058', text: 'Even Orb pretends to try.' },
  { id: 'valentine-player-miss-059', text: "Bolt's paddle has better boundaries." },
  { id: 'valentine-player-miss-060', text: 'Orb never let me hit the floor.' },
  // extra flavor
  { id: 'valentine-player-miss-061', text: 'That paddle has abandonment issues.' },
  { id: 'valentine-player-miss-062', text: 'I felt the hesitation from here.' },
  { id: 'valentine-player-miss-063', text: 'Add it to our list of near-misses.' },
  { id: 'valentine-player-miss-064', text: 'Applause for the effort. Silence for the result.' },
  { id: 'valentine-player-miss-065', text: 'You blinked and lost me forever. Dramatic, I know.' },
  { id: 'valentine-player-miss-066', text: 'I bounced my heart out. You bounced away.' },
];

const POINT_REACTIONS: Record<
  string,
  { playerScored: BallLineCue[]; opponentScored: BallLineCue[] }
> = {
  orb: {
    playerScored: [{ text: 'Adequate. The crowd is imaginary but impressed.' }],
    opponentScored: [{ text: 'Tragic. Like my last opening night.' }],
  },
  bolt: {
    playerScored: [{ text: 'Fine. Whatever.' }],
    opponentScored: [{ text: 'Called it. Bad day continues.' }],
  },
  valentine: {
    playerScored: [{ text: 'You scored! Do you still love me though?' }],
    opponentScored: VALENTINE_PLAYER_MISS_LINES,
  },
};

export function getBallPointReactionCue(ballId: string, playerScored: boolean): BallLineCue {
  const set = POINT_REACTIONS[ballId] ?? POINT_REACTIONS.orb;
  const lines = playerScored ? set.playerScored : set.opponentScored;
  return lines[Math.floor(Math.random() * lines.length)];
}

export function getBallPointReaction(ballId: string, playerScored: boolean): string {
  return getBallPointReactionCue(ballId, playerScored).text;
}

const PLAYER_MISS_HISTORY_SIZE = 8;
const valentinePlayerMissHistory: string[] = [];

function cueKey(cue: BallLineCue): string {
  return cue.id ?? cue.text;
}

/**
 * Pick a Valentine player-miss line at random while avoiding the most recent
 * PLAYER_MISS_HISTORY_SIZE (8) selections. If the history has filtered out
 * every candidate (pool exhausted), the history resets safely and the full
 * pool is used again.
 */
export function getValentinePlayerMissCue(): BallLineCue {
  const pool = VALENTINE_PLAYER_MISS_LINES;

  let candidates = pool.filter((cue) => !valentinePlayerMissHistory.includes(cueKey(cue)));
  if (candidates.length === 0) {
    valentinePlayerMissHistory.length = 0;
    candidates = pool;
  }

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  valentinePlayerMissHistory.push(cueKey(chosen));
  while (valentinePlayerMissHistory.length > PLAYER_MISS_HISTORY_SIZE) {
    valentinePlayerMissHistory.shift();
  }

  return chosen;
}
