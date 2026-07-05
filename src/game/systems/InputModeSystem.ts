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

  toggle(): { mode: InputMode; isFirstTextSwitch: boolean; switchedToText: boolean } {
    const previous = this.mode;
    this.mode = this.mode === 'voice' ? 'text' : 'voice';
    const switchedToText = previous === 'voice' && this.mode === 'text';

    let isFirstTextSwitch = false;
    if (switchedToText && !this.hasSwitchedToTextThisRound) {
      this.hasSwitchedToTextThisRound = true;
      isFirstTextSwitch = true;
    }

    return { mode: this.mode, isFirstTextSwitch, switchedToText };
  }

  hasSwitchedToText(): boolean {
    return this.hasSwitchedToTextThisRound;
  }

  reset(): void {
    this.mode = 'voice';
    this.hasSwitchedToTextThisRound = false;
  }
}
