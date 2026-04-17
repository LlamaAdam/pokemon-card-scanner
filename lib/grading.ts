export type PsaTier = 'value' | 'regular' | 'express';

export const PSA_FEES: Record<PsaTier, { fee: number; shipReturn: number }> = {
  value:   { fee: 19.99, shipReturn: 15 },
  regular: { fee: 39.99, shipReturn: 15 },
  express: { fee: 99.99, shipReturn: 20 },
};

export type Verdict = 'worth_grading' | 'borderline' | 'not_worth' | 'unknown';

export interface GradingResult {
  verdict: Verdict;
  netProfit: number | null;
  multiplier: number | null;
  totalCost: number;
}

export interface GradingInput {
  rawPrice: number | null;
  psa10Price: number | null;
  tier: PsaTier;
}

export function gradingVerdict(input: GradingInput): GradingResult {
  const { fee, shipReturn } = PSA_FEES[input.tier];
  const totalCost = fee + shipReturn;

  if (input.psa10Price == null || input.rawPrice == null) {
    return { verdict: 'unknown', netProfit: null, multiplier: null, totalCost };
  }

  const netProfit = input.psa10Price - input.rawPrice - totalCost;
  const multiplier = input.rawPrice > 0 ? input.psa10Price / input.rawPrice : null;

  let verdict: Verdict;
  if (netProfit > 50) verdict = 'worth_grading';
  else if (netProfit > 0) verdict = 'borderline';
  else verdict = 'not_worth';

  return { verdict, netProfit, multiplier, totalCost };
}
