// botCommands/utils/isMod.js
function isMod(tags) {
    return tags.isMod || tags.isBroadcaster;
}
module.exports = isMod;