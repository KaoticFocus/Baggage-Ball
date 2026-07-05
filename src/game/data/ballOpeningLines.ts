const OPENING_LINES: Record<string, string[]> = {
  orb: [
    'Finally. An audience worthy of my trajectory.',
    'Do not expect applause. Expect art.',
    'I have prepared a monologue. You have prepared a paddle.',
  ],
  bolt: [
    'Let us get this over with before my mood worsens.',
    'I am not morning. I am not fine. Bounce.',
    'Try not to disappoint me more than usual.',
  ],
  valentine: [
    'Love me correctly or suffer the consequences.',
    'I am ready to be adored. Do not mess this up.',
    'Every bounce is intimacy. Do not waste it.',
  ],
};

export function getBallOpeningLine(ballId: string): string {
  const lines = OPENING_LINES[ballId] ?? OPENING_LINES.orb;
  return lines[Math.floor(Math.random() * lines.length)];
}

const POINT_REACTIONS: Record<string, { playerScored: string[]; opponentScored: string[] }> = {
  orb: {
    playerScored: ['Adequate. The crowd is imaginary but impressed.'],
    opponentScored: ['Tragic. Like my last opening night.'],
  },
  bolt: {
    playerScored: ['Fine. Whatever.'],
    opponentScored: ['Called it. Bad day continues.'],
  },
  valentine: {
    playerScored: ['You scored! Do you still love me though?'],
    opponentScored: ['You let that happen. I feel seen and abandoned.'],
  },
};

export function getBallPointReaction(ballId: string, playerScored: boolean): string {
  const set = POINT_REACTIONS[ballId] ?? POINT_REACTIONS.orb;
  const lines = playerScored ? set.playerScored : set.opponentScored;
  return lines[Math.floor(Math.random() * lines.length)];
}
