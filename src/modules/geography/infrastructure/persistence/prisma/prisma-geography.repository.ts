import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../core/prisma/prisma.service';
import {
  CityRow,
  CorridorRow,
  CountryRow,
  GeographyRepository,
} from '../../../domain/repositories/geography.repository';
import { CorridorPolicy } from '../../../domain/services/corridor-policy';

@Injectable()
export class PrismaGeographyRepository implements GeographyRepository, CorridorPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async listCountries(
    page: number,
    pageSize: number,
  ): Promise<{ items: CountryRow[]; total: number }> {
    const [items, total] = await Promise.all([
      this.prisma.client.country.findMany({
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.country.count(),
    ]);
    return { items, total };
  }

  async listCities(
    countryId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: CityRow[]; total: number }> {
    const where = { countryId };
    const [items, total] = await Promise.all([
      this.prisma.client.city.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.city.count({ where }),
    ]);
    return { items, total };
  }

  async listEnabledCorridors(): Promise<CorridorRow[]> {
    const corridors = await this.prisma.client.enabledCorridor.findMany({
      where: { isActive: true },
    });
    if (corridors.length === 0) {
      return [];
    }
    const countryIds = [
      ...new Set(corridors.flatMap((c) => [c.originCountryId, c.destinationCountryId])),
    ];
    const countries = await this.prisma.client.country.findMany({
      where: { id: { in: countryIds } },
    });
    const byId = new Map(countries.map((c) => [c.id, c]));
    return corridors.flatMap((c) => {
      const origin = byId.get(c.originCountryId);
      const destination = byId.get(c.destinationCountryId);
      return origin && destination ? [{ origin, destination }] : [];
    });
  }

  async findCountryByIso2(iso2: string): Promise<CountryRow | null> {
    return this.prisma.client.country.findUnique({ where: { iso2: iso2.toUpperCase() } });
  }

  async findCityById(id: string): Promise<CityRow | null> {
    return this.prisma.client.city.findUnique({ where: { id } });
  }

  async isEnabled(originCountryId: string, destinationCountryId: string): Promise<boolean> {
    const corridor = await this.prisma.client.enabledCorridor.findUnique({
      where: {
        originCountryId_destinationCountryId: { originCountryId, destinationCountryId },
      },
    });
    return corridor?.isActive === true;
  }
}
