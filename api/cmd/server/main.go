package main

import (
	"context"
	"log"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
	"github.com/miraclebro89757/open-test/api/internal/db"
	"github.com/miraclebro89757/open-test/api/internal/handler"
	"github.com/redis/go-redis/v9"
)

func main() {
	// Initialize database
	if err := db.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.CloseDB()

	// Initialize Redis
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}

	redisClient := redis.NewClient(opt)
	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Redis connected successfully")

	// Initialize Echo
	e := echo.New()
	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	// Initialize handler
	h := handler.NewHandler(redisClient)

	// Routes
	e.GET("/health", h.HealthCheck)
	e.GET("/ws", h.WebSocketHandler)

	// Project routes
	e.POST("/api/projects", h.CreateProject)
	e.GET("/api/projects", h.ListProjects)
	e.GET("/api/projects/:id", h.GetProject)
	e.GET("/api/projects/:id/test-cases", h.GetTestCases)
	e.POST("/api/projects/:id/execute", h.ExecuteTests)

	// Execution routes
	e.GET("/api/executions/:execution_id", h.GetExecution)

	// Dashboard
	e.GET("/api/dashboard/metrics", h.GetDashboardMetrics)

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8000"
	}

	log.Printf("API Gateway starting on port %s", port)
	e.Logger.Fatal(e.Start(":" + port))
}
