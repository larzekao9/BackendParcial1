import { IsDateString, IsOptional } from 'class-validator';

/** `desde`/`hasta` son fechas ISO (`YYYY-MM-DD`), ambas inclusivas, ambas opcionales. */
export class RangoFechasDto {
  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
