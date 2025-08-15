async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Du willst die besten Clips von Chris sehen? Dann schau doch mal bei Chris seinem TikTok-Kanal vorbei :D https://www.tiktok.com/@christario_yt");
}

module.exports = {
    explanation: "Befehl mit dem man den Link direkt zu Chris' TikTok Kanal bekommt",
    moduleFunction: command
} 