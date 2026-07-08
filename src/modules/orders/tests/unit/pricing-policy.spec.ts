import {
  calculateTravelerReward,
  PricingConfig,
} from '../../domain/services/pricing-policy';

const config: PricingConfig = {
  baseFee: 5,
  valueRate: 0.05,
  valueCap: 1500,
  sizeFees: { SMALL: 3, MEDIUM: 8, LARGE: 15 },
};

describe('PricingPolicy (determinista y explicable)', () => {
  it('AirPods $249 SMALL → 5 + 12.45 + 3 = $20.45', () => {
    const quote = calculateTravelerReward(249, 'SMALL', config);
    expect(quote.total).toBe(20.45);
    expect(quote.breakdown).toEqual({ baseFee: 5, valueComponent: 12.45, sizeComponent: 3 });
  });

  it('iPhone $1,099 MEDIUM → 5 + 54.95 + 8 = $67.95', () => {
    expect(calculateTravelerReward(1099, 'MEDIUM', config).total).toBe(67.95);
  });

  it('PS5 $499 LARGE → 5 + 24.95 + 15 = $44.95', () => {
    expect(calculateTravelerReward(499, 'LARGE', config).total).toBe(44.95);
  });

  it('el componente de valor se topa en VALUE_CAP (artículos muy caros no lo inflan)', () => {
    const expensive = calculateTravelerReward(10_000, 'MEDIUM', config);
    const atCap = calculateTravelerReward(1500, 'MEDIUM', config);
    expect(expensive.total).toBe(atCap.total);
    expect(expensive.breakdown.valueComponent).toBe(75);
  });

  it('precio negativo no rompe el cálculo (se trata como 0)', () => {
    expect(calculateTravelerReward(-50, 'SMALL', config).total).toBe(8);
  });

  it('mismos insumos → mismo resultado (reproducible)', () => {
    const a = calculateTravelerReward(777.77, 'LARGE', config);
    const b = calculateTravelerReward(777.77, 'LARGE', config);
    expect(a).toEqual(b);
  });
});
