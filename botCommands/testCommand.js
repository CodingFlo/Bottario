async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Test schlug fehl Kappa");
}

module.exports = {
    explanation: "Befehl mit dem man den testen kann, ob der Bot auf Befehle reagiert oder ein Fehler vorliegt",
    moduleFunction: command
} 