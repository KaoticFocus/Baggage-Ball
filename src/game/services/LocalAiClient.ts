export type AiStatChanges = {
  trust: number;
  resentment: number;
  ego: number;
  chaos: number;
  attachment: number;
  dramaNeed: number;
  patience: number;
};

export type AiResponseClassification = {
  tone: string;
  emotionalResult: string;
  ballReaction: string;
  behaviorModifier: string;
  statChanges: Partial<AiStatChanges>;
};

export type AiRecap = {
  relationshipStatus: string;
  emotionalDiagnosis: string;
  finalNote: string;
  worstThingThePlayerDid: string;
  replayHook: string;
};

const BASE_URL = 'http://localhost:8787';

export class LocalAiError extends Error {
  constructor(
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'LocalAiError';
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LocalAiError('Local AI server unreachable. Is npm run dev:ai running?');
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) detail = errBody.error;
    } catch {
      /* ignore */
    }
    throw new LocalAiError(detail, res.status);
  }

  return (await res.json()) as T;
}

export async function checkAiHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function classifyPlayerResponse(payload: {
  ballName: string;
  ballPersonality: string;
  ballStats: AiStatChanges;
  ballLine: string;
  playerResponse: string;
  situation: string;
}): Promise<AiResponseClassification> {
  return postJson<AiResponseClassification>('/api/classify-response', payload);
}

export async function generateAiRecap(payload: {
  ballName: string;
  ballPersonality: string;
  finalStats: AiStatChanges;
  score: number;
  longestRally: number;
  recentEvents: string[];
  playerModeHistory: string[];
}): Promise<AiRecap> {
  return postJson<AiRecap>('/api/generate-recap', payload);
}
