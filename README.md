
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

---
### Prefixing Messages Sent from Discord
If you share your WhatsApp conversation with multiple people, this setting allows you to prefix messages with Discord usernames. To enable:
1. Open `settings.json` with your choice of text editor
1. Move to the line `"DiscordPrefix": false,`
1. Change the `false` to `true`

---
### Restarting automatically (temporary solution)
Run the start.bat, it will restart the bot if it crashes. If you do notice a restart please submit it on [Issues](https://github.com/FKLC/WhatsAppToDiscord/issues) tab, so I can further fix bugs of the bot.

---
### Setup

1. Download the latest version from [here](https://github.com/FKLC/WhatsAppToDiscord/releases)
1. Move the file you downloaded to a folder as the bot will create various files
1. Go to [Discord applications](https://discordapp.com/developers/applications/)
1. Click the **blue button** on the right upper corner with the text **"New Application"**
1. Move to **"Bot"** section
1. Click the **blue button** on the right with the text **"Add a bot"**
1. Click the **blue button** on the right of icon of bot with the text **"Copy"**
1. Run the bot
1. Then paste it when it asks you to, and press enter
1. A URL should appear. Open it in a browser. (It should look something like this: https://discordapp.com/oauth2/authorize?client_id=123456789&scope=bot&permissions=536879120)
1. Accept the bot to your server (Recommendation: Create a new server for privacy)
1. Activate multi-device feature on WhatsApp by following [their guide](https://faq.whatsapp.com/web/download-and-installation/how-to-join-or-leave-the-multi-device-beta)
1. Scan the code QR code the bot sent to `#control-channel`

---
### This is just a bot

This bot uses libraries that are already out there. So, all the kudos to [whatsmeow](https://github.com/tulir/whatsmeow) and [discordgo](https://github.com/bwmarrin/discordgo). I just integrated them.
