const {
	default: makeWASocket,
	fetchLatestBaileysVersion,
} = require('@adiwajshing/baileys');
const waUtils = require('./whatsapp_utils');
const dcUtils = require('./discord_utils');
const state = require('./state');


let authState, saveState;

const connectToWhatsApp = async (retry = 1) => {
	const controlChannel = await state.getControlChannel();
	const { version } = await fetchLatestBaileysVersion();

	const client = makeWASocket({
		version,
		printQRInTerminal: false,
		auth: authState,
		logger: state.logger,
		markOnlineOnConnect: false,
	});
	client.contacts = state.contacts;

	client.ev.on('connection.update', async (update) => {
		const { connection, lastDisconnect, qr } = update;
		if (qr) {
			await waUtils.sendQR(qr);
		}
		if (connection === 'close') {
			state.logger.error(lastDisconnect.error);
			if (retry <= 3) {
				await controlChannel.send(`WhatsApp connection failed! Trying to reconnect! Retry #${retry}`);
				await connectToWhatsApp(retry + 1);
			}
			else if(retry <= 5){
				const delay = (retry - 3) * 10;
				await controlChannel.send(`WhatsApp connection failed! Waiting ${delay} seconds before trying to reconnect! Retry #${retry}.`);
				await new Promise(resolve => setTimeout(resolve, delay * 1000));
				await connectToWhatsApp(retry + 1);
			}
			else {
				await controlChannel.send('Failed connecting 5 times. Please rescan the QR code.');
				await module.exports.start(true);
			}
		}
		else if (connection === 'open') {
			state.waClient = client;
			await controlChannel.send('WhatsApp connection successfully opened!');
		}
	});
	client.ev.on('creds.update', saveState);
	['chats.set', 'contacts.set', 'chats.upsert', 'chats.update', 'contacts.upsert', 'contacts.update', 'groups.upsert',
		'groups.update'].forEach((eventName) => client.ev.on(eventName, waUtils.updateContacts));

	client.ev.on('messages.upsert', async update => {
		if (update.type === 'notify') {
			for await (const message of update.messages) {
				if (state.settings.Whitelist.length && !(state.settings.Whitelist.includes(message.key.remoteJid))) {
					return;
				}
				if (state.startTime > message.messageTimestamp) {
					return;
				}
				if (!['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].some(el => Object.keys(message.message || {}).includes(el))) {
					return;
				}
				await new Promise(resolve => state.dcClient.emit('whatsappMessage', message, resolve));
			}
		}
	});

	client.ev.on('discordMessage', async message => {
		const jid = dcUtils.channelIdToJid(message.channel.id);
		if (!jid) {
			message.channel.send('Couldn\'t find the user. Restart the bot, or manually delete this channel and start a new chat using the `start` command.');
			return;
		}

		const content = {};
		const options = {};

		if (state.settings.UploadAttachments) {
			for (const [, attachment] of message.attachments) {
				await client.sendMessage(jid, waUtils.createDocumentContent(attachment));
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
			options.quoted = await waUtils.createQuoteMessage(message);
		}

		await client.sendMessage(jid, content, options);
	});
};

module.exports = {
	start: async (newSession = false) => {
		({ authState, saveState } = await waUtils.useStorageAuthState(newSession));
		await connectToWhatsApp();
	},
};
