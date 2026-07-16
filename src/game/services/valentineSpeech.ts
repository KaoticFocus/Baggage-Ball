/**
 * Valentine speech helpers — thin wrappers over VoiceDirector.
 * No local audio playback; ElevenLabs only via VoiceDirector.
 */

import type { SpeechCategory, SpeechPriority } from '../audio/speechTypes';
import { voiceDirector } from '../audio/VoiceDirector';
import { uiManager } from '../../ui/UIManager';
import type { DialogueSituation } from '../types/DialogueTypes';

export type ValentineSpeechEvent =
  | 'opening'
  | 'scoreReaction'
  | 'missReaction'
  | 'hoverPrompt'
  | 'responseReaction'
  | 'nearMiss'
  | 'resentment'
  | 'praise'
  | 'strategy'
  | 'longRally'
  | 'lowTrust'
  | 'typedResponse'
  | 'outburst'
  | 'postMatch'
  | 'other';

export type ValentineSpeechPriority = 'low' | 'medium' | 'high';

export type ValentineSpeechContext = {
  eventType?: ValentineSpeechEvent;
  priority?: ValentineSpeechPriority;
  ballScreen?: { x: number; y: number };
  showBubble?: boolean;
  waitForPlayback?: boolean;
  interactionId?: number | string;
};

export type ValentineSpeechResult = {
  ok: boolean;
  text: string;
  durationMs: number;
  hadAudio: boolean;
  source: 'elevenlabs' | 'cache' | 'text-only' | 'skipped';
  message?: string;
};

const BUBBLE_MIN_MS = 5000;
const BUBBLE_TAIL_MS = 300;

let inFlightByText = new Map<string, Promise<ValentineSpeechResult>>();

export function mapDialogueSituationToSpeechEvent(situation: DialogueSituation): ValentineSpeechEvent {
  switch (situation) {
    case 'lowTrust':
      return 'lowTrust';
    case 'highResentment':
    case 'resentmentSpike':
      return 'resentment';
    case 'longRally':
      return 'longRally';
    case 'nearMiss':
    case 'nearMissReaction':
      return 'nearMiss';
    case 'praiseDemand':
      return 'praise';
    case 'strategyRethink':
      return 'strategy';
    default:
      return 'hoverPrompt';
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function estimateDurationMs(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1800, Math.min(7000, words * 280));
}

function mapPriority(
  eventType: ValentineSpeechEvent,
  priority: ValentineSpeechPriority
): SpeechPriority {
  if (eventType === 'opening' || eventType === 'postMatch') {
    return eventType === 'opening' ? 'matchIntro' : 'matchOutro';
  }
  if (eventType === 'hoverPrompt' || eventType === 'typedResponse' || eventType === 'responseReaction') {
    return eventType === 'hoverPrompt' ? 'hoverPrompt' : 'emotionalResponse';
  }
  if (eventType === 'scoreReaction' || eventType === 'missReaction') return 'scoreReaction';
  if (priority === 'high') return 'reaction';
  if (priority === 'low') return 'ambientBark';
  return 'reaction';
}

function mapCategory(eventType: ValentineSpeechEvent): SpeechCategory {
  return mapPriority(eventType, 'medium');
}

async function speakValentineLineInternal(
  text: string,
  context: ValentineSpeechContext
): Promise<ValentineSpeechResult> {
  const normalized = normalizeText(text);
  if (!normalized) {
    return { ok: false, text: '', durationMs: 0, hadAudio: false, source: 'skipped' };
  }

  const eventType = context.eventType ?? 'other';
  const showBubble = context.showBubble !== false;
  const ballScreen = context.ballScreen;
  const priority = mapPriority(eventType, context.priority ?? 'medium');

  if (showBubble) {
    uiManager.showBallComment(normalized, 120000, ballScreen);
  }

  await voiceDirector.ensureAudioReady();

  const played = await voiceDirector.speak({
    characterId: 'valentine',
    speakerId: 'ball:valentine',
    speakerKind: 'ball',
    text: normalized,
    priority,
    category: mapCategory(eventType),
    interactionId: context.interactionId,
    interruptible: priority !== 'emotionalResponse',
    dedupeKey: `valentine:${eventType}:${normalized.toLowerCase()}`,
    metadata: { eventType },
  });

  const durationMs = played.durationMs || estimateDurationMs(normalized);
  const bubbleMs = Math.max(BUBBLE_MIN_MS, durationMs + BUBBLE_TAIL_MS);
  if (showBubble) {
    uiManager.showBallComment(normalized, bubbleMs, ballScreen);
  }

  if (context.waitForPlayback !== false) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, bubbleMs));
  }

  return {
    ok: played.ok && !played.cancelled,
    text: normalized,
    durationMs: bubbleMs,
    hadAudio: played.ok && !played.cancelled,
    source: played.ok ? 'elevenlabs' : played.cancelled ? 'skipped' : 'text-only',
    message: played.message,
  };
}

export async function speakValentineLine(
  text: string,
  context: ValentineSpeechContext = {}
): Promise<ValentineSpeechResult> {
  const normalized = normalizeText(text);
  const dedupeKey = normalized.toLowerCase();
  const existing = inFlightByText.get(dedupeKey);
  if (existing) return existing;

  const promise = speakValentineLineInternal(normalized, context).finally(() => {
    inFlightByText.delete(dedupeKey);
  });
  inFlightByText.set(dedupeKey, promise);
  return promise;
}

export function stopValentineSpeech(): void {
  voiceDirector.cancelCharacter('valentine');
}
