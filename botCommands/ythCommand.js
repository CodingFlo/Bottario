async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Willst du mehr Horror von Chris sehen dann schau mal bei seinem Horror-YT-Kanal vorbei: https://www.youtube.com/channel/UC1dYSMCfMKWD7lNVz7I1_kQ");
}

module.exports = {
    explanation: "Befehl mit dem man den Link direkt zu Chris seinen Horror YouTube Kanal bekommt",
    moduleFunction: command
} 