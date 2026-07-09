import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
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
import { Trip } from '../../../domain/entities/trip.entity';
import {
  CancelTripUseCase,
  CloseTripUseCase,
  CreateTripUseCase,
  GetMyTripUseCase,
  ListMyTripsUseCase,
  PublishTripUseCase,
} from '../../../application/use-cases/trips.use-cases';
import { CreateTripDto, ListTripsQueryDto, TripResponseDto } from '../dto/trips.dto';

function toDto(trip: Trip): TripResponseDto {
  return {
    id: trip.id,
    originCountryId: trip.originCountryId,
    destinationCountryId: trip.destinationCountryId,
    destinationCityId: trip.destinationCityId,
    arrivalDate: trip.arrivalDate,
    status: trip.status,
  };
}

@ApiTags('Trips')
@ApiBearerAuth()
@Controller('trips')
@Roles('TRAVELER')
export class TripsController {
  constructor(
    private readonly createTrip: CreateTripUseCase,
    private readonly publishTrip: PublishTripUseCase,
    private readonly closeTrip: CloseTripUseCase,
    private readonly cancelTrip: CancelTripUseCase,
    private readonly listMyTrips: ListMyTripsUseCase,
    private readonly getMyTrip: GetMyTripUseCase,
  ) {}

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de MI viaje' })
  @ApiOkResponse({ type: TripResponseDto })
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TripResponseDto> {
    return toDto(await this.getMyTrip.execute(user.id, tripId));
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar viaje: ya tomé mis encargos, no quiero ver más disponibles (≠ cancelar)',
  })
  @ApiOkResponse({ type: TripResponseDto })
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TripResponseDto> {
    return toDto(await this.closeTrip.execute(user.id, tripId));
  }

  @Post()
  @ApiOperation({ summary: 'Crear viaje (queda en DRAFT hasta publicarlo)' })
  @ApiCreatedResponse({ type: TripResponseDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTripDto,
  ): Promise<TripResponseDto> {
    const trip = await this.createTrip.execute({
      userId: user.id,
      originCountryId: dto.originCountryId,
      destinationCountryId: dto.destinationCountryId,
      destinationCityId: dto.destinationCityId ?? null,
      arrivalDate: dto.arrivalDate,
    });
    return toDto(trip);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publicar viaje (DRAFT → OPEN; re-evalúa pedidos pendientes del corredor)' })
  @ApiOkResponse({ type: TripResponseDto })
  async publish(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<TripResponseDto> {
    return toDto(await this.publishTrip.execute(user.id, tripId));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancelar viaje: sus pedidos asignados vuelven a matching automáticamente',
  })
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) tripId: string,
  ): Promise<{ affectedOrderIds: string[] }> {
    return this.cancelTrip.execute(user.id, tripId);
  }

  @Get()
  @ApiOperation({ summary: 'Mis viajes (cursor + filtro por estado)' })
  @ApiOkResponse({ type: TripResponseDto, isArray: true })
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTripsQueryDto,
  ): Promise<CursorPage<unknown>> {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.listMyTrips.execute(user.id, query.limit, cursor, query.status);
    return CursorPage.of(rows, query.limit);
  }
}
