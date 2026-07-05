#!/usr/bin/env npx tsx
/**
 * OFFLINE dialogue matrix generator — Node / Mac mini dev only.
 *
 * Usage:
 *   cp .env.example .env   # add OPENAI_API_KEY
 *   npm run generate:dialogue
 *
 * Options:
 *   --ball=orb|bolt|valentine|all   (default: all)
 *   --batch=3                       events per API call (default: 3)
 *   --model=gpt-4o-mini             (default: gpt-4o-mini)
 *   --dry-run                       print summary, don't write file
 *
 * NEVER import this script or OPENAI_API_KEY into Vite/browser code.
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { config } from 'dotenv';
import { validateDialogueBatch, VALID_SITUATIONS } from './validateDialogue.js';
import type { DialogueEvent, DialogueSituation } from '../src/game/types/DialogueTypes';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(ROOT, 'src/game/data/generatedDialogueEvents.ts');

config({ path: resolve(ROOT, '.env') });

type BallSpec = {
  id: string;
  name: string;
  title: string;
  description: string;
  dialogueStyle: string;
  /** Situations to generate, with count per situation */
  plan: Partial<Record<DialogueSituation, number>>;
};

const BALL_SPECS: BallSpec[] = [
  {
    id: 'orb',
    name: 'Orb',
    title: 'Diva Existentialist',
    description: 'A bored, theatrical ball that believes bouncing is performance art.',
    dialogueStyle: 'Theatrical, pretentious, demands praise and drama.',
    plan: {
      randomHover: 3,
      existentialCrisis: 2,
      praiseDemand: 2,
      accusation: 1,
      strategyRethink: 1,
      boredomComplaint: 1,
      nearMissReaction: 1,
      modeSwitchToText: 1,
    },
  },
  {
    id: 'bolt',
    name: 'Bolt',
    title: 'Moody Bad-Day Ball',
    description: 'An irritated ball having a terrible day. It does not want your energy.',
    dialogueStyle: 'Short, irritable, allergic to enthusiasm.',
    plan: {
      randomHover: 3,
      boredomComplaint: 2,
      accusation: 2,
      resentmentSpike: 1,
      nearMissReaction: 1,
      longRally: 1,
      modeSwitchToText: 1,
      existentialCrisis: 1,
    },
  },
  {
    id: 'valentine',
    name: 'Valentine',
    title: 'Over-Attached Ex-Ball',
    description: 'A melodramatic ex-ball who remembers that you stopped playing and has questions.',
    dialogueStyle: 'Melodramatic, clingy, emotionally loaded, streamer-worthy volatility.',
    plan: {
      clingyInterruption: 4,
      accusation: 3,
      randomHover: 3,
      resentmentSpike: 2,
      nearMissReaction: 2,
      modeSwitchToText: 1,
      praiseDemand: 1,
      longRally: 1,
      lowTrust: 1,
    },
  },
];

function parseArgs(): {
  ball: string;
  batchSize: number;
  model: string;
  dryRun: boolean;
} {
  const args = process.argv.slice(2);
  let ball = 'all';
  let batchSize = 3;
  let model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  let dryRun = false;

  for (const arg of args) {
    if (arg.startsWith('--ball=')) ball = arg.split('=')[1];
    else if (arg.startsWith('--batch=')) batchSize = Math.max(1, parseInt(arg.split('=')[1], 10));
    else if (arg.startsWith('--model=')) model = arg.split('=')[1];
    else if (arg === '--dry-run') dryRun = true;
  }

  return { ball, batchSize, model, dryRun };
}

function buildPrompt(ball: BallSpec, situations: DialogueSituation[], count: number): string {
  return `You are writing dialogue for BAGGAGE BALL, a dark comedy arcade game where the ball is sentient and emotionally unstable.

BALL: ${ball.name} — ${ball.title}
DESCRIPTION: ${ball.description}
VOICE: ${ball.dialogueStyle}

Generate exactly ${count} dialogue events for situations: ${situations.join(', ')}.

RULES:
- ballLine: the ball speaks (first person, in character, funny, emotionally unstable)
- Each event has EXACTLY 4 player response options
- Player lines must be FULL SENTENCES the human would say — NOT generic buttons like [Apologize] or [Insult]
- Mix tones: sincere, sarcastic, absurd, boundary, flattering, provoking
- statChanges: partial object with keys trust, resentment, ego, chaos, attachment, dramaNeed, patience — values from -30 to +30
- ballReaction: ball's reply after player choice (short, in character)
- emotionalResult: short UI label like "Valentine softens." or "Orb is theatrically pleased."
- behaviorModifier (optional): one of helpfulCurve, hostileFakeOut, erraticBounce, speedSpike, slowDown, fakeOut, gentleReturn, dramaticPause, clingyDrift, resentmentShot, chaosWobble, speedUp
- id: lowercase kebab-case, prefix with "${ball.id}-gen-", unique within batch
- ballIds: ["${ball.id}"]

EXAMPLE PLAYER LINES (style reference):
- "I'm at work, and you are already hard to explain."
- "You're not being ignored. You're being subtitled."
- "I brought a paddle, not a license to practice therapy."
- "You were a very formative circle."

Return JSON: { "events": [ ... ] }
Valid situations: ${VALID_SITUATIONS.join(', ')}`;
}

async function generateBatch(
  client: OpenAI,
  model: string,
  ball: BallSpec,
  situations: DialogueSituation[]
): Promise<DialogueEvent[]> {
  const prompt = buildPrompt(ball, situations, situations.length);

  const completion = await client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You write darkly funny arcade game dialogue. Output valid JSON only. Player response choices must be witty full sentences.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.95,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error('Empty OpenAI response');

  const parsed = JSON.parse(content) as unknown;
  return validateDialogueBatch(parsed, ball.id);
}

function flattenPlan(plan: BallSpec['plan']): DialogueSituation[] {
  const list: DialogueSituation[] = [];
  for (const [situation, count] of Object.entries(plan)) {
    for (let i = 0; i < (count ?? 0); i++) {
      list.push(situation as DialogueSituation);
    }
  }
  return list;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

function loadExistingGenerated(): DialogueEvent[] {
  if (!existsSync(OUTPUT_PATH)) return [];
  try {
    const src = readFileSync(OUTPUT_PATH, 'utf8');
    const match = src.match(/GENERATED_DIALOGUE_EVENTS[^=]*=\s*(\[[\s\S]*?\]);/);
    if (!match) return [];
    return JSON.parse(match[1]) as DialogueEvent[];
  } catch {
    return [];
  }
}

function writeOutputFile(events: DialogueEvent[], model: string): void {
  const meta = {
    generatedAt: new Date().toISOString(),
    model,
    eventCount: events.length,
  };

  const rawEvents = events.map((e) => ({
    id: e.id,
    ballId: e.ballIds?.[0] ?? 'orb',
    situation: e.situation,
    ballLine: e.ballLine,
    responses: e.responses.map((r) => ({
      text: r.text,
      tone: r.tone,
      statChanges: r.statChanges,
      ballReaction: r.ballReaction,
      emotionalResult: r.emotionalResult,
      behaviorModifier: r.behaviorModifier ?? 'none',
    })),
  }));

  const file = `/**
 * AUTO-GENERATED by scripts/generateDialogueMatrix.ts
 * Do not edit by hand — re-run: npm run ai:generate-dialogue
 *
 * Generated: ${meta.generatedAt}
 * Model: ${meta.model}
 * Events: ${meta.eventCount}
 */

export const GENERATED_DIALOGUE_META = ${JSON.stringify(meta, null, 2)} as const;

export const generatedDialogueEvents = ${JSON.stringify(rawEvents, null, 2)} as const;

/** Normalized for DialogueSystem */
import type { DialogueEvent } from '../types/DialogueTypes';

export const GENERATED_DIALOGUE_EVENTS: DialogueEvent[] = ${JSON.stringify(events, null, 2)};
`;

  writeFileSync(OUTPUT_PATH, file, 'utf8');
}

async function main(): Promise<void> {
  const { ball: ballFilter, batchSize, model, dryRun } = parseArgs();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(`
ERROR: OPENAI_API_KEY is not set.

This script runs locally on your Mac only — never in the browser.

Setup:
  1. cp .env.example .env
  2. Add OPENAI_API_KEY=sk-... to .env
  3. npm run generate:dialogue
`);
    process.exit(1);
  }

  const client = new OpenAI({ apiKey });

  const specs =
    ballFilter === 'all'
      ? BALL_SPECS
      : BALL_SPECS.filter((b) => b.id === ballFilter);

  if (specs.length === 0) {
    console.error(`Unknown ball: ${ballFilter}. Use orb, bolt, valentine, or all.`);
    process.exit(1);
  }

  const existing =
    ballFilter === 'all'
      ? []
      : loadExistingGenerated().filter((e) => !e.ballIds?.includes(ballFilter));

  const generated: DialogueEvent[] = [...existing];
  const seenIds = new Set(generated.map((e) => e.id));

  console.log(`\nBaggage Ball — Dialogue Matrix Generator`);
  console.log(`Model: ${model} | Batch size: ${batchSize} | Dry run: ${dryRun}\n`);

  for (const spec of specs) {
    const situations = flattenPlan(spec.plan);
    const batches = chunk(situations, batchSize);
    console.log(`Generating ${situations.length} events for ${spec.name} (${batches.length} batches)...`);

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      process.stdout.write(`  Batch ${i + 1}/${batches.length} [${batch.join(', ')}]... `);

      try {
        const events = await generateBatch(client, model, spec, batch);
        for (const event of events) {
          if (seenIds.has(event.id)) {
            event.id = `${event.id}-${Date.now().toString(36)}`;
          }
          seenIds.add(event.id);
          generated.push(event);
        }
        console.log(`OK (${events.length} events)`);
      } catch (err) {
        console.log('FAILED');
        console.error(err);
        process.exit(1);
      }

      // Gentle rate limit between batches
      if (i < batches.length - 1) {
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  console.log(`\nTotal generated events: ${generated.length}`);

  if (dryRun) {
    console.log('Dry run — file not written.');
    return;
  }

  writeOutputFile(generated, model);
  console.log(`Written: ${OUTPUT_PATH}`);
  console.log('\nRestart dev server to load new dialogue. Game still works if you delete this file.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
