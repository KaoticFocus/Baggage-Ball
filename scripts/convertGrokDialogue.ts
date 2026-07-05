/**
 * Converts raw Grok dialogue JSON into generatedDialogueEvents.ts
 * Usage: npx tsx scripts/convertGrokDialogue.ts "/path/to/Response Matrix.txt"
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const STAT_KEYS = [
  'trust',
  'resentment',
  'ego',
  'chaos',
  'attachment',
  'dramaNeed',
  'patience',
] as const;

type StatKey = (typeof STAT_KEYS)[number];
type FullStats = Record<StatKey, number>;

type RawResponse = {
  playerLine: string;
  tone: string;
  statChanges: Record<string, number>;
  ballReaction: string;
  behaviorModifier: string;
};

type RawEvent = {
  ballId: string;
  situation: string;
  ballLine: string;
  responses: RawResponse[];
};

type RawMatrix = Record<string, RawEvent[]>;

const BALL_MAP: Record<string, 'orb' | 'bolt' | 'valentine'> = {
  Orb: 'orb',
  Bolt: 'bolt',
  Valentine: 'valentine',
};

function clampStat(value: number, key: StatKey, ballId: string): number {
  if (key === 'attachment' && ballId === 'valentine' && value > 0) {
    return Math.min(15, Math.max(-12, value));
  }
  return Math.min(12, Math.max(-12, value));
}

function mapBoredom(boredom: number, stats: Partial<FullStats>): void {
  if (boredom === 0) return;
  const magnitude = Math.min(12, Math.round(Math.abs(boredom) / 2));

  if (boredom < 0) {
    stats.dramaNeed = (stats.dramaNeed ?? 0) - Math.round(magnitude * 0.45);
    stats.trust = (stats.trust ?? 0) + Math.round(magnitude * 0.35);
    stats.patience = (stats.patience ?? 0) + Math.round(magnitude * 0.2);
  } else {
    stats.dramaNeed = (stats.dramaNeed ?? 0) + Math.round(magnitude * 0.4);
    stats.resentment = (stats.resentment ?? 0) + Math.round(magnitude * 0.35);
    stats.patience = (stats.patience ?? 0) - Math.round(magnitude * 0.25);
  }
}

function normalizeStats(raw: Record<string, number>, ballId: string): FullStats {
  const partial: Partial<FullStats> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'boredom') {
      mapBoredom(value, partial);
      continue;
    }
    if (STAT_KEYS.includes(key as StatKey)) {
      partial[key as StatKey] = (partial[key as StatKey] ?? 0) + value;
    }
  }

  const full = {} as FullStats;
  for (const key of STAT_KEYS) {
    full[key] = clampStat(partial[key] ?? 0, key, ballId);
  }
  return full;
}

function shortenReaction(text: string): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= 160) return cleaned;

  const chunk = cleaned.slice(0, 160);
  const breakAt = Math.max(
    chunk.lastIndexOf('. '),
    chunk.lastIndexOf('! '),
    chunk.lastIndexOf('? ')
  );
  if (breakAt > 50) {
    return chunk.slice(0, breakAt + 1).trim();
  }
  return `${chunk.slice(0, 157).trim()}...`;
}

function inferEmotionalResult(
  ballId: string,
  tone: string,
  stats: FullStats
): string {
  const names = { orb: 'Orb', bolt: 'Bolt', valentine: 'Valentine' } as const;
  const name = names[ballId as keyof typeof names] ?? 'The ball';

  if (ballId === 'orb') {
    if (tone === 'flattering' || stats.ego > 0 || stats.trust >= 8) {
      return 'Orb is theatrically pleased.';
    }
    if (tone === 'provoking' || stats.resentment >= 8) {
      return 'Orb grows offended.';
    }
    if (stats.trust <= -8) return 'Orb narrows its spotlight.';
    return 'Orb will cite this in the memoir.';
  }

  if (ballId === 'bolt') {
    if (tone === 'sincere' || tone === 'tender' || stats.trust >= 8) {
      return 'Bolt becomes slightly less impossible.';
    }
    if (tone === 'boundary' || tone === 'absurd') {
      return 'Bolt appreciates the lack of forced optimism.';
    }
    if (stats.resentment >= 8) return "Bolt's resentment hardens.";
    return 'Bolt will remember that at 4pm.';
  }

  if (stats.trust >= 10 && (tone === 'tender' || tone === 'sincere' || tone === 'apologetic')) {
    return 'Valentine softens dangerously.';
  }
  if (stats.trust <= -5 || stats.resentment >= 10 || tone === 'boundary') {
    return 'Valentine grows suspicious.';
  }
  if (stats.attachment >= 10) return 'Valentine will absolutely remember that.';
  return `${name} spirals a little.`;
}

function convertEvent(event: RawEvent, ballId: string, index: number) {
  const id = `gen-${ballId}-${event.situation}-${String(index + 1).padStart(2, '0')}`;

  return {
    id,
    ballId,
    situation: event.situation,
    ballLine: event.ballLine,
    responses: event.responses.map((r) => {
      const statChanges = normalizeStats(r.statChanges, ballId);
      return {
        text: r.playerLine,
        tone: r.tone,
        statChanges,
        ballReaction: shortenReaction(r.ballReaction),
        emotionalResult: inferEmotionalResult(ballId, r.tone, statChanges),
        behaviorModifier: r.behaviorModifier || 'none',
      };
    }),
  };
}

function main(): void {
  const inputPath =
    process.argv[2] ??
    '/Users/keithblay_1/Downloads/Response Matrix.txt';
  const outputPath = resolve(
    import.meta.dirname,
    '../src/game/data/generatedDialogueEvents.ts'
  );

  const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as RawMatrix;
  const events: ReturnType<typeof convertEvent>[] = [];

  for (const [ballName, ballEvents] of Object.entries(raw)) {
    const ballId = BALL_MAP[ballName];
    if (!ballId) {
      throw new Error(`Unknown ball: ${ballName}`);
    }
    ballEvents.forEach((event, index) => {
      events.push(convertEvent(event, ballId, index));
    });
  }

  const file = `/**
 * Grok-generated dialogue matrix (cleaned & normalized).
 * Source: Response Matrix.txt
 * Regenerate: npx tsx scripts/convertGrokDialogue.ts
 */
export const GENERATED_DIALOGUE_META = {
  generatedAt: ${JSON.stringify(new Date().toISOString())},
  model: 'grok',
  eventCount: ${events.length},
} as const;

export const generatedDialogueEvents = ${JSON.stringify(events, null, 2)} as const;
`;

  writeFileSync(outputPath, file, 'utf8');
  console.log(`Wrote ${events.length} events to ${outputPath}`);
}

main();
