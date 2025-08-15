// authManager.js
// Verwaltet den Twitch-Authentifizierungsfluss: Prüfen -> Erneuern -> Neu Anmelden.

const { RefreshingAuthProvider } = require('@twurple/auth');
const { ApiClient } = require('@twurple/api');
const { validateToken } = require('./validateToken'); // Für die API-Validierung des Access Tokens
const { startOAuthServer } = require('./oauthServer'); // Für den vollständigen OAuth-Flow
const configLoader = require('../configLoader'); // Zum Laden und Speichern der Konfiguration

/**
 * Löscht alle gespeicherten Authentifizierungsdaten für einen bestimmten Präfix aus der Konfiguration.
 * @param {string} configKeyPrefix - Der Präfix für die Konfigurationsschlüssel (z.B. 'STREAMER' oder 'BOT').
 * @returns {Promise<void>}
 */
async function clearAuthData(configKeyPrefix) {
    console.log(`[AuthManager][${configKeyPrefix}] Lösche alle gespeicherten Authentifizierungsdaten.`);
    await configLoader.updateFileConfig({
        [`${configKeyPrefix}_OAUTH_TOKEN`]: null,
        [`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`]: null,
        [`${configKeyPrefix}_TWITCH_USER_ID`]: null,
        [`${configKeyPrefix}_USERNAME`]: null,
        [`LAST_${configKeyPrefix}_TOKEN_REFRESH`]: null,
        [`${configKeyPrefix}_OAUTH_EXPIRES_IN`]: null,
        [`${configKeyPrefix}_REQUIRED_SCOPES`]: [],
    });
}

/**
 * Führt den Twitch-Authentifizierungsfluss für ein spezifisches Konto durch.
 * Priorisiert: Prüfen -> Erneuern -> Neu Anmelden.
 *
 * @param {object} params - Parameter für die Authentifizierung.
 * @param {string} params.clientId - Die Client-ID der Twitch-Anwendung.
 * @param {string} params.clientSecret - Das Client-Secret der Twitch-Anwendung.
 * @param {string} params.redirectUri - Die eingetragene Redirect URI der Twitch-Anwendung.
 * @param {string} params.configKeyPrefix - Der Präfix für die Speicherung der Token-Daten (z.B. 'STREAMER' oder 'BOT').
 * @param {string[]} params.requiredScopes - Die benötigten Twitch Scopes für dieses Konto.
 * @param {number} [params.oauthServerPort] - Optionaler Port für den OAuth-Server, falls spezifisch.
 * @returns {Promise<{authProvider: RefreshingAuthProvider, apiClient: ApiClient, userId: string, username: string, accessToken: string}>}
 * @throws {Error} Wenn die Authentifizierung nach allen Versuchen fehlschlägt.
 */
async function authenticateAccount({
    clientId,
    clientSecret,
    redirectUri,
    configKeyPrefix,
    requiredScopes,
    oauthServerPort = 8080 // Standardport
}) {
    console.log(`[AuthManager][${configKeyPrefix}] Starte Authentifizierungsprozess.`);

    if (!clientId || !clientSecret || !redirectUri) {
        throw new Error(`[AuthManager][${configKeyPrefix}] clientId, clientSecret oder redirectUri fehlen in der Konfiguration. Authentifizierung kann nicht erfolgen.`);
    }

    let authProvider;
    let apiClient;
    let userId;
    let username;
    let userData;

    // --- Schritt 1: Alte Daten holen ---
    console.log(`[AuthManager][${configKeyPrefix}] Schritt 1: Hole alte Authentifizierungsdaten.`);
    let fileConfig = configLoader.getFileConfig();
    let storedAccessToken = fileConfig[`${configKeyPrefix}_OAUTH_TOKEN`];
    let storedRefreshToken = fileConfig[`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`];
    let storedUserId = fileConfig[`${configKeyPrefix}_TWITCH_USER_ID`];
    let storedUsername = fileConfig[`${configKeyPrefix}_USERNAME`];
    let storedScopes = Array.isArray(fileConfig[`${configKeyPrefix}_REQUIRED_SCOPES`]) ? fileConfig[`${configKeyPrefix}_REQUIRED_SCOPES`] : [];
    let storedExpiresIn = fileConfig[`${configKeyPrefix}_OAUTH_EXPIRES_IN`];
    let storedLastRefresh = fileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`];
    let storedBrowserUserAgent = fileConfig[`${configKeyPrefix}_LAST_AUTH_BROWSER_USER_AGENT`];

    console.log(`[AuthManager][${configKeyPrefix}] Initialer Status der Token-Daten:`);
    console.log(`  - Access Token gespeichert: ${!!storedAccessToken}`);
    console.log(`  - Refresh Token gespeichert: ${!!storedRefreshToken}`);
    console.log(`  - User ID gespeichert: ${!!storedUserId}`);
    console.log(`  - Gespeicherte Scopes: [${storedScopes.join(', ')}]`);
    console.log(`  - Benötigte Scopes: [${requiredScopes.join(', ')}]`);

    let tokenNeedsRefresh = false;
    let tokenNeedsFullReauth = false;

    // --- Schritt 2: Überprüfen, ob der AccessToken noch gültig ist ---
    console.log(`[AuthManager][${configKeyPrefix}] Schritt 2: Überprüfe Gültigkeit des Access Tokens.`);
    if (storedAccessToken && storedUserId) {
        console.log(`[AuthManager][${configKeyPrefix}] Prüfe vorhandenen Access Token mit Twitch API...`);
        try {
            const validationResult = await validateToken(storedAccessToken);

            if (validationResult && validationResult.userId === storedUserId) {
                const actualTokenScopes = Array.isArray(validationResult.scopes) ? validationResult.scopes : [];
                const allRequiredPresent = requiredScopes.every(scope => actualTokenScopes.includes(scope));
                const noExtraScopes = actualTokenScopes.every(scope => requiredScopes.includes(scope));

                if (allRequiredPresent && noExtraScopes) {
                    console.log(`[AuthManager][${configKeyPrefix}] Access Token ist gültig und hat die korrekten Scopes. ERFOLG.`);
                    userData = storedAccessToken;
                    userId = storedUserId;
                    username = storedUsername;

                    // NEU: Initialisiere authProvider und apiClient, wenn Token gültig ist
                    authProvider = new RefreshingAuthProvider({
                        clientId,
                        clientSecret,
                        onRefresh: async (refreshedUserId, newTokenData) => {
                            console.log(`[AuthManager][${configKeyPrefix}] ERFOLG: Twurple hat Access Token für User ID ${refreshedUserId} erneuert. Speichere neue Token-Daten...`);
                            await configLoader.updateFileConfig({
                                [`${configKeyPrefix}_OAUTH_TOKEN`]: newTokenData.accessToken,
                                [`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`]: newTokenData.refreshToken,
                                [`${configKeyPrefix}_OAUTH_EXPIRES_IN`]: newTokenData.expiresIn,
                                [`${configKeyPrefix}_REQUIRED_SCOPES`]: newTokenData.scope,
                                [`LAST_${configKeyPrefix}_TOKEN_REFRESH`]: new Date().toISOString()
                            });
                            console.log(`[AuthManager][${configKeyPrefix}] Neue Token-Daten erfolgreich in config.json gespeichert.`);
                        },
                        tokenStore: {
                            async get(id) {
                                const latestFileConfig = configLoader.getFileConfig();
                                if (id === latestFileConfig[`${configKeyPrefix}_TWITCH_USER_ID`]) {
                                    return {
                                        accessToken: latestFileConfig[`${configKeyPrefix}_OAUTH_TOKEN`],
                                        refreshToken: latestFileConfig[`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`],
                                        expiresIn: latestFileConfig[`${configKeyPrefix}_OAUTH_EXPIRES_IN`],
                                        scope: latestFileConfig[`${configKeyPrefix}_REQUIRED_SCOPES`] || [],
                                        obtainmentTimestamp: latestFileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`] ? new Date(latestFileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`]).getTime() : 0
                                    };
                                }
                                return null;
                            },
                            async set(id, newTokenData) { /* Speicherung erfolgt in onRefresh */ }
                        }
                    });

                    authProvider.addUser(storedUserId, {
                        accessToken: storedAccessToken,
                        refreshToken: storedRefreshToken,
                        expiresIn: storedExpiresIn || 3600,
                        scope: storedScopes,
                        username: storedUsername,
                        obtainmentTimestamp: storedLastRefresh ? new Date(storedLastRefresh).getTime() : 0
                    });

                    apiClient = new ApiClient({ authProvider });

                    // Aktualisiere gespeicherte Scopes, falls validateToken aktuellere Infos hat
                    if (JSON.stringify(storedScopes) !== JSON.stringify(actualTokenScopes)) {
                        await configLoader.updateFileConfig({ [`${configKeyPrefix}_REQUIRED_SCOPES`]: actualTokenScopes });
                        console.log(`[AuthManager][${configKeyPrefix}] Gespeicherte Scopes in config.json aktualisiert basierend auf validateToken.`);
                    }
                } else {
                    let reason = [];
                    if (!allRequiredPresent) reason.push('fehlende erforderliche Scopes');
                    if (!noExtraScopes) reason.push('unerwünschte/zusätzliche Scopes');
                    console.warn(`[AuthManager][${configKeyPrefix}] Access Token ist gültig, aber Scopes sind inkompatibel (${reason.join(', ')}). VERSUCH: Refresh.`);
                    tokenNeedsRefresh = true; // Scopes passen nicht, versuche Refresh
                }
            } else {
                console.warn(`[AuthManager][${configKeyPrefix}] Vorhandener Access Token ist ungültig oder gehört nicht zum gespeicherten Benutzer. VERSUCH: Refresh.`);
                tokenNeedsRefresh = true; // Token ungültig, versuche Refresh
            }
        } catch (error) {
            console.warn(`[AuthManager][${configKeyPrefix}] Fehler bei der Validierung des Access Tokens (validateToken): ${error.message}. VERSUCH: Refresh.`);
            tokenNeedsRefresh = true; // Fehler bei Validierung, versuche Refresh
        }
    } else {
        console.log(`[AuthManager][${configKeyPrefix}] Kein Access Token oder keine User ID in Konfiguration gefunden. VERSUCH: Refresh.`);
        tokenNeedsRefresh = true; // Keine Tokens vorhanden, versuche Refresh
    }

    // --- Schritt 2.1: Access Token neu erstellen mittels Refresh Token (falls nötig) ---
    if (tokenNeedsRefresh) {
        console.log(`[AuthManager][${configKeyPrefix}] Schritt 2.1: Versuche Access Token mittels Refresh Token zu erneuern.`);
        if (storedRefreshToken && storedUserId) {
            console.log(`[AuthManager][${configKeyPrefix}] VERSUCH: Access Token mit Refresh Token zu erneuern...`);
            try {
                // Erstelle einen temporären AuthProvider, um den Refresh zu erzwingen
                const tempAuthProvider = new RefreshingAuthProvider({
                    clientId,
                    clientSecret,
                    onRefresh: async (refreshedUserId, newTokenData) => {
                        console.log(`[AuthManager][${configKeyPrefix}] ERFOLG: Twurple hat Access Token für User ID ${refreshedUserId} erneuert. Speichere neue Token-Daten...`);
                        await configLoader.updateFileConfig({
                            [`${configKeyPrefix}_OAUTH_TOKEN`]: newTokenData.accessToken,
                            [`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`]: newTokenData.refreshToken,
                            [`${configKeyPrefix}_OAUTH_EXPIRES_IN`]: newTokenData.expiresIn,
                            [`${configKeyPrefix}_REQUIRED_SCOPES`]: newTokenData.scope,
                            [`LAST_${configKeyPrefix}_TOKEN_REFRESH`]: new Date().toISOString()
                        });
                        console.log(`[AuthManager][${configKeyPrefix}] Neue Token-Daten erfolgreich in config.json gespeichert.`);
                    },
                    tokenStore: {
                        async get(id) {
                            const latestFileConfig = configLoader.getFileConfig();
                            if (id === latestFileConfig[`${configKeyPrefix}_TWITCH_USER_ID`]) {
                                return {
                                    accessToken: latestFileConfig[`${configKeyPrefix}_OAUTH_TOKEN`],
                                    refreshToken: latestFileConfig[`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`],
                                    expiresIn: latestFileConfig[`${configKeyPrefix}_OAUTH_EXPIRES_IN`],
                                    scope: latestFileConfig[`${configKeyPrefix}_REQUIRED_SCOPES`] || [],
                                    obtainmentTimestamp: latestFileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`] ? new Date(latestFileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`]).getTime() : 0
                                };
                            }
                            return null;
                        },
                        async set(id, newTokenData) { /* Speicherung erfolgt in onRefresh */ }
                    }
                });

                tempAuthProvider.addUser(storedUserId, {
                    accessToken: storedAccessToken,
                    refreshToken: storedRefreshToken,
                    expiresIn: storedExpiresIn || 3600,
                    scope: storedScopes,
                    username: storedUsername,
                    obtainmentTimestamp: storedLastRefresh ? new Date(storedLastRefresh).getTime() : 0
                });

                // Erzwinge einen Refresh, indem wir versuchen, den Access Token abzurufen
                userData = await tempAuthProvider.getAccessTokenForUser(storedUserId);

                // Nach dem Refresh: Erneuten Validierungs- und Scope-Check durchführen
                const validationAfterRefresh = await validateToken(userData.accessToken);

                // --- Schritt 2.1.1: Ist der Refresh Token auch ungültig? ---
                if (validationAfterRefresh === null) {
                    console.error(`[AuthManager][${configKeyPrefix}] FEHLER: Access Token ist nach Erneuerung immer noch ungültig. Refresh Token möglicherweise abgelaufen oder widerrufen. ZWINGE NEUANMELDUNG.`);
                    tokenNeedsFullReauth = true; // Token ungültig, erzwinge volle Neuauthentifizierung
                } else if (validationAfterRefresh.userId !== storedUserId) {
                    console.error(`[AuthManager][${configKeyPrefix}] FEHLER: Erneuerter Access Token gehört nicht zum gespeicherten Benutzer. ZWINGE NEUANMELDUNG.`);
                    tokenNeedsFullReauth = true;
                } else {
                    const actualTokenScopes = Array.isArray(validationAfterRefresh.scopes) ? validationAfterRefresh.scopes : [];
                    const allRequiredPresent = requiredScopes.every(scope => actualTokenScopes.includes(scope));
                    const noExtraScopes = actualTokenScopes.every(scope => requiredScopes.includes(scope));

                    // --- Schritt 2.1.2: Haben sich die Scopes verändert? ---
                    if (allRequiredPresent && noExtraScopes) {
                        console.log(`[AuthManager][${configKeyPrefix}] Access Token nach Erneuerung ist gültig und Scopes passen. ERFOLG.`);
                        userId = storedUserId; // Bleibt gleich
                        username = storedUsername; // Bleibt gleich


                    } else {
                        let reason = [];
                        if (!allRequiredPresent) reason.push('fehlende erforderliche Scopes');
                        if (!noExtraScopes) reason.push('unerwünschte/zusätzliche Scopes');
                        console.warn(`[AuthManager][${configKeyPrefix}] Access Token nach Erneuerung ist gültig, aber Scopes sind inkompatibel (${reason.join(', ')}). ZWINGE NEUANMELDUNG.`);
                        tokenNeedsFullReauth = true; // Scopes passen nicht, erzwinge volle Neuauthentifizierung
                    }
                }

                // Wenn der Token nach Refresh gültig ist und Scopes passen,
                // dann initialisiere den finalen authProvider
                if (!tokenNeedsFullReauth) {
                    authProvider = tempAuthProvider; // Verwende den bereits erstellten Provider
                    apiClient = new ApiClient({ authProvider });
                }

            } catch (error) {
                console.error(`[AuthManager][${configKeyPrefix}] FEHLER beim Erneuern des Tokens via Refresh Token: ${error.message}. ZWINGE NEUANMELDUNG.`);
                tokenNeedsFullReauth = true; // Fehler beim Refresh, erzwinge volle Neuauthentifizierung
            }
        } else {
            console.warn(`[AuthManager][${configKeyPrefix}] Kein Refresh Token oder User ID verfügbar für Erneuerung. ZWINGE NEUANMELDUNG.`);
            tokenNeedsFullReauth = true; // Kein Refresh Token, erzwinge volle Neuauthentifizierung
        }
    }

    // --- Schritt 2.1.1 & 2.1.2: Vollständiger OAuth-Flow (wenn Refresh fehlschlug oder Scopes nicht passen) ---
    if (tokenNeedsFullReauth || !userData) { // Auch wenn accessToken noch nicht gesetzt ist
        console.log(`[AuthManager][${configKeyPrefix}] Tokens ungültig oder fehlen. Starte temporären Server für vollständigen OAuth-Flow (Neu-Anmeldung)...`);

        await clearAuthData(configKeyPrefix); // Lösche alte Daten vor dem neuen Login

        let authData;
        try {
            authData = await startOAuthServer({
                clientId: clientId,
                clientSecret: clientSecret,
                redirectUri: redirectUri,
                scopes: requiredScopes,
                port: oauthServerPort,
                mode: configKeyPrefix.toLowerCase(),
                preferredBrowserUserAgent: storedBrowserUserAgent
            });
            console.log(`[AuthManager][${configKeyPrefix}] OAuth-Flow erfolgreich abgeschlossen. ERFOLG.`);
        } catch (oauthError) {
            console.error(`[AuthManager][${configKeyPrefix}] FEHLER während des OAuth-Flows (startOAuthServer): `, oauthError);
            throw new Error(`[AuthManager][${configKeyPrefix}] OAuth-Authentifizierung fehlgeschlagen.`);
        }

        // Speichere die frisch erhaltenen Daten
        await configLoader.updateFileConfig({
            [`${configKeyPrefix}_OAUTH_TOKEN`]: authData.accessToken,
            [`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`]: authData.refreshToken,
            [`${configKeyPrefix}_TWITCH_USER_ID`]: authData.userId,
            [`${configKeyPrefix}_USERNAME`]: authData.username,
            [`LAST_${configKeyPrefix}_TOKEN_REFRESH`]: new Date().toISOString(),
            [`${configKeyPrefix}_REQUIRED_SCOPES`]: authData.scope,
            [`${configKeyPrefix}_OAUTH_EXPIRES_IN`]: authData.expiresIn,
            [`${configKeyPrefix}_LAST_AUTH_BROWSER_USER_AGENT`]: authData.userAgent
        });
        console.log(`[AuthManager][${configKeyPrefix}] Neue Token-Daten nach initialem Login erfolgreich in config.json gespeichert.`);

        userData = authData.accessToken;
        userId = authData.userId;
        username = authData.username;

        // Initialisiere den finalen AuthProvider mit den frisch erhaltenen Tokens
        authProvider = new RefreshingAuthProvider({
            clientId: clientId,
            clientSecret: clientSecret,
            onRefresh: async (refreshedUserId, newTokenData) => {
                console.log(`[AuthManager][${configKeyPrefix}] ERFOLG: Twurple hat Access Token für User ID ${refreshedUserId} erneuert. Speichere neue Token-Daten...`);
                await configLoader.updateFileConfig({
                    [`${configKeyPrefix}_OAUTH_TOKEN`]: newTokenData.accessToken,
                    [`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`]: newTokenData.refreshToken,
                    [`${configKeyPrefix}_OAUTH_EXPIRES_IN`]: newTokenData.expiresIn,
                    [`${configKeyPrefix}_REQUIRED_SCOPES`]: newTokenData.scope,
                    [`LAST_${configKeyPrefix}_TOKEN_REFRESH`]: new Date().toISOString()
                });
                console.log(`[AuthManager][${configKeyPrefix}] Neue Token-Daten erfolgreich in config.json gespeichert.`);
            },
            tokenStore: {
                async get(id) {
                    const latestFileConfig = configLoader.getFileConfig();
                    if (id === latestFileConfig[`${configKeyPrefix}_TWITCH_USER_ID`]) {
                        return {
                            accessToken: latestFileConfig[`${configKeyPrefix}_OAUTH_TOKEN`],
                            refreshToken: latestFileConfig[`${configKeyPrefix}_OAUTH_REFRESH_TOKEN`],
                            expiresIn: latestFileConfig[`${configKeyPrefix}_OAUTH_EXPIRES_IN`],
                            scope: latestFileConfig[`${configKeyPrefix}_REQUIRED_SCOPES`] || [],
                            obtainmentTimestamp: latestFileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`] ? new Date(latestFileConfig[`LAST_${configKeyPrefix}_TOKEN_REFRESH`]).getTime() : 0
                        };
                    }
                    return null;
                },
                async set(id, newTokenData) { /* Speicherung erfolgt in onRefresh */ }
            }
        });

        authProvider.addUser(storedUserId, {
            accessToken: storedAccessToken,
            refreshToken: storedRefreshToken,
            expiresIn: storedExpiresIn || 3600,
            scope: storedScopes,
            username: storedUsername,
            obtainmentTimestamp: storedLastRefresh ? new Date(storedLastRefresh).getTime() : 0
        });

        apiClient = new ApiClient({ authProvider });
        console.log(`[AuthManager][${configKeyPrefix}] Authentifizierung via OAuth-Flow erfolgreich abgeschlossen und Client bereit für ${username}.`);
    }

    // --- Schritt 3: Return des Authentifizierungsergebnisses ---
    console.log(`[AuthManager][${configKeyPrefix}] Schritt 3: Finalisiere Authentifizierungsergebnis.`);
    if (!authProvider || !apiClient || !userId || !username || !userData) {
        throw new Error(`[AuthManager][${configKeyPrefix}] Twitch API Client konnte nach allen Authentifizierungsversuchen nicht initialisiert werden.`);
    }

    console.log(`[AuthManager][${configKeyPrefix}] Authentifizierung finalisiert. Benutzer: ${username} (ID: ${userId}).`);

    return {
        authProvider: authProvider,
        apiClient: apiClient,
        userId: userId,
        username: username,
        accessToken: userData
    };
}

module.exports = {
    authenticateAccount,
    clearAuthData
};
