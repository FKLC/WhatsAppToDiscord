const {
	default: makeWASocket,
	fetchLatestBaileysVersion,
	DisconnectReason,
} = require('@adiwajshing/baileys');
const waUtils = require('./whatsapp_utils');
const { channelIdToJid } = require('./discord_utils');
const { updateContacts, createDocumentContent, createQuoteMessage } = require('./whatsapp_utils');
const state = require('./state');


let authState, saveState;

const connectToWhatsApp = async () => {
	const controlChannel = state.getControlChannel();
	const { version } = await fetchLatestBaileysVersion();

	const client = makeWASocket({
		version,
		printQRInTerminal: false,
		auth: authState,
		logger: state.logger,
	});
	client.contacts = state.contacts;

	client.ev.on('connection.update', async (update) => {
		const { connection, lastDisconnect, qr } = update;
		if (qr) {
			await waUtils.sendQR(qr);
		}
		if (connection === 'close' && lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut) {
			await connectToWhatsApp();
		}
		if (connection === 'open') {
			await controlChannel.send('WhatsApp connection successfully opened!');
		}
	});
	client.ev.on('creds.update', saveState);
	['chats.set', 'contacts.set', 'chats.upsert', 'chats.update', 'contacts.upsert', 'contacts.update', 'groups.upsert',
		'groups.update'].forEach((eventName) => client.ev.addListener(eventName, updateContacts));

	client.ev.on('messages.upsert', update => {
		if (update.type === 'notify') {
			for (const message of update.messages) {
				if (!message.key.fromMe && (state.settings.Whitelist.length && !(state.settings.Whitelist.includes(message.key.remoteJid)))) {
					return;
				}
				if (state.startTime > message.messageTimestamp) {
					return;
				}
				if (!['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].some(el => Object.keys(message.message).includes(el))) {
					return;
				}
				state.dcClient.emit('whatsappMessage', message);
			}
		}
	});

	client.ev.addListener('discordMessage', async message => {
		const jid = channelIdToJid(message.channel.id);
		if (!jid) {
			message.channel.send('Couldn\'t find the user. Restart the bot, or manually delete this channel and start a new chat using the `start` command.');
			return;
		}

		const content = {};
		const options = {};

		if (state.settings.UploadAttachments) {
			for (const [, attachment] of message.attachments) {
				await client.sendMessage(jid, createDocumentContent(attachment));
			}
			if (!message.content) {
				return;
			}
			content.text = message.content;
		}
		else {
			content.text = [message.content, ...message.attachments.map(el => el.url)].join(' ');
		}

		if (state.settings.DiscordPrefix) {
			content.text = '[' + (message.member?.nickname || message.author.username) + '] ' + content.text;
		}

		if (message.reference) {
			options.quoted = createQuoteMessage(message);
		}

		await client.sendMessage(jid, content, options);
	});

	return client;
};

module.exports = {
	start: async () => {
		({ authState, saveState } = await waUtils.useStorageAuthState());
		return await connectToWhatsApp();
	},
};
