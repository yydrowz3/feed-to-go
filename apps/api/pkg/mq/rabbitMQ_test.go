package mq

import (
	"feed-to-go/internal/config"
	"strings"
	"testing"

	amqp "github.com/rabbitmq/amqp091-go"
)

func TestConnectionURL(t *testing.T) {
	for _, tc := range []struct {
		name   string
		cfg    config.RabbitMQConfig
		scheme string
		port   int
		vhost  string
	}{
		{"local default", config.RabbitMQConfig{}, "amqp", 5672, "/"},
		{"CloudAMQP TLS", config.RabbitMQConfig{TLS: true, VHost: "tenant"}, "amqps", 5671, "tenant"},
		{"explicit port and escaped vhost", config.RabbitMQConfig{TLS: true, Port: 15671, VHost: "team/dev +#"}, "amqps", 15671, "team/dev +#"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			tc.cfg.Host = "localhost"
			tc.cfg.Username = "user@tenant"
			tc.cfg.Password = "test:p@ss/#?%"
			uri, err := connectionURL(&tc.cfg)
			if err != nil {
				t.Fatal(err)
			}
			parsed, err := amqp.ParseURI(uri)
			if err != nil {
				t.Fatal(err)
			}
			if parsed.Scheme != tc.scheme || parsed.Port != tc.port || parsed.Vhost != tc.vhost {
				t.Fatalf("unexpected scheme/port/vhost: %s/%d/%q", parsed.Scheme, parsed.Port, parsed.Vhost)
			}
			if parsed.Username != tc.cfg.Username || parsed.Password != tc.cfg.Password {
				t.Fatal("credentials did not round trip")
			}
		})
	}
}

func TestConnectionURLOverridesSeparateFields(t *testing.T) {
	want := "amqps://tenant:test@localhost/cloud-vhost?heartbeat=20"
	got, err := connectionURL(&config.RabbitMQConfig{URL: want, Host: "ignored", VHost: "/"})
	if err != nil || got != want {
		t.Fatal("full URI and its query parameters must take precedence")
	}
}

func TestInvalidConnectionURLDoesNotExposeCredentials(t *testing.T) {
	_, err := connectionURL(&config.RabbitMQConfig{URL: "amqps://user:secret-password@host:invalid/vhost"})
	if err == nil || strings.Contains(err.Error(), "secret-password") {
		t.Fatal("expected a validation error without credentials")
	}
}
