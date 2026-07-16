/**
 * Maps speaker ids to waveform visuals and drives the active speaker only.
 */

import type { VoiceDirector } from '../audio/VoiceDirector';
import type { SpeechEndEvent, SpeechStartEvent } from '../audio/speechTypes';
import { SpeakerWaveform } from './SpeakerWaveform';

export class SpeechVisualRegistry {
  private readonly waveforms = new Map<string, SpeakerWaveform>();
  private activeSpeakerId: string | null = null;

  constructor(private readonly speechDirector: VoiceDirector) {
    speechDirector.on('speech:start', this.handleSpeechStart, this);
    speechDirector.on('speech:end', this.handleSpeechEnd, this);
  }

  register(speakerId: string, waveform: SpeakerWaveform): void {
    const existing = this.waveforms.get(speakerId);
    if (existing) existing.destroy();
    this.waveforms.set(speakerId, waveform);
  }

  unregister(speakerId: string): void {
    const waveform = this.waveforms.get(speakerId);
    if (!waveform) return;
    waveform.hide();
    waveform.destroy();
    this.waveforms.delete(speakerId);
    if (this.activeSpeakerId === speakerId) {
      this.activeSpeakerId = null;
    }
  }

  update(deltaMs = 16): void {
    const activeSpeakerId = this.speechDirector.getCurrentSpeakerId();
    if (!activeSpeakerId) {
      // Keep decaying energy when no speaker — waveforms handle their own hide.
      return;
    }

    const waveform = this.waveforms.get(activeSpeakerId);
    if (!waveform) return;

    const energy = this.speechDirector.getSpeechEnergy();
    const samples = this.speechDirector.getWaveformSamples(waveform.sampleCount);
    waveform.updateFrame(samples, energy, deltaMs);
  }

  destroy(): void {
    this.speechDirector.off('speech:start', this.handleSpeechStart, this);
    this.speechDirector.off('speech:end', this.handleSpeechEnd, this);
    for (const waveform of this.waveforms.values()) {
      waveform.destroy();
    }
    this.waveforms.clear();
    this.activeSpeakerId = null;
  }

  private handleSpeechStart(event: SpeechStartEvent): void {
    if (this.activeSpeakerId && this.activeSpeakerId !== event.speaker.id) {
      this.waveforms.get(this.activeSpeakerId)?.hide();
    }
    this.activeSpeakerId = event.speaker.id;
    this.waveforms.get(event.speaker.id)?.show();
  }

  private handleSpeechEnd(event: SpeechEndEvent): void {
    this.waveforms.get(event.speaker.id)?.hide();
    if (this.activeSpeakerId === event.speaker.id) {
      this.activeSpeakerId = null;
    }
  }
}
