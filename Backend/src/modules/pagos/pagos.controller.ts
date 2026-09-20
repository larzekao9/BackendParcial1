import { Body, Controller, Get, Headers, HttpCode, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Roles } from '../../shared/decorators/roles.decorator.js';
import { Public } from '../../shared/decorators/public.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { Audit } from '../../shared/decorators/audit.decorator.js';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface.js';
import type { ActorPago } from '../../contracts/service-contracts.js';
import { PagosService } from './pagos.service.js';
import { CrearPagoDto } from './dto/crear-pago.dto.js';
import { IniciarPagoStripeDto } from './dto/iniciar-pago-stripe.dto.js';

const actorDe = (usuario: JwtPayload): ActorPago => ({ idUsuario: usuario.sub, rol: usuario.rol });

/**
 * RF04. Mismo criterio de roles que `POST /ventas`: el cliente paga SU venta; el administrador cobra en mostrador.
 * La tarjeta en línea (Stripe) la inician y verifican cliente y administrador, pero la confirmación real llega por el
 * webhook firmado o por la consulta del servidor a Stripe — ningún endpoint acepta "ya pagué" del navegador.
 */
@Controller('pagos')
export class PagosController {
  constructor(private readonly pagosService: PagosService) {}

  /** Si el pago con tarjeta está disponible y con qué clave pública (la del formulario de Stripe). Sin JWT: no tiene nada sensible. */
  @Public()
  @Get('config')
  configuracion() {
    return this.pagosService.configuracion();
  }

  /** Efectivo o tarjeta física (caja). Devuelve la venta ya pagada. */
  @Roles('cliente', 'administrador')
  @Audit('crear_pago')
  @Post()
  crear(@Body() dto: CrearPagoDto, @CurrentUser() usuario: JwtPayload) {
    return this.pagosService.crear(dto, actorDe(usuario));
  }

  @Roles('cliente', 'administrador')
  @Audit('iniciar_pago_stripe')
  @Post('stripe/iniciar')
  iniciarStripe(@Body() dto: IniciarPagoStripeDto, @CurrentUser() usuario: JwtPayload) {
    return this.pagosService.iniciarStripe(dto.idVenta, actorDe(usuario));
  }

  /** Stripe avisa acá cuando cambia un cobro. Sin JWT: la autenticidad la da la firma `Stripe-Signature` sobre el cuerpo crudo. */
  @Public()
  @HttpCode(200)
  @Post('webhook/stripe')
  webhookStripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') firma: string | undefined) {
    return this.pagosService.procesarWebhookStripe(req.rawBody, firma);
  }

  /** Cancela una venta que todavía no se pagó y libera los asientos. */
  @Roles('cliente', 'administrador')
  @Audit('cancelar_pago_pendiente')
  @Post('venta/:idVenta/cancelar')
  cancelarPendiente(@Param('idVenta', ParseIntPipe) idVenta: number, @CurrentUser() usuario: JwtPayload) {
    return this.pagosService.cancelarPendiente(idVenta, actorDe(usuario));
  }

  /** El navegador la llama después de confirmar la tarjeta: el servidor le pregunta a Stripe y devuelve cómo quedó la venta. */
  @Roles('cliente', 'administrador')
  @Post(':idPago/verificar')
  verificar(@Param('idPago', ParseIntPipe) idPago: number, @CurrentUser() usuario: JwtPayload) {
    return this.pagosService.verificarStripe(idPago, actorDe(usuario));
  }
}
