package mq

import (
	"context"
	"errors"
	"net"
	"net/url"
	"strconv"
	"time"

	"feed-to-go/internal/config"

	amqp "github.com/rabbitmq/amqp091-go"
)

type RabbitMQ struct {
	Conn      *amqp.Connection
	transport net.Conn
}

func NewRabbitMQ(cfg *config.RabbitMQConfig) (*RabbitMQ, error) {
	return NewRabbitMQContext(context.Background(), cfg)
}

// NewRabbitMQContext bounds TCP, TLS and AMQP handshakes, not the connection lifetime.
func NewRabbitMQContext(ctx context.Context, cfg *config.RabbitMQConfig) (*RabbitMQ, error) {
	uri, err := connectionURL(cfg)
	if err != nil {
		return nil, err
	}
	var transport net.Conn
	stopHandshake := func() bool { return true }
	conn, err := amqp.DialConfig(uri, amqp.Config{Dial: func(network, address string) (net.Conn, error) {
		var dialErr error
		transport, dialErr = (&net.Dialer{Timeout: 10 * time.Second}).DialContext(ctx, network, address)
		if dialErr != nil {
			return nil, dialErr
		}
		deadline := time.Now().Add(10 * time.Second)
		if d, ok := ctx.Deadline(); ok && d.Before(deadline) {
			deadline = d
		}
		_ = transport.SetDeadline(deadline)
		stopHandshake = context.AfterFunc(ctx, func() { _ = transport.Close() })
		return transport, nil
	}})
	stopHandshake()
	if err != nil {
		if transport != nil {
			_ = transport.Close()
		}
		// Do not include an input URI (and its credentials) in startup logs.
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, errors.New("RabbitMQ connection or handshake failed")
	}
	_ = transport.SetDeadline(time.Time{})
	return &RabbitMQ{Conn: conn, transport: transport}, nil
}

// Abort immediately releases blocked AMQP RPCs during timeout or forced shutdown.
func (r *RabbitMQ) Abort() {
	if r != nil && r.transport != nil {
		_ = r.transport.Close()
	}
}

func connectionURL(cfg *config.RabbitMQConfig) (string, error) {
	if cfg == nil {
		return "", errors.New("rabbitmq config is nil")
	}
	if cfg.URL != "" {
		if _, err := amqp.ParseURI(cfg.URL); err != nil {
			// URL parse errors may include credentials; do not log the input.
			return "", errors.New("invalid AMQP_URL: expected an amqp:// or amqps:// connection URI")
		}
		return cfg.URL, nil
	}
	scheme, port := "amqp", cfg.Port
	if cfg.TLS {
		scheme = "amqps"
	}
	if port == 0 {
		port = 5672
		if cfg.TLS {
			port = 5671
		}
	}
	vhost := cfg.VHost
	if vhost == "" {
		vhost = "/"
	}
	uri := url.URL{
		Scheme:  scheme,
		User:    url.UserPassword(cfg.Username, cfg.Password),
		Host:    net.JoinHostPort(cfg.Host, strconv.Itoa(port)),
		Path:    "/" + vhost,
		RawPath: "/" + url.PathEscape(vhost),
	}
	return uri.String(), nil
}

func (r *RabbitMQ) CLose() error {
	if r == nil {
		return nil
	}
	if r.Conn != nil {
		return r.Conn.Close()
	}

	return nil
}

func (r *RabbitMQ) NewChannel() (*amqp.Channel, error) {
	if r == nil || r.Conn == nil {
		return nil, errors.New("rabbitmq connection is not initialized")
	}

	return r.Conn.Channel()
}
