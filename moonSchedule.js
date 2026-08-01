/* moonSchedule.js — EVE Moon Watch extraction schedule order
 * Edit MOON_SCHEDULE_ORDER to control which systems are scheduled and in what order.
 * Each entry is a system name (string). Moons.html reads this at schedule-generation
 * time and merges it with live ESI refinery data. The UI queue list reflects this file;
 * additions/removals made in the UI are session-only and reset on reload.
 *
 * Example:
 *   const MOON_SCHEDULE_ORDER = [
 *     'Athinard',
 *     'Heydieles',
 *     'Fliet',
 *   ];
 */

const MOON_SCHEDULE_ORDER = [
  // Add system names here, one per line, in extraction order.
  // e.g. 'Athinard',
];
