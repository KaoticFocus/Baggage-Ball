/**
 * Client helper for the Netlify classify-response function.
 * Never throws — returns a safe fallback on any network or parse failure.
 * API key lives server-side only.
 */

export type NetlifyClassifyResult = {
  ok: boolean;
  source: 'openai' | 'fallback' | 'stub';
  tone: string;
  playerResponse: string;
  emotionalResult: string;
  ballReaction: string;
  statChanges: {
    trust: number;
    resentment: number;
    ego: number;
    chaos: number;
    attachment: number;
    dramaNeed: number;
    patience: number;
  };
  behaviorModifier: string;
};

const CLASSIFY_URL = '/.netlify/functions/classify-response';
const TIMEOUT_MS = 6000;

const FALLBACK_RESULT: NetlifyClassifyResult = {
  ok: true,
  source: 'fallback',
  tone: 'uncertain',
  playerResponse: '',
  emotionalResult: 'The ball absorbed your words and made them its whole personality.',
  ballReaction: 'I heard you. I simply chose to process this privately.',
  statChanges: {
    trust: 1,
    resentment: 1,
    ego: 0,
    chaos: 1,
    attachment: 0,
    dramaNeed: 1,
    patience: -1,
  },
  behaviorModifier: 'none',
};

export async function classifyPlayerResponse(
  payload: {
    playerText: string;
    ballId: string;
    situation: string;
    responseModeId?: string;
    responseModeName?: string;
    responseModeDescription?: string;
  },
  options?: { signal?: AbortSignal }
): Promise<NetlifyClassifyResult> {
  if (options?.signal?.aborted) return FALLBACK_RESULT;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const res = await fetch(CLASSIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.warn(`[AI Classifier] HTTP ${res.status}, using fallback`);
      return FALLBACK_RESULT;
    }

    const data = (await res.json()) as NetlifyClassifyResult;
    return data;
  } catch {
    console.warn('[AI Classifier] unavailable, using fallback');
    return FALLBACK_RESULT;
  } finally {
    window.clearTimeout(timeoutId);
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }
}
