const canvas = document.getElementById('background-canvas');
const ctx = canvas.getContext('2d');
let particles = [];

// Maximal-Speed-Limit
const MAX_SPEED = 0.15; // <--- leicht anpassbar für schnelle Displays

// CSS-Variablen aus :root
function getCSSVariable(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

const particleColor = getCSSVariable('--canvas-color');

class Particle {
    constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.size = Math.random() * 2.5 + 1;
        this.speedX = (Math.random() * MAX_SPEED * 2) - MAX_SPEED;
        this.speedY = (Math.random() * MAX_SPEED * 2) - MAX_SPEED;
        this.color = particleColor;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.x < 0 || this.x > canvas.width) this.speedX = -this.speedX;
        if (this.y < 0 || this.y > canvas.height) this.speedY = -this.speedY;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    createParticles(); // Partikelanzahl an neue Canvas-Größe anpassen
}

function createParticles() {
    particles = [];
    const numberOfParticles = (canvas.width * canvas.height) / 9000;
    for (let i = 0; i < numberOfParticles; i++) {
        particles.push(new Particle());
    }
}

function backgroundAnimation() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let a = 0; a < particles.length; a++) {
        for (let b = a + 1; b < particles.length; b++) {
            const dx = particles[a].x - particles[b].x;
            const dy = particles[a].y - particles[b].y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < 120) {
                const colorA = hexToRgb(particles[a].color);
                const colorB = hexToRgb(particles[b].color);
                const r = Math.round((colorA.r + colorB.r) / 2);
                const g = Math.round((colorA.g + colorB.g) / 2);
                const bColor = Math.round((colorA.b + colorB.b) / 2);
                const alpha = 1 - distance / 120;

                ctx.beginPath();
                ctx.strokeStyle = `rgba(${r}, ${g}, ${bColor}, ${alpha})`;
                ctx.lineWidth = 1;
                ctx.moveTo(particles[a].x, particles[a].y);
                ctx.lineTo(particles[b].x, particles[b].y);
                ctx.stroke();
            }
        }
    }

    particles.forEach(p => {
        p.update();
        p.draw();
    });

    requestAnimationFrame(backgroundAnimation);
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    const bigint = parseInt(hex, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
}

window.addEventListener('resize', resizeCanvas);

// Initialisierung
function applyFadeIn() {
    // Kurze Verzögerung von 50ms, um sicherzustellen, dass das Canvas im DOM initialisiert ist.
    setTimeout(() => {
        canvas.classList.add('canvas-loaded');
    }, 50);
}

// Initialisierung
resizeCanvas();
backgroundAnimation();

// Rufe die Einblendungsfunktion nach dem Start der Animation auf.
applyFadeIn();

/* ==========================================================
* Funktion: Dynamische Erscheinungs-Animation
* ==========================================================
* Diese Funktion weist allen relevanten Elementen (z.B. .info-card, .divider)
* im .content-container einen inkrementellen, d.h. dynamischen, 
* "animation-delay" zu.
*/
function applySequentialAnimations() {
    // 1. Definiere die Basisverzögerungen und den Inkrement
    const baseDelay = 0.1; // Startverzögerung in Sekunden für das erste Content-Element
    const increment = 0.25; // Inkrementelle Verzögerung pro Element
    let currentDelay = baseDelay;

    // 2. Wähle alle animierbaren Elemente aus
    // WICHTIG: Verwende 'content-container > *' um nur die direkten Kinder 
    // des Containers zu erwischen, damit verschachtelte Elemente ignoriert werden.
    const animatableElements = document.querySelectorAll('.content-container > .info-card, .content-container > .divider');

    // 3. Optional: Verzögerung für die Kopfzeilen-Elemente (falls noch nicht gesetzt)
    // Wenn die Kopfzeilen-Elemente schon manuelle Delays haben, kann dieser Block ignoriert werden.
    // Falls du die dynamische Verzögerung auch auf die Kopfzeile anwenden möchtest:
    const headerElements = document.querySelectorAll('.header-container .profile-pic, .header-container h1');
    headerElements.forEach(el => {
        // Setze eine sehr kurze Verzögerung für die Kopfzeile
        el.style.animationDelay = '0.2s';
    });

    // 4. Gehe alle Content-Elemente durch und setze den Delay
    let previousElementWasDivider = false;

    animatableElements.forEach(element => {
        // Überprüfe, ob das aktuelle Element eine Trennlinie ist
        const isDivider = element.classList.contains('divider');

        // Regel für Trennlinien: Sie sollen GLEICHZEITIG mit dem darauf folgenden Element erscheinen.
        // Das bedeutet, sie verwenden den DELAY des *nächsten* Elements.
        // Da wir das nächste Element noch nicht kennen, wenden wir die Regel anders an:
        // Ein DIVIDER erhält den DELAY des VORHERIGEN Elements, da der DIVIDER im DOM VOR dem Element steht, 
        // mit dem er gleichzeitig erscheinen soll (aus der Perspektive des Users).
        // Wir verwenden dafür den Delay, der für das VORHERIGE info-card-Element berechnet wurde.

        if (isDivider) {
            // Eine Trennlinie verwendet den aktuellen "currentDelay" (der gerade für die vorherige info-card berechnet wurde).
            // WICHTIG: Wir inkrementieren 'currentDelay' NICHT für einen Divider, da das nächste info-card Element 
            // den gleichen Delay-Wert erhalten soll, um gleichzeitig zu erscheinen.
            element.style.animationDelay = `${currentDelay}s`;

            // Setze ein Flag, damit das nächste Element (die Info-Card) NICHT inkrementiert
            // und den gleichen Delay erhält.
            previousElementWasDivider = true;

        } else {
            // Ist das Element eine Info-Card?

            if (previousElementWasDivider) {
                // Wenn das vorherige Element ein Divider war, verwende den GLEICHEN currentDelay
                element.style.animationDelay = `${currentDelay}s`;

                // Setze Flag zurück und erhöhe den Delay FÜR DAS NÄCHSTE ELEMENT
                currentDelay += increment;
                previousElementWasDivider = false;

            } else {
                // Normaler Fall: Keine Trennlinie davor.
                // Verwende den aktuellen Delay und erhöhe ihn für das nächste Element.
                element.style.animationDelay = `${currentDelay}s`;
                currentDelay += increment;
            }
        }
    });
}