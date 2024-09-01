const baileys = require('@whiskeysockets/baileys');

const utils = require('./utils.js');
const state = require("./state.js");


let authState;
let saveState;

const connectToWhatsApp = async (retry = 1) => {
    const controlChannel = await utils.discord.getControlChannel();
    const { version } = await baileys.fetchLatestBaileysVersion();

    const client = baileys.default({
        version,
        printQRInTerminal: false,
        auth: authState,
        logger: state.logger,
        markOnlineOnConnect: false,
        shouldSyncHistoryMessage: () => false,
        generateHighQualityLinkPreview: false,
        browser: ["Firefox (Linux)", "", ""]
    });
    client.contacts = state.contacts;

    client.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            utils.whatsapp.sendQR(qr);
        }
        if (connection === 'close') {
            state.logger.error(lastDisconnect.error);
            if (retry <= 3) {
                await controlChannel.send(`WhatsApp connection failed! Trying to reconnect! Retry #${retry}`);
                await connectToWhatsApp(retry + 1);
            } else if (retry <= 5) {
                const delay = (retry - 3) * 10;
                await controlChannel.send(`WhatsApp connection failed! Waiting ${delay} seconds before trying to reconnect! Retry #${retry}.`);
                await new Promise((resolve) => { setTimeout(resolve, delay * 1000); });
                await connectToWhatsApp(retry + 1);
            } else {
                await controlChannel.send('Connection failed 5 times. Please rescan the QR code.');
                await utils.whatsapp.deleteSession();
                await actions.start(true);
            }
        } else if (connection === 'open') {
            state.waClient = client;
            // eslint-disable-next-line no-param-reassign
            retry = 1;
            await controlChannel.send('WhatsApp connection successfully opened!');
        }
    });
    client.ev.on('creds.update', saveState);
    ['chats.set', 'contacts.set', 'chats.upsert', 'chats.update', 'contacts.upsert', 'contacts.update', 'groups.upsert', 'groups.update'].forEach((eventName) => client.ev.on(eventName, utils.whatsapp.updateContacts));

    client.ev.on('messages.upsert', async (update) => {
        if (update.type === 'notify') {
            for await (const rawMessage of update.messages) {
                const messageType = utils.whatsapp.getMessageType(rawMessage);
                if (!utils.whatsapp.inWhitelist(rawMessage) || !utils.whatsapp.sentAfterStart(rawMessage) || !messageType) continue;

                const [nMsgType, message] = utils.whatsapp.getMessage(rawMessage, messageType);
                state.dcClient.emit('whatsappMessage', {
                    id: utils.whatsapp.getId(rawMessage),
                    name: utils.whatsapp.getSenderName(rawMessage),
                    content: utils.whatsapp.getContent(message, nMsgType, messageType),
                    quote: utils.whatsapp.getQuote(message),
                    file: await utils.whatsapp.getFile(rawMessage, messageType),
                    profilePic: await utils.whatsapp.getProfilePic(rawMessage),
                    channelJid: utils.whatsapp.getChannelJid(rawMessage),
                    isGroup: utils.whatsapp.isGroup(rawMessage),
                    isForwarded: utils.whatsapp.isForwarded(message),
                    isEdit: messageType === 'editedMessage'
                });
            }
        }
    });

    client.ev.on('messages.reaction', async (reactions) => {
        for await (const rawReaction of reactions) {
            if (!utils.whatsapp.inWhitelist(rawReaction) || !utils.whatsapp.sentAfterStart(rawReaction))
                return;

            state.dcClient.emit('whatsappReaction', {
                id: utils.whatsapp.getId(rawReaction),
                jid: utils.whatsapp.getChannelJid(rawReaction),
                text: rawReaction.reaction.text,
            });
        }
    });

    client.ev.on('call', async (calls) => {
        for await (const call of calls) {
            if (!utils.whatsapp.inWhitelist(call) || !utils.whatsapp.sentAfterStart(call))
                return;

            state.dcClient.emit('whatsappCall', {
                jid: utils.whatsapp.getChannelJid(call),
                call,
            });
        }
    });

    client.ev.on('contacts.update', async (contacts) => {
        for await (const contact of contacts) {
            if (typeof contact.imgUrl === 'undefined') continue;
            if (!utils.whatsapp.inWhitelist({ chatId: contact.id })) continue;

            utils.whatsapp._profilePicsCache[contact.id] = await client.profilePictureUrl(contact.id, 'preview').catch(() => null);

            if (!state.settings.ChangeNotifications) continue;
            const removed = utils.whatsapp._profilePicsCache[contact.id] === null;
            state.dcClient.emit('whatsappMessage', {
                id: null,
                name: "WA2DC",
                content: "[BOT] " + (removed ? "User removed their profile picture!" : "User changed their profile picture!"),
                profilePic: utils.whatsapp._profilePicsCache[contact.id],
                channelJid: utils.whatsapp.getChannelJid({ chatId: contact.id }),
                isGroup: contact.id.endsWith('@g.us'),
                isForwarded: false,
                file: removed ? null : await client.profilePictureUrl(contact.id, 'image').catch(() => null),
            });
        }
    });

    client.ws.on(`CB:notification,type:status,set`, async (update) => {
        if (!utils.whatsapp.inWhitelist({ chatId: update.attrs.from })) return;

        if (!state.settings.ChangeNotifications) return;
        const status = update.content[0]?.content?.toString();
        if (!status) return;
        state.dcClient.emit('whatsappMessage', {
            id: null,
            name: "WA2DC",
            content: "[BOT] User changed their status to: " + status,
            profilePic: utils.whatsapp._profilePicsCache[update.attrs.from],
            channelJid: utils.whatsapp.getChannelJid({ chatId: update.attrs.from }),
            isGroup: update.attrs.from.endsWith('@g.us'),
            isForwarded: false,
        });
    });

    client.ev.on('discordMessage', async ({ jid, message }) => {
        if ((state.settings.oneWay >> 1 & 1) === 0) {
            return;
        }

        const content = {};
        const options = {};

        // Obtém o nome do usuário do Discord
        const username = message.author.username;

        if (state.settings.UploadAttachments) {
            await Promise.all(message.attachments.map((file) =>
                client.sendMessage(jid, utils.whatsapp.createDocumentContent(file))
                    .then(m => { state.lastMessages[message.id] = m.key.id })
            ));
            content.text = message.content || "";
        } else {
            content.text = [message.content, ...Object.values(message.attachments).map((file) => file.url)].join(' ');
        }

        // Adiciona o nome do usuário em negrito seguido de dois pontos
        content.text = `*${username}*:\n${content.text}`;

        if (message.reference) {
            options.quoted = await utils.whatsapp.createQuoteMessage(message);
            if (options.quoted == null) {
                message.channel.send("Couldn't find the message quoted. You can only reply to last 500 messages. Sending the message without the quoted message.");
            }
        }

        if (message.content === "") return;

        // Envia a mensagem formatada com o nome do usuário em negrito
        state.lastMessages[message.id] = (await client.sendMessage(jid, content, options)).key.id;
    });

    client.ev.on('discordEdit', async ({ jid, message }) => {
        if ((state.settings.oneWay >> 1 & 1) === 0) {
            return;
        }

        const key = {
            id: state.lastMessages[message.id],
            fromMe: message.webhookId == null || message.author.username === 'You',
            remoteJid: jid,
        };

        if (jid.endsWith('@g.us')) {
            key.participant = utils.whatsapp.toJid(message.author.username);
        }

        await client.sendMessage(
            jid,
            {
                text: message.content,
                edit: key,
            }
        )
    });

    client.ev.on('discordReaction', async ({ jid, reaction, removed }) => {
        if ((state.settings.oneWay >> 1 & 1) === 0) {
            return;
        }

        const key = {
            id: state.lastMessages[reaction.message.id],
            fromMe: reaction.message.webhookId == null || reaction.message.author.username === 'You',
            remoteJid: jid,
        };

        if (jid.endsWith('@g.us')) {
            key.participant = utils.whatsapp.toJid(reaction.message.author.username);
        }

        const messageId = (
            await client.sendMessage(jid, {
                react: {
                    text: removed ? '' : reaction.emoji.name,
                    key,
                },
            })
        ).key.id;
        state.lastMessages[messageId] = true;
    });

    return client;
};

const actions = {
    async start() {
        const baileyState = await baileys.useMultiFileAuthState('./storage/baileys');
        authState = baileyState.state;
        saveState = baileyState.saveCreds;
        state.waClient = await connectToWhatsApp();
    },
}

module.exports = actions;
