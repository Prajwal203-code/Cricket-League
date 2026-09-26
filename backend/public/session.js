/**
 * Client session: device identity, session token, authenticated transport.
 *
 * Loaded before app.js because everything else depends on it.
 *
 * Why this exists: the API used to identify callers by `?userId=1`, so the
 * browser never needed credentials. Now every endpoint requires a session token
 * issued by the server, and the socket handshake requires the same token. This
 * module obtains one, stores it, and makes sure it is attached to every request
 * the rest of the app makes — without each of the ~39 existing fetch call sites
 * having to know about it.
 *
 * Exposes `window.Session`.
 */
(function () {
    'use strict';

    const TOKEN_KEY = 'cl.sessionToken';
    const DEVICE_KEY = 'cl.deviceId';
    const USER_KEY = 'cl.user';

    let token = null;
    let currentUser = null;
    let readyResolve;
    const ready = new Promise(resolve => { readyResolve = resolve; });

    // -- storage ---------------------------------------------------------

    function safeGet(key) {
        try {
            return localStorage.getItem(key);
        } catch {
            return null;   // private mode / storage disabled
        }
    }

    function safeSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch {
            /* non-fatal: the session simply won't survive a reload */
        }
    }

    function safeRemove(key) {
        try {
            localStorage.removeItem(key);
        } catch { /* ignore */ }
    }

    /**
     * A stable, unguessable per-device id. This is the only thing that lets a
     * guest resume their account, so it is generated with crypto randomness
     * rather than something predictable like a timestamp.
     */
    function getDeviceId() {
        let id = safeGet(DEVICE_KEY);
        if (id && /^[A-Za-z0-9_-]{16,64}$/.test(id)) return id;

        const bytes = new Uint8Array(24);
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

        safeSet(DEVICE_KEY, id);
        return id;
    }

    function setToken(value) {
        token = value || null;
        if (token) safeSet(TOKEN_KEY, token);
        else safeRemove(TOKEN_KEY);
    }

    function setUser(user) {
        currentUser = user || null;
        if (currentUser) safeSet(USER_KEY, JSON.stringify(currentUser));
        else safeRemove(USER_KEY);
    }

    // -- transport -------------------------------------------------------

    const nativeFetch = window.fetch.bind(window);

    function isApiRequest(input) {
        try {
            const url = new URL(
                typeof input === 'string' ? input : input.url,
                window.location.origin
            );
            return url.origin === window.location.origin && url.pathname.startsWith('/api/');
        } catch {
            return false;
        }
    }

    /**
     * Adds the bearer token to same-origin /api requests.
     *
     * Deliberately scoped: a blanket header on every fetch would leak the
     * session token to Google's and Facebook's SDK endpoints.
     */
    async function authorizedFetch(input, init = {}) {
        if (!isApiRequest(input)) return nativeFetch(input, init);

        const headers = new Headers(init.headers || {});
        if (token && !headers.has('Authorization')) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        const response = await nativeFetch(input, { ...init, headers });

        // A rejected token means this session is over — drop it and get a new
        // guest one, then replay the request once. Without this the app would
        // stay silently signed out until the next reload.
        if (response.status === 401 && token && !init._retried) {
            setToken(null);
            setUser(null);
            const recovered = await bootstrapGuest();
            if (recovered) {
                return authorizedFetch(input, { ...init, _retried: true });
            }
        }

        return response;
    }

    // Installed globally so existing call sites need no changes.
    window.fetch = authorizedFetch;

    // -- session lifecycle ----------------------------------------------

    /** Exchanges the device id for a guest session token. */
    async function bootstrapGuest() {
        try {
            const res = await nativeFetch('/api/auth/guest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ deviceId: getDeviceId() })
            });
            if (!res.ok) return false;

            const data = await res.json();
            if (!data.success || !data.token) return false;

            setToken(data.token);
            setUser(data.user);
            return true;
        } catch {
            return false;   // offline: the app runs in its degraded UI mode
        }
    }

    /** Confirms a stored token still works and refreshes the cached user. */
    async function validateStoredToken() {
        try {
            const res = await nativeFetch('/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) return false;

            const data = await res.json();
            if (!data.success || !data.user) return false;

            setUser(data.user);
            return true;
        } catch {
            // Network failure, not a rejection — keep the token and let the
            // app retry rather than forcing a new guest account.
            return Boolean(token);
        }
    }

    /**
     * Establishes a session: reuse a valid stored token, otherwise obtain a
     * guest one. Resolves to the signed-in user, or null when offline.
     */
    async function init() {
        token = safeGet(TOKEN_KEY);

        const cached = safeGet(USER_KEY);
        if (cached) {
            try { currentUser = JSON.parse(cached); } catch { currentUser = null; }
        }

        if (token) {
            const ok = await validateStoredToken();
            if (!ok) {
                setToken(null);
                setUser(null);
            }
        }

        if (!token) await bootstrapGuest();

        readyResolve(currentUser);
        return currentUser;
    }

    /**
     * Adopts the token returned by a sign-in. The socket must reconnect so the
     * handshake carries the new identity — otherwise the realtime layer would
     * still be acting as the previous (guest) account.
     */
    function adoptSession(data) {
        if (!data || !data.token) return false;
        setToken(data.token);
        setUser(data.user);

        if (window.socket && window.socket.connected) {
            window.socket.disconnect();
            window.socket.connect();
        }
        return true;
    }

    /** Signs out and returns to a fresh guest identity on the same device. */
    async function signOutToGuest() {
        setToken(null);
        setUser(null);
        const ok = await bootstrapGuest();
        if (window.socket) {
            if (window.socket.connected) window.socket.disconnect();
            if (ok) window.socket.connect();
        }
        return ok;
    }

    window.Session = {
        ready,
        init,
        adoptSession,
        signOutToGuest,
        getDeviceId,
        getToken: () => token,
        getUser: () => currentUser,
        getUserId: () => (currentUser ? currentUser.id : null),
        isGuest: () => Boolean(currentUser && currentUser.is_guest),
        isAuthenticated: () => Boolean(token)
    };

    // Start immediately: app.js awaits Session.ready before its first request.
    init();
})();
