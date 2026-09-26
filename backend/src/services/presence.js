/**
 * Who is actually connected right now.
 *
 * The friends list used to report `1 as online` for every row — a literal in
 * the SQL — so every friend appeared online forever, including accounts that
 * had never connected. The socket layer already knew the truth; it just kept it
 * to itself. This module owns that map so both the realtime layer and the REST
 * layer read the same source.
 *
 * Deliberately dependency-free: matchSocket requires it, and friendService
 * requires it, so anything it imported could close a cycle.
 */

/** userId -> socketId of that user's current connection. */
const online = new Map();

/**
 * Records a connection. One socket per account: the returned value is the
 * socket id that was previously registered, if any, so the caller can
 * disconnect the superseded session.
 */
function setOnline(userId, socketId) {
    const previous = online.get(userId) || null;
    online.set(userId, socketId);
    return previous;
}

/**
 * Clears a connection. `socketId` guards against a late `disconnect` from a
 * superseded socket wiping the newer session's entry.
 */
function setOffline(userId, socketId = null) {
    if (socketId && online.get(userId) !== socketId) return false;
    return online.delete(userId);
}

function socketIdFor(userId) {
    return online.get(userId) || null;
}

function isOnline(userId) {
    return online.has(Number(userId));
}

/** Filters a list of ids down to those currently connected. */
function onlineAmong(userIds = []) {
    const result = new Set();
    for (const id of userIds) {
        if (online.has(Number(id))) result.add(Number(id));
    }
    return result;
}

function onlineCount() {
    return online.size;
}

/** Test and shutdown helper. */
function clear() {
    online.clear();
}

module.exports = {
    setOnline,
    setOffline,
    socketIdFor,
    isOnline,
    onlineAmong,
    onlineCount,
    clear
};
