package model

import (
	"time"

	"github.com/google/uuid"
)

type Project struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	Name        string     `json:"name" db:"name"`
	Description string     `json:"description" db:"description"`
	Requirement string     `json:"requirement" db:"requirement"`
	Status      string     `json:"status" db:"status"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at" db:"updated_at"`
}

type TestCase struct {
	ID             uuid.UUID `json:"id" db:"id"`
	ProjectID      uuid.UUID `json:"project_id" db:"project_id"`
	Name           string    `json:"name" db:"name"`
	Description    string    `json:"description" db:"description"`
	Type           string    `json:"type" db:"type"`
	Steps          string    `json:"steps" db:"steps"`
	ExpectedResult string    `json:"expected_result" db:"expected_result"`
	Priority       string    `json:"priority" db:"priority"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
}

type Execution struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	ProjectID   uuid.UUID  `json:"project_id" db:"project_id"`
	Status      string     `json:"status" db:"status"`
	StartedAt   *time.Time `json:"started_at" db:"started_at"`
	CompletedAt *time.Time `json:"completed_at" db:"completed_at"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

type TestResult struct {
	ID            uuid.UUID  `json:"id" db:"id"`
	ExecutionID   uuid.UUID  `json:"execution_id" db:"execution_id"`
	TestCaseID    uuid.UUID  `json:"test_case_id" db:"test_case_id"`
	Status        string     `json:"status" db:"status"`
	ErrorMessage  string     `json:"error_message" db:"error_message"`
	ScreenshotURL string     `json:"screenshot_url" db:"screenshot_url"`
	DurationMs    int        `json:"duration_ms" db:"duration_ms"`
	ExecutedAt    time.Time  `json:"executed_at" db:"executed_at"`
}

type CreateProjectRequest struct {
	Name        string `json:"name" validate:"required"`
	Description string `json:"description"`
	Requirement string `json:"requirement" validate:"required"`
}

type ExecutionSummary struct {
	TotalTests   int     `json:"total_tests"`
	PassedTests  int     `json:"passed_tests"`
	FailedTests  int     `json:"failed_tests"`
	SkippedTests int     `json:"skipped_tests"`
	PassRate     float64 `json:"pass_rate"`
	AvgDuration  float64 `json:"avg_duration"`
}

type DashboardMetrics struct {
	TotalProjects    int     `json:"total_projects"`
	TotalExecutions  int     `json:"total_executions"`
	RecentPassRate   float64 `json:"recent_pass_rate"`
	AvgExecutionTime string  `json:"avg_execution_time"`
}
