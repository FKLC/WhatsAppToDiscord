const getGuild = () => module.exports.dcClient.guilds.cache.get(module.exports.settings.GuildID);
const getCategory = () => module.exports.dcClient.channels.cache.get(module.exports.settings.CategoryID);
const getControlChannel = () => module.exports.dcClient.channels.cache.get(module.exports.settings.ControlChannelID);

module.exports = {
	settings: {},
	dcClient: null,
	waClient: null,
	chats: {},
	contacts: {},
	startTime: (Date.now() / 1000) | 0,
	profilePicsCache: {},
	logger: null,

	getGuild,
	getCategory,
	getControlChannel,
};