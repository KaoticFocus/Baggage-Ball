import Phaser from 'phaser';
import { soundManager } from '../services/SoundManager';
import { characterAudioManifest } from './characterAudioManifest';
import type {
  CharacterAudioCategory,
  CharacterAudioCue,
  CharacterAudioManifest,
  CharacterAudioPlayOptions,
  CharacterAudioPriority,
  CharacterAudioResult,
} from './characterAudioTypes';

const PRIORITY_RANK: Record<CharacterAudioPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

type CurrentDialogue = {
  cue: CharacterAudioCue;
  sound: Phaser.Sound.BaseSound;
  priority: CharacterAudioPriority;
};

class CharacterAudioManager {
  private manifest: CharacterAudioManifest = characterAudioManifest;
  private loadedCharacterIds = new Set<string>();
  private loadingCharacterIds = new Set<string>();
  private loadedCueIds = new Set<string>();
  private lastCueByCharacterCategory = new Map<string, string>();
  private cooldownUntilByCue = new Map<string, number>();
  private current: CurrentDialogue | null = null;

  constructor() {
    soundManager.onMuteChange((muted) => {
      if (muted) {
        this.stopCurrent();
      }
    });
  }

  preload(scene: Phaser.Scene): void {
    // Preload is intentionally narrow: selected characters are loaded at match
    // start via loadSelectedCharacters() rather than globally loading all audio.
    void scene;
  }

  loadSelectedCharacters(scene: Phaser.Scene, characterIds: string[]): Promise<void> {
    const cues = characterIds.flatMap((characterId) => this.getCharacterCues(characterId));
    const toLoad = cues.filter(
      (cue) => !this.loadedCueIds.has(cue.cueId) && !scene.cache.audio.exists(this.keyForCue(cue))
    );

    for (const characterId of characterIds) {
      if (this.manifest[characterId]) {
        this.loadingCharacterIds.add(characterId);
      }
    }

    if (toLoad.length === 0) {
      if (import.meta.env.DEV) {
        console.log('[CharacterAudio] loadSelectedCharacters: nothing to load (already cached)', {
          characterIds,
        });
      }
      for (const characterId of characterIds) {
        if (this.manifest[characterId]) {
          this.loadedCharacterIds.add(characterId);
          this.loadingCharacterIds.delete(characterId);
        }
      }
      return Promise.resolve();
    }

    if (import.meta.env.DEV) {
      console.log('[CharacterAudio] loadSelectedCharacters: enqueue', {
        characterIds,
        cues: toLoad.map((cue) => ({
          cueId: cue.cueId,
          path: cue.path,
          audioKey: this.keyForCue(cue),
          cacheHit: scene.cache.audio.exists(this.keyForCue(cue)),
        })),
      });
    }

    return new Promise((resolve) => {
      const onComplete = () => {
        for (const cue of toLoad) {
          this.loadedCueIds.add(cue.cueId);
        }
        for (const characterId of characterIds) {
          if (this.manifest[characterId]) {
            this.loadedCharacterIds.add(characterId);
            this.loadingCharacterIds.delete(characterId);
          }
        }
        if (import.meta.env.DEV) {
          for (const cue of toLoad) {
            const key = this.keyForCue(cue);
            console.log('[CharacterAudio] load complete', {
              audioKey: key,
              cacheHit: scene.cache.audio.exists(key),
            });
          }
        }
        scene.load.off(Phaser.Loader.Events.COMPLETE, onComplete);
        resolve();
      };

      scene.load.once(Phaser.Loader.Events.COMPLETE, onComplete);
      for (const cue of toLoad) {
        scene.load.audio(this.keyForCue(cue), cue.path);
      }
      scene.load.start();
    });
  }

  playCue(
    scene: Phaser.Scene,
    characterId: string,
    cueId: string,
    options: CharacterAudioPlayOptions = {}
  ): CharacterAudioResult {
    const cue = this.findCueById(characterId, cueId);
    const key = cue ? this.keyForCue(cue) : `character-audio:${characterId}:${cueId}`;

    if (!cue) {
      this.logDevPlayback(scene, {
        characterId,
        cueId,
        path: undefined,
        audioKey: key,
        cacheHit: scene.cache.audio.exists(key),
        phase: 'lookup',
      });
      return this.result(
        'missing-cue',
        undefined,
        `Missing cue ${characterId}:${cueId} — not registered in characterAudioManifest`
      );
    }

    this.logDevPlayback(scene, {
      characterId,
      cueId,
      path: cue.path,
      audioKey: key,
      cacheHit: scene.cache.audio.exists(key),
      phase: 'pre-play',
    });

    return this.playResolvedCue(scene, cue, options);
  }

  getAudioKey(characterId: string, cueId: string): string {
    return `character-audio:${characterId}:${cueId}`;
  }

  playRandom(
    scene: Phaser.Scene,
    characterId: string,
    category: CharacterAudioCategory,
    options: CharacterAudioPlayOptions = {}
  ): CharacterAudioResult {
    const character = this.manifest[characterId];
    if (!character) {
      return this.result('missing-character', undefined, `Missing character ${characterId}`);
    }

    const cues = character[category] ?? [];
    if (cues.length === 0) {
      return this.result('missing-category', undefined, `No cues for ${characterId}:${category}`);
    }

    const repeatKey = this.repeatKey(characterId, category);
    const lastCueId = this.lastCueByCharacterCategory.get(repeatKey);
    const pool = cues.length > 1 ? cues.filter((cue) => cue.cueId !== lastCueId) : cues;
    const cue = pool[Math.floor(Math.random() * pool.length)];

    return this.playResolvedCue(scene, cue, options);
  }

  stopCurrent(): void {
    if (this.current?.sound.isPlaying) {
      this.current.sound.stop();
    }
    this.current = null;
  }

  setMuted(muted: boolean): void {
    soundManager.setMuted(muted);
  }

  setVoiceVolume(volume: number): void {
    soundManager.setVoiceVolume(volume);
  }

  private playResolvedCue(
    scene: Phaser.Scene,
    cue: CharacterAudioCue,
    options: CharacterAudioPlayOptions
  ): CharacterAudioResult {
    const key = this.keyForCue(cue);
    const cacheHit = scene.cache.audio.exists(key);

    if (soundManager.isMuted()) {
      this.logDevPlayback(scene, {
        characterId: cue.characterId,
        cueId: cue.cueId,
        path: cue.path,
        audioKey: key,
        cacheHit,
        phase: 'blocked-muted',
      });
      return this.result('muted', cue);
    }

    if (this.loadingCharacterIds.has(cue.characterId)) {
      this.logDevPlayback(scene, {
        characterId: cue.characterId,
        cueId: cue.cueId,
        path: cue.path,
        audioKey: key,
        cacheHit,
        phase: 'blocked-load-pending',
      });
      return this.result('load-pending', cue);
    }

    if (!this.loadedCharacterIds.has(cue.characterId) || !cacheHit) {
      this.logDevPlayback(scene, {
        characterId: cue.characterId,
        cueId: cue.cueId,
        path: cue.path,
        audioKey: key,
        cacheHit,
        phase: 'blocked-not-loaded',
      });
      return this.result('not-loaded', cue, `Audio not loaded: ${key}`);
    }

    const now = performance.now();
    const cooldownUntil = this.cooldownUntilByCue.get(cue.cueId) ?? 0;
    if (now < cooldownUntil) {
      return this.result('cooldown', cue);
    }

    const repeatKey = this.repeatKey(cue.characterId, cue.category);
    if (this.lastCueByCharacterCategory.get(repeatKey) === cue.cueId) {
      return this.result('repeat-blocked', cue);
    }

    const priority = options.priority ?? cue.priority ?? 'medium';
    if (!this.canPlayOverCurrent(priority, options.interrupt ?? cue.interrupt)) {
      return this.result('priority-blocked', cue);
    }

    if (this.current && (options.stopCurrent || this.current.sound.isPlaying)) {
      this.stopCurrent();
    }

    const playbackRate = options.playbackRate ?? cue.playbackRate ?? 1;
    const sound = scene.sound.add(key, {
      volume: (options.volume ?? cue.volume ?? 1) * soundManager.getVoiceOutputVolume(),
      rate: playbackRate,
    });
    const durationMs = sound.duration > 0 ? (sound.duration * 1000) / playbackRate : undefined;

    sound.once(Phaser.Sound.Events.COMPLETE, () => {
      if (this.current?.sound === sound) {
        this.current = null;
      }
      sound.destroy();
    });

    sound.play();

    this.logDevPlayback(scene, {
      characterId: cue.characterId,
      cueId: cue.cueId,
      path: cue.path,
      audioKey: key,
      cacheHit: true,
      phase: 'played',
      durationMs,
    });

    this.current = { cue, sound, priority };
    this.lastCueByCharacterCategory.set(repeatKey, cue.cueId);

    if (cue.cooldownMs) {
      this.cooldownUntilByCue.set(cue.cueId, now + cue.cooldownMs);
    }

    return this.result('played', cue, undefined, durationMs);
  }

  private canPlayOverCurrent(
    nextPriority: CharacterAudioPriority,
    interrupt = 'same-or-lower'
  ): boolean {
    if (!this.current || !this.current.sound.isPlaying) return true;
    if (interrupt === 'always') return true;
    if (interrupt === 'never') return false;

    const currentRank = PRIORITY_RANK[this.current.priority];
    const nextRank = PRIORITY_RANK[nextPriority];
    if (nextRank > currentRank) return true;

    // Do not churn low-priority ambient dialogue.
    if (nextPriority === 'low' && this.current.priority === 'low') return false;

    return nextRank >= currentRank;
  }

  private findCueById(characterId: string, cueId: string): CharacterAudioCue | null {
    return this.getCharacterCues(characterId).find((cue) => cue.cueId === cueId) ?? null;
  }

  private getCharacterCues(characterId: string): CharacterAudioCue[] {
    const categories = this.manifest[characterId];
    if (!categories) return [];
    return Object.values(categories).flatMap((cues) => cues ?? []);
  }

  private keyForCue(cue: CharacterAudioCue): string {
    return `character-audio:${cue.characterId}:${cue.cueId}`;
  }

  private repeatKey(characterId: string, category: CharacterAudioCategory): string {
    return `${characterId}:${category}`;
  }

  private logDevPlayback(
    scene: Phaser.Scene,
    details: {
      characterId: string;
      cueId: string;
      path?: string;
      audioKey: string;
      cacheHit: boolean;
      phase: string;
      durationMs?: number;
    }
  ): void {
    if (!import.meta.env.DEV) return;

    const payload = {
      characterId: details.characterId,
      cueId: details.cueId,
      path: details.path,
      audioKey: details.audioKey,
      cacheHit: details.cacheHit,
      muted: soundManager.isMuted(),
      audioContextState: soundManager.getAudioContextState(),
      phaserSoundLocked: scene.sound.locked,
      phase: details.phase,
      durationMs: details.durationMs,
    };

    if (details.phase === 'played') {
      console.log('[CharacterAudio]', payload);
    } else if (details.phase.startsWith('blocked') || details.phase === 'lookup') {
      console.warn('[CharacterAudio]', payload);
    } else {
      console.log('[CharacterAudio]', payload);
    }
  }

  private result(
    result: CharacterAudioResult['result'],
    cue?: CharacterAudioCue,
    message?: string,
    durationMs?: number
  ): CharacterAudioResult {
    const ok = result === 'played';
    if (import.meta.env.DEV) {
      const logPayload = {
        characterId: cue?.characterId,
        cueId: cue?.cueId,
        category: cue?.category,
        path: cue?.path,
        priority: cue?.priority,
        result,
      };
      if (ok) {
        console.log('[CharacterAudio]', logPayload);
      } else if (message) {
        console.warn('[CharacterAudio]', { ...logPayload, message });
      } else {
        console.log('[CharacterAudio]', logPayload);
      }
    }
    return { ok, result, cue, durationMs, message };
  }
}

export const characterAudio = new CharacterAudioManager();
