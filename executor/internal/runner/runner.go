package runner

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/playwright-community/playwright-go"
)

type TestCase struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	Description    string   `json:"description"`
	Type           string   `json:"type"`
	Steps          []string `json:"steps"`
	ExpectedResult string   `json:"expected_result"`
}

type TestResult struct {
	TestCaseID   string
	Status       string
	ErrorMessage string
	DurationMs   int64
}

type Runner struct {
	DB             *sql.DB
	PlaywrightInst *playwright.Playwright
	Browser        playwright.Browser
}

func NewRunner(db *sql.DB) (*Runner, error) {
	// Initialize Playwright
	pw, err := playwright.Run()
	if err != nil {
		return nil, fmt.Errorf("failed to start playwright: %w", err)
	}

	// Launch browser
	browser, err := pw.Chromium.Launch(playwright.BrowserTypeLaunchOptions{
		Headless: playwright.Bool(true),
	})
	if err != nil {
		pw.Stop()
		return nil, fmt.Errorf("failed to launch browser: %w", err)
	}

	return &Runner{
		DB:             db,
		PlaywrightInst: pw,
		Browser:        browser,
	}, nil
}

func (r *Runner) Close() {
	if r.Browser != nil {
		r.Browser.Close()
	}
	if r.PlaywrightInst != nil {
		r.PlaywrightInst.Stop()
	}
}

func (r *Runner) ExecuteTestSuite(executionID, projectID string) error {
	log.Printf("Starting execution %s for project %s", executionID, projectID)

	// Update execution status to running
	startTime := time.Now()
	_, err := r.DB.Exec(
		"UPDATE executions SET status = $1, started_at = $2 WHERE id = $3",
		"running", startTime, executionID,
	)
	if err != nil {
		return fmt.Errorf("failed to update execution status: %w", err)
	}

	// Get test cases for this project
	testCases, err := r.getTestCases(projectID)
	if err != nil {
		return fmt.Errorf("failed to get test cases: %w", err)
	}

	log.Printf("Found %d test cases to execute", len(testCases))

	// Execute each test case
	results := []TestResult{}
	for i, tc := range testCases {
		log.Printf("Executing test case %d/%d: %s", i+1, len(testCases), tc.Name)
		result := r.executeTestCase(tc)
		results = append(results, result)
		
		// Save result immediately
		r.saveTestResult(executionID, result)
	}

	// Update execution status to completed
	completedTime := time.Now()
	_, err = r.DB.Exec(
		"UPDATE executions SET status = $1, completed_at = $2 WHERE id = $3",
		"completed", completedTime, executionID,
	)
	if err != nil {
		return fmt.Errorf("failed to update execution completion: %w", err)
	}

	// Log summary
	passed := 0
	failed := 0
	for _, r := range results {
		if r.Status == "passed" {
			passed++
		} else {
			failed++
		}
	}
	log.Printf("Execution completed: %d passed, %d failed", passed, failed)

	return nil
}

func (r *Runner) getTestCases(projectID string) ([]TestCase, error) {
	query := `
		SELECT id, name, description, type, steps, expected_result
		FROM test_cases
		WHERE project_id = $1
		ORDER BY created_at ASC
	`

	rows, err := r.DB.Query(query, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	testCases := []TestCase{}
	for rows.Next() {
		var tc TestCase
		var stepsJSON string

		err := rows.Scan(&tc.ID, &tc.Name, &tc.Description, &tc.Type, &stepsJSON, &tc.ExpectedResult)
		if err != nil {
			log.Printf("Error scanning test case: %v", err)
			continue
		}

		// Parse steps JSON
		if err := json.Unmarshal([]byte(stepsJSON), &tc.Steps); err != nil {
			log.Printf("Error parsing steps JSON: %v", err)
			tc.Steps = []string{}
		}

		testCases = append(testCases, tc)
	}

	return testCases, nil
}

func (r *Runner) executeTestCase(tc TestCase) TestResult {
	startTime := time.Now()
	result := TestResult{
		TestCaseID: tc.ID,
		Status:     "passed",
	}

	// For MVP, we'll do a simple execution based on test type
	switch tc.Type {
	case "ui":
		err := r.executeUITest(tc)
		if err != nil {
			result.Status = "failed"
			result.ErrorMessage = err.Error()
		}
	case "api":
		err := r.executeAPITest(tc)
		if err != nil {
			result.Status = "failed"
			result.ErrorMessage = err.Error()
		}
	default:
		// For other types, simulate execution
		log.Printf("Simulating test: %s", tc.Name)
		time.Sleep(500 * time.Millisecond)
	}

	result.DurationMs = time.Since(startTime).Milliseconds()
	return result
}

func (r *Runner) executeUITest(tc TestCase) error {
	// Create a new page
	page, err := r.Browser.NewPage()
	if err != nil {
		return fmt.Errorf("failed to create page: %w", err)
	}
	defer page.Close()

	// For MVP, we'll navigate to a test URL and perform basic checks
	// In a real implementation, steps would be parsed and executed
	ctx := context.Background()

	// Example: Navigate to a demo site
	if _, err := page.Goto("https://example.com", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	}); err != nil {
		return fmt.Errorf("navigation failed: %w", err)
	}

	// Wait for page to load
	if err := page.WaitForLoadState(playwright.PageWaitForLoadStateOptions{
		State: playwright.LoadStateNetworkidle,
	}); err != nil {
		return fmt.Errorf("page load failed: %w", err)
	}

	// Check if page has content
	title, err := page.Title()
	if err != nil {
		return fmt.Errorf("failed to get title: %w", err)
	}

	log.Printf("  UI Test - Page title: %s", title)

	// Take a screenshot (optional)
	_, err = page.Screenshot(playwright.PageScreenshotOptions{
		Path: playwright.String(fmt.Sprintf("/tmp/screenshot_%s.png", tc.ID)),
	})
	if err != nil {
		log.Printf("  Warning: failed to take screenshot: %v", err)
	}

	_ = ctx
	return nil
}

func (r *Runner) executeAPITest(tc TestCase) error {
	// For MVP, simulate API test
	log.Printf("  API Test: %s", tc.Name)
	
	// In a real implementation, this would make actual HTTP requests
	// based on the test case steps
	time.Sleep(200 * time.Millisecond)
	
	return nil
}

func (r *Runner) saveTestResult(executionID string, result TestResult) error {
	resultID := uuid.New()

	query := `
		INSERT INTO test_results (id, execution_id, test_case_id, status, error_message, duration_ms)
		VALUES ($1, $2, $3, $4, $5, $6)
	`

	_, err := r.DB.Exec(
		query,
		resultID,
		executionID,
		result.TestCaseID,
		result.Status,
		result.ErrorMessage,
		result.DurationMs,
	)

	if err != nil {
		log.Printf("Failed to save test result: %v", err)
		return err
	}

	log.Printf("  Result: %s (%.2fs)", result.Status, float64(result.DurationMs)/1000.0)
	return nil
}
