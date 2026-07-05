import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';
import type { RecapData } from '../types/BallTypes';
import { buildRecapData } from '../systems/RecapSystem';
import { generateAiRecap, LocalAiError } from '../services/LocalAiClient';

export class RecapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RecapScene' });
  }

  create(data: RecapData): void {
    uiManager.showRecap(data);
    uiManager.setCallbacks({
      onRecapPlayAgain: () => this.scene.start('PlayScene', { ballId: data.ballId }),
      onRecapMenu: () => this.scene.start('MenuScene'),
    });
  }

  /** Called from PlayScene with optional AI enrichment */
  static async buildRecapWithAi(
    base: RecapData,
    aiPayload: Parameters<typeof generateAiRecap>[0]
  ): Promise<RecapData> {
    try {
      const ai = await generateAiRecap(aiPayload);
      return {
        ...base,
        relationshipStatus: ai.relationshipStatus,
        emotionalDiagnosis: ai.emotionalDiagnosis,
        note: ai.finalNote,
        worstThingThePlayerDid: ai.worstThingThePlayerDid,
        replayHook: ai.replayHook,
        aiGenerated: true,
      };
    } catch (err) {
      console.warn('[Recap] AI fallback:', err instanceof LocalAiError ? err.message : err);
      return base;
    }
  }
}

export { buildRecapData };
