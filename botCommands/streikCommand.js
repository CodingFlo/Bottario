async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Du gehst streiken? Dann möge dein Streik voller Erfolg und Spaß sein ^^");
}

module.exports = {
    explanation: "Ein Spaßbefehl, der ein Zeichen setzt",
    moduleFunction: command
} 