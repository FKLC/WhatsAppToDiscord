
# WhatsAppToDiscord

WhatsAppToDiscord is a Discord bot that uses WhatsApp Web as a bridge between Discord and WhatsApp. It is built on top of [whatsmeow](https://github.com/tulir/whatsmeow) and [discordgo](https://github.com/bwmarrin/discordgo) libraries.

### Features

- Way too low memory usage than a web browser.
- Supports media (Image, Video, Audio, Document)
- Open Source (You can always compile for yourself)
- Self Hosted (You own your data)

But most importantly you can open **Discord overlay** and reply to your messages **without a break.**

---
### Commands
- `start <number with country code or name>`: Starts a new conversation
- `list`: Lists existing chats
- `list <chat name to search>`: Finds chats that contain the given argument
- `addToWhitelist <channel name>`: Adds specified conversation to the whitelist
- `removeFromWhitelist <channel name>`: Removes specified conversation from the whitelist 
- `listWhitelist`: Lists all whitelisted conversations
- `enableDCPrefix`: Starts adding your Discord username to messages sent to WhatsApp
- `disableDCPrefix`: Stops adding your Discord username to messages sent to WhatsApp
- `enableWAPrefix`: Starts adding sender's name to messages sent to Discord
- `disableWAPrefix`: Stops adding sender's name to messages sent to Discord
- `ping`: Sends "Pong! <Now - Time Message Sent>ms" back

---
### Restarting automatically
Run the start.bat, it will restart the bot if it crashes. If you do notice a restart please submit it on [Issues](https://github.com/FKLC/WhatsAppToDiscord/issues) tab, so I can further fix bugs of the bot.

---
### Setup
1. Download the latest version from [here](https://github.com/FKLC/WhatsAppToDiscord/releases)
2. Move the file you downloaded to a folder as the bot will create various files
3. Go to [Discord applications](https://discordapp.com/developers/applications/)
4. Click the **blue button** on the right upper corner with the text **"New Application"**
5. Move to **"Bot"** section
6. Click the **blue button** on the right with the text **"Add a bot"**
7. Click the **blue button** on the right of icon of bot with the text **"Copy"**
8. Run the bot
9. Then paste it when it asks you to, and press enter
10. A URL should appear. Open it in a browser. (It should look something like this: https://discordapp.com/oauth2/authorize?client_id=123456789&scope=bot&permissions=536879120)
11. Accept the bot to your server (Recommendation: Create a new server for privacy)
12. Activate multi-device feature on WhatsApp by following [their guide](https://faq.whatsapp.com/web/download-and-installation/how-to-join-or-leave-the-multi-device-beta)
13. Scan the code QR code the bot sent to `#control-channel`

---
You can host this on Heroku, but you may get banned. WhatsApp can recognize Heroku's IP addresses and may **BAN** you. However, if you still want to host this on Heroku, click the deploy on Heroku button [![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy?template=https://github.com/FKLC/WhatsAppToDiscord), and follow steps 3 to 7, and paste the token to BOT_TOKEN.

---
### This is just a bot

This bot uses libraries that are already out there. So, all the kudos to [whatsmeow](https://github.com/tulir/whatsmeow) and [discordgo](https://github.com/bwmarrin/discordgo). I just integrated them.
