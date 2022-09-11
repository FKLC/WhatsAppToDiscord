module WhatsAppToDiscord

// +heroku goVersion go1.17
go 1.17

require (
	github.com/bwmarrin/discordgo v0.25.0 // direct
	github.com/lib/pq v1.10.5 // direct
	github.com/mattn/go-sqlite3 v1.14.12 // direct
	github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e // direct
	go.mau.fi/whatsmeow v0.0.0-20220427133828-d1efb884b304 // direct
)

require (
	filippo.io/edwards25519 v1.0.0-rc.1 // indirect
	github.com/gorilla/websocket v1.5.0 // indirect
	go.mau.fi/libsignal v0.0.0-20220425070825-c40c839ee6a0 // indirect
	golang.org/x/crypto v0.0.0-20220411220226-7b82a4e95df4 // indirect
	golang.org/x/sys v0.0.0-20220422013727-9388b58f7150 // indirect
	golang.org/x/xerrors v0.0.0-20200804184101-5ec99f83aff1 // indirect
	google.golang.org/protobuf v1.28.0 // indirect
)

retract [v0.1.1-alpha, v0.4.1]