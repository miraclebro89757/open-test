package main

import (
    "fmt"
    "time"
)

func main() {
    fmt.Println("open-test executor ready")
    for i := 0; i < 3; i++ {
        fmt.Printf("executor heartbeat %d at %s\n", i+1, time.Now().Format(time.RFC3339))
        time.Sleep(2 * time.Second)
    }
}
