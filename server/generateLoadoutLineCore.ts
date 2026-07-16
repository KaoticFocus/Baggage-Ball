import OpenAI from 'openai';

const MAX_TRIGGER = 280;
const MAX_RECENT = 8;

export type GenerateLoadoutLineRequest = {
  turnId: string;
  loadout: string;
  targetBallId: string;
  triggeringEvent: string;
  recentDialogue: string[];
  relationshipSnapshot: Record<string, number>;
  emotionalStateSnapshot: Record<string, number | string>;
};

export type GenerateLoadoutLineSuccess = {
  ok: true;
  turnId: string;
  playerLine: string;
  intensity: number;
  deliveryHints?: string[];
  source: 'openai' | 'fallback';
};

export type GenerateLoadoutLineFailure = {
  ok: false;
  error: string;
  turnId?: string;
};

export type GenerateLoadoutLineResponse =
  | GenerateLoadoutLineSuccess
  | GenerateLoadoutLineFailure;

export function parseGenerateLoadoutLineRequest(
  body: unknown
): GenerateLoadoutLineRequest | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as Record<string, unknown>;
  const turnId = String(raw.turnId ?? '').trim();
  const loadout = String(raw.loadout ?? '').trim();
  const targetBallId = String(raw.targetBallId ?? '').trim();
  const triggeringEvent = String(raw.triggeringEvent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TRIGGER);
  if (!turnId || !loadout || !targetBallId) return null;

  const recentDialogue = Array.isArray(raw.recentDialogue)
    ? raw.recentDialogue.map((line) => String(line).slice(0, 120)).slice(0, MAX_RECENT)
    : [];

  const relationshipSnapshot =
    raw.relationshipSnapshot && typeof raw.relationshipSnapshot === 'object'
      ? (raw.relationshipSnapshot as Record<string, number>)
      : {};
  const emotionalStateSnapshot =
    raw.emotionalStateSnapshot && typeof raw.emotionalStateSnapshot === 'object'
      ? (raw.emotionalStateSnapshot as Record<string, number | string>)
      : {};

  return {
    turnId,
    loadout,
    targetBallId,
    triggeringEvent,
    recentDialogue,
    relationshipSnapshot,
    emotionalStateSnapshot,
  };
}

function underWordLimit(value: unknown, limit: number): string {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, limit)
    .join(' ');
}

function fallbackLine(loadout: string): string {
  switch (loadout) {
    case 'apologize':
      return "I'm sorry. That one was on me.";
    case 'validate':
      return "You're allowed to feel that.";
    case 'challenge':
      return 'Own it. Stop rewriting the miss.';
    case 'flirt':
      return 'Careful. That intensity almost worked.';
    case 'mock':
      return 'Bold take for someone who just whiffed.';
    case 'reassure':
      return "I'm still here. Keep going.";
    case 'set-boundary':
      return "I can play. I won't absorb that.";
    case 'go-silent':
      return '';
    case 'deflect':
    default:
      return 'Interesting theory. Try again.';
  }
}

export async function handleGenerateLoadoutLineRequest(
  request: GenerateLoadoutLineRequest
): Promise<GenerateLoadoutLineResponse> {
  if (request.loadout === 'go-silent') {
    return {
      ok: true,
      turnId: request.turnId,
      playerLine: '',
      intensity: 0.2,
      deliveryHints: ['silent'],
      source: 'fallback',
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: true,
      turnId: request.turnId,
      playerLine: fallbackLine(request.loadout),
      intensity: 0.55,
      deliveryHints: ['steady'],
      source: 'fallback',
    };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      input: [
        {
          role: 'system',
          content:
            'You write short spoken lines for the player paddle in Baggage Ball. Return ONLY valid JSON.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Generate one short first-person statement the player paddle will speak aloud.',
            loadout: request.loadout,
            targetBallId: request.targetBallId,
            triggeringEvent: request.triggeringEvent,
            recentDialogue: request.recentDialogue,
            relationshipSnapshot: request.relationshipSnapshot,
            emotionalStateSnapshot: request.emotionalStateSnapshot,
            requiredShape: {
              playerLine: 'string, usually 4-14 words',
              intensity: 'number 0 to 1',
              deliveryHints: 'optional string array',
            },
            rules: [
              'Represent the selected emotional loadout without naming it.',
              'Address the immediate situation.',
              'Sound like a person speaking, not a narrator.',
              'Suitable for ElevenLabs speech.',
              'No exposition, brackets, stage directions, or game mechanics.',
              'Do not repeat recentDialogue lines.',
              'No profanity, sexual content, or real-world violence.',
              'Return only JSON.',
            ],
          }),
        },
      ],
    });

    const text = response.output_text || '';
    let parsed: {
      playerLine?: string;
      intensity?: number;
      deliveryHints?: string[];
    } | null = null;
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      parsed = null;
    }

    const playerLine = underWordLimit(parsed?.playerLine ?? fallbackLine(request.loadout), 18);
    const intensity =
      typeof parsed?.intensity === 'number'
        ? Math.max(0, Math.min(1, parsed.intensity))
        : 0.6;

    return {
      ok: true,
      turnId: request.turnId,
      playerLine,
      intensity,
      deliveryHints: Array.isArray(parsed?.deliveryHints)
        ? parsed!.deliveryHints!.map(String).slice(0, 4)
        : ['direct'],
      source: parsed?.playerLine ? 'openai' : 'fallback',
    };
  } catch (error) {
    console.error('[generate-loadout-line] failed', {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      ok: true,
      turnId: request.turnId,
      playerLine: fallbackLine(request.loadout),
      intensity: 0.55,
      deliveryHints: ['steady'],
      source: 'fallback',
    };
  }
}
