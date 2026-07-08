import { DomainError } from '../../../../shared/domain/domain-error';
import { Order } from '../../domain/entities/order.entity';
import { BuyerShipsToTravelerStrategy } from '../../domain/fulfillment/fulfillment-strategy';

const now = new Date('2026-07-06T12:00:00Z');
const strategy = new BuyerShipsToTravelerStrategy();

function createOrder(): Order {
  const order = Order.create({
    id: 'order-1',
    buyerProfileId: 'bp-1',
    buyerUserId: 'user-buyer',
    originCountryId: 'us',
    destinationCountryId: 'sv',
    destinationCityId: 'city-1',
    productName: 'iPhone',
    productUrl: 'https://apple.com',
    estimatedPriceAmount: 999,
    estimatedPriceCurrency: 'USD',
    sizeCategory: 'MEDIUM' as const,
    travelerRewardAmount: 67.95,
    neededBy: null,
    createdAt: now,
    now,
  });
  order.pullDomainEvents();
  order.pullStatusTransitions();
  return order;
}

describe('Order — máquina de estados de dos niveles', () => {
  it('flujo feliz completo: PENDING → ... → DELIVERED con sub-flujo del Fulfillment', () => {
    const order = createOrder();

    order.assign('f-1', strategy, 'traveler:t1', now);
    expect(order.status).toBe('ASSIGNED');
    expect(order.fulfillment?.status).toBe('AWAITING_PURCHASE');

    order.confirmPurchase(strategy, 'buyer:b1', now);
    expect(order.status).toBe('SOURCING');
    expect(order.fulfillment?.status).toBe('PURCHASED');

    order.markReceivedByTraveler(strategy, 'traveler:t1', now);
    expect(order.fulfillment?.status).toBe('RECEIVED_BY_TRAVELER');

    order.markInTransit(strategy, 'traveler:t1', now);
    expect(order.status).toBe('IN_TRANSIT');

    order.markArrived('traveler:t1', now);
    expect(order.status).toBe('READY_FOR_DELIVERY');

    order.confirmDelivered('buyer:b1', now);
    expect(order.status).toBe('DELIVERED');
  });

  it('no se pueden saltar estados (invariante del dominio)', () => {
    const order = createOrder();
    expect(() => order.confirmDelivered('buyer:b1', now)).toThrow(DomainError);
    expect(() => order.markInTransit(strategy, 't', now)).toThrow(DomainError);
  });

  it('no se puede viajar sin que el fulfillment esté listo', () => {
    const order = createOrder();
    order.assign('f-1', strategy, 'traveler:t1', now);
    order.confirmPurchase(strategy, 'buyer:b1', now); // PURCHASED, aún no RECEIVED
    expect(() => order.markInTransit(strategy, 'traveler:t1', now)).toThrow(
      expect.objectContaining({ code: 'FULFILLMENT_NOT_READY' }),
    );
  });

  it('el sub-flujo respeta su orden: no se puede recibir sin comprar', () => {
    const order = createOrder();
    order.assign('f-1', strategy, 'traveler:t1', now);
    expect(() => order.markReceivedByTraveler(strategy, 't', now)).toThrow(
      expect.objectContaining({ code: 'INVALID_FULFILLMENT_TRANSITION' }),
    );
  });

  it('cancelable antes de la compra; NO cancelable después', () => {
    const order = createOrder();
    order.assign('f-1', strategy, 'traveler:t1', now);
    order.confirmPurchase(strategy, 'buyer:b1', now);
    expect(() => order.cancel('buyer:b1', now)).toThrow(
      expect.objectContaining({ code: 'ORDER_NOT_CANCELLABLE' }),
    );
  });

  it('trip cancelado tras la compra → DISPUTED; antes de la compra → vuelve a matching', () => {
    const purchased = createOrder();
    purchased.assign('f-1', strategy, 'traveler:t1', now);
    purchased.confirmPurchase(strategy, 'buyer:b1', now);
    purchased.returnToPending('system', now);
    expect(purchased.status).toBe('DISPUTED');

    const unpurchased = createOrder();
    unpurchased.assign('f-2', strategy, 'traveler:t1', now);
    unpurchased.returnToPending('system', now);
    expect(unpurchased.status).toBe('PENDING_ASSIGNMENT');
    expect(unpurchased.fulfillment).toBeNull();
  });

  it('registra cada transición para el historial (misma transacción)', () => {
    const order = createOrder();
    order.assign('f-1', strategy, 'traveler:t1', now);
    order.confirmPurchase(strategy, 'buyer:b1', now);
    const transitions = order.pullStatusTransitions();
    expect(transitions.map((t) => t.to)).toEqual([
      'ASSIGNED',
      'fulfillment:PURCHASED',
      'SOURCING',
    ]);
    // se drenan una sola vez
    expect(order.pullStatusTransitions()).toHaveLength(0);
  });
});
