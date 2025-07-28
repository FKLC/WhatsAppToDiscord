const pino =  require('pino');

const discordHandler =  require('./discordHandler.js');
const state =  require('./state.js');
const utils =  require('./utils.js');
const storage = require('./storage.js');
const whatsappHandler =  require('./whatsappHandler.js');

(async () => {
  const version = 'v0.10.29';
  state.logger = pino({ mixin() { return { version }; } }, pino.destination('logs.txt'));
  let autoSaver = setInterval(() => storage.save(), 5 * 60 * 1000);
  ['SIGINT', 'uncaughtException', 'SIGTERM'].forEach((eventName) => process.on(eventName, async (err) => {
    clearInterval(autoSaver);
    state.logger.error(err);
    state.logger.info('Exiting!');
    if (['SIGINT', 'SIGTERM'].includes(err)) {
      await storage.save();
    }
    process.exit();
  }));

  state.logger.info('Starting');

  await utils.updater.run(version);
  state.logger.info('Update checked.');

  const conversion = await utils.sqliteToJson.convert();
  if (!conversion) {
    state.logger.error('Conversion failed!');
    process.exit(1);
  }
  state.logger.info('Conversion completed.');

  state.settings = await storage.parseSettings();
  state.logger.info('Loaded settings.');

  clearInterval(autoSaver);
  autoSaver = setInterval(() => storage.save(), state.settings.autoSaveInterval * 1000);
  state.logger.info('Changed auto save interval.');

  state.contacts = await storage.parseContacts();
  state.logger.info('Loaded contacts.');

  state.chats = await storage.parseChats();
  state.logger.info('Loaded chats.');

  state.lastMessages = await storage.parseLastMessages();
  state.logger.info('Loaded last messages.');

  state.dcClient = await discordHandler.start();
  state.logger.info('Discord client started.');

  await utils.discord.repairChannels();
  await discordHandler.setControlChannel();
  state.logger.info('Repaired channels.');

  await whatsappHandler.start();
  state.logger.info('WhatsApp client started.');

  console.log('Bot is now running. Press CTRL-C to exit.');
})();
