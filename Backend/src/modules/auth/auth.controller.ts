import { Body, Controller, Post } from '@nestjs/common';
import { Public } from '../../shared/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { GoogleLoginDto } from './dto/google-login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('google')
  loginConGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginConGoogle(dto);
  }
}
