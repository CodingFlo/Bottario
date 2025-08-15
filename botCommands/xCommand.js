async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Du willst täglich eine Erinnerung auf X/Twitter haben, wenn Chris ein neues Video hochgeladen hat? Dannn schau doch mal hier vorbei https://x.com/Tristendo2");
}

module.exports = {
    explanation: "Befehl mit dem man den Link direkt zu Chris' X/Twitter Kanal bekommt",
    moduleFunction: command
} 