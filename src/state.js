module.exports = {
  settings: {
    Whitelist: [],
    DiscordPrefixText: null,
    DiscordPrefix: false,
    WAGroupPrefix: false,
    UploadAttachments: true,
    Token: '',
    GuildID: '',
    Categories: [],
    ControlChannelID: '',
    LocalDownloads: false,
    LocalDownloadMessage: 'Downloaded a file larger than 8MB, check it out at {abs}',
    DownloadDir: './downloads',
    Publish: false,
    ChangeNotifications: false,
    autoSaveInterval: 5 * 60,
    lastMessageStorage: 500,
    oneWay: 0b11,
    redirectWebhooks: false,
  },
  dcClient: null,
  waClient: null,
  chats: {},
  contacts: {},
  startTime: 0,
  logger: null,
  lastMessages: null,
  /**
   * Stores WhatsApp message IDs that originate from Discord so that
   * they are not echoed back to Discord when received from WhatsApp.
   */
  sentMessages: new Set(),
  goccRuns: {},
};
