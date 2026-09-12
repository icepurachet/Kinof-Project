import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';

jest.mock('@nestjs/typeorm', () => ({
  InjectRepository: () => () => undefined,
}));

describe('UsersService', () => {
  it('คืนสถิติและประวัติหักคะแนนจากข้อมูลจริง', async () => {
    const repository = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            usage_score: '92',
            booking_count: '4',
            total_usage_minutes: '150',
          },
        ])
        .mockResolvedValueOnce([
          { id: 1, points: 8, reason: 'ผิดกฎ', created_at: new Date() },
        ]),
    };
    const service = new UsersService(repository as unknown as Repository<User>);

    await expect(service.findUserStats(7)).resolves.toMatchObject({
      usage_score: 92,
      booking_count: 4,
      total_usage_minutes: 150,
      penalties: [{ id: 1, points: 8, reason: 'ผิดกฎ' }],
    });
  });
});
