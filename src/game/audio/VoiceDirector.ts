/**
 * VoiceDirector — the only system allowed to start character voice playback.
 *
 * Responsibilities: queue, priority, interruption, dedupe, stale interaction
 * guards, AbortController for TTS fetches, and lifecycle cleanup.
 * Sound effects / music remain independent via SoundManager.
 */

import Phaser from 'phaser';
import { resolveSpeakerKind } from '../data/characterVoices';
import { speechPlaybackEngine, type SpeechPlaybackEngine } from './SpeechPlaybackEngine';
import {
  SPEECH_PRIORITY_RANK,
  type NormalizedSpeechRequest,
  type SpeechEndEvent,
  type SpeechPriority,
  type SpeechRequest,
  type SpeechStartEvent,
  type SpeakerRef,
  type VoiceSpeakResult,
} from './speechTypes';

type QueuedItem = {
  request: NormalizedSpeechRequest;
  resolve: (result: VoiceSpeakResult) => void;
  abortController: AbortController;
  settled: boolean;
};

const DEV_LOG = import.meta.env.DEV;

let nextRequestId = 1;

function logVoice(message: string, details?: Record<string, unknown>): void {
  if (!DEV_LOG) return;
  if (details) {
    console.log(`[VoiceDirector] ${message}`, details);
    return;
  }
  console.log(`[VoiceDirector] ${message}`);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function canInterrupt(active: SpeechPriority, incoming: SpeechPriority): boolean {
  // rallyBark / ambientBark never interrupt anything important.
  if (incoming === 'rallyBark' || incoming === 'ambientBark') return false;
  return SPEECH_PRIORITY_RANK[incoming] > SPEECH_PRIORITY_RANK[active];
}

export class VoiceDirector extends Phaser.Events.EventEmitter {
  private queue: QueuedItem[] = [];
  private current: QueuedItem | null = null;
  private processing = false;
  private destroyed = false;
  private currentInteractionId: number | string | null = null;

  constructor(private readonly playback: SpeechPlaybackEngine = speechPlaybackEngine) {
    super();
  }

  async ensureAudioReady(): Promise<void> {
    if (this.destroyed) return;
    await this.playback.resume();
  }

  /** Mark the active Emotional Inventory / hover interaction for stale checks. */
  setCurrentInteractionId(interactionId: number | string | null): void {
    this.currentInteractionId = interactionId;
  }

  getCurrentInteractionId(): number | string | null {
    return this.currentInteractionId;
  }

  getCurrentSpeakerId(): string | null {
    return this.current?.request.speakerId ?? null;
  }

  getCurrentCharacterId(): string | null {
    return this.current?.request.characterId ?? null;
  }

  getWaveformSamples(sampleCount: number): number[] {
    return this.playback.getWaveformSamples(sampleCount);
  }

  /** Smoothed 0–1 speech energy from the shared analyser (or temporary envelope). */
  getSpeechEnergy(): number {
    return this.playback.getSpeechEnergy();
  }

  isSpeechPlaybackActive(): boolean {
    return this.playback.isPlaybackActive();
  }

  /**
   * Submit a character speech request. Resolves when that request finishes,
   * is cancelled, dropped, or fails. Never plays prerecorded dialogue.
   */
  speak(request: SpeechRequest): Promise<VoiceSpeakResult> {
    if (this.destroyed) {
      return Promise.resolve({
        ok: false,
        durationMs: 0,
        cancelled: true,
        requestId: request.id ?? 'destroyed',
        message: 'VoiceDirector destroyed',
      });
    }

    const normalized = this.normalizeRequest(request);
    if (!normalized.text) {
      return Promise.resolve({
        ok: false,
        durationMs: 0,
        cancelled: false,
        requestId: normalized.id,
        message: 'Empty text',
      });
    }

    if (
      normalized.interactionId !== undefined &&
      this.currentInteractionId !== null &&
      normalized.interactionId !== this.currentInteractionId
    ) {
      logVoice('speech request dropped as stale', {
        requestId: normalized.id,
        interactionId: normalized.interactionId,
        currentInteractionId: this.currentInteractionId,
      });
      normalized.onCancel?.();
      return Promise.resolve({
        ok: false,
        durationMs: 0,
        cancelled: true,
        requestId: normalized.id,
        message: 'Stale interaction',
      });
    }

    if (normalized.dedupeKey && this.hasDedupeKey(normalized.dedupeKey)) {
      logVoice('speech request dropped as duplicate', {
        requestId: normalized.id,
        dedupeKey: normalized.dedupeKey,
      });
      return Promise.resolve({
        ok: false,
        durationMs: 0,
        cancelled: true,
        requestId: normalized.id,
        message: 'Duplicate dedupeKey',
      });
    }

    this.pruneQueueForIncoming(normalized);

    if (
      this.current &&
      canInterrupt(this.current.request.priority, normalized.priority)
    ) {
      logVoice('speech interrupted by higher priority', {
        active: this.current.request.id,
        incoming: normalized.id,
        activePriority: this.current.request.priority,
        incomingPriority: normalized.priority,
      });
      // Abort in-flight playback; its finally block resolves and drains the queue.
      if (!this.current.abortController.signal.aborted) {
        this.current.abortController.abort();
      }
      this.playback.stop();
    }

    return new Promise<VoiceSpeakResult>((resolve) => {
      const abortController = new AbortController();
      this.queue.push({ request: normalized, resolve, abortController, settled: false });
      this.sortQueue();
      logVoice('speech request queued', {
        requestId: normalized.id,
        characterId: normalized.characterId,
        category: normalized.category,
        priority: normalized.priority,
        text: normalized.text.slice(0, 80),
      });
      void this.processQueue();
    });
  }

  cancelRequest(requestId: string): void {
    this.queue = this.queue.filter((item) => {
      if (item.request.id !== requestId) return true;
      this.finishCancelled(item, 'Cancelled by request id');
      return false;
    });

    // Abort active playback; processQueue finally exclusively clears current.
    if (this.current?.request.id === requestId) {
      this.abortItem(this.current, 'Cancelled by request id');
      this.playback.stop();
    }
  }

  cancelInteraction(interactionId: number | string): void {
    this.queue = this.queue.filter((item) => {
      if (item.request.interactionId !== interactionId) return true;
      this.finishCancelled(item, 'Cancelled by interaction id');
      return false;
    });

    if (this.current?.request.interactionId === interactionId) {
      this.abortItem(this.current, 'Cancelled by interaction id');
      this.playback.stop();
    }

    if (this.currentInteractionId === interactionId) {
      this.currentInteractionId = null;
    }
  }

  cancelCharacter(characterId: string): void {
    this.queue = this.queue.filter((item) => {
      if (item.request.characterId !== characterId) return true;
      this.finishCancelled(item, 'Cancelled by character id');
      return false;
    });

    if (this.current?.request.characterId === characterId) {
      this.abortItem(this.current, 'Cancelled by character id');
      this.playback.stop();
    }
  }

  clearQueue(): void {
    for (const item of this.queue) {
      this.finishCancelled(item, 'Queue cleared');
    }
    this.queue = [];
  }

  stopAll(): void {
    this.clearQueue();
    if (this.current) {
      this.abortItem(this.current, 'stopAll');
      this.playback.stop();
      // Do not null current here — processQueue finally owns that reset.
    } else {
      this.processing = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.stopAll();
    this.currentInteractionId = null;
    this.removeAllListeners();
  }

  /** @deprecated Use speak() — kept briefly for migration aliases. */
  enqueueAndWait(legacy: {
    id: string;
    turnId: string;
    speaker: SpeakerRef;
    text: string;
    priority: number;
    interruptible: boolean;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: boolean; durationMs: number }> {
    const priority = this.legacyPriorityToNamed(legacy.priority);
    return this.speak({
      id: legacy.id,
      characterId: legacy.speaker.characterId,
      speakerId: legacy.speaker.id,
      speakerKind: legacy.speaker.kind,
      text: legacy.text,
      priority,
      category: this.priorityToCategory(priority),
      turnId: legacy.turnId,
      interruptible: legacy.interruptible,
      metadata: legacy.metadata,
    }).then((result) => ({ ok: result.ok, durationMs: result.durationMs }));
  }

  /** @deprecated Use cancelInteraction / clearQueue. */
  cancelTurn(turnId: string, stopCurrent = true): void {
    this.queue = this.queue.filter((item) => {
      if (item.request.turnId !== turnId) return true;
      this.finishCancelled(item, 'Cancelled by turn id');
      return false;
    });
    if (stopCurrent && this.current?.request.turnId === turnId) {
      this.abortItem(this.current, 'Cancelled by turn id');
      this.playback.stop();
    }
  }

  private legacyPriorityToNamed(priority: number): SpeechPriority {
    if (priority >= 2) return 'emotionalResponse';
    if (priority >= 1) return 'reaction';
    return 'ambientBark';
  }

  private priorityToCategory(priority: SpeechPriority): SpeechRequest['category'] {
    return priority;
  }

  private normalizeRequest(request: SpeechRequest): NormalizedSpeechRequest {
    const id = request.id ?? `voice-${++nextRequestId}`;
    const speakerKind = request.speakerKind ?? resolveSpeakerKind(request.characterId);
    const speakerId = request.speakerId ?? request.characterId;
    return {
      ...request,
      id,
      text: normalizeText(request.text),
      speakerId,
      speakerKind,
      interruptible: request.interruptible ?? true,
      turnId: request.turnId ?? id,
    };
  }

  private hasDedupeKey(dedupeKey: string): boolean {
    if (this.current?.request.dedupeKey === dedupeKey) return true;
    return this.queue.some((item) => item.request.dedupeKey === dedupeKey);
  }

  private pruneQueueForIncoming(incoming: NormalizedSpeechRequest): void {
    // At most one pending rally bark per character.
    if (incoming.category === 'rallyBark') {
      this.queue = this.queue.filter((item) => {
        if (
          item.request.category === 'rallyBark' &&
          item.request.characterId === incoming.characterId
        ) {
          this.finishCancelled(item, 'Replaced by newer rally bark');
          return false;
        }
        return true;
      });
    }

    // At most one pending ambient bark total.
    if (incoming.category === 'ambientBark') {
      this.queue = this.queue.filter((item) => {
        if (item.request.category === 'ambientBark') {
          this.finishCancelled(item, 'Replaced by newer ambient bark');
          return false;
        }
        return true;
      });
    }

    // Drop stale low-priority score reactions if another for same character exists.
    if (incoming.category === 'scoreReaction') {
      this.queue = this.queue.filter((item) => {
        if (
          item.request.category === 'scoreReaction' &&
          item.request.characterId === incoming.characterId
        ) {
          this.finishCancelled(item, 'Replaced by newer score reaction');
          return false;
        }
        return true;
      });
    }
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      const rankDelta =
        SPEECH_PRIORITY_RANK[b.request.priority] - SPEECH_PRIORITY_RANK[a.request.priority];
      if (rankDelta !== 0) return rankDelta;
      return 0; // preserve insertion order for equal priority
    });
  }

  private async processQueue(): Promise<void> {
    if (this.destroyed || this.processing || this.current || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    this.sortQueue();
    this.current = this.queue.shift()!;
    const active = this.current;
    const request = active.request;

    if (
      request.interactionId !== undefined &&
      this.currentInteractionId !== null &&
      request.interactionId !== this.currentInteractionId
    ) {
      logVoice('speech request dropped as stale', {
        requestId: request.id,
        interactionId: request.interactionId,
      });
      this.finishCancelled(active, 'Stale before start');
      this.current = null;
      this.processing = false;
      void this.processQueue();
      return;
    }

    const speaker: SpeakerRef = {
      id: request.speakerId,
      kind: request.speakerKind,
      characterId: request.characterId,
    };

    const startEvent: SpeechStartEvent = {
      requestId: request.id,
      characterId: request.characterId,
      speakerId: request.speakerId,
      speaker,
      turnId: request.turnId,
      category: request.category,
      priority: request.priority,
      text: request.text,
    };

    logVoice('speech request started', {
      requestId: request.id,
      characterId: request.characterId,
      category: request.category,
      text: request.text.slice(0, 80),
    });

    request.onStart?.();
    this.emit('speech:start', startEvent);

    let ok = false;
    let durationMs = 0;
    let cancelled = false;
    let message: string | undefined;

    try {
      const result = await this.playback.play({
        characterId: request.characterId,
        text: request.text,
        signal: active.abortController.signal,
      });

      if (result.source === 'aborted' || active.abortController.signal.aborted) {
        cancelled = true;
        message = 'Cancelled';
      } else {
        ok = result.ok || result.source === 'muted';
        durationMs = result.durationMs;
        message = result.message;
        if (!ok && message) {
          logVoice('TTS generation failure', {
            requestId: request.id,
            characterId: request.characterId,
            message,
          });
          request.onError?.(new Error(message));
        }
      }
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
      logVoice('TTS generation failure', {
        requestId: request.id,
        message,
      });
      request.onError?.(error);
    } finally {
      const endEvent: SpeechEndEvent = {
        requestId: request.id,
        characterId: request.characterId,
        speakerId: request.speakerId,
        speaker,
        turnId: request.turnId,
        category: request.category,
        priority: request.priority,
        ok,
        durationMs,
        cancelled,
      };

      if (cancelled) {
        logVoice('speech request cancelled', { requestId: request.id });
        request.onCancel?.();
      } else {
        logVoice('speech request completed', {
          requestId: request.id,
          ok,
          durationMs,
        });
        request.onComplete?.();
      }

      this.settleItem(active, {
        ok,
        durationMs,
        cancelled,
        requestId: request.id,
        message,
      });

      // Only clear if we still own the active slot — never wipe a newer request.
      if (this.current?.request.id === request.id) {
        this.current = null;
      }
      this.processing = false;
      this.emit('speech:end', endEvent);
      void this.processQueue();
    }
  }

  private abortItem(item: QueuedItem, reason: string): void {
    if (!item.abortController.signal.aborted) {
      item.abortController.abort();
    }
    // Active item: processQueue finally settles. Queue item: settle now.
    if (this.current !== item) {
      this.finishCancelled(item, reason);
    }
  }

  private settleItem(item: QueuedItem, result: VoiceSpeakResult): void {
    if (item.settled) return;
    item.settled = true;
    item.resolve(result);
  }

  private finishCancelled(item: QueuedItem, reason: string): void {
    if (item.settled) return;
    if (!item.abortController.signal.aborted) {
      item.abortController.abort();
    }
    logVoice('speech request cancelled', {
      requestId: item.request.id,
      reason,
    });
    item.request.onCancel?.();
    this.settleItem(item, {
      ok: false,
      durationMs: 0,
      cancelled: true,
      requestId: item.request.id,
      message: reason,
    });
  }

  /** Active request id for lifecycle diagnostics. */
  getActiveRequestId(): string | null {
    return this.current?.request.id ?? null;
  }
}

export const voiceDirector = new VoiceDirector();

/** @deprecated Prefer voiceDirector — alias during migration. */
export const speechDirector = voiceDirector;

/** @deprecated Prefer voiceDirector.speak request ids. */
export function createSpeechRequestId(prefix = 'speech'): string {
  nextRequestId += 1;
  return `${prefix}-${nextRequestId}`;
}
