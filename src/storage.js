const readline = require('readline');
const fs = require('fs/promises');
const path = require('path');
const { Client, Intents } = require('discord.js');

const state = require('./state.js');

const bidirectionalMap = (capacity, data = {}) => {
  const keys = Object.keys(data);
  return new Proxy(
    data,
    {
      set(target, prop, newVal) {
        keys.push(prop, newVal);
        if (keys.length > capacity) {
          delete target[keys.shift()];
          delete target[keys.shift()];
        }
        target[prop] = newVal;
        target[newVal] = prop;
        return true;
      },
    },
  );
};

const storage = {
  _storageDir: './storage/',
  async upsert(name, data) {
    await fs.writeFile(path.join(this._storageDir, name), data)
  },

  async get(name) {
    return fs.readFile(path.join(this._storageDir, name)).catch(() => null)
  },

  _settingsName: 'settings',
  async parseSettings() {
    const result = await this.get(this._settingsName);
    if (result == null) {
      return setup.firstRun();
    }

    try {
      const settings = Object.assign(state.settings, JSON.parse(result));
      if (settings.Token === '') return setup.firstRun();
      return settings;
    } catch (err) {
      return setup.firstRun();
    }
  },

  _chatsName: 'chats',
  async parseChats() {
    const result = await this.get(this._chatsName);
    return result ? JSON.parse(result) : {};
  },

  _contactsName: 'contacts',
  async parseContacts() {
    const result = await this.get(this._contactsName);
    return result ? JSON.parse(result) : {};
  },

  _lastMessagesName: 'lastMessages',
  async parseLastMessages() {
    const result = await this.get(this._lastMessagesName);
    return result ? bidirectionalMap(1000, JSON.parse(result)) : bidirectionalMap(1000);
  },

  async save() {
    for await (const field of [this._settingsName, this._chatsName, this._contactsName, this._lastMessagesName]) {
      await this.upsert(field, JSON.stringify(state[field]));
    }
  },
};

const setup = {
  async setupDiscordChannels(token) {
    return new Promise((resolve) => {
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
        client.destroy();
        resolve({
          GuildID: guild.id,
          Categories: [category.id],
          ControlChannelID: controlChannel.id,
        });
      });
      client.login(token);
    });
  },

  async firstRun() {
    const settings = state.settings;
    console.log('It seems like this is your first run.');
    const input = async (query) => {
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
    };
    settings.Token = process.env.WA2DC_TOKEN || await input('Please enter your bot token: ');
    Object.assign(settings, await this.setupDiscordChannels(settings.Token));
    return settings;
  },
};

module.exports = storage;