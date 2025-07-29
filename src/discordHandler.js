const { Client, Intents } = require('discord.js');

const state = require('./state.js');
const utils = require('./utils.js');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
    Intents.FLAGS.MESSAGE_CONTENT,
  ],
});
let controlChannel;

const setControlChannel = async () => {
  controlChannel = await client.channels.fetch(state.settings.ControlChannelID).catch(() => null);
};

client.on('ready', async () => {
  await setControlChannel();
});

client.on('channelDelete', async (channel) => {
  const jid = utils.discord.channelIdToJid(channel.id);
  delete state.chats[jid];
  delete state.goccRuns[jid];
  state.settings.Categories = state.settings.Categories.filter((id) => channel.id !== id);
});

client.on('whatsappMessage', async (message) => {
  if ((state.settings.oneWay >> 0 & 1) === 0) {
    return;
  }
  
  let msgContent = '';
  const files = [];
  const webhook = await utils.discord.getOrCreateChannel(message.channelJid);

  if (message.isGroup && state.settings.WAGroupPrefix) { msgContent += `[${message.name}] `; }

  if (message.isForwarded) {
    msgContent += `forwarded message:\n${message.content.split('\n').join('\n> ')}`;
  }
  else if (message.quote) {
    msgContent += `> ${message.quote.name}: ${message.quote.content.split('\n').join('\n> ')}\n${message.content}`;
  }
  else if (message.isEdit) {
    msgContent += "Edited message:\n" + message.content;
  }
  else {
    msgContent += message.content;
  }

  if (message.file) {
    if (message.file.largeFile && state.settings.LocalDownloads) {
      msgContent += await utils.discord.downloadLargeFile(message.file);
    }
    else if (message.file === -1 && !state.settings.LocalDownloads) {
      msgContent += "WA2DC Attention: Received a file, but it's over 8MB. Check WhatsApp on your phone or enable local downloads.";
    } else {
      files.push(message.file);
    }
  }

  if (msgContent || files.length) {
    msgContent = utils.discord.partitionText(msgContent);
    while (msgContent.length > 1) {
      // eslint-disable-next-line no-await-in-loop
      await utils.discord.safeWebhookSend(webhook, {
        content: msgContent.shift(),
        username: message.name,
        avatarURL: message.profilePic,
      }, message.channelJid);
    }
    const dcMessage = await utils.discord.safeWebhookSend(webhook, {
      content: msgContent.shift() || null,
      username: message.name,
      files,
      avatarURL: message.profilePic,
    }, message.channelJid);
    if (dcMessage.channel.type === 'GUILD_NEWS' && state.settings.Publish) {
      await dcMessage.crosspost();
    }

    if (message.id != null)
      state.lastMessages[dcMessage.id] = message.id;
  }
});

client.on('whatsappReaction', async (reaction) => {
  if ((state.settings.oneWay >> 0 & 1) === 0) {
    return;
  }

  const channelId = state.chats[reaction.jid]?.channelId;
  const messageId = state.lastMessages[reaction.id];
  if (channelId == null || messageId == null) { return; }

  const channel = await utils.discord.getChannel(channelId);
  const message = await channel.messages.fetch(messageId);
  await message.react(reaction.text).catch(async err => {
    if (err.code === 10014) {
      await channel.send(`Unknown emoji reaction (${reaction.text}) received. Check WhatsApp app to see it.`);
    }
  });
});

client.on('whatsappCall', async ({ call, jid }) => {
  if ((state.settings.oneWay >> 0 & 1) === 0) {
    return;
  }
  
  const webhook = await utils.discord.getOrCreateChannel(jid);

  const name = utils.whatsapp.jidToName(jid);
  const callType = call.isVideo ? 'video' : 'voice';
  let content = '';

  switch (call.status) {
    case 'offer':
      content = `${name} is ${callType} calling you! Check your phone to respond.`
      break;
    case 'timeout':
      content = `Missed a ${callType} call from ${name}!`
      break;
  }

  if (content !== '') {
    await webhook.send({
      content,
      username: name,
      avatarURL: await utils.whatsapp.getProfilePic(call),
    });
  }
});

const commands = {
  async ping(message) {
    controlChannel.send(`Pong ${Date.now() - message.createdTimestamp}ms!`);
  },
  async pairwithcode(_message, params) {
    if (params.length !== 1) {
      await controlChannel.send('Please enter your number. Usage: `pairWithCode <number>`. Don\'t use "+" or any other special characters.');
      return;
    }

    const code = await state.waClient.requestPairingCode(params[0]);
    await controlChannel.send(`Your pairing code is: ${code}`);
  },
  async start(_message, params) {
    if (!params.length) {
      await controlChannel.send('Please enter a phone number or name. Usage: `start <number with country code or name>`.');
      return;
    }

    // eslint-disable-next-line no-restricted-globals
    const jid = utils.whatsapp.toJid(params.join(' '));
    if (!jid) {
      await controlChannel.send(`Couldn't find \`${params.join(' ')}\`.`);
      return;
    }
    await utils.discord.getOrCreateChannel(jid);

    if (state.settings.Whitelist.length) {
      state.settings.Whitelist.push(jid);
    }
  },
  async list(_message, params) {
    let contacts = utils.whatsapp.contacts();
    if (params) { contacts = contacts.filter((name) => name.toLowerCase().includes(params.join(' '))); }
    contacts = contacts.sort((a, b) => a.localeCompare(b)).join('\n');
    const message = utils.discord.partitionText(
      contacts.length
        ? `${contacts}\n\nNot the whole list? You can refresh your contacts by typing \`resync\``
        : 'No results were found.',
    );
    while (message.length !== 0) {
      // eslint-disable-next-line no-await-in-loop
      await controlChannel.send(message.shift());
    }
  },
  async addtowhitelist(message, params) {
    const channelID = /<#(\d*)>/.exec(message)?.[1];
    if (params.length !== 1 || !channelID) {
      await controlChannel.send('Please enter a valid channel name. Usage: `addToWhitelist #<target channel>`.');
      return;
    }

    const jid = utils.discord.channelIdToJid(channelID);
    if (!jid) {
      await controlChannel.send("Couldn't find a chat with the given channel.");
      return;
    }

    state.settings.Whitelist.push(jid);
    await controlChannel.send('Added to the whitelist!');
  },
  async removefromwhitelist(message, params) {
    const channelID = /<#(\d*)>/.exec(message)?.[1];
    if (params.length !== 1 || !channelID) {
      await controlChannel.send('Please enter a valid channel name. Usage: `removeFromWhitelist #<target channel>`.');
      return;
    }

    const jid = utils.discord.channelIdToJid(channelID);
    if (!jid) {
      await controlChannel.send("Couldn't find a chat with the given channel.");
      return;
    }

    state.settings.Whitelist = state.settings.Whitelist.filter((el) => el !== jid);
    await controlChannel.send('Removed from the whitelist!');
  },
  async listwhitelist() {
    await controlChannel.send(
      state.settings.Whitelist.length
        ? `\`\`\`${state.settings.Whitelist.map((jid) => utils.whatsapp.jidToName(jid)).join('\n')}\`\`\``
        : 'Whitelist is empty/inactive.',
    );
  },
  async setdcprefix(message, params) {
    if (params.length !== 0) {
      const prefix = message.content.split(' ').slice(1).join(' ');
      state.settings.DiscordPrefixText = prefix;
      await controlChannel.send(`Discord prefix is set to ${prefix}!`);
    } else {
      state.settings.DiscordPrefixText = null;
      await controlChannel.send('Discord prefix is set to your discord username!');
    }
  },
  async enabledcprefix() {
    state.settings.DiscordPrefix = true;
    await controlChannel.send('Discord username prefix enabled!');
  },
  async disabledcprefix() {
    state.settings.DiscordPrefix = false;
    await controlChannel.send('Discord username prefix disabled!');
  },
  async enablewaprefix() {
    state.settings.WAGroupPrefix = true;
    await controlChannel.send('WhatsApp name prefix enabled!');
  },
  async disablewaprefix() {
    state.settings.WAGroupPrefix = false;
    await controlChannel.send('WhatsApp name prefix disabled!');
  },
  async enablewaupload() {
    state.settings.UploadAttachments = true;
    await controlChannel.send('Enabled uploading files to WhatsApp!');
  },
  async disablewaupload() {
    state.settings.UploadAttachments = false;
    await controlChannel.send('Disabled uploading files to WhatsApp!');
  },
  async help() {
    await controlChannel.send('See all the available commands at https://fklc.github.io/WhatsAppToDiscord/#/commands');
  },
  async resync() {
    await state.waClient.authState.keys.set({
      'app-state-sync-version': { critical_unblock_low: null },
    });
    await state.waClient.resyncAppState(['critical_unblock_low']);
    for (const [jid, attributes] of Object.entries(await state.waClient.groupFetchAllParticipating())) { state.waClient.contacts[jid] = attributes.subject; }
    await utils.discord.renameChannels();
    await controlChannel.send('Re-synced!');
  },
  async enablelocaldownloads() {
    state.settings.LocalDownloads = true;
    await controlChannel.send(`Enabled local downloads. You can now download files larger than 8MB.`);
  },
  async disablelocaldownloads() {
    state.settings.LocalDownloads = false;
    await controlChannel.send(`Disabled local downloads. You won't be able to download files larger than 8MB.`);
  },
  async getdownloadmessage() {
    await controlChannel.send(`Download message format is set to "${state.settings.LocalDownloadMessage}"`);
  },
  async setdownloadmessage(message) {
    state.settings.LocalDownloadMessage = message.content.split(' ').slice(1).join(' ');
    await controlChannel.send(`Set download message format to "${state.settings.LocalDownloadMessage}"`);
  },
  async getdownloaddir() {
    await controlChannel.send(`Download path is set to "${state.settings.DownloadDir}"`);
  },
  async setdownloaddir(message) {
    state.settings.DownloadDir = message.content.split(' ').slice(1).join(' ');
    await controlChannel.send(`Set download path to "${state.settings.DownloadDir}"`);
  },
  async enablepublishing() {
    state.settings.Publish = true;
    await controlChannel.send(`Enabled publishing messages sent to news channels.`);
  },
  async disablepublishing() {
    state.settings.Publish = false;
    await controlChannel.send(`Disabled publishing messages sent to news channels.`);
  },
  async enablechangenotifications() {
    state.settings.ChangeNotifications = true;
    await controlChannel.send(`Enabled profile picture change and status update notifications.`);
  },
  async disablechangenotifications() {
    state.settings.ChangeNotifications = false;
    await controlChannel.send(`Disabled profile picture change and status update notifications.`);
  },
  async autosaveinterval(_message, params) {
    if (params.length !== 1) {
      await controlChannel.send("Usage: autoSaveInterval <seconds>\nExample: autoSaveInterval 60");
      return;
    }
    state.settings.autoSaveInterval = +params[0];
    await controlChannel.send(`Changed auto save interval to ${params[0]}.`);
  },
  async lastmessagestorage(_message, params) {
    if (params.length !== 1) {
      await controlChannel.send("Usage: lastMessageStorage <size>\nExample: lastMessageStorage 1000");
      return;
    }
    state.settings.lastMessageStorage = +params[0];
    await controlChannel.send(`Changed last message storage size to ${params[0]}.`);
  },
  async oneway(_message, params) {
    if (params.length !== 1) {
      await controlChannel.send("Usage: oneWay <discord|whatsapp|disabled>\nExample: oneWay whatsapp");
      return;
    }
    
    if (params[0] === "disabled") {
      state.settings.oneWay = 0b11;
      await controlChannel.send(`Two way communication is enabled.`);
    } else if (params[0] === "whatsapp") {
      state.settings.oneWay = 0b10;
      await controlChannel.send(`Messages will be only sent to WhatsApp.`);
    } else if (params[0] === "discord") {
      state.settings.oneWay = 0b01;
      await controlChannel.send(`Messages will be only sent to Discord.`);
    } else {
      await controlChannel.send("Usage: oneWay <discord|whatsapp|disabled>\nExample: oneWay whatsapp");
    }
  },
  async redirectwebhooks(_message, params) {
    if (params.length !== 1) {
      await controlChannel.send("Usage: redirectWebhooks <yes|no>\nExample: redirectWebhooks yes");
      return;
    }

    state.settings.redirectWebhooks = params[0] === "yes";
    await controlChannel.send(`Redirecting webhooks is set to ${state.settings.redirectWebhooks}.`);
  },
  async unknownCommand(message) {
    await controlChannel.send(`Unknown command: \`${message.content}\`\nType \`help\` to see available commands`);
  },
};

client.on('messageCreate', async (message) => {
  if (message.author === client.user || message.applicationId === client.user.id || (message.webhookId != null && !state.settings.redirectWebhooks)) {
    return;
  }

  if (message.channel === controlChannel) {
    const command = message.content.toLowerCase().split(' ');
    await (commands[command[0]] || commands.unknownCommand)(message, command.slice(1));
  } else {
    const jid = utils.discord.channelIdToJid(message.channel.id);
    if (jid == null) {
      return;
    }

    state.waClient.ev.emit('discordMessage', { jid, message });
  }
});

client.on('messageUpdate', async (_, message) => {
  if (message.webhookId != null) {
    return;
  }

  const jid = utils.discord.channelIdToJid(message.channelId);
  if (jid == null) {
    return;
  }

  const messageId = state.lastMessages[message.id];
  if (messageId == null) {
    await message.channel.send("Couldn't edit the message. You can only edit the last 500 messages.");
    return;
  }

  state.waClient.ev.emit('discordEdit', { jid, message });
})

client.on('messageReactionAdd', async (reaction, user) => {
  const jid = utils.discord.channelIdToJid(reaction.message.channel.id);
  if (jid == null) {
    return;
  }
  const messageId = state.lastMessages[reaction.message.id];
  if (messageId == null) {
    await reaction.message.channel.send("Couldn't send the reaction. You can only react to last 500 messages.");
    return;
  }
  if (user.id === state.dcClient.user.id) {
    return;
  }

  state.waClient.ev.emit('discordReaction', { jid, reaction, removed: false });
});

client.on('messageReactionRemove', async (reaction, user) => {
  const jid = utils.discord.channelIdToJid(reaction.message.channel.id);
  if (jid == null) {
    return;
  }
  const messageId = state.lastMessages[reaction.message.id];
  if (messageId == null) {
    await reaction.message.channel.send("Couldn't remove the reaction. You can only react to last 500 messages.");
    return;
  }
  if (user.id === state.dcClient.user.id) {
    return;
  }

  state.waClient.ev.emit('discordReaction', { jid, reaction, removed: true });
});

module.exports = {
  start: async () => {
    await client.login(state.settings.Token);
    return client;
  },
  setControlChannel,
};
