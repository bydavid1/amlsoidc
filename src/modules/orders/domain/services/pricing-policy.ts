/**
 * Pricing (docs/design/09-modelo-claim-y-pricing.md §4): determinista,
 * configurable, calculado AL CREAR el pedido y persistido.
 *
 *   travelerReward = BASE_FEE + VALUE_RATE × min(precio, VALUE_CAP) + SIZE_FEE[tamaño]
 *   platformFee    = PLATFORM_RATE × travelerReward        (ganancia de Bringo)
 *   serviceTotal   = travelerReward + platformFee
 *   estimatedTotal = precio + serviceTotal                 (lo que paga el Buyer)
 *
 * VISIBILIDAD (regla de negocio): el Buyer ve SOLO estimatedTotal; el
 * Traveler ve SOLO travelerReward; el desglose completo es dato interno
 * (admin). Ningún DTO público debe filtrar el split.
 */

export type SizeCategory = 'SMALL' | 'MEDIUM' | 'LARGE';

export const SIZE_CATEGORIES: SizeCategory[] = ['SMALL', 'MEDIUM', 'LARGE'];

export interface PricingConfig {
  baseFee: number;
  valueRate: number;
  valueCap: number;
  sizeFees: Record<SizeCategory, number>;
  platformRate: number;
}

export const PRICING_CONFIG = Symbol('PRICING_CONFIG');

export interface PricingQuote {
  travelerReward: number;
  platformFee: number;
  serviceTotal: number;
  estimatedTotal: number;
  breakdown: {
    baseFee: number;
    valueComponent: number;
    sizeComponent: number;
  };
}

export function quotePricing(
  estimatedPrice: number,
  size: SizeCategory,
  config: PricingConfig,
): PricingQuote {
  const price = Math.max(estimatedPrice, 0);
  const baseFee = round2(config.baseFee);
  const valueComponent = round2(config.valueRate * Math.min(price, config.valueCap));
  const sizeComponent = round2(config.sizeFees[size]);
  const travelerReward = round2(baseFee + valueComponent + sizeComponent);
  const platformFee = round2(config.platformRate * travelerReward);
  const serviceTotal = round2(travelerReward + platformFee);
  return {
    travelerReward,
    platformFee,
    serviceTotal,
    estimatedTotal: round2(price + serviceTotal),
    breakdown: { baseFee, valueComponent, sizeComponent },
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
