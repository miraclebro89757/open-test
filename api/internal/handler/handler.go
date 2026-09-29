package handler

import (
	"net/http"
	"github.com/labstack/echo/v4"
)

func Health(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"status": "ok",
		"service": "api-gateway",
	})
}

func TriggerExecution(c echo.Context) error {
	projectID := c.Param("project_id")
	return c.JSON(http.StatusAccepted, map[string]any{
		"project_id": projectID,
		"status":     "queued",
		"message":    "agent workflow accepted",
	})
}

func DashboardMetrics(c echo.Context) error {
	return c.JSON(http.StatusOK, map[string]any{
		"total_executions": 128,
		"pass_rate":        92.4,
		"avg_time":         9.4,
	})
}
