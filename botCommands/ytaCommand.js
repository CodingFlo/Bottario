async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Du siehst gerne Anno und Chris? Dann schau mal hier vorbei :D https://www.youtube.com/channel/UC1TAF8jkoSUdsAIHdaE_IcQ");
}

module.exports = {
    explanation: "Befehl mit dem man den Link direkt zu Chris seinen Anno Kanal bekommt",
    moduleFunction: command
} 