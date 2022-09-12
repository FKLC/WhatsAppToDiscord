# Frequently Asked Questions
Here you will find frequently asked questions on [GitHub issues](https://github.com/FKLC/WhatsAppToDiscord/issues)

## What is a whitelist?
A whitelist allows you to receive messages only from the conversations that are on the list. A blacklist would do the opposite, but WhatsApp already has that feature called blocking.

## Can I use this bot on a public server?
You can do whatever you want with the bot. Just make sure that you get the permissions right. You can enable Discord prefix and whitelist your school's/institution's WhatsApp group, basically creating a bridge between two platforms. Also, make sure that you restrict public access to `#control-room` so that people won't mess with the whitelist.

## Flagged as a virus
The bot is completely open-source, even the compilation is done publicly using [GitHub Actions](https://github.com/FKLC/WhatsAppToDiscord/actions/workflows/new-release-v2.yml). Is it possible for me to replace the binaries? Technically yes, but that would be a really bad reputation. I believe the main reason the bot gets flagged as a virus is the download count. This project is quite small, and it doesn't get many downloads. Microsoft SmartScreen also tries to deter users from running executables from unknown developers. A code signing certificate would probably help, but they are quite pricey and are not worth for an open-source project in my opinion. If you want to make sure nothing shady happens, you can simply clone the repo and compile/run your own version after inspecting the code.

## Negative or sky-high ping
This is due to the time difference between Discords' servers and your computer. As the ping is measured in milliseconds, even small differences can produce a huge/weird number. This can be fixed, but just syncing the time is an easier solution.

## Bot only responds with `Unknown command type help...`
This is due to [Discord Intents](https://discord.com/developers/docs/topics/gateway#privileged-intents). You have to enable message content intent. You can do this by going to [Discord Developer Portal](https://discord.com/developers/applications/) > Your Application > Bot > Scroll down > Enable *"MESSAGE CONTENT INTENT"*.

## Lost my bot token, how to regenerate one?
You can do this by going to [Discord Developer Portal](https://discord.com/developers/applications/) > Your Application > Bot > Click *"Reset Token"*. A new token will be issued. You can simply copy and paste it to the bot.

## Where do I type the commands?
When you invite the bot, it should create a text channel called `#control-room`. There, you can use all the [commands](commands.md).

## Can I host the bot on a server so that it runs on 7/24?
Possibly, but be aware you may get banned. On GitHub, I've seen two instances ([#1](https://github.com/FKLC/WhatsAppToDiscord/issues/75#issuecomment-1179018481), [#2](https://github.com/FKLC/WhatsAppToDiscord/issues/88#issuecomment-1229547828)) of running the bot on a server, and apparently, it is fine, but always be cautious.

## Sending voice messages on Discord
There are 3 options you can use.
1. You can record using your computer's built-in software and upload to Discord.
1. If you are using Discord Web (instead of the desktop client), you have 2 options. (Please note that I don't maintain any of the projects listed below)
    1. Using [@eibrahim95's extension](https://chrome.google.com/webstore/detail/discord-voice-messages/emfegmjcadbmdcmdecepfkmhnenpnfip) and chaning file names, making their extensions *"mp3"* instead of *"wav"*.
    2. Using [@magadan's extension](https://github.com/magadan/discord-voice-messages-mp3). This is a modified version [@eibrahim95's extension](https://chrome.google.com/webstore/detail/discord-voice-messages/emfegmjcadbmdcmdecepfkmhnenpnfip). It creates *"mp3"* files automatically instead of *"wav"* files, so you don't have to modify the file name every time. However, its setup is a bit longer. You have to build and install the extension using the readme file.