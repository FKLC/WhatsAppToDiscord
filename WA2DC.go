package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
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
	SendErrors       bool
}

type MessageChannelType int

const (
	private MessageChannelType = iota
	group
	broadcast
)

type Message struct {
	channelID string
	content   string
}

var (
	startTime = time.Now()
	settings  Settings
)

var (
	dcSession        *dc.Session
	guild            *dc.Guild
	waConnection     *wa.Conn
	receivingChannel = make(chan *Message)
	chats            = make(map[string]string)
	groupNames       = make(map[string]string)
)

func main() {
	err := unmarshal("settings.json", &settings)
	if _, fileNotExist := err.(*os.PathError); fileNotExist {
		fmt.Println("It seems like it is your first run.")
		settings.Token = input("Please enter your bot token: ")
		settings.GuildID = input("Please enter your guild ID: ")
		settings.CategoryID = input("Please enter category ID: ")
		settings.ControlChannelID = input("Please enter control channel ID: ")
		settings.SessionFilePath = "session.json"
		settings.ChatsFilePath = "chats.json"
		settings.SendErrors = false
		marshal("settings.json", &settings)
		fmt.Println("Settings saved.")
	} else if err != nil {
		panic(err)
	}

	err = unmarshal(settings.ChatsFilePath, &chats)
	if _, isFileNotExistError := err.(*os.PathError); !isFileNotExistError && err != nil {
		panic(err)
	}

	dcSession = connectToDiscord(settings.Token)
	guild, err = dcSession.Guild(settings.GuildID)
	if err != nil {
		panic(err)
	}

	fmt.Println("Bot is now running. Press CTRL-C to exit.")
	sc := make(chan os.Signal, 1)
	signal.Notify(sc, syscall.SIGINT, syscall.SIGTERM, os.Interrupt, os.Kill)
	<-sc

	marshal(settings.ChatsFilePath, chats)
	dcSession.Close()
}

// Discord
func connectToDiscord(token string) *dc.Session {
	dcSession, err := dc.New("Bot " + token)
	if err != nil {
		panic(err)
	}

	dcSession.AddHandler(dcOnReady)
	dcSession.AddHandler(dcOnMessageCreate)
	dcSession.AddHandler(dcOnChannelDelete)

	err = dcSession.Open()
	if err != nil {
		panic(err)
	}
	return dcSession
}

func dcOnReady(_ *dc.Session, _ *dc.Ready) {
	go initializeWhatsApp()
	for {
		message := <-receivingChannel
		_, err := dcSession.ChannelMessageSend(message.channelID, message.content)
		if err != nil {
			panic(nil)
		}
	}
}

func dcOnMessageCreate(_ *dc.Session, message *dc.MessageCreate) {
	if message.Author.ID == dcSession.State.User.ID {
		return
	}

	if message.ChannelID == settings.ControlChannelID {
		parts := strings.Split(message.Content, " ")
		if parts[0] == "start" {
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
	}

	for key, channelID := range chats {
		if channelID == message.ChannelID {
			waConnection.Send(wa.TextMessage{
				Info: wa.MessageInfo{
					RemoteJid: key,
				},
				Text: message.Content,
			})
			break
		}
	}
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

			ms := &dc.MessageSend{
				Files: []*dc.File{
					&dc.File{
						Name:   "qrcode.png",
						Reader: f,
					},
				},
			}

			dcSession.ChannelMessageSendComplex(settings.ControlChannelID, ms)
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

type waHandler struct{}

func (waHandler) HandleError(err error) {
	if settings.SendErrors {
		dcSession.ChannelMessageSend(settings.ControlChannelID, err.Error())
	}
	fmt.Fprintf(os.Stderr, "%v", err)
}

func (waHandler) HandleTextMessage(message wa.TextMessage) {
	if !message.Info.FromMe && startTime.Before(time.Unix(int64(message.Info.Timestamp), 0)) {
		chat, messageChannelType, parts := getOrCreateChannel(message.Info.RemoteJid)

		content := message.Text
		if messageChannelType != private {
			name := waConnection.Store.Chats[*message.Info.Source.Participant].Name
			if name == "" {
				name = strings.Split(parts[0], "-")[0]
			}
			content = "**" + name + ":** " + content
		}
		receivingChannel <- &Message{chat, content}
	}
}

func getOrCreateChannel(jid string) (string, MessageChannelType, []string) {
	messageChannelType, parts := parseJid(jid)
	name := waConnection.Store.Chats[jid].Name
	if name == "" {
		name = parts[0]
	}
	chat, ok := chats[jid]
	if !ok {
		channel, err := dcSession.GuildChannelCreateComplex(guild.ID, dc.GuildChannelCreateData{
			Name:     name,
			Type:     dc.ChannelTypeGuildText,
			ParentID: settings.CategoryID})
		if err != nil {
			panic(nil)
		}
		chats[jid] = channel.ID
		chat = chats[jid]
	}
	return chat, messageChannelType, parts
}

// Other stuff
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

func parseJid(Jid string) (MessageChannelType, []string) {
	parts := strings.Split(Jid, "@")
	if parts[1] == "s.whatsapp.net" {
		return private, parts
	} else if parts[1] == "g.us" {
		return group, parts
	} else if parts[1] == "broadcast" {
		return broadcast, parts
	}
	panic("Invalid Jid")
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
