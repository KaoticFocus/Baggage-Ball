import { z } from 'zod';

export const ballStatsSchema = z.object({
  trust: z.number(),
  resentment: z.number(),
  ego: z.number(),
  chaos: z.number(),
  attachment: z.number(),
  dramaNeed: z.number(),
  patience: z.number(),
});

export const toneSchema = z.enum([
  'sincere',
  'sarcastic',
  'absurd',
  'boundary',
  'flattering',
  'provoking',
  'apologetic',
  'evasive',
  'hostile',
  'tender',
]);

export const behaviorModifierSchema = z.enum([
  'helpfulCurve',
  'hostileFakeOut',
  'erraticBounce',
  'speedSpike',
  'slowDown',
  'gentleReturn',
  'dramaticPause',
  'clingyDrift',
  'resentmentShot',
  'chaosWobble',
  'none',
]);

export const classifyRequestSchema = z.object({
  ballName: z.string().min(1),
  ballPersonality: z.string().min(1),
  ballStats: ballStatsSchema,
  ballLine: z.string().min(1),
  playerResponse: z.string().min(1).max(500),
  situation: z.string().min(1),
});

export const classifyResponseSchema = z.object({
  tone: toneSchema,
  emotionalResult: z.string().min(1),
  ballReaction: z.string().min(1),
  behaviorModifier: behaviorModifierSchema,
  statChanges: ballStatsSchema.partial(),
});

export const recapRequestSchema = z.object({
  ballName: z.string().min(1),
  ballPersonality: z.string().min(1),
  finalStats: ballStatsSchema,
  score: z.number(),
  longestRally: z.number(),
  recentEvents: z.array(z.string()).default([]),
  playerModeHistory: z.array(z.string()).default([]),
});

export const recapResponseSchema = z.object({
  relationshipStatus: z.string().min(1),
  emotionalDiagnosis: z.string().min(1),
  finalNote: z.string().min(1),
  worstThingThePlayerDid: z.string().min(1),
  replayHook: z.string().min(1),
});

export type ClassifyRequest = z.infer<typeof classifyRequestSchema>;
export type ClassifyResponse = z.infer<typeof classifyResponseSchema>;
export type RecapRequest = z.infer<typeof recapRequestSchema>;
export type RecapResponse = z.infer<typeof recapResponseSchema>;
