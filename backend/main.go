package main

import (
	"context"
	"fmt"
	"net/http"
	"os"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spending-tracking/db"
	"github.com/spending-tracking/handlers"
)

func main() {
	r := chi.NewRouter()
	// Open Database Pool for Postgress DB RDS
	var err error
	db.DBPool, err = pgxpool.New(context.Background(), os.Getenv("DATABASE_URL"))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to create connection pool to Postgresql: %v\n", err)
		os.Exit(1)
	}
	// Defer to close the db pool later
	defer db.DBPool.Close()

	// db.OpenDB()

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://*", "http://*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "x-access-token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	r.Use(middleware.Logger)
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Hello World!"))
	})

	r.Get("/api/v1/account", handlers.GetAccountHandler)
	r.Get("/api/v1/transactions", handlers.GetAllTransactionByUserIdHandler)
	r.Get("/api/v1/transactions/dateRange", handlers.GetAllTransactionByUserIdAndDateRange)
	r.Post("/api/v1/transactions/upload", handlers.PostNewTransactionHandler)
	r.Post("/api/v1/users/insert", handlers.RegisterNewUserHandler)
	r.Post("/api/v1/users/login", handlers.AccountLoginHandler)
	http.ListenAndServe(":3000", r)
}
