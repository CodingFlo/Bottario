async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Chris hat zwar kein Onlyfans, aber dafür einen erregend guten Server :) https://discord.gg/tYXXPb8cQb");
}

module.exports = {
    explanation: "Ein Spaßbefehl mit dem man den Link zu Chris seinem Discord-Server bekommt",
    moduleFunction: command
} 