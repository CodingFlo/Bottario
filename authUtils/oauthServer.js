// authUtils/oauthServer.js
// Enthält Logik zum Starten und Stoppen eines temporären Servers
// für den Twitch OAuth-Authentifizierungsfluss.

const express = require('express');
const { URLSearchParams } = require('url');
const fetch = require('node-fetch');
const path = require('path');
// const { default: open } = require('open'); // Dieser Import verursacht den ERR_REQUIRE_ESM-Fehler

let currentAuthServerInstance = null; // Globale Referenz auf die aktuelle Server-Instanz

// HILFSFUNKTION: Extrahiert den App-Namen für 'open' aus dem User-Agent
function getBrowserAppFromUserAgent(userAgent) {
    if (!userAgent) return null; // Wenn User-Agent leer, kein spezifischer Browser erkannt

    userAgent = userAgent.toLowerCase();

    // Priorisiere gängige Browser
    // Für open.apps benötigen wir eine Referenz auf das 'open'-Modul.
    // Wir können hier keine direkten 'open.apps.chrome' Referenzen nutzen,
    // da 'open' dynamisch importiert wird.
    // Stattdessen geben wir Strings zurück, die 'open' interpretieren kann.
    if (userAgent.includes('chrome') && !userAgent.includes('chromium') && !userAgent.includes('edge')) {
        return 'chrome'; // Entspricht open.apps.chrome
    }
    if (userAgent.includes('firefox')) {
        return 'firefox'; // Entspricht open.apps.firefox
    }
    if (userAgent.includes('edge')) {
        return 'edge'; // Entspricht open.apps.edge
    }
    if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
        return 'safari'; // Entspricht open.apps.safari
    }
    // Kann hier weitere Browser hinzufügen (z.B. Opera, Brave, Vivaldi)
    return null; // Fallback zum Standardbrowser des Systems, wenn kein spezifischer Browser erkannt wird
}


/**
 * Startet einen temporären Express-Server, um den OAuth-Callback von Twitch zu empfangen.
 * Dieser Server wird nach erfolgreicher Authentifizierung automatisch geschlossen.
 * @param {object} options Die Optionen für den OAuth-Flow.
 * @param {string} options.clientId Die Client-ID deiner Twitch-Anwendung.
 * @param {string} options.clientSecret Das Client-Secret deiner Twitch-Anwendung.
 * @param {string} options.redirectUri Die Umleitungs-URI deiner Twitch-Anwendung.
 * @param {string[]} options.scopes Ein Array der benötigten Twitch-Scopes.
 * @param {number} options.port Der Port, auf dem der temporäre Server lauschen soll.
 * @param {'streamer'|'bot'} options.mode Der Modus der Authentifizierung (z.B. 'streamer' oder 'bot').
 * @param {string} [options.preferredBrowserUserAgent] Optional: User-Agent des zuletzt genutzten Browsers, um ihn erneut zu öffnen.
 * @returns {Promise<{accessToken: string, refreshToken: string, expiresIn: number, scope: string[], userId: string, username: string, userAgent: string}>} Ein Promise, das mit den Authentifizierungsdaten aufgelöst wird.
 */
async function startOAuthServer({ clientId, clientSecret, redirectUri, scopes, port, mode, preferredBrowserUserAgent }) {
    // Schließe eine eventuell bestehende Server-Instanz, bevor eine neue gestartet wird
    if (currentAuthServerInstance) {
        console.warn(`[OAuthServer][${mode}] Bestehende Auth-Server-Instanz auf Port ${port} gefunden und wird geschlossen.`);
        await new Promise(resolve => currentAuthServerInstance.close(() => {
            console.log(`[OAuthServer][${mode}] Vorherige Auth-Server-Instanz erfolgreich geschlossen.`);
            resolve();
        }));
        currentAuthServerInstance = null;
    }

    const app = express();
    app.use(express.static(path.join(__dirname, '../frontend'))); // Pfad zum Frontend anpassen, da oauthServer im authUtils-Ordner ist

    return new Promise((resolve, reject) => {
        let globalAuthPromiseResolve = (data) => { // Umbenannt, um Konflikt zu vermeiden
            // Sicherstellen, dass der Server geschlossen wird, wenn das Promise aufgelöst wird
            if (currentAuthServerInstance) {
                currentAuthServerInstance.close(() => console.log(`[OAuthServer][${mode}] Temporärer Auth-Server auf Port ${port} geschlossen (Erfolg).`));
                currentAuthServerInstance = null;
            }
            resolve(data);
        };
        let globalAuthPromiseReject = (error) => { // Umbenannt, um Konflikt zu vermeiden
            // Sicherstellen, dass der Server geschlossen wird, wenn das Promise abgelehnt wird
            if (currentAuthServerInstance) {
                currentAuthServerInstance.close(() => console.log(`[OAuthServer][${mode}] Temporärer Auth-Server auf Port ${port} geschlossen (Fehler).`));
                currentAuthServerInstance = null;
            }
            reject(error);
        };

        currentAuthServerInstance = app.listen(port, async () => {
            console.log(`[OAuthServer][${mode}] Temporärer Auth-Server läuft auf Port ${port}`);

            const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes.join('+')}&force_verify=true`;
            const configPageUrl = `http://localhost:${port}/config.html?oauthUrl=${encodeURIComponent(twitchAuthUrl)}&mode=${mode}`;

            console.log(`\n[OAuthServer][${mode}] ** BITTE ÖFFNEN SIE DIESEN LINK IN IHREM BROWSER, UM DIE ${mode.toUpperCase()}-AUTHENTIFIZIERUNG ABZUSCHLIESSEN: **`);
            console.log(`[OAuthServer][${mode}] --> ${configPageUrl} <--\n`);

            try {
                // NEU: Dynamischer Import von 'open' hier
                const openModule = await import('open');
                const open = openModule.default;

                let openOptions = {};
                // Versuche, den Browser gezielt zu öffnen, wenn preferredBrowserUserAgent angegeben ist
                if (preferredBrowserUserAgent) {
                    const browserApp = getBrowserAppFromUserAgent(preferredBrowserUserAgent);
                    if (browserApp) {
                        openOptions.app = { name: browserApp };
                        console.log(`[OAuthServer][${mode}] Versuche, Link im bevorzugten Browser zu öffnen: ${browserApp}`);
                    } else {
                        // Wenn preferredBrowserUserAgent da ist, aber getBrowserAppFromUserAgent null zurückgibt,
                        // bedeutet das, wir können ihn nicht explizit ansteuern, also lassen wir 'open' den Standard nehmen.
                        console.log(`[OAuthServer][${mode}] Bevorzugter Browser aus User-Agent unbekannt. Öffne im Standardbrowser.`);
                    }
                } else {
                    // Wenn preferredBrowserUserAgent gar nicht angegeben ist, ist dies der Standardfall.
                    console.log(`[OAuthServer][${mode}] Kein bevorzugter Browser gespeichert. Öffne im Standardbrowser.`);
                }

                // HIER IST DER WICHTIGE PUNKT: Wenn openOptions.app nicht gesetzt ist,
                // öffnet 'open' automatisch den System-Standardbrowser.
                await open(configPageUrl, openOptions);

            } catch (err) {
                console.error(`[OAuthServer][${mode}] Fehler beim automatischen Öffnen des Browsers:`, err);
                console.log(`[OAuthServer][${mode}] Bitte öffnen Sie den Link manuell: ${configPageUrl}`);
            }
        });

        currentAuthServerInstance.on('error', async (err) => {
            // Behandle den Fall, dass der Port bereits belegt ist (EADDRINUSE)
            if (err.code === 'EADDRINUSE') {
                console.warn(`[OAuthServer][${mode}] Port ${port} wird bereits verwendet. Dies ist normal, wenn der Hauptserver bereits läuft.`);
                const twitchAuthUrl = `https://id.twitch.tv/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scopes.join('+')}&force_verify=true`;
                const configPageUrl = `http://localhost:${port}/config.html?oauthUrl=${encodeURIComponent(twitchAuthUrl)}&mode=${mode}`;
                console.error(`\n[OAuthServer][${mode}] ** PORT ${port} BELEGT! Bitte öffnen Sie den ${mode.toUpperCase()}-AUTHENTIFIZIERUNGSLINK MANUELL: ${configPageUrl} **\n`);

                try {
                    // Dynamischer Import von 'open' hier
                    const openModule = await import('open');
                    const open = openModule.default;

                    // Auch hier versuchen, den bevorzugten Browser zu öffnen
                    let openOptions = {};
                    if (preferredBrowserUserAgent) {
                        const browserApp = getBrowserAppFromUserAgent(preferredBrowserUserAgent);
                        if (browserApp) {
                            openOptions.app = { name: browserApp };
                        }
                    }
                    await open(configPageUrl, openOptions);
                } catch (openErr) {
                    console.error(`[OAuthServer][${mode}] Fehler beim automatischen Öffnen des Browsers (EADDRINUSE und Open-Fehler):`, openErr);
                }
                // Ablehnen des Promise, um dem aufrufenden initializeAuth-Modul zu signalisieren, dass es fehlgeschlagen ist.
                globalAuthPromiseReject(new Error(`Port ${port} wird bereits verwendet. Bitte authentifizieren Sie sich manuell über den Link.`));
            } else {
                console.error(`[OAuthServer][${mode}] Fehler beim Starten des temporären Auth-Servers:`, err);
                globalAuthPromiseReject(err);
            }
        });

        const url = new URL(redirectUri);
        const callbackPath = url.pathname;

        app.get(callbackPath, async (req, res) => {
            const code = req.query.code;

            // NEU HINZUGEFÜGTER CODE FÜR BROWSER-INFORMATIONEN
            const userAgent = req.headers['user-agent'];
            const ipAddress = req.ip;

            console.log(`[OAuthServer][${mode}] Auth-Callback empfangen.`);
            console.log(`[OAuthServer][${mode}] User-Agent: ${userAgent || 'Nicht verfügbar'}`);
            console.log(`[OAuthServer][${mode}] IP-Adresse: ${ipAddress || 'Nicht verfügbar'}`);
            // ENDE DES NEU HINZUGEFÜGTEN CODES


            if (!code) {
                console.error(`[OAuthServer][${mode}] Kein Code im Twitch-OAuth-Callback erhalten.`);
                res.status(400).send('Fehler: Kein Authentifizierungscode erhalten.');
                if (globalAuthPromiseReject) globalAuthPromiseReject(new Error('Kein Authentifizierungscode erhalten.'));
                return;
            }

            try {
                const tokenResponse = await fetch('https://id.twitch.tv/oauth2/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: new URLSearchParams({
                        client_id: clientId,
                        client_secret: clientSecret,
                        code: code,
                        grant_type: 'authorization_code',
                        redirect_uri: redirectUri,
                    }).toString(),
                });

                const tokenData = await tokenResponse.json();

                if (!tokenResponse.ok || !tokenData.access_token) {
                    console.error(`[OAuthServer][${mode}] Fehler beim Abrufen der Tokens:`, tokenData.message || 'Unbekannter Fehler', tokenData);
                    res.status(500).send(`Fehler beim Abrufen der Twitch-Tokens für den ${mode}.`);
                    if (globalAuthPromiseReject) globalAuthPromiseReject(new Error('Fehler beim Abrufen der Twitch-Tokens: ' + (tokenData.message || 'Unbekannter Fehler')));
                    return;
                }

                let userName = "";
                let userID = "";

                try {
                    // Verwende den Access Token, um Benutzerinformationen abzurufen
                    const userResponse = await fetch('https://api.twitch.tv/helix/users', {
                        method: 'GET',
                        headers: {
                            'Client-ID': clientId,
                            'Authorization': `Bearer ${tokenData.access_token}`
                        }
                    });

                    const userData = await userResponse.json();

                    if (!userResponse.ok || !userData.data || userData.data.length === 0) {
                        console.error(`[OAuthServer][${mode}] Fehler beim Abrufen der ${mode}-Benutzerinformationen:`, userData.message || 'Keine Benutzerdaten gefunden.', userData);
                    } else {
                        const user = userData.data[0];
                        userName = user.login;
                        userID = user.id;
                        console.log(`[OAuthServer][${mode}] ${mode}-Benutzerinformationen erfolgreich abgerufen: ${userName} (ID: ${userID})`);
                    }
                } catch (apiError) {
                    console.error(`[OAuthServer][${mode}] Schwerwiegender Fehler beim Abrufen der ${mode}-Benutzerdaten (Helix API):`, apiError);
                }

                // Finales Ergebnis zum Auflösen des Promises
                const result = {
                    accessToken: tokenData.access_token,
                    refreshToken: tokenData.refresh_token,
                    expiresIn: tokenData.expires_in,
                    scope: tokenData.scope || [],
                    userId: userID, // Die aus Helix abgerufene ID
                    username: userName, // Der aus Helix abgerufene Username
                    userAgent: userAgent // HIER WIRD DER USER-AGENT HINZUGEFÜGT
                };

                // Sende eine Erfolgsmeldung an den Browser
                res.send(`
                    <h1>Twitch ${mode.toUpperCase()}-Authentifizierung erfolgreich!</h1>
                    <p>Der ${mode}-Account '${userName || userID}' wurde erfolgreich authentifiziert und die Tokens gespeichert.</p>
                    <p>Sie können dieses Fenster jetzt schließen und zum Server-Terminal zurückkehren.</p>
                    <script>
                        // Automatische Schließung nach kurzer Verzögerung
                        setTimeout(() => { window.close(); }, 3000);
                    </script>
                `);

                // Löse das Promise mit den gesammelten Daten auf
                if (globalAuthPromiseResolve) globalAuthPromiseResolve(result);

            } catch (error) {
                console.error(`[OAuthServer][${mode}] Fehler im Twitch-OAuth-Callback für ${mode}:`, error);
                res.status(500).send(`Interner Serverfehler während der Twitch-${mode}-Authentifizierung.`);
                if (globalAuthPromiseReject) globalAuthPromiseReject(error);
            }
        });
    }); // Ende des Promise-Wrappers
}

module.exports = {
    startOAuthServer
};
