const shuffleArray = require('./shuffleArray');

let _min_messages = null;
let timerIntervalId = null;
let _message_min_interval_seconds = null;

let lastTimerSentTime = 0;
let currentTimerMessageIndex = 0;
let messageCountSinceLastTimer = 0;

let timerMessages = [
    "Hier könnte Chris seine Werbung stehen, aber doch tut sie das noch nicht! Aber über ein Follow und ein Abo würde er sich dennoch freuen! :D",
];

// --- Timer Nachrichten Funktion ---
async function checkAndSendTimerMessage(client, channel) {
    if (timerMessages.length === 0) {
        return;
    }

    const currentTime = Date.now();
    const timeSinceLastTimer = (currentTime - lastTimerSentTime) / 1000;

    if (messageCountSinceLastTimer >= _min_messages && timeSinceLastTimer >= _message_min_interval_seconds) {
        const message = timerMessages[currentTimerMessageIndex];
        await client.say(channel, message);
        console.log(`[Bot][Timer] Timer-Nachricht gesendet: "${message}"`);

        currentTimerMessageIndex = (currentTimerMessageIndex + 1) % timerMessages.length;
        messageCountSinceLastTimer = 0;
        lastTimerSentTime = currentTime;
    }
}

async function startTimeMessageSending(twitchClient, currentTwitchChannel, check_interval_seconds = 30, min_messages = 30, message_min_interval_seconds = 30 * 60) {
    timerMessages = shuffleArray(timerMessages);
    console.warn(`[Bot][Timer] Timer-Nachrichten gestartet mit ${timerMessages.length} Nachrichten.`);

    _min_messages = min_messages;
    _message_min_interval_seconds = message_min_interval_seconds;

    if (!timerIntervalId) {
        lastTimerSentTime = Date.now();
        timerIntervalId = setInterval(() => {
            checkAndSendTimerMessage(twitchClient, currentTwitchChannel);
        }, check_interval_seconds * 1000);
        console.log(`[Bot][Timer] Timer-Prüfung alle ${check_interval_seconds} Sekunden gestartet.`);
    }
}

/**
 * Stoppt das Senden der Timer-Nachrichten.
 */
async function closeTimerMessageSending() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        console.log(`[Bot][Timer] Timer-Nachrichten gestoppt (ID: ${timerIntervalId}).`);
        timerIntervalId = null; // Setze die ID zurück, damit der Timer bei Bedarf neu gestartet werden kann
    } else {
        console.log(`[Bot][Timer] Es war kein aktiver Timer zum Stoppen vorhanden.`);
    }
}

module.exports = {
    closeTimerMessageSending,
    startTimeMessageSending,
    increaseMessageCount: function (additionalCount = 1) {
        messageCountSinceLastTimer += additionalCount;
    }
}