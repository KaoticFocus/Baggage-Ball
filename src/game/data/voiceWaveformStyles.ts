/**
 * Character-specific voice waveform styling.
 * Add future speakers here — do not duplicate renderer classes per character.
 */

export interface VoiceWaveformStyle {
  primaryColor: number;
  secondaryColor: number;
  glowStrength: number;
  amplitudeScale: number;
  turbulence: number;
  lineThickness: number;
  pulseSpeed: number;
  /** 0 = angular / stressed, 1 = smooth / emotional curves. */
  curveSoftness: number;
}

const DEFAULT_STYLE: VoiceWaveformStyle = {
  primaryColor: 0x88ffff,
  secondaryColor: 0x44aacc,
  glowStrength: 0.85,
  amplitudeScale: 1,
  turbulence: 0.35,
  lineThickness: 3.5,
  pulseSpeed: 1,
  curveSoftness: 0.55,
};

export const VOICE_WAVEFORM_STYLES: Record<string, VoiceWaveformStyle> = {
  valentine: {
    primaryColor: 0xff66aa,
    secondaryColor: 0xff99cc,
    glowStrength: 1.15,
    amplitudeScale: 1.15,
    turbulence: 0.28,
    lineThickness: 4.2,
    pulseSpeed: 1.15,
    curveSoftness: 0.92,
  },
  orb: {
    primaryColor: 0xaa66ff,
    secondaryColor: 0xcc99ff,
    glowStrength: 1,
    amplitudeScale: 1.05,
    turbulence: 0.4,
    lineThickness: 3.8,
    pulseSpeed: 1,
    curveSoftness: 0.7,
  },
  bolt: {
    primaryColor: 0xffaa44,
    secondaryColor: 0xffdd88,
    glowStrength: 1.05,
    amplitudeScale: 1.1,
    turbulence: 0.55,
    lineThickness: 3.6,
    pulseSpeed: 1.25,
    curveSoftness: 0.35,
  },
  'midlife-dave': {
    primaryColor: 0x44d0ff,
    secondaryColor: 0x88e8ff,
    glowStrength: 1.05,
    amplitudeScale: 1.08,
    turbulence: 0.72,
    lineThickness: 3.8,
    pulseSpeed: 0.9,
    curveSoftness: 0.22,
  },
  midlifeDave: {
    primaryColor: 0x44d0ff,
    secondaryColor: 0x88e8ff,
    glowStrength: 1.05,
    amplitudeScale: 1.08,
    turbulence: 0.72,
    lineThickness: 3.8,
    pulseSpeed: 0.9,
    curveSoftness: 0.22,
  },
  'opponent-paddle': {
    primaryColor: 0x44d0ff,
    secondaryColor: 0x88e8ff,
    glowStrength: 1.05,
    amplitudeScale: 1.08,
    turbulence: 0.72,
    lineThickness: 3.8,
    pulseSpeed: 0.9,
    curveSoftness: 0.22,
  },
  'player-paddle': {
    primaryColor: 0x66ffe8,
    secondaryColor: 0xaafff2,
    glowStrength: 0.9,
    amplitudeScale: 0.95,
    turbulence: 0.3,
    lineThickness: 3.4,
    pulseSpeed: 1,
    curveSoftness: 0.5,
  },
};

export function resolveVoiceWaveformStyle(characterId: string): VoiceWaveformStyle {
  return VOICE_WAVEFORM_STYLES[characterId] ?? DEFAULT_STYLE;
}
