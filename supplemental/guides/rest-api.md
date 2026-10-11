# REST API

独立 ESXi 运维接口。默认基址 `http://127.0.0.1:8765`。机器可读规范：`GET /v1/openapi.yaml`。

MCP 见 [mcp.md](./mcp.md)。govc 只对照 SOAP，不是本 API。

## 约定

- JSON；错误 `{ "code", "message", "vimFault" }`
- VM **`id`** = Host Client `/ui/#/host/vms/{id}` 的序号（如 `2`）
- **`uuid`** = `vc.uuid` / `instanceUuid`（目录克隆可能撞车）
- **`moref`** = `VirtualMachine-2`
- 查找：`id`、显示名、`VirtualMachine-2`、唯一 uuid；撞 uuid 返回 **409**
- 破坏性：`{"confirm":true}` 或头 `X-Confirm: true`
- 克隆默认 **`dryRun: true`**，无 `vm.clone`
- 设了 `API_TOKEN` 时：`Authorization: Bearer <token>` 或 `X-API-Token`
- 指标 UTC；网速 Mbps = KBps×8/1000；内存占用 = `mem.active` / 配置内存；CPU% = `usagemhz / (numCPU × host.cpuMhz)`
- 独立 ESXi 实时窗约 **1 小时 / 20s**。不要把 QuickStats 当监控。`Σ vNIC ≠` 主机 vmnic

```bash
export BASE=http://127.0.0.1:8765
# export TOKEN=... ; HDR=(-H "Authorization: Bearer $TOKEN")
```

---

## 只读

### `GET /v1/about`

```bash
curl -sS "$BASE/v1/about"
```

```json
{
  "product": "VMware ESXi 8.0.3 build-24859861",
  "apiVersion": "8.0.3.0",
  "build": "24859861",
  "osType": "vmnix-x86",
  "name": "VMware ESXi",
  "standaloneEsxi": true,
  "note": "no vm.clone on standalone ESXi; id is Host Client moref (/ui/#/host/vms/{id}); metrics via QueryPerf not QuickStats"
}
```

### `GET /v1/vms`

默认运维投影。`?view=full` 为完整 vmInfo（含 networks/disks/quickStats）。

```bash
curl -sS "$BASE/v1/vms"
```

```json
{
  "id": "2",
  "uuid": "503f4dc6-dce4-4c69-2ef6-3292e3b05287",
  "moref": "VirtualMachine-2",
  "name": "R0002",
  "biosUuid": "423f7dc8-3c05-52b5-0d03-68322d5729ac",
  "guestId": "windows11_64Guest",
  "powerState": "poweredOn",
  "connectionState": "connected",
  "numCPU": 16,
  "memoryMB": 65536,
  "toolsStatus": "toolsNotInstalled",
  "guestUnavailable": true,
  "cpuPct": 1.62,
  "memActivePct": 1.0,
  "netRxMbps": 0.024,
  "netTxMbps": 0,
  "quickStatsReliable": false
}
```

### `GET /v1/vms/{id}`

```bash
curl -sS "$BASE/v1/vms/2"
curl -sS "$BASE/v1/vms/R0002"
curl -sS "$BASE/v1/vms/VirtualMachine-2"
```

```json
{
  "id": "2",
  "uuid": "503f4dc6-dce4-4c69-2ef6-3292e3b05287",
  "moref": "VirtualMachine-2",
  "name": "R0002",
  "instanceUuid": "503f4dc6-dce4-4c69-2ef6-3292e3b05287",
  "biosUuid": "423f7dc8-3c05-52b5-0d03-68322d5729ac",
  "guestId": "windows11_64Guest",
  "powerState": "poweredOn",
  "connectionState": "connected",
  "numCPU": 16,
  "memoryMB": 65536,
  "networks": [
    {
      "label": "Network adapter 1",
      "key": 4000,
      "mac": "00:50:56:bf:6a:7c",
      "portgroup": "PG-IKUAI-LAN",
      "adapter": "VirtualE1000e"
    }
  ],
  "disks": [
    {
      "label": "Hard disk 1",
      "key": 2000,
      "fileName": "[datastore1 (1)] R0002/R0002_2.vmdk",
      "capacityKB": 83886080
    }
  ],
  "quickStats": {
    "overallCpuUsage": 0,
    "guestMemoryUsage": 0,
    "hostMemoryUsage": -1,
    "uptimeSeconds": 0
  },
  "quickStatsReliable": false,
  "guest": {
    "toolsStatus": "toolsNotInstalled",
    "guestUnavailable": true
  }
}
```

撞车 uuid：

```bash
curl -sS "$BASE/v1/vms/503f4139-a765-460d-4488-5b3f4fc66769"
```

```json
{
  "code": "ambiguous",
  "message": "ambiguous vm \"503f4139-…\" (shared instanceUuid from directory clone). Use display name or moref, e.g. GET /v1/vms/10. matches: RV0004/10, …",
  "vimFault": null
}
```

### `GET /v1/vms/{id}/devices`

```bash
curl -sS "$BASE/v1/vms/2/devices"
```

```json
{
  "networks": [{ "label": "Network adapter 1", "mac": "00:50:56:bf:6a:7c", "portgroup": "PG-IKUAI-LAN" }],
  "disks": [{ "label": "Hard disk 1", "fileName": "[datastore1 (1)] R0002/R0002_2.vmdk", "capacityKB": 83886080 }],
  "vgpu": []
}
```

### `GET /v1/vms/{id}/screenshot`

关机 **409**。成功为 `image/png`。

```bash
curl -sS -o r0002.png -D - "$BASE/v1/vms/2/screenshot" | head
```

```
HTTP/1.1 200 OK
Content-Type: image/png
```

### `GET /v1/vms/{id}/metrics`

查询：`names`（逗号）、`instance`（默认聚合 `""`）、`start`/`end`（RFC3339 UTC）、`maxSample`（默认 180）。

```bash
curl -sS "$BASE/v1/vms/2/metrics?maxSample=2"
```

```json
{
  "entity": "vm:2",
  "windowNote": "standalone ESXi historicalInterval=0; realtime window ~1 hour at 20s",
  "units": {
    "cpuPct": "percent = usagemhz / (numCPU * host.cpuMhz) * 100",
    "memActivePct": "percent = mem.active(KB) / (memoryMB * 1024) * 100",
    "netMbps": "Mbps = KBps * 8 / 1000 (Host Client)",
    "time": "UTC"
  },
  "series": [
    {
      "name": "cpu.usagemhz.average",
      "instance": "",
      "unit": "MHz",
      "points": [
        { "timeUtc": "2026-09-09T11:08:00Z", "value": 687 },
        { "timeUtc": "2026-09-09T11:08:20Z", "value": 638 }
      ],
      "derived": { "cpuPct": 1.54 }
    },
    {
      "name": "net.bytesRx.average",
      "unit": "Mbps",
      "points": [{ "timeUtc": "2026-09-09T11:08:20Z", "value": 0.024 }],
      "derived": { "rawKBps": 3 }
    }
  ]
}
```

主机时序：`GET /v1/host/metrics`（同一套查询参数）。计数器目录见下方指标层级。

### 指标层级

四个相近接口职责分开，不要混用：

| 层级 | 路径 | 是什么 | 不是什么 |
|------|------|--------|----------|
| 主机清单 | `GET /v1/host` | 静态：cpuMhz、内存、portgroups **摘要** | 不是时序。不要当监控 |
| 主机时序 | `GET /v1/host/metrics` | 该主机的 QueryPerf 点列 | 不含计数器目录 |
| 虚机时序 | `GET /v1/vms/{id}/metrics` | 该虚机的 QueryPerf 点列 | 不含计数器目录 |
| 计数器目录 | `GET /v1/metrics/counters` | 可查的全名（`cpu.usagemhz.average`） | 不含任何样本点 |
| 目录入口 | `GET /v1/metrics` | 上述路径说明 | 不含数据 |

推荐顺序：`GET /v1/metrics` → `GET /v1/metrics/counters?entity=vm\|host` → 把 `names=` 填进 `/v1/host/metrics` 或 `/v1/vms/{id}/metrics`。

网络资源同样分层：`GET /v1/networks` 是**主机端口组**；虚机 vNIC 是 `GET\|POST /v1/vms/{id}/networks`。`GET /v1/host` 里的 `portgroups` 只是摘要。

### `GET /v1/host` / `GET /v1/networks` / `GET /v1/datastores`

```bash
curl -sS "$BASE/v1/host"
curl -sS "$BASE/v1/networks"
curl -sS "$BASE/v1/datastores"
```

```json
{
  "name": "localhost.localdomain",
  "moref": "ha-host",
  "cpuMhz": 2595,
  "numCpu": 192,
  "numCpuCores": 96,
  "numCpuThreads": 192,
  "numCpuPkgs": 2,
  "memoryMB": 1048436,
  "portgroups": [
    { "name": "PG-IKUAI-LAN", "vswitch": "vSwitch-IKUAI-LAN" }
  ]
}
```

数据存储名走 query/body 的 `ds`，不要放进 URL path：

```bash
curl -sS "$BASE/v1/datastores"
curl -sS "$BASE/v1/datastores/folder?ds=datastore1%20(1)&path="
curl -sS "$BASE/v1/datastores/file?ds=datastore1%20(1)&path=RV1002"
```

```json
[
  { "path": "RV0011", "folder": true, "size": 73728, "modified": "2026-09-09T10:03:15Z" },
  { "path": "iKuai8_x64_3.7.23_Build202606021826.iso", "folder": false, "size": 55027712 }
]
```

### `GET /v1/metrics` / `GET /v1/metrics/counters?entity=vm|host`

`/v1/metrics` 只说明层级。`/v1/metrics/counters` 是计数器全名目录（`cpu.usagemhz.average`），不含样本。

---

## 控制台

### `POST /v1/vms/{id}/console`

一次性、2 分钟，只返回本机 `/ws/console`，**不暴露 ESXi WSS**。无 USB Tablet / Tools 时鼠标可能不可用，不是出票失败。

```bash
curl -sS -X POST "$BASE/v1/vms/2/console"
```

```json
{
  "ws": "/ws/console?id=78b7832a96ab368d70ee0c6dee03c767",
  "note": "open in a browser; this URL is one-shot and expires in 2 minutes. ESXi WSS is never exposed. …"
}
```

浏览器打开 `http://127.0.0.1:8765/ws/console?id=…`。看板页走同一套：`GET /v1/vms` + `POST /v1/vms/{id}/console`。

---

## 写操作（要 confirm）

未确认：

```bash
curl -sS -X POST "$BASE/v1/vms/2/power" -d '{"action":"off"}'
```

```json
{
  "code": "confirm_required",
  "message": "destructive action requires confirm=true or header X-Confirm: true",
  "vimFault": null
}
```

### 电源 `POST /v1/vms/{id}/power`

`action`：`on` | `off` | `reset` | `suspend`。无 Tools 的关是硬关。

```bash
curl -sS -X POST "$BASE/v1/vms/2/power" \
  -H 'Content-Type: application/json' \
  -d '{"action":"on","confirm":true}'
```

```json
{ "status": "ok", "action": "on" }
```

### 问答 `GET|POST /v1/vms/{id}/question`

首次开机「我已复制」用 `choice`（常见 `"1"`）。

```bash
curl -sS "$BASE/v1/vms/2/question"
curl -sS -X POST "$BASE/v1/vms/2/question" \
  -d '{"choice":"1","confirm":true}'
```

### 改配 `PATCH /v1/vms/{id}` / 虚机网卡 `GET|POST /v1/vms/{id}/networks`

```bash
curl -sS -X PATCH "$BASE/v1/vms/99" \
  -d '{"numCPU":8,"memoryMB":24576,"nestedHV":true,"iommu":true,"confirm":true}'

curl -sS "$BASE/v1/vms/99/networks"
curl -sS -X POST "$BASE/v1/vms/99/networks" \
  -d '{"portgroup":"PG-IKUAI-LAN","adapter":"e1000e","replace":true,"confirm":true}'
```

### 注册 / 取消注册

取消注册**不删盘**，`id`/`moref` 会变。

```bash
curl -sS -X POST "$BASE/v1/vms/register" \
  -d '{"datastore":"datastore1 (1)","path":"RV0099/RV0099.vmx","name":"RV0099","confirm":true}'

curl -sS -X POST "$BASE/v1/vms/48/unregister" -d '{"confirm":true}'
```

---

## 数据存储 FS

`GET /v1/datastores` 只列库（`summary` 可能滞后）。强制刷新：

```bash
curl -sS -X POST "$BASE/v1/datastores/refresh"
```

文件/目录：

```bash
# 列举
curl -sS "$BASE/v1/datastores/folder?ds=datastore1%20(1)&path="
curl -sS "$BASE/v1/datastores/file?ds=datastore1%20(1)&path=RV1002"

# 新建 / 删除目录
curl -sS -X POST "$BASE/v1/datastores/folder" -d '{"ds":"datastore1 (1)","path":"tmp-a","confirm":true}'
curl -sS -X DELETE "$BASE/v1/datastores/folder?ds=datastore1%20(1)&path=tmp-a&confirm=true"

# 拷 / 移 / 改名（默认 dryRun=true）
curl -sS -X POST "$BASE/v1/datastores/folder/copy" \
  -d '{"ds":"datastore1 (1)","src":"RV0001_BASE","dst":"RV1002","dryRun":false,"confirm":true}'
curl -sS -X POST "$BASE/v1/datastores/file/rename" \
  -d '{"ds":"datastore1 (1)","path":"RV1002/old.vmx","name":"RV1002.vmx","dryRun":false,"confirm":true}'

# 下载 / 上传
curl -sS -o RV1002.vmx "$BASE/v1/datastores/file/content?ds=datastore1%20(1)&path=RV1002/RV1002.vmx"
curl -sS -X PUT "$BASE/v1/datastores/file?ds=datastore1%20(1)&path=RV1002/note.txt" \
  -H 'X-Confirm: true' --data-binary @note.txt
```

## 自定义克隆 `/v1/custom/clone`

内部顺序：copy → patch-vmdk → patch-vmx → register → change → networks → power → question。无 `vm.clone`。

```bash
# 只看计划（默认 dryRun=true，同步）
curl -sS -X POST "$BASE/v1/custom/clone" \
  -d '{"src":"RV0000_BASE","dst":"RV1002","datastore":"datastore1 (1)","portgroup":"PG-IKUAI-LAN"}'

# 真跑异步
curl -sS -X POST "$BASE/v1/custom/clone" \
  -d '{"src":"RV0000_BASE","dst":"RV1003","datastore":"datastore1 (1)","portgroup":"PG-IKUAI-LAN","dryRun":false,"confirm":true,"async":true}'
# 202 {"taskId":"cln_…","poll":"/v1/custom/clone/tasks/cln_…"}

curl -sS "$BASE/v1/custom/clone/tasks/cln_…"
curl -sS -X POST "$BASE/v1/custom/clone/tasks/cln_…/cancel" -d '{"confirm":true}'
```

---
