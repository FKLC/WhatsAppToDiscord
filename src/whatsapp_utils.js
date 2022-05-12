const {
	initAuthCreds,
} = require('@adiwajshing/baileys');
const storage = require('./storage_manager');
const WAProto_1 = require('@adiwajshing/baileys/WAProto');
const generics_1 = require('@adiwajshing/baileys/lib/Utils/generics');
const { MessageAttachment } = require('discord.js');
const QRCode = require('qrcode');
const state = require('./state');

const dbAuthName = 'baileyAuth';
const KEY_MAP = {
	'pre-key': 'preKeys',
	'session': 'sessions',
	'sender-key': 'senderKeys',
	'app-state-sync-key': 'appStateSyncKeys',
	'app-state-sync-version': 'appStateVersions',
	'sender-key-memory': 'senderKeyMemory',
};

const isMe = (myJID, jid) => {
	return jid.startsWith(jidToPhone(myJID)) && !jid.endsWith('@g.us');
};

const jidToPhone = (jid) => {
	return jid.split(':')[0].split('@')[0];
};

const formatJid = (jid) => {
	return jidToPhone(jid) + '@' + jid.split('@')[1];
};

module.exports = {
	useStorageAuthState: async () => {
		let creds;
		let keys = {};

		const saveState = () => {
			storage.upsert(dbAuthName, JSON.stringify({ creds, keys }, generics_1.BufferJSON.replacer));
		};

		const authData = await storage.get(dbAuthName);
		if (authData) {
			({ creds, keys } = JSON.parse(authData, generics_1.BufferJSON.reviver));
		}
		else {
			creds = initAuthCreds();
			keys = {};
		}

		return {
			authState: {
				creds,
				keys: {
					get: (type, ids) => {
						const key = KEY_MAP[type];
						return ids.reduce((dict, id) => {
							let _a;
							let value = (_a = keys[key]) === null || _a === void 0 ? void 0 : _a[id];
							if (value) {
								if (type === 'app-state-sync-key') {
									value = WAProto_1.proto.AppStateSyncKeyData.fromObject(value);
								}
								dict[id] = value;
							}
							return dict;
						}, {});
					},
					set: (data) => {
						for (const _key in data) {
							const key = KEY_MAP[_key];
							keys[key] = keys[key] || {};
							Object.assign(keys[key], data[_key]);
						}
						saveState();
					},
				},
			},
			saveState,
		};
	},
	sendQR: async (qrString) => {
		await (await state.getControlChannel()).send({ files: [new MessageAttachment(await QRCode.toBuffer(qrString), 'qrcode.png')] });
	},
	jidToName: (jid, pushName) => {
		if (isMe(state.waClient.user.id, jid)) { return 'You'; }
		return state.waClient.contacts[formatJid(jid)] || pushName || jidToPhone(jid);
	},
	contactNames: () => {
		return Object.values(state.waClient.contacts);
	},
	nameToJid: (name) => {
		if (!isNaN(name)) {
			return name + '@s.whatsapp.net';
		}
		return Object.keys(state.waClient.contacts).find(key => state.waClient.contacts[key].toLowerCase() === name);
	},
	updateContacts: (contacts) => {
		contacts = contacts.chats || contacts.contacts || contacts;
		for (const contact of contacts) {
			const name = contact.name || contact.subject;
			if (name) {
				state.waClient.contacts[contact.id] = name;
			}
		}
	},
	createDocumentContent: (attachment) => {
		let contentType = attachment.contentType.split('/')[0];
		contentType = ['image', 'video', 'audio'].includes(contentType) ? contentType : 'document';
		const documentContent = { mimetype: attachment.contentType.split(';')[0] };
		documentContent[contentType] = { url: attachment.url };
		if (contentType === 'document') {
			documentContent['fileName'] = attachment.name;
		}
		return documentContent;
	},
	createQuoteMessage: async (msg) => {
		const refMessage = await msg.channel.messages.fetch(msg.reference.messageId);
		return {
			key: { remoteJid: (refMessage.webhookId && refMessage.author.username !== 'You') ? exports.nameToJid(refMessage.author.username) : state.waClient.user.id },
			message: { conversation: refMessage.content },
		};
	},
	getWebhookAndSenderJid: (msg, fromMe) => {
		if (fromMe) {
			return { channelJid: formatJid(msg.key.remoteJid), senderJid: formatJid(state.waClient.user.id) };
		}
		return { channelJid: formatJid(msg.key.remoteJid), senderJid: formatJid(msg.key.participant || msg.key.remoteJid) };
	},
	getProfilePic: async (jid) => {
		if (state.profilePicsCache[jid] === undefined) {
			try {
				state.profilePicsCache[jid] = await state.waClient.profilePictureUrl(jid, 'preview');
			}
			catch {
				state.profilePicsCache[jid] = null;
			}
		}
		return state.profilePicsCache[jid];
	},
};