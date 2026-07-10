import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser } from '../../../../../shared/auth/decorators';
import { RateExperienceUseCase } from '../../../application/use-cases/rate-counterpart.use-case';

export class CreateRatingDto {
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  score: number;

  @ApiPropertyOptional({ example: 'Excelente comunicación y entrega puntual' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class RatingResultDto {
  @ApiProperty({ description: 'true si ambas partes ya calificaron (Order → COMPLETED)' })
  completed: boolean;
}

/** Ruta bajo /orders/:id por diseño de API; el módulo dueño es reputation. */
@ApiTags('Ratings')
@ApiBearerAuth()
@Controller('orders/:orderId/ratings')
export class RatingsController {
  constructor(private readonly rateExperience: RateExperienceUseCase) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'El Buyer califica su experiencia (solo tras DELIVERED; completa el pedido)',
  })
  @ApiOkResponse({ type: RatingResultDto })
  execute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: CreateRatingDto,
  ): Promise<RatingResultDto> {
    return this.rateExperience.execute({
      userId: user.id,
      orderId,
      score: dto.score,
      comment: dto.comment ?? null,
    });
  }
}
