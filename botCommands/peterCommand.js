async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Solltest du Peter heißen, heißt es nicht das Chris gegen dich etwas hat. Chris mag nur das Wort Peter sehr gern und deswegen schreit er oft. Klingt komisch, aber ist so. Chris ist manchmal weird, aber lustig :)");
}

module.exports = {
    explanation: "Ein Spaßbefehl mit dem aufgeklärt wird, warum Chris oft Peter schreit oder es nicht böse gemeint ist",
    moduleFunction: command
} 