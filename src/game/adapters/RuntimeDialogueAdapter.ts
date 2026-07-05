import type { BallStats } from '../types/BallTypes';
import type {
  DialogueEvent,
  DialogueResponse,
  DialogueSituation,
  InputMode,
} from '../types/DialogueTypes';

/**
 * Context passed to a future runtime AI adapter (serverless / local LLM).
 * Never includes API keys — those live server-side only.
 */
export type RuntimeDialogueContext = {
  ballId: string;
  ballName: string;
  ballTitle: string;
  dialogueStyle: string;
  situation: DialogueSituation;
  stats: BallStats;
  mode: InputMode;
  /** Optional free-text from player in Text Mode */
  playerText?: string;
  /** Recent ball line if continuing a thread */
  ballLine?: string;
};

export type RuntimeDialogueAdapterConfig = {
  /** Future: URL to a serverless dialogue endpoint (Netlify, etc.) */
  endpointUrl?: string;
  /** When false, adapter never called — local matrix only */
  enabled?: boolean;
};

/**
 * Future runtime AI hook. Not required for gameplay.
 * Implementations call a backend; the browser never holds OPENAI_API_KEY.
 */
export interface RuntimeDialogueAdapter {
  readonly name: string;
  isAvailable(): boolean;
  generateEvent(context: RuntimeDialogueContext): Promise<DialogueEvent | null>;
  generateResponseFromText(
    context: RuntimeDialogueContext & { playerText: string }
  ): Promise<DialogueResponse | null>;
}

/** Default: no runtime AI. Game uses local dialogue matrix. */
export class StubRuntimeDialogueAdapter implements RuntimeDialogueAdapter {
  readonly name = 'stub';

  isAvailable(): boolean {
    return false;
  }

  async generateEvent(_context: RuntimeDialogueContext): Promise<DialogueEvent | null> {
    return null;
  }

  async generateResponseFromText(
    _context: RuntimeDialogueContext & { playerText: string }
  ): Promise<DialogueResponse | null> {
    return null;
  }
}

/**
 * Placeholder for a future serverless endpoint.
 * Example: POST /api/dialogue with { ballId, situation, stats, playerText }
 * Returns a DialogueEvent or DialogueResponse JSON payload.
 */
export class ServerlessRuntimeDialogueAdapter implements RuntimeDialogueAdapter {
  readonly name = 'serverless';

  constructor(private config: RuntimeDialogueAdapterConfig) {}

  isAvailable(): boolean {
    return Boolean(this.config.enabled && this.config.endpointUrl);
  }

  async generateEvent(context: RuntimeDialogueContext): Promise<DialogueEvent | null> {
    if (!this.isAvailable() || !this.config.endpointUrl) return null;

    try {
      const res = await fetch(this.config.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'event', ...context }),
      });
      if (!res.ok) return null;
      return (await res.json()) as DialogueEvent;
    } catch {
      return null;
    }
  }

  async generateResponseFromText(
    context: RuntimeDialogueContext & { playerText: string }
  ): Promise<DialogueResponse | null> {
    if (!this.isAvailable() || !this.config.endpointUrl) return null;

    try {
      const res = await fetch(this.config.endpointUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'response', ...context }),
      });
      if (!res.ok) return null;
      return (await res.json()) as DialogueResponse;
    } catch {
      return null;
    }
  }
}

export function createRuntimeDialogueAdapter(
  config: RuntimeDialogueAdapterConfig = {}
): RuntimeDialogueAdapter {
  if (config.enabled && config.endpointUrl) {
    return new ServerlessRuntimeDialogueAdapter(config);
  }
  return new StubRuntimeDialogueAdapter();
}
