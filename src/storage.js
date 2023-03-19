const sequelize = require('sequelize');
const readline = require('readline');
const state = require('./state.js');
const { Client, GatewayIntentBits, ChannelType } = require('discord.js');


const storage = {
  _connection: null,
  get connection() {
    if (this._connection) return this._connection;
    this._connection = new sequelize.Sequelize('sqlite://storage.db', {
      logging: false,
      define: {
        timestamps: false,
        freezeTableName: true,
      },
    });
    return this._connection;
  },

  _table: null,
  get table() {
    if (this._table) return this._table;
    this._table = this.connection.define('WA2DC', {
      name: {
        type: sequelize.STRING,
        primaryKey: true,
      },
      data: sequelize.TEXT,
    });
    return this._table;
  },

  async syncTable() {
    await this.table.sync();
  },

  async upsert(name, data) {
    await this.table.upsert({ name, data });
  },

  async get(name) {
    const result = await this.table.findOne({ where: { name } });
    return result == null ? null : result.get('data');
  },

  _settingsName: 'settings',
  _defaultSettings: {
    Whitelist: [],
    DiscordPrefix: false,
    WAGroupPrefix: false,
    UploadAttachments: true,
  },
  async parseSettings() {
    const result = await this.get(this._settingsName);
    if (result == null) {
      return setup.firstRun();
    }

    try {
      const settings = Object.assign(this._defaultSettings, JSON.parse(result));
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

  async save() {
    for await (const field of [this._settingsName, this._chatsName, this._contactsName]) {
      await this.upsert(field, JSON.stringify(state[field]));
    }
  },
};

const setup = {
  async setupDiscordChannels(token) {
    return new Promise((resolve) => {
      const client = new Client({ intents: [GatewayIntentBits.Guilds] });
      client.once('ready', () => {
        console.log(`Invite the bot using the following link: https://discordapp.com/oauth2/authorize?client_id=${client.user.id}&scope=bot&permissions=536879120`);
      });
      client.once('guildCreate', async (guild) => {
        const category = await guild.channels.create({
          name: 'whatsapp',
          type: ChannelType.GuildCategory,
        });
        const controlChannel = await guild.channels.create({
          name: 'control-room',
          type: ChannelType.GuildText,
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
    const settings = storage._defaultSettings;
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
    settings.Token = await input('Please enter your bot token: ');
    Object.assign(settings, await this.setupDiscordChannels(settings.Token));
    return settings;
  },
};

module.exports = storage;