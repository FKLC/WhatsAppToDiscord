const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Collection,
  ComponentType,
  Events,
  GatewayIntentBits,
  MessageFlags,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

const state = require('./state.js');
const utils = require('./utils.js');

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

client.on(Events.ClientReady, async () => {
  await setControlChannel();
});

client.on(Events.ChannelDelete, (channel) => {
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

const commands = [
  {
    data: new SlashCommandBuilder()
      .setName('ping')
      .setDescription("Displays the bot's ping."),
    async execute(interaction) {
      await interaction.reply(`Pong! (${Date.now() - interaction.createdTimestamp} ms)`);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('pairwithcode')
      .setDescription('Pairs with your phone number.')
      .addIntegerOption(option =>
        option
          .setName('number')
          .setDescription('Your number, including the country code but excluding "+" and other special characters.')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();
      const code = await state.waClient.requestPairingCode(
        interaction.options.getInteger('number')
      );
      await interaction.editReply(`Your pairing code is: \`${code}\``);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('start')
      .setDescription('Starts a new conversation with a WhatsApp group or contact.')
      .addStringOption(option =>
        option
          .setName('name-or-number')
          .setDescription('The name or phone number of the chat.')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();

      const name = interaction.options.getString('name-or-number');
      const jid = utils.whatsapp.toJid(name);
      if (!jid) {
        await interaction.editReply(`Couldn't find \`${name}\`.`);
        return;
      }

      await utils.discord.getOrCreateChannel(jid);

      if (state.settings.Whitelist.length) {
        state.settings.Whitelist.push(jid);
      }

      await interaction.editRreply(`Started conversation with \`${name}\`.`);
    }
  },
  {
    data: new SlashCommandBuilder()
      .setName('list')
      .setDescription('Lists your WhatsApp chats.')
      .addStringOption(option =>
        option
          .setName('filter')
          .setDescription('Filter by the given string (case-insensitive).')),
    async execute(interaction) {
      await interaction.deferReply();

      let contacts = utils.whatsapp.contacts();

      const filterString = interaction.options.getString('filter');
      if (filterString) {
        contacts = contacts.filter((name) => name.toLowerCase().includes(filterString));
      }

      contacts = contacts.sort((a, b) => a.localeCompare(b));

      if (contacts.length === 0) {
        await interaction.editReply('No results were found.');
        return;
      }

      const page_size = 10;

      const prevButton = new ButtonBuilder()
        .setCustomId('prev')
        .setLabel('Previous')
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Primary)

      const nextButton = new ButtonBuilder()
        .setCustomId('next')
        .setLabel('Next')
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary)

      const generateContent = startIndex => {
        return `Not the whole list? Refresh your contacts by running \`/resync\`.\`\`\`\n${
          contacts.slice(startIndex, startIndex + page_size).join('\n')
        }\`\`\`page ${startIndex / page_size + 1}/${Math.ceil(contacts.length / page_size)}`;
      }

      const collector = await interaction.editReply({
        content: generateContent(0),
        components: contacts.length > page_size
          ? [new ActionRowBuilder().addComponents(nextButton)]
          : [],
      }).then(
          message => message.createMessageComponentCollector({componentType: ComponentType.Button})
      );

      if (contacts.length <= page_size) {
        return;
      }

      let currentIndex = 0;
      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return;
        }

        currentIndex += i.customId === 'prev' ? -page_size : page_size;

        await i.update({
          content: generateContent(currentIndex),
          components: [
              new ActionRowBuilder()
              .addComponents(
                ...(currentIndex ? [prevButton] : []),
                ...(currentIndex + page_size < contacts.length ? [nextButton] : [])
              ),
          ]
        });
      });
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('addtowhitelist')
      .setDescription('Adds a channel to the whitelist.')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The channel to add.')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();

      const channel = interaction.options.getChannel('channel');

      const jid = utils.discord.channelIdToJid(channel.id);
      if (!jid) {
        await controlChannel.send("Couldn't find a chat with the given channel.");
        return;
      }

      state.settings.Whitelist.push(jid);
      await interaction.editReply('Added to the whitelist!');
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('removefromwhitelist')
      .setDescription('Removes a channel from the whitelist.')
      .addChannelOption(option =>
        option
          .setName('channel')
          .setDescription('The channel to remove.')
          .setRequired(true)),
    async execute(interaction) {
      await interaction.deferReply();

      const channel = interaction.options.getChannel('channel');

      const jid = utils.discord.channelIdToJid(channel.id);
      if (!jid) {
        await controlChannel.send("Couldn't find a chat with the given channel.");
        return;
      }

      state.settings.Whitelist = state.settings.Whitelist.filter((el) => el !== jid);
      await interaction.editReply('Removed from the whitelist!');
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('listwhitelist')
      .setDescription('Shows the whitelist.'),
    async execute(interaction) {
      await interaction.deferReply();
      await interaction.editReply(
        state.settings.Whitelist.length
          ? `\`\`\`${state.settings.Whitelist.map(
              (jid) => utils.whatsapp.jidToName(jid)
            ).join('\n')}\`\`\``
          : 'Whitelist is empty/inactive.',
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('setdcprefix')
      .setDescription('Sets the prefix for messages sent to Discord.')
      .addStringOption(option =>
        option
          .setName('prefix')
          .setDescription('The prefix to set. Omit to reset to default.')),
    async execute(interaction) {
      state.settings.DiscordPrefixText = interaction.options.getString('prefix');
      await interaction.reply(
        `Discord prefix is set to ${
          state.settings.DiscordPrefixText
            ? `\`${state.settings.DiscordPrefixText}\``
            : 'your Discord username'
        }!`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('dcprefixenabled')
      .setDescription('Sets whether the Discord username prefix is enabled.')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Whether to enable or disable.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.DiscordPrefix = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `Discord username prefix ${state.settings.DiscordPrefix ? 'enabled' : 'disabled'}!`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('waprefixenabled')
      .setDescription('Sets whether the WhatsApp name prefix is enabled.')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Whether to enable or disable.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.WAGroupPrefix = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `WhatsApp name prefix ${state.settings.WAGroupPrefix ? 'enabled' : 'disabled'}!`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
          .setName('wauploadenabled')
          .setDescription('Sets whether uploading files to WhatsApp is enabled.')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Whether to enable or disable.')
              .setRequired(true)),
    async execute(interaction) {
      state.settings.UploadAttachments = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `Uploading files to WhatsApp has been ${state.settings.UploadAttachments ? 'enabled' : 'disabled'}!`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('help')
      .setDescription('Shows information on how to use the bot.'),
    async execute(interaction) {
      await interaction.reply(
        'See all the available commands at https://fklc.github.io/WhatsAppToDiscord/#/commands'
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('resync')
      .setDescription('Resynchronizes WhatsApp contacts and groups and renames channels as needed.'),
    async execute(interaction) {
      await interaction.deferReply();
      await state.waClient.authState.keys.set({
        'app-state-sync-version': { critical_unblock_low: null },
      });
      await state.waClient.resyncAppState(['critical_unblock_low']);
      for (const [jid, attributes] of Object.entries(await state.waClient.groupFetchAllParticipating())) { state.waClient.contacts[jid] = attributes.subject; }
      await utils.discord.renameChannels();
      await interaction.editReply('Re-synced!');
    },
  },
  {
    data: new SlashCommandBuilder()
          .setName('localdownloadsenabled')
          .setDescription('Sets whether local downloads are enabled.')
          .addBooleanOption(option =>
            option
              .setName('enabled')
              .setDescription('Whether to enable or disable.')
              .setRequired(true)),
    async execute(interaction) {
      state.settings.LocalDownloads = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `Local downloads for files larger than 8MB been ${state.settings.LocalDownloads ? 'enabled' : 'disabled'}!`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('getdownloadmessage')
      .setDescription('Shows the current download message format.'),
    async execute(interaction) {
      await interaction.reply(`The download message format is set to: \`${state.settings.LocalDownloadMessage}\``);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('setdownloadmessage')
      .setDescription('Sets the download message format.')
      .addStringOption(option =>
        option
          .setName('format')
          .setDescription('The download message format.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.LocalDownloadMessage = interaction.options.getString('format');
      await interaction.reply(`Set download message format to: \`${state.settings.LocalDownloadMessage}\``);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('getdownloaddir')
      .setDescription('Shows the current download directory path.'),
    async execute(interaction) {
      await interaction.reply(`The download path is set to: \`${state.settings.DownloadDir}\``);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('setdownloaddir')
      .setDescription('Sets the download directory path.')
      .addStringOption(option =>
        option
          .setName('path')
          .setDescription('The path to the new download directory.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.DownloadDir = interaction.options.getString('path');
      await interaction.reply(`Set download path to: \`${state.settings.DownloadDir}\``);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('publishingenabled')
      .setDescription('Sets whether publishing messages sent to news channels is enabled.')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Whether to enable or disable.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.Publish = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `${state.settings.Publish ? 'Enabled' : 'Disabled'} publishing messages sent to news channels.`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('changenotificationsenabled')
      .setDescription('Sets whether profile picture change and status update notifications are enabled.')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Whether to enable or disable.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.ChangeNotifications = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `${state.settings.Publish ? 'Enabled' : 'Disabled'} profile picture change and status update notifications.`
      );
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('autosaveinterval')
      .setDescription('Sets the autosave interval.')
      .addIntegerOption(option =>
        option
          .setName('interval')
          .setDescription('The new autosave interval, in seconds.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.autoSaveInterval = interaction.options.getInteger('interval');
      await interaction.reply(`Changed autosave interval to ${state.settings.autoSaveInterval}.`);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('lastmessagestorage')
      .setDescription('Sets the last message storage size.')
      .addIntegerOption(option =>
        option
          .setName('size')
          .setDescription('The new size.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.lastMessageStorage = interaction.options.getInteger('size');
      await interaction.reply(`Changed last message storage size to ${state.settings.lastMessageStorage}.`);
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('oneway')
      .setDescription('Configures one-way/two-way communication.')
      .addIntegerOption(option =>
        option
          .setName('state')
          .setDescription('The state.')
          .setRequired(true)
          .addChoices(
            { name: 'Disabled; enable two-way communication', value: 0b11 },
            { name: 'Only send messages to WhatsApp', value: 0b10 },
            { name: 'Only send messages to Discord', value: 0b01 },
          )),
    async execute(interaction) {
      state.settings.oneWay = interaction.options.getInteger('state');
      if (state.settings.oneWay == 0b11) {
        await interaction.reply('Two-way communication is now enabled.');
      } else {
        await interaction.reply(
          `Messages will only be sent to ${state.settings.oneWay == 0b10 ? 'WhatsApp' : 'Discord'}.`
        );
      }
    },
  },
  {
    data: new SlashCommandBuilder()
      .setName('redirectwebhooks')
      .setDescription('Sets whether webhook redirection is enabled.')
      .addBooleanOption(option =>
        option
          .setName('enabled')
          .setDescription('Whether to enable or disable.')
          .setRequired(true)),
    async execute(interaction) {
      state.settings.redirectWebhooks = interaction.options.getBoolean('enabled');
      await interaction.reply(
        `${state.settings.Publish ? 'Enabled' : 'Disabled'} redirecting webhooks.`
      );
    },
  },
];

client.on(Events.InteractionCreate, async (interaction) =>  {
  if (!interaction.isChatInputCommand()) return;

  const execute = interaction.client.commands.get(interaction.commandName);

  if (!execute) {
    console.error(`Unknown command: \`${interaction.commandName}\`\nRun \`/help\` to see available commands.`);
    return;
  }

  await execute(interaction);
});

client.on(Events.MessageCreate, (message) => {
  console.log(message, state.dcClient.user.id);
  if (
      message.channel === controlChannel ||
      message.author === client.user ||
      message.applicationId === client.user.id ||
      (message.webhookId != null && !state.settings.redirectWebhooks)
  ) {
    return;
  }

  const jid = utils.discord.channelIdToJid(message.channel.id);
  if (jid == null) {
    return;
  }

  state.waClient.ev.emit('discordMessage', { jid, message });
});

client.on(Events.MessageUpdate, async (_, message) => {
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

client.on(Events.MessageReactionAdd, async (reaction, user) => {
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

client.on(Events.MessageReactionRemove, async (reaction, user) => {
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
    const rest = new REST().setToken(state.settings.Token);

    const raw_commands = [];
    client.commands = new Collection();

    for (const command of commands) {
      raw_commands.push(command.data.toJSON());
      client.commands.set(command.data.name, command.execute);
    }

    await client.login(state.settings.Token);

    await rest.put(
      Routes.applicationGuildCommands(client.user.id, state.settings.GuildID),
      { body: raw_commands },
    );

    return client;
  },
  setControlChannel,
};
