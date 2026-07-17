/**
 * Valentine speech helpers — thin wrappers over VoiceDirector.
 * No local audio playback; ElevenLabs only via VoiceDirector.
 * Captions manage their own timers; waitForPlayback waits only for VoiceDirector.
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
  /** When aborted, skip TTS and avoid post-teardown speech queues. */
  signal?: AbortSignal;
};

export type ValentineSpeechResult = {
  ok: boolean;
  text: string;
  durationMs: number;
  hadAudio: boolean;
  source: 'elevenlabs' | 'cache' | 'text-only' | 'skipped';
  message?: string;
};

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
  const showCaption = context.showBubble !== false;
  const priority = mapPriority(eventType, context.priority ?? 'medium');
  const captionMs = Math.max(2800, estimateDurationMs(normalized));

  if (context.signal?.aborted) {
    return {
      ok: false,
      text: normalized,
      durationMs: 0,
      hadAudio: false,
      source: 'skipped',
      message: 'Aborted before speak',
    };
  }

  if (showCaption) {
    uiManager.showBallComment(normalized, captionMs, context.ballScreen);
  }

  try {
    await voiceDirector.ensureAudioReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (import.meta.env.DEV) {
      console.warn('[ValentineSpeech] audio ready failed; continuing text-only', message);
    }
    return {
      ok: false,
      text: normalized,
      durationMs: 0,
      hadAudio: false,
      source: 'text-only',
      message,
    };
  }

  if (context.signal?.aborted) {
    return {
      ok: false,
      text: normalized,
      durationMs: 0,
      hadAudio: false,
      source: 'skipped',
      message: 'Aborted after audio ready',
    };
  }

  try {
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

    // waitForPlayback waits only for VoiceDirector — no extra caption timer.
    return {
      ok: played.ok && !played.cancelled,
      text: normalized,
      durationMs: played.durationMs || 0,
      hadAudio: played.ok && !played.cancelled,
      source: played.ok ? 'elevenlabs' : played.cancelled ? 'skipped' : 'text-only',
      message: played.message,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (import.meta.env.DEV) {
      console.warn('[ValentineSpeech] speak failed; continuing text-only', message);
    }
    return {
      ok: false,
      text: normalized,
      durationMs: 0,
      hadAudio: false,
      source: 'text-only',
      message,
    };
  }
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
  inFlightByText.clear();
}
