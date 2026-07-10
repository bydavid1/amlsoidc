import { AggregateRoot } from '../../../../shared/domain/aggregate-root';
import { DomainError } from '../../../../shared/domain/domain-error';
import { OrderCreatedEvent, OrderStatusChangedEvent } from '../events/order.events';
import {
  FulfillmentStatus,
  FulfillmentStrategy,
  FulfillmentType,
} from '../fulfillment/fulfillment-strategy';
import { SizeCategory } from '../services/pricing-policy';

/** NIVEL 1: backbone agnóstico al tipo de Fulfillment (docs/design/01-dominio.md §5). */
export type OrderStatus =
  | 'PENDING_ASSIGNMENT'
  | 'ASSIGNED'
  | 'SOURCING'
  | 'IN_TRANSIT'
  | 'READY_FOR_DELIVERY'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'DELIVERY_FAILED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'EXPIRED';

export interface FulfillmentState {
  id: string;
  type: FulfillmentType;
  status: FulfillmentStatus;
  /** Dirección de recepción del viajero en origen — el buyer la ve ANÓNIMA. */
  receivingAddressLine: string | null;
}

export interface StatusTransition {
  from: string | null;
  to: string;
  actor: string;
}

export interface OrderProps {
  id: string;
  buyerProfileId: string;
  buyerUserId: string;
  originCountryId: string;
  destinationCountryId: string;
  destinationCityId: string;
  productName: string;
  productUrl: string;
  estimatedPriceAmount: number;
  estimatedPriceCurrency: string;
  sizeCategory: SizeCategory;
  travelerRewardAmount: number;
  platformFeeAmount: number;
  neededBy: Date | null;
  status: OrderStatus;
  fulfillment: FulfillmentState | null;
  createdAt: Date;
}

/**
 * Agregado Order con máquina de estados de DOS niveles: el backbone (status)
 * es agnóstico al tipo de Fulfillment; el sub-flujo vive en fulfillment.status
 * y lo gobierna la FulfillmentStrategy. Cada transición queda registrada
 * (proyección OrderStatusHistory) y emite un evento de dominio.
 */
export class Order extends AggregateRoot {
  private transitions: StatusTransition[] = [];

  private constructor(private readonly props: OrderProps) {
    super();
  }

  static create(input: Omit<OrderProps, 'status' | 'fulfillment'> & { now: Date }): Order {
    if (input.estimatedPriceAmount < 0) {
      throw new DomainError('ORDER_PRICE_INVALID', 'Price must be >= 0', 'UNPROCESSABLE');
    }
    if (input.travelerRewardAmount < 0) {
      throw new DomainError('ORDER_REWARD_INVALID', 'Reward must be >= 0', 'UNPROCESSABLE');
    }
    const { now, ...props } = input;
    const order = new Order({ ...props, status: 'PENDING_ASSIGNMENT', fulfillment: null });
    order.transitions.push({ from: null, to: 'PENDING_ASSIGNMENT', actor: `buyer:${props.buyerUserId}` });
    order.record(
      new OrderCreatedEvent(now, {
        orderId: props.id,
        originCountryId: props.originCountryId,
        destinationCountryId: props.destinationCountryId,
      }),
    );
    return order;
  }

  static restore(props: OrderProps): Order {
    return new Order(props);
  }

  /** El Traveler aceptó la oferta: nace el Fulfillment con su sub-flujo inicial. */
  assign(
    fulfillmentId: string,
    strategy: FulfillmentStrategy,
    actor: string,
    now: Date,
  ): void {
    this.requireStatus(['PENDING_ASSIGNMENT'], 'assign');
    this.props.fulfillment = {
      id: fulfillmentId,
      type: strategy.type,
      status: strategy.initialStatus(),
      receivingAddressLine: null,
    };
    this.toStatus('ASSIGNED', actor, now);
  }

  /** El viajero registra dónde recibirá el producto (modelo hub, requerido para la compra). */
  setReceivingAddress(addressLine: string): void {
    this.requireStatus(['ASSIGNED', 'SOURCING'], 'setReceivingAddress');
    const f = this.requireFulfillment();
    const trimmed = addressLine.trim();
    if (trimmed.length < 10) {
      throw new DomainError(
        'RECEIVING_ADDRESS_INVALID',
        'Receiving address is too short',
        'UNPROCESSABLE',
      );
    }
    f.receivingAddressLine = trimmed;
  }

  /** Buyer compró el producto (sub-flujo) → el backbone entra en SOURCING. */
  confirmPurchase(strategy: FulfillmentStrategy, actor: string, now: Date): void {
    this.requireStatus(['ASSIGNED', 'SOURCING'], 'confirmPurchase');
    const f = this.requireFulfillment();
    // modelo hub: sin dirección de recepción no hay a dónde enviar el producto
    if (!f.receivingAddressLine) {
      throw new DomainError(
        'RECEIVING_ADDRESS_MISSING',
        'The traveler has not registered a receiving address yet',
        'CONFLICT',
      );
    }
    f.status = strategy.apply(f.status, 'CONFIRM_PURCHASE');
    this.recordFulfillmentTransition(f.status, actor, now);
    if (this.props.status === 'ASSIGNED') {
      this.toStatus('SOURCING', actor, now);
    }
  }

  /** El Traveler recibió el paquete (sub-flujo). */
  markReceivedByTraveler(strategy: FulfillmentStrategy, actor: string, now: Date): void {
    this.requireStatus(['ASSIGNED', 'SOURCING'], 'markReceivedByTraveler');
    const f = this.requireFulfillment();
    f.status = strategy.apply(f.status, 'MARK_RECEIVED');
    this.recordFulfillmentTransition(f.status, actor, now);
    if (this.props.status === 'ASSIGNED') {
      this.toStatus('SOURCING', actor, now);
    }
  }

  /** El Traveler viaja; requiere que el sub-flujo esté completo. */
  markInTransit(strategy: FulfillmentStrategy, actor: string, now: Date): void {
    this.requireStatus(['SOURCING'], 'markInTransit');
    const f = this.requireFulfillment();
    if (!strategy.isReadyForTransit(f.status)) {
      throw new DomainError(
        'FULFILLMENT_NOT_READY',
        `Fulfillment in status ${f.status} is not ready for transit`,
        'CONFLICT',
      );
    }
    this.toStatus('IN_TRANSIT', actor, now);
  }

  markArrived(actor: string, now: Date): void {
    this.requireStatus(['IN_TRANSIT'], 'markArrived');
    this.toStatus('READY_FOR_DELIVERY', actor, now);
  }

  /** La entrega la confirma el BUYER (decisión de dominio). */
  confirmDelivered(actor: string, now: Date): void {
    this.requireStatus(['READY_FOR_DELIVERY'], 'confirmDelivered');
    this.toStatus('DELIVERED', actor, now);
  }

  complete(actor: string, now: Date): void {
    this.requireStatus(['DELIVERED'], 'complete');
    this.toStatus('COMPLETED', actor, now);
  }

  /** Cualquier parte reporta un problema: excepción recuperable (H8). */
  markDisputed(actor: string, now: Date): void {
    this.requireStatus(
      ['ASSIGNED', 'SOURCING', 'IN_TRANSIT', 'READY_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED'],
      'markDisputed',
    );
    this.toStatus('DISPUTED', actor, now);
  }

  /** Resolución de disputa por Admin: cancelar el pedido. */
  cancelFromDispute(actor: string, now: Date): void {
    this.requireStatus(['DISPUTED'], 'cancelFromDispute');
    this.toStatus('CANCELLED', actor, now);
  }

  /** Resolución de disputa por Admin: retomar el estado previo (leído del historial). */
  resumeFromDispute(previous: OrderStatus, actor: string, now: Date): void {
    this.requireStatus(['DISPUTED'], 'resumeFromDispute');
    const resumable: OrderStatus[] = [
      'ASSIGNED',
      'SOURCING',
      'IN_TRANSIT',
      'READY_FOR_DELIVERY',
      'DELIVERED',
    ];
    if (!resumable.includes(previous)) {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot resume a dispute into status ${previous}`,
        'CONFLICT',
      );
    }
    this.toStatus(previous, actor, now);
  }

  /**
   * Cancelable solo antes de la compra (docs/design/01-dominio.md): en
   * PENDING_ASSIGNMENT siempre; con asignación, solo si aún no se compró.
   */
  cancel(actor: string, now: Date): { hadActiveAssignment: boolean } {
    const s = this.props.status;
    if (s === 'PENDING_ASSIGNMENT') {
      this.toStatus('CANCELLED', actor, now);
      return { hadActiveAssignment: false };
    }
    if (
      (s === 'ASSIGNED' || s === 'SOURCING') &&
      this.props.fulfillment?.status === 'AWAITING_PURCHASE'
    ) {
      this.toStatus('CANCELLED', actor, now);
      return { hadActiveAssignment: true };
    }
    throw new DomainError(
      'ORDER_NOT_CANCELLABLE',
      `Order in status ${s} (fulfillment ${this.props.fulfillment?.status ?? 'none'}) cannot be cancelled`,
      'CONFLICT',
    );
  }

  /** Sin match tras la ventana / máximo de intentos. */
  expire(now: Date): void {
    this.requireStatus(['PENDING_ASSIGNMENT'], 'expire');
    this.toStatus('EXPIRED', 'system', now);
  }

  /**
   * El Trip fue cancelado: si nadie compró aún, vuelve a matching; si ya se
   * compró, requiere intervención (DISPUTED).
   */
  returnToPending(actor: string, now: Date): void {
    this.requireStatus(['ASSIGNED', 'SOURCING'], 'returnToPending');
    if (this.props.fulfillment && this.props.fulfillment.status !== 'AWAITING_PURCHASE') {
      this.toStatus('DISPUTED', actor, now);
      return;
    }
    this.props.fulfillment = null;
    this.toStatus('PENDING_ASSIGNMENT', actor, now);
  }

  /** Drena las transiciones para que el repositorio las persista EN LA MISMA transacción. */
  pullStatusTransitions(): StatusTransition[] {
    const t = [...this.transitions];
    this.transitions = [];
    return t;
  }

  private toStatus(to: OrderStatus, actor: string, now: Date): void {
    const from = this.props.status;
    this.props.status = to;
    this.transitions.push({ from, to, actor });
    this.record(
      new OrderStatusChangedEvent(now, { orderId: this.props.id, from, to, actor }),
    );
  }

  private recordFulfillmentTransition(to: FulfillmentStatus, actor: string, now: Date): void {
    // el sub-flujo también queda en el historial, con prefijo para distinguir nivel
    this.transitions.push({ from: null, to: `fulfillment:${to}`, actor });
    this.record(
      new OrderStatusChangedEvent(now, {
        orderId: this.props.id,
        from: null,
        to: `fulfillment:${to}`,
        actor,
      }),
    );
  }

  private requireStatus(allowed: OrderStatus[], action: string): void {
    if (!allowed.includes(this.props.status)) {
      throw new DomainError(
        'INVALID_STATE_TRANSITION',
        `Cannot ${action} an order in status ${this.props.status}`,
        'CONFLICT',
      );
    }
  }

  private requireFulfillment(): FulfillmentState {
    if (!this.props.fulfillment) {
      throw new DomainError('FULFILLMENT_MISSING', 'Order has no fulfillment yet', 'CONFLICT');
    }
    return this.props.fulfillment;
  }

  // getters
  get id(): string {
    return this.props.id;
  }
  get buyerProfileId(): string {
    return this.props.buyerProfileId;
  }
  get buyerUserId(): string {
    return this.props.buyerUserId;
  }
  get originCountryId(): string {
    return this.props.originCountryId;
  }
  get destinationCountryId(): string {
    return this.props.destinationCountryId;
  }
  get destinationCityId(): string {
    return this.props.destinationCityId;
  }
  get productName(): string {
    return this.props.productName;
  }
  get productUrl(): string {
    return this.props.productUrl;
  }
  get estimatedPriceAmount(): number {
    return this.props.estimatedPriceAmount;
  }
  get estimatedPriceCurrency(): string {
    return this.props.estimatedPriceCurrency;
  }
  get sizeCategory(): SizeCategory {
    return this.props.sizeCategory;
  }
  get travelerRewardAmount(): number {
    return this.props.travelerRewardAmount;
  }
  get platformFeeAmount(): number {
    return this.props.platformFeeAmount;
  }
  /** Total aproximado que paga el Buyer (única cifra que él ve). */
  get estimatedTotalAmount(): number {
    return (
      Math.round(
        (this.props.estimatedPriceAmount +
          this.props.travelerRewardAmount +
          this.props.platformFeeAmount) *
          100,
      ) / 100
    );
  }
  get neededBy(): Date | null {
    return this.props.neededBy;
  }
  get status(): OrderStatus {
    return this.props.status;
  }
  get fulfillment(): FulfillmentState | null {
    return this.props.fulfillment ? { ...this.props.fulfillment } : null;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
}
