# Commands
You can use the following commands only in `#control-room` created by the bot. Note that all the commands are case-insensitive. So, `list`, `LIST`, and `lIsT` would evaluate the same way.

## start
Starts a new conversation. It can be used with a name or a phone number. 
- Format: `start <number with country code or name>`
- Examples:
    - `start 11231231234`: This would start a conversation with +1 123 123 1234.
    - `start John Doe`: This would start a conversation with John Doe. It has to be in your contacts.

## list
Lists your contacts and groups. 
- Format: `list <optional chat name to search>`
- Examples:
    - `list`: This would list all of your contacts and groups.
    - `list John`: This would list all of your contacts and groups that contain "John" in their name.

## listWhitelist
Shows all the whitelisted conversations. If no channel is whitelisted, the whitelist is disabled, meaning every message will be sent to Discord.
- Format: `listWhitelist`

## addToWhitelist
Adds the given channel to the whitelist.
- Format: `addToWhitelist #<channel name>`
- Examples:
    - `addToWhitelist #john-doe`: This would add John Doe to the whitelist, allowing them to send you a message if you have whitelist enabled.

## removeFromWhitelist
Removes the given channel from the whitelist.
- Format: `removeFromWhitelist #<channel name>`
- Examples:
    - `removeFromWhitelist #john-doe`: This would remove John Doe from the whitelist, preventing them to send you a message if you have whitelist enabled.

## resync
Re-syncs your contacts and groups. Can be used when the bot can't find your desired contact or group.
- Format: `resync`

## enableWAUpload
When enabled (enabled by default), the files received from Discord will be uploaded to WhatsApp.
- Format: `enableWAUpload`

## disableWAUpload
When disabled (enabled by default), the files received from Discord will be sent as links to WhatsApp.
- Format: `disableWAUpload`

## setDCPrefix
When set (your username by default), the prefix will be added to messages sent to WhatsApp from Discord.
- Format: `setDCPrefix`

## enableDCPrefix
When enabled (disabled by default), your Discord username will be added to messages sent to WhatsApp from Discord.
- Format: `enableDCPrefix`

## disableDCPrefix
When disabled (disabled by default), your Discord username won't be added to messages sent to WhatsApp from Discord.
- Format: `disableDCPrefix`

## enableWAPrefix
When enabled (disabled by default), WhatsApp names will be added to messages sent to Discord from WhatsApp. (Note that the bot already sends messages by WhatsApp names anyway. This is an accessibility option)
- Format: `enableWAPrefix`

## disableWAPrefix
When disabled (disabled by default), WhatsApp names won't be added to messages sent to Discord from WhatsApp. (Note that the bot already sends messages by WhatsApp names anyway. This is an accessibility option)
- Format: `disableWAPrefix`

## enableLocalDownloads
When enabled, the bot downloads files larger than 8MB to your download location. See `getDownloadDir` for your download location.
- Format: `enableLocalDownloads`

## disableLocalDownloads
When enabled, the bot notifies you about receiving a file larger than 8MB.
- Format: `disableLocalDownloads`

## getDownloadMessage
Prints out the download message. This message is printed when you receive a file larger than 8MB and it is downloaded.
- Format: `getDownloadMessage`
- Default: *"Downloaded a file larger than 8MB, check it out at {abs}"*

## setDownloadMessage
Prints out the download message. This message is printed when you receive a file larger than 8MB and it is downloaded. There are keywords that you can use, `{abs}`: Downloaded file's absolute path, `{resolvedDownloadDir}`: Download directory's resolved path, `{downloadDir}`: unedited download directory, `{fileName}`: Downloaded file's name.
- Format: `setDownloadMessage <your message here>`
- Examples:
    - `setDownloadMessage Received a file. The file name is {fileName}`
    - `setDownloadMessage Received a file. Download it from local file server http://localhost:8080/WA2DC/{fileName}`: Note that files aren't hosted by the bot, you'll have to do it yourself if you have such a need.
    - `setDownloadMessage Received a file. Information: Absolute path: {abs}, Resolved download directory: {resolvedDownloadDir}, Download directory: {downloadDir}, Filename: {fileName}`

## getDownloadDir
Prints out the download directory.
- Format: `getDownloadDir`
- Default: `./downloads`: This means the bot will save files to the downloads folder inside bot's folder.

## setDownloadDir
Sets the download directory.
- Format: `setDownloadDir <desired save path>`
- Examples:
    - `setDownloadDir C:\Users\<your username>\Downloads`: Downloads files to your usual Windows downloads folder
    - `setDownloadDir ./downloads`: Downloads files to Downloads folder in your bot's location.

## enablePublishing
Enables publishing messages sent to news channels automatically.
- Format: `enablePublishing`

## disablePublishing
Disables publishing messages sent to news channels automatically.
- Format: `disablePublishing`

## enableChangeNotifications
Enables profile picture change and status update notifications.
- Format: `enableChangeNotifications`

## disableChangeNotifications
Disables profile picture change and status update notifications.
- Format: `disableChangeNotifications`

## autoSaveInterval
Changes the auto save interval to the number of seconds you provide.
- Format: `autoSaveInterval <seconds>`
- Example: `autoSaveInterval 60`

## lastMessageStorage
Changes the last message storage size to the number provide.
- Format: `lastMessageStorage <size>`
- Example: `lastMessageStorage 1000`


## ping
Replies back with *"Pong <Now - Time Message Sent>"ms*. It basically shows the bot's ping with the server. An unsynced date and time on your computer may cause big or even negative ping results, however, it doesn't mean you got negative ping or 10mins of lag, rather it is the Discord's time and your computer's time difference plus your ping.
- Format: `ping`

