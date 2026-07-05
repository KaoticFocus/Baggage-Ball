import type { DialogueEvent, DialogueSituation } from '../types/DialogueTypes';
import type { BehaviorModifier } from '../types/BallTypes';
import { ORB_DIALOGUES } from './dialogues/orbDialogues';
import { BOLT_DIALOGUES } from './dialogues/boltDialogues';
import { VALENTINE_DIALOGUES } from './dialogues/valentineDialogues';
import {
  generatedDialogueEvents,
  GENERATED_DIALOGUE_EVENTS,
} from './generatedDialogueEvents';

type RawGeneratedEvent = {
  id: string;
  ballId?: string;
  ballIds?: string[];
  situation: string;
  ballLine: string;
  responses: Array<{
    text: string;
    tone: string;
    statChanges: Partial<Record<string, number>>;
    ballReaction: string;
    emotionalResult?: string;
    behaviorModifier?: string;
  }>;
};

function normalizeModifier(mod?: string): BehaviorModifier | undefined {
  if (!mod || mod === 'none') return undefined;
  return mod as BehaviorModifier;
}

function normalizeGenerated(raw: RawGeneratedEvent): DialogueEvent {
  return {
    id: raw.id,
    situation: raw.situation as DialogueSituation,
    ballLine: raw.ballLine,
    ballIds: raw.ballIds ?? (raw.ballId ? [raw.ballId] : undefined),
    responses: raw.responses.map((r) => ({
      text: r.text,
      tone: r.tone as DialogueEvent['responses'][0]['tone'],
      statChanges: r.statChanges,
      ballReaction: r.ballReaction,
      emotionalResult: r.emotionalResult,
      behaviorModifier: normalizeModifier(r.behaviorModifier),
    })),
  };
}

const FROM_CONST = (generatedDialogueEvents as readonly RawGeneratedEvent[]).map(normalizeGenerated);

export const GENERATED_DIALOGUES: DialogueEvent[] =
  GENERATED_DIALOGUE_EVENTS.length > 0 ? GENERATED_DIALOGUE_EVENTS : FROM_CONST;

export const HAND_AUTHORED_DIALOGUES: DialogueEvent[] = [
  ...ORB_DIALOGUES,
  ...BOLT_DIALOGUES,
  ...VALENTINE_DIALOGUES,
];

export function hasGeneratedDialogue(): boolean {
  return GENERATED_DIALOGUES.length > 0;
}

export function getGeneratedEventsForBall(ballId: string): DialogueEvent[] {
  return GENERATED_DIALOGUES.filter((e) => !e.ballIds || e.ballIds.includes(ballId));
}

export function getHandAuthoredEventsForBall(ballId: string): DialogueEvent[] {
  return HAND_AUTHORED_DIALOGUES.filter((e) => !e.ballIds || e.ballIds.includes(ballId));
}

/** Prefer generated matrix when available */
export function getEventsForBall(ballId: string): DialogueEvent[] {
  const generated = getGeneratedEventsForBall(ballId);
  if (generated.length > 0) return generated;
  return getHandAuthoredEventsForBall(ballId);
}

export function getEventsBySituation(
  ballId: string,
  situation: DialogueSituation
): DialogueEvent[] {
  return getEventsForBall(ballId).filter((e) => e.situation === situation);
}

export function getDialogueSourceCounts() {
  return {
    handAuthored: HAND_AUTHORED_DIALOGUES.length,
    generated: GENERATED_DIALOGUES.length,
    usingGenerated: hasGeneratedDialogue(),
  };
}
