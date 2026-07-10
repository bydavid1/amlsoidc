import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Roles } from '../../../../../shared/auth/decorators';
import { CursorPage, decodeCursor } from '../../../../../shared/http/cursor-pagination';
import {
  CancelOrderUseCase,
  ConfirmDeliveryUseCase,
  ConfirmPurchaseUseCase,
  CreateOrderUseCase,
  GetMyOrderUseCase,
  ListMyOrdersUseCase,
} from '../../../application/use-cases/orders.use-cases';
import {
  CreateOrderDto,
  ListOrdersQueryDto,
  OrderDetailResponseDto,
  OrderResponseDto,
  OrderTimelineEntryDto,
} from '../dto/orders.dto';

/**
 * Endpoints orientados a ACCIONES de negocio, nunca PATCH de estado: la
 * máquina de estados del dominio es la única fuente de verdad
 * (docs/design/04-api.md §4). El Buyer no ve ni elige candidatos.
 */
@ApiTags('Orders')
@ApiBearerAuth()
@Controller('orders')
@Roles('BUYER')
export class OrdersController {
  constructor(
    private readonly createOrder: CreateOrderUseCase,
    private readonly confirmPurchase: ConfirmPurchaseUseCase,
    private readonly confirmDelivery: ConfirmDeliveryUseCase,
    private readonly cancelOrder: CancelOrderUseCase,
    private readonly listMyOrders: ListMyOrdersUseCase,
    private readonly getMyOrder: GetMyOrderUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Crear pedido (dispara el matching automático)' })
  @ApiCreatedResponse({ type: OrderResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.createOrder.execute({
      userId: user.id,
      originCountryId: dto.originCountryId,
      destinationCountryId: dto.destinationCountryId,
      destinationCityId: dto.destinationCityId,
      productName: dto.productName,
      productUrl: dto.productUrl,
      estimatedPriceAmount: dto.estimatedPriceAmount,
      estimatedPriceCurrency: dto.estimatedPriceCurrency,
      sizeCategory: dto.sizeCategory,
      neededBy: dto.neededBy ?? null,
    });
    return OrderResponseDto.from(order);
  }

  @Get()
  @ApiOperation({ summary: 'Mis pedidos (cursor + filtro por estado)' })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<CursorPage<unknown>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.listMyOrders.execute(user.id, query.limit, cursor, query.status);
    return CursorPage.of(rows, query.limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle del pedido + timeline de estados' })
  @ApiOkResponse({ type: OrderDetailResponseDto })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderDetailResponseDto> {
    const { order, timeline, traveler } = await this.getMyOrder.execute(user.id, orderId);
    const dto = OrderResponseDto.from(order) as OrderDetailResponseDto;
    dto.timeline = timeline.map(OrderTimelineEntryDto.from);
    dto.traveler = traveler;
    dto.receivingAddress = order.fulfillment?.receivingAddressLine ?? null;
    return dto;
  }

  @Post(':id/confirm-purchase')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Buyer confirma que compró el producto (sub-flujo → PURCHASED)' })
  @ApiOkResponse({ type: OrderResponseDto })
  async purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.confirmPurchase.execute(user.id, orderId));
  }

  @Post(':id/confirm-delivery')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'BUYER confirma la entrega (READY_FOR_DELIVERY → DELIVERED)' })
  @ApiOkResponse({ type: OrderResponseDto })
  async delivery(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.confirmDelivery.execute(user.id, orderId));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar pedido (solo antes de la compra)' })
  @ApiOkResponse({ type: OrderResponseDto })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) orderId: string,
  ): Promise<OrderResponseDto> {
    return OrderResponseDto.from(await this.cancelOrder.execute(user.id, orderId));
  }
}
