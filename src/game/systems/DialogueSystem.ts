import type { DialogueEvent, DialogueResponse, DialogueSituation } from '../types/DialogueTypes';
import type { BallStats } from '../types/BallTypes';
import {
  getEventsBySituation,
  getEventsForBall,
} from '../data/dialogueRegistry';
import { getHoverFallback } from '../data/hoverFallbackDialogues';
import {
  createRuntimeDialogueAdapter,
  type RuntimeDialogueAdapter,
  type RuntimeDialogueContext,
} from '../adapters/RuntimeDialogueAdapter';

export type DialogueCallback = (response: DialogueResponse, event: DialogueEvent) => void;

/** Stub adapter for future voice/TTS integration */
export interface VoiceAdapter {
  speak(text: string): void;
  listen(): Promise<string>;
}

export class StubVoiceAdapter implements VoiceAdapter {
  speak(text: string): void {
    console.log('[Voice Stub]', text);
  }

  async listen(): Promise<string> {
    return '[voice input stub]';
  }
}

/** Picks events from the local + generated dialogue matrix */
export interface DialogueProvider {
  pickEvent(
    ballId: string,
    situation: DialogueSituation,
    stats: BallStats
  ): DialogueEvent | null;
}

export class LocalDialogueProvider implements DialogueProvider {
  private usedEventIds = new Set<string>();

  pickEvent(
    ballId: string,
    situation: DialogueSituation,
    stats: BallStats
  ): DialogueEvent | null {
    let candidates = getEventsBySituation(ballId, situation);

    if (candidates.length === 0) {
      const fallbacks: DialogueSituation[] = [
        'randomHover',
        'accusation',
        'praiseDemand',
        'existentialCrisis',
        'clingyInterruption',
        'boredomComplaint',
        'strategyRethink',
      ];
      for (const fb of fallbacks) {
        candidates = getEventsBySituation(ballId, fb);
        if (candidates.length) break;
      }
    }

    if (stats.trust < 25 && Math.random() < 0.45) {
      const accusation = getEventsBySituation(ballId, 'accusation');
      if (accusation.length) candidates = accusation;
    }
    if (stats.resentment > 70 && Math.random() < 0.4) {
      const spike = getEventsBySituation(ballId, 'resentmentSpike');
      if (spike.length) candidates = spike;
    }
    if (stats.attachment > 80 && Math.random() < 0.4) {
      const clingy = getEventsBySituation(ballId, 'clingyInterruption');
      if (clingy.length) candidates = clingy;
    }

    const unused = candidates.filter((e) => !this.usedEventIds.has(e.id));
    const pool = unused.length > 0 ? unused : candidates;
    if (pool.length === 0) {
      return getHoverFallback(ballId, situation);
    }

    const event = pool[Math.floor(Math.random() * pool.length)];
    this.usedEventIds.add(event.id);
    return event;
  }

  reset(): void {
    this.usedEventIds.clear();
  }
}

export type DialogueSystemOptions = {
  voiceAdapter?: VoiceAdapter;
  provider?: LocalDialogueProvider;
  runtimeAdapter?: RuntimeDialogueAdapter;
  /** When true, tries runtime adapter before local matrix (future use) */
  useRuntimeAI?: boolean;
};

export class DialogueSystem {
  private voiceAdapter: VoiceAdapter;
  private provider: LocalDialogueProvider;
  private runtimeAdapter: RuntimeDialogueAdapter;
  private useRuntimeAI: boolean;

  constructor(options: DialogueSystemOptions = {}) {
    this.voiceAdapter = options.voiceAdapter ?? new StubVoiceAdapter();
    this.provider = options.provider ?? new LocalDialogueProvider();
    this.runtimeAdapter = options.runtimeAdapter ?? createRuntimeDialogueAdapter();
    this.useRuntimeAI = options.useRuntimeAI ?? false;
  }

  pickEvent(
    ballId: string,
    situation: DialogueSituation,
    stats: BallStats
  ): DialogueEvent | null {
    return this.provider.pickEvent(ballId, situation, stats);
  }

  /** Async pick — tries runtime adapter first when enabled, falls back to local matrix */
  async pickEventAsync(
    ballId: string,
    situation: DialogueSituation,
    stats: BallStats,
    context: RuntimeDialogueContext
  ): Promise<DialogueEvent | null> {
    if (this.useRuntimeAI && this.runtimeAdapter.isAvailable()) {
      const generated = await this.runtimeAdapter.generateEvent(context);
      if (generated) return generated;
    }
    return this.provider.pickEvent(ballId, situation, stats);
  }

  getModeSwitchEvent(ballId: string): DialogueEvent | null {
    const events = getEventsBySituation(ballId, 'modeSwitchToText');
    return events[0] ?? null;
  }

  speakBallLine(text: string, mode: 'voice' | 'text'): void {
    if (mode === 'voice') {
      // TODO: Route through VoiceSystem.speakBallLine when TTS ships.
      this.voiceAdapter.speak(text);
    }
  }

  /** Process free-text — tries runtime adapter, returns null if unavailable */
  async processTextInput(
    playerText: string,
    context: RuntimeDialogueContext
  ): Promise<DialogueResponse | null> {
    if (this.useRuntimeAI && this.runtimeAdapter.isAvailable()) {
      return this.runtimeAdapter.generateResponseFromText({ ...context, playerText });
    }
    return null;
  }

  getLocalEventCount(ballId?: string): number {
    return ballId ? getEventsForBall(ballId).length : getEventsForBall('orb').length;
  }

  reset(): void {
    this.provider.reset();
  }
}
