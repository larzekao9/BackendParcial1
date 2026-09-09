import { IsNotEmpty, IsString } from 'class-validator';

/** ID token que ya emitió Google Identity Services en el frontend (JWT firmado por Google). */
export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  idToken!: string;
}
