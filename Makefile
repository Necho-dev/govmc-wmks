.PHONY: govmc test

# 在本目录运行，这样能找到 web/。
govmc:
	go run ./internal/cmd/govmc

test:
	go test ./...
