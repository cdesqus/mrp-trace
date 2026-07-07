package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"mrp-traceability/backend/internal/api"
	"mrp-traceability/backend/internal/hardware"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	databaseURL := env("DATABASE_URL", "postgres://mrp:mrp@localhost:5444/mrp?sslmode=disable")
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		log.Fatal(err)
	}

	devices := hardware.Devices{
		"LASER":              env("LASER_ADDR", "127.0.0.1:9100"),
		"REWORK_PRINTER":     env("REWORK_PRINTER_ADDR", "127.0.0.1:9101"),
		"SMALL_BOX_PRINTER":  env("SMALL_BOX_PRINTER_ADDR", "127.0.0.1:9102"),
		"MASTER_BOX_PRINTER": env("MASTER_BOX_PRINTER_ADDR", "127.0.0.1:9103"),
	}
	worker := hardware.NewWorker(pool, devices)
	go worker.Run(ctx)

	server := &http.Server{
		Addr:              env("HTTP_ADDR", ":8090"),
		Handler:           api.New(pool),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		log.Printf("API listening on %s", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatal(err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = server.Shutdown(shutdownCtx)
}

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
