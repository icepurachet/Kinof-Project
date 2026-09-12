import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class CreateIssueDto {
  @IsString()
  @MaxLength(100)
  category: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsString()
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({}, { each: true })
  image_urls?: string[];
}
