// createCommandPage.js

const fs = require('fs');

/**
 * Erstellt eine statische HTML-Datei mit den Bot-Befehlen.
 *
 * @param {Array<Object>} commands - Ein Array von Objekten mit Befehlsdetails.
 * @param {string} commands[].name - Der vollständige Name des Befehls.
 * @param {string} commands[].shortcut - Das Kürzel des Befehls (z.B. !lurk).
 * @param {string} commands[].explanation - Ein Beispiel für die Ausgabe des Befehls.
 * @param {string} [filePath='index.html'] - Der optionale Dateipfad, in den die HTML-Datei geschrieben wird.
 */
function createCommandPage(commands, filePath = 'index.html') {
    let htmlContent = `
<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Twitch Chat-Befehle</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #181818; color: #ffffff; margin: 0; padding: 20px; display: flex; flex-direction: column; align-items: center; }
        h1 { color: #9146ff; margin-bottom: 20px; }
        table { width: 100%; max-width: 800px; border-collapse: collapse; background-color: #282828; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.5); }
        th, td { padding: 15px; text-align: left; border-bottom: 1px solid #444; }
        th { background-color: #333; color: #e0e0e0; font-weight: bold; }
        tr:hover { background-color: #383838; }
    </style>
</head>
<body>
    <h1>Twitch Bot-Befehle</h1>
    <table>
        <thead>
            <tr>
                <th>Befehl</th>
                <th>Kürzel</th>
                <th>Beschreibung</th>
            </tr>
        </thead>
        <tbody>
`;

    // Iteriere über das Array und fülle die Tabelle
    commands.forEach(cmd => {
        htmlContent += `
            <tr>
                <td>${cmd.name}</td>
                <td>${cmd.shortCut}</td>
                <td>${cmd.explanation}</td>
            </tr>`;
    });

    htmlContent += `
        </tbody>
    </table>
</body>
</html>
`;

    // Schreibe die Datei in den angegebenen oder standardmäßigen Dateipfad
    fs.writeFileSync(filePath, htmlContent);
    console.log(`Webseite wurde unter dem Pfad "${filePath}" erfolgreich generiert.`);
}

// Exportiere die Funktion, damit sie von anderen Dateien importiert werden kann
module.exports = { createCommandPage };