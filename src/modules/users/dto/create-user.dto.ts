import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { Role } from '../../../common/enums';

/** 4 to 6 digits. */
export const PIN_PATTERN = /^\d{4,6}$/;
/** Letters, digits and dashes, e.g. W-0412 or S-001. */
export const LOGIN_ID_PATTERN = /^[A-Za-z0-9-]{2,32}$/;

export class CreateUserDto {
  @ApiProperty({
    required: false,
    example: 'S-001',
    description:
      'Login ID. For workers it defaults to their employee code (e.g. W-0412).',
  })
  @IsOptional()
  @Matches(LOGIN_ID_PATTERN)
  loginId?: string;

  @ApiProperty({ example: '1234', description: '4 to 6 digits' })
  @Matches(PIN_PATTERN, { message: 'pin must be 4 to 6 digits' })
  pin!: string;

  @ApiProperty({ enum: Role }) @IsEnum(Role) role!: Role;

  @ApiProperty({ required: false, description: 'Required when role is worker' })
  @IsOptional()
  @IsUUID()
  workerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;
}

export class ResetPinDto {
  @ApiProperty({ example: '4321' })
  @Matches(PIN_PATTERN, { message: 'pin must be 4 to 6 digits' })
  pin!: string;
}
