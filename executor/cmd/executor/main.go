package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"os"

	_ "github.com/lib/pq"
	"github.com/miraclebro89757/open-test/executor/internal/runner"
	"github.com/redis/go-redis/v9"
)

func main() {
	log.Println("=" + "="*58)
	log.Println("Open-Test Executor Starting")
	log.Println("=" + "="*58)

	// Connect to database
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://admin:password@postgres:5432/wharttest?sslmode=disable"
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Database connected successfully")

	// Connect to Redis
	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://redis:6379"
	}

	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse Redis URL: %v", err)
	}

	redisClient := redis.NewClient(opt)
	ctx := context.Background()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Printf("Connected to Redis: %s", redisURL)

	// Initialize runner
	testRunner, err := runner.NewRunner(db)
	if err != nil {
		log.Fatalf("Failed to initialize runner: %v", err)
	}
	defer testRunner.Close()

	log.Println("Playwright initialized successfully")
	log.Println("Listening for executor tasks on channel: executor:tasks")
	log.Println()

	// Subscribe to Redis channel
	pubsub := redisClient.Subscribe(ctx, "executor:tasks")
	defer pubsub.Close()

	ch := pubsub.Channel()

	for msg := range ch {
		log.Println("\n" + "="*60)
		log.Printf("Received task: %s", msg.Payload)

		var data map[string]interface{}
		if err := json.Unmarshal([]byte(msg.Payload), &data); err != nil {
			log.Printf("Error parsing message: %v", err)
			continue
		}

		action := data["action"]
		if action == "execute_tests" {
			executionID := data["execution_id"].(string)
			projectID := data["project_id"].(string)

			log.Printf("Execution ID: %s", executionID)
			log.Printf("Project ID: %s", projectID)
			log.Println("="*60 + "\n")

			// Publish start notification
			startMsg := map[string]interface{}{
				"execution_id": executionID,
				"status":       "running",
				"message":      "Test execution started",
			}
			startJSON, _ := json.Marshal(startMsg)
			redisClient.Publish(ctx, "updates:executions", startJSON)

			// Execute tests
			err := testRunner.ExecuteTestSuite(executionID, projectID)

			// Publish completion notification
			status := "completed"
			message := "Test execution completed successfully"
			if err != nil {
				log.Printf("Execution failed: %v", err)
				status = "failed"
				message = fmt.Sprintf("Test execution failed: %v", err)
			}

			completeMsg := map[string]interface{}{
				"execution_id": executionID,
				"status":       status,
				"message":      message,
			}
			completeJSON, _ := json.Marshal(completeMsg)
			redisClient.Publish(ctx, "updates:executions", completeJSON)

			log.Printf("\n✓ Execution %s completed\n", executionID)
		}
	}
}
