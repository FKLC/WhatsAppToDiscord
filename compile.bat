:: UPX is for compressing the binary.

xgo -out "bin/WA2DC" --targets=*/amd64,*/386 -ldflags="-s -w" .
upx -9 bin\*