import { Controller, Get, Inject, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../../shared/auth/decorators';
import { PaginatedResult } from '../../../../../shared/http/paginated-result';
import { OffsetPaginationDto } from '../../../../../shared/http/offset-pagination.dto';
import {
  GEOGRAPHY_REPOSITORY,
  GeographyRepository,
} from '../../../domain/repositories/geography.repository';
import { CityResponseDto, CorridorResponseDto, CountryResponseDto } from '../dto/locations.dto';

@ApiTags('Locations')
@Controller()
@Public()
export class LocationsController {
  constructor(
    @Inject(GEOGRAPHY_REPOSITORY) private readonly geography: GeographyRepository,
  ) {}

  @Get('countries')
  @ApiOperation({ summary: 'Catálogo de países (paginación offset)' })
  @ApiOkResponse({ type: CountryResponseDto, isArray: true })
  async countries(@Query() pagination: OffsetPaginationDto): Promise<PaginatedResult<CountryResponseDto>> {
    const { items, total } = await this.geography.listCountries(
      pagination.page,
      pagination.pageSize,
    );
    return PaginatedResult.of(items, total, pagination.page, pagination.pageSize);
  }

  @Get('countries/:id/cities')
  @ApiOperation({ summary: 'Ciudades de un país (paginación offset)' })
  @ApiOkResponse({ type: CityResponseDto, isArray: true })
  async cities(
    @Param('id', ParseUUIDPipe) countryId: string,
    @Query() pagination: OffsetPaginationDto,
  ): Promise<PaginatedResult<CityResponseDto>> {
    const { items, total } = await this.geography.listCities(
      countryId,
      pagination.page,
      pagination.pageSize,
    );
    return PaginatedResult.of(items, total, pagination.page, pagination.pageSize);
  }

  @Get('corridors')
  @ApiOperation({ summary: 'Corredores habilitados (origen → destino)' })
  @ApiOkResponse({ type: CorridorResponseDto, isArray: true })
  corridors(): Promise<CorridorResponseDto[]> {
    return this.geography.listEnabledCorridors();
  }
}
