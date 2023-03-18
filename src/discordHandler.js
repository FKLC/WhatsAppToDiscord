const { Client, Events, GatewayIntentBits } =  require('discord.js');
const state =  require('./state.js');
const utils =  require('./utils.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
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
  let msgContent = '';
  const files = [];
  const webhook = await utils.discord.getOrCreateChannel(message.channelJid);

  if (message.isGroup && state.settings.WAGroupPrefix) { msgContent += `[${message.name}] `; }

  if (message.isForwarded) {
    msgContent += `forwarded message:\n${message.content.split('\n').join('\n> ')}`;
  } else if (message.quote) {
    msgContent += `> ${message.quote.name}: ${message.quote.content.split('\n').join('\n> ')}\n${message.content}`;
  } else {
    msgContent += message.content;
  }

  if (message.file) {
    if (message.file === -1) {
      msgContent += "WA2DC Attention: Received a file, but it's over 8MB. Check WhatsApp on your phone.";
    } else {
      files.push(message.file);
    }
  }

  if (msgContent || files.length) {
    msgContent = utils.discord.partitionText(msgContent);
    while (msgContent.length > 1) {
      // eslint-disable-next-line no-await-in-loop
      await webhook.send({
        content: msgContent.shift(),
        username: message.name,
        avatarURL: message.profilePic,
      });
    }
    const messageId = (await webhook.send({
      content: msgContent.shift() || null,
      username: message.name,
      files,
      avatarURL: message.profilePic,
    })).id;
    state.lastMessages[messageId] = message.id;
  }
});

client.on('whatsappReaction', async (reaction) => {
  const channelId = state.chats[reaction.jid]?.channelId;
  const messageId = state.lastMessages[reaction.id];
  if (channelId == null || messageId == null) { return; }

  const channel = await utils.discord.getChannel(channelId);
  const message = await channel.messages.fetch(messageId);
  await message.react(reaction.text);
});

const commands = {
  async ping(message) {
    controlChannel.send(`Pong ${Date.now() - message.createdTimestamp}ms!`);
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
    const message = utils.discord.partitionText(
      contacts.length
        ? `${contacts.join('\n')}\n\nNot the whole list? You can refresh your contacts by typing \`resync\``
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
    await controlChannel.send(
      [
        '`start <number with country code or name>`: Starts a new conversation.',
        '`list`: Lists existing chats.',
        '`list <chat name to search>`: Finds chats that contain the given argument.',
        '`listWhitelist`: Lists all whitelisted conversations.',
        '`addToWhitelist <channel name>`: Adds specified conversation to the whitelist.',
        '`removeFromWhitelist <channel name>`: Removes specified conversation from the whitelist.',
        '`resync`: Re-syncs your contacts and groups.',
        '`enableWAUpload`: Starts uploading attachments sent to Discord to WhatsApp.',
        '`disableWAUpload`: Stop uploading attachments sent to Discord to WhatsApp.',
        '`enableDCPrefix`: Starts adding your Discord username to messages sent to WhatsApp.',
        '`disableDCPrefix`: Stops adding your Discord username to messages sent to WhatsApp.',
        "`enableWAPrefix`: Starts adding sender's name to messages sent to Discord.",
        "`disableWAPrefix`: Stops adding sender's name to messages sent to Discord.",
        '`ping`: Sends "Pong! <Now - Time Message Sent>ms" back.',
      ].join('\n'),
    );
  },
  async resync() {
    await state.waClient.authState.keys.set({
      'app-state-sync-version': { critical_unblock_low: null },
    });
    await state.waClient.resyncAppState(['critical_unblock_low']);
    for (const [jid, attributes] of Object.entries(await state.waClient.groupFetchAllParticipating())) { state.waClient.contacts[jid] = attributes.subject; }
    await controlChannel.send('Re-synced!');
  },
  async unknownCommand(message) {
    controlChannel.send(`Unknown command: \`${message.content}\`\nType \`help\` to see available commands`);
  },
};

client.on(Events.MessageCreate, async (message) => {
  if (message.author === client.user || message.webhookId != null) {
    return;
  }

  if (message.channel === controlChannel) {
    const command = message.content.toLowerCase().split(' ');
    await (commands[command[0]] || commands.unknownCommand)(message, command.slice(1));
  } else if (state.settings.Categories.includes(message.channel?.parent?.id)) {
    const jid = utils.discord.channelIdToJid(message.channel.id);
    if (!jid) {
      message.channel.send("Couldn't find the user. Restart the bot, or manually delete this channel and start a new chat using the `start` command.");
      return;
    }

    state.waClient.ev.emit('discordMessage', { jid, message });
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (!state.settings.Categories.includes(reaction.message.channel?.parent?.id)) return;
  const messageId = state.lastMessages[reaction.message.id];
  if (messageId == null) {
    await reaction.message.channel.send("Couldn't send the reaction. You can only react to messages received after the bot went online.");
    return;
  }
  if (user.id === state.dcClient.user.id) {
    return;
  }
  const jid = utils.discord.channelIdToJid(reaction.message.channel.id);
  if (!jid) {
    reaction.message.channel.send("Couldn't find the user. Restart the bot, or manually delete this channel and start a new chat using the `start` command.");
    return;
  }
  state.waClient.ev.emit('discordReaction', { jid, reaction, removed: false });
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (!state.settings.Categories.includes(reaction.message.channel?.parent?.id)) return;
  const messageId = state.lastMessages[reaction.message.id];
  if (messageId == null) {
    await reaction.message.channel.send("Couldn't send the reaction. You can only react to messages received after the bot went online.");
    return;
  }
  if (user.id === state.dcClient.user.id) {
    return;
  }
  const jid = utils.discord.channelIdToJid(reaction.message.channel.id);
  if (!jid) {
    reaction.message.channel.send("Couldn't find the user. Restart the bot, or manually delete this channel and start a new chat using the `start` command.");
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
