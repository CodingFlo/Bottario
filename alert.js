// alert.js
const WebSocket = require('ws'); // Zum Senden an das Frontend

// --- Modul-interne Variablen ---
// Diese Variablen werden durch initializeAlerts() gesetzt
let _twitchAuthProvider;
let _twitchApiClient; // Der Twurple ApiClient
let _twitchBroadcasterId; // Die Twitch Kanal-ID des Streamers
let primaryWebSocketServer; // Der Haupt-WebSocket-Server aus server.js, um Nachrichten an das Frontend zu senden

// Globaler EventSub-WebSocket Client
let eventSubWs = null;
let sessionId = null; // Die Session-ID, die Twitch für unsere WebSocket-Verbindung vergibt
let streamStatusUpdateCallback = null; // online/offline callback for alert.js
const activeSubscriptions = new Set(); // Ein Set, um die IDs unserer aktiven EventSub-Abonnements zu speichern

/**
 * Initialisiert das Alert-Modul mit den notwendigen Twitch-API-Zugangsdaten und dem WebSocket-Server.
 * Muss vor connectToEventSub() aufgerufen werden.
 *
 * @param {import('@twurple/auth').RefreshingAuthProvider} twitchAuthProvider - Der Twitch Auth Provider.
 * @param {import('@twurple/api').ApiClient} twitchApiClient - Der Twurple API Client.
 * @param {string} broadcasterId - Die Twitch Kanal-ID des Streamers.
 * @param {object} wssInstance - Die Instanz des Haupt-WebSocket-Servers (wss aus server.js).
 * @param {Function} updateCallBack - Callback-Funktion für Stream-Status-Updates (online/offline).
 */
function initializeAlerts(twitchAuthProvider, twitchApiClient, broadcasterId, wssInstance, updateCallBack) {
    _twitchAuthProvider = twitchAuthProvider;
    _twitchApiClient = twitchApiClient;
    primaryWebSocketServer = wssInstance;
    streamStatusUpdateCallback = updateCallBack;
    _twitchBroadcasterId = broadcasterId; // Speichere die Broadcaster ID

    console.log('[Alerts] Alert-Modul initialisiert.');
    console.log(`[Alerts] Initialisiert mit Broadcaster ID: ${_twitchBroadcasterId}`); // Debug-Log
}

/**
 * Sendet eine Alert-Nachricht an alle verbundenen Frontend-Clients über den Haupt-WebSocket-Server.
 *
 * @param {object} alertData - Das Datenobjekt für den Alert (z.B. { type: 'follow', username: '...' }).
 */
function sendAlertToFrontend(alertData) {
    if (primaryWebSocketServer && primaryWebSocketServer.clients.size > 0) {
        primaryWebSocketServer.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'alert', data: alertData }));
            }
        });
        console.log(`[Alerts] Alert vom Typ '${alertData.type}' an Frontend gesendet.`);
    } else {
        console.warn('[Alerts] Keine Frontend-Clients verbunden oder primaryWebSocketServer nicht verfügbar. Alert nicht gesendet.');
    }
}

// --- EventSub-Verwaltungsfunktionen ---

/**
 * Erstellt ein EventSub-Abonnement bei Twitch.
 *
 * @param {string} type - Der Typ des EventSub-Ereignisses (z.B. 'channel.follow').
 * @param {string} version - Die Version des Ereignisses (z.B. '2').
 * @param {object} condition - Die Bedingungen für das Abonnement (z.B. { broadcaster_user_id: '...' }).
 * @returns {Promise<boolean>} True, wenn das Abonnement erfolgreich war oder bereits existiert, sonst False.
 */
async function createEventSubSubscription(type, version, condition) {
    try {
        console.log(`[EventSub] Versuche Subscription für '${type}' zu erstellen...`);
        // Verwende den _twitchApiClient für die Subscription-Erstellung
        const subscription = await _twitchApiClient.eventSub.createSubscription(type, version, condition, {
            method: 'websocket',
            session_id: sessionId // Muss die aktuelle Session-ID sein
        }, _twitchBroadcasterId);

        console.log(`[EventSub] Subscription für '${type}' erfolgreich erstellt. ID: ${subscription.id}, Status: ${subscription.status}`);
        activeSubscriptions.add(subscription.id); // Subscription ID speichern
        return true;
    } catch (error) {
        // Spezifische Fehlerbehandlung für "Subscription bereits existiert"
        if (error.name === 'EventSubSubscriptionExistsError') {
            console.warn(`[EventSub] Subscription für '${type}' existiert bereits. Überspringe.`);
            return true;
        }
        console.error(`[EventSub] Fehler beim Erstellen der Subscription für '${type}':`, error);
        return false;
    }
}

/**
 * Löscht alle aktiven EventSub-Abonnements.
 * Dies ist wichtig, bevor eine neue EventSub-WebSocket-Verbindung hergestellt wird,
 * um Duplikate zu vermeiden und alte Sessions zu bereinigen.
 */
async function deleteAllEventSubSubscriptions() {
    console.log('[EventSub] Lösche alle aktiven EventSub-Subscriptions...');
    let subscriptionsToDelete;
    try {
        const { data } = await _twitchApiClient.eventSub.getSubscriptions();
        subscriptionsToDelete = data;
    } catch (error) {
        console.error('[EventSub] Fehler beim Abrufen bestehender Subscriptions zum Löschen:', error);
        subscriptionsToDelete = []; // Setze auf leeres Array, um weiteren Fehler zu vermeiden
    }

    for (const sub of subscriptionsToDelete) {
        try {
            await _twitchApiClient.eventSub.deleteSubscription(sub.id);
            console.log(`[EventSub] Subscription ${sub.id} erfolgreich gelöscht.`);
            activeSubscriptions.delete(sub.id); // Aus unserem Set entfernen
        } catch (error) {
            console.error(`[EventSub] Fehler beim Löschen der Subscription ${sub.id}:`, error);
        }
    }
    console.log('[EventSub] Alle EventSub-Subscriptions gelöscht.');
    activeSubscriptions.clear();
}

/**
 * Stellt eine WebSocket-Verbindung zu Twitch EventSub her und abonniert die notwendigen Events.
 */
async function connectToEventSub() {
    if (!_twitchBroadcasterId || !_twitchApiClient || !_twitchAuthProvider) {
        console.error('[EventSub] Broadcaster ID, Twitch API Client oder Auth Provider fehlt. Kann EventSub nicht verbinden.');
        return;
    }

    // Überprüfung der Scopes vor dem Erstellen der Abonnements
    // Stelle sicher, dass dies mit dem AuthProvider des Streamers geschieht
    const requiredFollowScope = 'moderation:read'; // Für channel.follow v2
    const currentStreamerScopes = _twitchAuthProvider.getCurrentScopesForUser(_twitchBroadcasterId);

    if (!currentStreamerScopes || !currentStreamerScopes.includes(requiredFollowScope)) {
        console.error(`[EventSub] FEHLER: Der Streamer-Account (${_twitchBroadcasterId}) hat nicht die erforderliche Berechtigung '${requiredFollowScope}' für 'channel.follow' EventSub. Bitte OAuth-Flow erneut durchlaufen und Berechtigung erteilen.`);
        return; // Beende die Funktion hier
    } else {
        console.log(`[EventSub] Streamer-Account hat die erforderliche Berechtigung '${requiredFollowScope}'.`);
    }

    if (eventSubWs && eventSubWs.readyState === WebSocket.OPEN) {
        console.log('[EventSub] Bereits verbunden, trenne alte Verbindung...');
        eventSubWs.close();
    }
    await deleteAllEventSubSubscriptions(); // WICHTIG: Alte Subscriptions löschen

    console.log('[EventSub] Verbinde zu Twitch EventSub-WebSocket...');
    eventSubWs = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

    eventSubWs.onopen = () => {
        console.log('[EventSub] Verbindung zum Twitch EventSub-WebSocket hergestellt.');
    };

    eventSubWs.onmessage = async event => {
        const message = JSON.parse(event.data);

        switch (message.metadata.message_type) {
            case 'session_welcome':
                sessionId = message.payload.session.id;
                console.log(`[EventSub] Session Welcome. Session ID: ${sessionId}`);
                console.log('[EventSub] Erstelle EventSub-Abonnements...');

                // Alle Subscriptions im Kontext des Streamers erstellen
                await createEventSubSubscription('channel.follow', '2', {
                    broadcaster_user_id: _twitchBroadcasterId,
                    moderator_user_id: _twitchBroadcasterId // Für Version 2 erforderlich
                });
                await createEventSubSubscription('channel.subscribe', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('channel.cheer', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('channel.hype_train.begin', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('channel.raid', '1', {
                    to_broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('channel.channel_points_custom_reward_redemption.add', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('channel.goal.begin', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('channel.update', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('stream.online', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });
                await createEventSubSubscription('stream.offline', '1', {
                    broadcaster_user_id: _twitchBroadcasterId
                });

                break;
            case 'session_keepalive':
                break;
            case 'notification':
                handleEventSubNotification(message.payload.subscription.type, message.payload.event);
                break;
            case 'session_reconnect':
                console.log('[EventSub] Reconnect-Nachricht erhalten. Verbinde neu...');
                const reconnectUrl = message.payload.session.reconnect_url;
                if (reconnectUrl) {
                    eventSubWs.close();
                    eventSubWs = new WebSocket(reconnectUrl);
                } else {
                    console.error('[EventSub] Reconnect-URL fehlt in der Reconnect-Nachricht!');
                    eventSubWs.close(); // Verbindung schließen, um neuen connectToEventSub-Versuch zu triggern
                }
                break;
            case 'revocation':
                console.warn(`[EventSub] Subscription widerrufen: '${message.payload.subscription.type}'. Grund: ${message.payload.reason}`);
                activeSubscriptions.delete(message.payload.subscription.id);
                break;
            default:
                console.log(`[EventSub] Unbekannter Nachrichtentyp: '${message.metadata.message_type}'`, message);
        }
    };

    eventSubWs.onerror = error => {
        console.error('[EventSub] WebSocket Fehler:', error);
    };

    eventSubWs.onclose = async (event) => {
        console.log(`[EventSub] WebSocket Verbindung getrennt. Code: ${event.code}, Grund: ${event.reason}`);
        sessionId = null;
        if (!event.wasClean) {
            console.log('[EventSub] EventSub Verbindung unsauber getrennt. Versuche Neuverbindung in 5 Sekunden...');
            setTimeout(connectToEventSub, 5000);
        } else {
            console.log('[EventSub] EventSub Verbindung sauber getrennt.');
        }
    };
}

/**
 * Trennt die EventSub-WebSocket-Verbindung und löscht alle Abonnements.
 */
async function disconnectEventSub() {
    if (eventSubWs) {
        console.log('[EventSub] Trenne EventSub-WebSocket-Verbindung...');
        eventSubWs.close(1000, 'Shutdown initiated');
        eventSubWs = null;
    }
    await deleteAllEventSubSubscriptions(); // Diese Funktion wurde oben bereits korrigiert
    console.log('[EventSub] EventSub-Verbindung und Abonnements getrennt.');
}

/**
 * Verarbeitet eingehende EventSub-Benachrichtigungen und bereitet sie für das Frontend auf.
 *
 * @param {string} eventType - Der Typ des empfangenen Ereignisses (z.B. 'channel.follow').
 * @param {object} eventData - Die Daten des Ereignisses von Twitch.
 */
function handleEventSubNotification(eventType, eventData) {
    console.log(`[EventSub] Event-Notification empfangen: '${eventType}'`, eventData);

    let alertPayload = null;

    switch (eventType) {
        case 'channel.follow':
            alertPayload = {
                type: 'follow',
                username: eventData.user_name,
                user_id: eventData.user_id,
            };
            break;
        case 'channel.subscribe':
            alertPayload = {
                type: 'subscription',
                username: eventData.user_name,
                tier: eventData.tier, // z.B. 1000, 2000, 3000
                is_gift: eventData.is_gift,
                cumulative_months: eventData.cumulative_months || 0, // Gesamtmonate abonniert
                duration_months: eventData.duration_months || 0,
            };
            break;
        case 'channel.cheer':
            alertPayload = {
                type: 'cheer',
                username: eventData.user_name || 'Anonym',
                bits: eventData.bits,
                message: eventData.message,
            };
            break;
        case 'channel.raid':
            alertPayload = {
                type: 'raid',
                from_broadcaster_name: eventData.from_broadcaster_user_name,
                from_broadcaster_id: eventData.from_broadcaster_user_id,
                viewers: eventData.viewers,
                debugContent: eventData.debug_content || null,
            };
            break;
        case 'channel.hype_train.begin':
            alertPayload = {
                type: 'hype_train_begin',
                level: eventData.level,
                total: eventData.total,
            };
            break;
        case 'channel.channel_points_custom_reward_redemption.add':
            alertPayload = {
                type: 'channel_points_redemption',
                username: eventData.user_name,
                user_id: eventData.user_id,
                reward_title: eventData.reward.title,
                reward_cost: eventData.reward.cost,
                input: eventData.user_input || null,
            };
            break;
        case 'channel.goal.begin':
            alertPayload = {
                type: 'goal_begin',
                goal_type: eventData.goal_type,
                description: eventData.description,
                current_amount: eventData.current_amount,
                target_amount: eventData.target_amount,
            };
            break;
        case 'stream.online':
            if (streamStatusUpdateCallback) {
                streamStatusUpdateCallback(true, eventData);
            }
            break;

        case 'stream.offline':
            alertPayload = {
                type: 'stream_offline',
                broadcaster_user_name: eventData.broadcaster_user_name,
            };
            if (streamStatusUpdateCallback) {
                streamStatusUpdateCallback(false, eventData);
            }
            break;
        default:
            console.log(`[EventSub] Unbekannter oder unbehandelter Event-Typ: '${eventType}'`);
            break;
        case 'channel.update':
            // alertPayload = {
            //     type: 'channel_update',
            //     broadcaster_user_name: eventData.broadcaster_user_name,
            //     title: eventData.title,
            //     category_name: eventData.category_name,
            // };

            //do nothing
            break;
    }

    // Hinzugefügter Log, um zu bestätigen, dass ein Alert gesendet wird
    if (alertPayload) {
        console.log(`[Alerts] Sende Alert-Payload vom Typ '${alertPayload.type}' an Frontend.`);
        sendAlertToFrontend(alertPayload);
    }
}

module.exports = {
    initializeAlerts,
    connectToEventSub,
    disconnectEventSub,
};
