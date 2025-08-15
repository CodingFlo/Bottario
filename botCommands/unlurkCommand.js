async function command(client, channel, tags, args, targetUser) {
    const fromUser = tags.userInfo.displayName;
    var messageToSend = `@${fromUser} hat den Weg wieder aus der Lurk - Lobby gefunden! Willkommen zurück! :D`;
    await client.say(channel, messageToSend);
}


module.exports = {
    explanation: "Befehl mit dem man mitteilen kann, dass man nun nicht mehr lurkt",
    moduleFunction: command
} 