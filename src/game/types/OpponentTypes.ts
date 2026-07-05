export type OpponentId =
  | 'midlifeDave'
  | 'groundedTeen'
  | 'hoaLinda'
  | 'startupGuy'
  | 'retiredGymTeacher';

export type OpponentBarkSituation =
  | 'matchStart'
  | 'playerScores'
  | 'opponentScores'
  | 'longRally'
  | 'nearMiss'
  | 'ballHoverStarts'
  | 'ballHoverEnds'
  | 'playerMisses'
  | 'opponentMisses'
  | 'randomGameplay'
  | 'chaosMoment'
  | 'lowScore'
  | 'highScore'
  | 'pausePressed'
  | 'quitPressed';

export type OpponentGameplayModifier =
  | 'none'
  | 'opponentPanic'
  | 'opponentFocus'
  | 'opponentTilt'
  | 'opponentShowoff'
  | 'opponentChoke'
  | 'opponentSpeedUp'
  | 'opponentSlowDown';

export type OpponentBark = {
  situation: OpponentBarkSituation;
  text: string;
  intensity: number;
  cooldownSeconds: number;
  gameplayModifier: OpponentGameplayModifier;
};

export type OpponentProfile = {
  opponentId: OpponentId;
  displayName: string;
  personalitySummary: string;
  gameplayStyle: string;
  barks: readonly OpponentBark[];
};
