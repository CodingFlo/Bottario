async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Willst du mehr von mir sehen dann schau bei Youtube vorbei: https://www.youtube.com/@Christario/featured");
}

module.exports = {
    explanation: "Befehl mit dem man den Link direkt zu Chris' YouTube Kanal bekommt",
    moduleFunction: command
} 