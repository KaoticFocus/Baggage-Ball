export type ScoreEvent =
  | 'wallBounce'
  | 'paddleHit'
  | 'nearMiss'
  | 'helpfulBehavior'
  | 'betrayalSurvived'
  | 'chaosBonus'
  | 'opponentMiss';

export class ScoringSystem {
  score = 0;
  combo = 0;
  rallyCount = 0;
  longestRally = 0;
  paddleHits = 0;
  wallBounces = 0;
  currentRallyHits = 0;

  addEvent(event: ScoreEvent): number {
    let points = 0;

    switch (event) {
      case 'wallBounce':
        points = 1;
        this.wallBounces++;
        break;
      case 'paddleHit':
        points = 2 + this.combo;
        this.paddleHits++;
        this.currentRallyHits++;
        this.combo++;
        this.rallyCount++;
        if (this.currentRallyHits > this.longestRally) {
          this.longestRally = this.currentRallyHits;
        }
        break;
      case 'nearMiss':
        points = 5;
        break;
      case 'helpfulBehavior':
        points = 3;
        break;
      case 'betrayalSurvived':
        points = 8;
        break;
      case 'chaosBonus':
        points = 4;
        break;
      case 'opponentMiss':
        points = 10;
        this.combo++;
        break;
    }

    this.score += points;
    return points;
  }

  resetCombo(): void {
    this.combo = 0;
    this.currentRallyHits = 0;
  }

  reset(): void {
    this.score = 0;
    this.combo = 0;
    this.rallyCount = 0;
    this.longestRally = 0;
    this.paddleHits = 0;
    this.wallBounces = 0;
    this.currentRallyHits = 0;
  }
}
