import { ApiProperty } from '@nestjs/swagger';
import { IsJWT, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'W-0412', description: 'Worker ID or staff ID' })
  @IsString()
  @MaxLength(32)
  loginId!: string;

  // Format is not validated here, so a wrong-format PIN counts as a failed attempt
  // instead of revealing the rule.
  @ApiProperty({ example: '1234' })
  @IsString()
  @MaxLength(32)
  pin!: string;
}

export class RefreshDto {
  @ApiProperty() @IsJWT() refreshToken!: string;
}
