# Setup Steps
Please don't get worried about the number of steps listed here. We wanted to be as detailed as possible :)

1. Go to the [download page](https://github.com/FKLC/WhatsAppToDiscord/releases/latest) and download the version that is right for your computer.
<details>
  <summary>Show photo</summary>
  <img src="_media/1.jpg" alt="Image showing which version to download" />
</details>
1. The bot will create some files, so to prevent cluttering, create a new folder. Then, move the downloaded file to that folder.
<details>
  <summary>Show photo</summary>
  <img src="_media/2.jpg" alt="Image showing folder with WA2DC in it" />
</details>
1. Go to [Discord Developer Portal](https://discord.com/developers/applications/).
<details>
  <summary>Show photo</summary>
  <img src="_media/3.jpg" alt="Image showing Discord Developer Portal" />
</details>
1. Click on the **blue button** on the right upper corner with the text *"New Application"*
<details>
  <summary>Show photo</summary>
  <img src="_media/4.jpg" alt="Image showing the New Application button" />
</details>
1. Give your bot a name, then click *"create"*.
<details>
  <summary>Show photo</summary>
  <img src="_media/5.jpg" alt="Image showing the modal to type your bot's name" />
</details>
1. Move to *"Bot"* using the sidebar, then click on *"Add Bot"*, then click on *"Yes, do it!"*.
<details>
  <summary>Show photo</summary>
  <img src="_media/6.jpg" alt="Image showing the add bot screen" />
  <img src="_media/6.1.jpg" alt="Image showing the add bot screen" />
</details>
1. Click on *"Copy"* to copy your bot's token.
<details>
  <summary>Show photo</summary>
  <img src="_media/7.jpg" alt="Image showing the add bot screen" />
</details>
1. Then, scroll down and enable *"MESSAGE CONTENT INTENT"*
<details>
  <summary>Show photo</summary>
  <img src="_media/7.1.jpg" alt="Image showing the message content intent checkbox" />
</details>
1. Now, go back to the file you downloaded, and run it! (Microsoft Defender SmartScreen may warn you about running the executable as this project is quite small and not well-known, but if you feel unsafe, you can always inspect and run the open source code from GitHub using Node. To skip SmartScreen, you can click on *"More Info"*, then *"Run"*)
<details>
  <summary>Show photo</summary>
  <img src="_media/8.jpg" alt="Image showing the bot's console" />
</details>
1. When asked, paste the bot token. You can do this by right-clicking. Then, hit enter.
<details>
  <summary>Show photo</summary>
  <img src="_media/9.jpg" alt="Image showing the bot's console with token supplied." />
</details>
1. The bot will show its invitation link. Go to the link using your browser by copying and pasting the link. Select the server you want to use your WhatsApp from. Then, click *"Continue"*, and *"Authorize"*.
<details>
  <summary>Show photo</summary>
  <img src="_media/10.jpg" alt="Image showing the bot's console with the invitation url sent by the bot." />
  <img src="_media/10.1.jpg" alt="Image showing the bot's console with the invitation url sent by the bot." />
</details>
1. The bot will join the server and create some channels. Then, it'll send the WhatsApp Web QR code to the newly created `#control-room`.
<details>
  <summary>Show photo</summary>
  <img src="_media/11.jpg" alt="Image showing #control-room with WhatsApp Web QR code" />
</details>
1. Then, just scan the QR code on your phone through WhatsApp. If you need help with that, check [WhatsApp's official help page](https://faq.whatsapp.com/539218963354346/?locale=en_US).
1. You are good to go! Now, you can explore [Commands](commands.md) to learn how to start conversations.

# Linux/MacOS/Non-Windows Users
Because this has been requested a lot, I'm going to type it here in the form of a rant. There's no non-windows specific steps. You may download the binary and run it in your terminal by running `chmod +x WA2DC-Linux` followed by `./WA2DC-Linux` (or whatever your file's name is). There's no difference between platforms. As you may notice, the question is actually about how to run any executable in Linux/MacOS, and not about this project. Also for those trying to run this on a server, you may try searching the following questions on Google:
- How to download a file using `wget` or `curl`?
- How to run an executable in Linux/MacOS?
- How to run an executable in the background in Linux/MacOS?

If you are going to run this on a server, make sure to use proper authentication methods and secure your server, instead of using weak passwords as the bot will have access to your Discord server and more importantly, your WhatsApp account which may include many private information.
