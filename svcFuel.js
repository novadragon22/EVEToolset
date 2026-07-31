/* svcFuel.js — Upwell structure service module fuel consumption rates
 * Source: CCP patch notes and EVE University wiki (no SDE YAML equivalent).
 * Maps ESI service name string -> fuel blocks per hour consumed when online.
 * ESI returns names with underscores; caller must replace _ with space before lookup.
 */

const SVC_FUEL_BLK_HR = {
  // Engineering Service Modules (groupID 1415)
  'Standup Supercapital Shipyard I':      36,
  'Standup Capital Shipyard I':           24,
  'Standup Manufacturing Plant I':        12,
  'Standup Invention Lab I':              12,
  'Standup Research Lab I':               12,
  'Standup Hyasyoda Research Lab':        10,
  // Citadel Service Modules (groupID 1321)
  'Standup Market Hub I':                 40,
  'Standup Cloning Center I':             10,
  // Resource Processing Service Modules (groupID 1322)
  'Standup Reprocessing Facility I':      10,
  'Standup Composite Reactor I':          15,
  'Standup Hybrid Reactor I':             15,
  'Standup Biochemical Reactor I':        15,
  // FLEX Service Modules (groupID 1324)
  'Standup Cynosural System Jammer I':    40,
  'Standup Conduit Generator I':          30,
  'Standup Cynosural Field Generator I':  15,
  'Standup Metenox Moon Drill':            5,
  // Moon Drilling (groupID 1887)
  'Standup Moon Drill I':                  5,
  // Additional confirmed services
  'Standup Drug Lab I':                    5,
  'Structure Compression Plant':           5,
  'Structure Time Efficiency Laboratory':  5,
  'Structure Material Efficiency Laboratory': 10,
};

/* Returns total fuel blocks/hr for a structure based on its online services.
 * Pass the structure object from ESI /corporations/{id}/structures/.
 * Unknown modules fall back to 10 blk/hr.
 */
function fuelBph(structure) {
  let bph = 0;
  (structure.services || []).forEach(svc => {
    if (svc.state === 'online') {
      const key = (svc.name || '').replace(/_/g, ' ');
      const rate = SVC_FUEL_BLK_HR[key];
      bph += rate != null ? rate : 10;
    }
  });
  return bph;
}

function fuelBpMonth(structure) { return fuelBph(structure) * 24 * 30; }
