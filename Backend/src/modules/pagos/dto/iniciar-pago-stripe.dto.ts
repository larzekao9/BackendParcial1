import { IsInt, IsPositive } from 'class-validator';

export class IniciarPagoStripeDto {
  @IsInt()
  @IsPositive()
  idVenta!: number;
}
