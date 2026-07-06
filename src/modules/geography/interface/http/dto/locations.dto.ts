import { ApiProperty } from '@nestjs/swagger';

export class CountryResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'SV' })
  iso2: string;

  @ApiProperty({ example: 'El Salvador' })
  name: string;
}

export class CityResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  countryId: string;

  @ApiProperty({ example: 'San Salvador' })
  name: string;
}

export class CorridorResponseDto {
  @ApiProperty({ type: CountryResponseDto })
  origin: CountryResponseDto;

  @ApiProperty({ type: CountryResponseDto })
  destination: CountryResponseDto;
}
