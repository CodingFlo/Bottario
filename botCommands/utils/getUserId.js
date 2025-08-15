// botCommands/utils/getUserId.js
async function getUserId(username, clientId, appAccessToken) {
    try {
        const response = await fetch(`https://api.twitch.tv/helix/users?login=${username}`, {
            headers: {
                'Client-ID': clientId,
                'Authorization': `Bearer ${appAccessToken}`
            }
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Bot][getUserId] API Fehler beim Abrufen der User ID für '${username}': Status ${response.status}, Antwort: ${errorText}`);
            return null;
        }
        const data = await response.json();
        if (data && data.data && data.data.length > 0) {
            console.log(`[Bot][getUserId] User ID für '${username}' gefunden: ${data.data[0].id}`);
            return data.data[0].id;
        }
        console.warn(`[Bot][getUserId] Keine User ID für '${username}' gefunden. Antwort:`, data);
    } catch (error) {
        console.error(`[Bot][getUserId] Kritischer Fehler beim Abrufen der User ID für '${username}':`, error);
    }
    return null;
}
module.exports = getUserId;