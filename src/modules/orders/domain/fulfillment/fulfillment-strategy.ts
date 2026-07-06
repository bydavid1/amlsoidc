import { DomainError } from '../../../../shared/domain/domain-error';

export type FulfillmentType =
  | 'BUYER_SHIPS_TO_TRAVELER'
  | 'CUSTOMER_SHIPS_TO_TRAVELER'
  | 'TRAVELER_PURCHASES_PRODUCT'
  | 'WAREHOUSE_FULFILLMENT'
  | 'LOCAL_INVENTORY';

export type FulfillmentStatus = 'AWAITING_PURCHASE' | 'PURCHASED' | 'RECEIVED_BY_TRAVELER';

export type FulfillmentAction = 'CONFIRM_PURCHASE' | 'MARK_RECEIVED';

/** Tipo del MVP; los demás se agregan como nuevas strategies sin tocar Order. */
export const MVP_FULFILLMENT_TYPE: FulfillmentType = 'BUYER_SHIPS_TO_TRAVELER';

/**
 * Strategy de dominio (docs/design/01-dominio.md §7): cada tipo de Fulfillment
 * define SU sub-flujo (nivel 2 de la máquina de estados). Agregar
 * WAREHOUSE_FULFILLMENT = nueva clase + registrarla en el resolver; Order,
 * Trip y Assignment no se modifican (requisito explícito del negocio).
 */
export interface FulfillmentStrategy {
  readonly type: FulfillmentType;
  initialStatus(): FulfillmentStatus;
  /** Aplica una acción del sub-flujo; lanza DomainError si la transición es inválida. */
  apply(current: FulfillmentStatus, action: FulfillmentAction): FulfillmentStatus;
  /** ¿El fulfillment está listo para que el Traveler viaje? */
  isReadyForTransit(status: FulfillmentStatus): boolean;
}

/** Sub-flujo MVP: AWAITING_PURCHASE → PURCHASED → RECEIVED_BY_TRAVELER. */
export class BuyerShipsToTravelerStrategy implements FulfillmentStrategy {
  readonly type: FulfillmentType = 'BUYER_SHIPS_TO_TRAVELER';

  initialStatus(): FulfillmentStatus {
    return 'AWAITING_PURCHASE';
  }

  apply(current: FulfillmentStatus, action: FulfillmentAction): FulfillmentStatus {
    if (action === 'CONFIRM_PURCHASE' && current === 'AWAITING_PURCHASE') {
      return 'PURCHASED';
    }
    if (action === 'MARK_RECEIVED' && current === 'PURCHASED') {
      return 'RECEIVED_BY_TRAVELER';
    }
    throw new DomainError(
      'INVALID_FULFILLMENT_TRANSITION',
      `Action ${action} is not valid in fulfillment status ${current}`,
      'CONFLICT',
    );
  }

  isReadyForTransit(status: FulfillmentStatus): boolean {
    return status === 'RECEIVED_BY_TRAVELER';
  }
}

/**
 * Resolver puro (sin NestJS): las strategies se registran en el composition
 * root del módulo. Un tipo no registrado = no soportado todavía.
 */
export class FulfillmentStrategyResolver {
  private readonly byType: Map<FulfillmentType, FulfillmentStrategy>;

  constructor(strategies: FulfillmentStrategy[]) {
    this.byType = new Map(strategies.map((s) => [s.type, s]));
  }

  resolve(type: FulfillmentType): FulfillmentStrategy {
    const strategy = this.byType.get(type);
    if (!strategy) {
      throw new DomainError(
        'FULFILLMENT_TYPE_NOT_SUPPORTED',
        `Fulfillment type ${type} is not supported yet`,
        'UNPROCESSABLE',
      );
    }
    return strategy;
  }
}
