const getGuild = async () => module.exports.dcClient.guilds.fetch(module.exports.settings.GuildID).catch(() => null);
const getCategory = async () => module.exports.dcClient.channels.fetch(module.exports.settings.CategoryID).catch(() => null);
const getControlChannel = async () => module.exports.dcClient.channels.fetch(module.exports.settings.ControlChannelID).catch(() => null);

module.exports = {
  settings: {},
  dcClient: null,
  waClient: null,
  chats: {},
  contacts: {},
  startTime: Math.round(Date.now() / 1000),
  profilePicsCache: {},
  logger: null,
  lastMessages: (() => {
    const messageIds = [];
    return new Proxy(
      {},
      {
        set(target, prop, newVal) {
          messageIds.push(prop);
          if (messageIds.length > 100) {
            delete module.exports.lastMessages[messageIds.shift()];
          }
          // eslint-disable-next-line no-param-reassign
          target[prop] = newVal;
        },
      },
    );
  })(),

  getGuild,
  getCategory,
  getControlChannel,
};
