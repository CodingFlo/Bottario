async function command(client, channel, tags, args, targetUser) {
    var messageToSend = "Der Switch Freundescode von Christario: 6694 2510 3713";
    await client.say(channel, messageToSend);
}

module.exports = {
    explanation: "Ein Befehl mit dem man den Switch Freundescode von Chris bekommt",
    moduleFunction: command
} 