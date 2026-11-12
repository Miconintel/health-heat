import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { EnginePpeAddon, EnginePpeClass } from '../../../common/enums';
import { PpeCategory } from '../entities/ppe-item.entity';

export class CreatePpeItemDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: PpeCategory })
  @IsEnum(PpeCategory)
  category!: PpeCategory;
  @ApiProperty({
    enum: EnginePpeClass,
    required: false,
    description:
      'Risk-engine clothing class. Leave empty for items the engine does not model (e.g. helmets).',
  })
  @IsOptional()
  @IsEnum(EnginePpeClass)
  engineClass?: EnginePpeClass;

  @ApiProperty({
    enum: EnginePpeAddon,
    required: false,
    description:
      'Set for items worn on top of the clothing that add heat burden, e.g. hoods. Not for helmets.',
  })
  @IsOptional()
  @IsEnum(EnginePpeAddon)
  engineAddon?: EnginePpeAddon;
}

export class AssignPpeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ppeItemIds!: string[];
}
