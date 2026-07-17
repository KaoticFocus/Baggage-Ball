/**
 * Emotional Delivery — timings and per-mode visual styles for the Loadout weapon system.
 * Gameplay effects stay in getEmotionalResponseEffects(); this file is presentation only.
 */

import type { EmotionalResponseModeId } from './emotionalResponseModes';

export type EmotionalDeliveryState =
  | 'available'
  | 'tethering'
  | 'charging'
  | 'firing'
  | 'penetrating'
  | 'draining'
  | 'absorbing'
  | 'resolving'
  | 'cooldown'
  | 'disabled';

export type EmotionalDeliveryTiming = {
  tetherMs: number;
  chargeMs: number;
  beamTravelMs: number;
  penetrateMs: number;
  drainMs: number;
  absorbMs: number;
};

/** ~900 ms selection → deterministic resolution (within 750–1050 ms target). */
export const EMOTIONAL_DELIVERY_TIMING: EmotionalDeliveryTiming = {
  tetherMs: 100,
  chargeMs: 130,
  beamTravelMs: 180,
  penetrateMs: 80,
  drainMs: 200,
  absorbMs: 320,
};

export type EmotionalDeliveryStyle = {
  modeId: EmotionalResponseModeId;
  primaryColor: number;
  secondaryColor: number;
  tetherWidth: number;
  beamWidth: number;
  pulseFrequency: number;
  turbulence: number;
  impactStyle: string;
  absorptionStyle: string;
  particleStyle?: string;
  /** Short label for compact stack cells. */
  shortLabel: string;
};

export const EMOTIONAL_DELIVERY_STYLES: Record<EmotionalResponseModeId, EmotionalDeliveryStyle> = {
  deflect: {
    modeId: 'deflect',
    primaryColor: 0x66e0ff,
    secondaryColor: 0xaaffff,
    tetherWidth: 2.4,
    beamWidth: 3.2,
    pulseFrequency: 9,
    turbulence: 0.85,
    impactStyle: 'skitter',
    absorptionStyle: 'skitter-inward',
    particleStyle: 'sparks',
    shortLabel: 'Deflect',
  },
  apologize: {
    modeId: 'apologize',
    primaryColor: 0xff88aa,
    secondaryColor: 0xffccd8,
    tetherWidth: 2.8,
    beamWidth: 3.6,
    pulseFrequency: 4,
    turbulence: 0.25,
    impactStyle: 'soft',
    absorptionStyle: 'warm-collapse',
    shortLabel: 'Sorry',
  },
  validate: {
    modeId: 'validate',
    primaryColor: 0x88ffcc,
    secondaryColor: 0xccffe8,
    tetherWidth: 2.6,
    beamWidth: 3.4,
    pulseFrequency: 3.5,
    turbulence: 0.15,
    impactStyle: 'steady',
    absorptionStyle: 'stabilize',
    shortLabel: 'Validate',
  },
  challenge: {
    modeId: 'challenge',
    primaryColor: 0xff6644,
    secondaryColor: 0xffaa66,
    tetherWidth: 2.2,
    beamWidth: 3.8,
    pulseFrequency: 7,
    turbulence: 0.7,
    impactStyle: 'sharp',
    absorptionStyle: 'angular-recoil',
    shortLabel: 'Challenge',
  },
  flirt: {
    modeId: 'flirt',
    primaryColor: 0xff66cc,
    secondaryColor: 0xffaad8,
    tetherWidth: 2.5,
    beamWidth: 3.3,
    pulseFrequency: 6,
    turbulence: 0.55,
    impactStyle: 'spiral',
    absorptionStyle: 'orbit-pulse',
    particleStyle: 'orbit',
    shortLabel: 'Flirt',
  },
  mock: {
    modeId: 'mock',
    primaryColor: 0xffcc33,
    secondaryColor: 0xffee88,
    tetherWidth: 2.1,
    beamWidth: 3.0,
    pulseFrequency: 11,
    turbulence: 1,
    impactStyle: 'jagged',
    absorptionStyle: 'irritation-spikes',
    shortLabel: 'Mock',
  },
  reassure: {
    modeId: 'reassure',
    primaryColor: 0x88aaff,
    secondaryColor: 0xccd8ff,
    tetherWidth: 3.0,
    beamWidth: 3.8,
    pulseFrequency: 2.8,
    turbulence: 0.12,
    impactStyle: 'wave',
    absorptionStyle: 'calm-waves',
    shortLabel: 'Reassure',
  },
  'set-boundary': {
    modeId: 'set-boundary',
    primaryColor: 0xddaa66,
    secondaryColor: 0xffe0aa,
    tetherWidth: 2.7,
    beamWidth: 3.5,
    pulseFrequency: 4.5,
    turbulence: 0.2,
    impactStyle: 'ring',
    absorptionStyle: 'hard-ring',
    shortLabel: 'Boundary',
  },
  'go-silent': {
    modeId: 'go-silent',
    primaryColor: 0x556688,
    secondaryColor: 0x334455,
    tetherWidth: 2.0,
    beamWidth: 2.6,
    pulseFrequency: 1.8,
    turbulence: 0.35,
    impactStyle: 'vacuum',
    absorptionStyle: 'muted-vacuum',
    shortLabel: 'Silent',
  },
};

export function getEmotionalDeliveryStyle(modeId: EmotionalResponseModeId): EmotionalDeliveryStyle {
  return EMOTIONAL_DELIVERY_STYLES[modeId];
}

export function isDeliveryBusy(state: EmotionalDeliveryState): boolean {
  return (
    state === 'tethering' ||
    state === 'charging' ||
    state === 'firing' ||
    state === 'penetrating' ||
    state === 'draining' ||
    state === 'absorbing' ||
    state === 'resolving'
  );
}
