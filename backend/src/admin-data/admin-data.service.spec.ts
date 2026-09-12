import { DataSource } from 'typeorm';
import { AdminDataService } from './admin-data.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('AdminDataService', () => {
  it('สร้างห้องและเขียน audit log', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ insertId: 4 })
        .mockResolvedValueOnce({ insertId: 10 }),
    };
    const service = new AdminDataService(dataSource as unknown as DataSource);
    await expect(
      service.createRoom(1, { room_name: 'LAB-4', capacity: 40 }),
    ).resolves.toEqual({ id: 4 });
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });
});
