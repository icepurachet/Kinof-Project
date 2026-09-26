import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { LabService, digest, monthStart, processName } from './lab.service';
import { AuthService } from '../auth/auth.service';
import { EntryService } from '../entry/entry.service';
import { AgentService } from '../agent/agent.service';
jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));
jest.mock('typeorm', () => ({ DataSource: class DataSource {} }));
jest.mock('../auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
jest.mock('../entry/entry.service', () => ({
  EntryService: class EntryService {},
}));
jest.mock('../agent/agent.service', () => ({
  AgentService: class AgentService {},
}));

describe('LabService security and behavior', () => {
  const query = jest.fn();
  const service = () =>
    new LabService(
      {
        query,
        transaction: async (fn: (m: EntityManager) => unknown) =>
          fn({ query } as unknown as EntityManager),
      } as unknown as DataSource,
      {
        getOrThrow: () => 'test-secret',
        get: () => undefined,
      } as unknown as ConfigService,
      {} as AuthService,
      {} as EntryService,
      {} as AgentService,
    );
  beforeEach(() => query.mockReset());
  afterEach(() => jest.useRealTimers());
  it('normalizes process paths and refuses system-process blocking', async () => {
    expect(processName('C:\\Apps\\Discord.EXE')).toBe('discord.exe');
    await expect(
      service().addRule(1, 'block', { processName: 'svchost.exe' }),
    ).rejects.toThrow();
    expect(query).not.toHaveBeenCalled();
  });
  it('requires an active kiosk key bound to the requested room', async () => {
    await expect(service().verifyKiosk(undefined, 2)).rejects.toThrow();
    query.mockResolvedValueOnce([]);
    await expect(service().verifyKiosk('test-key', 2)).rejects.toThrow();
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('revoked_at IS NULL'),
      [digest('test-key'), 2],
    );
    query.mockResolvedValueOnce([{ id: 4 }]).mockResolvedValueOnce({});
    await expect(service().verifyKiosk('test-key', 2)).resolves.toBeUndefined();
  });
  it('uses Bangkok month boundaries even at UTC month end', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-31T18:00:00Z'));
    expect(monthStart().toISOString()).toBe('2026-03-31T17:00:00.000Z');
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([{ points: 55, reason: 'test' }]);
    await expect(service().behavior(7)).resolves.toMatchObject({
      score: 45,
      canBook: false,
      resetsAt: '2026-04-30T17:00:00.000Z',
    });
  });
  it('refuses bookings below 50 points', async () => {
    const lab = service();
    jest.spyOn(lab, 'behavior').mockResolvedValue({
      score: 45,
      maxScore: 100,
      minScoreToBook: 50,
      canBook: false,
      resetsAt: '',
      penalties: [],
    });
    await expect(lab.requireScore(7)).rejects.toThrow();
  });
  it('does not penalize a previously handled review twice', async () => {
    query.mockResolvedValueOnce([{ id: 9, status: 'penalized' }]);
    await service().handleReview(1, 9, 'penalized');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('blocks the entire group when only one member has 49 points', async () => {
    query.mockResolvedValueOnce({}).mockResolvedValueOnce([
      { id: 7, username: 'host', score: 100 },
      { id: 8, username: 'member', score: 49 },
    ]);
    await expect(service().groupEligibility([7, 8])).resolves.toMatchObject({
      canBook: false,
      blockedMembers: [{ id: 8, score: 49 }],
    });
  });
  it('allows exactly 50 points and deduplicates participants', async () => {
    query.mockResolvedValueOnce({}).mockResolvedValueOnce([
      { id: 7, username: 'host', score: 50 },
      { id: 8, username: 'member', score: 50 },
    ]);
    await expect(
      service().requireGroupScore([7, 8, 8]),
    ).resolves.toBeUndefined();
    expect(query.mock.calls[1][1].slice(1)).toEqual([7, 8]);
  });
  it('fails closed for missing participants', async () => {
    query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce([{ id: 7, username: 'host', score: 100 }]);
    await expect(service().requireGroupScore([7, 8])).rejects.toThrow();
  });
  it('does not trust arbitrary activity supplied by the browser', async () => {
    const lab = service();
    jest
      .spyOn(lab, 'reviews')
      .mockResolvedValue({ items: [], handledKeys: [], clearedKeys: [] });
    query.mockResolvedValueOnce([]);
    await expect(
      lab.handleActivity(1, { userId: 7, program: 'fake.exe' }, 'penalized'),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
