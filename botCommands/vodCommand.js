async function command(client, channel, tags, args, targetUser) {
    var messageToSend = "Du hast einen Stream verpasst? Dann kannst du diesen Stream hier nachsehen! :D https://www.youtube.com/@StreamArchivtario";
    await client.say(channel, messageToSend);
}

module.exports = {
    explanation: "Befehl mit dem man den Link direkt zu Chris' VOD Kanal bekommt",
    moduleFunction: command
} 