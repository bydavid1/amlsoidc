import { PricingConfig, quotePricing } from '../../domain/services/pricing-policy';

const config: PricingConfig = {
  baseFee: 5,
  valueRate: 0.05,
  valueCap: 1500,
  sizeFees: { SMALL: 3, MEDIUM: 8, LARGE: 15 },
  platformRate: 0.2,
};

describe('PricingPolicy (determinista, con comisión de plataforma)', () => {
  it('iPhone $1,099 MEDIUM: reward $67.95, comisión $13.59, total buyer $1,180.54', () => {
    const q = quotePricing(1099, 'MEDIUM', config);
    expect(q.travelerReward).toBe(67.95);
    expect(q.platformFee).toBe(13.59);
    expect(q.serviceTotal).toBe(81.54);
    expect(q.estimatedTotal).toBe(1180.54);
  });

  it('AirPods $249 SMALL: reward = 5 + 12.45 + 3 = $20.45', () => {
    const q = quotePricing(249, 'SMALL', config);
    expect(q.travelerReward).toBe(20.45);
    expect(q.breakdown).toEqual({ baseFee: 5, valueComponent: 12.45, sizeComponent: 3 });
  });

  it('PS5 $499 LARGE: reward $44.95', () => {
    expect(quotePricing(499, 'LARGE', config).travelerReward).toBe(44.95);
  });

  it('el componente de valor se topa en VALUE_CAP', () => {
    const expensive = quotePricing(10_000, 'MEDIUM', config);
    expect(expensive.breakdown.valueComponent).toBe(75);
    expect(expensive.travelerReward).toBe(quotePricing(1500, 'MEDIUM', config).travelerReward);
  });

  it('la comisión de plataforma es proporcional al reward', () => {
    const q = quotePricing(100, 'SMALL', config);
    expect(q.platformFee).toBe(Math.round(q.travelerReward * 0.2 * 100) / 100);
    expect(q.serviceTotal).toBe(q.travelerReward + q.platformFee);
  });

  it('precio negativo se trata como 0', () => {
    const q = quotePricing(-50, 'SMALL', config);
    expect(q.travelerReward).toBe(8);
    expect(q.estimatedTotal).toBe(q.serviceTotal);
  });

  it('mismos insumos → mismo resultado (reproducible)', () => {
    expect(quotePricing(777.77, 'LARGE', config)).toEqual(quotePricing(777.77, 'LARGE', config));
  });
});
