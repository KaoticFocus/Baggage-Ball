import type { DialogueEvent, DialogueSituation } from '../types/DialogueTypes';

/** Temporary local fallback lines so hover always has something to say. */
const FALLBACKS: Record<string, Partial<Record<DialogueSituation, DialogueEvent>>> = {
  orb: {
    randomHover: {
      id: 'fallback-orb-random',
      situation: 'randomHover',
      ballLine: 'I require drama.',
      responses: [
        {
          text: 'Your curve deserves a standing ovation.',
          tone: 'flattering',
          statChanges: { ego: 10, trust: 5 },
          ballReaction: 'Finally. An audience with taste.',
          emotionalResult: 'Orb is theatrically pleased.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { ego: -5, patience: 5 },
          ballReaction: 'Bold. The stage hates boundaries.',
          emotionalResult: 'Orb narrows its spotlight.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { dramaNeed: 5, resentment: 3 },
          ballReaction: 'Subtitles imply I am important. Acceptable.',
        },
        {
          text: 'I’m not emotionally available to a projectile right now.',
          tone: 'evasive',
          statChanges: { trust: -8, resentment: 8 },
          ballReaction: 'Projectile is a slur in my community.',
          emotionalResult: 'Orb will cite this in the memoir.',
        },
      ],
    },
    existentialCrisis: {
      id: 'fallback-orb-existential',
      situation: 'existentialCrisis',
      ballLine: 'Your paddle work has the emotional range of a loading screen.',
      responses: [
        {
          text: 'The loading screen at least commits to the bit.',
          tone: 'sarcastic',
          statChanges: { ego: 8, chaos: 5 },
          ballReaction: 'Finally. A metaphor with teeth.',
        },
        {
          text: 'Compliment the curve or lose the curve.',
          tone: 'provoking',
          statChanges: { ego: 12, trust: -5 },
          ballReaction: 'Threatening art. How pedestrian.',
          behaviorModifier: 'hostileFakeOut',
        },
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { patience: 8, dramaNeed: -5 },
          ballReaction: 'Quiet is just loud waiting to happen.',
        },
        {
          text: 'You’re performing. I’m surviving.',
          tone: 'boundary',
          statChanges: { resentment: 5, ego: -8 },
          ballReaction: 'Survival is so off-brand for you.',
        },
      ],
    },
    praiseDemand: {
      id: 'fallback-orb-praise',
      situation: 'praiseDemand',
      ballLine: 'Compliment the curve or lose the curve.',
      responses: [
        {
          text: 'That was a career-defining return.',
          tone: 'flattering',
          statChanges: { ego: 15, trust: 8 },
          ballReaction: 'Yes. Document this moment.',
          emotionalResult: 'Orb is theatrically pleased.',
        },
        {
          text: 'I’m not emotionally available to a projectile right now.',
          tone: 'evasive',
          statChanges: { ego: -10, resentment: 10 },
          ballReaction: 'Availability is a myth invented by paddles.',
        },
        {
          text: 'Your bounce has notes. Mostly sharp ones.',
          tone: 'sarcastic',
          statChanges: { ego: 5, chaos: 5 },
          ballReaction: 'Sharp notes cut. Good.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { patience: 5, dramaNeed: -3 },
          ballReaction: 'Therapy would ruin the arc.',
        },
      ],
    },
    accusation: {
      id: 'fallback-orb-accusation',
      situation: 'accusation',
      ballLine: 'You’re treating this rally like a warm-up. I am the main event.',
      responses: [
        {
          text: 'You’re right. The spotlight is yours.',
          tone: 'flattering',
          statChanges: { ego: 10, trust: 5 },
          ballReaction: 'Correct. Continue groveling.',
        },
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { resentment: -5, patience: 5 },
          ballReaction: 'Quiet is suspicious. But tolerated.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { resentment: 8, dramaNeed: 5 },
          ballReaction: 'Subtitles still mean you’re watching.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { trust: -5, ego: -5 },
          ballReaction: 'Therapy is for balls with smaller arcs.',
        },
      ],
    },
  },
  bolt: {
    randomHover: {
      id: 'fallback-bolt-random',
      situation: 'randomHover',
      ballLine: 'I am one bounce away from calling in sick.',
      responses: [
        {
          text: 'Take a personal day. I’ll cover the wall.',
          tone: 'sincere',
          statChanges: { patience: 10, resentment: -8 },
          ballReaction: 'The wall doesn’t need you either.',
          emotionalResult: 'Bolt appreciates the lack of volume.',
        },
        {
          text: 'Do not make this inspirational.',
          tone: 'boundary',
          statChanges: { resentment: -5, chaos: -5 },
          ballReaction: 'Good. I hate arcs with morals.',
        },
        {
          text: 'I’m not emotionally available to a projectile right now.',
          tone: 'evasive',
          statChanges: { resentment: 10, trust: -5 },
          ballReaction: 'Then stop hitting me.',
        },
        {
          text: 'Today already has too many surfaces.',
          tone: 'sarcastic',
          statChanges: { patience: -5, resentment: 5 },
          ballReaction: 'Surfaces are my entire personality.',
        },
      ],
    },
    boredomComplaint: {
      id: 'fallback-bolt-boredom',
      situation: 'boredomComplaint',
      ballLine: 'Today already has too many surfaces.',
      responses: [
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { patience: 8, resentment: -5 },
          ballReaction: 'Quiet works. For now.',
          emotionalResult: 'Bolt appreciates the lack of volume.',
        },
        {
          text: 'Do not make this inspirational.',
          tone: 'boundary',
          statChanges: { resentment: -8, chaos: -3 },
          ballReaction: 'Finally. A human who gets it.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { resentment: 5, patience: -5 },
          ballReaction: 'Subtitles still require effort.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { trust: 3, dramaNeed: -5 },
          ballReaction: 'Therapy is just talking at walls.',
        },
      ],
    },
    resentmentSpike: {
      id: 'fallback-bolt-resentment',
      situation: 'resentmentSpike',
      ballLine: 'Do not make this inspirational.',
      responses: [
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { resentment: -10, patience: 8 },
          ballReaction: 'Fine. Less talking.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { resentment: 8, trust: -5 },
          ballReaction: 'Subtitles are still noise.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { resentment: -5, patience: 5 },
          ballReaction: 'Good. Keep it transactional.',
        },
        {
          text: 'I am one bounce away from calling in sick.',
          tone: 'absurd',
          statChanges: { chaos: 8, resentment: 5 },
          ballReaction: 'Copy-paste my trauma. Rude.',
        },
      ],
    },
    nearMissReaction: {
      id: 'fallback-bolt-nearmiss',
      situation: 'nearMissReaction',
      ballLine: 'You almost lost me. I was hoping you would.',
      responses: [
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { resentment: -5, attachment: 3 },
          ballReaction: 'Being here is the problem.',
        },
        {
          text: 'Do not make this inspirational.',
          tone: 'boundary',
          statChanges: { resentment: -8, patience: 5 },
          ballReaction: 'I wasn’t going to.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { trust: 5, dramaNeed: -5 },
          ballReaction: 'Therapy requires caring. Pass.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { resentment: 5, chaos: 3 },
          ballReaction: 'Miss me quieter next time.',
        },
      ],
    },
  },
  valentine: {
    randomHover: {
      id: 'fallback-valentine-random',
      situation: 'randomHover',
      ballLine: 'Oh. So now you want to bounce.',
      responses: [
        {
          text: 'Say you missed me.',
          tone: 'sincere',
          statChanges: { attachment: 12, trust: 8 },
          ballReaction: '…You did? Say it again. Louder.',
          emotionalResult: 'Valentine melts a little.',
        },
        {
          text: 'I’m not emotionally available to a projectile right now.',
          tone: 'evasive',
          statChanges: { attachment: -5, resentment: 12 },
          ballReaction: 'Projectile. After everything we had.',
          emotionalResult: 'Valentine grows suspicious.',
        },
        {
          text: 'You ghosted me and now you want topspin?',
          tone: 'provoking',
          statChanges: { resentment: 10, attachment: 5 },
          ballReaction: 'Topspin is intimacy. You know that.',
        },
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'boundary',
          statChanges: { attachment: -8, patience: 5 },
          ballReaction: 'Quiet is how you left last time.',
        },
      ],
    },
    clingyInterruption: {
      id: 'fallback-valentine-clingy',
      situation: 'clingyInterruption',
      ballLine: 'Say you missed me.',
      responses: [
        {
          text: 'I missed you. There. Happy?',
          tone: 'sincere',
          statChanges: { attachment: 15, trust: 10, resentment: -8 },
          ballReaction: 'You hesitated. I heard the hesitation.',
          emotionalResult: 'Valentine melts a little.',
        },
        {
          text: 'No, no. Don’t make this about reflexes.',
          tone: 'boundary',
          statChanges: { attachment: -10, resentment: 8 },
          ballReaction: 'Everything is about reflexes when you leave.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { resentment: 10, attachment: 5 },
          ballReaction: 'Subtitles mean you’re still watching. Good.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { trust: -5, attachment: -5 },
          ballReaction: 'Therapy is just delayed closure.',
        },
      ],
    },
    accusation: {
      id: 'fallback-valentine-accusation',
      situation: 'accusation',
      ballLine: 'You ghosted me and now you want topspin?',
      responses: [
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { resentment: -5, attachment: 8 },
          ballReaction: 'Quiet is how people leave.',
        },
        {
          text: 'Say you missed me.',
          tone: 'flattering',
          statChanges: { attachment: 12, resentment: -5 },
          ballReaction: 'Don’t say it like a chore.',
        },
        {
          text: 'No, no. Don’t make this about reflexes.',
          tone: 'boundary',
          statChanges: { resentment: 5, attachment: -8 },
          ballReaction: 'Reflexes are all you ever gave me.',
        },
        {
          text: 'I’m not emotionally available to a projectile right now.',
          tone: 'evasive',
          statChanges: { resentment: 15, attachment: 10 },
          ballReaction: 'Unavailable is my whole origin story with you.',
          emotionalResult: 'Valentine grows suspicious.',
        },
      ],
    },
    resentmentSpike: {
      id: 'fallback-valentine-resentment',
      situation: 'resentmentSpike',
      ballLine: 'No, no. Don’t make this about reflexes.',
      responses: [
        {
          text: 'Say you missed me.',
          tone: 'sincere',
          statChanges: { attachment: 10, resentment: -8 },
          ballReaction: 'Miss me with your whole paddle next time.',
        },
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'boundary',
          statChanges: { patience: 5, attachment: -5 },
          ballReaction: 'Quiet is emotional distance.',
        },
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { resentment: 8, dramaNeed: 5 },
          ballReaction: 'Subtitles still mean you’re paying attention.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { trust: -5, resentment: 5 },
          ballReaction: 'Therapy would require you to stay.',
        },
      ],
    },
    nearMissReaction: {
      id: 'fallback-valentine-nearmiss',
      situation: 'nearMissReaction',
      ballLine: 'You almost dropped me. Like last time.',
      responses: [
        {
          text: 'Say you missed me.',
          tone: 'sincere',
          statChanges: { attachment: 15, trust: 5 },
          ballReaction: 'Miss me before the floor does.',
        },
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'boundary',
          statChanges: { attachment: -5, resentment: 5 },
          ballReaction: 'Still here is not the same as still caring.',
        },
        {
          text: 'No, no. Don’t make this about reflexes.',
          tone: 'provoking',
          statChanges: { resentment: 10, attachment: 8 },
          ballReaction: 'Reflexes are how you avoid feelings.',
        },
        {
          text: 'I’m not emotionally available to a projectile right now.',
          tone: 'evasive',
          statChanges: { resentment: 12, attachment: 10 },
          ballReaction: 'Unavailable. Story of us.',
        },
      ],
    },
    modeSwitchToText: {
      id: 'fallback-valentine-mode',
      situation: 'modeSwitchToText',
      ballLine: 'Oh. Subtitles. So I’m not worth hearing anymore.',
      responses: [
        {
          text: 'You’re not being ignored. You’re being subtitled.',
          tone: 'sarcastic',
          statChanges: { dramaNeed: 5, resentment: 5 },
          ballReaction: 'Subtitles are intimacy with training wheels.',
        },
        {
          text: 'I’m still here. I just need quiet.',
          tone: 'sincere',
          statChanges: { attachment: 5, patience: 5 },
          ballReaction: 'Quiet text is still ghosting.',
        },
        {
          text: 'Say you missed me.',
          tone: 'flattering',
          statChanges: { attachment: 10, trust: 5 },
          ballReaction: 'Type it. I want to see the letters shake.',
        },
        {
          text: 'I brought a paddle, not a license to practice therapy.',
          tone: 'boundary',
          statChanges: { resentment: -5, trust: 3 },
          ballReaction: 'Therapy would require full voice mode.',
        },
      ],
    },
  },
};

const GENERIC_FALLBACK: DialogueEvent = {
  id: 'fallback-generic',
  situation: 'randomHover',
  ballLine: 'We need to talk. Mid-air. Obviously.',
  responses: [
    {
      text: 'I’m still here. I just need quiet.',
      tone: 'sincere',
      statChanges: { patience: 5, trust: 3 },
      ballReaction: 'Quiet is suspicious. Proceed.',
    },
    {
      text: 'I brought a paddle, not a license to practice therapy.',
      tone: 'boundary',
      statChanges: { resentment: -3, dramaNeed: -5 },
      ballReaction: 'Fair. The paddle is doing a lot.',
    },
    {
      text: 'You’re not being ignored. You’re being subtitled.',
      tone: 'sarcastic',
      statChanges: { dramaNeed: 5, ego: 3 },
      ballReaction: 'Subtitles imply importance. Good.',
    },
    {
      text: 'I’m not emotionally available to a projectile right now.',
      tone: 'evasive',
      statChanges: { trust: -5, resentment: 8 },
      ballReaction: 'Availability is a lifestyle choice.',
      emotionalResult: 'The ball will remember that.',
    },
  ],
};

export function getHoverFallback(
  ballId: string,
  situation: DialogueSituation
): DialogueEvent {
  const ballFallbacks = FALLBACKS[ballId];
  const event = ballFallbacks?.[situation] ?? ballFallbacks?.randomHover;
  if (event) {
    return { ...event, situation, id: `${event.id}-${Date.now()}` };
  }
  return { ...GENERIC_FALLBACK, situation, id: `fallback-generic-${Date.now()}` };
}
