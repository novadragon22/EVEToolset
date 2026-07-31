/* blueprintGroups.js — SDE groups.yaml
 * Maps blueprint product group name → internal rig-category key.
 * Generated from groups.yaml; groupID annotations for auditability.
 * Used by industry.html GROUP_CATEGORY_MAP to scope Standup rig bonuses.
 */

const GROUP_CATEGORY_MAP = {
  // Small ships
  'Frigate': 'ship_small',  // 25
  'Shuttle': 'ship_small',  // 31
  'Corvette': 'ship_small',  // 237
  'Assault Frigate': 'ship_small',  // 324
  'Destroyer': 'ship_small',  // 420
  'Covert Ops': 'ship_small',  // 830
  'Interceptor': 'ship_small',  // 831
  'Stealth Bomber': 'ship_small',  // 834
  'Electronic Attack Ship': 'ship_small',  // 893
  // Medium / battlecruiser ships
  'Cruiser': 'ship_medium',  // 26
  'Heavy Assault Cruiser': 'ship_medium',  // 358
  'Combat Battlecruiser': 'ship_medium',  // 419
  'Command Ship': 'ship_medium',  // 540
  'Logistics': 'ship_medium',  // 832
  'Force Recon Ship': 'ship_medium',  // 833
  'Combat Recon Ship': 'ship_medium',  // 906
  'Strategic Cruiser': 'ship_medium',  // 963
  'Attack Battlecruiser': 'ship_medium',  // 1201
  // Large ships
  'Battleship': 'ship_large',  // 27
  'Black Ops': 'ship_large',  // 898
  'Marauder': 'ship_large',  // 900
  // Capital ships
  'Titan': 'ship_capital',  // 30
  'Dreadnought': 'ship_capital',  // 485
  'Freighter': 'ship_capital',  // 513
  'Carrier': 'ship_capital',  // 547
  'Supercarrier': 'ship_capital',  // 659
  'Capital Industrial Ship': 'ship_capital',  // 883
  'Jump Freighter': 'ship_capital',  // 902
  // Construction components
  'Construction Components': 'component',  // 334
  'Capital Construction Components': 'component',  // 873
  'Advanced Capital Construction Components': 'component',  // 913
  // Composite reactions
  'Composite': 'reaction_composite',  // 429
  // Hybrid polymer reactions
  'Hybrid Polymers': 'reaction_hybrid',  // 974
  // Biochemical reactions
  'Biochemical Material': 'reaction_biochem',  // 712
  // Upwell structures
  'Engineering Complex': 'structure',  // 1404
  'Refinery': 'structure',  // 1406
};

function blueprintCategory(group) { return GROUP_CATEGORY_MAP[group] || null; }
