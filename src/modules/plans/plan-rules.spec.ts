import { WorkloadLevel } from '../../common/enums';
import {
  engineHour,
  evaluatePlan,
  isTooHot,
  rearrangeTasks,
  suggestTasks,
  Task,
  withNewCrews,
} from './plan-rules';

// The frontend sample: site levels 07:00 to 16:00 (13:00 and 14:00 possibly Critical).
const levels = [1, 1, 2, 3, 3, 3, 4, 4, 3, 2];
const crewB: Task[] = ['H', 'H', 'H', 'H', 'H', 'B', 'H', 'H', 'H', 'B'];

describe('too-hot rule', () => {
  it('heavy at 3+, moderate at 4', () => {
    expect(isTooHot('H', 2)).toBe(false);
    expect(isTooHot('H', 3)).toBe(true);
    expect(isTooHot('M', 3)).toBe(false);
    expect(isTooHot('M', 4)).toBe(true);
    expect(isTooHot('L', 4)).toBe(false);
    expect(isTooHot('B', 4)).toBe(false);
    expect(isTooHot('H', null)).toBe(false);
  });

  it('counts too-hot crew-hours and working hours', () => {
    expect(evaluatePlan({ B: crewB }, levels)).toMatchObject({
      tooHotCrewHours: 5,
      workingCrewHours: 8,
    });
  });
});

describe('rearranging (step 1)', () => {
  it('keeps breaks and the task mix, moves heavy work to the coolest hours', () => {
    const crewA: Task[] = ['H', 'H', 'H', 'H', 'B', 'H', 'H', 'B', 'M', 'M'];
    const s = rearrangeTasks(crewA, levels);
    expect(s.filter((t) => t === 'B')).toHaveLength(2);
    expect(s[4]).toBe('B');
    expect(s[7]).toBe('B');
    expect([...s].sort()).toEqual([...crewA].sort());
    expect(evaluatePlan({ A: s }, levels).tooHotCrewHours).toBeLessThan(
      evaluatePlan({ A: crewA }, levels).tooHotCrewHours,
    );
  });

  it('cannot fix a crew that only does heavy work, but never makes it worse', () => {
    const s = suggestTasks(crewB, levels);
    expect(evaluatePlan({ B: s }, levels).tooHotCrewHours).toBeLessThanOrEqual(
      evaluatePlan({ B: crewB }, levels).tooHotCrewHours,
    );
  });
});

describe('rearranging is optimal (brute force check)', () => {
  const cost = (t: Task[], l: number[]) =>
    evaluatePlan({ x: t }, l).tooHotCrewHours;
  const perms = (xs: Task[]): Task[][] =>
    xs.length <= 1
      ? [xs]
      : xs.flatMap((x, i) =>
          perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]),
        );

  it('matches the best possible arrangement on random small days', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let run = 0; run < 40; run++) {
      const n = 6;
      const l = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 4));
      const tasks = Array.from(
        { length: n },
        () => (['H', 'M', 'L', 'B'] as Task[])[Math.floor(rnd() * 4)],
      );
      const work = tasks.filter((t) => t !== 'B');
      const slots = tasks.map((_, i) => i).filter((i) => tasks[i] !== 'B');
      let best = Infinity;
      for (const p of perms(work)) {
        const arranged = [...tasks];
        slots.forEach((s, k) => (arranged[s] = p[k]));
        best = Math.min(best, cost(arranged, l));
      }
      expect(cost(rearrangeTasks(tasks, l), l)).toBe(best);
    }
  });
});

describe('engine hours', () => {
  it('maps tasks to engine workload and breaks', () => {
    expect(engineHour('H', WorkloadLevel.VERY_HEAVY)).toEqual({
      workload: 'very_heavy',
      restBreak: false,
    });
    expect(engineHour('H', WorkloadLevel.MODERATE)).toEqual({
      workload: 'heavy',
      restBreak: false,
    });
    expect(engineHour('B', WorkloadLevel.HEAVY)).toEqual({
      workload: 'light',
      restBreak: true,
    });
  });
});

describe('withNewCrews (saved plan + crews added later)', () => {
  const H: Task[] = ['H', 'B'];
  const L: Task[] = ['L', 'L'];
  it('fills in crews that got shifts after the plan was saved', () => {
    // Saved at night with no crews, then the day's shifts were created.
    expect(withNewCrews({}, { a: H, b: L })).toEqual({ a: H, b: L });
  });
  it("keeps the supervisor's saved tasks over the derived ones", () => {
    expect(withNewCrews({ a: L }, { a: H, b: L })).toEqual({ a: L, b: L });
  });
  it('uses the derived plan when nothing is saved', () => {
    expect(withNewCrews(undefined, { a: H })).toEqual({ a: H });
  });
});
