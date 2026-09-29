package handler

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/labstack/echo/v4"
	"github.com/miraclebro89757/open-test/api/internal/db"
	"github.com/miraclebro89757/open-test/api/internal/model"
	"github.com/redis/go-redis/v9"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Handler struct {
	RedisClient *redis.Client
}

func NewHandler(redisClient *redis.Client) *Handler {
	return &Handler{
		RedisClient: redisClient,
	}
}

// Health check
func (h *Handler) HealthCheck(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "api-gateway",
		"time":    time.Now().Format(time.RFC3339),
	})
}

// Create a new project
func (h *Handler) CreateProject(c echo.Context) error {
	var req model.CreateProjectRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	projectID := uuid.New()
	query := `
		INSERT INTO projects (id, name, description, requirement, status)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, created_at
	`

	var createdAt time.Time
	err := db.DB.QueryRow(query, projectID, req.Name, req.Description, req.Requirement, "pending").
		Scan(&projectID, &createdAt)

	if err != nil {
		log.Printf("Failed to create project: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create project"})
	}

	// Publish to Redis for agent to pick up
	message := map[string]any{
		"project_id":  projectID.String(),
		"requirement": req.Requirement,
		"action":      "generate_tests",
	}
	msgJSON, _ := json.Marshal(message)
	h.RedisClient.Publish(c.Request().Context(), "agent:tasks", msgJSON)

	return c.JSON(http.StatusCreated, map[string]any{
		"id":         projectID,
		"status":     "pending",
		"message":    "Project created, agent will process requirements",
		"created_at": createdAt,
	})
}

// Get project details
func (h *Handler) GetProject(c echo.Context) error {
	projectID := c.Param("id")

	var project model.Project
	query := `SELECT id, name, description, requirement, status, created_at, updated_at FROM projects WHERE id = $1`
	err := db.DB.QueryRow(query, projectID).Scan(
		&project.ID, &project.Name, &project.Description,
		&project.Requirement, &project.Status, &project.CreatedAt, &project.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "project not found"})
	}
	if err != nil {
		log.Printf("Failed to get project: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}

	return c.JSON(http.StatusOK, project)
}

// List all projects
func (h *Handler) ListProjects(c echo.Context) error {
	query := `SELECT id, name, description, requirement, status, created_at, updated_at FROM projects ORDER BY created_at DESC`
	rows, err := db.DB.Query(query)
	if err != nil {
		log.Printf("Failed to list projects: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}
	defer rows.Close()

	projects := []model.Project{}
	for rows.Next() {
		var p model.Project
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Requirement, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			continue
		}
		projects = append(projects, p)
	}

	return c.JSON(http.StatusOK, projects)
}

// Get test cases for a project
func (h *Handler) GetTestCases(c echo.Context) error {
	projectID := c.Param("id")

	query := `SELECT id, project_id, name, description, type, steps, expected_result, priority, created_at 
	          FROM test_cases WHERE project_id = $1 ORDER BY created_at DESC`
	rows, err := db.DB.Query(query, projectID)
	if err != nil {
		log.Printf("Failed to get test cases: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}
	defer rows.Close()

	testCases := []model.TestCase{}
	for rows.Next() {
		var tc model.TestCase
		if err := rows.Scan(&tc.ID, &tc.ProjectID, &tc.Name, &tc.Description, &tc.Type, &tc.Steps, &tc.ExpectedResult, &tc.Priority, &tc.CreatedAt); err != nil {
			continue
		}
		testCases = append(testCases, tc)
	}

	return c.JSON(http.StatusOK, testCases)
}

// Execute tests for a project
func (h *Handler) ExecuteTests(c echo.Context) error {
	projectID := c.Param("id")

	executionID := uuid.New()
	query := `INSERT INTO executions (id, project_id, status) VALUES ($1, $2, $3) RETURNING created_at`

	var createdAt time.Time
	err := db.DB.QueryRow(query, executionID, projectID, "queued").Scan(&createdAt)
	if err != nil {
		log.Printf("Failed to create execution: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create execution"})
	}

	// Publish to Redis for executor
	message := map[string]any{
		"execution_id": executionID.String(),
		"project_id":   projectID,
		"action":       "execute_tests",
	}
	msgJSON, _ := json.Marshal(message)
	h.RedisClient.Publish(c.Request().Context(), "executor:tasks", msgJSON)

	return c.JSON(http.StatusAccepted, map[string]any{
		"execution_id": executionID,
		"project_id":   projectID,
		"status":       "queued",
		"message":      "Execution queued",
		"created_at":   createdAt,
	})
}

// Get execution results
func (h *Handler) GetExecution(c echo.Context) error {
	executionID := c.Param("execution_id")

	var execution model.Execution
	query := `SELECT id, project_id, status, started_at, completed_at, created_at FROM executions WHERE id = $1`
	err := db.DB.QueryRow(query, executionID).Scan(
		&execution.ID, &execution.ProjectID, &execution.Status,
		&execution.StartedAt, &execution.CompletedAt, &execution.CreatedAt,
	)

	if err == sql.ErrNoRows {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "execution not found"})
	}
	if err != nil {
		log.Printf("Failed to get execution: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}

	// Get test results
	resultsQuery := `SELECT id, execution_id, test_case_id, status, error_message, screenshot_url, duration_ms, executed_at 
	                 FROM test_results WHERE execution_id = $1`
	rows, err := db.DB.Query(resultsQuery, executionID)
	if err != nil {
		log.Printf("Failed to get test results: %v", err)
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "database error"})
	}
	defer rows.Close()

	results := []model.TestResult{}
	for rows.Next() {
		var tr model.TestResult
		if err := rows.Scan(&tr.ID, &tr.ExecutionID, &tr.TestCaseID, &tr.Status, &tr.ErrorMessage, &tr.ScreenshotURL, &tr.DurationMs, &tr.ExecutedAt); err != nil {
			continue
		}
		results = append(results, tr)
	}

	return c.JSON(http.StatusOK, map[string]any{
		"execution": execution,
		"results":   results,
	})
}

// Dashboard metrics
func (h *Handler) GetDashboardMetrics(c echo.Context) error {
	var metrics model.DashboardMetrics

	// Total projects
	db.DB.QueryRow(`SELECT COUNT(*) FROM projects`).Scan(&metrics.TotalProjects)

	// Total executions
	db.DB.QueryRow(`SELECT COUNT(*) FROM executions`).Scan(&metrics.TotalExecutions)

	// Recent pass rate (last 10 executions)
	var totalTests, passedTests int
	db.DB.QueryRow(`
		SELECT COUNT(*), SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END)
		FROM test_results
		WHERE execution_id IN (SELECT id FROM executions ORDER BY created_at DESC LIMIT 10)
	`).Scan(&totalTests, &passedTests)

	if totalTests > 0 {
		metrics.RecentPassRate = float64(passedTests) / float64(totalTests) * 100
	}

	// Average execution time
	var avgSeconds float64
	db.DB.QueryRow(`
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (completed_at - started_at))), 0)
		FROM executions
		WHERE status = 'completed' AND completed_at IS NOT NULL AND started_at IS NOT NULL
	`).Scan(&avgSeconds)

	metrics.AvgExecutionTime = fmt.Sprintf("%.1fs", avgSeconds)

	return c.JSON(http.StatusOK, metrics)
}

// WebSocket for real-time updates
func (h *Handler) WebSocketHandler(c echo.Context) error {
	ws, err := upgrader.Upgrade(c.Response(), c.Request(), nil)
	if err != nil {
		return err
	}
	defer ws.Close()

	// Subscribe to Redis updates
	ctx := c.Request().Context()
	pubsub := h.RedisClient.Subscribe(ctx, "updates:*")
	defer pubsub.Close()

	ch := pubsub.Channel()

	for {
		select {
		case msg := <-ch:
			if err := ws.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				return err
			}
		case <-ctx.Done():
			return nil
		}
	}
}
