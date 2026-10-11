# 独立 ESXi 目录克隆：存量评估与正确流程

盘点时间：2026-09-09 01:50（UTC+8）  
宿主机：`https://183.134.100.231:8443`（ESXi 8.0.3）  
对照现行操作：[SOP1: 克隆虚拟机](https://alidocs.dingtalk.com/i/nodes/Gl6Pm2Db8D3NvENZC9yMpO6KJxLq0Ee4)（本文不改钉钉文档，只补本地说明）

结论先说：

- Host Client「CPU / 内存用量」走 `summary.quickStats`。为空不等于虚机没跑，`QueryPerf` 往往仍有数。
- **只重启不能恢复摘要。** 关机改 `vc.uuid` 再开机也不够（RV1001 已试）。
- **可以恢复：** 关机 → 取消注册 → 按原 `.vmx` 再注册 → 开机（换 MoRef）。RV1001：`13` → `48`，约 20 秒后摘要与 QueryPerf 对齐。
- 现行 SOP 已要求「我已复制」、改显示名、换网卡防 MAC 重复；**没有**改 `vc.uuid`、文件名和 `migrate.hostLog`，这是撞实例身份的根因。

---

## 1. 需要择机处理的机器

优先级按「要不要为 Host Client 用量专门排窗口」分。日常监控应优先用性能计数器，不必一次清完。

### P0：开机中、摘要为空（建议纳入重启/重注册窗口）

这些机 `runtime.powerState=poweredOn` 且 `quickStats.hostMemoryUsage=-1`。**只重启无效**，窗口里按第 2 节做取消注册再注册。无 Tools，操作为硬关。

| 名称 | MoRef | instanceUuid | 备注 |
|------|-------|--------------|------|
| R0002 | 2 | 唯一 `503f4dc6-…` | 与 R0001 同时开机；UUID 已唯一仍无摘要 |
| RV0001 | 5 | 唯一 `503f9d38-…` | 文件已改名 |
| RV0002 | 6 | 唯一 `503f9c89-…` | 文件已改名 |
| RV0003 | 8 | **撞车** `503f4139-…` | 比有摘要的 RV0004 还早开机 |
| RT0001 | 16 | 撞车 | 目录文件仍叫 `RV0001_BASE.vmx` |
| RT0002 | 17 | 撞车 | 同上 |
| RT0003 | 18 | 撞车 | 同上 |
| RT0004 | 19 | 撞车 | 同上 |
| RT0005 | 20 | 撞车 | 同上 |
| RV0006 | 29 | 撞车 | 同上 |
| RV0007 | 32 | 撞车 | 同上 |
| RV0008 | 33 | 撞车 | 同上 |
| RV0009 | 34 | 撞车 | 同上 |
| RV0010 | 41 | 撞车 | 8/19 开过、8/24 再开仍无摘要（重启反例） |
| openwrt-router | 31 | **空** | 基础设施，窗口单独排 |
| yuce-monitor-01 | 38 | **空** | 有 Tools、有 guest 主机名/IP；摘要仍空 |

共 **16 台开机无摘要**。

### P1：摘要目前有，但身份仍不干净（先不要为了摘要去动）

`quickStats` 正常，但 `instanceUuid` 仍与母本共用。普通重启后**有可能**丢掉摘要（与 P0 同一机制）。若该窗口本来就要关机，可顺带：写新 `vc.uuid`、改 hostLog，再按第 2 节重注册。

| 名称 | MoRef | 摘要 | 身份问题 |
|------|-------|------|----------|
| RV0004 | 10 | 有 | 撞车 `503f4139-…`，文件仍 `RV0001_BASE.*` |
| RV0005 | 11 | 有 | 同上 |
| RV0011 | 43 | 有 | 同上（8/21 后新 MoRef，槽位碰巧挂上） |
| RV0012 | 44 | 有 | 同上 |
| RV0013 | 45 | 有 | 同上 |
| RV0014 | 46 | 有 | 同上 |
| RV0015 | 47 | 有 | 同上 |

撞车 UUID：`503f4139-a765-460d-4488-5b3f4fc66769`（上表 7 台 + P0 里 RT/RV0003/6–10 + 下面两台关机母本，共 **20** 台）。

### P2：关机，随下次使用处理

| 名称 | MoRef | 建议 |
|------|-------|------|
| RV0000_BASE | 4 | 母本。保持关机。**以后克隆禁止把母本 `vc.uuid` 带给子机。** |
| RV0000_test | 14 | 撞车；开机前按第 2–3 节处理 |
| R0003 | 3 | UUID 已唯一；开机后若摘要为空再重注册 |
| ikuai-router | 12 | UUID 已唯一；非本批 Win11 克隆主路径 |

### 已恢复（对照）

| 名称 | MoRef | 结果 |
|------|-------|------|
| RV1001 | **48**（原 13） | 先补 `instanceUuid=5003dd86-4911-4be3-a87f-23019ce265e4` 并改 hostLog，摘要仍空；再取消注册重注册后摘要恢复。vGPU `nvidia_a2-1q` 未卸。 |
| R0001 | 1 | 摘要正常；目录仍是 `T001/T001.vmx`，不必为摘要动它 |

---

## 2. 存量恢复操作（Host Client）

目标：换一个 inventory 对象（新 MoRef），让 hostd 重新挂上 QuickStats。  
**不要**只点重启 / 关机再开机。

1. 业务确认可硬关（无 Tools，Guest 关机常不可用）。
2. 虚拟机 → **关闭电源**。
3. （建议，撞车或空 UUID 时）关机后编辑 `.vmx` 或「虚拟机选项」能写到的高级参数：
   - 新增/替换 `vc.uuid`：生成一条 **50 开头**、全库唯一的 UUID（不要用 `503f4139-a765-460d-4488-5b3f4fc66769`）。
   - `migrate.hostLog` 改成 `<新机名>.hlog`。
   - 已有唯一 `vc.uuid` 的（R0002、RV0001、RV0002）可跳过改 UUID，仍要做第 4–6 步。
4. 右键 → **从清单中取消注册**（磁盘文件不要删）。
5. 数据存储浏览器中打开该目录的 `.vmx` → **注册虚拟机**，名称仍用原名。
6. **打开电源**。约 20–60 秒后看摘要：CPU（MHz）和已用内存应非空，且与性能图大致同向。
7. 记录新 MoRef（Host Client 不一定展示；用 govc / govmomi `VirtualMachine` 引用即可）。Win11 可能提示异常关机，属预期。

govc 逐步命令见 **第 5.4 节**。一次窗口建议：先 1 台非核心（如某台 RT）验收，再按业务批次做 P0。openwrt / 监控机单独排。

---

## 3. 后续正确克隆流程

在现行钉钉 SOP 上**加步骤，不删原步骤**。原流程仍是：母本关机 → 建目录 → 拷文件 → 注册 → 改 8C/24G/80G 与 IOMMU → 改显示名 → 换网卡到 `PG-IKUAI-LAN` → 首次开机选「我已复制」。

### 3.1 拷贝之后、注册之前（现行 SOP 缺口）

钉钉写的是拷两个文件（通常是 `.vmx` + `.vmdk`）。拷完后在**新目录**内：

1. 把 `RV0001_BASE.vmx` / `.vmdk` / `.nvram` / `.vmsd` **改成新机名**（避免清单显示 RV0004、文件仍叫母本）。
2. 用编辑器打开新 `.vmx`，修改或删除下列项后再注册：

| 键 | 动作 |
|----|------|
| `displayName` | 新机名 |
| `uuid.bios` | 删掉或留空，交给首次开机「我已复制」重生；或事先写新值 |
| `vc.uuid` | **必须写成新的唯一值**（独立 ESXi 不会自动写）。禁止原样保留母本。 |
| `uuid.location` | 与 bios 一并重生即可 |
| `ethernet0.generatedAddress` | 删掉；按 SOP 删旧网卡、新建适配器 |
| `migrate.hostLog` | 改成 `<新机名>.hlog` 或删除 |
| `nvram` | 与改名后的 `.nvram` 一致 |
| `scsi0:0.fileName` | 与改名后的 `.vmdk` 一致 |

`vc.uuid` 示例格式（`.vmx` 空格分段，与 `50 03 dd 86-…` 一类；inventory 里是 `5003dd86-4911-4be3-a87f-23019ce265e4`）。用随机 UUID，首位习惯用 `50`。

### 3.2 注册与首次开机（保持 SOP）

1. 对新 `.vmx` 注册，不要对母本目录注册。
2. 编辑设置：8C = 1 插槽 × 8 核；开 IOMMU；网卡新建并选 `PG-IKUAI-LAN`，确认 MAC 不与现网重复。
3. 首次开机选 **「我已复制它」**（`msg.uuid.altered` reply=2）。这只保证新 **bios UUID / 生成 MAC**，**不会**生成新 `vc.uuid`。

### 3.3 开机后验收（SOP「克隆完成」应补上）

- [ ] `displayName`、数据存储路径、`.vmx` 文件名一致  
- [ ] bios UUID、网卡 MAC 与母本及其它克隆都不重复  
- [ ] `config.instanceUuid`（即 `vc.uuid`）全库唯一、非空  
- [ ] Host Client 摘要在约 1 分钟内出现 CPU / 已用内存；若为空，按第 2 节重注册，不要反复重启  
- [ ] 用量采集长期用性能计数器：`cpu.usagemhz.average`、`mem.consumed.average` / `mem.granted.average`  
- [ ] 客户机主机名 / IP：现行策略不装 Tools，用 MAC + iKuai/OpenWrt DHCP，不要等 `guest.hostName`

### 3.4 不要做的事

- 把母本目录整份拷走却不改 `vc.uuid`（本批 20 台撞车的来源）  
- 以为「我已复制」或「摘要有了」= 克隆合格（RV0011–15 有摘要仍撞 UUID）  
- 用重启修复空摘要  
- 在子机还挂着母本 `vc.uuid` 的情况下把宿主机加入 vCenter（实例身份会更乱）

---

## 5. govc CLI：完整克隆与注册

独立 ESXi **没有** vCenter 的 `CloneVM`。[`govc vm.clone`](https://github.com/vmware/govmomi/blob/main/govc/USAGE.md) 在无 vCenter 时会失败，不要用。CLI 对齐钉钉 SOP + 第 3 节：`datastore.cp` 拷盘 → 改 `.vmx`（尤其 `vc.uuid`）→ `vm.register` → 改规格/网卡 → 开机并用 `vm.question` 答「我已复制」。

命令以 [govc USAGE](https://github.com/vmware/govmomi/blob/main/govc/USAGE.md) 为准（govmomi 自带 `govc`）。安装：

```bash
go install github.com/vmware/govmomi/govc@latest
# 或 brew install govc
```

### 5.1 环境

本机 datastore 名含空格和括号，必须加引号。不要把密码写进仓库或文档副本。

```bash
export GOVC_URL='https://183.134.100.231:8443'
export GOVC_USERNAME='root'
export GOVC_PASSWORD='********'          # 仅会话环境变量
export GOVC_INSECURE=true                # 自签证书
export GOVC_DATASTORE='datastore1 (1)'

# 探测
govc about
govc ls /ha-datacenter/vm
govc datastore.ls
```

| 变量 | 含义 |
|------|------|
| `SRC` | 关机母本清单名，例如 `RV0000_BASE` |
| `NEW` | 新机名，例如 `RV0016` |
| `SRC_DIR` / `SRC_VMX` | 母本目录与 `.vmx` 文件名（本批母本常是 `RV0001_BASE`） |

先读母本路径，避免抄错文件名：

```bash
SRC=RV0000_BASE
NEW=RV0016

govc vm.info -e "$SRC"
govc object.collect -s "/ha-datacenter/vm/${SRC}" \
  config.files.vmPathName config.instanceUuid config.uuid \
  config.hardware.numCPU config.hardware.memoryMB
# 记下 vmPathName，例如 [datastore1 (1)] RV0001_BASE/RV0001_BASE.vmx
```

母本必须 **poweredOff**。`govc vm.clone` 不要用。

### 5.2 拷目录与改名

`datastore.cp` 拷 `.vmdk` 时默认 `-t=true`，走磁盘管理器，会带上 `-flat.vmdk`，不要只拷描述符。不要拷 `.vswp`、`.lck`、`vmware*.log`、`*.scoreboard`。

```bash
SRC_DIR=RV0001_BASE          # 按 5.1 实际目录改
SRC_STEM=RV0001_BASE         # 母本文件名前缀

govc vm.power -off "$SRC"    # 已关则报错可忽略
govc datastore.mkdir "$NEW"

# 配置与 NVRAM（有则拷）
govc datastore.cp "${SRC_DIR}/${SRC_STEM}.vmx"   "${NEW}/${NEW}.vmx"
govc datastore.cp "${SRC_DIR}/${SRC_STEM}.nvram" "${NEW}/${NEW}.nvram"  || true
govc datastore.cp "${SRC_DIR}/${SRC_STEM}.vmsd"  "${NEW}/${NEW}.vmsd"   || true

# 虚拟盘：描述符名以母本 .vmx 里 scsi0:0.fileName 为准（常见 *_2.vmdk）
govc datastore.download "${SRC_DIR}/${SRC_STEM}.vmx" - | grep -E 'scsi0:0.fileName|ide0:0.fileName'
# 假设是 RV0001_BASE_2.vmdk：
govc datastore.cp "${SRC_DIR}/${SRC_STEM}_2.vmdk" "${NEW}/${NEW}.vmdk"

govc datastore.ls "$NEW"
```

### 5.3 改 `.vmx`（注册前必须做）

`vc.uuid` 必须在 **register 之前** 写进文件。`govc vm.change -uuid` 只改 **bios UUID**，没有改 `instanceUuid` 的专用开关。

```bash
# 生成 50 开头的唯一 UUID（inventory 用短横线；.vmx 用空格分段）
python3 - <<'PY'
import uuid
h = "50" + uuid.uuid4().hex[2:]
dashed = f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"
pairs = " ".join(h[i:i+2] for i in range(0, 16, 2))
pairs2 = " ".join(h[i:i+2] for i in range(16, 32, 2))
print("DASHED", dashed)
print("VMX   ", f"{pairs}-{pairs2}")
PY
```

把输出记为 `VC_DASHED` / `VC_VMX`。本地下载、改写、上传（`NEW` / `VC_VMX` 从环境传入）：

```bash
export VC_VMX='50 03 .. ..'    # 上一步 VMX 行
export VC_DASHED='5003....'    # 上一步 DASHED 行
govc datastore.download "${NEW}/${NEW}.vmx" "/tmp/${NEW}.vmx"

python3 - <<'PY'
import os
from pathlib import Path
name = os.environ["NEW"]
vc_vmx = os.environ["VC_VMX"]
p = Path(f"/tmp/{name}.vmx")
lines = p.read_text().splitlines()
drop = ("uuid.bios", "uuid.location", "ethernet0.generatedAddress",
        "ethernet0.generatedAddressOffset")
lines = [ln for ln in lines if not any(
    ln.strip().startswith(k + " ") or ln.strip().startswith(k + "=") for k in drop
)]
def upsert(rows, key, val):
    line = f'{key} = "{val}"'
    out, found = [], False
    for ln in rows:
        if ln.strip().startswith(key + " ") or ln.strip().startswith(key + "="):
            out.append(line); found = True
        else:
            out.append(ln)
    if not found:
        out.append(line)
    return out
for key, val in (
    ("displayName", name),
    ("vc.uuid", vc_vmx),
    ("nvram", f"{name}.nvram"),
    ("scsi0:0.fileName", f"{name}.vmdk"),
    ("migrate.hostLog", f"{name}.hlog"),
):
    lines = upsert(lines, key, val)
p.write_text("\n".join(lines) + "\n")
for ln in lines:
    if any(s in ln for s in ("displayName", "uuid", "scsi0:0.fileName", "hostLog", "nvram")):
        print(ln)
PY

govc find / -type m | while read -r vm; do
  id=$(govc object.collect -s "$vm" config.instanceUuid 2>/dev/null || true)
  echo "$id  $vm"
done | grep -i "$VC_DASHED" && { echo "COLLISION, regenerate vc.uuid"; exit 1; }

govc datastore.upload "/tmp/${NEW}.vmx" "${NEW}/${NEW}.vmx"
```

原则：新 `displayName` / `vc.uuid` / 盘文件名 / hostLog；删掉旧 bios 与旧 MAC，交给首次开机「我已复制」重生。

### 5.4 注册、规格、网卡、开机

```bash
# 注册（路径相对 GOVC_DATASTORE，不要带 [datastore] 前缀）
govc vm.register -name "$NEW" "${NEW}/${NEW}.vmx"

# 规格：8C / 24GB；Windows 1 插槽 8 核；开 IOMMU（对齐钉钉 SOP）
govc vm.change -vm "$NEW" -c 8 -m 24576 -iommu-enabled=true
govc vm.change -vm "$NEW" -e cpuid.coresPerSocket=8 -e vvtd.enable=TRUE

# 网卡：删旧、建新，接到 PG-IKUAI-LAN，MAC 自动生成
govc device.info -vm "$NEW" ethernet-*
govc device.remove -vm "$NEW" ethernet-0          # 名称以 device.info 为准
govc vm.network.add -vm "$NEW" -net 'PG-IKUAI-LAN' -net.adapter e1000e

govc vm.info -e "$NEW"
govc object.collect -s "/ha-datacenter/vm/${NEW}" \
  config.instanceUuid config.uuid config.hardware.numCPU config.hardware.memoryMB
# instanceUuid 必须等于 VC_DASHED，且全库唯一

# 开机（无 Tools 用硬开即可）
govc vm.power -on "$NEW"

# 首次拷贝会卡在 uuid.altered；列出题目再答「复制」
sleep 3
govc vm.question -vm "$NEW"
# 看 Choices，一般是 I copied it / I moved it / Cancel
govc vm.question -vm "$NEW" -answer 'I copied it'
# 若精确文案不同，把上一条列出的复制项原文贴进 -answer
```

答错成「我已移动」会保留旧 bios，MAC 也容易和母本冲突。`vc.uuid` 不会因为这一题而变新，所以 5.3 必须先写好。

### 5.5 验收

```bash
# 摘要：hostMem/granted 应 > 0；uptime 应开始涨
govc object.collect -s "/ha-datacenter/vm/${NEW}" \
  runtime.powerState summary.quickStats.hostMemoryUsage \
  summary.quickStats.grantedMemory summary.quickStats.overallCpuUsage \
  summary.quickStats.uptimeSeconds config.instanceUuid

# 真实用量（摘要为空时仍应有数）
govc metric.sample -n 3 -instance - "/ha-datacenter/vm/${NEW}" \
  cpu.usagemhz.average mem.granted.average mem.consumed.average

govc device.info -vm "$NEW" ethernet-*     # MAC 不与现网重复
```

摘要 1 分钟仍为 `-1` / `0`：按下面 5.6 重注册，不要 `vm.power -reset`。

### 5.6 存量：govc 取消注册再注册

对应第 2 节。磁盘保留。

```bash
VM=RV0003
VMX_REL=$(govc object.collect -s "/ha-datacenter/vm/${VM}" config.files.vmPathName)
# 得到 [datastore1 (1)] RV0003/RV0001_BASE.vmx → 取出相对路径
REL=$(python3 -c "import sys; s=sys.argv[1]; print(s.split('] ',1)[1])" "$VMX_REL")

govc vm.power -off -force "$VM"

# 撞车或空 UUID 时：download .vmx，按 5.3 写新 vc.uuid / hostLog，再 upload

govc vm.unregister "$VM"
govc vm.register -name "$VM" "$REL"
govc vm.power -on "$VM"
# 若再弹出 uuid 题，仍答 copied
govc vm.question -vm "$VM"
govc object.collect -s "/ha-datacenter/vm/${VM}" summary.quickStats.hostMemoryUsage
```

RV1001 已用等价 API 验证：换 MoRef 后约 20 秒摘要恢复。

### 5.7 不要用 govc 做的事

| 命令 | 原因 |
|------|------|
| `govc vm.clone` | 独立 ESXi 无 CloneVM |
| `govc vm.destroy` | 会删盘；恢复只要 `vm.unregister` |
| `datastore.cp` 时 `-t=false` 只拷 `.vmdk` 文本 | 容易丢掉 `-flat.vmdk` |
| 不改 `vc.uuid` 就 `vm.register` | 再撞 `503f4139-…` |
| 只 `vm.power -reset` 修摘要 | 已证明无效 |

---

## 6. 字段与现象（给评估用）

| 现象 | 原因 | 处理 |
|------|------|------|
| 主机名 / IP 空 | 无 VMware Tools | 不靠重注册；MAC + DHCP |
| CPU/内存摘要空，虚机在跑 | hostd QuickStats 未挂到该 MoRef | 第 2 节重注册；监控用 QueryPerf |
| 多机同一 `instanceUuid` | 拷 `.vmx` 时带上母本 `vc.uuid` | 新克隆按 3.1；存量择机改 UUID + 重注册 |
| `instanceUuid` 空 | 独立 ESXi 注册未写 `vc.uuid` | 关机写入再重注册（openwrt / 监控机） |
| 摘要有、文件仍叫 `RV0001_BASE` | 只改了 displayName | 身份卫生，非紧急 |

RV1001 证明：vGPU 不是摘要为空的充分条件；换 MoRef 后带 `nvidia_a2-1q` 也可以有摘要。
