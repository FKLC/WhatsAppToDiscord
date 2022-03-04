package main

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"reflect"
	"regexp"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unicode"

	dc "github.com/bwmarrin/discordgo"
	_ "github.com/lib/pq"
	_ "github.com/mattn/go-sqlite3"
	"github.com/skip2/go-qrcode"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/binary/proto"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
)

var (
	waClient     *whatsmeow.Client
	settings     Settings
	dcSession    *dc.Session
	chats        = make(map[string]*DCWebhook)
	startTime    = time.Now()
	commandsHelp = "Commands:\n`start <number with country code or name>`: Starts a new conversation\n`list`: Lists existing chats\n`list <chat name to search>`: Finds chats that contain the given argument\n`addToWhitelist <channel name>`: Adds specified conversation to the whitelist\n`removeFromWhitelist <channel name>`: Removes specified conversation from the whitelist\n`listWhitelist`: Lists all whitelisted conversations\n`enabledcrefix`: Adds your Discord username to messages\n`disabledcrefix`: Stops adding your Discord username to messages\n`enablewaprefix`: Unknown function\n`disablewaprefix`: Unknown function"
	guild        *dc.Guild
	contacts     map[types.JID]types.ContactInfo
	dbConnection *sql.DB
)

func main() {
	defer finishLogging(initializeLogging())

	log.Println("Starting")

	initializeDB()
	log.Println("Initialized database connection")

	parseSettings()
	log.Println("Settings parsed")

	initializeDiscord()
	log.Println("Discord handlers added")

	parseChats()
	log.Println("Chats parsed")

	repairChannels()
	log.Println("Channels repaired")

	initializeWhatsApp()
	log.Println("WhatsApp handlers added")

	checkVersion()
	log.Println("Update checked")

	fmt.Println("Bot is now running. Press CTRL-C to exit.")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt, os.Kill)
	<-sc

	save()

	handlePanic(dbConnection.Close())
	handlePanic(dcSession.Close())
	waClient.Disconnect()
}

// General types and functions
func initializeLogging() *os.File {
	log.SetFlags(log.Ltime | log.Lshortfile)
	logFilename := "logs.txt"
	if os.Getenv("DYNO") != "" {
		logFilename = "/tmp/logs.txt"
	}
	file, err := os.OpenFile(logFilename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0666)
	if err != nil {
		panic(err)
	}
	log.SetOutput(file)
	return file
}

type fileLogger struct{}

func (s *fileLogger) Errorf(msg string, args ...interface{}) { log.Println("ERROR", msg, args) }
func (s *fileLogger) Warnf(msg string, args ...interface{})  { log.Println("WARN", msg, args) }
func (s *fileLogger) Infof(msg string, args ...interface{})  { log.Println("INFO", msg, args) }
func (s *fileLogger) Debugf(msg string, args ...interface{}) {}
func (s *fileLogger) Sub(mod string) waLog.Logger            { return s }

func finishLogging(file *os.File) {
	if err := recover(); err != nil {
		log.Println(err)
		buf := make([]byte, 65536)
		log.Println(string(buf[:runtime.Stack(buf, true)]))
		save()
	}
	file.Close()
}

type Settings struct {
	Token            string
	GuildID          string
	CategoryID       string
	ControlChannelID string
	Whitelist        []string
	DiscordPrefix    bool
	WAGroupPrefix    bool
}

func parseSettings() {
	var result sql.NullString
	getData("settings", &result)
	var err error
	if result.Valid == true {
		err = json.Unmarshal([]byte(result.String), &settings)
	} else {
		err = unmarshal("settings.json", &settings)
	}
	if err != nil {
		if _, fileNotExist := err.(*os.PathError); fileNotExist {
			firstRun()
		} else if _, isJSONCorrupted := err.(*json.SyntaxError); isJSONCorrupted {
			anwser := input("settings.json file seems to be corrupted. You can fix it manually or you will have to run the	 setup again. Would you like to run setup? (Y/N): ")
			if strings.ToLower(anwser) == "y" {
				firstRun()
			} else {
				log.Println("User chose to fix settings.json manually")
				os.Exit(0)
			}
		} else {
			panic(err)
		}
	} else if settings.Token == "" {
		firstRun()
	}
	settingsJSON, _ := json.Marshal(settings)
	insertOrUpdate("settings", string(settingsJSON))
	os.Remove("settings.json")

	whitelistLength = len(settings.Whitelist)
}

func firstRun() {
	fmt.Println("It seems like this is your first run.")
	if os.Getenv("DYNO") != "" {
		settings.Token = os.Getenv("BOT_TOKEN")
	} else {
		settings.Token = input("Please enter your bot token: ")
	}
	dcSession, err := dc.New("Bot " + settings.Token)
	handlePanic(err)
	channelsCreated := make(chan bool)

	dcSession.AddHandler(func(_ *dc.Session, guildCreate *dc.GuildCreate) {
		settings.GuildID = guildCreate.ID
		categoryChannel, err := dcSession.GuildChannelCreateComplex(settings.GuildID, dc.GuildChannelCreateData{
			Name: "WhatsApp",
			Type: dc.ChannelTypeGuildCategory})
		handlePanic(err)
		settings.CategoryID = categoryChannel.ID

		controlChannel, err := dcSession.GuildChannelCreateComplex(settings.GuildID, dc.GuildChannelCreateData{
			Name:     "control-room",
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID})
		handlePanic(err)
		settings.ControlChannelID = controlChannel.ID
		channelsCreated <- true
	})

	err = dcSession.Open()
	handlePanic(err)
	fmt.Printf("You can invite the bot using the following link: https://discordapp.com/oauth2/authorize?client_id=%v&scope=bot&permissions=536879120\n", dcSession.State.User.ID)
	<-channelsCreated
	save()
	handlePanic(err)
	fmt.Println("Settings saved.")
}

func parseChats() {
	var result sql.NullString
	getData("chats", &result)
	if result.Valid == true {
		json.Unmarshal([]byte(result.String), &chats)
	} else {
		var err = unmarshal("chats.json", &chats)
		if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
			if _, isJSONCorrupted := err.(*json.SyntaxError); isJSONCorrupted {
				anwser := input("chats.json file seems to be corrupted. You can fix it manually or the bot won't send messages to old channels and start to create new ones. Would you like to reset? (Y/N): ")
				if strings.ToLower(anwser) == "y" {
					handlePanic(marshal("chats.json", chats))
				} else {
					log.Println("User chose to fix chats.json manually")
					os.Exit(0)
				}
			} else {
				panic(err)
			}
		}
		os.Remove("chats.json")
	}
}

func save() {
	data, _ := json.Marshal(settings)
	insertOrUpdate("settings", string(data))

	data, _ = json.Marshal(chats)
	insertOrUpdate("chats", string(data))
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

type githubReleaseResp struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
}

func checkVersion() {
	cl := http.Client{
		Timeout: time.Second * 2,
	}

	r, err := cl.Get("https://api.github.com/repos/FKLC/WhatsAppToDiscord/releases/latest")
	if err != nil {
		channelMessageSend(settings.ControlChannelID, fmt.Sprintf("Update check failed. Error: %v", err.Error()))
		log.Printf("Update check failed. Error: %v\n", err.Error())
		return
	}
	defer r.Body.Close()

	var versionInfo githubReleaseResp
	err = json.NewDecoder(r.Body).Decode(&versionInfo)
	if err != nil {
		channelMessageSend(settings.ControlChannelID, fmt.Sprintf("Update check failed. Error: %v", err.Error()))
		log.Printf("Update check failed. Error: %v\n", err.Error())
		return
	}

	if versionInfo.TagName != "v0.4.7" {
		channelMessageSend(settings.ControlChannelID, fmt.Sprintf("New %v version is available. Download the latest release from here https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/WA2DC.exe. \nChangelog: ```%v```", versionInfo.TagName, versionInfo.Body))
	}
}

// Discord related types and functions
type DCWebhook struct {
	dc.Webhook
	LastTimestamp uint64 `json:"last_timestamp"`
	LastMessageID string `json:"last_message_ID"`
}

func initializeDiscord() {
	var err error
	dcSession, err = dc.New("Bot " + settings.Token)
	handlePanic(err)

	dcSession.AddHandler(dcOnMessageCreate)
	dcSession.AddHandler(dcOnChannelDelete)

	log.Println(settings.Token)
	err = dcSession.Open()
	handlePanic(err)

	guild, err = dcSession.Guild(settings.GuildID)
	handlePanic(err)
}

func repairChannels() {
	channels, err := dcSession.GuildChannels(settings.GuildID)
	handlePanic(err)

	categoryChannelExists := false
	controlChannelExists := false
	for _, channel := range channels {
		if channel.ID == settings.CategoryID {
			categoryChannelExists = true
		}
		if channel.ID == settings.ControlChannelID {
			controlChannelExists = true
		}
	}

	if !categoryChannelExists {
		categoryChannel, err := dcSession.GuildChannelCreateComplex(settings.GuildID, dc.GuildChannelCreateData{
			Name: "WhatsApp",
			Type: dc.ChannelTypeGuildCategory})
		handlePanic(err)
		settings.CategoryID = categoryChannel.ID
		channels = append(channels, categoryChannel)
	}

	if !controlChannelExists {
		controlChannel, err := dcSession.GuildChannelCreateComplex(settings.GuildID, dc.GuildChannelCreateData{
			Name:     "control-room",
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID})
		handlePanic(err)
		settings.ControlChannelID = controlChannel.ID
		channels = append(channels, controlChannel)
	}

	dcSession.ChannelEditComplex(settings.ControlChannelID, &dc.ChannelEdit{Position: 0, ParentID: settings.CategoryID})
	for _, channel := range channels {
		for _, webhook := range chats {
			if channel.ID == webhook.ChannelID {
				dcSession.ChannelEditComplex(webhook.ChannelID, &dc.ChannelEdit{Position: 999, ParentID: settings.CategoryID})
			}
			break
		}
	}

	var matchedChats []string
	for _, channel := range channels {
		if channel.ID != settings.ControlChannelID {
			exist := false
			for jid, chat := range chats {
				if chat.ChannelID == channel.ID {
					matchedChats = append(matchedChats, jid)
					exist = true
					break
				}
			}
			if !exist && channel.ParentID == settings.CategoryID {
				_, err := dcSession.ChannelDelete(channel.ID)
				handlePanic(err)
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
			dcCommandStart(parts)
		case "list":
			dcCommandList(parts)
		case "addtowhitelist":
			dcCommandAddToWhitelist(message.Content)
		case "removefromwhitelist":
			dcCommandRemoveFromWhitelist(message.Content)
		case "listwhitelist":
			dcCommandListWhitelist()
		case "ping":
			timestamp, _ := message.Timestamp.Parse()
			channelMessageSend(settings.ControlChannelID, fmt.Sprintf("Pong! %vms", time.Now().Sub(timestamp).Milliseconds()))
		case "enabledcprefix":
			settings.DiscordPrefix = true
			channelMessageSend(settings.ControlChannelID, "Discord username prefix enabled!")
		case "disabledcprefix":
			settings.DiscordPrefix = false
			channelMessageSend(settings.ControlChannelID, "Discord username prefix disabled!")
		case "enablewaprefix":
			settings.WAGroupPrefix = true
			channelMessageSend(settings.ControlChannelID, "WhatsApp name prefix enabled!")
		case "disablewaprefix":
			settings.WAGroupPrefix = false
			channelMessageSend(settings.ControlChannelID, "WhatsApp name prefix disabled!")
		default:
			channelMessageSend(settings.ControlChannelID, fmt.Sprintf("Unknown Command: %v\n%v", parts[0], commandsHelp))
		}
		return
	}

	// Not a command, send a WhatsApp message
	for key, chat := range chats {
		if chat.ChannelID == message.ChannelID {
			waSendMessage(key, message)
			break
		}
	}
}

func dcCommandStart(parts []string) {
	if len(parts) == 1 {
		channelMessageSend(settings.ControlChannelID, "Please enter a phone number or name. Usage: `start <number with country code or name>`")
		return
	}
	if isInt(parts[1]) {
		getOrCreateChannel(parts[1] + "@s.whatsapp.net")
		if whitelistLength != 0 {
			settings.Whitelist = append(settings.Whitelist, parts[1]+"@s.whatsapp.net")
			whitelistLength++
		}
	} else {
		name := strings.Join(parts[1:], " ")
		for jid, info := range contacts {
			if info.FullName == name {
				getOrCreateChannel(jid.String())
				if whitelistLength != 0 {
					settings.Whitelist = append(settings.Whitelist, jid.String())
					whitelistLength++
				}
			}
		}
	}
}

func dcCommandList(parts []string) {
	query := ""
	if len(parts) > 1 {
		query = strings.ToLower(strings.Join(parts[1:], " "))
	}
	list := "```"
	for _, info := range contacts {
		if strings.Contains(strings.ToLower(info.FullName), query) {
			list += info.FullName + "\n"
		}
	}
	if list != "```" {
		list = list + "```"
	} else {
		list = "No results were found"
	}
	channelMessageSend(settings.ControlChannelID, list)
}

var channelMentionRegex, _ = regexp.Compile(`<#(\d*)>`)

func dcCommandAddToWhitelist(messagecontent string) {
	match := channelMentionRegex.FindStringSubmatch(messagecontent)
	if len(match) != 2 {
		channelMessageSend(settings.ControlChannelID, "Please enter a valid channel name. Usage: `addToWhitelist #<target channel>`")
		return
	}
	for key, chat := range chats {
		if chat.ChannelID == match[1] {
			settings.Whitelist = append(settings.Whitelist, key)
			whitelistLength++
			channelMessageSend(settings.ControlChannelID, "Added to whitelist!")
			return
		}
	}
	channelMessageSend(settings.ControlChannelID, "Couldn't find any corresponding chat.")
}

func dcCommandRemoveFromWhitelist(messagecontent string) {
	match := channelMentionRegex.FindStringSubmatch(messagecontent)
	if len(match) != 2 {
		channelMessageSend(settings.ControlChannelID, "Please enter a valid channel name. Usage: `removeFromWhitelist #<target channel>`")
		return
	}
	for jid, chatInfo := range chats {
		if chatInfo.ChannelID == match[1] {
			for i, whitelistedJid := range settings.Whitelist {
				if jid == whitelistedJid {
					settings.Whitelist = remove(settings.Whitelist, i)
					whitelistLength--
					channelMessageSend(settings.ControlChannelID, "Removed from whitelist!")
					return
				}
			}
			channelMessageSend(settings.ControlChannelID, "This conversation is not whitelisted!")
		}
	}
	channelMessageSend(settings.ControlChannelID, "Couldn't find any corresponding chat.")
}

func dcCommandListWhitelist() {
	names := make([]string, whitelistLength)
	for i, jid := range settings.Whitelist {
		names[i] = jidToName(jid)
	}
	channelMessageSend(settings.ControlChannelID, fmt.Sprintf("Whitelisted Conversations: ```%v```", strings.Join(names, "\n")))
}

func dcOnChannelDelete(_ *dc.Session, deletedChannel *dc.ChannelDelete) {
	for key, chat := range chats {
		if chat.ChannelID == deletedChannel.ID {
			delete(chats, key)
			break
		}
	}
}

func channelMessageSend(channelID string, message string) {
	_, err := dcSession.ChannelMessageSend(channelID, message)
	if err != nil {
		log.Println(err)
	}
}

func getOrCreateChannel(jid string) *DCWebhook {
	chat, ok := chats[jid]
	if !ok {
		name := jidToName(jid)
		var (
			channel *dc.Channel
			webhook *dc.Webhook
			err     error
		)
		for channel, err = dcSession.GuildChannelCreateComplex(guild.ID, dc.GuildChannelCreateData{
			Name:     name,
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID}); err != nil; {
			log.Printf("Error occurred while creating channel. Error: %v\n", err.Error())
		}
		for webhook, err = dcSession.WebhookCreate(channel.ID, "WA2DC", ""); err != nil; {
			log.Printf("Error occurred while creating channel. Error: %v\n", err.Error())
		}
		chats[jid] = &DCWebhook{*webhook, 0, ""}
		chat = chats[jid]
	}
	return chat
}

// Whatsapp

func initializeWhatsApp() {
	connectToWhatsApp()
	channelMessageSend(settings.ControlChannelID, "WhatsApp connection successfully made!")
	startTime = time.Now()
	var err error
	contacts, err = waClient.Store.Contacts.GetAllContacts()
	handlePanic(err)
	groups, err := waClient.GetJoinedGroups()
	for _, group := range groups {
		contacts[group.JID] = types.ContactInfo{Found: true, FirstName: group.Name, FullName: group.Name, PushName: group.Name, BusinessName: group.Name}
	}
}

func connectToWhatsApp() {
	container, err := NewSQLStore(reflect.ValueOf(dbConnection).Type().Name(), &fileLogger{})
	handlePanic(err)
	deviceStore, err := container.GetFirstDevice()
	handlePanic(err)
	waClient = whatsmeow.NewClient(deviceStore, &fileLogger{})
	waClient.AddEventHandler(messageHandler)

	if waClient.Store.ID == nil {
		// No ID stored, new login
		qrChan, _ := waClient.GetQRChannel(context.Background())
		err = waClient.Connect()
		handlePanic(err)
		for evt := range qrChan {
			if evt.Event == "code" {
				var png []byte
				png, err = qrcode.Encode(string(evt.Code), qrcode.Medium, 256)
				handlePanic(err)
				f := bytes.NewReader(png)

				_, err = dcSession.ChannelMessageSendComplex(settings.ControlChannelID, &dc.MessageSend{
					Files: []*dc.File{
						{
							Name:   "qrcode.png",
							Reader: f,
						},
					},
				})
				if err != nil {
					log.Println(err)
				}
			}
		}
	} else {
		// Already logged in, just connect
		err = waClient.Connect()
		handlePanic(err)
	}
}

func NewSQLStore(dialect string, log waLog.Logger) (*sqlstore.Container, error) {
	// Modified sqlstore.New function
	container := sqlstore.NewWithDB(dbConnection, dialect, log)
	err := container.Upgrade()
	if err != nil {
		return nil, fmt.Errorf("failed to upgrade database: %w", err)
	}
	return container, nil
}

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
		message.Content = fmt.Sprintf("[%v] %v", username, message.Content)
	}
	pJid, _ := types.ParseJID(jid)
	whatsappMessage := &proto.Message{Conversation: &message.Content}
	if message.MessageReference != nil {
		quotedMessage, _ := dcSession.ChannelMessage(message.MessageReference.ChannelID, message.MessageReference.MessageID)
		var participantJid string
		if quotedMessage.WebhookID != "" && quotedMessage.Author.Username != "You" {
			for jid, info := range contacts {
				if info.FullName == quotedMessage.Author.Username {
					participantJid = jid.String()
					break
				}
			}
			if participantJid == "" {
				participantJid = quotedMessage.Author.Username + "@" + waClient.Store.ID.Server
			}
		} else {
			participantJid = waClient.Store.ID.User + "@" + waClient.Store.ID.Server
		}
		whatsappMessage = &proto.Message{ExtendedTextMessage: &proto.ExtendedTextMessage{Text: &message.Content, ContextInfo: &proto.ContextInfo{Participant: &participantJid, QuotedMessage: &proto.Message{Conversation: &quotedMessage.Content}}}}
	}
	_, err := waClient.SendMessage(pJid, message.ID, whatsappMessage)
	if err != nil {
		channelMessageSend(message.ChannelID, fmt.Sprintf("Failed to send message! Error: %v", err.Error()))
	}
	chats[jid].LastMessageID = message.ID
}

func jidToName(jid string) string {
	if strings.HasPrefix(jid, waClient.Store.ID.User) && !strings.HasSuffix(jid, "@g.us") {
		return "You"
	}
	pJid, _ := types.ParseJID(jid)
	name := contacts[pJid].FullName
	if name == "" {
		name = strings.Split(strings.Split(jid, "@")[0], "-")[0]
		if contacts[pJid].PushName != "" {
			name += " ~" + contacts[pJid].PushName
		}
	}
	return name
}

var profilePicsCache = make(map[string]string)

func messageHandler(evt interface{}) {
	if m, ok := evt.(*events.Message); ok {
		if shouldBeSent(m.Info) {
			var username string
			username = jidToName(m.Info.MessageSource.Sender.String())

			var messageContent string
			if settings.WAGroupPrefix && m.Info.IsGroup {
				messageContent = "[" + username + "] "
			}

			if m.Message.GetExtendedTextMessage() != nil {
				messageContent += fmt.Sprintf("> %v: %v\n%v", jidToName(*m.Message.GetExtendedTextMessage().ContextInfo.Participant), strings.Join(strings.Split(*m.Message.GetExtendedTextMessage().ContextInfo.QuotedMessage.Conversation, "\n"), "\n> "), *m.Message.GetExtendedTextMessage().Text)
			} else {
				messageContent += m.Message.GetConversation()
			}
			chat := getOrCreateChannel(m.Info.MessageSource.Chat.String())
			var (
				data     []byte
				err      error
				filename = ""
			)
			if m.Message.GetImageMessage() != nil {
				data, err = waClient.Download(m.Message.GetImageMessage())
				if m.Message.GetImageMessage().Caption != nil {
					messageContent += *m.Message.GetImageMessage().Caption
				}
				filename = "image." + strings.Split(*m.Message.GetImageMessage().Mimetype, "/")[1]
			} else if m.Message.GetVideoMessage() != nil {
				data, err = waClient.Download(m.Message.GetVideoMessage())
				if m.Message.GetVideoMessage().Caption != nil {
					messageContent += *m.Message.GetVideoMessage().Caption
				}
				filename = "video." + strings.Split(*m.Message.GetVideoMessage().Mimetype, "/")[1]
			} else if m.Message.GetAudioMessage() != nil {
				data, err = waClient.Download(m.Message.GetAudioMessage())
				extension := strings.Split(*m.Message.GetAudioMessage().Mimetype, "/")[1]
				if strings.HasPrefix(extension, "ogg") {
					extension = "ogg"
				}
				filename = "audio." + extension
			} else if m.Message.GetDocumentMessage() != nil {
				data, err = waClient.Download(m.Message.GetDocumentMessage())
				filename = *m.Message.GetDocumentMessage().Title
			} else if m.Message.GetStickerMessage() != nil {
				data, err = waClient.Download(m.Message.GetStickerMessage())
				filename = "sticker." + strings.Split(*m.Message.GetStickerMessage().Mimetype, "/")[1]
			}
			if err != nil {
				dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
					Content:  fmt.Sprintf("Received a file, but can't send it here. Check Whatsapp on your phone. Error: %v", err.Error()),
					Username: username,
				})
			} else if len(data) > 8388284 {
				dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
					Content:  "Received a file, but it's over 8MB. Check Whatsapp on your phone.",
					Username: username,
				})
			}

			if data != nil {
				uri := dc.EndpointWebhookToken(chat.ID, chat.Token)
				_, err := dcSession.RequestWithLockedBucket("POST", uri+"?wait=true", "multipart/form-data; boundary=123", append(append([]byte("--123\nContent-Disposition: form-data; name=\"file\"; filename=\""+filename+"\"\n\n"), data...), []byte("\n--123--")...), dcSession.Ratelimiter.LockBucket(uri), 0)
				if TimeoutErr, isTimeoutErr := err.(*url.Error); isTimeoutErr && TimeoutErr.Timeout() {
					log.Printf("Timed out while sending message. Error: %v\n", TimeoutErr.Error())
					messageHandler(m)
					return
				} else {
					handlePanic(err)
				}
			}

			profilePicURL, exists := profilePicsCache[m.Info.MessageSource.Sender.String()]
			if !exists {
				profilePicInfo, _ := waClient.GetProfilePictureInfo(m.Info.MessageSource.Sender, true)
				if profilePicInfo != nil {
					profilePicsCache[m.Info.MessageSource.Sender.String()] = profilePicInfo.URL
				} else {
					profilePicsCache[m.Info.MessageSource.Sender.String()] = ""
				}
				profilePicURL, _ = profilePicsCache[m.Info.MessageSource.Sender.String()]
			}
			if messageContent != "" {
				_, err = dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
					Content:   messageContent,
					Username:  username,
					AvatarURL: profilePicURL,
				})
				if TimeoutErr, isTimeoutErr := err.(*url.Error); isTimeoutErr && TimeoutErr.Timeout() {
					log.Printf("Timed out while sending message. Error: %v\n", TimeoutErr.Error())
					messageHandler(m)
					return
				} else {
					handlePanic(err)
				}
			}

			chats[m.Info.MessageSource.Chat.String()].LastMessageID = m.Info.ID
			chats[m.Info.MessageSource.Chat.String()].LastTimestamp = uint64(m.Info.Timestamp.Unix())
		}
	}
}

func shouldBeSent(info types.MessageInfo) bool {
	var isLastSentMessage = false
	if chats[info.MessageSource.Chat.String()] != nil {
		isLastSentMessage = chats[info.MessageSource.Chat.String()].LastMessageID == info.ID
	}
	return (!info.MessageSource.IsFromMe || (info.MessageSource.IsFromMe && !isLastSentMessage)) && startTime.Before(info.Timestamp) && checkWhitelist(info.MessageSource.Chat.String())
}

// Database functions and variables

func initializeDB() {
	driverName := "sqlite3"
	address := "file:storage.db?_foreign_keys=on"
	if os.Getenv("DYNO") != "" {
		driverName = "postgres"
		address = os.Getenv("DATABASE_URL")
	}
	err := connectDB(driverName, address)
	handlePanic(err)
	_, err = dbConnection.Exec("CREATE TABLE IF NOT EXISTS WA2DC (name VARCHAR PRIMARY KEY, data TEXT);")
	handlePanic(err)
}

func connectDB(dialect, address string) (err error) {
	dbConnection, err = sql.Open(dialect, address)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}
	return nil
}

func insertOrUpdate(name string, data string) {
	_, err := dbConnection.Exec("INSERT INTO WA2DC (name, data) VALUES($1, $2) ON CONFLICT(name) DO UPDATE SET data=excluded.data;", name, data)
	handlePanic(err)
}

func getData(name string, dest *sql.NullString) error {
	return dbConnection.QueryRow("SELECT data FROM WA2DC WHERE name=$1", name).Scan(dest)
}

// Other

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

func handlePanic(err error) {
	if err != nil {
		panic(err)
	}
}

func isInt(s string) bool {
	for _, c := range s {
		if !unicode.IsDigit(c) {
			return false
		}
	}
	return true
}

func remove(s []string, i int) []string {
	s[len(s)-1], s[i] = s[i], s[len(s)-1]
	return s[:len(s)-1]
}
