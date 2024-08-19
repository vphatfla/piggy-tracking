package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/spending-tracking/db"
	"github.com/spending-tracking/handlers"
)

func main() {
	r := chi.NewRouter()

	db.OpenDB()

	r.Use(cors.Handler(cors.Options{
		// AllowedOrigins:   []string{"https://foo.com"}, // Use this to allow specific origin hosts
		AllowedOrigins: []string{"https://*", "http://*"},
		// AllowOriginFunc:  func(r *http.Request, origin string) bool { return true },
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
