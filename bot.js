// bot.js
const { ChatClient } = require('@twurple/chat');

// Utilities
let timerModuleObject = {}; // objekt zum Zugriff auf den Timer
const normalizeString = require('./botCommands/utils/normalizeString');
const isMod = require('./botCommands/utils/isMod.js');
const websiteGenerator = require('./botCommands/utils/commandDisplay.js');
const { execSync } = require('child_process');
const getAllLocalFiles = require('./commonUtils/getAllLocalFiles.js');
const formatListNaturally = require('./commonUtils/formatListNaturally.js');

// Globale Variablen für den Twitch Bot
let twitchClient = null; // Dies wird jetzt der Twurple ChatClient
let timerIntervalId = null;

// Bot-spezifische Konfiguration
let currentBotUsername = null;
let currentTwitchChannel = null;
let _twitchClient = null;

// Authentifizierungs- und API-Client-Objekte (werden jetzt von außen gesetzt)
let botAuthProvider = null;
let botApiClient = null;

// Konfiguration laden
const configLoader = require('./configLoader');
const { ApiClient } = require('@twurple/api');
const { explanation } = require('./botCommands/discordCommand.js');
const config = configLoader.getEnvConfig();
const COMMAND_PREFIX = config.BOT_COMMAND_PREFIX || '!';

const COMMAND_COOLDOWN_SECONDS = config.botCommandCooldownSeconds || 10;


// Map, um Cooldowns pro Benutzer zu speichern
const userCooldowns = new Map();

let commandHandlers = null;

/**
 * Trennt die Verbindung des Twitch Bots.
 */
async function disconnectBot() {
    if (twitchClient) {
        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
            console.log('[Bot][Timer] Timer wurde gestoppt.');
        }
        try {
            await twitchClient.quit(); // Twurple ChatClient verwendet 'quit'
            twitchClient = null;
            console.log('[Bot] Twitch Bot Client erfolgreich getrennt.');
        } catch (error) {
            console.error('[Bot] Fehler beim Trennen des Twitch Bot Clients:', error);
        }
    } else {
        console.log('[Bot] Kein aktiver Twitch Bot Client zum Trennen.');
    }
}

async function initializeCommandHandlers() {
    commandHandlers = {}; // Setze commandHandlers zurück, um alte Handler zu entfernen

    let commandModules = await getAllLocalFiles('./botCommands', ['.js']);

    commandModules = [...commandModules];

    for (const filePath of commandModules) {
        try {
            // WICHTIG: Lösche das Modul aus dem Cache, bevor es erneut geladen wird
            // Dies stellt sicher, dass Änderungen an den Befehlsdateien übernommen werden
            delete require.cache[require.resolve("./" + filePath)];

            const module = require("./" + filePath);
            const filename = filePath.split(/[\\/]/).pop();
            const baseName = filename.replace(/\.js$/i, '');
            const commandName = baseName.replace(/^(commands)?(.+?)(Command)?$/i, '$2').toLowerCase().trim();
            commandHandlers[commandName] = module;

            //vorberitung auf einfache aliase hinzufügung
            if (module.shortCut) {
                commandHandlers[module.shortcut] = module;
            }

            // Aliases hinzufügen
            switch (commandName) {
                case 'discord':
                    commandHandlers["dc"] = module;
                    break;
                case 'x':
                    commandHandlers["twitter"] = module;
                    break;
                case 'tt':
                    commandHandlers["tiktok"] = module;
                    break;
                case 'freundesCode':
                    commandHandlers["fc"] = module;
                    break;
                case 'setgame':
                    commandHandlers["game"] = module;
                    break;
                case 'settitle':
                    commandHandlers["title"] = module;
                    break;
                case 'shoutout':
                    commandHandlers["so"] = module;
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.error(`[Bot] Fehler beim Initialisieren des Befehlsmoduls '${filePath}':`, error);
        }
    }

    commandHandlers["commands"] = {
        explanation: "Ein Befehl, der alle verfügbaren Befehle auflistet.",
        moduleFunction: displayCommands
    };

    gitPushCommandsAsWeb(commandHandlers);
}

async function gitPushCommandsAsWeb(commandMap) {
    // Gruppiere Befehle nach ihrer Erklärung
    const groupedByExplanation = new Map();

    for (const [name, handler] of Object.entries(commandMap)) {
        const explanation = handler.explanation || 'Keine Erklärung verfügbar';
        // Wenn kein Kürzel explizit angegeben ist, wird es als "-" markiert
        const shortcut = handler.shortcut || "-";

        if (!groupedByExplanation.has(explanation)) {
            groupedByExplanation.set(explanation, []);
        }
        groupedByExplanation.get(explanation).push({ name, shortcut, explanation });
    }

    // Erstelle das finale Array, indem du für jede Erklärung das beste Kürzel findest
    const finalCommands = [];

    for (const commands of groupedByExplanation.values()) {
        const primaryCommand = commands.reduce((best, current) => {
            if (best.explanation === current.explanation) {
                let nameCheck = best.name.length > current.name.length
                let realName = nameCheck ? best.name : current.name;
                let realShortCut = nameCheck ? current.name : best.name;

                return {
                    name: realName,
                    shortcut: realShortCut,
                    explanation: current.explanation
                };
            }
        });

        // Füge den resultierenden Befehl zum finalen Array hinzu
        finalCommands.push({
            name: primaryCommand.name,
            shortCut: primaryCommand.shortcut,
            explanation: primaryCommand.explanation
        });
    }

    // Übergib das fertige Array an den Website-Generator
    const filePath = __dirname + '/docs/index.html';
    websiteGenerator.createCommandPage(finalCommands, filePath);

    // Pushe die generierte Datei auf GitHub
    try {
        console.log('Starte Git-Befehle, um auf GitHub zu pushen...');

        execSync(`git add ${filePath}`, { stdio: 'inherit' });

        // Füge alle geänderten und hinzugefügten Dateien hinzu
        execSync('git add .', { stdio: 'inherit' });

        // Erstelle einen Commit
        const commitMessage = 'Auto: Update commands page';
        execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

        // Pushe die Änderungen zum Remote-Repository
        execSync('git push', { stdio: 'inherit' });

        console.log('Webseite erfolgreich auf GitHub gepusht!');
    } catch (error) {
        console.error('Fehler beim Pushen auf GitHub:', error.message);
    }
}

/**
* Lädt das Modul für Timer-Nachrichten und gibt seine exportierten Funktionen zurück.
* @returns {{startTimeMessageSending: Function, increaseMessageCount: Function}} Ein Objekt mit den Funktionen des Moduls.
*/
function initializeTimerMessagesModule() {
    const filePath = './botCommands/utils/timerMessages.js'

    // WICHTIG: Modul aus dem Cache löschen, bevor es erneut geladen wird
    // Dies stellt sicher, dass Änderungen an der Timerdatei übernommen wird
    delete require.cache[require.resolve("./" + filePath)];

    if (timerModuleObject.closeTimerMessageSending) {
        // Wenn das Modul bereits geladen ist, stoppe den Timer
        timerModuleObject.closeTimerMessageSending();
        console.log('[Bot][Timer] Timer-Nachrichten-Modul wurde neu geladen und der alte Timer gestoppt.');
    }

    try {
        // Lade das Modul für Timer-Nachrichten
        timerModuleObject = require(filePath);

        timerModuleObject.startTimeMessageSending(_twitchClient, currentTwitchChannel);
    } catch (error) {
        console.error('[ModuleLoader] FEHLER beim Laden des timerMessages.js Moduls:', error.message);
        // Gebe leere Funktionen zurück, um Fehler bei der weiteren Ausführung zu vermeiden
        timerModuleObject = {
            startTimeMessageCount: () => console.error('Error: startTimeMessageCount not available due to module loading error.'),
            increaseMessageCount: () => console.error('Error: increaseMessageCount not available due to module loading error.')
        };
    }
}

/**
 * Initialisiert den Twitch-Bot und setzt die Event-Listener auf.
 *
 * @param {string} botUsername - Der Benutzername des Bot-Accounts.
 * @param {string} twitchChannel - Der Twitch-Kanal, dem der Bot beitreten soll.
 * @param {RefreshingAuthProvider} authProvider - Der initialisierte Twurple RefreshingAuthProvider.
 * @param {ApiClient} apiClient - Der initialisierte Twurple ApiClient.
 */
function initializeBot(botUsername, twitchChannel, authProvider, apiClient) {
    if (twitchClient) {
        console.warn('[Bot] wurde bereits initialisiert. Trenne alte Verbindung und starte neu.');
        disconnectBot();
    }

    initializeCommandHandlers();

    // Speichere die übergebenen Werte in globalen Variablen
    currentBotUsername = botUsername;
    currentTwitchChannel = twitchChannel;
    botAuthProvider = authProvider; // AuthProvider wird jetzt übergeben!
    botApiClient = apiClient;     // ApiClient wird jetzt übergeben!

    twitchClient = new ChatClient({
        authProvider: botAuthProvider, // Übergabe des AuthProviders
        channels: [currentTwitchChannel],
        rejoinChannelsOnReconnect: true,
        isAlwaysMod: true,
    });

    // --- Twitch Chat Nachrichten Empfangen und Verarbeiten ---
    twitchClient.onMessage(async (channel, user, message, msg) => {
        console.log(`[Bot] Nachricht empfangen von ${msg.userInfo.displayName}: ${message}`);

        if (timerModuleObject.increaseMessageCount) {
            // Erhöhe die Anzahl der Nachrichten für die Timer-Nachrichten
            timerModuleObject.increaseMessageCount();
        }

        if (invalidURLSend(twitchClient, channel, msg, message)) {
            return;
        }

        if (message.startsWith(COMMAND_PREFIX)) {
            const userId = msg.userInfo.userId;
            const username = msg.userInfo.displayName || msg.userInfo.userName;

            if (!isMod(msg.userInfo)) {
                const lastCommandTime = userCooldowns.get(userId) || 0;
                const currentTime = Date.now();
                const timeSinceLastCommand = currentTime - lastCommandTime;
                const cooldownMilliseconds = COMMAND_COOLDOWN_SECONDS * 1000;

                if (timeSinceLastCommand < cooldownMilliseconds) {
                    return;
                }
            }

            userCooldowns.set(userId, Date.now());

            const args = message.slice(COMMAND_PREFIX.length).split(' ');
            let command = normalizeString(args.shift().toLowerCase());

            console.log(`[Bot] Befehl empfangen: ${command} von ${msg.userInfo.displayName}`);

            let targetUser = args[0] ? args[0].replace('@', '') : (msg.userInfo.displayName || msg.userInfo.userName);
            if (targetUser.length > 25) targetUser = targetUser.substring(0, 25);

            const handler = commandHandlers[command];
            const commandFunction = handler ? handler.moduleFunction : null;

            if (commandFunction) {
                try {
                    commandFunction(twitchClient, channel, msg, args, targetUser, {
                        botApiClient: botApiClient,
                    });
                } catch (error) {
                    console.error(`[Bot] Fehler beim Ausführen von Befehl '${command}' für ${username}:`, error);
                    await twitchClient.say(channel, `Ein Fehler ist beim Ausführen von !${command} aufgetreten.`);
                }
            }
        }
    });

    // --- Raid-Event-Listener ---
    twitchClient.onRaid(async (channel, user, raidInfo, msg) => {
        console.log(`[Bot] Raid von ${user} mit ${raidInfo.viewerCount} Zuschauern auf Kanal ${channel}`);

        const shoutoutHandler = commandHandlers['shoutout'] || commandHandlers['so'];

        if (shoutoutHandler) {
            try {
                shoutoutHandler(twitchClient, channel, msg, [], user, {
                    botApiClient: botApiClient,
                });

            } catch (error) {
                console.error(`[Bot] Fehler beim Ausführen des Shoutout-Befehls nach Raid von ${user}:`, error);
            }
        } else {
            console.warn('[Bot] Shoutout-Befehl nicht gefunden, konnte keinen Shoutout nach Raid senden.');
        }
    });

    // --- Fehlerbehandlung für Twitch Client ---
    twitchClient.onDisconnect((reason) => {
        console.error(`[Bot] Twitch Client getrennt: ${reason}`);
        if (timerIntervalId) {
            clearInterval(timerIntervalId);
            timerIntervalId = null;
            console.log('[Bot][Timer] Aktiver Timer gestoppt wegen Disconnect.');
        }
    });

    twitchClient.onMessageFailed((channel, reason) => {
        console.error(`[Bot] Twitch Client fehler beim Senden einer Nachricht (${channel}): ${reason}`);
    })

    twitchClient.onConnect(() => {
        console.log(`[Bot] Verbunden mit Twitch IRC.`);

        console.log(`[Bot] Bot '${currentBotUsername}' versucht sich mit Kanal '${currentTwitchChannel}' zu verbinden.`);

        initializeTimerMessagesModule(); // Starte die Timer-Nachrichten

        setTimeout(() => {
            twitchClient.say(currentTwitchChannel, `${currentBotUsername} ist ready! :D`)
                .then(() => {
                    console.log(`[Bot] Erste Willkommensnachricht ('${currentBotUsername} ist ready! :D') erfolgreich gesendet.`);
                })
                .catch(error => {
                    console.error(`[Bot] FEHLER beim Senden der ersten Willkommensnachricht:`, error);
                });
        }, 250);
    });

    // --- Verbindung zum Twitch IRC Server aufbauen ---
    twitchClient.connect()

    _twitchClient = twitchClient; // Speichere den Twitch Client in der globalen Variable
    return twitchClient;
}

/**
 * Überprüft, ob die gegebene Nachricht Links enthält, die nicht von YouTube oder Twitch stammen.
 * Wenn unerlaubte Links gefunden werden UND der Absender kein Mod ist, wird die Nachricht gelöscht.
 *
 * @param {object} twitchClient - Der Twurple ChatClient (zum Löschen der Nachricht).
 * @param {string} channel - Der Kanal, in dem die Nachricht gesendet wurde.
 * @param {ChatMessage} msg - Das Twurple ChatMessage-Objekt, das Informationen über den Absender enthält (für isMod und msg.id).
 * @param {string} message - Die zu überprüfende Nachricht (z.B. ein Chat-Nachrichtentext).
 * @returns {boolean} True, wenn unerlaubte Links gefunden wurden, ansonsten False.
 */
function invalidURLSend(twitchClient, channel, msg, message) {
    channel = channel.replace("#", "")

    if (typeof message !== 'string' || message.trim() === '') {
        return false;
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const foundUrls = message.match(urlRegex);

    if (!foundUrls) {
        return false;
    }

    const allowedDomains = [
        'youtube.com',
        'youtu.be',
        'www.youtube.com',
        'm.youtube.com',
        'twitch.tv',
        'www.twitch.tv',
        'clips.twitch.tv',
        'go.twitch.tv',
    ];

    for (const url of foundUrls) {
        try {
            const urlObject = new URL(url);
            const hostname = urlObject.hostname.toLowerCase();

            const isAllowed = allowedDomains.some(allowedDomain => hostname.endsWith(allowedDomain));

            if (!isAllowed) {
                console.warn(`[invalidURLSend] Unerlaubter Link gefunden: ${url} (Hostname: ${hostname}) von ${msg.userInfo.displayName}`);

                if (!isMod(msg.userInfo)) {
                    botApiClient.moderation.deleteChatMessages(channel, msg.id, "not allowed url")
                        .then(() => {
                            console.log(`[invalidURLSend] Unerlaubter Link von ${msg.userInfo.displayName} (${msg.id}) wurde gelöscht.`);
                        })
                        .catch(err => {
                            console.error(`[invalidURLSend] Fehler beim Löschen der Nachricht mit unerlaubtem Link (${msg.id}):`, err);
                        });
                } else {
                    console.log(`[invalidURLSend] Mod ${msg.userInfo.displayName} hat einen nicht erlaubten Link gepostet (Nachricht wird nicht gelöscht).`);
                }
                return true;
            }
        } catch (e) {
            console.warn(`[invalidURLSend] Ungültiges URL-Format im String gefunden (wird als unerlaubt behandelt): ${url} von ${msg.userInfo.displayName}`, e);

            if (!isMod(msg.userInfo)) {
                botApiClient.moderation.deleteChatMessages(channel, msg.id, "not allowed url")
                    .then(() => {
                        console.log(`[invalidURLSend] Nachricht mit ungültigem URL-Format von ${msg.userInfo.displayName} (${msg.id}) wurde gelöscht.`);
                    })
                    .catch(err => {
                        console.error(`[invalidURLSend] Fehler beim Löschen der Nachricht mit ungültigem URL-Format (${msg.id}):`, err);
                    });
            } else {
                console.log(`[invalidURLSend] Mod ${msg.userInfo.displayName} hat ein ungültiges URL-Format gepostet (Nachricht wird nicht gelöscht).`);
            }
            return true;
        }
    }

    return false;
}

async function displayCommands(client, channel, msg, args, targetUser) {
    const fromUser = msg.userInfo.displayName || msg.userInfo.userName;

    const keysArray = Object.keys(commandHandlers);
    keysArray.sort();

    let commandsFormated = COMMAND_PREFIX + formatListNaturally(keysArray).trim();

    // second replace => workaround solution for "und" not being replaced correctly
    commandsFormated = commandsFormated.replaceAll(/([\s.,\/\(\):\n]+)/g, `$1${COMMAND_PREFIX}`).replace(`${COMMAND_PREFIX}und`, "und");

    messageToSend = `@${fromUser} Hier alle commands: ${commandsFormated}`

    if (messageToSend.length <= 500) {
        client.say(channel, messageToSend);
    }
    else {
        client.say(channel, `@${fromUser} oh no... Es sind zu viele Befehle um sie in den Twitch reinzuschreiben... tut mir sehr leid :(`);
    }
}

module.exports = {
    initializeBot,
    disconnectBot,
    initializeCommandHandlers,
    initializeTimerMessagesModule,
};