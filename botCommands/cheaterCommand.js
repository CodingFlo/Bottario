async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Christario cheatet?! typisch");
}

module.exports = {
    explanation: "Ein Spaßbefehl mit dem man Chris darüber aufmerksam macht, dass er cheatet",
    moduleFunction: command
} 