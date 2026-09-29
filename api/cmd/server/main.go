package main

import (
	"net/http"
	"github.com/labstack/echo/v4"
	"github.com/labstack/echo/v4/middleware"
)

func main() {
	e := echo.New()

	e.Use(middleware.Logger())
	e.Use(middleware.Recover())
	e.Use(middleware.CORS())

	e.GET("/health", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{
			"status": "ok",
			"service": "api-gateway",
		})
	})

	e.POST("/api/projects/:project_id/execute", func(c echo.Context) error {
		projectID := c.Param("project_id")
		return c.JSON(http.StatusAccepted, map[string]any{
			"project_id": projectID,
			"status":     "queued",
			"message":    "agent workflow accepted",
		})
	})

	e.GET("/api/dashboard/metrics", func(c echo.Context) error {
		return c.JSON(http.StatusOK, map[string]any{
			"total_executions": 128,
			"pass_rate": "92.4%",
			"avg_time": "9.4s",
		})
	})

	e.Logger.Fatal(e.Start(":8000"))
}
