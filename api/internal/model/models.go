package model

type ExecutionRequest struct {
	ProjectID   string `json:"project_id"`
	Requirement string `json:"requirement"`
}

type ExecutionResponse struct {
	ExecutionID string `json:"execution_id"`
	Status      string `json:"status"`
	Message     string `json:"message"`
}

type DashboardMetrics struct {
	TotalExecutions int     `json:"total_executions"`
	PassRate        float64 `json:"pass_rate"`
	AvgTime         float64 `json:"avg_time"`
}
