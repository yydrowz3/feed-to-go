package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"

	"go.yaml.in/yaml/v3"
)

type Config struct {
	Server        ServerConfig        `yaml:"-"`
	Database      DatabaseConfig      `yaml:"-"`
	Redis         RedisConfig         `yaml:"-"`
	RabbitMQ      RabbitMQConfig      `yaml:"-"`
	Observability ObservabilityConfig `yaml:"observability"`
}

type ServerConfig struct {
	Port int `yaml:"port"`
}

type DatabaseConfig struct {
	Host           string `yaml:"host"`
	Port           int    `yaml:"port"`
	User           string `yaml:"user"`
	Password       string `yaml:"password"`
	DBName         string `yaml:"dbname"`
	SSLMode        string `yaml:"sslmode"`
	ChannelBinding string `yaml:"channel_binding"`
}

type RedisConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Password string `yaml:"password"`
	DB       int    `yaml:"db"`
}

type RabbitMQConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type ObservabilityConfig struct {
	Pprof PprofConfig `yaml:"pprof"`
}

type PprofConfig struct {
	Enabled    bool   `yaml:"enabled"`
	ApiAddr    string `yaml:"api_addr"`
	WorkerAddr string `yaml:"worker_addr"`
}

func Load(filename string) (Config, error) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return Config{}, fmt.Errorf("failed to read config file: %w", err)
	}
	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config %s: %w", filename, err)
	}

	ApplyEnvOverrides(&cfg)

	return cfg, nil
}

func ApplyEnvOverrides(cfg *Config) {
	if cfg == nil {
		return
	}

	// 除 observability 外，配置从环境变量读取；PORT 默认使用 8095。
	cfg.Server = ServerConfig{Port: 8095}
	if port, err := strconv.Atoi(os.Getenv("PORT")); err == nil {
		cfg.Server.Port = port
	}

	cfg.Database = DatabaseConfig{
		Host:           os.Getenv("DB_HOST"),
		User:           os.Getenv("DB_USER"),
		Password:       os.Getenv("DB_PASSWORD"),
		DBName:         os.Getenv("DB_NAME"),
		SSLMode:        os.Getenv("DB_SSLMODE"),
		ChannelBinding: os.Getenv("DB_CHANNEL_BINDING"),
	}
	cfg.Database.Port, _ = strconv.Atoi(os.Getenv("DB_PORT"))

	cfg.Redis = RedisConfig{
		Host:     os.Getenv("REDIS_HOST"),
		Password: os.Getenv("REDIS_PASSWORD"),
	}
	cfg.Redis.Port, _ = strconv.Atoi(os.Getenv("REDIS_PORT"))
	cfg.Redis.DB, _ = strconv.Atoi(os.Getenv("REDIS_DB"))

	cfg.RabbitMQ = RabbitMQConfig{
		Host:     os.Getenv("AMQP_HOST"),
		Username: os.Getenv("AMQP_USER"),
		Password: os.Getenv("AMQP_PASSWORD"),
	}
	cfg.RabbitMQ.Port, _ = strconv.Atoi(os.Getenv("AMQP_PORT"))
}

// bool用来表示是否使用了默认配置，true表示使用了默认配置
func LoadLocalDev(filename string) (Config, bool, error) {
	cfg, err := Load(filename)
	if err == nil {
		return cfg, false, nil
	}
	if errors.Is(err, os.ErrNotExist) {
		return DefaultLocalConfig(), true, nil
	}

	return Config{}, false, err
}

func DefaultLocalConfig() Config {
	cfg := Config{
		Observability: ObservabilityConfig{
			Pprof: PprofConfig{
				Enabled:    true,
				ApiAddr:    "localhost:6060",
				WorkerAddr: "localhost:6061",
			},
		},
	}

	ApplyEnvOverrides(&cfg)
	return cfg
}
