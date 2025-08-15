/**
 * Formatiert ein Array von Strings zu einer natürlichsprachigen Liste (z.B. "A, B und C").
 * @param {string[]} items Das Array von Strings, das formatiert werden soll.
 * @returns {string} Die formatierte Liste.
 */
function formatListNaturally(items) {
    if (!items || items.length === 0) {
        return "";
    }
    if (items.length === 1) {
        return items[0];
    }
    if (items.length === 2) {
        return `${items[0]} und ${items[1]}`;
    }
    const lastItem = items[items.length - 1];
    const otherItems = items.slice(0, items.length - 1);
    return `${otherItems.join(`, `)} und ${lastItem} `;
}

module.exports = formatListNaturally;