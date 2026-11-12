import { WorkloadLevel } from '../../common/enums';

/** One letter per hour, as in the frontend: Heavy, Moderate, Light or shaded, Break. */
export type Task = 'H' | 'M' | 'L' | 'B';
export const TASKS: readonly Task[] = ['H', 'M', 'L', 'B'];

/**
 * The frontend's "too hot" rule, owned by the backend ("rules decide"):
 * heavy work at level 3 or above, or moderate work at level 4.
 * `level` is the site level for the hour, including a "possible" level.
 */
export function isTooHot(task: Task, level: number | null): boolean {
  if (level === null) return false;
  return (task === 'H' && level >= 3) || (task === 'M' && level >= 4);
}

export function evaluatePlan(
  crews: Record<string, Task[]>,
  levels: (number | null)[],
) {
  const cells: { crewId: string; hour: number }[] = [];
  let working = 0;
  for (const [crewId, tasks] of Object.entries(crews)) {
    tasks.forEach((t, i) => {
      if (t !== 'B') working++;
      if (isTooHot(t, levels[i] ?? null)) cells.push({ crewId, hour: i });
    });
  }
  return {
    tooHotCells: cells,
    tooHotCrewHours: cells.length,
    workingCrewHours: working,
  };
}

/**
 * Step 1 of the suggestion: breaks stay where they are and the same tasks are
 * kept (so working hours don't change), arranged to minimise too-hot hours.
 *
 * Hours fall in three groups: cool (< 3), High (3) and Critical (4).
 * Heavy work is only safe in cool hours, moderate in cool or High hours, light anywhere. So:
 *  1. heavy work takes the coolest cool hours;
 *  2. heavy work that doesn't fit takes Critical hours first (it is too hot at 3 or 4
 *     either way), keeping High hours free for moderate work;
 *  3. moderate work takes the remaining cool, then High, then Critical hours;
 *  4. light or shaded work takes what is left.
 */
export function rearrangeTasks(
  tasks: Task[],
  levels: (number | null)[],
): Task[] {
  const lvl = (i: number) => levels[i] ?? 0;
  const slots = tasks.map((_, i) => i).filter((i) => tasks[i] !== 'B');
  const byCool = (a: number, b: number) => lvl(a) - lvl(b) || a - b;
  const cool = slots.filter((i) => lvl(i) < 3).sort(byCool);
  const high = slots.filter((i) => lvl(i) === 3).sort(byCool);
  const critical = slots
    .filter((i) => lvl(i) >= 4)
    .sort((a, b) => lvl(b) - lvl(a) || a - b);
  let nH = tasks.filter((t) => t === 'H').length;
  let nM = tasks.filter((t) => t === 'M').length;

  const out = [...tasks];
  const take = (pool: number[], n: number, task: Task) => {
    const used = pool.splice(0, Math.min(n, pool.length));
    used.forEach((i) => (out[i] = task));
    return used.length;
  };
  nH -= take(cool, nH, 'H');
  nH -= take(critical, nH, 'H');
  take(high, nH, 'H');
  nM -= take(cool, nM, 'M');
  nM -= take(high, nM, 'M');
  take(critical, nM, 'M');
  for (const pool of [cool, high, critical]) take(pool, pool.length, 'L');
  return out;
}

/**
 * Suggested plan for one crew, as the frontend's planner does it:
 *  1. rearrange the crew's own tasks so heavy work lands in the coolest hours;
 *  2. step down any work that is still too hot: heavy → moderate at level 3,
 *     heavy or moderate → light (shaded) at level 4.
 * Breaks and the number of working hours never change, and no hour is left too hot.
 * Advice only: the supervisor decides, and no plan ever removes protective equipment.
 */
export function suggestTasks(tasks: Task[], levels: (number | null)[]): Task[] {
  return rearrangeTasks(tasks, levels).map((t, i) => {
    const level = levels[i] ?? 0;
    if (t === 'H' && level >= 4) return 'L';
    if (t === 'H' && level >= 3) return 'M';
    if (t === 'M' && level >= 4) return 'L';
    return t;
  });
}

export const suggestPlan = (
  crews: Record<string, Task[]>,
  levels: (number | null)[],
) =>
  Object.fromEntries(
    Object.entries(crews).map(([id, t]) => [id, suggestTasks(t, levels)]),
  );

/** Task letter for a crew's usual workload. */
export function taskForWorkload(w: WorkloadLevel): Task {
  if (w === WorkloadLevel.HEAVY || w === WorkloadLevel.VERY_HEAVY) return 'H';
  if (w === WorkloadLevel.MODERATE) return 'M';
  return 'L';
}

/**
 * What a planned hour means for the engine forecast: workload, and whether a
 * rest break in shade starts that hour. Heavy keeps the crew's own heavy level.
 */
export function engineHour(task: Task, crewWorkload: WorkloadLevel) {
  switch (task) {
    case 'H':
      return {
        workload:
          crewWorkload === WorkloadLevel.VERY_HEAVY
            ? WorkloadLevel.VERY_HEAVY
            : WorkloadLevel.HEAVY,
        restBreak: false,
      };
    case 'M':
      return { workload: WorkloadLevel.MODERATE, restBreak: false };
    case 'L':
      return { workload: WorkloadLevel.LIGHT, restBreak: false };
    case 'B':
      return { workload: WorkloadLevel.LIGHT, restBreak: true };
  }
}

/**
 * A sent plan as hour-start (ms) → engine workload and break, for one crew.
 * `hourStarts` are the instants of the plan's hour labels.
 */
export function engineHourPlan(
  tasks: Task[],
  hourStarts: Date[],
  crewWorkload: WorkloadLevel,
) {
  return new Map(
    hourStarts.map((start, i) => [
      start.getTime(),
      engineHour(tasks[i], crewWorkload),
    ]),
  );
}
