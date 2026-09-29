package runner

import "time"

type Result struct {
	Name     string
	Status   string
	Duration time.Duration
	Error    string
}

type Case struct {
	Name string
	Type string
}

func ExecuteCase(c Case) Result {
	return Result{
		Name:     c.Name,
		Status:   "passed",
		Duration: 2 * time.Second,
	}
}
