const { Client, Intents, Webhook } = require('discord.js');
const { jidToName } = require('./whatsapp_utils');
const state = require('./state');


module.exports = {
	repairChannels: async () => {
		const guild = await state.dcClient.guilds.fetch(state.settings.GuildID);
		await guild.channels.fetch();
		const categoryExists = await guild.channels.fetch(state.settings.CategoryID);
		const controlExists = await guild.channels.fetch(state.settings.ControlChannelID);

		if (!categoryExists) {
			state.settings.CategoryID = (await guild.channels.create('whatsapp', {
				type: 'GUILD_CATEGORY',
			})).id;
		}
		if (!controlExists) {
			state.settings.ControlChannelID = (await guild.channels.create('control-room', {
				type: 'GUILD_TEXT',
				parent: state.settings.CategoryID,
			})).id;
		}

		await (await guild.channels.fetch(state.settings.ControlChannelID)).setPosition(0);
		for await (const [jid, webhook] of Object.entries(state.chats)) {
			const channel = await guild.channels.fetch(webhook.channelId).catch(() => { });
			if (channel != null) {
				await channel.edit({
					parent: state.settings.CategoryID,
					position: 999,
				});
			}
			else {
				delete state.chats[jid];
			}
		}

		for await (const [, channel] of guild.channels.cache) {
			if (channel.id !== state.settings.ControlChannelID && channel.parentId === state.settings.CategoryID && !module.exports.channelIdToJid(channel.id)) {
				await channel.delete();
			}
		}
	},
	setupDiscordChannels: async (token) => await new Promise(resolve => {
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
			resolve({ GuildID: guild.id, CategoryID: category.id, ControlChannelID: controlChannel.id });
		});
		client.login(token);
	}),
	getOrCreateChannel: async (jid) => {
		if (state.chats[jid]) {
			return new Webhook(state.dcClient, state.chats[jid]);
		}

		const name = jidToName(jid);
		const channel = await (await state.getGuild()).channels.create(name, {
			type: 'GUILD_TEXT',
			parent: await state.getCategory(),
		});
		const webhook = await channel.createWebhook('WA2DC');
		state.chats[jid] = { id: webhook.id, type: webhook.type, token: webhook.token, channelId: webhook.channelId };
		return webhook;
	},
	channelIdToJid: (channelId) => {
		return Object.keys(state.chats).find(key => state.chats[key].channelId === channelId);
	},
	getFileName: (message, messageType) => {
		if (messageType === 'audio') {
			return 'audio.ogg';
		}
		if (messageType === 'document') {
			return message.fileName;
		}
		return messageType + '.' + message.mimetype.split('/')[1];
	},
};