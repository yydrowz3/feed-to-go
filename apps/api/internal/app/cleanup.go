package app

import (
	"errors"
	"time"
)

// Cleanup is bounded even if a broker stops answering channel.close RPCs.
func closeResources(closers []func() error, abort func(), timeout time.Duration) error {
	done := make(chan error, 1)
	go func() {
		var err error
		for i := len(closers) - 1; i >= 0; i-- {
			err = errors.Join(err, closers[i]())
		}
		done <- err
	}()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err := <-done:
		return err
	case <-timer.C:
		abort()
		return errors.New("connection cleanup timed out")
	}
}
