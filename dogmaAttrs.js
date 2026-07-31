/* dogmaAttrs.js — SDE dogmaAttributes.yaml
 * Generated from EVE SDE. Corrects attribute ID mappings that were
 * wrong in academy.html (all five ATTR_CODE values and all five
 * IMP_ATTR values were misassigned; DA_SECONDARY was 182 = requiredSkill1,
 * not 181 = secondaryAttribute).
 *
 * Verified attribute names from SDE:
 *   164 = charisma → 'cha'
 *   165 = intelligence → 'int'
 *   166 = memory → 'mem'
 *   167 = perception → 'per'
 *   168 = willpower → 'wil'
 */

/* Primary/secondary training attribute dogma IDs */
const DA_PRIMARY   = 180;   // primaryAttribute
const DA_SECONDARY = 181; // secondaryAttribute
const DA_RANK      = 275;  // skillTimeConstant
const DA_SKILL_LEVEL = 280; // skillLevel

/* Base character attribute dogma IDs → short key */
const ATTR_CODE = {164:'cha', 165:'int', 166:'mem', 167:'per', 168:'wil'};

/* Implant bonus dogma attribute IDs → short key */
const IMP_ATTR = {175:'cha', 176:'int', 177:'mem', 178:'per', 179:'wil'};

/* Required-skill dogma attribute ID pairs [typeID_attr, level_attr] */
const REQ_SKILL_PAIRS = [[182,277], [183,278], [184,279], [1285,1286], [1289,1287], [1290,1288]];
