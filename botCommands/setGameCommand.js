const isMod = require('./utils/isMod');
const configLoader = require('../configLoader');
const levenshtein = require('js-levenshtein');

async function command(client, channel, tags, args, targetUser) {
    // Nur Mods oder Broadcaster dürfen diesen Befehl verwenden
    if (!isMod(tags.userInfo)) {
        return;
    }

    const newGameNameInput = args.join(' ').trim(); // Alle Argumente als Spielnamen zusammenfügen

    if (!newGameNameInput) {
        await client.say(channel, `@${tags.userInfo.displayName} Bitte gib einen Spielnamen an. Beispiel: !game Minecraft`);
        return;
    }

    const envData = configLoader.getEnvConfig();
    const configData = configLoader.getFileConfig();

    const clientID = envData.TWITCH_APP_CLIENT_ID;
    const currentStreamerUserId = configData.STREAMER_TWITCH_USER_ID;
    const currentTwitchAppAccessToken = configData.STREAMER_OAUTH_TOKEN;

    let gameId = null;
    let chosenGameName = null; // Um den tatsächlich gewählten Spielnamen zu speichern

    try {
        // Zuerst nach Spielen suchen, die mit dem eingegebenen Namen übereinstimmen.
        // Die Twitch API gibt hier die besten (oft prefix-basierten) Treffer zurück.
        const gameSearchResponse = await fetch(`https://api.twitch.tv/helix/games?name=${encodeURIComponent(newGameNameInput)}`, {
            headers: {
                'Client-ID': clientID,
                'Authorization': `Bearer ${currentTwitchAppAccessToken}`
            }
        });

        if (!gameSearchResponse.ok) {
            const errorData = await gameSearchResponse.json();
            console.error(`[Bot][setGame] Fehler beim Suchen der Game ID für '${newGameNameInput}' (${gameSearchResponse.status}):`, errorData);
            await client.say(channel, `Fehler beim Suchen des Spiels: ${errorData.message || 'Unbekannter Fehler'}.`);
            return;
        }

        const gameSearchData = await gameSearchResponse.json();
        const gamesFound = gameSearchData.data;

        if (gamesFound && gamesFound.length > 0) {
            let bestMatchGame = null;
            let minDistance = Infinity; // Wir suchen die kleinste Levenshtein-Distanz

            // Schleife durch alle gefundenen Spiele, um das ähnlichste zu finden
            for (const game of gamesFound) {
                // Berechne die Levenshtein-Distanz zwischen der Eingabe und dem Spielnamen
                const distance = levenshtein(newGameNameInput.toLowerCase(), game.name.toLowerCase());

                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatchGame = game;
                }
            }

            // NEUER SCHWELLENWERT: Die Levenshtein-Distanz sollte nicht mehr als 20%
            // der Länge des längeren Strings (Eingabe oder gefundener Name) betragen.
            // Dies ist ein gängiger Weg, einen dynamischen Schwellenwert zu definieren.
            const maxLength = Math.max(newGameNameInput.length, bestMatchGame.name.length);
            const maxAllowedDistance = Math.ceil(maxLength * 0.20); // Beispiel: Max. 20% Abweichung
            // Du kannst 0.20 (20%) anpassen. Ein kleinerer Wert macht die Suche strenger.

            if (minDistance <= maxAllowedDistance) { // Nur verwenden, wenn die Distanz akzeptabel ist
                gameId = bestMatchGame.id;
                chosenGameName = bestMatchGame.name;
                console.log(`[Bot][setGame] Beste Game ID für '${newGameNameInput}' gefunden: ${chosenGameName} (ID: ${gameId}, Levenshtein-Distanz: ${minDistance})`);

                // Gib nur eine Nachricht aus, wenn der gefundene Name nicht exakt der Eingabe entspricht
                if (newGameNameInput.toLowerCase() !== chosenGameName.toLowerCase()) {
                    await client.say(channel, `@${tags.userInfo.displayName} Habe "${newGameNameInput}" nicht exakt gefunden, aber das ähnlichste Spiel ist "${chosenGameName}". Ändere das Spiel zu diesem.`);
                }
            } else {
                await client.say(channel, `Spiel "${newGameNameInput}" auf Twitch nicht gefunden und keine ausreichend ähnliche Übereinstimmung.`);
                console.warn(`[Bot][setGame] Spiel "${newGameNameInput}" nicht gefunden oder Ähnlichkeit zu gering (Min. Distanz: ${minDistance}, Erlaubt: ${maxAllowedDistance}).`);
                return;
            }

        } else {
            await client.say(channel, `Spiel "${newGameNameInput}" auf Twitch nicht gefunden. Bitte überprüfe die Schreibweise.`);
            console.warn(`[Bot][setGame] Spiel "${newGameNameInput}" nicht gefunden.`);
            return;
        }

        // Dann den Kanal aktualisieren (nur game_id, kein title, da nicht im Request)
        const updateChannelResponse = await fetch(`https://api.twitch.tv/helix/channels?broadcaster_id=${currentStreamerUserId}`, {
            method: 'PATCH',
            headers: {
                'Client-ID': clientID,
                'Authorization': `Bearer ${currentTwitchAppAccessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                game_id: gameId
            })
        });

        if (updateChannelResponse.ok) {
            await client.say(channel, `Stream-Spiel erfolgreich geändert zu: "${chosenGameName}"`);
            console.log(`[Bot][setGame] Stream-Spiel erfolgreich geändert zu: "${chosenGameName}"`);
        } else {
            const errorData = await updateChannelResponse.json();
            console.error(`[Bot][setGame] Fehler beim Ändern des Stream-Spiels (${updateChannelResponse.status}):`, errorData);
            // Überprüfe spezifische Fehler, z.B. ungültiger Token-Scope
            if (errorData.message && errorData.message.includes('missing scope') || errorData.message.includes('Not authorized')) {
                await client.say(channel, `Fehler: Möglicherweise fehlen Berechtigungen (Scopes) für das Ändern des Spiels. Stelle sicher, dass der Bot "channel:manage:broadcast" hat.`);
            } else {
                await client.say(channel, `Fehler beim Ändern des Stream-Spiels: ${errorData.message || 'Unbekannter Fehler'}.`);
            }
        }
    } catch (error) {
        console.error(`[Bot][setGame] Kritischer Fehler beim Ändern des Stream-Spiels:`, error);
        await client.say(channel, `Ein technischer Fehler ist aufgetreten, Spiel konnte nicht geändert werden.`);
    }
}

module.exports = {
    explanation: "Ein Befehl rein für Mods, mit dem das gestreamte Game geändert werden kann",
    moduleFunction: command
} 