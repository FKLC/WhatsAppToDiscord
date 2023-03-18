const bidirectionalMapWithCapacity = (capacity) => {
  const keys = [];
  return new Proxy(
    {},
    {
      set(target, prop, newVal) {
        keys.push(prop, newVal);
        if (keys.length > capacity) {
          delete target[keys.shift()];
          delete target[keys.shift()];
        }
        target[prop] = newVal;
        target[newVal] = prop;
        return true;
      },
    },
  );
};

module.exports = {
  settings: {
    Whitelist: [],
    DiscordPrefix: false,
    WAGroupPrefix: false,
    UploadAttachments: true,
    Token: '',
    GuildID: '',
    Categories: [],
    ControlChannelID: '',
  },
  dcClient: null,
  waClient: null,
  chats: {},
  contacts: {},
  startTime: Math.round(Date.now() / 1000),
  logger: null,
  lastMessages: bidirectionalMapWithCapacity(1000),
  goccRuns: {},
};
