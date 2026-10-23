package mq

import (
	"errors"
	"feed-to-go/internal/config"
	"net"
	"net/url"
	"strconv"

	amqp "github.com/rabbitmq/amqp091-go"
)

type RabbitMQ struct {
	Conn *amqp.Connection
}

func NewRabbitMQ(cfg *config.RabbitMQConfig) (*RabbitMQ, error) {
	uri, err := connectionURL(cfg)
	if err != nil {
		return nil, err
	}
	conn, err := amqp.Dial(uri)
	if err != nil {
		return nil, err
	}

	return &RabbitMQ{Conn: conn}, nil
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
