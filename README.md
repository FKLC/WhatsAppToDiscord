
# WhatsAppToDiscord

WhatsAppToDiscord is a Discord bot uses WhatsApp Web for messaging in Discord build on top of [go-whatsapp](https://github.com/Rhymen/go-whatsapp) and [discordgo](https://github.com/bwmarrin/discordgo)

### Features

- Way too low memory usage than a web browser.
- Open Source (You can always compile your own)
- Self Hosted (So your data keeps on you)

But most importantly you can open **Discord overlay** and reply to your messages **without a break.**

---
### Setup

1. Download the latest version from [here](https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/WA2DC.exe)
1. Go to [Discord applications](https://discordapp.com/developers/applications/)
1. Click the **blue button** on the right upper corner with the text **"New Application"**
1. Move to **"Bot"** section
1. Click the **blue button** on the right with the text **"Add a bot"**
1. Click the **blue button** on the right of icon of bot with the text **"Copy"**
1. Then paste into WA2DC and press enter.
1. Open a new tab and paste this URL but don't navigate to it. `https://discordapp.com/oauth2/authorize?client_id=INSERT_CLIENT_ID_HERE&scope=bot&permissions=8208` 
1. Move back to **"General Information"** section and copy **"CLIENT ID"**
1. Paste **"CLIENT ID"** to **INSERT_CLIENT_ID_HERE** in the URL you opened in new tab and navigate to it.
1. Accept bot to your server (Recommendation: Create new server for privacy)

---
### This library is not something revolutionary

It uses the libraries already out there so all the kudos must go to [go-whatsapp](https://github.com/Rhymen/go-whatsapp) and [discordgo](https://github.com/bwmarrin/discordgo) projects. I just integrated them.