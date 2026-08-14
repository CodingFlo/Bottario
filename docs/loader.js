(function () {
    const botName = "tariobot"

    // 1. Verschleierte Basis-Konfiguration für den Heimserver (für Inhalte/Assets)
    const _parts = [
        "https",
        "://" + "chaos7",
        ".ddns" + ".net:3000",
        `/${botName}` + "/websites/"
    ];
    const baseUrl = _parts.join('');

    // **Dynamische GitHub-Basis:** Leitet sich automatisch vom Repo-Namen ("codingflo") und "TarioBot" ab, 
    // passt sich aber an, falls du den Bot-Namen (`botName`) änderst.
    const githubBaseUrl = `https://codingflo.github.io/TarioBot/`;

    // 2. Automatische Erkennung des aktuellen Dateinamens
    const currentFileName = window.location.pathname.split('/').pop() || "index.html";

    const targetUrl = baseUrl + currentFileName;

    async function launch() {
        try {
            const response = await fetch(targetUrl);

            if (!response.ok) {
                throw new Error(`Server antwortet mit Status ${response.status}`);
            }

            const htmlContent = await response.text();

            // DOM vorbereiten
            const parser = new DOMParser();
            const remoteDoc = parser.parseFromString(htmlContent, 'text/html');

            // 3. Zentrale Pfad-Korrektur für alle Ressourcen und Links
            const fixPaths = (selector, attr) => {
                remoteDoc.querySelectorAll(selector).forEach(el => {
                    const val = el.getAttribute(attr);
                    if (!val || /^(https?:|data:|#|\/\/)/.test(val)) return;

                    // Speziell für Anker-Links (<a>), die auf deinen Heimserver zeigen oder relativ sind
                    if (selector === 'a') {
                        const fileName = val.split('/').pop();
                        // Leitet absolut auf deine GitHub Pages URL um
                        el.setAttribute('href', githubBaseUrl + fileName);
                    }
                    // Für alle anderen Assets (CSS, JS, Bilder etc.) -> Heimserver beibehalten
                    else {
                        el.setAttribute(attr, new URL(val, baseUrl).href);
                    }
                });
            };

            fixPaths('link', 'href');
            fixPaths('script', 'src');
            fixPaths('img', 'src');
            fixPaths('source', 'src');
            fixPaths('a', 'href');

            // 4. Seite komplett ersetzen
            document.open();
            document.write(remoteDoc.documentElement.outerHTML);
            document.close();

        } catch (err) {
            console.error("Loader Error:", err);
            document.body.innerHTML = `
                <div style="text-align:center; font-family:sans-serif; color:#555; padding-top:20vh;">
                    <h2 style="color:#09f;">Inhalt konnte nicht geladen werden</h2>
                    <p>${currentFileName} auf dem Remote-Server nicht erreichbar.</p>
                </div>`;
        }
    }

    launch();
})();