import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EntryService } from '../entry/entry.service';
import { FaceService } from './face.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));
jest.mock('@nestjs/config', () => ({
  ConfigService: class ConfigService {},
}));

describe('FaceService', () => {
  const embedding = Array<number>(512).fill(0);
  embedding[0] = 1;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('บันทึก embedding โดยไม่บันทึกภาพต้นฉบับ', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embedding }),
    } as Response);
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce([{ id: 7, username: 'student07' }]),
    };
    const service = new FaceService(
      dataSource as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
      {} as EntryService,
    );

    const image = `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`;
    await expect(service.enroll(7, image)).resolves.toMatchObject({
      user: { id: 7, faceEnrolled: true },
    });
    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      JSON.stringify(embedding),
      7,
    ]);
  });

  it('อนุญาตเมื่อใบหน้าตรงและมีสิทธิ์เข้าห้อง', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ embedding }),
    } as Response);
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 7,
            username: 'student07',
            face_embedding: JSON.stringify(embedding),
          },
        ])
        .mockResolvedValueOnce({ insertId: 1 }),
    };
    const entryService = {
      enterRoom: jest.fn().mockResolvedValue({
        allowed: true,
        reason: 'ok',
        sessionId: 12,
        seatLabel: '07',
        computerName: 'LAB-07',
        user: { id: 7, displayName: 'Student 07' },
      }),
    };
    const service = new FaceService(
      dataSource as unknown as DataSource,
      { get: jest.fn() } as unknown as ConfigService,
      entryService as unknown as EntryService,
    );

    const image = `data:image/jpeg;base64,${Buffer.from('image').toString('base64')}`;
    await expect(service.verifyAtKiosk(2, image)).resolves.toMatchObject({
      granted: true,
      identified: true,
      user: { id: 7 },
      sessionId: 12,
      seatLabel: '07',
    });
    expect(entryService.enterRoom).toHaveBeenCalledWith(7, 2);
  });
});
