const readline = require('readline');
const fetch = require('node-fetch');

const storage = require('./storage_manager');
const { setupDiscordChannels } = require('./discord_utils');
const updater = require('./updater');
const state = require('./state');


const input = async (query) => await new Promise(resolve => {
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});
	rl.question(query, (answer) => {
		resolve(answer);
		rl.close();
	});
});

const defaultSettings = {
	Whitelist: [],
	DiscordPrefix: false,
	WAGroupPrefix: false,
	UploadAttachments: true,
};

const firstRun = async () => {
	const settings = Object.assign({}, defaultSettings);
	console.log('It seems like this is your first run.');
	settings.Token = process.env.DATABASE_URL || await input('Please enter your bot token: ');
	Object.assign(settings, await setupDiscordChannels(settings.Token));
	return settings;
};

const dbSettingsName = 'settings';
const dbContactsName = 'contacts';
const dbChatsName = 'chats';

module.exports = {
	parseSettings: async () => {
		const result = await storage.get(dbSettingsName);
		if (result == null) {
			return await firstRun();
		}
		else {
			try {
				return Object.assign(JSON.parse(result), defaultSettings);
			}
			catch (err) {
				return await firstRun();
			}
		}
	},
	parseContacts: async () => {
		const result = await storage.get(dbContactsName);
		return result ? JSON.parse(result) : {};
	},
	parseChats: async () => {
		const result = await storage.get(dbChatsName);
		return result ? JSON.parse(result) : {};
	},
	save: async () => {
		await storage.upsert(dbSettingsName, JSON.stringify(state.settings));
		await storage.upsert(dbContactsName, JSON.stringify(state.contacts));
		await storage.upsert(dbChatsName, JSON.stringify(state.chats));
		await state.dcClient.destroy();
	},
	checkVersion: async (currVer) => {
		const latestInfo = await (await fetch('https://api.github.com/repos/FKLC/WhatsAppToDiscord/releases/latest')).json();
		if (latestInfo['tag_name'] !== currVer) {
			console.log(`A new version is available (${currVer} -> ${latestInfo['tag_name']}). Trying to auto-update. Please wait as the bot downloads the new version.`);
			const exeName = await updater.update();
			if (exeName) {
				await input(`Updated WA2DC. Hit enter to exit and run ${exeName}.`);
				process.exit();
			}
		}
	},
};