// authUtils/validateToken.js
// Enthält gemeinsame Funktionen für die Twitch-Authentifizierung.

const fetch = require('node-fetch');

/**
 * Validiert einen Twitch OAuth Access Token.
 * @param {string} accessToken Der zu validierende Access Token.
 * @returns {Promise<{clientId: string, userId: string, scopes: string[]}|null>} Ein Promise, das mit gültigen Token-Informationen aufgelöst wird, oder null bei Ungültigkeit.
 */
async function validateToken(accessToken) {
    if (!accessToken) {
        console.warn('[AuthUtils] validateToken: Kein Access Token bereitgestellt.');
        return null;
    }
    try {
        const response = await fetch('https://id.twitch.tv/oauth2/validate', {
            method: 'GET',
            headers: {
                'Authorization': `OAuth ${accessToken}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('[AuthUtils] Token Validierung erfolgreich');

            return {
                clientId: data.client_id,
                userId: data.user_id,
                scopes: data.scopes || [] // Sicherstellen, dass scopes immer ein Array ist
            };
        } else {
            const errorText = await response.text();
            console.warn(`[AuthUtils] Token Validierung fehlgeschlagen (${response.status}):`, errorText);
            return null;
        }
    } catch (error) {
        console.error('[AuthUtils] Fehler bei der Token Validierung:', error);
        return null;
    }
}

module.exports = {
    validateToken
};
