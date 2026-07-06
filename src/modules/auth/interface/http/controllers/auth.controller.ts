import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthenticatedUser } from '../../../../../shared/auth/authenticated-user';
import { CurrentUser, Public } from '../../../../../shared/auth/decorators';
import { AuthService } from '../../../application/auth.service';
import { AuthResponseDto, LoginDto, RefreshDto, RegisterDto } from '../dto/auth.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Registrar usuario (sin roles; los perfiles se activan aparte)' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  // anti fuerza bruta: límite estricto (docs/design/05-seguridad.md §3)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @ApiOperation({ summary: 'Login → access token (15m) + refresh token (7d)' })
  @ApiOkResponse({ type: AuthResponseDto })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotar refresh token (detecta reuso y revoca la familia)' })
  @ApiOkResponse({ type: AuthResponseDto })
  refresh(@Body() dto: RefreshDto): Promise<AuthResponseDto> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revocar la sesión (familia del refresh token)' })
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.auth.logout(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Usuario autenticado según el access token' })
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
