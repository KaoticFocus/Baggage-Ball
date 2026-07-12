export type BallLineCue = {
  text: string;
  audioCueId?: string;
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
    opponentScored: [{ text: 'You let that happen. I feel seen and abandoned.' }],
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
