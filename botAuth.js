// botAuth.js
// Verwaltet die Authentifizierung des Bot-Accounts und stellt Twurple AuthProvider & ApiClient bereit.

const { ApiClient } = require('@twurple/api');
const { RefreshingAuthProvider } = require('@twurple/auth'); // RefreshingAuthProvider importieren
const { authenticateAccount, clearAuthData } = require('./authUtils/authManager'); // Stellt authenticateAccount bereit
const configLoader = require('./configLoader'); // Weiterhin für globale Konfiguration benötigt

// Ein Callback, der aufgerufen wird, wenn eine Re-Authentifizierung erforderlich ist
// (z.B. weil der Refresh Token abgelaufen oder ungültig ist)
let onBotReauthenticationRequiredCallback = null;

// Globale Variablen für Bot-Authentifizierung
let twitchBotAuthProvider = null; // Hält den RefreshingAuthProvider
let twitchBotApiClient = null;    // Hält den ApiClient
let currentBotUsername = null;
let currentBotUserId = null;
let currentBotAccessToken = null; // Der aktuell gültige Access Token des Bots

const REQUIRED_BOT_SCOPES = [
    'bits:read',
    'chat:read',
    'chat:edit', // Wichtig für den Chat-Intent
    'channel:moderate',
    'channel:read:redemptions',
    'channel:read:subscriptions',
    'channel:read:vips',
    'channel:read:goals',
    'channel:read:polls',
    'channel:read:predictions',
    'channel:manage:broadcast',
    'channel:manage:polls',
    'channel:manage:predictions',
    'channel:manage:redemptions',
    'channel:manage:raids',
    'moderation:read',
    'moderator:manage:announcements',
    'moderator:manage:automod',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'moderator:manage:shoutouts',
    'user:read:broadcast',
    'user:read:email',
    'whispers:read',
    'whispers:edit',
];

console.log(`[BotAuth] Von der Anwendung angeforderte REQUIRED_BOT_SCOPES: [${REQUIRED_BOT_SCOPES.join(', ')}]`);

const BOT_AUTH_SERVER_PORT = 8080; // Kann auch aus configLoader.getEnvConfig() kommen

/**
 * Registriert einen Callback, der aufgerufen wird, wenn die Bot-Reauthentifizierung erforderlich ist.
 * @param {function} callback Die Funktion, die aufgerufen wird.
 */
function setOnBotReauthenticationRequired(callback) {
    onBotReauthenticationRequiredCallback = callback;
}

/**
 * Initialisiert den Twitch Authentifizierungsfluss für den Bot-Account.
 * Priorisiert: Prüfen -> Erneuern -> Neu Anmelden.
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {string} redirectUri
 * @returns {Promise<{username: string, userId: string, accessToken: string, authProvider: RefreshingAuthProvider, apiClient: ApiClient}>} Ein Promise, das mit den Bot-Informationen aufgelöst wird.
 */
async function initializeTwitchBotAuth(clientId, clientSecret, redirectUri) {
    console.log('[BotAuth] Starte Bot-Authentifizierungsprozess...');

    try {
        const authResult = await authenticateAccount({
            clientId: clientId,
            clientSecret: clientSecret,
            redirectUri: redirectUri,
            configKeyPrefix: 'BOT', // Spezifischer Präfix für Bot
            requiredScopes: REQUIRED_BOT_SCOPES,
            oauthServerPort: BOT_AUTH_SERVER_PORT,
            onRefreshCallback: async (userId, newToken) => {
                console.log(`[BotAuth][RefreshingAuthProvider] Token für ${userId} aktualisiert.`);
            }
        });

        // Weise die globalen Variablen zu
        twitchBotAuthProvider = authResult.authProvider;
        twitchBotApiClient = authResult.apiClient;
        currentBotUserId = authResult.userId;
        currentBotUsername = authResult.username;
        currentBotAccessToken = authResult.accessToken;

        // --- WICHTIGE ÄNDERUNG: Expliziter addUser-Aufruf mit Scopes ---
        // Dies ist eine redundante Maßnahme, um sicherzustellen, dass der AuthProvider
        // die Scopes und daraus abgeleiteten Intents für den Bot-Benutzer korrekt registriert.
        const fileConfig = configLoader.getFileConfig(); // Lade die aktuelle Konfiguration
        if (fileConfig.BOT_OAUTH_REFRESH_TOKEN && fileConfig.BOT_OAUTH_EXPIRES_IN && fileConfig.LAST_BOT_TOKEN_REFRESH) {
            await twitchBotAuthProvider.addUser(currentBotUserId, {
                accessToken: currentBotAccessToken,
                refreshToken: fileConfig.BOT_OAUTH_REFRESH_TOKEN, // Lade den Refresh Token aus der Konfig
                expiresIn: fileConfig.BOT_OAUTH_EXPIRES_IN,       // Lade expires_in aus der Konfig
                obtainmentTimestamp: fileConfig.LAST_BOT_TOKEN_REFRESH, // Lade timestamp aus der Konfig
                scope: REQUIRED_BOT_SCOPES // Stelle sicher, dass die REQUIRED_BOT_SCOPES hier übergeben werden
            }, ['chat']);
            console.log(`[BotAuth] Bot-Benutzer ${currentBotUsername} (${currentBotUserId}) explizit zum AuthProvider hinzugefügt (mit Scopes).`);
        } else {
            console.warn('[BotAuth] Warnung: Nicht genügend Daten in der Datei-Konfiguration, um den Bot explizit zum AuthProvider hinzuzufügen. Dies könnte zu Authentifizierungsproblemen führen.');
        }

        // Explizites Hinzufügen des 'chat'-Intents zum AuthProvider wurde entfernt.
        // Die Intents sollten aus den Scopes abgeleitet werden.
        // --- ENDE DER WICHTIGEN ÄNDERUNG ---

        // Debug-Logs, um die Scopes und Intents zu überprüfen
        const userScopes = twitchBotAuthProvider.getCurrentScopesForUser(currentBotUserId);
        console.log(`[BotAuth] Bot hat folgende Scopes nach addUser: [${userScopes.join(', ')}]`);
        const hasChatRead = userScopes.includes('chat:read');
        const hasChatEdit = userScopes.includes('chat:edit');
        console.log(`[BotAuth] Scopes enthalten 'chat:read': ${hasChatRead}, 'chat:edit': ${hasChatEdit}`);
        // Wenn getIntentsForUser verfügbar ist, können wir es auch loggen
        if (typeof twitchBotAuthProvider.getIntentsForUser === 'function') {
            const userIntents = twitchBotAuthProvider.getIntentsForUser(currentBotUserId);
            console.log(`[BotAuth] Bot hat folgende Intents nach addUser: [${Array.from(userIntents).join(', ')}]`);
        }

        return {
            username: currentBotUsername,
            userId: currentBotUserId,
            accessToken: currentBotAccessToken,
            authProvider: twitchBotAuthProvider,
            apiClient: twitchBotApiClient
        };

    } catch (error) {
        console.error('[BotAuth] FEHLER bei der Initialisierung der Bot-Authentifizierung:', error.message);
        if (onBotReauthenticationRequiredCallback) {
            console.log('[BotAuth] Triggering onBotReauthenticationRequiredCallback wegen Initialisierungsfehler.');
            onBotReauthenticationRequiredCallback();
        }
        throw error;
    }
}

/**
 * Gibt den aktuell initialisierten Twurple API Client des Bots zurück.
 * @returns {ApiClient|null}
 */
function getTwitchBotApiClient() {
    return twitchBotApiClient;
}

/**
 * Gibt den aktuell initialisierten Twurple AuthProvider des Bots zurück.
 * @returns {RefreshingAuthProvider|null}
 */
function getTwitchBotAuthProvider() {
    return twitchBotAuthProvider;
}

/**
 * Gibt den Benutzernamen des Bots zurück.
 * @returns {string|null}
 */
function getBotUsername() {
    return currentBotUsername;
}

/**
 * Gibt die Benutzer-ID des Bots zurück.
 * @returns {string|null}
 */
function getBotUserId() {
    return currentBotUserId;
}

/**
 * Gibt den aktuellen Access Token des Bots zurück (wird vom AuthProvider aktuell gehalten).
 * @returns {string|null}
 */
async function getBotAccessToken() {
    if (twitchBotAuthProvider && currentBotUserId) {
        try {
            const tokenInfo = await twitchBotAuthProvider.getAccessTokenForUser(currentBotUserId);
            return tokenInfo ? tokenInfo.accessToken : null;
        } catch (error) {
            console.error('[BotAuth] Fehler beim Abrufen des Bot Access Tokens vom AuthProvider:', error);
            return null;
        }
    }
    return null;
}


// Exportiere die Funktionen, die von server.js oder anderen Modulen benötigt werden
module.exports = {
    initializeTwitchBotAuth,
    getTwitchBotApiClient,
    getTwitchBotAuthProvider,
    getBotUsername,
    getBotUserId,
    getBotAccessToken,
    setOnBotReauthenticationRequired
};
