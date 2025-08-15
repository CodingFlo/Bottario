const isMod = require('./utils/isMod'); // Pfad angepasst, da es in botCommands liegt
const getUserId = require('./utils/getUserId'); // Pfad angepasst

/**
 * Führt den Shoutout-Befehl aus.
 * @param {object} client - Der Twurple ChatClient.
 * @param {string} channel - Der Kanal, in dem der Befehl ausgeführt wurde.
 * @param {object} tags - Die Tags der Nachricht (enthält Benutzerinformationen).
 * @param {string[]} args - Die Argumente des Befehls.
 * @param {string} targetUser - Der Zielbenutzer für den Shoutout.
 * @param {object} options - Zusätzliche Optionen, die vom Bot übergeben werden (z.B. botApiClient, sendMessage).
 * @param {import('@twurple/api').ApiClient} options.botApiClient - Der Twurple ApiClient des Bots.
 * @param {function(string, string): void} options.sendMessage - Die Funktion zum Senden von Nachrichten über die Bot-Warteschlange.
 */
async function command(client, channel, tags, args, targetUser, options) {
    // Nur Mods dürfen diesen Befehl nutzen
    if (!isMod(tags.userInfo)) {
        return;
    }

    const { botApiClient, sendMessage } = options; // Extrahiere botApiClient und sendMessage aus options

    let gameTitle = "<GAME NOT FOUND>";
    let streamerIsLive = false;
    let userId = null;

    if (!targetUser) {
        sendMessage(channel, `Bitte gib einen Benutzer an, für den ein Shoutout gemacht werden soll, z.B. !so <Benutzername>`);
        return;
    }

    try {
        // Rufe die Benutzer-ID über den botApiClient ab
        const user = await botApiClient.users.getUserByName(targetUser);
        if (!user) {
            sendMessage(channel, `@${tags.userInfo.displayName}, konnte Informationen für @${targetUser} nicht finden. Existiert der Benutzer?`);
            console.warn(`[Bot] Konnte Informationen für @${targetUser} nicht finden. Benutzer existiert möglicherweise nicht.`);
            return;
        }
        userId = user.id;

        console.log(`[Bot] Versuche Kanal-Info für '${targetUser}' (ID: ${userId}) abzurufen (für letztes Spiel)...`);
        const channelInfo = await botApiClient.channels.getChannelInfoById(userId);

        if (channelInfo && channelInfo.gameName) {
            gameTitle = channelInfo.gameName;
            console.log(`[Bot] Letztes Spiel für ${targetUser} von Kanal-Info: ${gameTitle}`);
        } else {
            console.log(`[Bot] Kanal-Info für ${targetUser} hatte keinen 'game_name' oder keine Daten.`);
        }

        console.log(`[Bot] Prüfe, ob '${targetUser}' live ist...`);
        const stream = await botApiClient.streams.getStreamByUserId(userId);

        if (stream) {
            streamerIsLive = true;
            gameTitle = stream.gameName || gameTitle; // Überschreibe, falls live und anderes Spiel
            console.log(`[Bot] ${targetUser} ist LIVE und spielt: ${gameTitle}`);
        } else {
            console.log(`[Bot] ${targetUser} ist derzeit NICHT live.`);
        }

    } catch (error) {
        console.error(`[Bot] Kritischer Fehler beim Ausführen des !so Befehls für '${targetUser}':`, error);
        await client.say(channel, `Ein technischer Fehler ist aufgetreten, konnte Informationen für @${targetUser} nicht abrufen.`);
        return;
    }

    let messageToSend = ``;
    messageToSend = `Schaut doch gerne mal bei @${targetUser} vorbei! Dort gab es zuletzt ${gameTitle}! :D twitch.tv/${targetUser}`;

    await client.say(channel, messageToSend); // Nutze die sendMessage Funktion
    console.log(`[Bot] Shoutout - Nachricht gesendet: ${messageToSend}`);
}

module.exports = {
    explanation: "Ein Befehl rein für Mods um jemanden einen Shoutout zu geben",
    moduleFunction: command
} 
