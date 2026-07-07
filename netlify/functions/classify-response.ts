import type { Handler } from "@netlify/functions";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function safeParseJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }),
    };
  }

  const body = event.body ? JSON.parse(event.body) : {};
  const playerText = String(body.playerText || "").slice(0, 500);
  const ballId = String(body.ballId || "unknown");
  const situation = String(body.situation || "hoverResponse");

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-5.4-mini",
    input: [
      {
        role: "system",
        content:
          "You are the Baggage Ball response classifier. Return ONLY valid JSON. No markdown. No commentary."
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Classify the player's response to an emotionally unstable sentient arcade ball.",
          playerText,
          ballId,
          situation,
          requiredShape: {
            ok: true,
            source: "openai",
            tone: "string",
            emotionalResult: "string",
            ballReaction: "string",
            statChanges: {
              trust: "number -10 to 10",
              resentment: "number -10 to 10",
              ego: "number -10 to 10",
              chaos: "number -10 to 10",
              attachment: "number -10 to 10",
              dramaNeed: "number -10 to 10",
              patience: "number -10 to 10"
            },
            behaviorModifier: "none | speedUp | slowDown | fakeOut | clingyHover | chaosWobble"
          },
          rules: [
            "Keep ballReaction short, funny, and in-character.",
            "Do not include profanity.",
            "Do not include sexual content.",
            "Do not include threats of real harm.",
            "Return only JSON."
          ]
        })
      }
    ],
  });

  const text = response.output_text || "";
  const parsed = safeParseJson(text);

  if (!parsed) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        source: "fallback",
        tone: "uncertain",
        emotionalResult: "The ball processed your words and made them about itself.",
        ballReaction: "I heard you. I simply chose to suffer differently.",
        statChanges: {
          trust: 1,
          resentment: 1,
          ego: 0,
          chaos: 1,
          attachment: 0,
          dramaNeed: 1,
          patience: -1
        },
        behaviorModifier: "none"
      }),
    };
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      source: "openai",
      ...parsed
    }),
  };
};
