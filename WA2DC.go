package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unicode"

	wa "github.com/Rhymen/go-whatsapp"
	dc "github.com/bwmarrin/discordgo"
	"github.com/skip2/go-qrcode"
)

type Settings struct {
	Token            string
	GuildID          string
	CategoryID       string
	ControlChannelID string
	Whitelist        []string
	DiscordPrefix    bool
	SessionFilePath  string
	ChatsFilePath    string
	SendErrors       bool
}

type githubReleaseResp struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
}

var (
	startTime    = time.Now()
	settings     Settings
	commandsHelp = "\nCommands:\n`start <number with country code or name>`: Starts a new conversation\n`list`: Lists existing chats"
)

var (
	dcSession    *dc.Session
	guild        *dc.Guild
	waConnection *wa.Conn
	chats        = make(map[string]*dc.Webhook)
)

func main() {
	err := unmarshal("settings.json", &settings)
	if _, fileNotExist := err.(*os.PathError); fileNotExist {
		firstRun()
	} else if err != nil {
		if _, isJSONCorrupted := err.(*json.SyntaxError); isJSONCorrupted {
			anwser := input("settings.json file seems to be corrupted. You can fix it manually or you will have to run setup again. Would you like to run setup? (Y/N)")
			if strings.ToLower(anwser) == "y" {
				firstRun()
			} else {
				os.Exit(1)
			}
		} else {
			panic(err)
		}
	}
	whitelistLength = len(settings.Whitelist)

	initializeDiscord()

	err = unmarshal(settings.ChatsFilePath, &chats)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		if _, isJSONCorrupted := err.(*json.SyntaxError); isJSONCorrupted {
			anwser := input("chats.json file seems to be corrupted. You can fix it manually or the bot won't send messages to old channels and start to create new ones. Would you like to reset? (Y/N)")
			if strings.ToLower(anwser) == "y" {
				marshal(settings.ChatsFilePath, chats)
			} else {
				os.Exit(1)
			}
		} else if _, isOldVer := err.(*json.UnmarshalTypeError); isOldVer {
			createOrMergeWebhooks()
		} else {
			panic(err)
		}
	}
	repairChannels()
	initializeWhatsApp()
	if err = checkVersion(); err != nil {
		dcSession.ChannelMessageSend(settings.ControlChannelID, "Update check failed. Error: "+err.Error())
	}

	fmt.Println("Bot is now running. Press CTRL-C to exit.")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt, os.Kill)
	<-sc

	marshal("settings.json", &settings)
	marshal(settings.ChatsFilePath, chats)
	dcSession.Close()
}

// Discord
func initializeDiscord() {
	var err error
	dcSession, err = dc.New("Bot " + settings.Token)
	if err != nil {
		panic(err)
	}

	dcSession.AddHandler(dcOnMessageCreate)
	dcSession.AddHandler(dcOnChannelDelete)

	err = dcSession.Open()
	if err != nil {
		panic(err)
	}

	guild, err = dcSession.Guild(settings.GuildID)
	if err != nil {
		panic(err)
	}
}

func repairChannels() {
	channels, err := dcSession.GuildChannels(settings.GuildID)
	if err != nil {
		panic(err)
	}

	var matchedChats []string
	for _, channel := range channels {
		if channel.ParentID == settings.CategoryID && channel.ID != settings.ControlChannelID {
			exist := false
			for jid, chat := range chats {
				if chat.ChannelID == channel.ID {
					matchedChats = append(matchedChats, jid)
					exist = true
					break
				}
			}
			if !exist {
				dcSession.ChannelDelete(channel.ID)
			}
		}
	}

	for jid := range chats {
		exist := false
		for _, mJid := range matchedChats {
			if mJid == jid {
				exist = true
				break
			}
		}
		if !exist {
			/* for i, channel := range settings.Whitelist {
				if channel == match[1] {
					settings.Whitelist = remove(settings.Whitelist, i)
					whitelistLength--
					dcSession.ChannelMessageSend(settings.ControlChannelID, "Removed from whitelist!")
					return
				}
			} */
			delete(chats, jid)
		}
	}
}

func dcOnMessageCreate(_ *dc.Session, message *dc.MessageCreate) {
	// Skip if bot itself messaged
	if message.Author.ID == dcSession.State.User.ID || message.WebhookID != "" {
		return
	}

	// If it is supposed to be a command
	if message.ChannelID == settings.ControlChannelID {
		switch parts := strings.Split(message.Content, " "); strings.ToLower(parts[0]) {
		case "start":
			if len(parts) == 1 {
				dcSession.ChannelMessageSend(settings.ControlChannelID, "Please enter a phone number or name. Usage: `start <number with country code or name>`")
				return
			}
			dcCommandStart(parts)
		case "list":
			dcCommandList(parts)
		case "addtowhitelist":
			dcCommandAddToWhitelist(message.Content)
		case "removefromwhitelist":
			dcCommandRemoveFromWhitelist(message.Content)
		case "listwhitelist":
			dcCommandListWhitelist()
		default:
			dcSession.ChannelMessageSend(settings.ControlChannelID, "Unknown Command: "+parts[0]+commandsHelp)
		}
		return
	}

	// If not a command try to send WhatsApp message
	for key, chat := range chats {
		if chat.ChannelID == message.ChannelID {
			waSendMessage(key, message)
			break
		}
	}
}

func dcCommandStart(parts []string) {
	if isInt(parts[1]) {
		getOrCreateChannel(parts[1] + "@s.whatsapp.net")
		if whitelistLength != 0 {
			settings.Whitelist = append(settings.Whitelist, parts[1]+"@s.whatsapp.net")
			whitelistLength++
		}
	} else {
		name := strings.Join(parts[1:], " ")
		for jid, chat := range waConnection.Store.Chats {
			if chat.Name == name {
				getOrCreateChannel(jid)
				if whitelistLength != 0 {
					settings.Whitelist = append(settings.Whitelist, jid)
					whitelistLength++
				}
			}
		}
	}

}

func dcCommandList(parts []string) {
	searchPrefix := ""
	if len(parts) > 1 {
		searchPrefix = strings.ToLower(strings.Join(parts[1:], " "))
	}
	list := "```"
	for _, chat := range waConnection.Store.Chats {
		if strings.HasPrefix(strings.ToLower(chat.Name), searchPrefix) {
			list += chat.Name + "\n"
		}
	}
	dcSession.ChannelMessageSend(settings.ControlChannelID, list+"```")
}

var channelMentionRegex, _ = regexp.Compile(`<#(\d*)>`)

func dcCommandAddToWhitelist(messagecontent string) {
	match := channelMentionRegex.FindStringSubmatch(messagecontent)
	if len(match) != 2 {
		dcSession.ChannelMessageSend(settings.ControlChannelID, "Please enter a valid channel name. Usage: `addToWhitelist #<target channel>`")
		return
	}
	for key, chat := range chats {
		if chat.ChannelID == match[1] {
			settings.Whitelist = append(settings.Whitelist, key)
			whitelistLength++
			dcSession.ChannelMessageSend(settings.ControlChannelID, "Added to whitelist!")
			return
		}
	}
	dcSession.ChannelMessageSend(settings.ControlChannelID, "Couldn't find any corresponding chat.")
}

func dcCommandRemoveFromWhitelist(messagecontent string) {
	match := channelMentionRegex.FindStringSubmatch(messagecontent)
	if len(match) != 2 {
		dcSession.ChannelMessageSend(settings.ControlChannelID, "Please enter a valid channel name. Usage: `removeFromWhitelist #<target channel>`")
		return
	}
	for jid, chatInfo := range chats {
		if chatInfo.ChannelID == match[1] {
			for i, whitelistedJid := range settings.Whitelist {
				if jid == whitelistedJid {
					settings.Whitelist = remove(settings.Whitelist, i)
					whitelistLength--
					dcSession.ChannelMessageSend(settings.ControlChannelID, "Removed from whitelist!")
					return
				}
			}
			dcSession.ChannelMessageSend(settings.ControlChannelID, "This conversation is not whitelisted!")
		}
	}
	dcSession.ChannelMessageSend(settings.ControlChannelID, "Couldn't find any corresponding chat.")
}

func dcCommandListWhitelist() {
	names := make([]string, whitelistLength)
	for i, jid := range settings.Whitelist {
		names[i] = jidToName(jid)
	}
	dcSession.ChannelMessageSend(settings.ControlChannelID, "Whitelisted Conversations: ```"+strings.Join(names, "\n")+"```")
}

func dcOnChannelDelete(_ *dc.Session, deletedChannel *dc.ChannelDelete) {
	for key, chat := range chats {
		if chat.ChannelID == deletedChannel.ID {
			delete(chats, key)
			break
		}
	}
}

// WhatsApp
func initializeWhatsApp() {
	var err error
	waConnection, err = wa.NewConn(20 * time.Second)
	waConnection.SetClientVersion(0, 4, 1307) // https://github.com/Rhymen/go-whatsapp/issues/304#issuecomment-604580880
	if err != nil {
		panic(err)
	}

	connectToWhatsApp()
	dcSession.ChannelMessageSend(settings.ControlChannelID, "WhatsApp connection successfully made!")
	waConnection.AddHandler(waHandler{})
}

func connectToWhatsApp() {
	var waSession wa.Session
	err := unmarshal(settings.SessionFilePath, &waSession)
	if err == nil {
		_, err := waConnection.RestoreWithSession(waSession)
		if err != nil {
			dcSession.ChannelMessageSend(settings.ControlChannelID, "Session couldn't restored. "+err.Error()+". Going to create a new session!")
			os.Remove(settings.SessionFilePath)
			connectToWhatsApp()
			return
		}
	} else if _, ok := err.(*os.PathError); ok {
		qrChan := make(chan string)
		go func() {
			var png []byte
			png, _ = qrcode.Encode(<-qrChan, qrcode.Medium, 256)
			f := bytes.NewReader(png)

			dcSession.ChannelMessageSendComplex(settings.ControlChannelID, &dc.MessageSend{
				Files: []*dc.File{
					{
						Name:   "qrcode.png",
						Reader: f,
					},
				},
			})
		}()
		session, err := waConnection.Login(qrChan)
		if err != nil {
			dcSession.ChannelMessageSend(settings.ControlChannelID, "Timed out. Please rescan QR Code. "+err.Error())
			connectToWhatsApp()
			return
		}
		sessionJSON, _ := json.Marshal(session)
		ioutil.WriteFile(settings.SessionFilePath, sessionJSON, 0644)
	} else {
		panic(err)
	}
}

var lastMessageID string

func waSendMessage(jid string, message *dc.MessageCreate) {
	for _, attachment := range message.Attachments {
		message.Content += attachment.URL + "\n"
	}
	if settings.DiscordPrefix {
		var username string
		if message.Member.Nick != "" {
			username = message.Member.Nick
		} else {
			username = message.Author.Username
		}
		message.Content = "[" + username + "] " + message.Content
	}
	lastMessageID, _ = waConnection.Send(wa.TextMessage{
		Info: wa.MessageInfo{
			RemoteJid: jid,
		},
		Text: message.Content,
	})
}

type waHandler struct{}

func (waHandler) HandleError(err error) {
	if settings.SendErrors {
		dcSession.ChannelMessageSend(settings.ControlChannelID, err.Error())
	}

	_, ok := err.(*wa.ErrConnectionClosed)
	_, ok1 := err.(*wa.ErrConnectionFailed)
	if ok || ok1 {
		initializeWhatsApp()
	}
	fmt.Fprintf(os.Stderr, "%v\n", err)
}

var whitelistLength = 0

func checkWhitelist(jid string) bool {
	if whitelistLength == 0 {
		return true
	}
	for _, allowedJid := range settings.Whitelist {
		if jid == allowedJid {
			return true
		}
	}
	return false
}

func (waHandler) HandleTextMessage(message wa.TextMessage) {
	if (!message.Info.FromMe || (message.Info.FromMe && lastMessageID != message.Info.Id)) && startTime.Before(time.Unix(int64(message.Info.Timestamp), 0)) && checkWhitelist(message.Info.RemoteJid) {
		var username string
		if message.Info.FromMe {
			username = "You"
		} else if message.Info.Source.Participant == nil {
			username = jidToName(message.Info.RemoteJid)
		} else {
			username = jidToName(*message.Info.Source.Participant)
		}

		chat := getOrCreateChannel(message.Info.RemoteJid)
		_, err := dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
			Content:  message.Text,
			Username: username,
		})
		if err != nil {
			panic(err)
		}
	}
}

func handleMediaMessage(info wa.MessageInfo, content string, data []byte, fileName string) {
	if (!info.FromMe || (info.FromMe && lastMessageID != info.Id)) && startTime.Before(time.Unix(int64(info.Timestamp), 0)) && checkWhitelist(info.RemoteJid) {
		var username string
		if info.FromMe {
			username = "You"
		} else if info.Source.Participant == nil {
			username = jidToName(info.RemoteJid)
		} else {
			username = jidToName(*info.Source.Participant)
		}

		chat := getOrCreateChannel(info.RemoteJid)
		if content != "" {
			_, err := dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
				Content:  content,
				Username: username,
				File:     string(data),
			})
			if err != nil {
				panic(err)
			}
		}

		uri := dc.EndpointWebhookToken(chat.ID, chat.Token)
		_, err := dcSession.RequestWithLockedBucket("POST", uri+"?wait=true", "multipart/form-data; boundary=123", append(append([]byte("--123\nContent-Disposition: form-data; name=\"file\"; filename=\""+fileName+"\"\n\n"), data...), []byte("\n--123--")...), dcSession.Ratelimiter.LockBucket(uri), 0)
		if err != nil {
			panic(err)
		}
	}
}

func (waHandler) HandleImageMessage(message wa.ImageMessage) {
	data, err := message.Download()
	if err != nil {
		return
	}
	handleMediaMessage(message.Info, message.Caption, data, "image."+strings.Split(message.Type, "/")[1])
}

func (waHandler) HandleVideoMessage(message wa.VideoMessage) {
	data, err := message.Download()
	if err != nil {
		return
	}
	handleMediaMessage(message.Info, message.Caption, data, "video."+strings.Split(message.Type, "/")[1])
}

func (waHandler) HandleAudioMessage(message wa.AudioMessage) {
	data, err := message.Download()
	if err != nil {
		return
	}
	handleMediaMessage(message.Info, "", data, "audio."+strings.Split(strings.Split(message.Type, "/")[1], ";")[0])
}

func (waHandler) HandleDocumentMessage(message wa.DocumentMessage) {
	data, err := message.Download()
	if err != nil {
		return
	}
	handleMediaMessage(message.Info, "", data, message.FileName)
}

func getOrCreateChannel(jid string) dc.Webhook {
	chat, ok := chats[jid]
	if !ok {
		name := jidToName(jid)
		channel, err := dcSession.GuildChannelCreateComplex(guild.ID, dc.GuildChannelCreateData{
			Name:     name,
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID})
		if err != nil {
			panic(err)
		}
		webhook, err := dcSession.WebhookCreate(channel.ID, "WA2DC", "")
		if err != nil {
			panic(err)
		}
		chats[jid] = webhook
		chat = chats[jid]
	}
	return *chat
}

// Other stuff
func createOrMergeWebhooks() {
	webhooks := make(map[string]*dc.Webhook)
	err := unmarshal("webhooks.json", &webhooks)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		panic(err)
	} else if isFileNotExistError {
		oldVerChats := make(map[string]string)
		unmarshal("chats.json", &oldVerChats)

		for jid, channelID := range oldVerChats {
			webhook, err := dcSession.WebhookCreate(channelID, "WA2DC", "")
			if err != nil {
				panic(err)
			}
			chats[jid] = webhook
		}
	} else {
		oldVerChats := make(map[string]string)
		unmarshal("chats.json", &oldVerChats)

		for jid, channelID := range oldVerChats {
			chats[jid] = webhooks[channelID]
		}
	}
	marshal(settings.ChatsFilePath, &chats)
}

func checkVersion() error {
	cl := http.Client{
		Timeout: time.Second * 2,
	}

	r, err := cl.Get("https://api.github.com/repos/FKLC/WhatsAppToDiscord/releases/latest")
	if err != nil {
		return err
	}
	defer r.Body.Close()

	var versionInfo githubReleaseResp
	err = json.NewDecoder(r.Body).Decode(&versionInfo)
	if err != nil {
		return err
	}

	if versionInfo.TagName != "v0.3.1" {
		dcSession.ChannelMessageSend(settings.ControlChannelID, "New "+versionInfo.TagName+" version is available. Download the latest release from here https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/WA2DC.exe. \nChangelog: ```"+versionInfo.Body+"```")
	}

	return nil
}

func unmarshal(filename string, object interface{}) error {
	JSONRaw, err := ioutil.ReadFile(filename)
	if err != nil {
		return err
	}
	return json.Unmarshal(JSONRaw, &object)
}

func marshal(filename string, object interface{}) error {
	JSONRaw, err := json.MarshalIndent(object, "", "    ")
	if err != nil {
		return err
	}
	return ioutil.WriteFile(filename, JSONRaw, 0644)
}

func isInt(s string) bool {
	for _, c := range s {
		if !unicode.IsDigit(c) {
			return false
		}
	}
	return true
}

func jidToName(jid string) string {
	name := waConnection.Store.Chats[jid].Name
	if name == "" {
		name = strings.Split(strings.Split(jid, "@")[0], "-")[0]
	}
	return name
}

func input(promptText string) string {
	fmt.Print(promptText)
	reader := bufio.NewReader(os.Stdin)
	userInput, err := reader.ReadString('\n')
	if err != nil {
		panic(err)
	}
	userInput = strings.ReplaceAll(userInput, "\n", "")
	return strings.ReplaceAll(userInput, "\r", "")
}

func remove(s []string, i int) []string {
	s[len(s)-1], s[i] = s[i], s[len(s)-1]
	return s[:len(s)-1]
}

func firstRun() {
	fmt.Println("It seems like it is your first run.")
	settings.Token = input("Please enter your bot token: ")
	dcSession, err := dc.New("Bot " + settings.Token)
	if err != nil {
		panic(err)
	}
	channelsCreated := make(chan bool)

	dcSession.AddHandler(func(_ *dc.Session, guildCreate *dc.GuildCreate) {
		settings.GuildID = guildCreate.ID
		categoryChannel, err := dcSession.GuildChannelCreateComplex(settings.GuildID, dc.GuildChannelCreateData{
			Name: "WhatsApp",
			Type: dc.ChannelTypeGuildCategory})
		if err != nil {
			panic(err)
		}
		settings.CategoryID = categoryChannel.ID

		controlChannel, err := dcSession.GuildChannelCreateComplex(settings.GuildID, dc.GuildChannelCreateData{
			Name:     "control-room",
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID})
		if err != nil {
			panic(err)
		}
		settings.ControlChannelID = controlChannel.ID
		channelsCreated <- true
	})

	err = dcSession.Open()
	if err != nil {
		panic(err)
	}
	fmt.Println("You can invite bot from: https://discordapp.com/oauth2/authorize?client_id=" + dcSession.State.User.ID + "&scope=bot&permissions=536879120")
	<-channelsCreated
	settings.SessionFilePath = "session.json"
	settings.ChatsFilePath = "chats.json"
	settings.SendErrors = false
	marshal("settings.json", &settings)
	fmt.Println("Settings saved.")
}
