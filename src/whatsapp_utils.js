const { MessageAttachment } = require('discord.js');
const QRCode = require('qrcode');
const state = require('./state');
const useStorageAuthState = require('./useStorageAuthState');

const jidToPhone = (jid) => jid.split(':')[0].split('@')[0];
const isMe = (myJID, jid) => jid.startsWith(jidToPhone(myJID)) && !jid.endsWith('@g.us');
const formatJid = (jid) => `${jidToPhone(jid)}@${jid.split('@')[1]}`;
const profilePicsCache = {};

module.exports = {
  useStorageAuthState,
  sendQR: async (qrString) => {
    await (await state.getControlChannel()).send({ files: [new MessageAttachment(await QRCode.toBuffer(qrString), 'qrcode.png')] });
  },
  jidToName: (jid, pushName) => {
    if (isMe(state.waClient.user.id, jid)) {
      return 'You';
    }
    return state.waClient.contacts[formatJid(jid)] || pushName || jidToPhone(jid);
  },
  contactNames: () => Object.values(state.waClient.contacts),
  nameToJid: (name) => {
    // eslint-disable-next-line no-restricted-globals
    if (!isNaN(name)) {
      return `${name}@s.whatsapp.net`;
    }
    return Object.keys(state.waClient.contacts).find((key) => state.waClient.contacts[key].toLowerCase() === name.toLowerCase());
  },
  updateContacts: (rawContacts) => {
    const contacts = rawContacts.chats || rawContacts.contacts || rawContacts;
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
      documentContent.fileName = attachment.name;
    }
    return documentContent;
  },
  createQuoteMessage: async (msg) => {
    const refMessage = await msg.channel.messages.fetch(msg.reference.messageId);
    if (state.lastMessages[refMessage.id] == null) {
      return null;
    }
    return {
      key: {
        remoteJid: refMessage.webhookId && refMessage.author.username !== 'You' ? module.exports.nameToJid(refMessage.author.username) : state.waClient.user.id,
        id: state.lastMessages[refMessage.id],
      },
      message: { conversation: refMessage.content },
    };
  },
  getWebhookAndSenderJid: (msg, fromMe) => {
    if (fromMe) {
      return {
        channelJid: formatJid(msg.key.remoteJid),
        senderJid: formatJid(state.waClient.user.id),
      };
    }
    return {
      channelJid: formatJid(msg.key.remoteJid),
      senderJid: formatJid(msg.key.participant || msg.key.remoteJid),
    };
  },
  getProfilePic: async (jid) => {
    if (profilePicsCache[jid] === undefined) {
      try {
        profilePicsCache[jid] = await state.waClient.profilePictureUrl(jid, 'preview');
      } catch {
        profilePicsCache[jid] = null;
      }
    }
    return profilePicsCache[jid];
  },
};
