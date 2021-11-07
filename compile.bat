:: UPX is for compressing the binary. Original binary is around 10MiB.

SET GOARCH=amd64

SET GOOS=windows
go build -ldflags="-s -w" -trimpath -o bin\WA2DC-x64-win.exe WA2DC.go
upx -9 bin\WA2DC-x64-win.exe

SET GOOS=darwin
go build -ldflags="-s -w" -trimpath -o bin\WA2DC-x64-darwin WA2DC.go
upx -9 bin\WA2DC-x64-darwin

SET GOOS=linux
go build -ldflags="-s -w" -trimpath -o bin\WA2DC-x64-linux WA2DC.go
upx -9 bin\WA2DC-x64-linux

SET GOARCH=386

SET GOOS=windows
go build -ldflags="-s -w" -trimpath -o bin\WA2DC-x86-win.exe WA2DC.go
upx -9 bin\WA2DC-x86-win.exe

::SET GOOS=darwin
::go build -ldflags="-s -w" -trimpath -o bin\WA2DC-x86-darwin WA2DC.go
:: not supported

SET GOOS=linux
go build -ldflags="-s -w" -trimpath -o bin\WA2DC-x86-linux WA2DC.go
upx -9 bin\WA2DC-x86-linux