const { Client, Intents } = require('discord.js');
const { downloadContentFromMessage } = require('@adiwajshing/baileys');
const { getOrCreateChannel, channelIdToJid, getFileName } = require('./discord_utils');
const whatsappUtils = require('./whatsapp_utils');
const state = require('./state');

const client = new Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});
let controlChannel;

const updateControlChannel = async () => {
  controlChannel = await client.channels.fetch(state.settings.ControlChannelID).catch(() => null);
};

client.on('ready', async () => {
  await updateControlChannel();
});

client.on('channelDelete', async (channel) => {
  delete state.chats[channelIdToJid(channel.id)];
});

client.on('whatsappMessage', async (rawMessage, resolve) => {
  const { channelJid, senderJid } = whatsappUtils.getWebhookAndSenderJid(rawMessage, rawMessage.key.fromMe);
  const webhook = await getOrCreateChannel(channelJid);
  const name = whatsappUtils.jidToName(senderJid, rawMessage.pushName);
  const quotedName = whatsappUtils.jidToName(rawMessage.message.extendedTextMessage?.contextInfo?.participant || '');
  const files = [];
  let content = '';

  if (rawMessage.key.participant && state.settings.WAGroupPrefix) {
    content += `[${name}] `;
  }
  let messageType = Object.keys(rawMessage.message).filter((attr) => ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(attr))[0];
  const message = rawMessage.message[messageType];
  messageType = messageType.replace('Message', '');

  switch (messageType) {
    case 'conversation':
      content += message;
      break;
    case 'extendedText':
      if (message.contextInfo?.isForwarded) {
        content += `> Forwarded Message:\n${message.text}`;
      } else if (message.contextInfo?.quotedMessage) {
        content += `> ${quotedName}: ${message.contextInfo.quotedMessage.conversation.split('\n').join('\n> ')}\n${message.text}`;
      } else if (message.canonicalUrl) {
        content += message.text;
      }
      break;
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
    case 'sticker':
      if (rawMessage.fileLength.low > 8388284) {
        await webhook.send({
          content: "WA2DC Attention: Received a file, but it's over 8MB. Check WhatsApp on your phone.",
          username: name,
          avatarURL: await whatsappUtils.getProfilePic(senderJid),
        });
        break;
      }
      files.push({
        attachment: await downloadContentFromMessage(rawMessage, messageType),
        name: getFileName(rawMessage, messageType),
      });
      content += rawMessage.caption || '';
      break;
    default:
      break;
  }
  if (content || files.length) {
    await webhook.send({
      content: content || null,
      username: name,
      files,
      avatarURL: await whatsappUtils.getProfilePic(senderJid),
    });
  }
  resolve();
});

const commands = {
  ping: async (message) => {
    controlChannel.send(`Pong ${Date.now() - message.createdTimestamp}ms!`);
  },
  start: async (message, params) => {
    if (!params.length) {
      await controlChannel.send('Please enter a phone number or name. Usage: `start <number with country code or name>`.');
      return;
    }

    // eslint-disable-next-line no-restricted-globals
    const jid = isNaN(params[0]) ? whatsappUtils.nameToJid(params.join(' ')) : `${params[0]}@s.whatsapp.net`;
    if (!jid) {
      await controlChannel.send(`Couldn't find \`${params.join(' ')}\`.`);
      return;
    }
    await getOrCreateChannel(jid);

    if (state.settings.Whitelist.length) {
      state.settings.Whitelist.push(jid);
    }
  },
  list: async (message, params) => {
    let contacts = whatsappUtils.contactNames();
    if (params) {
      contacts = contacts.filter((name) => name.toLowerCase().includes(params.join(' ')));
    }
    controlChannel.send(contacts.length ? `\`\`\`${contacts.join('\n')}\`\`\`` : 'No results were found.');
  },
  addtowhitelist: async (message, params) => {
    const channelID = /<#(\d*)>/.exec(message)?.[1];
    if (params.length !== 1 || !channelID) {
      await controlChannel.send('Please enter a valid channel name. Usage: `addToWhitelist #<target channel>`.');
      return;
    }

    const jid = channelIdToJid(channelID);
    if (!jid) {
      await controlChannel.send("Couldn't find a chat with the given channel.");
      return;
    }

    state.settings.Whitelist.push(jid);
    await controlChannel.send('Added to the whitelist!');
  },
  removefromwhitelist: async (message, params) => {
    const channelID = /<#(\d*)>/.exec(message)?.[1];
    if (params.length !== 1 || !channelID) {
      await controlChannel.send('Please enter a valid channel name. Usage: `removeFromWhitelist #<target channel>`.');
      return;
    }

    const jid = channelIdToJid(channelID);
    if (!jid) {
      await controlChannel.send("Couldn't find a chat with the given channel.");
      return;
    }

    state.settings.Whitelist = state.settings.Whitelist.filter((el) => el !== jid);
    await controlChannel.send('Removed from the whitelist!');
  },
  listwhitelist: async () => {
    await controlChannel.send(state.settings.Whitelist.length ? `\`\`\`${state.settings.Whitelist.map((jid) => whatsappUtils.jidToName(jid)).join('\n')}\`\`\`` : 'Whitelist is empty/inactive.');
  },
  enabledcprefix: async () => {
    state.settings.DiscordPrefix = true;
    await controlChannel.send('Discord username prefix enabled!');
  },
  disabledcprefix: async () => {
    state.settings.DiscordPrefix = false;
    await controlChannel.send('Discord username prefix disabled!');
  },
  enablewaprefix: async () => {
    state.settings.WAGroupPrefix = true;
    await controlChannel.send('WhatsApp name prefix enabled!');
  },
  disablewaprefix: async () => {
    state.settings.WAGroupPrefix = false;
    await controlChannel.send('WhatsApp name prefix disabled!');
  },
  enablewaupload: async () => {
    state.settings.UploadAttachments = true;
    await controlChannel.send('Enabled uploading files to WhatsApp!');
  },
  disablewaupload: async () => {
    state.settings.UploadAttachments = false;
    await controlChannel.send('Disabled uploading files to WhatsApp!');
  },
  help: async () => {
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
  resync: async () => {
    await state.waClient.authState.keys.set({
      'app-state-sync-version': { critical_unblock_low: null },
    });
    await state.waClient.resyncAppState(['critical_unblock_low']);
    for (const [jid, attributes] of Object.entries(await state.waClient.groupFetchAllParticipating())) {
      state.waClient.contacts[jid] = attributes.subject;
    }
    await controlChannel.send('Re-synced!');
  },
  unknownCommand: async (message) => {
    controlChannel.send(`Unknown command: \`${message.content}\`\nType \`help\` to see available commands`);
  },
};

client.on('messageCreate', async (message) => {
  if (message.author === client.user || message.webhookId != null || message.channel?.parent?.id !== state.settings.CategoryID) {
    return;
  }

  if (message.channel === controlChannel) {
    const command = message.content.toLowerCase().split(' ');
    await (commands[command[0]] || commands.unknownCommand)(message, command.slice(1));
  } else {
    state.waClient.ev.emit('discordMessage', message);
  }
});

module.exports = {
  start: async () => {
    await client.login(state.settings.Token);
    return client;
  },
  updateControlChannel,
};
