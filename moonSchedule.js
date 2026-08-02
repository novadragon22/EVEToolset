/* moonSchedule.js — EVE Moon Watch extraction schedule order
 * Edit MOON_SCHEDULE_ORDER to control which systems are scheduled and in what order.
 * Each entry is a refinery name (string). Moons.html reads this at schedule-generation
 * time and merges it with live ESI refinery data.
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
