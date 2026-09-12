import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminJwtAuthGuard } from '../auth/admin-jwt-auth.guard';
import { SearchUsersDto } from './dto/search-users.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly userService: UsersService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.userService.create(createUserDto);
  }

  @Get()
  @UseGuards(AdminJwtAuthGuard)
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  findMe(@Req() request: AuthenticatedRequest): Promise<User> {
    return this.userService.findOne(request.user.sub);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  search(@Req() request: AuthenticatedRequest, @Query() query: SearchUsersDto) {
    return this.userService.searchActiveUsers(query.q, request.user.sub);
  }

  @Get('me/stats')
  @UseGuards(JwtAuthGuard)
  findMyStats(@Req() request: AuthenticatedRequest) {
    return this.userService.findUserStats(request.user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(request.user.sub, updateUserDto);
  }

  @Get(':id')
  @UseGuards(AdminJwtAuthGuard)
  findOne(@Param('id', ParseIntPipe) id: number): Promise<User | null> {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(AdminJwtAuthGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @UseGuards(AdminJwtAuthGuard)
  remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    return this.userService.remove(id);
  }
}
