// twitchAuth.js
// Verwaltet die Authentifizierung des Streamers und den Twitch API Client.

const { ApiClient } = require('@twurple/api');
const { authenticateAccount, clearAuthData } = require('./authUtils/authManager');
const configLoader = require('./configLoader'); // Weiterhin für globale Konfiguration benötigt

// Globale Variablen für Streamer-Authentifizierung
let twitchAuthProvider = null;
let twitchApiClient = null;
let currentStreamerUsername = null;
let currentStreamerUserId = null;
let currentAccessToken = null;
let twitchClientID = null;
let twitchClientSecret = null;

const REQUIRED_STREAMER_SCOPES = [
    "bits:read",
    "channel:manage:broadcast",
    "channel:manage:polls",
    "channel:manage:predictions",
    "channel:manage:raids",
    "channel:manage:redemptions",
    "channel:read:goals",
    "channel:read:hype_train",
    "channel:read:polls",
    "channel:read:predictions",
    "channel:read:redemptions",
    "channel:read:subscriptions",
    "channel:read:vips",
    "chat:edit",
    "chat:read",
    "moderation:read",
    "moderator:manage:shoutouts",
    "moderator:read:chatters",
    "moderator:read:followers",
    "user:read:broadcast",
    "user:read:email",
    "user:read:follows",
    "whispers:edit",
    "whispers:read"
];

console.log(`[TwitchAuth] Von der Anwendung angeforderte REQUIRED_STREAMER_SCOPES: [${REQUIRED_STREAMER_SCOPES.join(', ')}]`);

// Der AUTH_SERVER_PORT kann zentral in der config.json oder hier definiert werden.
// Da startOAuthServer im authManager aufgerufen wird, kann der Port dort als Parameter übergeben werden.
const STREAMER_AUTH_SERVER_PORT = 8080; // Beispiel: Kann auch aus configLoader.loadConfig() kommen

/**
 * Initialisiert den Twitch Authentifizierungsfluss für das Streamer-Konto.
 *
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} redirectUri
 * @returns {Promise<{username: string, userId: string, accessToken: string, twitchAuthProvider: import('@twurple/auth').RefreshingAuthProvider, twitchApiClient: import('@twurple/api').ApiClient}>} Ein Promise, das mit den Streamer-Informationen aufgelöst wird.
 */
async function initializeTwitchAuth(clientId, clientSecret, redirectUri) {
    console.log('[TwitchAuth] Starte Streamer-Authentifizierungsprozess...');

    const config = configLoader.getEnvConfig();
    twitchClientID = config.TWITCH_APP_CLIENT_ID;
    twitchClientSecret = config.TWITCH_APP_CLIENT_SECRET;

    try {
        const authResult = await authenticateAccount({
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: redirectUri,
            configKeyPrefix: 'STREAMER', // Spezifischer Präfix für Streamer
            requiredScopes: REQUIRED_STREAMER_SCOPES,
            oauthServerPort: STREAMER_AUTH_SERVER_PORT
        });

        // Weise die globalen Variablen zu
        twitchAuthProvider = authResult.authProvider;
        twitchApiClient = authResult.apiClient;
        currentStreamerUserId = authResult.userId;
        currentStreamerUsername = authResult.username;
        currentAccessToken = authResult.accessToken; // Aktueller Access Token

        const fileConfig = configLoader.getFileConfig()

        const currentRefreshToken = fileConfig.STREAMER_OAUTH_REFRESH_TOKEN;
        const tokenExpiresIn = fileConfig.STREAMER_OAUTH_EXPIRES_IN;
        const SetObtainmentTimestamp = fileConfig.LAST_STREAMER_TOKEN_REFRESH;

        await twitchAuthProvider.addUser(currentStreamerUserId, {
            accessToken: currentAccessToken,
            refreshToken: currentRefreshToken,
            expiresIn: tokenExpiresIn,
            obtainmentTimestamp: SetObtainmentTimestamp,
            scope: REQUIRED_STREAMER_SCOPES
        }, ['chat'])

        const userScopes = twitchAuthProvider.getCurrentScopesForUser(currentStreamerUserId);

        console.log(`[TwitchAuth] Streamer-Authentifizierung erfolgreich abgeschlossen für: ${currentStreamerUsername} (ID: ${currentStreamerUserId}).`);

        return {
            username: currentStreamerUsername,
            userId: currentStreamerUserId,
            accessToken: currentAccessToken,
            twitchAuthProvider,
            twitchApiClient
        };

    } catch (error) {
        console.error('[TwitchAuth] FEHLER bei der Initialisierung der Streamer-Authentifizierung:', error.message);
        // Da authenticateAccount den Fehler bereits detailliert protokolliert und Tokens löscht,
        // werfen wir ihn hier nur weiter.
        throw error;
    }
}

/**
 * Gibt den aktuell initialisierten Twurple API Client zurück.
 * @returns {ApiClient|null}
 */
function getTwitchApiClient() {
    return twitchApiClient;
}

/**
 * Gibt den aktuell initialisierten Twurple RefreshingAuthProvider zurück.
 * @returns {RefreshingAuthProvider|null}
 */
function getTwitchAuthProvider() {
    return twitchAuthProvider;
}

/**
 * Gibt den Access Token des Streamers zurück.
 * @returns {string|null}
 */
function getTwitchAccessToken() {
    return currentAccessToken;
}

/**
 * Gibt den Benutzernamen des Streamers zurück.
 * @returns {string|null}
 */
function getStreamerUsername() {
    return currentStreamerUsername;
}

/**
 * Gibt die Benutzer-ID des Streamers zurück.
 * @returns {string|null}
 */
function getStreamerUserId() {
    return currentStreamerUserId;
}

module.exports = {
    initializeTwitchAuth,
    getTwitchAccessToken,
    getTwitchApiClient,
    getStreamerUsername,
    getStreamerUserId,
    getTwitchAuthProvider
};
