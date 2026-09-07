import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../../shared/decorators/public.decorator.js';
import type { AppConfig } from '../../config/env.js';

@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      nivelDespliegue: this.config.get<AppConfig['nivelDespliegue']>('nivelDespliegue'),
      timestamp: new Date().toISOString(),
    };
  }
}
