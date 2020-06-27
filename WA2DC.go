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
	SessionFilePath  string
	ChatsFilePath    string
	WebhooksFilePath string
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
	chats        = make(map[string]string)
	webhooks     = make(map[string]*dc.Webhook)
)

func main() {
	err := unmarshal("settings.json", &settings)
	if _, fileNotExist := err.(*os.PathError); fileNotExist {
		firstRun()
	} else if err != nil {
		panic(err)
	}

	// Adds backward compability
	if settings.WebhooksFilePath == "" {
		settings.WebhooksFilePath = "webhooks.json"
		marshal("settings.json", &settings)
	}

	err = unmarshal(settings.ChatsFilePath, &chats)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		panic(err)
	}

	err = unmarshal(settings.WebhooksFilePath, &webhooks)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		panic(err)
	}

	initializeDiscord()
	initializeWhatsApp()
	if err = checkVersion(); err != nil {
		dcSession.ChannelMessageSend(settings.ControlChannelID, "Update check failed. Error: "+err.Error())
	}

	fmt.Println("Bot is now running. Press CTRL-C to exit.")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt, os.Kill)
	<-sc

	marshal(settings.ChatsFilePath, chats)
	marshal(settings.WebhooksFilePath, webhooks)
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
			dcCommandList()
		default:
			dcSession.ChannelMessageSend(settings.ControlChannelID, "Unknown Command: "+parts[0]+commandsHelp)
		}
		return
	}

	// If not a command try to send WhatsApp message
	for key, channelID := range chats {
		if channelID == message.ChannelID {
			waSendMessage(key, message.Content, message.Attachments)
			break
		}
	}
}

func dcCommandStart(parts []string) {
	if isInt(parts[1]) {
		getOrCreateChannel(parts[1] + "@s.whatsapp.net")
	} else {
		name := strings.Join(parts[1:], " ")
		for jid, chat := range waConnection.Store.Chats {
			if chat.Name == name {
				getOrCreateChannel(jid)
			}
		}
	}
}

func dcCommandList() {
	list := ""
	for _, chat := range waConnection.Store.Chats {
		list += chat.Name + "\n"
	}
	dcSession.ChannelMessageSend(settings.ControlChannelID, list)
}

func dcOnChannelDelete(_ *dc.Session, deletedChannel *dc.ChannelDelete) {
	for key, channelID := range chats {
		if channelID == deletedChannel.ID {
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
			dcSession.ChannelMessageSend(settings.ControlChannelID, "Session couldn't restored. "+err.Error()+". Going to create new session!")
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

func waSendMessage(jid string, content string, attachments []*dc.MessageAttachment) {
	for _, attachment := range attachments {
		content += attachment.URL + "\n"
	}
	waConnection.Send(wa.TextMessage{
		Info: wa.MessageInfo{
			RemoteJid: jid,
		},
		Text: content,
	})
}

type waHandler struct{}

func (waHandler) HandleError(err error) {
	if settings.SendErrors {
		dcSession.ChannelMessageSend(settings.ControlChannelID, err.Error())
	}
	fmt.Fprintf(os.Stderr, "%v", err)
}

func (waHandler) HandleTextMessage(message wa.TextMessage) {
	if !message.Info.FromMe && startTime.Before(time.Unix(int64(message.Info.Timestamp), 0)) {
		channelID := getOrCreateChannel(message.Info.RemoteJid)
		if strings.HasSuffix(message.Info.RemoteJid, "@g.us") {
			webhook := getOrCreateWebhook(channelID)
			_, err := dcSession.WebhookExecute(webhook.ID, webhook.Token, true, &dc.WebhookParams{
				Content:  message.Text,
				Username: jidToName(*message.Info.Source.Participant),
			})
			if err != nil {
				panic(err)
			}
		} else {
			dcSession.ChannelMessageSend(channelID, message.Text)
		}
	}
}

func handleMediaMessage(info wa.MessageInfo, content string, data []byte, fileName string) {
	if !info.FromMe && startTime.Before(time.Unix(int64(info.Timestamp), 0)) {
		channelID := getOrCreateChannel(info.RemoteJid)
		if strings.HasSuffix(*info.Source.Participant, "@g.us") {
			webhook := getOrCreateWebhook(channelID)
			_, err := dcSession.WebhookExecute(webhook.ID, webhook.Token, true, &dc.WebhookParams{
				Content:  content,
				Username: jidToName(*info.Source.Participant),
				File:     string(data),
			})
			if err != nil {
				panic(err)
			}
		} else {
			f := bytes.NewReader(data)

			dcSession.ChannelMessageSendComplex(channelID, &dc.MessageSend{
				Content: content,
				Files: []*dc.File{
					{
						Name:   fileName,
						Reader: f,
					},
				},
			})
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

func getOrCreateChannel(jid string) string {
	channelID, ok := chats[jid]
	if !ok {
		name := jidToName(jid)
		channel, err := dcSession.GuildChannelCreateComplex(guild.ID, dc.GuildChannelCreateData{
			Name:     name,
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID})
		if err != nil {
			panic(err)
		}
		chats[jid] = channel.ID
		channelID = chats[jid]
	}
	return channelID
}

func getOrCreateWebhook(channelID string) *dc.Webhook {
	webhook, ok := webhooks[channelID]
	if !ok {
		webhook, err := dcSession.WebhookCreate(channelID, "WA2DC", "")
		if err != nil {
			panic(err)
		}
		webhooks[channelID] = webhook
		return webhook
	}
	return webhook
}

// Other stuff
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

	if versionInfo.TagName != "v0.2.2-alpha" {
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
	<-channelsCreated
	settings.SessionFilePath = "session.json"
	settings.ChatsFilePath = "chats.json"
	settings.WebhooksFilePath = "webhooks.json"
	settings.SendErrors = false
	marshal("settings.json", &settings)
	fmt.Println("Settings saved.")
}
