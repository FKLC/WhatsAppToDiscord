
# WhatsAppToDiscord

WhatsAppToDiscord is a Discord bot that uses WhatsApp Web as a bridge between Discord and WhatsApp. It is built on top of [discord.js](https://github.com/discordjs/discord.js) and [Baileys](https://github.com/adiwajshing/Baileys) libraries.

### Features

- Less memory usage than a web browser.
- Supports media (Image, Video, Audio, Document, Stickers)
- Open Source (You can always compile for yourself)
- Self Hosted (You own your data)
- Allows usage of WhatsApp through the Discord overlay

---
### Commands
- `start <number with country code or name>`: Starts a new conversation.
- `list`: Lists existing chats.
- `list <chat name to search>`: Finds chats that contain the given argument.
- `listWhitelist`: Lists all whitelisted conversations.
- `addToWhitelist <channel name>`: Adds specified conversation to the whitelist.
- `removeFromWhitelist <channel name>`: Removes specified conversation from the whitelist.
- `resync`: Re-syncs your contacts and groups.
- `enableWAUpload`: Starts uploading attachments sent to Discord to WhatsApp.
- `disableWAUpload`: Stop uploading attachments sent to Discord to WhatsApp.
- `enableDCPrefix`: Starts adding your Discord username to messages sent to WhatsApp.
- `disableDCPrefix`: Stops adding your Discord username to messages sent to WhatsApp.
- `enableWAPrefix`: Starts adding sender's name to messages sent to Discord.
- `disableWAPrefix`: Stops adding sender's name to messages sent to Discord.
- `ping`: Sends "Pong! \<Now - Time Message Sent\>ms" back.

---
### Setup
1. Download the latest version from [here](https://github.com/FKLC/WhatsAppToDiscord/releases)
2. Move the file you downloaded to a folder as the bot will create some files
3. Go to [Discord applications](https://discordapp.com/developers/applications/)
4. Click the **blue button** on the right upper corner with the text **"New Application"**
5. Move to **"Bot"** section
6. Click the **blue button** on the right with the text **"Add a bot"**
7. Click the **blue button** on the right of icon of bot with the text **"Copy"**
8. Run the bot
9. Then paste it when it asks you to, and press enter
10. A URL should appear. Open it in a browser. (It should look something like this: https://discordapp.com/oauth2/authorize?client_id=123456789&scope=bot&permissions=536879120)
11. Accept the bot to your server (Recommendation: Create a new server for privacy)
12. Scan the code QR code the bot sent to `#control-channel`
13. Use the commands above to start a new conversation, and you are good to go!

---
You can host this on Heroku, but you may get banned. WhatsApp can recognize Heroku's IP addresses and may **BAN** you. However, if you still want to host this on Heroku, click the deploy on Heroku button [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/FKLC/WhatsAppToDiscord), and follow steps 3 to 7, and paste the token to BOT_TOKEN.