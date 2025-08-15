async function command(client, channel, tags, args, targetUser) {
    const fromUser = tags.userInfo.displayName;
    var messageToSend = `@${fromUser} Vielen Dank für reinschauen. Dann wünsche ich dir viel spaß in der Lurklobby. :D`;
    await client.say(channel, messageToSend);
}

module.exports = {
    explanation: "Ein Befehl mit dem man Chris mitteilen kann, dass man in den Lurk-Modus wechselt",
    moduleFunction: command
} 