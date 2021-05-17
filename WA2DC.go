package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
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
}

type githubReleaseResp struct {
	TagName string `json:"tag_name"`
	Body    string `json:"body"`
}

type DCWebhook struct {
	*dc.Webhook
	LastTimestamp uint64 `json:"last_timestamp"`
	LastMessageID string `json:"last_message_ID"`
}

type CappedLogger struct {
	entries [1000]string
	index   int
}

func (l *CappedLogger) println(depth int, v ...interface{}) {
	l.entries[(l.index)%1000] = time.Now().Local().Format("2006/01/02 15:04:05 ") + l.getLine(depth) + " " + fmt.Sprintln(v...)
	l.index++
}

func (l *CappedLogger) Println(v ...interface{}) {
	l.println(3, v...)
}

func (l CappedLogger) String() string {
	return strings.Join(append(l.entries[(l.index % 1000):][:], l.entries[:(l.index%1000)]...), "")
}

func (l CappedLogger) getLine(depth int) string {
	_, file, line, ok := runtime.Caller(depth)
	if !ok {
		file = "???"
		line = 0
	}
	return fmt.Sprintf("%v:%v:", file, line)
}

var (
	startTime    = time.Now()
	settings     Settings
	commandsHelp = "\nCommands:\n`start <number with country code or name>`: Starts a new conversation\n`list`: Lists existing chats"
	dcSession    *dc.Session
	guild        *dc.Guild
	waConnection *wa.Conn
	chats        = make(map[string]*DCWebhook)
	log          = CappedLogger{}
)

func main() {
	file, err := os.OpenFile("logs.txt", os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0666)
	if err != nil {
		panic(err)
	}
	defer finishLogging(file)

	log.Println("Starting")

	parseSettings()
	log.Println("settings.json parsed")

	initializeDiscord()
	log.Println("Discord handlers added")

	parseChats()
	log.Println("chats.json parsed")

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

	handlePanic(marshal("settings.json", &settings))
	log.Println("settings.json saved")

	handlePanic(marshal(settings.ChatsFilePath, chats))
	log.Println("chats.json saved")

	handlePanic(dcSession.Close())
	log.Println("Discord connection closed")
}

func parseSettings() {
	var err = unmarshal("settings.json", &settings)
	if err != nil {
		if _, fileNotExist := err.(*os.PathError); fileNotExist {
			firstRun()
		} else if _, isJSONCorrupted := err.(*json.SyntaxError); isJSONCorrupted {
			anwser := input("settings.json file seems to be corrupted. You can fix it manually or you will have to run setup again. Would you like to run setup? (Y/N): ")
			if strings.ToLower(anwser) == "y" {
				firstRun()
			} else {
				log.Println("User chose to fix settings.json manually")
				os.Exit(0)
			}
		} else {
			panic(err)
		}
	}

	whitelistLength = len(settings.Whitelist)
}

func parseChats() {
	var err = unmarshal(settings.ChatsFilePath, &chats)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		if _, isJSONCorrupted := err.(*json.SyntaxError); isJSONCorrupted {
			anwser := input("chats.json file seems to be corrupted. You can fix it manually or the bot won't send messages to old channels and start to create new ones. Would you like to reset? (Y/N): ")
			if strings.ToLower(anwser) == "y" {
				handlePanic(marshal(settings.ChatsFilePath, chats))
			} else {
				log.Println("User chose to fix chats.json manually")
				os.Exit(0)
			}
		} else if _, isOldVer := err.(*json.UnmarshalTypeError); isOldVer {
			createOrMergeWebhooks()
		} else {
			panic(err)
		}
	}
}

func finishLogging(file *os.File) {
	if err := recover(); err != nil {
		log.println(2, err)
		buf := make([]byte, 65536)
		log.println(2, string(buf[:runtime.Stack(buf, true)]))
		if settings.Token != "" {
			marshal("settings.json", &settings)
		}
		if len(chats) != 0 {
			marshal(settings.ChatsFilePath, chats)
		}
	}
	file.Write([]byte(log.String()))
	file.Close()
	dcSession.Close()
}

// Discord
func initializeDiscord() {
	var err error
	dcSession, err = dc.New("Bot " + settings.Token)
	handlePanic(err)

	dcSession.AddHandler(dcOnMessageCreate)
	dcSession.AddHandler(dcOnChannelDelete)

	err = dcSession.Open()
	handlePanic(err)

	guild, err = dcSession.Guild(settings.GuildID)
	handlePanic(err)
}

func repairChannels() {
	channels, err := dcSession.GuildChannels(settings.GuildID)
	handlePanic(err)

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
		default:
			channelMessageSend(settings.ControlChannelID, "Unknown Command: "+parts[0]+commandsHelp)
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

func dcOnChannelDelete(_ *dc.Session, deletedChannel *dc.ChannelDelete) {
	for key, chat := range chats {
		if chat.ChannelID == deletedChannel.ID {
			delete(chats, key)
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
	query := ""
	if len(parts) > 1 {
		query = strings.ToLower(strings.Join(parts[1:], " "))
	}
	list := "```"
	for _, chat := range waConnection.Store.Chats {
		if strings.Contains(strings.ToLower(chat.Name), query) {
			list += chat.Name + "\n"
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
	channelMessageSend(settings.ControlChannelID, "Whitelisted Conversations: ```"+strings.Join(names, "\n")+"```")
}

// WhatsApp
func initializeWhatsApp() {
	var err error
	waConnection, err = wa.NewConn(20 * time.Second)
	handlePanic(err)
	waConnection.SetClientVersion(0, 4, 1307) // https://github.com/Rhymen/go-whatsapp/issues/304#issuecomment-604580880

	connectToWhatsApp()
	channelMessageSend(settings.ControlChannelID, "WhatsApp connection successfully made!")
	startTime = time.Now()
	waConnection.AddHandler(waHandler{})
}

func connectToWhatsApp() {
	var waSession wa.Session
	err := unmarshal(settings.SessionFilePath, &waSession)
	if err == nil {
		_, err := waConnection.RestoreWithSession(waSession)
		if err != nil {
			channelMessageSend(settings.ControlChannelID, "Session couldn't restored. "+err.Error()+". Going to create a new session!")
			handlePanic(os.Remove(settings.SessionFilePath))
			connectToWhatsApp()
			return
		}
	} else if _, ok := err.(*os.PathError); ok {
		qrChan := make(chan string)
		go func() {
			var png []byte
			png, err = qrcode.Encode(<-qrChan, qrcode.Medium, 256)
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
		}()
		session, err := waConnection.Login(qrChan)
		if err != nil && err.Error() == "qr code scan timed out" {
			channelMessageSend(settings.ControlChannelID, "Timed out. Please rescan QR Code. "+err.Error())
			connectToWhatsApp()
			return
		} else {
			handlePanic(err)
		}
		sessionJSON, err := json.Marshal(session)
		handlePanic(err)
		handlePanic(ioutil.WriteFile(settings.SessionFilePath, sessionJSON, 0644))
	} else {
		panic(err)
	}
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
		message.Content = "[" + username + "] " + message.Content
	}
	var (
		lastMessageID string
		err           error
	)
	for lastMessageID, err = waConnection.Send(wa.TextMessage{
		Info: wa.MessageInfo{
			RemoteJid: jid,
		},
		Text: message.Content,
	}); err != nil && err.Error() == "sending message timed out"; {
		log.Println("Timed out while sending message. Error: sending message timed out")
	}
	handlePanic(err)
	chats[jid].LastMessageID = lastMessageID
}

type waHandler struct{}

func (waHandler) HandleError(err error) {
	_, isConnectionClosed := err.(*wa.ErrConnectionClosed)
	_, isConnectionFailed := err.(*wa.ErrConnectionFailed)
	if isConnectionClosed || isConnectionFailed {
		initializeWhatsApp()
	}
	log.Println(err)
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

func (handler waHandler) HandleTextMessage(message wa.TextMessage) {
	if shouldBeSent(message.Info) {
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
		if TimeoutErr, isTimeoutErr := err.(*url.Error); isTimeoutErr && TimeoutErr.Timeout() {
			log.Println("Timed out while sending message. Error: " + TimeoutErr.Error())
			handler.HandleTextMessage(message)
			return
		} else {
			handlePanic(err)
		}
		chats[message.Info.RemoteJid].LastMessageID = message.Info.Id
		chats[message.Info.RemoteJid].LastTimestamp = message.Info.Timestamp
	}
}

func handleMediaMessage(info wa.MessageInfo, content string, data []byte, fileName string, skipContent bool) {
	if shouldBeSent(info) {
		var username string
		if info.FromMe {
			username = "You"
		} else if info.Source.Participant == nil {
			username = jidToName(info.RemoteJid)
		} else {
			username = jidToName(*info.Source.Participant)
		}

		chat := getOrCreateChannel(info.RemoteJid)
		if content != "" && !skipContent {
			_, err := dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
				Content:  content,
				Username: username,
			})
			if TimeoutErr, isTimeoutErr := err.(*url.Error); isTimeoutErr && TimeoutErr.Timeout() {
				log.Println("Timed out while sending message. Error: " + TimeoutErr.Error())
				handleMediaMessage(info, content, data, fileName, false)
				return
			} else {
				handlePanic(err)
			}
		}

		uri := dc.EndpointWebhookToken(chat.ID, chat.Token)
		_, err := dcSession.RequestWithLockedBucket("POST", uri+"?wait=true", "multipart/form-data; boundary=123", append(append([]byte("--123\nContent-Disposition: form-data; name=\"file\"; filename=\""+fileName+"\"\n\n"), data...), []byte("\n--123--")...), dcSession.Ratelimiter.LockBucket(uri), 0)
		if TimeoutErr, isTimeoutErr := err.(*url.Error); isTimeoutErr && TimeoutErr.Timeout() {
			log.Println("Timed out while sending message. Error: " + TimeoutErr.Error())
			handleMediaMessage(info, content, data, fileName, true)
			return
		} else {
			handlePanic(err)
		}
		chats[info.RemoteJid].LastMessageID = info.Id
		chats[info.RemoteJid].LastTimestamp = info.Timestamp
	}
}

func (waHandler) HandleImageMessage(message wa.ImageMessage) {
	if checkFileSizeLimit(reflect.ValueOf(&message).Elem().FieldByName("fileLength").Uint(), message.Info) {
		return
	}
	data, err := message.Download()
	if err != nil {
		log.Println(err)
		return
	}

	extension := "jpeg"
	if message.Type != "" {
		extension = strings.Split(strings.Split(message.Type, "/")[1], ";")[0]
	}
	handleMediaMessage(message.Info, message.Caption, data, "image."+extension, false)
}

func (waHandler) HandleVideoMessage(message wa.VideoMessage) {
	if checkFileSizeLimit(reflect.ValueOf(&message).Elem().FieldByName("fileLength").Uint(), message.Info) {
		return
	}
	data, err := message.Download()
	if err != nil {
		log.Println(err)
		return
	}

	extension := "mp4"
	if message.Type != "" {
		extension = strings.Split(strings.Split(message.Type, "/")[1], ";")[0]
	}
	handleMediaMessage(message.Info, message.Caption, data, "video."+extension, false)
}

func (waHandler) HandleAudioMessage(message wa.AudioMessage) {
	if checkFileSizeLimit(reflect.ValueOf(&message).Elem().FieldByName("fileLength").Uint(), message.Info) {
		return
	}
	data, err := message.Download()
	if err != nil {
		log.Println(err)
		return
	}

	extension := "ogg"
	if message.Type != "" {
		extension = strings.Split(strings.Split(message.Type, "/")[1], ";")[0]
	}
	handleMediaMessage(message.Info, "", data, "audio."+extension, false)
}

func (waHandler) HandleDocumentMessage(message wa.DocumentMessage) {
	if checkFileSizeLimit(reflect.ValueOf(&message).Elem().FieldByName("fileLength").Uint(), message.Info) {
		return
	}
	data, err := message.Download()
	if err != nil {
		log.Println(err)
		return
	}

	handleMediaMessage(message.Info, "", data, message.FileName, false)
}

func checkFileSizeLimit(fileSize uint64, info wa.MessageInfo) bool {
	if fileSize > 8388531 && shouldBeSent(info) {
		chat := getOrCreateChannel(info.RemoteJid)
		_, err := dcSession.WebhookExecute(chat.ID, chat.Token, true, &dc.WebhookParams{
			Content:  "The user uploaded a file larger than 8MB. Discord doesn't allow file uploads bigger than 8MB. Please check your WhatsApp to see the file.",
			Username: "WA2DC",
		})
		if err != nil {
			log.Println(err)
		}
		log.Println("Received a file bigger than 8MB")
		return true
	} else {
		return false
	}
}

func shouldBeSent(info wa.MessageInfo) bool {
	var isLastSentMessage = false
	if chats[info.RemoteJid] != nil {
		isLastSentMessage = chats[info.RemoteJid].LastMessageID == info.Id
	}
	return (!info.FromMe || (info.FromMe && !isLastSentMessage)) && startTime.Before(time.Unix(int64(info.Timestamp), 0)) && checkWhitelist(info.RemoteJid)
}

// Other stuff
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
			log.Println("Error occurred while creating channel. Error: " + err.Error())
		}
		for webhook, err = dcSession.WebhookCreate(channel.ID, "WA2DC", ""); err != nil; {
			log.Println("Error occurred while creating channel. Error: " + err.Error())
		}
		chats[jid] = &DCWebhook{webhook, 0, ""}
		chat = chats[jid]
	}
	return chat
}

func createOrMergeWebhooks() {
	webhooks := make(map[string]*dc.Webhook)
	err := unmarshal("webhooks.json", &webhooks)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		panic(err)
	} else if isFileNotExistError {
		oldVerChats := make(map[string]string)
		handlePanic(unmarshal("chats.json", &oldVerChats))

		for jid, channelID := range oldVerChats {
			webhook, err := dcSession.WebhookCreate(channelID, "WA2DC", "")
			handlePanic(err)
			chats[jid] = &DCWebhook{webhook, 0, ""}
		}
	} else {
		oldVerChats := make(map[string]string)
		handlePanic(unmarshal("chats.json", &oldVerChats))

		for jid, channelID := range oldVerChats {
			chats[jid] = &DCWebhook{webhooks[channelID], 0, ""}
		}
	}
	handlePanic(marshal(settings.ChatsFilePath, &chats))
}

func channelMessageSend(channelID string, message string) {
	var _, err = dcSession.ChannelMessageSend(channelID, message)
	if err != nil {
		log.Println(err)
	}
}

func checkVersion() {
	cl := http.Client{
		Timeout: time.Second * 2,
	}

	r, err := cl.Get("https://api.github.com/repos/FKLC/WhatsAppToDiscord/releases/latest")
	if err != nil {
		channelMessageSend(settings.ControlChannelID, "Update check failed. Error: "+err.Error())
		log.Println("Update check failed. Error: " + err.Error())
		return
	}
	defer r.Body.Close()

	var versionInfo githubReleaseResp
	err = json.NewDecoder(r.Body).Decode(&versionInfo)
	if err != nil {
		channelMessageSend(settings.ControlChannelID, "Update check failed. Error: "+err.Error())
		log.Println("Update check failed. Error: " + err.Error())
		return
	}

	if versionInfo.TagName != "v0.4.0" {
		channelMessageSend(settings.ControlChannelID, "New "+versionInfo.TagName+" version is available. Download the latest release from here https://github.com/FKLC/WhatsAppToDiscord/releases/latest/download/WA2DC.exe. \nChangelog: ```"+versionInfo.Body+"```")
	}
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

func handlePanic(err error) {
	if err != nil {
		panic(err)
	}
}

func firstRun() {
	fmt.Println("It seems like this is your first run.")
	settings.Token = input("Please enter your bot token: ")
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
	fmt.Println("You can invite bot from: https://discordapp.com/oauth2/authorize?client_id=" + dcSession.State.User.ID + "&scope=bot&permissions=536879120")
	<-channelsCreated
	settings.SessionFilePath = "session.json"
	settings.ChatsFilePath = "chats.json"
	err = marshal("settings.json", &settings)
	handlePanic(err)
	log.Println("settings.json created")
	fmt.Println("Settings saved.")
}
