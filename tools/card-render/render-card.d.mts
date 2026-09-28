// Hand-written declaration for render-card.mjs (plain JS, no TS build step) — lets TS consumers
// like web3/scripts/mintSampleInstances.ts import it with real types instead of implicit `any`.
export interface RenderableCard {
  instanceId?: string;
  templateId: string;
  name: string;
  rarity: string;
  faction: string;
  text: string;
  type?: string;
  cost: number;
  attack?: number | null;
  health?: number | null;
  keywords?: string[];
  isFoil?: boolean;
  conditionGrade?: number | null;
}

export function renderCardInstance(instance: RenderableCard, artPath: string, outPath: string): Promise<void>;
