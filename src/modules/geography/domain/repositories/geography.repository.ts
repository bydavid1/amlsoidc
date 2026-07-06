export const GEOGRAPHY_REPOSITORY = Symbol('GEOGRAPHY_REPOSITORY');

export interface CountryRow {
  id: string;
  iso2: string;
  name: string;
}

export interface CityRow {
  id: string;
  countryId: string;
  name: string;
}

export interface CorridorRow {
  origin: CountryRow;
  destination: CountryRow;
}

/** Puerto de lectura del catálogo geográfico. */
export interface GeographyRepository {
  listCountries(page: number, pageSize: number): Promise<{ items: CountryRow[]; total: number }>;
  listCities(
    countryId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: CityRow[]; total: number }>;
  listEnabledCorridors(): Promise<CorridorRow[]>;
  findCountryByIso2(iso2: string): Promise<CountryRow | null>;
  findCityById(id: string): Promise<CityRow | null>;
}
