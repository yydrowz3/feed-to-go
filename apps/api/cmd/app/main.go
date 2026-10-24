package main

import (
	"os"

	"feed-to-go/internal/app"
)

func main() { os.Exit(app.Main(app.Combined)) }
