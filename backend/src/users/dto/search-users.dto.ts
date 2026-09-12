import { IsString, Length } from 'class-validator';

export class SearchUsersDto {
  @IsString()
  @Length(2, 100)
  q: string;
}
