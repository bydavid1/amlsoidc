/**
 * Pricing de la ganancia del viajero (docs/design/09-modelo-claim-y-pricing.md §4):
 * determinista, explicable y configurable. Se calcula AL CREAR el pedido y se
 * persiste: cambios de config posteriores no alteran pedidos publicados.
 *
 *   reward = BASE_FEE + VALUE_RATE × min(precio, VALUE_CAP) + SIZE_FEE[tamaño]
 */

export type SizeCategory = 'SMALL' | 'MEDIUM' | 'LARGE';

export const SIZE_CATEGORIES: SizeCategory[] = ['SMALL', 'MEDIUM', 'LARGE'];

export interface PricingConfig {
  baseFee: number;
  valueRate: number;
  valueCap: number;
  sizeFees: Record<SizeCategory, number>;
}

export const PRICING_CONFIG = Symbol('PRICING_CONFIG');

export interface RewardQuote {
  total: number;
  breakdown: {
    baseFee: number;
    valueComponent: number;
    sizeComponent: number;
  };
}

export function calculateTravelerReward(
  estimatedPrice: number,
  size: SizeCategory,
  config: PricingConfig,
): RewardQuote {
  const baseFee = round2(config.baseFee);
  const valueComponent = round2(config.valueRate * Math.min(Math.max(estimatedPrice, 0), config.valueCap));
  const sizeComponent = round2(config.sizeFees[size]);
  return {
    total: round2(baseFee + valueComponent + sizeComponent),
    breakdown: { baseFee, valueComponent, sizeComponent },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
