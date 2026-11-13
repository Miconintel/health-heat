import { ReadingSource } from '../../common/enums';
import { EnvironmentService } from './environment.service';
import type { EnvironmentalReading } from './entities/environmental-reading.entity';

/**
 * currentConditions picks, in order: a sensor reading (30 min), a weather observation
 * (2 h), then this hour's forecast. The last step keeps a heat value after the weather
 * service refuses a refresh (429), instead of falling back to "no data".
 */
describe('EnvironmentService.currentConditions', () => {
  const now = new Date('2026-11-13T14:40:00Z');
  const row = (over: Partial<EnvironmentalReading>) =>
    ({ id: 'r', ...over }) as EnvironmentalReading;

  const make = (answers: (EnvironmentalReading | null)[]) => {
    const findOne = jest.fn();
    for (const a of answers) findOne.mockResolvedValueOnce(a);
    const service = new EnvironmentService(
      { findOne } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service, findOne };
  };
  const whereOf = (findOne: jest.Mock, call: number) =>
    (findOne.mock.calls[call] as [{ where: Record<string, unknown> }])[0].where;

  it('prefers a recent sensor reading', async () => {
    const sensor = row({ source: ReadingSource.SENSOR });
    const { service, findOne } = make([sensor]);
    await expect(service.currentConditions('s', now)).resolves.toBe(sensor);
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('then a weather observation from the last 2 hours', async () => {
    const obs = row({ isForecast: false });
    const { service, findOne } = make([null, obs]);
    await expect(service.currentConditions('s', now)).resolves.toBe(obs);
    expect(whereOf(findOne, 1)).toMatchObject({ isForecast: false });
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('then the forecast for the hour we are in (weather refused since)', async () => {
    const forecast = row({ isForecast: true });
    const { service, findOne } = make([null, null, forecast]);
    await expect(service.currentConditions('s', now)).resolves.toBe(forecast);
    const where = whereOf(findOne, 2);
    expect(where).toMatchObject({
      isForecast: true,
      source: ReadingSource.WEATHER_API,
    });
    // Only rows that started within the last hour, i.e. this hour's forecast.
    const [from, to] = (where.observedAt as { value: Date[] }).value;
    expect(to).toEqual(now);
    expect(now.getTime() - from.getTime()).toBeLessThan(60 * 60_000);
  });

  it('returns null when there is nothing at all', async () => {
    const { service } = make([null, null, null]);
    await expect(service.currentConditions('s', now)).resolves.toBeNull();
  });
});
