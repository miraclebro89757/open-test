# Executor Dockerfile
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Copy go mod files
COPY go.mod ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o /executor ./cmd/executor

# Final stage - use a Playwright image for browser automation
FROM mcr.microsoft.com/playwright:v1.40.0-focal

# Install Go runtime
RUN apt-get update && apt-get install -y wget && \
    wget https://go.dev/dl/go1.23.0.linux-amd64.tar.gz && \
    tar -C /usr/local -xzf go1.23.0.linux-amd64.tar.gz && \
    rm go1.23.0.linux-amd64.tar.gz

ENV PATH="/usr/local/go/bin:${PATH}"

WORKDIR /root/

# Copy the built binary
COPY --from=builder /executor .

# Install Playwright browsers
RUN playwright install chromium

EXPOSE 8001

CMD ["./executor"]
