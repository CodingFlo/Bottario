const streamsBets = [
    "24h Stream durch Mario Party (2 mal 12h Stream)",
    "10h Steinstream (wurde geändert zu einem 2 mal 12h Stream)",
    "24h Stream durch Smash Bros (2 mal 12h Stream)",
];

// Funktion, die den Streamplan rendert
function renderStreamBets() {
    const container = document.getElementById('schedule-container');
    container.innerHTML = ''; // Container leeren, um Duplikate zu vermeiden

    if (streamsBets.length == 0) {
        entryDiv.innerHTML = `
                    <span class="schedule-day">Keine offene Streamwette</span>
                `;
        container.appendChild(entryDiv);
        return;
    }

    streamsBets.forEach(entry => {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'schedule-entry';
        entryDiv.innerHTML = `
                    <span class="schedule-day">${entry}</span>
                `;
        container.appendChild(entryDiv);
    });
}

// Führe die Funktion aus, nachdem das DOM geladen wurde.
document.addEventListener('DOMContentLoaded', _ => { applySequentialAnimations() });

// Startet die Animation und das Rendering, wenn die Seite geladen ist
document.addEventListener('DOMContentLoaded', () => {
    resizeCanvas(); // Ruft die Größenanpassung auf
    backgroundAnimation(); // Startet die Hintergrundanimation

    renderStreamBets(); // Rendert die Streamwetten
});        