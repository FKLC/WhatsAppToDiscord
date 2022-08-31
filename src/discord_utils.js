const { Client, Intents, Webhook } = require('discord.js');
const { jidToName } = require('./whatsapp_utils');
const state = require('./state');

module.exports = {
  repairChannels: async () => {
    const guild = await state.dcClient.guilds.fetch(state.settings.GuildID);
    await guild.channels.fetch();

    if (state.settings.Categories == null) {
      state.settings.Categories = [state.settings.CategoryID];
    }
    const categoryExists = await guild.channels.fetch(state.settings.Categories?.[0]).catch(() => null);
    const controlExists = await guild.channels.fetch(state.settings.ControlChannelID).catch(() => null);

    if (!categoryExists) {
      state.settings.Categories[0] = (
        await guild.channels.create('whatsapp', {
          type: 'GUILD_CATEGORY',
        })
      ).id;
    }

    if (!controlExists) {
      state.settings.ControlChannelID = (
        await guild.channels.create('control-room', {
          type: 'GUILD_TEXT',
          parent: state.settings.Categories[0],
        })
      ).id;
    }

    await (await guild.channels.fetch(state.settings.ControlChannelID)).edit({
      position: 0,
      parent: state.settings.Categories[0],
    });
    for (const [jid, webhook] of Object.entries(state.chats)) {
      guild.channels.fetch(webhook.channelId).catch(() => null).then((channel) => {
        if (channel == null) {
          delete state.chats[jid];
        }
      });
    }

    for await (const categoryId of state.settings.Categories) {
      const category = await guild.channels.fetch(categoryId).catch(() => null);
      if (category == null) {
        state.settings.Categories = state.settings.Categories.filter((id) => categoryId !== id);
      }
    }

    for (const [, channel] of guild.channels.cache) {
      if (channel.id !== state.settings.ControlChannelID && state.settings.Categories.includes(channel.parentId) && !module.exports.channelIdToJid(channel.id)) {
        channel.edit({ parent: null });
      }
    }
  },
  setupDiscordChannels: async (token) => new Promise((resolve) => {
    const client = new Client({ intents: [Intents.FLAGS.GUILDS] });
    client.once('ready', () => {
      console.log(`Invite the bot using the following link: https://discordapp.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=536879120`);
    });
    client.once('guildCreate', async (guild) => {
      const category = await guild.channels.create('whatsapp', {
        type: 'GUILD_CATEGORY',
      });
      const controlChannel = await guild.channels.create('control-room', {
        type: 'GUILD_TEXT',
        parent: category,
      });
      await client.destroy();
      resolve({
        GuildID: guild.id,
        Categories: [category.id],
        ControlChannelID: controlChannel.id,
      });
    });
    client.login(token);
  }),
  getCategory: async (nthChannel) => {
    const nthCategory = Math.floor(nthChannel / 50);
    if (state.settings.Categories[nthCategory] == null) {
      state.settings.Categories.push((await (await state.getGuild()).channels.create(`whatsapp ${nthCategory + 1}`, {
        type: 'GUILD_CATEGORY',
      })).id);
    }
    return state.settings.Categories[nthCategory];
  },
  getOrCreateChannel: async (jid) => {
    if (state.chats[jid]) {
      return new Webhook(state.dcClient, state.chats[jid]);
    }

    const createChannel = async (channelName) => (await state.getGuild())
      .channels.create(channelName, {
        type: 'GUILD_TEXT',
        parent: await module.exports.getCategory(Object.keys(state.chats).length + 1),
      });
    const name = jidToName(jid);
    const channel = await createChannel(name).catch(async (err) => {
      if (err.code === 50035) {
        return createChannel('invalid-name');
      }
      throw err;
    });
    const webhook = await channel.createWebhook('WA2DC');
    state.chats[jid] = {
      id: webhook.id,
      type: webhook.type,
      token: webhook.token,
      channelId: webhook.channelId,
    };
    return webhook;
  },
  channelIdToJid: (channelId) => Object.keys(state.chats).find((key) => state.chats[key].channelId === channelId),
  getFileName: (message, messageType) => {
    if (messageType === 'audio') {
      return 'audio.ogg';
    }
    if (messageType === 'document') {
      return message.fileName;
    }
    return `${messageType}.${message.mimetype.split('/')[1]}`;
  },
};
