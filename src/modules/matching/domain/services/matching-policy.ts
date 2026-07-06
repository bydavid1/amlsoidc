/**
 * Política de matching PURA y DETERMINISTA (sin IA, sin reloj propio, sin
 * aleatoriedad): mismos datos → mismo ranking. Explicable: cada score se
 * descompone en factores auditables que se persisten en el Assignment.
 * (docs/design/06-matching.md §3)
 */

export interface MatchingWeights {
  time: number;
  reputation: number;
  capacity: number;
  fairness: number;
  load: number;
}

export interface MatchingConfig {
  reputationMin: number;
  reputationColdStart: number;
  weights: MatchingWeights;
  acceptanceWindowMinutes: number;
  maxReassignAttempts: number;
  maxCandidates: number;
  maxParallelPerTraveler: number;
}

export const MATCHING_CONFIG = Symbol('MATCHING_CONFIG');

export interface OrderToMatch {
  requiredCapacity: number;
  neededBy: Date | null;
  createdAt: Date;
}

export interface ScorableCandidate {
  tripId: string;
  travelerProfileId: string;
  arrivalDate: Date;
  totalCapacity: number;
  remainingCapacity: number;
  reputationScore: number;
  reputationCount: number;
  activeLoad: number;
}

export interface RankedCandidate {
  candidate: ScorableCandidate;
  total: number;
  breakdown: Record<string, number>;
}

const DAY_MS = 86_400_000;
const MAX_WINDOW_DAYS = 30;
const MAX_WAIT_HOURS = 72;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreCandidate(
  order: OrderToMatch,
  candidate: ScorableCandidate,
  config: MatchingConfig,
  now: Date,
): RankedCandidate {
  // timeFit: cercanía a la fecha ideal; sin neededBy, favorece llegar pronto
  const ideal = order.neededBy ?? now;
  const deltaDays = Math.abs(candidate.arrivalDate.getTime() - ideal.getTime()) / DAY_MS;
  const timeFit = clamp01(1 - deltaDays / MAX_WINDOW_DAYS);

  // reputación normalizada; cold-start neutro para Travelers sin historial
  const effectiveReputation =
    candidate.reputationCount === 0 ? config.reputationColdStart : candidate.reputationScore;
  const reputationNorm = clamp01(effectiveReputation / 5);

  // capacityFit: penaliza tanto el sobre-ajuste como el desperdicio extremo
  const slack = (candidate.remainingCapacity - order.requiredCapacity) / candidate.totalCapacity;
  const capacityFit = clamp01(1 - Math.abs(slack - 0.5) * 2);

  // fairness: pedidos más antiguos en cola puntúan más (anti-inanición)
  const waitingHours = Math.max(0, now.getTime() - order.createdAt.getTime()) / 3_600_000;
  const queueAge = clamp01(waitingHours / MAX_WAIT_HOURS);

  // load: repartir trabajo entre Travelers
  const loadNorm = clamp01(candidate.activeLoad / config.maxParallelPerTraveler);

  const breakdown: Record<string, number> = {
    timeFit: round4(config.weights.time * timeFit),
    reputation: round4(config.weights.reputation * reputationNorm),
    capacityFit: round4(config.weights.capacity * capacityFit),
    queueAge: round4(config.weights.fairness * queueAge),
    load: round4(config.weights.load * (1 - loadNorm)),
  };
  const total = round4(Object.values(breakdown).reduce((a, b) => a + b, 0));

  return { candidate, total, breakdown: { ...breakdown, total } };
}

/**
 * Ranking con desempate DETERMINISTA (docs/design/06-matching.md §3):
 * score → reputación → llegada más temprana → menor carga → tripId.
 * El último criterio garantiza reproducibilidad total.
 */
export function rankCandidates(
  order: OrderToMatch,
  candidates: ScorableCandidate[],
  config: MatchingConfig,
  now: Date,
): RankedCandidate[] {
  return candidates
    .map((c) => scoreCandidate(order, c, config, now))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.candidate.reputationScore !== a.candidate.reputationScore) {
        return b.candidate.reputationScore - a.candidate.reputationScore;
      }
      const arrivalDiff = a.candidate.arrivalDate.getTime() - b.candidate.arrivalDate.getTime();
      if (arrivalDiff !== 0) return arrivalDiff;
      if (a.candidate.activeLoad !== b.candidate.activeLoad) {
        return a.candidate.activeLoad - b.candidate.activeLoad;
      }
      return a.candidate.tripId < b.candidate.tripId ? -1 : 1;
    });
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
