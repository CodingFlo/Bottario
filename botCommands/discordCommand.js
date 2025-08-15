async function command(client, channel, tags, args, targetUser) {
    var messageToSend = "Wenn du immer auf die aktuellsten Nachrichten bekommen. Wann ein Stream ist, dann komm auf meinem Discord: https://discord.gg/tYXXPb8cQb";
    await client.say(channel, messageToSend);
}

module.exports = {
    explanation: "Ein Befehl mit dem man den Link zu Chris seinem Discord-Server bekommt",
    moduleFunction: command
} 