const pino = require('pino');
const storage = require('./storage_manager');
const utils = require('./utils');
const discordManager = require('./discord_manager');
const whatsappManager = require('./whatsapp_manager');
const state = require('./state');
const discordUtils = require('./discord_utils');

(async () => {
  state.logger = pino(pino.destination('logs.txt'));
  process.on('uncaughtException', (err) => {
    state.logger.error(err);
  });

  state.logger.info('Starting');

  await utils.checkVersion('v0.7.5');
  state.logger.info('Update checked.');

  await storage.initializeDB();
  state.logger.info('Initialized database.');

  state.settings = await utils.parseSettings();
  state.logger.info('Loaded settings.');

  state.contacts = await utils.parseContacts();
  state.logger.info('Loaded contacts.');

  state.chats = await utils.parseChats();
  state.logger.info('Loaded chats.');

  state.dcClient = await discordManager.start();
  state.logger.info('Discord client started.');

  await discordUtils.repairChannels();
  await discordManager.updateControlChannel();
  state.logger.info('Repaired channels.');

  await whatsappManager.start();
  state.logger.info('WhatsApp client started.');

  console.log('Bot is now running. Press CTRL-C to exit.');

  ['exit', 'SIGINT', 'SIGUSR1', 'SIGUSR2', 'uncaughtException', 'SIGTERM'].forEach((eventName) => process.on(eventName, async () => {
    state.logger.info('Exiting!');
    await utils.save();
    process.exit();
  }));
})();
