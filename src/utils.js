const { Webhook, MessageAttachment } = require('discord.js');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const readline = require('readline');
const QRCode = require('qrcode');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const stream = require('stream/promises');
const child_process = require('child_process');

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
    let name = 'WA2DC';
    switch (os.platform()) {
      case 'linux':
        name += '-Linux';
        break;
      case 'darwin':
        name += '-macOS';
        break;
      case 'win32':
        break;
      default:
        return '';
    }

    switch (process.arch) {
      case 'arm64':
        name += '-arm64'
        break;
      case 'x64':
        break;
      default:
        return '';
    }

    if (os.platform() === 'win32') {
      name += '.exe';
    }

    return name;
  },

  async downloadLatestVersion(defaultExeName, name) {
    return requests.downloadFile(name, `https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/${defaultExeName}`);
  },

  async downloadSignature(defaultExeName) {
    const signature = await requests.fetchBuffer(`https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/${defaultExeName}.sig`);
    if ('error' in signature) {
      console.log("Couldn't fetch the signature of the update.");
      return false;
    }
    return signature;
  },

  async validateSignature(signature, name) {
    return crypto.verify(
      'RSA-SHA256',
      fs.readFileSync(name),
      this.publicKey,
      signature,
    );
  },

  async update() {
    const currExeName = this.currentExeName;
    const defaultExeName = this.defaultExeName;
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

    const signature = await this.downloadSignature(defaultExeName);
    if (signature && !this.validateSignature(signature.result, currExeName)) {
      console.log("Couldn't verify the signature of the updated binary, reverting back. Please update manually.");
      this.revertChanges();
      return false;
    }
    this.cleanOldVersion();
    return true;
  },

  async run(currVer) {
    if (process.argv.some(arg => ['--skip-update', '-su'].includes(arg))) {
      console.log('Skipping update due to command line argument.');
      return;
    }

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

const sqliteToJson = {
  get defaultExeName() {
    let name = 'stj_';
    let osPlatform = os.platform()

    switch (osPlatform) {
      case 'linux':
      case 'darwin':
      case 'freebsd':
        name += osPlatform + "_";
        break;
      case 'win32':
        name += 'windows_';
        break;
      default:
        return '';
    }

    switch (process.arch) {
      case 'arm':
      case 'arm64':
        name += process.arch;
        break;
      case 'x64':
        name += 'amd64';
        break;
      default:
        return '';
    }

    if (osPlatform === 'win32') {
      name += '.exe'
    }
    return name;
  },

  async downloadLatestVersion(defaultExeName) {
    return requests.downloadFile(defaultExeName, `https://github.com/FKLC/sqlite-to-json/releases/latest/download/${defaultExeName}`);
  },

  async downloadSignature(defaultExeName) {
    const signature = await requests.fetchBuffer(`https://github.com/FKLC/sqlite-to-json/releases/latest/download/${defaultExeName}.sig`);
    if ('error' in signature) {
      console.log("Couldn't fetch the signature of the update.");
      return false;
    }
    return signature;
  },

  _storageDir: './storage/',
  _dbPath: './storage.db',
  isConverted() {
    return fs.existsSync(this._storageDir) || !fs.existsSync(this._dbPath);
  },

  async downloadAndVerify() {
    const exeName = this.defaultExeName;
    if (exeName == '') {
      console.log(`Automatic conversion of database is not supported on this platform and arch ${os.platform()}/${process.arch}. Please convert database manually`);
      return false;
    }

    const downloadStatus = await this.downloadLatestVersion(exeName);
    if (!downloadStatus) {
      console.log('Download failed! Please convert database manually.');
      return false;
    }

    const signature = await this.downloadSignature(exeName);
    if (signature && !updater.validateSignature(signature.result, exeName)) {
      console.log("Couldn't verify the signature of the database converter. Please convert database manually");
      fs.unlinkSync(exeName);
      return false;
    }

    return exeName;
  },

  runStj(exeName) {
    fs.mkdirSync(this._storageDir);
    if (os.platform() !== 'win32') {
      exeName = './' + exeName;
    }
    const child = child_process.spawnSync(exeName, [this._dbPath, '"SELECT * FROM WA2DC"'], { shell: true });

    const rows = child.stdout.toString().trim().split('\n');
    for (let i = 0; i < rows.length; i++) {
      const row = JSON.parse(rows[i]);
      fs.writeFileSync(path.join(this._storageDir, row[0]), row[1])
    }
  },

  async convert() {
    if (this.isConverted()) {
      return true;
    }

    const stjName = await this.downloadAndVerify();
    if (!stjName) {
      return false;
    }

    this.runStj(stjName);
    fs.unlinkSync(stjName);

    return true;
  },
}

const discord = {
  channelIdToJid(channelId) {
    return Object.keys(state.chats).find((key) => state.chats[key].channelId === channelId);
  },
  partitionText(text) {
    return text.match(/(.|[\r\n]){1,2000}/g) || [];
  },
  async getGuild() {
    return state.dcClient.guilds.fetch(state.settings.GuildID).catch((err) => { state.logger?.error(err) });
  },
  async getChannel(channelID) {
    return (await this.getGuild()).channels.fetch(channelID).catch((err) => { state.logger?.error(err) });
  },
  async getCategory(nthChannel) {
    const nthCategory = Math.floor((nthChannel + 1) / 50);
    if (state.settings.Categories[nthCategory] == null) {
      state.settings.Categories.push((await (await this.getGuild()).channels.create(`whatsapp ${nthCategory + 1}`, {
        type: 'GUILD_CATEGORY',
      })).id);
    }
    return state.settings.Categories[nthCategory];
  },
  async createChannel(name) {
    return (await this.getGuild()).channels.create(name, {
      type: 'GUILD_TEXT',
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
    const webhook = await channel.createWebhook('WA2DC');
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
  async safeWebhookSend(webhook, args, jid) {
    try {
      return await webhook.send(args);
    } catch (err) {
      if (err.code === 10015 && err.message.includes('Unknown Webhook')) {
        delete state.goccRuns[jid];
        const channel = await this.getChannel(state.chats[jid].channelId);
        webhook = await channel.createWebhook('WA2DC');
        state.chats[jid] = {
          id: webhook.id,
          type: webhook.type,
          token: webhook.token,
          channelId: webhook.channelId,
        };
        return await webhook.send(args);
      }
      throw err;
    }
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
        await guild.channels.create('whatsapp', {
          type: 'GUILD_CATEGORY',
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
  async renameChannels() {
    const guild = await this.getGuild();

    for (const [jid, webhook] of Object.entries(state.chats)) {
      const channel = await guild.channels.fetch(webhook.channelId);
      await channel.edit({
        name: whatsapp.jidToName(jid),
      });
    }
  },
  async getControlChannel() {
    return this.getChannel(state.settings.ControlChannelID);
  },
  async findAvailableName(dir, fileName) {
    let absPath;
    let parsedFName = path.parse(fileName);
    let counter = -1;
    do {
      absPath = path.resolve(dir, parsedFName.name + (counter === -1 ? "" : counter) + parsedFName.ext);
      counter++;
    } while (await fs.promises.stat(absPath).catch(() => false));
    return [absPath, parsedFName.name + (counter === -1 ? "" : counter) + parsedFName.ext];
  },
  async downloadLargeFile(file) {
    await fs.promises.mkdir(state.settings.DownloadDir, { recursive: true });
    const [absPath, fileName] = await this.findAvailableName(state.settings.DownloadDir, file.name);
    await fs.promises.writeFile(absPath, file.attachment);
    return this.formatDownloadMessage(absPath, path.resolve(state.settings.DownloadDir), fileName);
  },
  formatDownloadMessage(absPath, resolvedDownloadDir, fileName) {
    return state.settings.LocalDownloadMessage
      .replaceAll("{abs}", absPath)
      .replaceAll("{resolvedDownloadDir}", resolvedDownloadDir)
      .replaceAll("{downloadDir}", state.settings.DownloadDir)
      .replaceAll("{fileName}", fileName)
  }
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
      .send({ files: [new MessageAttachment(await QRCode.toBuffer(qrString), 'qrcode.png')] });
  },
  getChannelJid(rawMsg) {
    return this.formatJid(rawMsg?.key?.remoteJid || rawMsg.chatId);
  },
  getSenderJid(rawMsg, fromMe) {
    if (fromMe) { return this.formatJid(state.waClient.user.id); }
    return this.formatJid(rawMsg?.key?.participant || rawMsg?.key?.remoteJid || rawMsg?.chatId || rawMsg?.jid);
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
      return ["documentMessage", rawMsg.message[msgType].message.documentMessage];
    }
    else if (msgType === 'viewOnceMessageV2') {
      const nMsgType = this.getMessageType(rawMsg.message[msgType]);
      return [nMsgType, rawMsg.message[msgType].message[nMsgType]];
    }
    else if (msgType === 'editedMessage') {
      const nMsgType = this.getMessageType({ message: rawMsg.message[msgType].message.protocolMessage.editedMessage });
      return [nMsgType, rawMsg.message[msgType].message.protocolMessage.editedMessage[nMsgType]];
    }
    return [msgType, rawMsg.message[msgType]];
  },
  getFilename(msg, msgType) {
    if (msgType === 'audioMessage') {
      return 'audio.ogg';
    }
    else if ('documentMessage' === msgType) {
      return msg.fileName;
    }
    return `${msgType}.${msg.mimetype.split('/')[1]}`;
  },
  async getFile(rawMsg, msgType) {
    const [nMsgType, msg] = this.getMessage(rawMsg, msgType);
    if (msg.fileLength == null) return;
    if (msg.fileLength.low > 26214400 && !state.settings.LocalDownloads) return -1;
    return {
      name: this.getFilename(msg, nMsgType),
      attachment: await downloadMediaMessage(rawMsg, 'buffer', {}, { logger: state.logger, reuploadRequest: state.waClient.updateMediaMessage }),
      largeFile: msg.fileLength.low > 26214400,
    };
  },
  inWhitelist(rawMsg) {
    return state.settings.Whitelist.length === 0 || state.settings.Whitelist.includes(rawMsg?.key?.remoteJid || rawMsg.chatId);
  },
  sentAfterStart(rawMsg) {
    return (rawMsg?.messageTimestamp || rawMsg?.reaction?.senderTimestampMs || rawMsg?.date?.getTime() / 1000) > state.startTime;
  },
  getMessageType(rawMsg) {
    return ['conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'documentWithCaptionMessage', 'viewOnceMessageV2', 'stickerMessage', 'editedMessage'].find((el) => Object.hasOwn(rawMsg.message || {}, el));
  },
  _profilePicsCache: {},
  async getProfilePic(rawMsg) {
    const jid = this.getSenderJid(rawMsg, rawMsg?.key?.fromMe);
    if (this._profilePicsCache[jid] === undefined) {
      this._profilePicsCache[jid] = await state.waClient.profilePictureUrl(jid, 'preview').catch(() => null);
    }
    return this._profilePicsCache[jid];
  },
  getId(rawMsg) {
    return rawMsg.key.id;
  },
  getContent(msg, nMsgType, msgType) {
    let content = '';
    if (msgType === 'viewOnceMessageV2') {
      content += 'View once message:\n';
    }
    switch (nMsgType) {
      case 'conversation':
        content += msg;
        break;
      case 'extendedTextMessage':
        content += msg.text;
        break;
      case 'imageMessage':
      case 'videoMessage':
      case 'audioMessage':
      case 'documentMessage':
      case 'documentWithCaptionMessage':
      case 'stickerMessage':
        content += msg.caption || '';
        break;
    }
    return content;
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
    const documentContent = {};
    if (contentType === 'document') {
      documentContent['mimetype'] = attachment.contentType.split(';')[0];
    }
    documentContent[contentType] = { url: attachment.url };
    if (contentType === 'document') {
      documentContent.fileName = attachment.name;
    }
    if (attachment.name === 'voice-message.ogg') {
      documentContent['ptt'] = true;
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

  async deleteSession() {
    const dir = './storage/baileys';
    const files = await fs.promises.readdir(dir);
    for (let file of files) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
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
  updater, discord, whatsapp, sqliteToJson
};
