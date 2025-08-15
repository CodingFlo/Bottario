const isMod = require('./utils/isMod');
const configLoader = require('../configLoader');

async function command(client, channel, tags, args, targetUser) {
    // Nur Mods oder Broadcaster dürfen diesen Befehl verwenden
    if (!isMod(tags.userInfo)) {
        return;
    }

    const newTitle = args.join(' ').trim(); // Alle Argumente als Titel zusammenfügen

    if (!newTitle) {
        await client.say(channel, `@${tags.userInfo.displayName} Bitte gib einen Titel an. Beispiel: !title Super geiler titel // 4k HD Zoll Getriebe`);
        return;
    }

    const configData = configLoader.getFileConfig()
    const envData = configLoader.getEnvConfig()

    const clientID = envData.TWITCH_APP_CLIENT_ID;
    const currentStreamerUserId = configData.STREAMER_TWITCH_USER_ID;
    const currentTwitchAppAccessToken = configData.STREAMER_OAUTH_TOKEN;

    // Stelle sicher, dass die Streamer-ID verfügbar ist
    if (!currentStreamerUserId) {
        console.error('[Bot][setTitle] Streamer User ID ist nicht verfügbar.');
        await client.say(channel, `Fehler: Streamer-ID nicht gefunden. Titel konnte nicht geändert werden.`);
        return;
    }

    try {
        const response = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${currentStreamerUserId}`, {
            method: 'PATCH',
            headers: {
                'Client-ID': clientID,
                'Authorization': `Bearer ${currentTwitchAppAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: newTitle
            })
        });

        if (response.ok) {
            await client.say(channel, `Streamtitel erfolgreich geändert zu: "${newTitle}"`);
            console.log(`[Bot][setTitle] Streamtitel erfolgreich geändert zu: "${newTitle}"`);
        } else {
            const errorData = await response.json();
            console.error(`[Bot][setTitle] Fehler beim Ändern des Streamtitels (${response.status}):`, errorData);
            await client.say(channel, `Fehler beim Ändern des Streamtitels: ${errorData.message || 'Unbekannter Fehler'}.`);
        }
    } catch (error) {
        console.error(`[Bot][setTitle] Kritischer Fehler beim Ändern des Streamtitels:`, error);
        await client.say(channel, `Ein technischer Fehler ist aufgetreten, Titel konnte nicht geändert werden.`);
    }
}

module.exports = {
    explanation: "Ein Befehl rein für Mods, mit dem der Streamtitel geändert werden kann",
    moduleFunction: command
} 