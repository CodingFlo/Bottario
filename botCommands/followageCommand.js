async function command(client, channel, tags, args, targetUser) {
    const broadcasterChannelName = channel.replace('#', '');
    const targetUserNameForApi = targetUser.replace('@', '');
    const followageApiUrl = `https://commands.garretcharp.com/twitch/followage/${broadcasterChannelName}/${targetUserNameForApi}`;

    try {
        console.log(`[Bot] Versuche Followage-Info für '${targetUserNameForApi}' über URL: '${followageApiUrl}' abzurufen...`);
        const response = await fetch(followageApiUrl);

        if (!response.ok) {
            console.error(`[Bot] Fehler beim Abrufen der Followage-Info: HTTP-Status ${response.status} für ${targetUserNameForApi}`);
            await client.say(channel, `Entschuldigung, ich konnte die Followage-Informationen für @${targetUserNameForApi} gerade nicht abrufen (Fehler ${response.status}).`);
            return;
        }

        const apiResponseText = await response.text();

        if (apiResponseText.trim() === '') {
            await client.say(channel, `Konnte keine Followage-Informationen für @${targetUserNameForApi} finden oder der Benutzer existiert nicht.`);
            console.log(`[Bot] Leere Followage-Info für '${targetUserNameForApi}' erhalten.`);
            return;
        }

        await client.say(channel, apiResponseText);
        console.log(`[Bot] Followage-Nachricht gesendet: "${apiResponseText}"`);
    } catch (error) {
        console.error(`[Bot] Kritischer Fehler beim Ausführen des !followage Befehls für '${targetUserNameForApi}':`, error);
        await client.say(channel, `Ein technischer Fehler ist aufgetreten, konnte Followage für @${targetUserNameForApi} nicht abrufen.`);
    }
}

module.exports = {
    explanation: "Ein Befehl mit dem angezeigt wird, wie lange ein User Chris schon folgt, bzw. ob ein User Chris folgt",
    moduleFunction: command
} 