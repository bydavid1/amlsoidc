import {
  MatchingConfig,
  rankCandidates,
  ScorableCandidate,
} from '../../domain/services/matching-policy';

const config: MatchingConfig = {
  reputationMin: 0,
  reputationColdStart: 3.5,
  weights: { time: 0.35, reputation: 0.3, capacity: 0.15, fairness: 0.15, load: 0.05 },
  acceptanceWindowMinutes: 30,
  maxReassignAttempts: 5,
  maxCandidates: 20,
  maxParallelPerTraveler: 3,
};

const now = new Date('2026-07-06T12:00:00Z');
const order = {
  requiredCapacity: 1,
  neededBy: new Date('2026-07-20T00:00:00Z'),
  createdAt: new Date('2026-07-05T12:00:00Z'),
};

function candidate(overrides: Partial<ScorableCandidate>): ScorableCandidate {
  return {
    tripId: 'trip-a',
    travelerProfileId: 'tp-a',
    arrivalDate: new Date('2026-07-18T00:00:00Z'),
    totalCapacity: 4,
    remainingCapacity: 3,
    reputationScore: 4,
    reputationCount: 10,
    activeLoad: 0,
    ...overrides,
  };
}

describe('MatchingPolicy (determinista, sin IA)', () => {
  it('mismos datos → mismo ranking (reproducible)', () => {
    const candidates = [
      candidate({ tripId: 'trip-a' }),
      candidate({ tripId: 'trip-b', reputationScore: 5 }),
      candidate({ tripId: 'trip-c', arrivalDate: new Date('2026-07-25T00:00:00Z') }),
    ];
    const first = rankCandidates(order, candidates, config, now);
    const second = rankCandidates(order, [...candidates].reverse(), config, now);
    expect(first.map((r) => r.candidate.tripId)).toEqual(second.map((r) => r.candidate.tripId));
  });

  it('mayor reputación gana con todo lo demás igual', () => {
    const ranked = rankCandidates(
      order,
      [candidate({ tripId: 'trip-low', reputationScore: 2 }), candidate({ tripId: 'trip-high', reputationScore: 5 })],
      config,
      now,
    );
    expect(ranked[0].candidate.tripId).toBe('trip-high');
  });

  it('llegada más cercana a la fecha ideal gana sobre llegada lejana', () => {
    const ranked = rankCandidates(
      order,
      [
        candidate({ tripId: 'trip-far', arrivalDate: new Date('2026-08-10T00:00:00Z') }),
        candidate({ tripId: 'trip-near', arrivalDate: new Date('2026-07-19T00:00:00Z') }),
      ],
      config,
      now,
    );
    expect(ranked[0].candidate.tripId).toBe('trip-near');
  });

  it('cold-start: Traveler sin calificaciones usa el score neutro configurable', () => {
    const ranked = rankCandidates(
      order,
      [
        candidate({ tripId: 'trip-new', reputationScore: 0, reputationCount: 0 }),
        candidate({ tripId: 'trip-bad', reputationScore: 1, reputationCount: 5 }),
      ],
      config,
      now,
    );
    // 3.5 (cold start) > 1.0 (mala reputación real)
    expect(ranked[0].candidate.tripId).toBe('trip-new');
  });

  it('empate total desempata por tripId ascendente (reproducibilidad)', () => {
    const ranked = rankCandidates(
      order,
      [candidate({ tripId: 'trip-z' }), candidate({ tripId: 'trip-a' })],
      config,
      now,
    );
    expect(ranked[0].candidate.tripId).toBe('trip-a');
  });

  it('el desglose del score es auditable y suma el total', () => {
    const [best] = rankCandidates(order, [candidate({})], config, now);
    const { total, ...factors } = best.breakdown;
    const sum = Object.values(factors).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - total)).toBeLessThan(0.001);
    expect(Object.keys(factors)).toEqual(
      expect.arrayContaining(['timeFit', 'reputation', 'capacityFit', 'queueAge', 'load']),
    );
  });
});
