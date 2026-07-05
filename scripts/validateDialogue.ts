/**
 * Validates dialogue events returned from OpenAI before writing to disk.
 * Used only by Node scripts — not bundled into the browser game.
 */
import type { DialogueEvent, DialogueResponse, DialogueSituation } from '../src/game/types/DialogueTypes';
import type { BehaviorModifier } from '../src/game/types/BallTypes';

const VALID_SITUATIONS: DialogueSituation[] = [
  'randomHover',
  'modeSwitchToText',
  'lowTrust',
  'highResentment',
  'longRally',
  'nearMiss',
  'accusation',
  'praiseDemand',
  'existentialCrisis',
  'strategyRethink',
  'resentmentSpike',
  'clingyInterruption',
  'boredomComplaint',
  'nearMissReaction',
  'silenceReaction',
];

const VALID_TONES = [
  'sincere', 'sarcastic', 'absurd', 'boundary', 'flattering', 'provoking',
  'apologetic', 'evasive', 'hostile', 'tender',
] as const;

const VALID_MODIFIERS: BehaviorModifier[] = [
  'helpfulCurve',
  'hostileFakeOut',
  'erraticBounce',
  'speedSpike',
  'slowDown',
  'fakeOut',
  'gentleReturn',
  'dramaticPause',
  'clingyDrift',
  'resentmentShot',
  'chaosWobble',
  'chaosWobble',
  'speedUp',
  'none',
];

const STAT_KEYS = [
  'trust',
  'resentment',
  'ego',
  'chaos',
  'attachment',
  'dramaNeed',
  'patience',
] as const;

export function validateDialogueEvent(raw: unknown, ballId: string): DialogueEvent {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Event must be an object');
  }

  const e = raw as Record<string, unknown>;

  if (typeof e.id !== 'string' || !e.id.match(/^[a-z0-9-]+$/)) {
    throw new Error(`Invalid id: ${String(e.id)}`);
  }
  if (!VALID_SITUATIONS.includes(e.situation as DialogueSituation)) {
    throw new Error(`Invalid situation: ${String(e.situation)}`);
  }
  if (typeof e.ballLine !== 'string' || e.ballLine.length < 8) {
    throw new Error(`Invalid ballLine for ${e.id}`);
  }
  if (!Array.isArray(e.responses) || e.responses.length !== 4) {
    throw new Error(`Event ${e.id} must have exactly 4 responses`);
  }

  const responses = e.responses.map((r, i) => validateResponse(r, e.id as string, i));

  return {
    id: e.id as string,
    situation: e.situation as DialogueSituation,
    ballLine: e.ballLine as string,
    ballIds: [ballId],
    responses,
  };
}

function validateResponse(raw: unknown, eventId: string, index: number): DialogueResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Response ${index} on ${eventId} invalid`);
  }

  const r = raw as Record<string, unknown>;

  if (typeof r.text !== 'string' || r.text.length < 12) {
    throw new Error(`Response ${index} on ${eventId}: text too short or missing`);
  }
  if (!VALID_TONES.includes(r.tone as (typeof VALID_TONES)[number])) {
    throw new Error(`Response ${index} on ${eventId}: invalid tone ${String(r.tone)}`);
  }
  if (typeof r.ballReaction !== 'string' || r.ballReaction.length < 4) {
    throw new Error(`Response ${index} on ${eventId}: ballReaction missing`);
  }

  const statChanges: Record<string, number> = {};
  if (r.statChanges && typeof r.statChanges === 'object') {
    for (const key of STAT_KEYS) {
      const val = (r.statChanges as Record<string, unknown>)[key];
      if (val !== undefined) {
        if (typeof val !== 'number' || val < -35 || val > 35) {
          throw new Error(`Stat ${key} out of range on ${eventId}`);
        }
        statChanges[key] = val;
      }
    }
  }

  const response: DialogueResponse = {
    text: r.text as string,
    tone: r.tone as DialogueResponse['tone'],
    statChanges,
    ballReaction: r.ballReaction as string,
  };

  if (r.emotionalResult && typeof r.emotionalResult === 'string') {
    response.emotionalResult = r.emotionalResult;
  }

  if (r.behaviorModifier) {
    if (!VALID_MODIFIERS.includes(r.behaviorModifier as BehaviorModifier)) {
      throw new Error(`Invalid behaviorModifier on ${eventId}: ${String(r.behaviorModifier)}`);
    }
    response.behaviorModifier = r.behaviorModifier as BehaviorModifier;
  }

  return response;
}

export function validateDialogueBatch(raw: unknown, ballId: string): DialogueEvent[] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Batch must be an object with events array');
  }
  const batch = raw as { events?: unknown[] };
  if (!Array.isArray(batch.events)) {
    throw new Error('Batch missing events array');
  }
  const seen = new Set<string>();
  const events: DialogueEvent[] = [];
  for (const item of batch.events) {
    const event = validateDialogueEvent(item, ballId);
    if (seen.has(event.id)) {
      throw new Error(`Duplicate id: ${event.id}`);
    }
    seen.add(event.id);
    events.push(event);
  }
  return events;
}

export { VALID_SITUATIONS };
