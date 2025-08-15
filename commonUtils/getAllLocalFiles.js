// getAllLocalFiles.js

// Correctly import the promises-based 'fs' module and the 'path' module
// We assign the entire 'promises' object from 'fs' to 'fsPromises'
const fsPromises = require('fs').promises;
// We assign the entire 'path' module object to 'path'
const path = require('path');

/**
 * Durchsucht einen lokalen Ordner und gibt eine Liste aller
 * Dateipfade (absolute Pfade) zurück, die bestimmte Dateierweiterungen haben.
 *
 * @param {string} directoryPath Der absolute oder relative Pfad zu dem Ordner, der die Dateien enthält.
 * @param {string[]} extensions Ein Array von Dateierweiterungen (z.B. ['.js', '.json']).
 * Sollte mit einem Punkt beginnen.
 * @returns {Promise<string[]>} Ein Promise, das ein Array von Strings (Dateipfaden) auflöst.
 */
async function getAllLocalFiles(directoryPath, extensions) {
    const foundFilePaths = [];

    // Optional: Überprüfen, ob extensions ein Array ist und ob es Werte enthält
    if (!Array.isArray(extensions) || extensions.length === 0) {
        console.warn("[WARN] 'extensions' Parameter ist leer oder kein Array. Es werden keine Dateien gefiltert.");
        return [];
    }

    // Optional: Normalisiere die Erweiterungen, falls der Punkt fehlt
    const normalizedExtensions = extensions.map(ext => ext.startsWith('.') ? ext : `.${ext}`);

    try {
        // Lese alle Einträge im Verzeichnis
        // CORRECT: Call readdir as a method on the fsPromises object
        const files = await fsPromises.readdir(directoryPath);

        for (const file of files) {
            // Überprüfe, ob die Datei eine der gewünschten Erweiterungen hat
            const fileExtension = '.' + file.split('.').pop(); // Extrahiere die Dateierweiterung inkl. Punkt

            if (normalizedExtensions.includes(fileExtension)) {
                // Erstelle den vollständigen Pfad zur Datei
                // CORRECT: Call join as a method on the path object
                const fullPath = path.join(directoryPath, file);
                foundFilePaths.push(fullPath);
            }
        }
    } catch (error) {
        // More specific error message for directory not found
        if (error.code === 'ENOENT') {
            console.error(`[ERROR] Verzeichnis nicht gefunden: '${directoryPath}'`);
        } else {
            console.error(`[ERROR] Fehler beim Lesen des Verzeichnisses '${directoryPath}':`, error);
        }
        return [];
    }

    return foundFilePaths;
}

// Export the function as the default export of this module for CommonJS
module.exports = getAllLocalFiles;