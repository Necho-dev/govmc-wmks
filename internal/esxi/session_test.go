package esxi

import (
	"errors"
	"testing"

	"github.com/vmware/govmomi/vim25/soap"
	"github.com/vmware/govmomi/vim25/types"
)

func TestIsNotAuthenticated(t *testing.T) {
	if isNotAuthenticated(nil) || isNotAuthenticated(errors.New("nope")) {
		t.Fatal("unexpected match")
	}
	if !isNotAuthenticated(soap.WrapVimFault(&types.NotAuthenticated{})) {
		t.Fatal("expected vim NotAuthenticated")
	}
	sf := &soap.Fault{Code: "ServerFaultCode", String: "The session is not authenticated."}
	sf.Detail.Fault = types.NotAuthenticated{}
	if !isNotAuthenticated(soap.WrapSoapFault(sf)) {
		t.Fatal("expected soap NotAuthenticated")
	}
}
