package esxi

import "time"

const WindowNote = "standalone ESXi historicalInterval=0; realtime window ~1 hour at 20s"

var DefaultMetricNames = []string{
	"cpu.usagemhz.average",
	"cpu.usage.average",
	"mem.active.average",
	"net.bytesRx.average",
	"net.bytesTx.average",
	"net.usage.average",
}

// About is GET /v1/about.
type About struct {
	Product        string `json:"product"`
	APIVersion     string `json:"apiVersion"`
	Build          string `json:"build"`
	OSType         string `json:"osType"`
	Name           string `json:"name"`
	InstanceUUID   string `json:"instanceUuid,omitempty"`
	StandaloneESXi bool   `json:"standaloneEsxi"`
	Note           string `json:"note"`
}

type Question struct {
	ID      string            `json:"id"`
	Text    string            `json:"text"`
	Choices map[string]string `json:"choices,omitempty"`
}

type NIC struct {
	Label     string `json:"label"`
	Key       int32  `json:"key"`
	MAC       string `json:"mac,omitempty"`
	Portgroup string `json:"portgroup,omitempty"`
	Adapter   string `json:"adapter,omitempty"`
}

type Disk struct {
	Label    string `json:"label"`
	Key      int32  `json:"key"`
	FileName string `json:"fileName,omitempty"`
	Capacity int64  `json:"capacityKB,omitempty"`
}

type VGPU struct {
	Label string `json:"label,omitempty"`
	Type  string `json:"type,omitempty"`
}

type QuickStats struct {
	OverallCPUUsage  int32 `json:"overallCpuUsage"`
	GuestMemoryUsage int32 `json:"guestMemoryUsage"`
	HostMemoryUsage  int32 `json:"hostMemoryUsage"`
	UptimeSeconds    int32 `json:"uptimeSeconds"`
	ConsumedOverhead int32 `json:"consumedOverhead,omitempty"`
	PrivateMemory    int32 `json:"privateMemory,omitempty"`
}

type GuestInfo struct {
	HostName         string `json:"hostName,omitempty"`
	IPAddress        string `json:"ipAddress,omitempty"`
	ToolsStatus      string `json:"toolsStatus,omitempty"`
	GuestUnavailable bool   `json:"guestUnavailable"`
}

type VMInfo struct {
	ID                 string      `json:"id"`
	UUID               string      `json:"uuid,omitempty"`
	MoRef              string      `json:"moref"`
	Name               string      `json:"name"`
	InstanceUUID       string      `json:"instanceUuid,omitempty"`
	BiosUUID           string      `json:"biosUuid,omitempty"`
	GuestID            string      `json:"guestId,omitempty"`
	PowerState         string      `json:"powerState"`
	ConnectionState    string      `json:"connectionState,omitempty"`
	Question           *Question   `json:"question,omitempty"`
	NumCPU             int32       `json:"numCPU"`
	MemoryMB           int32       `json:"memoryMB"`
	NICs               []NIC       `json:"networks,omitempty"`
	Disks              []Disk      `json:"disks,omitempty"`
	VGPU               []VGPU      `json:"vgpu,omitempty"`
	QuickStats         *QuickStats `json:"quickStats,omitempty"`
	QuickStatsReliable bool        `json:"quickStatsReliable"`
	Guest              GuestInfo   `json:"guest"`
	CPUPct             *float64    `json:"cpuPct,omitempty"`
	MemActivePct       *float64    `json:"memActivePct,omitempty"`
	NetRxMbps          *float64    `json:"netRxMbps,omitempty"`
	NetTxMbps          *float64    `json:"netTxMbps,omitempty"`
}

type HostInfo struct {
	Name          string      `json:"name"`
	MoRef         string      `json:"moref"`
	CPUMhz        int32       `json:"cpuMhz"`
	NumCPU        int16       `json:"numCpu"`
	NumCpuCores   int16       `json:"numCpuCores,omitempty"`
	NumCpuThreads int16       `json:"numCpuThreads,omitempty"`
	NumCpuPkgs    int16       `json:"numCpuPkgs,omitempty"`
	MemoryMB      int64       `json:"memoryMB"`
	Portgroups    []Portgroup `json:"portgroups,omitempty"`
}

type Portgroup struct {
	Name    string `json:"name"`
	VLAN    int32  `json:"vlanId,omitempty"`
	VSwitch string `json:"vswitch,omitempty"`
}

type NetworkInfo struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

type DatastoreInfo struct {
	Name      string `json:"name"`
	Type      string `json:"type,omitempty"`
	Capacity  int64  `json:"capacity,omitempty"`
	FreeSpace int64  `json:"freeSpace,omitempty"`
}

type DSFile struct {
	Path     string `json:"path"`
	Folder   bool   `json:"folder"`
	Size     int64  `json:"size,omitempty"`
	Modified string `json:"modified,omitempty"`
}

type MetricSample struct {
	TimeUTC time.Time `json:"timeUtc"`
	Value   float64   `json:"value"`
}

type MetricSeriesOut struct {
	Name     string         `json:"name"`
	Instance string         `json:"instance"`
	Unit     string         `json:"unit"`
	RawUnit  string         `json:"rawUnit,omitempty"`
	Points   []MetricSample `json:"points"`
	Derived  map[string]any `json:"derived,omitempty"`
}

type MetricsResponse struct {
	Entity     string            `json:"entity"`
	WindowNote string            `json:"windowNote"`
	Units      map[string]string `json:"units"`
	Series     []MetricSeriesOut `json:"series"`
}

type CounterInfo struct {
	Name        string `json:"name"`
	Group       string `json:"group,omitempty"`
	Unit        string `json:"unit,omitempty"`
	Rollup      string `json:"rollup,omitempty"`
	Description string `json:"description,omitempty"`
}

type CloneLayout struct {
	Folder string `json:"folder"`
	Prefix string `json:"prefix"`
}

type ClonePlan struct {
	DryRun bool         `json:"dryRun"`
	Note   string       `json:"note"`
	Layout *CloneLayout `json:"layout,omitempty"`
	Steps  []CloneStep  `json:"steps"`
}

type CloneStep struct {
	Op        string `json:"op"`
	Summary   string `json:"summary"`
	Datastore string `json:"datastore,omitempty"`
	Src       string `json:"src,omitempty"`
	Dst       string `json:"dst,omitempty"`
	Path      string `json:"path,omitempty"`
	Name      string `json:"name,omitempty"`
	Portgroup string `json:"portgroup,omitempty"`
	NumCPU    int32  `json:"numCPU,omitempty"`
	MemoryMB  int32  `json:"memoryMB,omitempty"`
	NestedHV  *bool  `json:"nestedHV,omitempty"`
	Choice    string `json:"choice,omitempty"`
}

type StepResult struct {
	Op      string `json:"op"`
	DryRun  bool   `json:"dryRun"`
	Message string `json:"message"`
	Detail  any    `json:"detail,omitempty"`
}

type CloneSpec struct {
	Src          string `json:"src"`
	Dst          string `json:"dst"`
	Datastore    string `json:"datastore"`
	Confirm      bool   `json:"confirm"`
	Portgroup    string `json:"portgroup,omitempty"`
	NicAdapter   string `json:"nicAdapter,omitempty"`
	ReplaceNic   *bool  `json:"replaceNic,omitempty"`
	NumCPU       *int32 `json:"numCPU,omitempty"`
	MemoryMB     *int32 `json:"memoryMB,omitempty"`
	LockMemory   *bool  `json:"lockMemory,omitempty"`
	NestedHV     *bool  `json:"nestedHV,omitempty"`
	IOMMU        *bool  `json:"iommu,omitempty"`
	PowerOn      *bool  `json:"powerOn,omitempty"`
	AnswerCopied *bool  `json:"answerCopied,omitempty"`
	AnswerChoice string `json:"answerChoice,omitempty"`
	SrcFolder    string `json:"srcFolder,omitempty"`
	SrcPrefix    string `json:"srcPrefix,omitempty"`
	Async        *bool  `json:"async,omitempty"`
	DryRun       *bool  `json:"dryRun,omitempty"`
}

type CloneTaskStep struct {
	Op        string `json:"op"`
	Status    string `json:"status"`
	Message   string `json:"message,omitempty"`
	StartedAt string `json:"startedAt,omitempty"`
	EndedAt   string `json:"endedAt,omitempty"`
}

type CloneTaskView struct {
	TaskID   string          `json:"taskId"`
	Status   string          `json:"status"`
	Op       string          `json:"op,omitempty"`
	Progress CloneProgress   `json:"progress"`
	Steps    []CloneTaskStep `json:"steps"`
	Layout   *CloneLayout    `json:"layout,omitempty"`
	Result   *VMInfo         `json:"result,omitempty"`
	Error    *CloneTaskError `json:"error,omitempty"`
	Poll     string          `json:"poll,omitempty"`
}

type CloneProgress struct {
	Percent int `json:"percent"`
	Step    int `json:"step"`
	Steps   int `json:"steps"`
}

type CloneTaskError struct {
	Code     string `json:"code"`
	Message  string `json:"message"`
	VimFault string `json:"vimFault,omitempty"`
	Op       string `json:"op,omitempty"`
}
