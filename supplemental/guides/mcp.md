# MCP

与 REST **同一套 handler**。Cursor 走 HTTP Streamable：`http://127.0.0.1:8765/mcp`。也可用 stdio：`go run ./internal/cmd/govmc -mcp-stdio`。

REST 见 [rest-api.md](./rest-api.md)。

## 接入

先起服务（持有 ESXi 账密；MCP 不把密码交给模型）：

```bash
cd /path/to/govmc-wmks
go run ./internal/cmd/govmc
```

Cursor `~/.cursor/mcp.json`：

```json
{
  "mcpServers": {
    "esxi-govmomi": {
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

设了 `API_TOKEN` 时加 `"headers": { "Authorization": "Bearer <token>" }`。

对话里的命名空间一般是 **`user-esxi-govmomi`**。Settings → MCP 刷新，服务要保持监听 `:8765`。

协议：JSON-RPC 2.0。`POST /mcp`，`Accept: application/json, text/event-stream`。`initialize` 会回 `Mcp-Session-Id`。通知无 body 时 **202**。

---

## 握手（cURL）

```bash
export BASE=http://127.0.0.1:8765

curl -sS -D - -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -X POST "$BASE/mcp" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

```
HTTP/1.1 200 OK
Content-Type: application/json
Mcp-Session-Id: f91e436ca88723fca78b8fec65e0f098
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": { "listChanged": false } },
    "serverInfo": { "name": "esxi-govmomi", "version": "1.0.0" }
  }
}
```

```bash
curl -sS -X POST "$BASE/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      { "name": "esxi_vm_list", "description": "List VMs …", "inputSchema": { "type": "object" } }
    ]
  }
}
```

调工具：

```bash
curl -sS -X POST "$BASE/mcp" \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"esxi_vm_get","arguments":{"id":"2"}}}'
```

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "isError": false,
    "content": [
      { "type": "text", "text": "{ \"id\": \"2\", \"name\": \"R0002\", … }" }
    ]
  }
}
```

失败时 `isError: true`，`content[0].text` 为错误字符串。

---

## 工具一览

口径与 REST 相同：`id` 是 Host Client 序号；`uuid` 可能撞车；指标 QueryPerf；禁 `vm.clone`；无 Tools 则 guest 主机名为空；`Σ vNIC ≠` 主机网卡。

### 只读（默认可给 Agent）

| Tool | 对应 REST | 参数 |
|------|-----------|------|
| `esxi_vm_list` | `GET /v1/vms?view=full` | 无（MCP 返回完整 vmInfo，比 REST 默认列表胖） |
| `esxi_vm_get` | `GET /v1/vms/{id}` | `id`（序号 / 显示名 / 唯一 uuid） |
| `esxi_metrics_query` | `GET /v1/vms/{id}/metrics` 或 `GET /v1/host/metrics` | `id` 或 `host=true`；`names`、`instance`、`maxSample`、`start`、`end`。目录是 REST `GET /v1/metrics/counters` |
| `esxi_vm_screenshot` | `GET …/screenshot` | `id`；关机失败 |
| `esxi_host_get` | `GET /v1/host` | 主机静态清单，不是时序 |
| `esxi_ds_ls` | `GET /v1/datastores/folder` 或 `/file` | `datastore`、`path`、`kind=folder\|file\|all` |
| `esxi_ds_copy` / `esxi_ds_move` | folder/file copy/move | 默认 dry-run |
| `esxi_clone` | `POST /v1/custom/clone` | 默认 dry-run；真跑异步返回 `taskId` |
| `esxi_clone_task` | `GET /v1/custom/clone/tasks/{id}` | 查进度 |

### 控制台

`esxi_vm_console_ticket`：只出本服务 `{ws, note}`，用浏览器打开。不要让 Agent 啃 ESXi WSS。

### 写（必须 `confirm: true`）

| Tool | 说明 |
|------|------|
| `esxi_vm_power` | `id`、`action`=`on\|off\|reset\|suspend`、`confirm` |
| `esxi_vm_answer_question` | `id`、`choice`、`confirm`；可选 `qid` |
| `esxi_clone` | `POST /v1/custom/clone`，默认 dry-run；真跑异步 |

禁止单 tool 静默跑完全程克隆。

---

## 只读样例

### `esxi_vm_list`

```bash
curl -sS -X POST "$BASE/mcp" -d '{"jsonrpc":"2.0","id":10,"method":"tools/call","params":{"name":"esxi_vm_list","arguments":{}}}'
```

`content[0].text` 解析后（节选）：

```json
{
  "id": "2",
  "uuid": "503f4dc6-dce4-4c69-2ef6-3292e3b05287",
  "moref": "VirtualMachine-2",
  "name": "R0002",
  "powerState": "poweredOn",
  "numCPU": 16,
  "memoryMB": 65536,
  "cpuPct": 1.54,
  "netRxMbps": 0.024
}
```

### `esxi_vm_get`

```json
{"jsonrpc":"2.0","id":11,"method":"tools/call","params":{"name":"esxi_vm_get","arguments":{"id":"2"}}}
```

响应正文与 `GET /v1/vms/2` 相同（含 networks/disks/guest）。

### `esxi_metrics_query`

虚机：

```json
{"name":"esxi_metrics_query","arguments":{"id":"2","maxSample":2}}
```

主机：

```json
{"name":"esxi_metrics_query","arguments":{"host":true,"maxSample":2}}
```

```json
{
  "entity": "vm:2",
  "windowNote": "standalone ESXi historicalInterval=0; realtime window ~1 hour at 20s",
  "series": [
    {
      "name": "net.bytesRx.average",
      "unit": "Mbps",
      "points": [{ "timeUtc": "2026-09-09T11:08:20Z", "value": 0.024 }]
    }
  ]
}
```

### `esxi_host_get`

```json
{ "name": "localhost.localdomain", "cpuMhz": 2595, "numCpu": 96, "memoryMB": 1048436 }
```

### `esxi_ds_ls`

```json
{"name":"esxi_ds_ls","arguments":{"datastore":"datastore1 (1)","path":""}}
```

```json
[{ "path": "RV0011", "folder": true, "size": 73728, "modified": "2026-09-09T10:03:15Z" }]
```

### `esxi_vm_screenshot`

`content` 为 MCP 图片，不是 JSON：

```json
{
  "isError": false,
  "content": [
    { "type": "image", "mimeType": "image/png", "data": "<base64>" }
  ]
}
```

关机：`isError=true`，文案含 powered off。

### `esxi_clone`（默认 dry-run）

```json
{"name":"esxi_clone","arguments":{"src":"RV0000_BASE","dst":"RV0099","datastore":"datastore1 (1)","portgroup":"PG-IKUAI-LAN"}}
```

```json
{
  "dryRun": true,
  "note": "standalone ESXi has no vm.clone; …",
  "steps": [
    { "op": "copy", "src": "RV0000_BASE", "dst": "RV0099" },
    { "op": "patch-vmx" },
    { "op": "register" },
    { "op": "change" },
    { "op": "networks" },
    { "op": "power" },
    { "op": "question", "choice": "1" }
  ]
}
```

---

## 写操作样例（先停一次）

无 `confirm`：

```json
{"name":"esxi_vm_power","arguments":{"id":"2","action":"off"}}
```

`isError=true`：`destructive action requires confirm=true …`

真要执行：

```json
{"name":"esxi_vm_power","arguments":{"id":"2","action":"on","confirm":true}}
```

克隆一步（仍默认 dry-run）：

```json
{"name":"esxi_clone","arguments":{"src":"RV0000_BASE","dst":"RV0099","datastore":"datastore1 (1)","dryRun":false,"confirm":true}}
```

返回 `taskId` 后用 `esxi_clone_task` 轮询。

---

## 明确不做

`vm.clone` / 链接克隆 / 内容库 / 用 QuickStats 当监控 / 无 Tools 填 guest 主机名 / 把 govc 或 ESXi 密码交给模型 / 无限 `object.collect`。
