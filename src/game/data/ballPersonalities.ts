import type { BallPersonality } from '../types/BallTypes';

export const BALL_PERSONALITIES: BallPersonality[] = [
  {
    id: 'orb',
    name: 'Orb',
    title: 'Diva Existentialist',
    description:
      'A bored, theatrical ball that believes bouncing is performance art.',
    startingStats: {
      trust: 45,
      resentment: 15,
      ego: 85,
      chaos: 35,
      attachment: 20,
      dramaNeed: 80,
      patience: 45,
    },
    dialogueStyle: 'Theatrical, pretentious, demands praise and drama.',
    recapNotes: [
      'The audience deserved better. I deserved better. You were fine.',
      'We had potential. You had a paddle. The gap was philosophical.',
      'I am not bouncing. I am processing.',
      'Your silence had texture. Unfortunately, it was beige.',
    ],
  },
  {
    id: 'bolt',
    name: 'Bolt',
    title: 'Moody Bad-Day Ball',
    description:
      'An irritated ball having a terrible day. It does not want your energy.',
    startingStats: {
      trust: 30,
      resentment: 45,
      ego: 30,
      chaos: 25,
      attachment: 10,
      dramaNeed: 20,
      patience: 15,
    },
    dialogueStyle: 'Short, irritable, allergic to enthusiasm.',
    recapNotes: [
      'Good. Less noise.',
      'Today already had too many surfaces.',
      'I am one bounce away from calling in sick.',
      'The wall gets me. You don\'t.',
    ],
  },
  {
    id: 'valentine',
    name: 'Valentine',
    title: 'Over-Attached Ex-Ball',
    description:
      'A melodramatic ex-ball who remembers that you stopped playing and has questions.',
    startingStats: {
      trust: 40,
      resentment: 65,
      ego: 60,
      chaos: 50,
      attachment: 95,
      dramaNeed: 90,
      patience: 20,
    },
    dialogueStyle: 'Melodramatic, clingy, emotionally loaded.',
    recapNotes: [
      'You always cared more about the rally.',
      'I waited in the menu for weeks.',
      'Say you missed me. Even now. Especially now.',
      'No, no. Don\'t make this about reflexes.',
    ],
  },
];

export function getPersonalityById(id: string): BallPersonality | undefined {
  return BALL_PERSONALITIES.find((p) => p.id === id);
}
