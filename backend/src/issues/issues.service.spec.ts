import { DataSource } from 'typeorm';
import { IssuesService } from './issues.service';

jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));

describe('IssuesService', () => {
  it('สร้าง issue และรูปทั้งหมดใน transaction เดียว', async () => {
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      query: jest
        .fn()
        .mockResolvedValueOnce({ insertId: 12 })
        .mockResolvedValueOnce({ affectedRows: 2 }),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
    };
    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    const service = new IssuesService(dataSource as unknown as DataSource);

    const result = await service.createIssue(7, {
      category: 'computer',
      title: 'เปิดเครื่องไม่ได้',
      description: 'เครื่อง LAB-C-01 เปิดไม่ติด',
      image_urls: ['https://example.com/issue-1.jpg'],
    });

    expect(result).toMatchObject({
      issue_id: 12,
      status: 'pending',
      image_urls: ['https://example.com/issue-1.jpg'],
    });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});
