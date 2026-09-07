import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface ErrorBody {
  message: string;
  code: string;
}

/**
 * Filtro global de excepciones — TODA respuesta de error del backend tiene
 * la forma { message, code }. Nunca se deja pasar un stack trace crudo.
 *
 * Traduce explícitamente los errores de Postgres que representan reglas de
 * negocio de la base de datos, para que nunca lleguen como 500:
 *   - 23P01 (exclusion_violation): solapamiento de horario/sala en
 *     `funciones` (RF07) → 409.
 *   - 23505 (unique_violation): duplicado (ej. asiento repetido en una
 *     sala) → 409.
 *   - 23503 (foreign_key_violation): referencia a un id que no existe → 404.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(status).json(body);
  }

  private resolve(exception: unknown): { status: number; body: ErrorBody } {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      const message =
        typeof res === 'string'
          ? res
          : ((res as Record<string, unknown>).message as string | string[] | undefined) ??
            exception.message;
      return {
        status: exception.getStatus(),
        body: {
          message: Array.isArray(message) ? message.join(', ') : message,
          code: HttpStatus[exception.getStatus()] ?? 'HTTP_ERROR',
        },
      };
    }

    if (exception instanceof QueryFailedError) {
      const driverError = (exception as unknown as { code?: string }).code;
      if (driverError === '23P01') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            message:
              'La función se superpone con otra existente en la misma sala (incluyendo el tiempo de limpieza).',
            code: 'CONFLICTO_HORARIO_SALA',
          },
        };
      }
      if (driverError === '23505') {
        return {
          status: HttpStatus.CONFLICT,
          body: {
            message: 'El recurso ya existe o entra en conflicto con uno existente.',
            code: 'CONFLICTO_DUPLICADO',
          },
        };
      }
      if (driverError === '23503') {
        return {
          status: HttpStatus.NOT_FOUND,
          body: {
            message: 'Uno de los recursos referenciados no existe.',
            code: 'REFERENCIA_INEXISTENTE',
          },
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        message: 'Ocurrió un error inesperado.',
        code: 'INTERNAL_ERROR',
      },
    };
  }
}
