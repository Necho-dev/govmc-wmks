# govmc-wmks

基于 govmomi 的 VMware 控制集成，含 WebMKS。二进制是 `govmc`。官方 CLI 是 `govc`，不要和 `govmc` 混用。

REST、MCP 和 WebMKS 控制台。不内嵌探针。

```bash
cp .env.example .env
# ESXI_URL / ESXI_USERNAME / ESXI_PASSWORD
make govmc
```

在本目录运行，这样能找到 `web/`。默认 `0.0.0.0:8765`。

- 看板：<http://127.0.0.1:8765>
- OpenAPI：`GET /v1/openapi.yaml`
- MCP：`POST /mcp`，或 `go run ./internal/cmd/govmc -mcp-stdio`
- 说明：[supplemental/guides/rest-api.md](supplemental/guides/rest-api.md)、[supplemental/guides/mcp.md](supplemental/guides/mcp.md)

浏览器用官方 HTML Console SDK 画 WebMKS。到 ESXi 的 WSS 由本服务反代，不要把 ESXi WSS 交给浏览器。`web/wmks/` 来自 Broadcom VMware HTML Console SDK 2.2.1。

电源、克隆、数据存储要 `confirm: true`。独立 ESXi 没有 `vm.clone`。
