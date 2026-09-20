import { IsBoolean, IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** `desde`/`hasta` son fechas ISO (`YYYY-MM-DD`), ambas inclusivas, ambas opcionales. */
export class RangoFechasDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsBoolean()
  incluirNoPagadas?: boolean;

  @IsOptional()
  @IsIn(['dia', 'semana', 'mes'], { message: 'agrupacion debe ser: dia, semana o mes' })
  agrupacion?: 'dia' | 'semana' | 'mes';

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero' })
  @Min(1, { message: 'limit debe ser >= 1' })
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset debe ser un entero' })
  @Min(0, { message: 'offset debe ser >= 0' })
  offset?: number;
}
