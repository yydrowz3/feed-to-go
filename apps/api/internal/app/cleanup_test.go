package app

import (
	"errors"
	"reflect"
	"testing"
	"time"
)

func TestCleanupClosesInReverseOrderAndPreservesErrors(t *testing.T) {
	var order []string
	want := errors.New("close failed")
	err := closeResources([]func() error{func() error { order = append(order, "database"); return nil }, func() error { order = append(order, "publisher"); return want }}, func() { t.Error("unexpected forced close") }, time.Second)
	if !errors.Is(err, want) || !reflect.DeepEqual(order, []string{"publisher", "database"}) {
		t.Fatalf("order=%v err=%v", order, err)
	}
}

func TestCleanupTimeoutForcesBrokerAbort(t *testing.T) {
	released := make(chan struct{})
	finished := make(chan struct{})
	err := closeResources([]func() error{func() error { <-released; close(finished); return nil }}, func() { close(released) }, 20*time.Millisecond)
	if err == nil {
		t.Fatal("cleanup timeout ignored")
	}
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("forced close did not release blocked RPC")
	}
}
