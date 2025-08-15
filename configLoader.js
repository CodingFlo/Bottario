// configLoader.js

require('dotenv').config(); // Dies MUSS hier oben stehen, um .env zu laden!

const path = require('path');
const fs = require('fs');

const CONFIG_FILE = path.join(__dirname, 'config.json');

// Getrennte Konfigurationsvariablen
let envConfig = {};
let fileConfig = {};

function loadConfigs() {
    console.log('\n[ConfigLoader] --- STARTE KONFIGURATIONSLADUNG (Getrennte Variablen) ---');

    try {
        // 1. Umgebungsvariablen aus .env laden
        console.log('[ConfigLoader] - Lese Werte direkt aus process.env (.env-Datei)...');
        envConfig = {
            TWITCH_APP_CLIENT_ID: process.env.TWITCH_APP_CLIENT_ID || null,
            TWITCH_APP_CLIENT_SECRET: process.env.TWITCH_APP_CLIENT_SECRET || null,
            TWITCH_APP_REDIRECT_URI: process.env.TWITCH_APP_REDIRECT_URI || null,
            TWITCH_BOT_CLIENT_ID: process.env.TWITCH_BOT_CLIENT_ID || null,
            TWITCH_BOT_CLIENT_SECRET: process.env.TWITCH_BOT_CLIENT_SECRET || null,
            TWITCH_BOT_REDIRECT_URI: process.env.TWITCH_BOT_REDIRECT_URI || null,
            TWITCH_BOT_CHANNEL: process.env.TWITCH_BOT_CHANNEL || null,
            BOT_COMMAND_PREFIX: process.env.BOT_COMMAND_PREFIX || null,
            PORT: parseInt(process.env.PORT) || 8080, // Port als Zahl parsen
        };

        // 2. config.json laden (für persistente, nicht-sensible Einstellungen und Tokens)
        console.log('[ConfigLoader] - Lese Werte aus config.json...');
        if (fs.existsSync(CONFIG_FILE)) {
            const fileContent = fs.readFileSync(CONFIG_FILE, 'utf8');
            fileConfig = JSON.parse(fileContent);
            console.log('[ConfigLoader] Konfiguration aus config.json erfolgreich geladen.');
        } else {
            console.warn('[ConfigLoader] config.json nicht gefunden. Eine leere Datei wird erstellt.');
            fs.writeFileSync(CONFIG_FILE, JSON.stringify({}, null, 2), 'utf8');
            fileConfig = {}; // Sicherstellen, dass fileConfig leer ist
        }

    } catch (error) {
        console.error('[ConfigLoader] Schwerwiegender Fehler beim Laden der Konfiguration:', error);
    }
    console.log('[ConfigLoader] --- KONFIGURATIONSLADUNG BEENDET ---');
}

/**
 * Ruft die Konfiguration aus der .env-Datei ab.
 * Enthält typischerweise sensible Schlüssel und Umgebungseinstellungen.
 * @returns {object} Ein Objekt mit den aus .env geladenen Werten.
 */
function getEnvConfig() {
    // Lade, falls noch nicht geschehen (sollte am Modul-Start geschehen sein)
    if (Object.keys(envConfig).length === 0) {
        loadConfigs();
    }
    return envConfig;
}

/**
 * Ruft die Konfiguration aus der config.json-Datei ab.
 * Enthält typischerweise persistente Tokens und dynamische Einstellungen.
 * @returns {object} Ein Objekt mit den aus config.json geladenen Werten.
 */
function getFileConfig() {
    // Lade, falls noch nicht geschehen (sollte am Modul-Start geschehen sein)
    if (Object.keys(fileConfig).length === 0) {
        loadConfigs();
    }
    return fileConfig;
}

/**
 * Aktualisiert und speichert bestimmte Werte in der config.json.
 * Nur Werte, die in config.json gespeichert werden sollen, sollten hiermit aktualisiert werden.
 * @param {object} newValues - Ein Objekt mit den zu aktualisierenden Schlüssel-Wert-Paaren.
 */
function updateFileConfig(newValues) {
    Object.assign(fileConfig, newValues); // Überschreibt bestehende Werte in fileConfig
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(fileConfig, null, 2), 'utf8');
        console.log('[ConfigLoader] config.json erfolgreich aktualisiert und gespeichert.');
    } catch (error) {
        console.error('[ConfigLoader] Fehler beim Speichern der config.json:', error);
    }
}

// Initialisiere die Konfigurationen direkt beim Laden des Moduls
loadConfigs();

module.exports = {
    getEnvConfig,
    getFileConfig,
    updateFileConfig
};