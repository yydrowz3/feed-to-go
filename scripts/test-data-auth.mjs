import { createHash, randomUUID } from 'node:crypto';

const check = (condition, message) => { if (!condition) throw new Error(message); };
export class RequestError extends Error {
  constructor(path, status, uncertain = false) {
    super(`Request ${path} ${status ? `returned HTTP ${status}` : 'had no confirmed response'}.`);
    this.path = path; this.status = status; this.uncertain = uncertain;
  }
}

export async function registerAccounts({ accounts, apiBase, only = 'all', save, record, now,
  fetchImpl = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), log = line => process.stdout.write(`${line}\n`) }) {
  const request = async (account, path, body, token) => {
    const started = Date.now();
    let response;
    let data;
    try {
      response = await fetchImpl(`${apiBase}${path}`, { method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) });
      data = await response.json();
    } catch {
      await record({ alias: account.alias, method: 'POST', path, status: response?.status ?? null,
        elapsed_ms: Date.now() - started, checked_at: now(), result: 'unconfirmed_response' });
      throw new RequestError(path, response?.status ?? 0, true);
    }
    await record({ alias: account.alias, method: 'POST', path, status: response.status, elapsed_ms: Date.now() - started,
      checked_at: now(), result: response.ok ? 'success' : response.status === 429 ? 'rate_limited' : 'rejected' });
    if (response.status === 429) {
      const error = new RequestError(path, 429);
      error.message += ` Stop and wait for the normal ${path === '/account/register' ? 'registration (1 hour)' : 'login (1 minute)'} window; do not reset counters or change IP.`;
      throw error;
    }
    return { status: response.status, ok: response.ok, data };
  };
  async function lookup(account) {
    const result = await request(account, '/account/findByUsername', { username: account.username });
    if ((result.status === 404 || result.status === 500) && ['record not found', 'account not found'].includes(result.data?.error)) return null;
    if (!result.ok) throw new RequestError('/account/findByUsername', result.status);
    check(Number.isSafeInteger(result.data?.id) && result.data.id > 0 && result.data.username === account.username,
      `Account ${account.alias}: lookup identity does not match. No registration attempted.`);
    return result.data;
  }
  let previousLogin = 0;
  async function verify(account, found) {
    if (previousLogin) await wait(Math.max(0, 6500 - (Date.now() - previousLogin)));
    previousLogin = Date.now();
    const login = await request(account, '/account/login', { username: account.username, password: account.password });
    if (!login.ok) throw new RequestError('/account/login', login.status);
    check(login.data?.account_id === found.id && login.data.username === account.username
      && typeof login.data.token === 'string' && login.data.token.length > 0
      && typeof login.data.refresh_token === 'string' && login.data.refresh_token.length > 0,
    `Account ${account.alias}: login response identity or credentials are invalid.`);
    const protectedRead = await request(account, '/feed/listByFollowing', { limit: 1 }, login.data.token);
    if (!protectedRead.ok) throw new RequestError('/feed/listByFollowing', protectedRead.status);
    check(Array.isArray(protectedRead.data?.video_list), `Account ${account.alias}: protected read returned an invalid response.`);
    account.account_id = found.id;
    account.registration_status = 'registered'; account.last_error = null;
    account.login_verified_at = now(); account.protected_read_verified_at = now();
    await save();
    log(`Account ${account.alias}: registered ID ${found.id}; login and protected read passed.`);
  }
  async function adjustCollision(account) {
    // Keep the password and all previously registered identities; only this pending candidate changes.
    const suffix = [...createHash('sha256').update(randomUUID()).digest().subarray(0, 8)]
      .map(b => String.fromCharCode(97 + b % 26)).join('');
    account.username += suffix;
    account.registration_status = 'pending'; account.account_id = null; account.last_error = null;
    await save();
    log(`Account ${account.alias}: existing name belongs to another registration; adjusted only the unregistered suffix.`);
  }
  for (const account of accounts.filter(a => only === 'all' || a.alias === only)) {
    if (account.registration_status === 'registered') { log(`Account ${account.alias}: already registered; skipped without a login or write request.`); continue; }
    try {
      let found = await lookup(account);
      if (found && account.registration_status === 'unknown' && account.registration_attempt) {
        try { await verify(account, found); continue; }
        catch (error) {
          // Never alter a candidate after a timeout, rate limit or unrelated server/protected-read error.
          if (!(error instanceof RequestError) || error.path !== '/account/login' || error.uncertain || ![401, 403].includes(error.status)) throw error;
          await adjustCollision(account); found = null;
        }
      } else if (found) {
        // A pending/failed name without a provable in-flight registration is never adopted.
        await adjustCollision(account); found = null;
      }
      for (let collisions = 0; collisions < 3; collisions++) {
        found = await lookup(account);
        if (!found) break;
        await adjustCollision(account);
      }
      check(!found, `Account ${account.alias}: repeated username conflicts; choose a new batch.`);
      account.registration_status = 'unknown'; account.account_id = null; account.last_error = null;
      account.registration_attempt = { source: 'api', started_at: now(), request_id: randomUUID() };
      await save(); // Write intent BEFORE sending; interruption can never leave a pending request to replay blindly.
      const created = await request(account, '/account/register', { username: account.username, password: account.password });
      if (!created.ok) {
        account.registration_status = created.status >= 500 ? 'unknown' : 'failed';
        throw new RequestError('/account/register', created.status, created.status >= 500);
      }
      found = await lookup(account);
      check(found, `Account ${account.alias}: registration response succeeded but lookup is not confirmed; resume to reconcile.`);
      await verify(account, found);
    } catch (error) {
      account.last_error = error instanceof RequestError ? `HTTP ${error.status || 'unknown'}; request result requires reconciliation`
        : 'Identity or response validation failed; inspect sanitized evidence before resuming';
      await save();
      throw error;
    }
  }
}
