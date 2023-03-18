const { Webhook, AttachmentBuilder, ChannelType } =  require('discord.js');
const { downloadMediaMessage } =  require('@adiwajshing/baileys');
const stream =  require('stream/promises');

const readline = require('readline');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const useStorageAuthState = require('./useStorageAuthState.js');
const state = require('./state.js');
  

const updater = {
  isNode: process.argv0.replace('.exe', '').endsWith('node'),

  currentExeName: process.argv0.split(/[/\\]/).pop(),

  async renameOldVersion() {
    await fs.promises.rename(this.currentExeName, `${this.currentExeName}.oldVersion`);
  },

  cleanOldVersion() {
    fs.unlink(`${this.currentExeName}.oldVersion`, () => 0);
  },

  revertChanges() {
    fs.unlink(this.currentExeName, () => {
      fs.rename(`${this.currentExeName}.oldVersion`, this.currentExeName, () => 0);
    });
  },

  async fetchLatestVersion() {
    const response = await requests.fetchJson('https://api.github.com/repos/FKLC/WhatsAppToDiscord/releases/latest');
    if ('error' in response) {
      state.logger.error(response.error);
      return null;
    }
    if ('tag_name' in response.result && 'body' in response.result) {
      return {
        version: response.result.tag_name,
        changes: response.result.body,
      };
    }
    state.logger.error("Tag name wasn't in result");
    return null;
  },

  get defaultExeName() {
    switch (os.platform()) {
      case 'linux':
        return 'WA2DC-Linux';
      case 'darwin':
        return 'WA2DC-macOS';
      case 'win32':
        return 'WA2DC.exe';
      default:
        return '';
    }
  },

  async downloadLatestVersion(executableName, name) {
    return requests.downloadFile(name, `https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/${executableName}`);
  },

  async validateSignature(defaultExeName, name) {
    const signature = await requests.fetchBuffer(`https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/${defaultExeName}.sig`);
    if ('error' in signature) {
      console.log("Couldn't fetch the signature of the update.");
      return false;
    }
    return crypto.verify(
      'RSA-SHA256',
      fs.readFileSync(name),
      this.publicKey,
      signature.result,
    );
  },

  async update() {
    const currExeName = this.currentExeName;
    const { defaultExeName } = this;
    if (!defaultExeName) {
      console.log(`Auto-update is not supported on this platform: ${os.platform()}`);
      return false;
    }

    await this.renameOldVersion();
    const downloadStatus = await this.downloadLatestVersion(defaultExeName, currExeName);
    if (!downloadStatus) {
      console.log('Download failed! Skipping update.');
      return false;
    }
    if (!(await this.validateSignature(currExeName, defaultExeName))) {
      console.log("Couldn't verify the signature of the updated binary, reverting back. Please update manually.");
      this.revertChanges();
      return false;
    }
    this.cleanOldVersion();
    return true;
  },

  async run(currVer) {
    if (this.isNode) {
      console.log('Running script with node. Skipping auto-update.');
      return;
    }

    this.cleanOldVersion();
    const newVer = await this.fetchLatestVersion();
    if (newVer === null) {
      console.log('Something went wrong with auto-update.');
      return;
    }

    if (newVer.version === currVer) {
      return;
    }

    const prompt = (await ui.input(`A new version is available ${currVer} -> ${newVer.version}. Changelog: ${newVer.changes}\nDo you want to update? (Y/N) `)).toLowerCase();
    if (prompt !== 'y') {
      console.log('Skipping update.');
      return;
    }

    console.log('Please wait as the bot downloads the new version.');
    const exeName = await updater.update();
    if (exeName) {
      await ui.input(`Updated WA2DC. Hit enter to exit and run ${this.currentExeName}.`);
      process.exit();
    }
  },

  publicKey: '-----BEGIN PUBLIC KEY-----\n'
        + 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArwZEUsgdgeAmr5whnpsO\n'
        + 'hvdp222eepTpxp23GmrOdXHnSDitSaU8St9ViKDUOlEWOx+61Y3DpBetycgFcawz\n'
        + 'bKFxm2UNwMqW/8sg/cvh8BGJ2IGor8etC6KRUclDLvtzCl8j95S9tIzBBheVRLx9\n'
        + '+RtLNyzZBzn9GTZXdlO368u34fHrCYwoEFJfTXbEb2LnlbMGyjo4C/We6xWmRVEz\n'
        + 'XoygOglAgJYuQjpCfjUhfcP/bOh/mLOgpX0kuJzp/0dSMx4qvJhBPe7fGXesGJQ9\n'
        + 'x+cgcRR8fzN9gowrhltAb73PFYECiOYFYQS8bHMJX/jcQiYKqUuQCWS/wcbkYz+s\n'
        + 'OwIDAQAB\n'
        + '-----END PUBLIC KEY-----',
};

const discord = {
  channelIdToJid(channelId) {
    return Object.keys(state.chats).find((key) => state.chats[key].channelId === channelId);
  },
  partitionText(text) {
    return text.match(/(.|[\r\n]){1,2000}/g) || [];
  },
  async getGuild() {
    return state.dcClient.guilds.fetch(state.settings.GuildID).catch(() => null);
  },
  async getChannel(channelID) {
    return (await this.getGuild()).channels.fetch(channelID).catch(() => null);
  },
  async getCategory(nthChannel) {
    const nthCategory = Math.floor((nthChannel + 1) / 50);
    if (state.settings.Categories[nthCategory] == null) {
      state.settings.Categories.push((await (await this.getGuild()).channels.create({
        name: `whatsapp ${nthCategory + 1}`,
        type: ChannelType.GuildCategory,
      })).id);
    }
    return state.settings.Categories[nthCategory];
  },
  async createChannel(name) {
    return (await this.getGuild()).channels.create({
      name,
      type: ChannelType.GuildText,
      parent: await this.getCategory(Object.keys(state.chats).length + this._unfinishedGoccCalls),
    });
  },
  _unfinishedGoccCalls: 0,
  async getOrCreateChannel(jid) {
    if (state.goccRuns[jid]) { return state.goccRuns[jid]; }
    let resolve;
    state.goccRuns[jid] = new Promise((res) => {
      resolve = res;
    });
    if (state.chats[jid]) {
      const webhook = new Webhook(state.dcClient, state.chats[jid]);
      resolve(webhook);
      return webhook;
    }

    this._unfinishedGoccCalls++;
    const name = whatsapp.jidToName(jid);
    const channel = await this.createChannel(name).catch((err) => {
      if (err.code === 50035) {
        return this.createChannel('invalid-name');
      }
      throw err;
    });
    const webhook = await channel.createWebhook({ name: 'WA2DC' });
    state.chats[jid] = {
      id: webhook.id,
      type: webhook.type,
      token: webhook.token,
      channelId: webhook.channelId,
    };
    this._unfinishedGoccCalls--;
    resolve(webhook);
    return webhook;
  },
  async repairChannels() {
    const guild = await this.getGuild();
    await guild.channels.fetch();

    if (state.settings.Categories == null) {
      state.settings.Categories = [state.settings.CategoryID];
    }
    const categoryExists = await guild.channels.fetch(state.settings.Categories?.[0]).catch(() => null);
    const controlExists = await guild.channels.fetch(state.settings.ControlChannelID).catch(() => null);

    if (!categoryExists) {
      state.settings.Categories[0] = (
        await guild.channels.create({
          name: 'whatsapp',
          type: ChannelType.GuildCategory,
        })
      ).id;
    }

    if (!controlExists) {
      state.settings.ControlChannelID = (await this.createChannel('control-room')).id;
    }

    await (await guild.channels.fetch(state.settings.ControlChannelID)).edit({
      position: 0,
      parent: state.settings.Categories[0],
    });
    for (const [jid, webhook] of Object.entries(state.chats)) {
      guild.channels.fetch(webhook.channelId).catch(() => {
        delete state.chats[jid];
      });
    }

    for await (const categoryId of state.settings.Categories) {
      const category = await guild.channels.fetch(categoryId).catch(() => null);
      if (category == null) { state.settings.Categories = state.settings.Categories.filter((id) => categoryId !== id); }
    }

    for (const [, channel] of guild.channels.cache) {
      if (channel.id !== state.settings.ControlChannelID && state.settings.Categories.includes(channel.parentId) && !this.channelIdToJid(channel.id)) {
        channel.edit({ parent: null });
      }
    }
  },
  async getControlChannel() {
    return this.getChannel(state.settings.ControlChannelID);
  },
};

const whatsapp = {
  jidToPhone(jid) {
    return jid.split(':')[0].split('@')[0];
  },
  formatJid(jid) {
    return `${this.jidToPhone(jid)}@${jid.split('@')[1]}`;
  },
  isMe(myJID, jid) {
    return jid.startsWith(this.jidToPhone(myJID)) && !jid.endsWith('@g.us');
  },
  jidToName(jid, pushName) {
    if (this.isMe(state.waClient.user.id, jid)) { return 'You'; }
    return state.waClient.contacts[this.formatJid(jid)] || pushName || this.jidToPhone(jid);
  },
  toJid(name) {
    // eslint-disable-next-line no-restricted-globals
    if (!isNaN(name)) { return `${name}@s.whatsapp.net`; }
    return Object.keys(state.waClient.contacts).find((key) => state.waClient.contacts[key].toLowerCase().trim() === name.toLowerCase().trim());
  },
  contacts() {
    return Object.values(state.waClient.contacts);
  },
  async sendQR(qrString) {
    await (await discord.getControlChannel())
      .send({ files: [new AttachmentBuilder(await QRCode.toBuffer(qrString), { name: 'qrcode.png' })] });
  },
  getChannelJid(rawMsg) {
    return this.formatJid(rawMsg.key.remoteJid);
  },
  getSenderJid(rawMsg, fromMe) {
    if (fromMe) { return this.formatJid(state.waClient.user.id); }
    return this.formatJid(rawMsg.key.participant || rawMsg.key.remoteJid);
  },
  getSenderName(rawMsg) {
    return this.jidToName(this.getSenderJid(rawMsg, rawMsg.key.fromMe), rawMsg.pushName);
  },
  isGroup(rawMsg) {
    return rawMsg.key.participant != null;
  },
  isForwarded(msg) {
    return msg.contextInfo?.isForwarded;
  },
  isQuoted(msg) {
    return msg.contextInfo?.quotedMessage;
  },
  getQuote(msg) {
    if (this.isQuoted(msg)) {
      return {
        name: this.jidToName(msg.contextInfo.participant || ''),
        content: msg.contextInfo.quotedMessage.conversation,
      };
    }
  },
  getMessage(rawMsg, msgType) {
    if (msgType === 'documentWithCaptionMessage') {
      return rawMsg.message[msgType].message.documentMessage;
    }
    return rawMsg.message[msgType];
  },
  getFilename(msg, msgType) {
    if (msgType === 'audioMessage') {
      return 'audio.ogg';
    }
    if (['documentWithCaptionMessage', 'documentMessage'].includes(msgType)) {
      return msg.fileName;
    }
    return `${msgType}.${msg.mimetype.split('/')[1]}`;
  },
  async getFile(rawMsg, msgType) {
    const msg = this.getMessage(rawMsg, msgType);
    if (msg.fileLength == null) return;
    if (msg.fileLength.low > 8388284) return -1;
    return {
      name: this.getFilename(msg, msgType),
      attachment: await downloadMediaMessage(rawMsg, 'buffer', {}, { logger: state.logger, reuploadRequest: state.waClient.updateMediaMessage }),
    };
  },
  inWhitelist(rawMsg) {
    return state.settings.Whitelist.length === 0 || state.settings.Whitelist.includes(rawMsg.key.remoteJid);
  },
  sentAfterStart(rawMsg) {
    return (rawMsg.messageTimestamp || rawMsg.reaction.senderTimestampMs) > state.startTime;
  },
  getMessageType(rawMsg) {
    return ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'documentWithCaptionMessage', 'stickerMessage'].find((el) => Object.hasOwn(rawMsg.message || {}, el));
  },
  _profilePicsCache: {},
  async getProfilePic(rawMsg) {
    const jid = this.getSenderJid(rawMsg);
    if (this._profilePicsCache[jid] === undefined) {
      try {
        this._profilePicsCache[jid] = await state.waClient.profilePictureUrl(jid, 'preview');
      } catch {
        this._profilePicsCache[jid] = null;
      }
    }
    return this._profilePicsCache[jid];
  },
  getId(rawMsg) {
    return rawMsg.key.id;
  },
  getContent(msg, msgType) {
    switch (msgType) {
      case 'conversation':
        return msg;
      case 'extendedTextMessage':
        return msg.text;
      case 'imageMessage':
      case 'videoMessage':
      case 'audioMessage':
      case 'documentMessage':
      case 'documentWithCaptionMessage':
      case 'stickerMessage':
        return msg.caption || '';
      default:
        return '';
    }
  },
  updateContacts(rawContacts) {
    const contacts = rawContacts.chats || rawContacts.contacts || rawContacts;
    for (const contact of contacts) {
      const name = contact.name || contact.subject;
      if (name) {
        state.waClient.contacts[contact.id] = name;
      }
    }
  },
  createDocumentContent(attachment) {
    let contentType = attachment.contentType.split('/')[0];
    contentType = ['image', 'video', 'audio'].includes(contentType) ? contentType : 'document';
    const documentContent = { mimetype: attachment.contentType.split(';')[0] };
    documentContent[contentType] = { url: attachment.url };
    if (contentType === 'document') {
      documentContent.fileName = attachment.name;
    }
    return documentContent;
  },
  async createQuoteMessage(message) {
    const refMessage = await message.channel.messages.fetch(message.reference.messageId);
    if (state.lastMessages[refMessage.id] == null) return null;
    return {
      key: {
        remoteJid: refMessage.webhookId && refMessage.author.username !== 'You' ? this.toJid(refMessage.author.username) : state.waClient.user.id,
        id: state.lastMessages[refMessage.id],
      },
      message: { conversation: refMessage.content },
    };
  },
  useStorageAuthState,
};

const requests = {
  async fetchJson(url, options) {
    return fetch(url, options)
      .then((resp) => resp.json())
      .then((result) => ({ result }))
      .catch((error) => {
        state.logger?.error(error);
        return { error };
      });
  },

  async fetchText(url, options) {
    return fetch(url, options)
      .then((resp) => resp.text())
      .then((result) => ({ result }))
      .catch((error) => {
        state.logger?.error(error);
        return { error };
      });
  },

  async fetchBuffer(url, options) {
    return fetch(url, options)
      .then((resp) => resp.arrayBuffer())
      .then((buffer) => Buffer.from(buffer))
      .then((result) => ({ result }))
      .catch((error) => {
        state.logger?.error(error);
        return { error };
      });
  },

  async downloadFile(path, url, options) {
    const readable = await fetch(url, options).then((resp) => resp.body).catch((error) => {
      state.logger?.error(error);
      return null;
    });
    if (readable == null) return false;

    return stream.pipeline(readable, fs.createWriteStream(path)).then(() => true).catch((error) => {
      state.logger?.error(error);
      return false;
    });
  },
};

const ui = {
  async input(query) {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question(query, (answer) => {
        resolve(answer);
        rl.close();
      });
    });
  },
};

module.exports = {
  updater, discord, whatsapp,
};
