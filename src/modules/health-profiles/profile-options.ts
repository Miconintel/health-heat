/**
 * Answer codes shared with the frontend health profile and report screens
 * (frontend src/data/mock.ts). Stored as codes; the frontend shows the words.
 */

export const AGE_RANGES = [
  'prefer_not_to_say',
  'under_25',
  '25_39',
  '40_54',
  '55_plus',
] as const;

/** "None of these" (`none`) can't be combined with other answers. */
export const CONDITION_CODES = [
  'heart',
  'lungs',
  'kidney',
  'meta',
  'other',
  'none',
] as const;
export const MEDICINE_CODES = [
  'water',
  'bp',
  'allergy',
  'mood',
  'unsure',
  'none',
] as const;
export const HEAT_ILLNESS_CODES = ['no', 'recent', 'old', 'unsure'] as const;

/** "How long have you been doing this kind of work in this heat?" */
export const ACCLIMATISATION_CODES = [
  'new',
  'adjusting',
  'over2',
  'back',
] as const;
export type AcclimatisationAnswer = (typeof ACCLIMATISATION_CODES)[number];

export const SYMPTOM_CODES = [
  'headache',
  'dizzy',
  'thirst',
  'sick',
  'cramps',
  'weak',
] as const;

/** True when `none` is mixed with other answers. */
export const mixesNone = (codes: readonly string[] | undefined) =>
  !!codes && codes.includes('none') && codes.length > 1;
