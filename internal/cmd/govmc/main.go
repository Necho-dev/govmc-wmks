package main

import (
	"context"
	"flag"
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"

	"govmc-wmks/internal/esxi"
	"govmc-wmks/internal/httpserver"
	"govmc-wmks/internal/mcp"
)

func main() {
	stdio := flag.Bool("mcp-stdio", false, "serve MCP JSON-RPC on stdin/stdout instead of HTTP")
	flag.Parse()
	_ = godotenv.Load()

	esxiURL := mustEnv("ESXI_URL")
	user := mustEnv("ESXI_USERNAME")
	pass := os.Getenv("ESXI_PASSWORD")
	insecure := envBool("ESXI_INSECURE", true)
	listen := envOr("LISTEN", "0.0.0.0:8765")
	token := os.Getenv("API_TOKEN")

	ctx := context.Background()
	client, err := esxi.Dial(ctx, esxiURL, user, pass, insecure)
	if err != nil {
		log.Fatalf("login %s: %v", esxiURL, err)
	}
	log.Printf("logged in %s (api %s)", esxiURL, client.Gov.ServiceContent.About.ApiVersion)

	srv := &httpserver.Server{
		ESXi:   client,
		Token:  token,
		Listen: listen,
		WebDir: httpserver.FindWeb(),
	}
	if *stdio {
		if err := mcp.ServeStdio(ctx, client, srv); err != nil {
			log.Fatal(err)
		}
		return
	}
	log.Fatal(srv.ListenAndServe())
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("missing %s", k)
	}
	return v
}

func envOr(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func envBool(k string, def bool) bool {
	v := os.Getenv(k)
	if v == "" {
		return def
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return def
	}
	return b
}
