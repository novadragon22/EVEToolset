/**
 * EVE Suite — shared constants
 *
 * Single source of truth for every localStorage key, URL, and suite-wide
 * config value. Import from here; never hardcode these strings in tool code.
 */

// ── OAuth / ESI endpoints ────────────────────────────────────────────────────

export const ESI_BASE   = 'https://esi.evetech.net/latest';
export const SSO_TOKEN  = 'https://login.eveonline.com/v2/oauth/token';
export const SSO_AUTH   = 'https://login.eveonline.com/v2/oauth/authorize';

// ── Suite-wide localStorage keys ─────────────────────────────────────────────

/** Serialised character roster: { [charId]: CharEntry }  */
export const KEY_CHARS          = 'eve_suite_chars';

/** Client ID published by index.html so tools can refresh tokens. */
export const KEY_CLIENT_ID      = 'eve_suite_client_id';

/** Per-tool, per-character section visibility: { [toolKey]: { [charId]: bool } } */
export const KEY_CHAR_SECTIONS  = 'eve_suite_char_sections';

/** Dashboard status blobs written by each tool: { [toolKey]: { text, level, ts } } */
export const KEY_DASHBOARD      = 'eve_suite_dashboard';

/** Decoded token-scope cache: { [charId]: { scopes, missing, ts } } */
export const KEY_TOKEN_SCOPES   = 'eve_suite_token_scopes';

/** Universe name cache: { [typeId]: { n: name, c: category } } */
export const KEY_NAME_CACHE     = 'eve_suite_namecache_v1';

/** Active theme name ('amarr' | 'caldari' | 'gallente' | 'minmatar' | …) */
export const KEY_THEME          = 'eve_suite_theme';

// ── Roster limits ─────────────────────────────────────────────────────────────

/** Maximum characters remembered in the roster FIFO. */
export const MAX_SUITE_CHARS = 20;

// ── ESI concurrency ───────────────────────────────────────────────────────────

/** Default parallel ESI request cap used by pLimit in esi-client.js. */
export const ESI_CONCURRENCY = 6;

// ── OAuth scopes ──────────────────────────────────────────────────────────────

/**
 * Full scope catalogue.  Each entry carries:
 *   scope   – the ESI scope string
 *   tool    – human-readable tool(s) that consume it
 *   desc    – one-line description shown in the sign-in overlay
 *   active  – false = reserved/planned, not requested at login
 *
 * To promote a reserved scope to active: set active:true and remove & re-add
 * every pilot (tokens only carry scopes granted at authorisation).
 */
export const SCOPE_INFO = [
  { scope: 'publicData',                              tool: 'All tools',                                        desc: 'Basic public character info',                           active: true  },
  { scope: 'esi-planets.manage_planets.v1',           tool: 'Colony Orbit · Command Briefing',                  desc: 'Read & manage your PI colonies',                        active: true  },
  { scope: 'esi-location.read_location.v1',           tool: 'Command Briefing',                                 desc: 'Read your current solar system',                        active: true  },
  { scope: 'esi-skills.read_skills.v1',               tool: 'Training Deck · Industry Console · Clone Bay',     desc: 'Read trained skills & attributes',                      active: true  },
  { scope: 'esi-skills.read_skillqueue.v1',           tool: 'Training Deck · Command Briefing',                 desc: 'Read what\'s currently training',                       active: true  },
  { scope: 'esi-fittings.read_fittings.v1',           tool: 'Fitting Hangar',                                   desc: 'Read your in-game fittings',                            active: true  },
  { scope: 'esi-corporations.read_structures.v1',     tool: 'Citadel Watch · Moon Watch',                       desc: 'Read corp Upwell structures',                           active: true  },
  { scope: 'esi-universe.read_structures.v1',         tool: 'Most tools',                                       desc: 'Resolve structure names & locations',                   active: true  },
  { scope: 'esi-industry.read_corporation_mining.v1', tool: 'Moon Watch',                                       desc: 'Read moon-mining extraction timers',                    active: true  },
  { scope: 'esi-industry.read_character_jobs.v1',     tool: 'Industry Console · Command Briefing',              desc: 'Read your manufacturing/reaction jobs',                 active: true  },
  { scope: 'esi-industry.read_corporation_jobs.v1',   tool: 'Industry Console',                                 desc: 'Read corp manufacturing/reaction jobs',                 active: true  },
  { scope: 'esi-characters.read_blueprints.v1',       tool: 'Industry Console',                                 desc: 'Read your owned blueprints',                            active: true  },
  { scope: 'esi-corporations.read_blueprints.v1',     tool: 'Industry Console',                                 desc: 'Read corp-owned blueprints',                            active: true  },
  { scope: 'esi-assets.read_assets.v1',               tool: 'Cargo Holds',                                      desc: 'Read your personal assets',                             active: true  },
  { scope: 'esi-markets.read_character_orders.v1',    tool: 'Industry Console · The Exchange · Command Briefing', desc: 'Read your active market orders',                      active: true  },
  { scope: 'esi-wallet.read_character_wallet.v1',     tool: 'Industry Console · The Treasury · Command Briefing', desc: 'Read your wallet balance',                            active: true  },
  { scope: 'esi-contracts.read_character_contracts.v1', tool: 'Contract Docket',                                desc: 'Read your personal contracts',                          active: true  },
  { scope: 'esi-industry.read_character_mining.v1',   tool: 'Extraction Ledger',                                desc: 'Read your personal mining ledger',                      active: true  },
  { scope: 'esi-clones.read_clones.v1',               tool: 'Clone Bay',                                        desc: 'Read your jump clones & home station',                  active: true  },
  { scope: 'esi-clones.read_implants.v1',             tool: 'Clone Bay',                                        desc: 'Read your active implants',                             active: true  },
  // ── Reserved: valid scopes for planned features; not requested at login ──
  { scope: 'esi-fittings.write_fittings.v1',          tool: 'Reserved — Fitting Hangar (planned)',              desc: 'Save fittings to your ship',                            active: false },
  { scope: 'esi-characters.read_standings.v1',        tool: 'Reserved — Colony Orbit (planned)',                desc: 'Read your standings (POCO tax)',                        active: false },
  { scope: 'esi-alliances.read_contacts.v1',          tool: 'Reserved — Colony Orbit (planned)',                desc: 'Read alliance standings (POCO tax)',                    active: false },
  { scope: 'esi-corporations.read_contacts.v1',       tool: 'Reserved — Colony Orbit (planned)',                desc: 'Read corp standings (POCO tax)',                        active: false },
  { scope: 'esi-planets.read_customs_offices.v1',     tool: 'Reserved — Colony Orbit (planned)',                desc: 'Read customs office tax rates',                         active: false },
  { scope: 'esi-assets.read_corporation_assets.v1',   tool: 'Reserved — Citadel Watch (planned)',               desc: 'Read corp assets (fuel, gas)',                          active: false },
  { scope: 'esi-corporations.read_divisions.v1',      tool: 'Reserved — Industry Console (planned)',            desc: 'Read corp hangar division names',                       active: false },
  { scope: 'esi-markets.structure_markets.v1',        tool: 'Reserved — Industry Console (planned)',            desc: 'Read structure market prices',                          active: false },
];

/** Subset that is actually requested at sign-in. */
export const ACTIVE_SCOPES     = SCOPE_INFO.filter(s => s.active);
export const ACTIVE_SCOPE_LIST = ACTIVE_SCOPES.map(s => s.scope).join(' ');
