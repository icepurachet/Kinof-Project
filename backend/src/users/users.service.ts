import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const password_hash = await hash(createUserDto.password, 12);

    const user = this.userRepository.create({
      email: createUserDto.email,
      username: createUserDto.username,
      password_hash,
      first_name: createUserDto.first_name,
      last_name: createUserDto.last_name,
      phone: createUserDto.phone ?? null,
      role: createUserDto.role,
    });

    const savedUser = await this.saveUser(user);

    return this.userRepository.findOneByOrFail({
      id: savedUser.id,
    });
  }

  findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async searchActiveUsers(
    query: string,
    excludeUserId: number,
  ): Promise<
    Array<{
      id: number;
      email: string;
      username: string;
      name: string;
    }>
  > {
    const escapedQuery = query.trim().replace(/[\\%_]/g, '\\$&');
    const users = await this.userRepository
      .createQueryBuilder('user')
      .where('user.is_active = TRUE')
      .andWhere('user.id <> :excludeUserId', { excludeUserId })
      .andWhere(
        `(user.email LIKE :query ESCAPE '\\\\'
          OR user.username LIKE :query ESCAPE '\\\\'
          OR CONCAT(user.first_name, ' ', user.last_name) LIKE :query ESCAPE '\\\\')`,
        { query: `%${escapedQuery}%` },
      )
      .orderBy('user.username', 'ASC')
      .take(10)
      .getMany();

    return users.map((user) => ({
      id: user.id,
      email: user.email,
      username: user.username,
      name: `${user.first_name} ${user.last_name}`.trim(),
    }));
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้');
    }

    return user;
  }

  async hasFaceEnrollment(id: number): Promise<boolean> {
    const user = await this.userRepository
      .createQueryBuilder('user')
      .select('user.id')
      .addSelect('user.face_embedding')
      .where('user.id = :id', { id })
      .getOne();
    return Boolean(user?.face_embedding);
  }

  async findUserStats(id: number): Promise<{
    usage_score: number;
    booking_count: number;
    total_usage_minutes: number;
    penalties: Array<Record<string, unknown>>;
  }> {
    const rows = this.readRows(
      (await this.userRepository.query(
        `
          SELECT
            u.usage_score,
            (SELECT COUNT(*) FROM bookings AS b
              WHERE b.status IN ('confirmed', 'completed')
                AND (
                  b.host_id = u.id OR EXISTS (
                    SELECT 1 FROM booking_members AS bm
                    WHERE bm.booking_id = b.id
                      AND bm.user_id = u.id
                      AND bm.invite_status = 'accepted'
                  )
                )
            ) AS booking_count,
            (SELECT COALESCE(SUM(TIMESTAMPDIFF(
              MINUTE, ps.login_time, COALESCE(ps.logout_time, UTC_TIMESTAMP())
            )), 0) FROM pc_sessions AS ps WHERE ps.user_id = u.id)
              AS total_usage_minutes
          FROM users AS u
          WHERE u.id = ?
          LIMIT 1
        `,
        [id],
      )) as unknown,
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('ไม่พบผู้ใช้');
    }
    const penalties = this.readRows(
      (await this.userRepository.query(
        `
          SELECT id, points, reason, created_at
          FROM penalty_logs
          WHERE user_id = ?
          ORDER BY created_at DESC, id DESC
          LIMIT 20
        `,
        [id],
      )) as unknown,
    );
    return {
      usage_score: Number(row.usage_score ?? 0),
      booking_count: Number(row.booking_count ?? 0),
      total_usage_minutes: Number(row.total_usage_minutes ?? 0),
      penalties,
    };
  }

  async findForLogin(identifier: string): Promise<User | null> {
    const condition = identifier.includes('@')
      ? 'user.email = :identifier'
      : 'user.username = :identifier';

    return this.userRepository
      .createQueryBuilder('user') // เริ่มค้นหา
      .addSelect('user.password_hash') // ขออ่านค่าhash
      .addSelect('user.face_embedding')
      .where(condition, { identifier })
      .getOne();
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });

    if (!user) {
      throw new NotFoundException('ไม่พบผู้ใช้');
    }

    this.userRepository.merge(user, updateUserDto);

    return this.saveUser(user);
  }

  async remove(id: number): Promise<{ message: string }> {
    try {
      const result = await this.userRepository.delete({ id });

      if (result.affected === 0) {
        throw new NotFoundException('ไม่พบผู้ใช้');
      }

      return { message: 'ลบผู้ใช้สำเร็จ' };
    } catch (error) {
      if (this.getDriverErrorCode(error) === 'ER_ROW_IS_REFERENCED_2') {
        throw new ConflictException(
          'ลบไม่ได้ เพราะมีข้อมูลอื่นอ้างอิงผู้ใช้นี้อยู่',
        );
      }
      throw error;
    }
  }

  private async saveUser(user: User): Promise<User> {
    try {
      return await this.userRepository.save(user);
    } catch (error) {
      if (this.getDriverErrorCode(error) === 'ER_DUP_ENTRY') {
        throw new ConflictException('อีเมลหรือชื่อผู้ใช่นี้ถูกใช้แล้ว');
      }

      throw error;
    }
  }

  private getDriverErrorCode(error: unknown): string | null {
    if (!(error instanceof QueryFailedError)) {
      return null;
    }
    const driverError: unknown = error.driverError;
    if (typeof driverError !== 'object' || driverError === null) {
      return null;
    }
    const code = (driverError as Record<string, unknown>).code;
    return typeof code === 'string' ? code : null;
  }

  private readRows(result: unknown): Array<Record<string, unknown>> {
    return Array.isArray(result)
      ? result.filter(
          (row: unknown): row is Record<string, unknown> =>
            typeof row === 'object' && row !== null,
        )
      : [];
  }
}
