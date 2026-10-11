package esxi

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

var lineRE = regexp.MustCompile(`(?m)^([A-Za-z0-9._-]+)\s*=\s*(.*)$`)

func NewVCUUID() string {
	u := uuid.New()
	b := u
	b[0] = 0x50
	return b.String()
}

func PatchVMXContent(src, displayName, vcUUID string) string {
	keep := []string{}
	seen := map[string]bool{}
	skipPrefix := []string{
		"uuid.bios",
		"uuid.location",
		"ethernet0.generatedAddress",
		"ethernet1.generatedAddress",
		"ethernet2.generatedAddress",
		"ethernet3.generatedAddress",
	}
	for line := range strings.SplitSeq(src, "\n") {
		trim := strings.TrimSpace(line)
		if trim == "" {
			keep = append(keep, line)
			continue
		}
		m := lineRE.FindStringSubmatch(trim)
		if m == nil {
			keep = append(keep, line)
			continue
		}
		key := m[1]
		skip := false
		for _, p := range skipPrefix {
			if strings.EqualFold(key, p) {
				skip = true
				break
			}
		}
		if skip {
			continue
		}
		switch strings.ToLower(key) {
		case "displayname":
			keep = append(keep, fmt.Sprintf("displayName = %q", displayName))
			seen["displayName"] = true
		case "vc.uuid":
			keep = append(keep, fmt.Sprintf("vc.uuid = %q", vcUUID))
			seen["vc.uuid"] = true
		case "migrate.hostlog":
			keep = append(keep, fmt.Sprintf("migrate.hostLog = %q", displayName+".hlog"))
			seen["migrate.hostLog"] = true
		case "nvram":
			keep = append(keep, fmt.Sprintf("nvram = %q", displayName+".nvram"))
			seen["nvram"] = true
		case "ethernet0.addresstype", "ethernet1.addresstype", "ethernet2.addresstype", "ethernet3.addresstype":
			keep = append(keep, fmt.Sprintf("%s = %q", key, "generated"))
		default:
			keep = append(keep, line)
		}
	}
	if !seen["displayName"] {
		keep = append(keep, fmt.Sprintf("displayName = %q", displayName))
	}
	if !seen["vc.uuid"] {
		keep = append(keep, fmt.Sprintf("vc.uuid = %q", vcUUID))
	}
	if !seen["migrate.hostLog"] {
		keep = append(keep, fmt.Sprintf("migrate.hostLog = %q", displayName+".hlog"))
	}
	return strings.Join(keep, "\n")
}

func rewriteDiskFileNames(vmx, srcBase, dstBase string) string {
	return rewriteCloneNames(vmx, srcBase, dstBase)
}

func rewriteCloneNames(text, src, dst string) string {
	if src == "" || dst == "" || src == dst {
		return text
	}
	for _, sep := range []string{".", "_", "-"} {
		text = strings.ReplaceAll(text, src+sep, dst+sep)
	}
	return text
}

func cloneFileRename(base, src, dst string) string {
	if src == "" || dst == "" || src == dst {
		return base
	}
	for _, sep := range []string{".", "_", "-"} {
		if strings.HasPrefix(base, src+sep) {
			return dst + base[len(src):]
		}
	}
	return base
}
