---
name: esxi-govc
description: >
  Troubleshooting-only govc cheatsheet for a standalone ESXi host (HostAgent).
  Prefer this repo's REST (/v1) and MCP tools for inventory, QueryPerf, screenshots, console tickets, power, and stepwise directory clone.
  Use govc only to compare SOAP when REST looks wrong. Never vm.clone, linked clone, content library, vCenter tags, or cross-host vMotion on independent ESXi.
  Trigger when the user is on govmc-wmks, mentions govc against ESXi, or wants a CLI cross-check of vim25.
---

# 独立 ESXi：govc 只对照，不当事入口

产品能力面是 **REST + MCP**（`go run ./internal/cmd/govmc`）。本 Skill 只给人 SSH/排障时对照 SOAP。Agent 日常应调 MCP/`/v1`，不要拼 ESXi 密码，不要把 govc 当对外 API。官方 CLI 是 `govc`，本仓库二进制是 `govmc`。

独立 ESXi（`/ha-datacenter`）**没有** `vm.clone`。克隆只能 datastore 拷目录 → 改 `.vmx`（必须新 `vc.uuid`）→ `vm.register` → 开机答「I copied it」。

## 优先顺序

1. `GET /v1/about`、`/v1/vms`、`/v1/vms/{id}`（id = Host Client `/ui/#/host/vms/{id}` 序号、显示名或唯一 uuid）
2. 用量：先 `GET /v1/metrics/counters`，再 `GET /v1/host/metrics` 或 `GET /v1/vms/{id}/metrics`。`GET /v1/host` 是静态清单，不是时序。不要信 QuickStats。
3. 控制台：`POST /v1/vms/{id}/console` → 浏览器打开本机 `/ws/console`（禁止把 ESXi WSS 给浏览器）
4. 克隆：`POST /v1/custom/clone`（默认 dry-run；真跑 `async` + `GET /v1/custom/clone/tasks/{taskId}`）

## 对照命令（排障）

```bash
export GOVC_URL="$ESXI_URL"
export GOVC_USERNAME="$ESXI_USERNAME"
export GOVC_PASSWORD="$ESXI_PASSWORD"
export GOVC_INSECURE=1

govc about
govc find -type m
govc vm.info -json VM_NAME
govc metric.sample -n 180 -t -instance="" VM_NAME cpu.usagemhz.average mem.active.average net.bytesRx.average
govc datastore.ls -ds DATASTORE PATH
```

口径：时间戳 UTC；内存占用 = `mem.active` / `config.memoryMB`；CPU% = `usagemhz / (numCPU × host.cpuMhz)`；网速 Mbps = KBps × 8 / 1000。`Σ vNIC ≠` 主机 vmnic。实时窗约 1 小时 / 20s。

## 禁止

- `govc vm.clone` / 链接克隆 / 内容库
- 无 Tools 时编造 guest 主机名
- 把 QuickStats 当监控
- 一次跑完全程克隆且不确认
