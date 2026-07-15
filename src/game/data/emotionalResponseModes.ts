import type { BallStats } from '../types/BallTypes';

export type EmotionalResponseModeId =
  | 'deflect'
  | 'apologize'
  | 'validate'
  | 'challenge'
  | 'flirt'
  | 'mock'
  | 'reassure'
  | 'set-boundary'
  | 'go-silent';

export type EmotionalResponseMode = {
  id: EmotionalResponseModeId;
  key: string;
  label: string;
  description: string;
  effects: Partial<BallStats>;
};

export const EMOTIONAL_RESPONSE_MODES: readonly EmotionalResponseMode[] = [
  { id: 'deflect', key: '1', label: 'Deflect', description: 'Redirect the emotion with wit or a change of subject.', effects: { resentment: 1, chaos: 2, patience: -1 } },
  { id: 'apologize', key: '2', label: 'Apologize', description: 'Own your part plainly and make a sincere apology.', effects: { trust: 3, resentment: -2, ego: -1 } },
  { id: 'validate', key: '3', label: 'Validate', description: 'Acknowledge the ball\'s feelings without arguing with them.', effects: { trust: 2, resentment: -1, patience: 1 } },
  { id: 'challenge', key: '4', label: 'Challenge', description: 'Push back directly and invite the ball to be honest.', effects: { resentment: 2, ego: 2, chaos: 1 } },
  { id: 'flirt', key: '5', label: 'Flirt', description: 'Turn the tension into playful, non-explicit charm.', effects: { attachment: 2, dramaNeed: 2, trust: 1 } },
  { id: 'mock', key: '6', label: 'Mock', description: 'Tease the ball with a sharp but playful jab.', effects: { resentment: 3, ego: -1, chaos: 2 } },
  { id: 'reassure', key: '7', label: 'Reassure', description: 'Offer calm confidence that the ball is not alone.', effects: { trust: 3, patience: 2, resentment: -1 } },
  { id: 'set-boundary', key: '8', label: 'Set Boundary', description: 'State a firm, respectful limit on the emotional demand.', effects: { trust: 1, resentment: 1, patience: 2, attachment: -1 } },
  { id: 'go-silent', key: '9', label: 'Go Silent', description: 'Say nothing. Let the silence itself answer the ball.', effects: { resentment: 2, dramaNeed: 1, patience: -1 } },
];

export type EmotionalResponseCharacterId = 'valentine' | 'midlifeDave' | 'default';

export const EMOTIONAL_RESPONSE_CHARACTER_OVERRIDES: Record<
  EmotionalResponseCharacterId,
  Partial<Record<EmotionalResponseModeId, Partial<BallStats>>>
> = {
  default: {},
  valentine: {
    validate: { attachment: 3, dramaNeed: -1 },
    flirt: { attachment: 4, resentment: 1 },
    'set-boundary': { resentment: 3, attachment: -2 },
    'go-silent': { resentment: 4, attachment: 2 },
  },
  midlifeDave: {
    apologize: { trust: 2, patience: 2 },
    challenge: { resentment: 3, ego: -1 },
    reassure: { trust: 2, resentment: -2 },
    flirt: { ego: 2, attachment: -1 },
    'go-silent': { patience: 2, dramaNeed: -1 },
  },
};

export const EMOTIONAL_RESPONSE_BALL_OVERRIDES: Record<
  string,
  Partial<Record<EmotionalResponseModeId, Partial<BallStats>>>
> = {
  orb: {
    challenge: { ego: 3, dramaNeed: 1 },
    mock: { ego: -2, dramaNeed: 2 },
  },
  bolt: {
    reassure: { patience: 3, trust: 1 },
    deflect: { resentment: 2, dramaNeed: -1 },
  },
  valentine: {},
};

export function getEmotionalResponseMode(id: EmotionalResponseModeId): EmotionalResponseMode {
  return EMOTIONAL_RESPONSE_MODES.find((mode) => mode.id === id) ?? EMOTIONAL_RESPONSE_MODES[0];
}

export function getEmotionalResponseEffects(
  id: EmotionalResponseModeId,
  characterId: EmotionalResponseCharacterId,
  ballId?: string
): Partial<BallStats> {
  const mode = getEmotionalResponseMode(id);
  return {
    ...mode.effects,
    ...(EMOTIONAL_RESPONSE_CHARACTER_OVERRIDES[characterId][id] ?? {}),
    ...(EMOTIONAL_RESPONSE_BALL_OVERRIDES[ballId ?? '']?.[id] ?? {}),
  };
}