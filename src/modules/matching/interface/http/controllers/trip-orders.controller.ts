import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Roles } from '../../../../../shared/auth/decorators';
import { MatchableOrderView } from '../../../../orders/application/orders-coordination.service';
import { ClaimService } from '../../../application/use-cases/claim.use-cases';
import { AssignmentResponseDto } from '../dto/assignments.dto';

export class AvailableOrderDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'iPhone 15 Pro' })
  productName: string;

  @ApiProperty({ enum: ['SMALL', 'MEDIUM', 'LARGE'], example: 'MEDIUM' })
  sizeCategory: string;

  @ApiProperty({ example: 1099.99 })
  estimatedPriceAmount: number;

  @ApiProperty({ example: 'USD' })
  estimatedPriceCurrency: string;

  @ApiProperty({ example: 67.95, description: 'Lo que ganará el viajero por llevarlo' })
  travelerRewardAmount: number;

  @ApiProperty()
  destinationCityId: string;

  @ApiProperty({ nullable: true })
  neededBy: Date | null;

  @ApiProperty()
  createdAt: Date;
}

function toDto(order: MatchableOrderView): AvailableOrderDto {
  return {
    id: order.id,
    productName: order.productName,
    sizeCategory: order.sizeCategory,
    estimatedPriceAmount: order.estimatedPriceAmount,
    estimatedPriceCurrency: order.estimatedPriceCurrency,
    travelerRewardAmount: order.travelerRewardAmount,
    destinationCityId: order.destinationCityId,
    neededBy: order.neededBy,
    createdAt: order.createdAt,
  };
}

/**
 * Discovery + claim (docs/design/09-modelo-claim-y-pricing.md): el Traveler
 * explora encargos compatibles con SU viaje y reclama los que le quepan.
 */
@ApiTags('Assignments')
@ApiBearerAuth()
@Controller('trips/:tripId')
@Roles('TRAVELER')
export class TripOrdersController {
  constructor(private readonly claimService: ClaimService) {}

  @Get('available-orders')
  @ApiOperation({
    summary: 'Encargos disponibles para este viaje (mismo corredor, fecha compatible)',
  })
  @ApiOkResponse({ type: AvailableOrderDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId', ParseUUIDPipe) tripId: string,
  ): Promise<AvailableOrderDto[]> {
    const orders = await this.claimService.listAvailableOrders(user.id, tripId);
    return orders.map(toDto);
  }

  @Post('claim/:orderId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Reclamar un encargo para este viaje (el primero gana; 409 si ya fue tomado)',
  })
  @ApiOkResponse({ type: AssignmentResponseDto })
  async claim(
    @CurrentUser() user: AuthenticatedUser,
    @Param('tripId', ParseUUIDPipe) tripId: string,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<AssignmentResponseDto> {
    const a = await this.claimService.claim(user.id, tripId, orderId);
    return {
      id: a.id,
      orderId: a.orderId,
      tripId: a.tripId,
      status: a.status,
      offeredAt: a.offeredAt,
      expiresAt: a.expiresAt,
      respondedAt: a.respondedAt,
    };
  }
}
