// server.js

const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const configLoader = require('./configLoader');
const readline = require('readline');
const formatListNaturally = require('./commonUtils/formatListNaturally.js');

// Importiere deine Authentifizierungsmodule
const {
    initializeTwitchAuth,
    getTwitchAccessToken,
    getTwitchApiClient,
    getStreamerUsername,
    getStreamerUserId,
    getTwitchAuthProvider
} = require('./twitchAuth');

// Importe für den Bot-Auth
const {
    initializeTwitchBotAuth,
    getTwitchBotApiClient,
    getTwitchBotAuthProvider,
    getBotUsername,
    getBotAccessToken,
    getBotUserId
} = require('./botAuth');

// Import für die Bot-Logik
const { initializeBot, disconnectBot, initializeCommandHandlers, initializeTimerMessagesModule } = require('./bot');

// Import für das Alert Modul
const { initializeAlerts, connectToEventSub, disconnectEventSub } = require('./Alert');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const envConfig = configLoader.getEnvConfig();

const PORT = envConfig.PORT || 3000;

let connectedLiveStatsClients = 0; // Zähler für die Live-Statistik-Clients

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.redirect('/config.html');
});

app.use(express.static(path.join(__dirname, 'frontend')));
console.log(`app.use is set to ${path.join(__dirname, 'frontend')}`)

// --- Readline-Schnittstelle für Konsoleneingaben ---
const consoleInputReader = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

/**
 * Protokolliert Nachrichten in der Konsole, ohne den Readline-Prompt zu stören.
 * @param {string} message Die zu protokollierende Nachricht.
 */
function logToConsole(message, fromUser = false) {
    // Bewege den Cursor an den Anfang der Zeile, lösche die Zeile, schreibe die Nachricht,
    // füge eine neue Zeile hinzu und stelle den Prompt wieder her.
    readline.cursorTo(process.stdout, 0); // Korrektur hier
    readline.clearLine(process.stdout, 1); // Korrektur hier

    const textStart = fromUser ? '[User Input]: ' : '[Server Log]: ';

    process.stdout.write(textStart + message + '\n');
    consoleInputReader.prompt(true);
}

// --- Map für Konsolenbefehle ---
const consoleCommands = new Map();

// --- Konsoleneingabe-Handler ---
consoleCommands.set('exit', () => {
    logToConsole('Programm wird beendet. Auf Wiedersehen!');
    process.exit(0);
});

consoleCommands.set('reload commands', async () => {
    logToConsole("Reloading Bot command handlers...");
    await initializeCommandHandlers(); // Stelle sicher, dass initializeCommandHandlers exportiert ist
    logToConsole("Bot command handlers reloaded successfully.");
});

consoleCommands.set('reload timer', async () => {
    logToConsole("Reloading Timer Messages...");
    await initializeTimerMessagesModule(); // Stelle sicher, dass initializeCommandHandlers exportiert ist
    logToConsole("Timer Messages reloaded successfully.");
});

consoleCommands.set('count clients', async () => {
    logToConsole(`Aktuell verbundene LiveStats-Clients: ${connectedLiveStatsClients}`);
});

consoleInputReader.on('line', async (input) => { // async hinzugefügt, da initializeCommandHandlers async ist
    const trimmedInput = input.replace('"', '').trim().toLowerCase(); // Eingabe trimmen und zu Kleinbuchstaben konvertieren

    logToConsole(trimmedInput, true); // Diese Zeile ist redundant, da die Befehle selbst geloggt werden

    const commandHandler = consoleCommands.get(trimmedInput);

    if (commandHandler) {
        try {
            await commandHandler(); // Führe den Befehl aus
        } catch (error) {
            errorToConsole(`Fehler beim Ausführen des Konsolenbefehls "${trimmedInput}":`, error);
        }
    } else {
        logToConsole(`Befehl nicht gefunden: "${trimmedInput}"`);

        const commands = Array.from(consoleCommands.keys()).sort((a, b) => a.localeCompare(b)); // Sortiere die Befehle alphabetisch
        let availableCommands = formatListNaturally(commands)

        for (const command of commands) {
            let regex = new RegExp(`\\b(${command})([ ,]+|$)`, 'g');

            // $2 setze das was mithilfe von Groupd 2 im regex gefunden wurde
            availableCommands = availableCommands.replace(regex, `"${command}"$2`);
        }

        logToConsole(`Probiere stattdessen: ${availableCommands}`);
    }

    consoleInputReader.prompt(true); // Stelle den Prompt immer wieder her
});

consoleInputReader.on('close', () => {
    logToConsole('Readline-Schnittstelle geschlossen.');
    process.exit(0);
});
// --- Ende Readline-Schnittstelle ---

function broadcastToOverlay(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// WebSocket-Server-Logik anpassen
wss.on('connection', ws => {
    console.log('Neuer WebSocket-Client verbunden!');

    // Zähler erhöhen und LiveStatsModule benachrichtigen
    connectedLiveStatsClients++;
    console.log(`[WebSocket] Aktuell verbundene LiveStats-Clients: ${connectedLiveStatsClients}`);
    // Fordere sofortige Daten an, wenn ein neuer Client verbunden wird
    liveStatsModule.triggerImmediateFetch();
    liveStatsModule.startPollingIfClientsExist(connectedLiveStatsClients > 0); // Polling starten, falls es der erste Client war

    ws.on('close', () => {
        console.log('WebSocket-Client getrennt.');
        // Zähler verringern und LiveStatsModule benachrichtigen
        connectedLiveStatsClients--;
        console.log(`[WebSocket] Aktuell verbundene LiveStats-Clients: ${connectedLiveStatsClients}`);
        liveStatsModule.stopPollingIfNoClients(connectedLiveStatsClients === 0); // Polling stoppen, falls es der letzte Client war
    });

    ws.on('error', error => {
        console.error('WebSocket-Fehler aufgetreten:', error);
    });

    ws.on('message', message => {
        try {
            const parsedMessage = JSON.parse(message); // Nachrichten sind im JSON-Format

            // Überprüfe den Typ der Nachricht
            if (parsedMessage.category === 'reAlert') {
                console.log('[Server] realert empfangen');
                const alertData = parsedMessage.data;

                broadcastToOverlay(alertData);
            } else if (parsedMessage.category === 'jumpscare') {
                console.log('[Server] jumpscare empfangen');
                const jumpscareData = parsedMessage.data;

                broadcastToOverlay(jumpscareData);
            }
            else {
                console.log('Unbekannter Nachrichtentyp vom Client:', parsedMessage.type);
            }
        } catch (error) {
            console.error('Fehler beim Parsen der Client-Nachricht (kein gültiges JSON):', error);
        }
    });
});

async function startServer() {
    console.log("\n[Server] Starte Initialisierung der Authentifizierungen...");

    const twitchAppClientId = envConfig.TWITCH_APP_CLIENT_ID;
    const twitchAppClientSecret = envConfig.TWITCH_APP_CLIENT_SECRET;
    const twitchAppRedirectUri = envConfig.TWITCH_APP_REDIRECT_URI;

    const botClientId = envConfig.TWITCH_BOT_CLIENT_ID;
    const botClientSecret = envConfig.TWITCH_BOT_CLIENT_SECRET;
    const botRedirectUri = envConfig.TWITCH_BOT_REDIRECT_URI;
    const botChannelName = envConfig.TWITCH_BOT_CHANNEL;

    let streamerAuthCompleted = false;
    let botAuthCompleted = false;

    // Variable für das Ergebnis der Bot-Authentifizierung
    let botAuthResult = null;
    // Variable für das Ergebnis der Streamer-Authentifizierung
    let streamerAuthResult = null; // Hinzugefügt, um AuthProvider zu speichern

    try {
        console.log("[Server] Initialisiere Twitch Streamer Authentifizierung...");
        streamerAuthResult = await initializeTwitchAuth( // Ergebnis in streamerAuthResult speichern
            twitchAppClientId,
            twitchAppClientSecret,
            twitchAppRedirectUri
        );
        streamerAuthCompleted = true;
        console.log("[Server] Twitch Streamer Authentifizierung abgeschlossen.");
    } catch (error) {
        console.error("[Server] FEHLER bei der Streamer-Authentifizierung:", error.message);
        console.error("[Server] Bitte stellen Sie sicher, dass die Streamer-Authentifizierung abgeschlossen ist, und starten Sie den Server neu.");
        streamerAuthCompleted = false;
    }

    try {
        console.log("[Server] Initialisiere Twitch Bot Authentifizierung...");
        // Ergebnis in botAuthResult speichern
        botAuthResult = await initializeTwitchBotAuth(
            botClientId,
            botClientSecret,
            botRedirectUri
        );
        botAuthCompleted = true;
        console.log("[Server] Twitch Bot Authentifizierung abgeschlossen.");
    } catch (error) {
        console.error("[Server] FEHLER bei der Bot-Authentifizierung:", error.message);
        console.error("[Server] Bitte beheben Sie das Bot-Authentifizierungsproblem und starten Sie den Server neu.");
        botAuthCompleted = false;
    }

    if (botAuthCompleted && botAuthResult && botChannelName) {
        const botUsername = botAuthResult.username; // Verwende den Benutzernamen aus dem Auth-Ergebnis
        const botAuthProvider = botAuthResult.authProvider; // Holen Sie den AuthProvider
        const botApiClient = botAuthResult.apiClient;       // Holen Sie den ApiClient

        if (botUsername && botAuthProvider && botApiClient) {
            try {
                console.log(`[Server] Starte Bot (Twurple ChatClient) für Kanal: ${botChannelName}...`);
                initializeBot(
                    botUsername,
                    botChannelName,    // Der Kanalname ist der zweite Parameter
                    botAuthProvider,   // Der RefreshingAuthProvider
                    botApiClient       // Der ApiClient
                );
                console.log("[Server] Bot (Twurple ChatClient) initialisiert und verbunden.");
            } catch (error) {
                console.error("[Server] FEHLER beim Starten des Bots (Twurple ChatClient):", error.message);
            }
        } else {
            console.warn("[Server] Bot-Initialisierung übersprungen: Eine oder mehrere benötigte Informationen für den Twurple ChatClient fehlen.");
            if (!botUsername) console.warn("  - Bot-Username fehlt.");
            if (!botAuthProvider) console.warn("  - Bot AuthProvider fehlt.");
            if (!botApiClient) console.warn("  - Bot ApiClient fehlt.");
        }
    } else {
        console.warn("[Server] Bot-Initialisierung übersprungen: Bot-Authentifizierung nicht abgeschlossen oder Bot-Kanalname fehlt.");
    }

    // Alert-Modul initialisieren und EventSub verbinden mit Callback für Stream-Status
    if (streamerAuthCompleted && streamerAuthResult) { // Stelle sicher, dass streamerAuthResult verfügbar ist
        const streamerAuthProvider = streamerAuthResult.twitchAuthProvider;
        const streamerApiClient = streamerAuthResult.twitchApiClient;
        const streamerId = streamerAuthResult.userId;

        if (streamerAuthProvider && streamerApiClient && streamerId && wss) {
            try {
                console.log("[Server] Initialisiere Alert-Modul...");
                initializeAlerts(
                    streamerAuthProvider,
                    streamerApiClient,
                    streamerId,
                    wss, // Übergebe die WebSocketServer-Instanz
                );
                console.log("[Server] Alert-Modul initialisiert.");

                console.log("[Server] Verbinde zu EventSub für Alerts...");
                await connectToEventSub();
                console.log("[Server] EventSub-Verbindung für Alerts hergestellt.");
            } catch (error) {
                console.error("[Server] FEHLER beim Initialisieren/Verbinden des Alert-Moduls:", error.message);
            }
        } else {
            console.warn("[Server] Alert-Modul Initialisierung übersprungen: Eine oder mehrere benötigte Informationen für Alerts fehlen.");
            if (!streamerAuthProvider) console.warn("  - Streamer AuthProvider fehlt.");
            if (!streamerApiClient) console.warn("  - Streamer ApiClient fehlt.");
            if (!streamerId) console.warn("  - Streamer-ID fehlt.");
            if (!wss) console.warn("  - WebSocketServer-Instanz ist null.");
        }
    } else {
        console.warn("[Server] Alert-Modul Initialisierung übersprungen: Streamer-Authentifizierung nicht abgeschlossen.");
    }

    console.log("[Server] Alle Authentifizierungen und Bot-Initialisierungen versucht.");

    server.listen(PORT, async () => {
        console.log(`\n[Server] Twitch - Kommunikationsserver läuft auf Port ${PORT}`);
        console.log(`[Server] WebSocket(ws) Server für Overlays ist auf Port ${PORT} verfügbar(Verbinde zu ws://localhost:${PORT})`);
        console.log(`[Server] Konfigurationsseite: http://localhost:${PORT}/config.html`);
        console.log(`\n[Server] Warte auf Verbindungen...`);
    });
}

// Globaler Fehler-Handler für ungehandhabte Promises Rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('[UNHANDLED REJECTION] Unerwarteter Fehler:', reason);
});

// Sauberes Herunterfahren des Servers bei SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
    try {
        console.log('\n[Server] SIGINT Signal erhalten. Server wird heruntergefahren...');
        // Bevor der Server geschlossen wird, alle Module sauber trennen
        liveStatsModule.stopLiveStats();
        disconnectEventSub();
        disconnectBot();
    } finally {
        server.close(() => {
            console.log('[Server] HTTP und WebSocket Server geschlossen.');
        });
        process.exit(0);
    }
});

startServer();
