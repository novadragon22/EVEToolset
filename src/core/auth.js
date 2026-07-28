/**
 * EVE Suite — OAuth 2.0 PKCE authentication
 *
 * Only index.html (the hub) runs the full login flow.
 * All other tools read pre-authenticated characters from localStorage via
 * storage.js and refresh tokens via esi-client.js.
 *
 * Public API
 * ──────────
 *   beginLogin()          – redirect to EVE SSO (call from a user gesture)
 *   handleSuiteRedirect() – call on page load; processes the ?code= callback
 *   decodeJwt(token)      – decode a JWT payload without verifying signature
 *   tokenScopes(access)   – extract the `scp` claim from an access token
 */

import { SSO_AUTH, ACTIVE_SCOPE_LIST } from './constants.js';
import { postToken, esiPub }           from './esi-client.js';
import { upsertChar, saveClientId }    from './storage.js';

// ── Crypto helpers ────────────────────────────────────────────────────────────

function b64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(str) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
}

function rnd(byteCount) {
  const a = new Uint8Array(byteCount);
  crypto.getRandomValues(a);
  return b64url(a.buffer);
}

// ── JWT ───────────────────────────────────────────────────────────────────────

/**
 * Decode a JWT payload without signature verification.
 * Returns {} on any parse error.
 *
 * @param {string} token
 * @returns {object}
 */
export function decodeJwt(token) {
  try {
    return JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    );
  } catch {
    return {};
  }
}

/**
 * Extract the scopes granted in an EVE access token.
 * Returns null if the token cannot be decoded.
 *
 * @param {string} access – access token JWT
 * @returns {string[]|null}
 */
export function tokenScopes(access) {
  try {
    const payload = decodeJwt(access);
    const s = payload.scp;
    if (Array.isArray(s))        return s;
    if (typeof s === 'string')   return [s];
    return [];
  } catch {
    return null;
  }
}

// ── PKCE login flow ───────────────────────────────────────────────────────────

const PKCE_SESSION_KEY  = 'suite_pkce';
const RETURN_SESSION_KEY = 'eve_suite_return';

/**
 * Kick off the PKCE login flow.
 * Stores the code verifier in sessionStorage and redirects to EVE SSO.
 *
 * @param {string} clientId     – the EVE Developer application client ID
 * @param {string} callbackUrl  – the redirect_uri registered with the SSO app
 * @param {string} [returnPage] – which page to return to after auth (default 'index.html')
 */
export async function beginLogin(clientId, callbackUrl, returnPage = 'index.html') {
  if (!clientId || clientId.startsWith('REPLACE')) {
    alert(
      'SUITE_CLIENT_ID is not configured.\n\n' +
      'Register an EVE Developer application at https://developers.eveonline.com\n' +
      'with callback URL:\n  ' + callbackUrl + '\n\n' +
      'Then set SUITE_CLIENT_ID in src/core/auth.js (or your .env file).',
    );
    return;
  }

  const verifier   = rnd(32);
  const challenge  = b64url(await sha256(verifier));

  sessionStorage.setItem(PKCE_SESSION_KEY,   verifier);
  sessionStorage.setItem(RETURN_SESSION_KEY, returnPage);

  const url = new URL(SSO_AUTH);
  url.search = new URLSearchParams({
    response_type:         'code',
    redirect_uri:          callbackUrl,
    client_id:             clientId,
    scope:                 ACTIVE_SCOPE_LIST,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    state:                 rnd(8),
  }).toString();

  location.href = url.toString();
}

/**
 * Process the ?code= redirect from EVE SSO.
 * Should be called unconditionally on page load in index.html.
 * No-ops if no `code` param is present.
 *
 * On success:
 *   • exchanges the code for tokens
 *   • decodes the JWT to get charId/charName
 *   • fetches corp info via ESI
 *   • upserts the roster entry via storage.upsertChar()
 *   • clears the code from the address bar
 *
 * @param {string} clientId
 * @param {string} callbackUrl
 * @returns {Promise<import('./storage.js').CharEntry|null>} the new entry, or null if no redirect
 */
export async function handleSuiteRedirect(clientId, callbackUrl) {
  const params = new URLSearchParams(location.search);
  const code   = params.get('code');
  if (!code) return null;

  // Clean the URL immediately so a refresh doesn't re-submit the code
  history.replaceState({}, '', location.pathname);

  const verifier = sessionStorage.getItem(PKCE_SESSION_KEY) || '';

  try {
    const t = await postToken(new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      client_id:     clientId,
      code_verifier: verifier,
      redirect_uri:  callbackUrl,
    }));

    const payload  = decodeJwt(t.access_token);
    const charId   = +String(payload.sub || '').split(':').pop();
    const charName = payload.name || ('Char ' + charId);

    const entry = {
      access:   t.access_token,
      refresh:  t.refresh_token,
      expires:  Date.now() + (t.expires_in || 1200) * 1000,
      charId,
      charName,
      corpId:   null,
      corpName: '',
    };

    // Best-effort corp lookup — non-fatal if ESI is slow
    try {
      const ch  = await esiPub('/characters/' + charId + '/');
      entry.corpId = ch.corporation_id;
      const co  = await esiPub('/corporations/' + entry.corpId + '/');
      entry.corpName = co.name || '';
    } catch { /* ignore */ }

    // Publish the client ID so tools can refresh tokens without embedding it
    saveClientId(clientId);

    return upsertChar(entry);
  } catch (e) {
    alert('Sign-in failed: ' + e.message);
    return null;
  }
}

// ── Scope audit ───────────────────────────────────────────────────────────────

/**
 * Compare the scopes in a stored access token against the suite's active
 * scope list and return a summary object.
 *
 * @param {string}   access       – access token JWT
 * @param {string[]} activeScopes – list from ACTIVE_SCOPES in constants.js
 * @returns {{ scopes: string[]|null, missing: string[]|null, ts: number }}
 */
export function auditScopes(access, activeScopes) {
  const scopes  = tokenScopes(access);
  const missing = scopes ? activeScopes.filter(a => !scopes.includes(a)) : null;
  return { scopes, missing, ts: Date.now() };
}
