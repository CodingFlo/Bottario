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

    // GitHub-Konfiguration für die Weiterleitung von Links (Anchor-Hrefs)
    // Passe diesen Teil an deinen GitHub-Benutzername und Repository-Namen an (z.B. GitHub Pages oder direkte Repo-Links)
    const githubBaseUrl = "https://DEIN-BENUTZERNAME.github.io/DEIN-REPO/";
    // Alternativ, falls es direkt auf die Dateiliste oder den Code im Repo zeigen soll:
    // const githubBaseUrl = "https://github.com/DEIN-BENUTZERNAME/DEIN-REPO/blob/main/";

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

            // 3. Asset-Pfad-Korrektur für Ressourcen (CSS, JS, Bilder etc.) -> bleiben auf dem Heimserver
            const fixPaths = (selector, attr) => {
                remoteDoc.querySelectorAll(selector).forEach(el => {
                    const val = el.getAttribute(attr);
                    if (!val || /^(https?:|data:|#|\/\/)/.test(val)) return;

                    // Falls es ein Link (a) ist und auf den Heimserver zeigt
                    if (selector === 'a' && val.includes("chaos7.ddns.net")) {
                        // Extrahiere den Dateinamen aus dem alten Pfad
                        const fileName = val.split('/').pop();
                        // Leite auf GitHub um (Passe die URL unten an!)
                        el.setAttribute('href', "https://codingflo.github.io/TarioBot/" + fileName);
                    }
                    // Für alle anderen Assets (CSS, JS, Bilder) -> Heimserver beibehalten
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

            // Spezielle Pfad-Korrektur für Anchor-Hrefs -> leiten auf GitHub um
            remoteDoc.querySelectorAll('a').forEach(el => {
                const val = el.getAttribute('href');
                if (val && !/^(https?:|data:|#|\/\/)/.test(val)) {
                    // Relative Links auf der geladenen Seite zeigen nun auf GitHub
                    el.setAttribute('href', new URL(val, githubBaseUrl).href);
                }
            });

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