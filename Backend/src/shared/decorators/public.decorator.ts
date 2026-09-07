import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * `@Public()` en un endpoint que no requiere JWT (`/health`, `/auth/login`).
 * Todo lo demás requiere token por default — ver JwtAuthGuard global en AppModule.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
