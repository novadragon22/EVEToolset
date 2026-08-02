/* moonSchedule.js — EVE Moon Watch extraction schedule order
 * MOON_SCHEDULE_ORDER: full refinery names in extraction order.
 * MOON_SCHEDULE_ANCHORS: known chunk arrival dates for specific refineries.
 *   These are used as fixed reference points when generating the suggested schedule.
 *   Format: { 'Refinery Name': 'YYYY-MM-DD' }
 */

const MOON_SCHEDULE_ORDER = [
  'Moro - RONA VIII M1',
  'Moro - RONA VIII M16',
  'Moro - RONA VIII M17',
  'Moro - RONA VIII M23',
  'Ainsan - RONA IV M7',
  'Ainsan - RONA IV M14',
  'Ainsan - RONA V M7',
  'Ainsan - RONA V M9',
  'Ainsan - RONA V M10',
  'Ainsan - RONA VI M6',
  'Ainsan - RONA VI M7',
  'Ainsan - RONA VI M15',
  'Ainsan - RONA VI M27',
  'Talidal - RONA III M10',
  'Talidal - RONA VI M2',
  'Talidal - RONA VI M17',
  'Efa - Raziel',
];

const MOON_SCHEDULE_ANCHORS = {
  'Moro - RONA VIII M1':  '2026-08-17',
  'Moro - RONA VIII M16': '2026-08-19',
  'Moro - RONA VIII M17': '2026-08-21',
  'Moro - RONA VIII M23': '2026-08-23',
};
