import type { InputMode } from '../types/DialogueTypes';

export type InputModeChangeCallback = (
  newMode: InputMode,
  previousMode: InputMode,
  isFirstTextSwitch: boolean
) => void;

export class InputModeSystem {
  private mode: InputMode = 'voice';
  private hasSwitchedToTextThisRound = false;

  getMode(): InputMode {
    return this.mode;
  }

  toggle(): { mode: InputMode; isFirstTextSwitch: boolean } {
    this.mode = this.mode === 'voice' ? 'text' : 'voice';

    let isFirstTextSwitch = false;
    if (this.mode === 'text' && !this.hasSwitchedToTextThisRound) {
      this.hasSwitchedToTextThisRound = true;
      isFirstTextSwitch = true;
    }

    return { mode: this.mode, isFirstTextSwitch };
  }

  hasSwitchedToText(): boolean {
    return this.hasSwitchedToTextThisRound;
  }

  reset(): void {
    this.mode = 'voice';
    this.hasSwitchedToTextThisRound = false;
  }
}
