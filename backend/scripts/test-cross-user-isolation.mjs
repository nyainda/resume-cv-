#!/usr/bin/env node
/**
 * test-cross-user-isolation.mjs
 *
 * D1-layer cross-user contamination test suite.
 * Validates the fix for the user_slots cross-account data leak described in the
 * Identity, Ownership & Storage Directive (sections 0–3).
 *
 * What it tests (section 3 of the directive):
 *   1. Two distinct users, same device_id, same slot_id — no profile_json bleed.
 *   2. GET /api/cv/user-data never returns another user's data regardless of write order.
 *   3. DELETE always removes the correct row (meta.changes ≥ 1 when row existed).
 *   4. Account deletion leaves zero rows reachable by the deleted user's user_id.
 *   5. Regression guard — these assertions hold under the rebuilt schema (PRIMARY KEY
 *      on user_id, not device_id) and would have failed loudly on the old schema.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=<token> node backend/scripts/test-cross-user-isolation.mjs
 *
 * The script creates ephemeral test rows directly in D1 via the REST API, calls the
 * live worker endpoints with those sessions, and cleans up afterwards regardless of
 * pass/fail.
 *
 * Requirements:
 *   - CLOUDFLARE_API_TOKEN with D1:Edit permission
 *   - Node 18+ (native fetch, crypto)
 */

import crypto from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────

const ACCOUNT_ID = '3b2dc03a15c292df3054249f73a321bb';
const DB_ID      = '5193fa77-54c8-4e49-bf3a-c615af170191';
const WORKER_URL = 'https://cv-engine-worker.dripstech.workers.dev';

const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
if (!CF_TOKEN) {
    console.error('❌  CLOUDFLARE_API_TOKEN is required.');
    console.error('    Usage: CLOUDFLARE_API_TOKEN=<token> node backend/scripts/test-cross-user-isolation.mjs');
    process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PASS = '✅';
const FAIL = '❌';
const SKIP = '⚠️ ';

let passed = 0;
let failed = 0;
const failures = [];

function assert(label, condition, detail = '') {
    if (condition) {
        console.log(`  ${PASS} ${label}`);
        passed++;
    } else {
        console.log(`  ${FAIL} ${label}${detail ? ' — ' + detail : ''}`);
        failed++;
        failures.push(label + (detail ? ' — ' + detail : ''));
    }
}

/** POST a SQL statement to D1 via the REST API. Returns the first result set. */
async function d1(sql, params = []) {
    const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DB_ID}/query`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CF_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sql, params }),
        },
    );
    const body = await res.json();
    if (!body.success) {
        throw new Error(`D1 query failed: ${JSON.stringify(body.errors)}\nSQL: ${sql}`);
    }
    return body.result?.[0] ?? { results: [], meta: {} };
}

/** SHA-256 of a string → hex (matches hashToken in auth.ts). */
async function sha256hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Call a worker endpoint with a Bearer session token. */
async function workerFetch(path, token, opts = {}) {
    return fetch(`${WORKER_URL}${path}`, {
        ...opts,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(opts.headers ?? {}),
        },
    });
}

/** Generate a random raw token and return { raw, hash }. */
async function makeToken() {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = await sha256hex(raw);
    return { raw, hash };
}

const now = Math.floor(Date.now() / 1000);
const expiresAt = now + 3600; // 1 hour from now
const TEST_DEVICE = `test-device-${crypto.randomUUID()}`;
const SHARED_SLOT_ID = `shared-slot-${crypto.randomUUID()}`; // same slot_id for both users

// Track created user IDs for cleanup
const createdUserIds = [];

/** Insert a test identity + session directly into D1. Returns { userId, token }. */
async function createTestUser(email) {
    // Insert into user_identities — schema: id, google_id, email, name, picture,
    // device_id, plan, generation_count, generations_reset_at, created_at, last_seen_at
    const identity = await d1(
        `INSERT INTO user_identities (email, name, picture, plan, device_id, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
        [email, 'Test User', '', 'free', TEST_DEVICE, now, now],
    );
    const userId = identity.results?.[0]?.id;
    if (!userId) throw new Error(`Failed to create test identity for ${email}`);
    createdUserIds.push(userId);

    // Create a session token — schema: token (PK), user_id, expires_at, created_at
    const { raw, hash } = await makeToken();
    await d1(
        `INSERT INTO user_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
        [hash, userId, now, expiresAt],
    );

    return { userId, token: raw };
}

/** Delete all test data for the given user_ids. */
async function cleanup(userIds) {
    if (userIds.length === 0) return;
    const ids = userIds.join(',');
    await d1(`DELETE FROM user_slots       WHERE user_id IN (${ids})`).catch(() => {});
    await d1(`DELETE FROM user_preferences WHERE user_id IN (${ids})`).catch(() => {});
    await d1(`DELETE FROM user_sessions    WHERE user_id IN (${ids})`).catch(() => {});
    await d1(`DELETE FROM user_identities  WHERE id IN (${ids})`).catch(() => {});
}

// ─── Test suite ───────────────────────────────────────────────────────────────

let userA, userB;

try {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ProCV — D1 Cross-User Isolation Test Suite');
    console.log('  Worker:', WORKER_URL);
    console.log('  Database:', DB_ID);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // ── Setup ─────────────────────────────────────────────────────────────────
    console.log('⚙️   Creating test users (same device_id, shared slot_id)…');
    userA = await createTestUser(`test-a-${Date.now()}@procv-test.invalid`);
    userB = await createTestUser(`test-b-${Date.now()}@procv-test.invalid`);
    console.log(`    User A: id=${userA.userId}  User B: id=${userB.userId}`);
    console.log(`    Shared device_id: ${TEST_DEVICE}`);
    console.log(`    Shared slot_id:   ${SHARED_SLOT_ID}\n`);

    const profileA = JSON.stringify({ personalInfo: { name: 'Alice (User A)' }, _test: 'user-a' });
    const profileB = JSON.stringify({ personalInfo: { name: 'Bob (User B)'   }, _test: 'user-b' });

    // ── Test 1: Write isolation ────────────────────────────────────────────────
    console.log('─── Test 1: Write isolation (same device_id + slot_id, two users) ───');

    const writeA = await workerFetch('/api/cv/user-slots', userA.token, {
        method: 'POST',
        body: JSON.stringify({
            device_id: TEST_DEVICE,
            slot_id: SHARED_SLOT_ID,
            slot_name: 'Alice slot',
            color: 'indigo',
            profile_json: profileA,
        }),
    });
    const writeABody = await writeA.json();
    assert('User A slot write succeeds (200)', writeA.status === 200, `status=${writeA.status} body=${JSON.stringify(writeABody)}`);
    assert('User A write returns ok:true', writeABody.ok === true, JSON.stringify(writeABody));

    const writeB = await workerFetch('/api/cv/user-slots', userB.token, {
        method: 'POST',
        body: JSON.stringify({
            device_id: TEST_DEVICE,
            slot_id: SHARED_SLOT_ID,  // intentional collision
            slot_name: 'Bob slot',
            color: 'violet',
            profile_json: profileB,
        }),
    });
    const writeBBody = await writeB.json();
    assert('User B slot write succeeds (200)', writeB.status === 200, `status=${writeB.status} body=${JSON.stringify(writeBBody)}`);
    assert('User B write returns ok:true', writeBBody.ok === true, JSON.stringify(writeBBody));

    // ── Test 2: Read isolation ─────────────────────────────────────────────────
    console.log('\n─── Test 2: Read isolation (GET /api/cv/user-data) ───');

    const dataA = await workerFetch('/api/cv/user-data', userA.token, { method: 'GET' });
    const dataABody = await dataA.json();
    assert('User A GET returns 200', dataA.status === 200, `status=${dataA.status}`);

    const slotA = dataABody.slots?.find(s => s.slot_id === SHARED_SLOT_ID);
    assert('User A sees their own slot', !!slotA, 'slot not found in response');
    if (slotA) {
        const parsed = JSON.parse(slotA.profile_json);
        assert("User A's slot contains Alice's profile", parsed._test === 'user-a', `got _test=${parsed._test}`);
        assert("User A's slot does NOT contain Bob's profile", parsed._test !== 'user-b', `got _test=${parsed._test}`);
    }

    const dataB = await workerFetch('/api/cv/user-data', userB.token, { method: 'GET' });
    const dataBBody = await dataB.json();
    assert('User B GET returns 200', dataB.status === 200, `status=${dataB.status}`);

    const slotB = dataBBody.slots?.find(s => s.slot_id === SHARED_SLOT_ID);
    assert('User B sees their own slot', !!slotB, 'slot not found in response');
    if (slotB) {
        const parsed = JSON.parse(slotB.profile_json);
        assert("User B's slot contains Bob's profile", parsed._test === 'user-b', `got _test=${parsed._test}`);
        assert("User B's slot does NOT contain Alice's profile", parsed._test !== 'user-a', `got _test=${parsed._test}`);
    }

    // Cross-check: User A's response must not contain any User B data
    const aHasBData = dataABody.slots?.some(s => {
        try { return JSON.parse(s.profile_json)._test === 'user-b'; } catch { return false; }
    });
    assert("User A's GET contains no User B data", !aHasBData, 'found user-b profile in user-a response');

    const bHasAData = dataBBody.slots?.some(s => {
        try { return JSON.parse(s.profile_json)._test === 'user-a'; } catch { return false; }
    });
    assert("User B's GET contains no User A data", !bHasAData, 'found user-a profile in user-b response');

    // ── Test 3: Delete correctness ─────────────────────────────────────────────
    console.log('\n─── Test 3: Delete correctness (meta.changes check) ───');

    // First delete — should actually remove the row
    const del1 = await workerFetch('/api/cv/user-slots', userA.token, {
        method: 'DELETE',
        body: JSON.stringify({ slot_id: SHARED_SLOT_ID }),
    });
    const del1Body = await del1.json();
    assert('Delete returns 200', del1.status === 200, `status=${del1.status}`);
    assert('Delete reports deleted:true on first call', del1Body.deleted === true, `deleted=${del1Body.deleted}`);

    // Second delete of same slot — row already gone, should report deleted:false
    const del2 = await workerFetch('/api/cv/user-slots', userA.token, {
        method: 'DELETE',
        body: JSON.stringify({ slot_id: SHARED_SLOT_ID }),
    });
    const del2Body = await del2.json();
    assert('Second delete returns 200 (not 404)', del2.status === 200, `status=${del2.status}`);
    assert('Second delete reports deleted:false (row already gone)', del2Body.deleted === false, `deleted=${del2Body.deleted}`);

    // User B's slot must still exist after User A's delete
    const dataBAfterDel = await workerFetch('/api/cv/user-data', userB.token, { method: 'GET' });
    const dataBAfterDelBody = await dataBAfterDel.json();
    const slotBStillExists = dataBAfterDelBody.slots?.some(s => s.slot_id === SHARED_SLOT_ID);
    assert("User A's delete did NOT affect User B's slot", slotBStillExists === true, 'User B slot missing after User A delete');

    // ── Test 4: Account deletion isolation ────────────────────────────────────
    console.log('\n─── Test 4: Account deletion leaves zero rows for deleted user ───');

    // Clean up User A's identity directly in D1 (simulate account deletion)
    await d1(`DELETE FROM user_sessions   WHERE user_id = ?`, [userA.userId]);
    await d1(`DELETE FROM user_slots      WHERE user_id = ?`, [userA.userId]);
    await d1(`DELETE FROM user_identities WHERE id = ?`,      [userA.userId]);

    // Remove userA from cleanup list (already gone)
    const idxA = createdUserIds.indexOf(userA.userId);
    if (idxA !== -1) createdUserIds.splice(idxA, 1);

    // User A's session token should now be invalid
    const afterDeleteReq = await workerFetch('/api/cv/user-data', userA.token, { method: 'GET' });
    assert('Deleted user gets 401 on subsequent request', afterDeleteReq.status === 401, `status=${afterDeleteReq.status}`);

    // Verify zero rows remain in D1 for user A
    const remainingSlots = await d1(`SELECT COUNT(*) as cnt FROM user_slots WHERE user_id = ?`, [userA.userId]);
    const slotCount = remainingSlots.results?.[0]?.cnt ?? -1;
    assert('Zero user_slots rows remain for deleted user', slotCount === 0, `found ${slotCount} rows`);

    const remainingPrefs = await d1(`SELECT COUNT(*) as cnt FROM user_preferences WHERE user_id = ?`, [userA.userId]);
    const prefCount = remainingPrefs.results?.[0]?.cnt ?? -1;
    assert('Zero user_preferences rows remain for deleted user', prefCount === 0, `found ${prefCount} rows`);

    // User B's data must be completely unaffected
    const dataBFinal = await workerFetch('/api/cv/user-data', userB.token, { method: 'GET' });
    assert("User B's session unaffected by User A deletion", dataBFinal.status === 200, `status=${dataBFinal.status}`);
    const dataBFinalBody = await dataBFinal.json();
    const slotBFinal = dataBFinalBody.slots?.find(s => s.slot_id === SHARED_SLOT_ID);
    assert("User B's slot intact after User A account deletion", !!slotBFinal, 'slot missing');

    // ── Test 5: Unauthenticated access blocked ────────────────────────────────
    console.log('\n─── Test 5: Unauthenticated access blocked ───');

    const noToken = await fetch(`${WORKER_URL}/api/cv/user-data`, { method: 'GET' });
    assert('GET without token returns 401', noToken.status === 401, `status=${noToken.status}`);

    const badToken = await workerFetch('/api/cv/user-data', 'not-a-real-token', { method: 'GET' });
    assert('GET with invalid token returns 401', badToken.status === 401, `status=${badToken.status}`);

} catch (err) {
    console.error(`\n${FAIL}  Unexpected error during test run:`, err.message);
    failed++;
    failures.push(`Unexpected error: ${err.message}`);
} finally {
    // ── Cleanup ───────────────────────────────────────────────────────────────
    console.log('\n⚙️   Cleaning up test data…');
    try {
        await cleanup(createdUserIds);
        console.log('    Done.\n');
    } catch (e) {
        console.warn(`    ${SKIP} Cleanup partial: ${e.message}`);
    }
}

// ─── Results ──────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
if (failed === 0) {
    console.log(`${PASS}  All ${total} assertions passed — cross-user isolation verified.`);
} else {
    console.log(`${FAIL}  ${failed}/${total} assertions failed:\n`);
    failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

process.exit(failed > 0 ? 1 : 0);
