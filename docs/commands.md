# Commands
The following slash commands are provided by the bot.

## `/pairwithcode`
Pairs with your phone number.
- Format: `/pairwithcode <number with country code>`
- Examples:
    - `/pairwithcode 18001231234`: This would give you a code for you to enter on your phone and pair the bot with your phone number.

## `/start`
Starts a new conversation. It can be used with a name or a phone number.
- Format: `/start <number with country code or name>`
- Examples:
    - `/start 11231231234`: This would start a conversation with +1 123 123 1234.
    - `/start John Doe`: This would start a conversation with John Doe. It has to be in your contacts.

## `/list`
Lists your contacts and groups.
- Format: `/list <optional chat name to search>`
- Examples:
    - `/list`: This would list all of your contacts and groups.
    - `/list John`: This would list all of your contacts and groups that contain "John" in their name.

## `/listwhitelist`
Shows all the whitelisted conversations. If no channel is whitelisted, the whitelist is disabled, meaning every message will be sent to Discord.
- Format: `/listwhitelist`

## `/addtowhitelist`
Adds the given channel to the whitelist.
- Format: `/addtowhitelist <channel>`
- Examples:
    - `/addtowhitelist #john-doe`: This would add John Doe to the whitelist, allowing them to send you a message if you have whitelist enabled.

## `/removefromwhitelist`
Removes the given channel from the whitelist.
- Format: `/removefromwhitelist <channel>`
- Examples:
    - `/removefromwhitelist #john-doe`: This would remove John Doe from the whitelist, preventing them to send you a message if you have whitelist enabled.

## `/resync`
Re-syncs your contacts and groups, and renames channels. Can be used when the bot can't find your desired contact or group.
- Format: `/resync`

## `/wauploadenabled <enabled>`
When enabled (enabled by default), the files received from Discord will be uploaded to WhatsApp, instead of providing a link to the attachment. File uploads takes longer and consumes more data.
- Format: `/enablewaupload <True|False>`

## `/setdcprefix`
When set (your username by default), the prefix will be added to messages sent to WhatsApp from Discord.
- Format: `/setdcprefix`

## `/dcprefixenabled <enabled>`
When enabled (disabled by default), your Discord username will be added to messages sent to WhatsApp from Discord.
- Format: `/dcprefixenabled <True|False>`

## `/waprefixenabled <enabled>`
When enabled (disabled by default), WhatsApp names will be added to messages sent to Discord from WhatsApp. (Note that the bot already sets the username to the message sender's name)
- Format: `/waprefixenabled <True|False>`

## `/localdownloadsenabled <enabled>`
When enabled, the bot downloads files larger than 8MB to your download location. See `/getdownloaddir` for your download location.
- Format: `/localdownloadsenabled <True|False>`

## `/getdownloadmessage`
Prints out the download message. This message is printed when you receive a file larger than 8MB and it is downloaded.
- Format: `/getdownloadmessage`
- Default: *"Downloaded a file larger than 8MB, check it out at {abs}"*

## `/setdownloadmessage`
Prints out the download message. This message is printed when you receive a file larger than 8MB and it is downloaded. There are keywords that you can use, `/{abs}`: Downloaded file's absolute path, `/{resolvedDownloadDir}`: Download directory's resolved path, `/{downloadDir}`: unedited download directory, `/{fileName}`: Downloaded file's name.
- Format: `/setdownloadmessage <your message here>`
- Examples:
    - `/setdownloadmessage Received a file. The file name is {fileName}`
    - `/setdownloadmessage Received a file. Download it from local file server http://localhost:8080/WA2DC/{fileName}`: Note that files aren't hosted by the bot, you'll have to do it yourself if you have such a need.
    - `/setdownloadmessage Received a file. Information: Absolute path: {abs}, Resolved download directory: {resolvedDownloadDir}, Download directory: {downloadDir}, Filename: {fileName}`

## `/getdownloaddir`
Prints out the download directory.
- Format: `/getdownloaddir`
- Default: `/./downloads`: This means the bot will save files to the downloads folder inside bot's folder.

## `/setdownloaddir`
Sets the download directory.
- Format: `/setdownloaddir <desired save path>`
- Examples:
    - `/setdownloaddir C:\Users\<your username>\Downloads`: Downloads files to your usual Windows downloads folder
    - `/setdownloaddir ./downloads`: Downloads files to Downloads folder in your bot's location.

## `/publishingenabled <enabled>`
Enables publishing messages sent to news channels automatically. By default, the bot won't notify news channel followers. With this option, you can send the message to the channel followers.
- Format: `/publishingenabled <True|False>`

## `/changenotificationsenabled <enabled>`
Enables profile picture change and status update notifications.
- Format: `/changenotificationsenabled <True|False>`

## `/oneway`
Turns on one-way communication.
- Format: `/oneway <discord|whatsapp|disabled>`
- Examples:
    - `/oneway discord`: would only send messages coming from WhatsApp to Discord, but not the other way.

## `/autosaveinterval`
Changes the auto save interval to the number of seconds you provide.
- Format: `/autosaveinterval <seconds>`
- Example: `/autosaveinterval 60`

## `/lastmessagestorage`
Changes the last message storage size to the number provide. Last message storage size determines the number of last messages you can reply to. A value of 1000 would mean, you can react or reply to last 1000 messages received or sent. 
- Format: `/lastmessagestorage <size>`
- Example: `/lastmessagestorage 1000`

## `/redirectwebhooks`
Allows sending webhook messages to be redirected to WhatsApp.
- Format: `/redirectwebhooks <True|False>`
- Examples:
    - `/redirectwebhooks True`: Would redirect webhook messages to WhatsApp.
    - `/redirectwebhooks False`: Would not redirect webhook messages to WhatsApp.

## `/ping`
Replies back with *"Pong <Now - Time Message Sent>"ms*. It basically shows the bot's ping with the server. An unsynced date and time on your computer may cause big or even negative ping results, however, it doesn't mean you got negative ping or 10mins of lag, rather it is the Discord's time and your computer's time difference plus your ping.
- Format: `/ping`
