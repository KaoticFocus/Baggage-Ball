import type { BallStats, BehaviorModifier } from './BallTypes';

export type ResponseTone =
  | 'sincere'
  | 'sarcastic'
  | 'absurd'
  | 'boundary'
  | 'flattering'
  | 'provoking'
  | 'apologetic'
  | 'evasive'
  | 'hostile'
  | 'tender';

export type DialogueSituation =
  | 'randomHover'
  | 'modeSwitchToText'
  | 'lowTrust'
  | 'highResentment'
  | 'longRally'
  | 'nearMiss'
  | 'accusation'
  | 'praiseDemand'
  | 'existentialCrisis'
  | 'strategyRethink'
  | 'resentmentSpike'
  | 'clingyInterruption'
  | 'boredomComplaint'
  | 'nearMissReaction'
  | 'silenceReaction';

export type DialogueResponse = {
  text: string;
  tone: ResponseTone;
  statChanges: Partial<BallStats>;
  ballReaction: string;
  emotionalResult?: string;
  behaviorModifier?: BehaviorModifier;
};

export type DialogueEvent = {
  id: string;
  situation: DialogueSituation;
  ballLine: string;
  audioCueId?: string;
  responses: DialogueResponse[];
  ballIds?: string[];
};

export type InputMode = 'voice' | 'text';

export type HoverDecision = {
  shouldHover: true;
  hoverType: DialogueSituation;
  situation: DialogueSituation;
  reason: string;
};
