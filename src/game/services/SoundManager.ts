/**
 * Minimal retro sound service built on the Web Audio API.
 *
 * Tones are synthesized programmatically (no audio assets). The AudioContext is
 * created lazily on the first sound request so that playback only starts after a
 * user gesture, satisfying browser autoplay policies.
 */

const SOUND_STORAGE_KEY = 'baggageBall.soundEnabled';

/** Restrained defaults so arcade blips never overwhelm dialogue. */
const DEFAULT_MASTER_VOLUME = 0.18;
const DEFAULT_EFFECTS_VOLUME = 1;
const DEFAULT_VOICE_VOLUME = 0.8;

type ToneOptions = {
  freq: number;
  /** Optional glide target frequency for two-note / sweep effects. */
  slideTo?: number;
  type?: OscillatorType;
  duration: number;
  /** Peak gain for this voice, multiplied by the master volume. */
  volume?: number;
  attack?: number;
  release?: number;
  /** Delay before the tone starts, in seconds. */
  delay?: number;
  detune?: number;
};

class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private masterVolume = DEFAULT_MASTER_VOLUME;
  private effectsVolume = DEFAULT_EFFECTS_VOLUME;
  private voiceVolume = DEFAULT_VOICE_VOLUME;
  private muteListeners = new Set<(muted: boolean) => void>();

  constructor() {
    this.muted = this.readMutedPreference();
  }

  private readMutedPreference(): boolean {
    try {
      // Stored flag tracks "enabled"; muted is the inverse.
      return localStorage.getItem(SOUND_STORAGE_KEY) === 'false';
    } catch {
      return false;
    }
  }

  private persistMutedPreference(): void {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, this.muted ? 'false' : 'true');
    } catch {
      // Ignore storage failures in restricted environments.
    }
  }

  /** Lazily create/resume the AudioContext. Safe to call inside a user gesture. */
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;

    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.getEffectsOutputVolume();
      this.masterGain.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    return this.ctx;
  }

  /** Explicit unlock hook for the first user interaction. */
  unlock(): void {
    this.ensureContext();
  }

  getAudioContextState(): string {
    return this.ctx?.state ?? 'none';
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    this.persistMutedPreference();
    for (const listener of this.muteListeners) {
      listener(muted);
    }
  }

  /** Returns the new muted state. */
  toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  onMuteChange(listener: (muted: boolean) => void): () => void {
    this.muteListeners.add(listener);
    return () => this.muteListeners.delete(listener);
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.getEffectsOutputVolume();
    }
  }

  setEffectsVolume(volume: number): void {
    this.effectsVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.getEffectsOutputVolume();
    }
  }

  setVoiceVolume(volume: number): void {
    this.voiceVolume = Math.max(0, Math.min(1, volume));
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getEffectsVolume(): number {
    return this.effectsVolume;
  }

  getVoiceVolume(): number {
    return this.voiceVolume;
  }

  getVoiceOutputVolume(): number {
    return this.masterVolume * this.voiceVolume;
  }

  private getEffectsOutputVolume(): number {
    return this.masterVolume * this.effectsVolume;
  }

  private playTone(opts: ToneOptions): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const now = ctx.currentTime + (opts.delay ?? 0);
    const attack = opts.attack ?? 0.005;
    const release = opts.release ?? 0.06;
    const peak = (opts.volume ?? 1) * 0.9;

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'square';
    osc.frequency.setValueAtTime(opts.freq, now);
    if (opts.slideTo !== undefined) {
      osc.frequency.linearRampToValueAtTime(opts.slideTo, now + opts.duration);
    }
    if (opts.detune !== undefined) {
      osc.detune.setValueAtTime(opts.detune, now);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration + release);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + opts.duration + release + 0.02);
  }

  /**
   * Ball hits a paddle: short bright blip. `speed01` (0..1) nudges the pitch up
   * so faster rallies feel snappier. `variant` differentiates the two paddles.
   */
  playPaddleHit(speed01 = 0, variant: 'player' | 'opponent' = 'player'): void {
    const clamped = Math.max(0, Math.min(1, speed01));
    if (variant === 'player') {
      this.playTone({
        freq: 520 + clamped * 360,
        type: 'square',
        duration: 0.07,
        volume: 0.5,
      });
    } else {
      this.playTone({
        freq: 400 + clamped * 300,
        type: 'triangle',
        duration: 0.08,
        volume: 0.5,
      });
    }
  }

  /** Ball hits the top/bottom wall: softer, lower tick. */
  playWallHit(): void {
    this.playTone({
      freq: 180,
      type: 'triangle',
      duration: 0.05,
      volume: 0.32,
    });
  }

  /** Player scores: rising two-note tone. */
  playPlayerScore(): void {
    this.playTone({ freq: 523, type: 'square', duration: 0.11, volume: 0.42 });
    this.playTone({ freq: 784, type: 'square', duration: 0.16, volume: 0.42, delay: 0.11 });
  }

  /** Opponent scores: descending two-note tone (clearly distinct). */
  playOpponentScore(): void {
    this.playTone({ freq: 494, type: 'sawtooth', duration: 0.12, volume: 0.36 });
    this.playTone({ freq: 330, type: 'sawtooth', duration: 0.2, volume: 0.36, delay: 0.12 });
  }

  /** Ball hover / dialogue begins: brief uneasy synth pulse. */
  playHover(): void {
    this.playTone({
      freq: 360,
      slideTo: 300,
      type: 'sine',
      duration: 0.26,
      volume: 0.32,
      attack: 0.02,
      release: 0.12,
    });
    this.playTone({
      freq: 366,
      slideTo: 296,
      type: 'sine',
      duration: 0.26,
      volume: 0.22,
      attack: 0.02,
      release: 0.12,
      detune: 12,
    });
  }

  /** Menu selection: very short soft click. */
  playMenuClick(): void {
    this.playTone({
      freq: 300,
      type: 'sine',
      duration: 0.03,
      volume: 0.28,
      attack: 0.002,
      release: 0.03,
    });
  }
}

export const soundManager = new SoundManager();
