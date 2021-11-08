:: UPX is for compressing the binary.

xgo -out "bin/WA2DC" --targets=*/amd64,*/386,*/arm64 -ldflags="-s -w" .
copy bin\* bin\uncompressed\*
upx -9 bin\*