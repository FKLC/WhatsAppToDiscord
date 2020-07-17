:: UPX is for compressing the binary. Original binary is around 10MiB.
go build -ldflags="-s -w" -trimpath -o WA2DC.exe WA2DC.go
upx -9 WA2DC.exe