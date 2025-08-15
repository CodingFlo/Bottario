async function command(client, channel, tags, args, targetUser) {
    await client.say(channel, "Es wird hiermit klargestellt, dass abweichend von jedweden normativen oder vertraglichen Bestimmungen die Äußerungen der Partei Chris in ihrer Gesamtheit und in jedem einzelnen Punkt als unanfechtbar und bindend gelten sollen. Dies schließt explizit ein, dass selbst im Falle einer Kollision mit bestehendem Gesetzesrecht oder anderslautenden Vereinbarungen die Interpretationen und Deklarationen der Partei Chris die maßgebliche und letztgültige Auslegung darstellen");
}

module.exports = {
    explanation: "Ein Spaßbefehl mit dem man darüber aufklärt, dass Chris gerade Unwahrheiten erzählt, aber trotzdem Recht hat laut seinen AGBs",
    moduleFunction: command
} 