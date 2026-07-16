/**
 * Real-time Emotional Loadout configuration and HUD state.
 * Cooldown is independent of VoiceDirector / TTS duration.
 */

export type EmotionalActionState = 'available' | 'cooldown' | 'disabled';

export interface EmotionalActionConfig {
  /** Minimum time between accepted emotional actions (ms). */
  globalCooldownMs: number;
}

export const EMOTIONAL_ACTION_CONFIG: EmotionalActionConfig = {
  globalCooldownMs: 3000,
};

export type EmotionalActionInputSource = 'click' | 'keyboard';

export interface EmotionalActionEvent {
  id: string;
  modeId: string;
  sourceCharacterId: string;
  targetCharacterId: string;
  timestamp: number;
  rallyId: string | number;
}
