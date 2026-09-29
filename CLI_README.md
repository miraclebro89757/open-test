# OpenTest CLI - One-Click Installation & Usage

## 🚀 Quick Start

```bash
# One-click setup and run (like a real agent!)
npx open-test@latest run

# That's it! OpenTest will:
# ✓ Check dependencies
# ✓ Install missing tools
# ✓ Start all services
# ✓ Open dashboard
```

## 📦 Installation Methods

### Method 1: Direct npx (Recommended)

No installation needed! Just run:

```bash
npx open-test@latest run
```

### Method 2: Global Installation

```bash
npm install -g open-test
open-test run
```

### Method 3: Local Project

```bash
npm install open-test
npx open-test run
```

## 🎯 Commands

### 🚀 Run (One-Click Start)

Start OpenTest with automatic setup:

```bash
npx open-test run

# Options:
npx open-test run --port 8080       # Custom API port
npx open-test run --skip-checks     # Skip dependency checks
```

**What it does:**
1. ✅ Checks Docker, Node.js, and other dependencies
2. ✅ Installs missing dependencies (with instructions)
3. ✅ Pulls and builds Docker images
4. ✅ Starts all services (API, Worker, DB, etc.)
5. ✅ Opens dashboard at http://localhost:3000

### 📂 Init (Create New Project)

Initialize a new OpenTest project:

```bash
npx open-test init my-test-project

# Or interactive:
npx open-test init
```

**Creates:**
- ✓ Project structure
- ✓ Sample test files
- ✓ Configuration (opentest.config.json)
- ✓ README and documentation

### 🐳 Start (Services Only)

Start OpenTest services without checks:

```bash
npx open-test start

# Options:
npx open-test start -d    # Detached mode
```

### ⏹️ Stop (Stop Services)

Stop all OpenTest services:

```bash
npx open-test stop
```

### 📊 Status (Check Health)

View service status and health:

```bash
npx open-test status
```

**Shows:**
- Service running state
- Health status
- Port mappings
- Endpoint availability

### 🧪 Test (Run Tests)

Run integration tests:

```bash
# All tests
npx open-test test

# Specific suite
npx open-test test worker        # Worker Pool tests
npx open-test test semantic      # Semantic Engine tests
npx open-test test event         # Event Bus tests
npx open-test test e2e           # End-to-end tests

# Verbose output
npx open-test test -v
```

### 📜 Logs (View Logs)

View service logs:

```bash
# All services
npx open-test logs

# Specific service
npx open-test logs api
npx open-test logs agent
npx open-test logs executor

# Follow logs
npx open-test logs -f
npx open-test logs api -f
```

### 🏥 Doctor (System Check)

Check system health and dependencies:

```bash
npx open-test doctor
```

**Checks:**
- ✓ Docker installed and running
- ✓ Docker Compose available
- ✓ Node.js version
- ✓ Cargo/Rust (optional)
- ✓ System resources

### 📦 Install (Dependencies)

Install all required dependencies:

```bash
npx open-test install
```

**Provides instructions for:**
- Docker Desktop
- Docker Compose
- Node.js
- Rust/Cargo (optional)

### 🔄 Update (Check for Updates)

Check if a new version is available:

```bash
npx open-test update
```

**Shows:**
- Current version
- Latest version
- Update instructions

### ⬆️ Upgrade (Auto-Upgrade)

Upgrade to the latest version (for global installs):

```bash
npx open-test upgrade

# Force upgrade
npx open-test upgrade --force
```

**Note**: If using npx, you're always on the latest version!

### 📋 Changelog (View Updates)

View changelog and release notes:

```bash
npx open-test changelog
```

## 🔄 Upgrading OpenTest

### For npx Users (Recommended)

**No upgrade needed!** npx always uses the latest version:

```bash
# Always gets the latest version
npx open-test@latest run
```

### For Global Install Users

```bash
# Option 1: Use built-in upgrade command
npx open-test upgrade

# Option 2: Use npm
npm update -g open-test

# Option 3: Reinstall
npm uninstall -g open-test
npm install -g open-test@latest
```

### For Project Dependency Users

```bash
# In your project directory
npm update open-test
```

### Auto Update Check

OpenTest automatically checks for updates when you run commands:

```bash
npx open-test run

# If update available, shows:
# ╔══════════════════════════════════════════════╗
# ║  🎉 New version available: 2.0.0             ║
# ║  Current: 1.0.0                              ║
# ║  Run: npm update -g open-test                ║
# ╚══════════════════════════════════════════════╝
```

Disable update check:

```bash
npx open-test run --no-update-check
```

### Version Management

```bash
# Check current version
open-test --version

# Check latest version on npm
npm view open-test version

# Use specific version
npx open-test@2.0.0 run
npm install -g open-test@2.0.0
```

📚 **Full Upgrade Guide**: See [UPGRADE_GUIDE.md](./UPGRADE_GUIDE.md) and [UPGRADE_QUICK_REF.md](./UPGRADE_QUICK_REF.md)

## 🎨 Usage Examples

### Example 1: First-Time User

```bash
# Just run this one command!
npx open-test@latest run

# ✓ Everything installs and starts automatically
# ✓ Dashboard opens at http://localhost:3000
# ✓ Ready to create tests
```

### Example 2: Create New Project

```bash
# Initialize project
npx open-test init my-automation

# Navigate to project
cd my-automation

# Start testing
npx open-test run
```

### Example 3: Development Workflow

```bash
# Start services
npx open-test run

# Check status
npx open-test status

# View logs during development
npx open-test logs api -f

# Run tests
npx open-test test

# Stop when done
npx open-test stop
```

### Example 4: CI/CD Pipeline

```bash
# In your CI/CD script
npx open-test doctor           # Check environment
npx open-test start            # Start services
npx open-test test            # Run tests
npx open-test stop            # Clean up
```

## 🔧 Configuration

### Project Configuration

Create `opentest.config.json` in your project:

```json
{
  "name": "my-project",
  "version": "1.0.0",
  "baseUrl": "http://localhost:3000",
  "tests": {
    "directory": "./tests",
    "timeout": 30000,
    "retries": 2
  },
  "workers": {
    "count": 4,
    "memory": "150MB"
  },
  "semantic": {
    "threshold": 0.95,
    "fingerprint": {
      "structural": 0.30,
      "semantic": 0.20,
      "visual": 0.10,
      "feature": 0.40
    }
  }
}
```

### Environment Variables

Create `.env` file:

```bash
# API Configuration
API_PORT=8080
API_HOST=0.0.0.0

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=opentest
POSTGRES_USER=opentest
POSTGRES_PASSWORD=opentest

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# OpenAI (for Agent)
OPENAI_API_KEY=your-api-key-here
```

## 📊 Service URLs

After running `npx open-test run`:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Dashboard UI |
| **API** | http://localhost:8080 | REST API |
| **Worker Pool** | http://localhost:9000 | Worker management |
| **PostgreSQL** | localhost:5432 | Primary database |
| **Redis** | localhost:6379 | Task queue |
| **Neo4j** | http://localhost:7474 | Graph database |
| **Elasticsearch** | http://localhost:9200 | Search engine |

## 🐛 Troubleshooting

### Issue: "Docker not found"

```bash
# macOS
brew install --cask docker

# Or download from: https://www.docker.com/products/docker-desktop
```

### Issue: "Docker daemon not running"

```bash
# Start Docker Desktop application
# macOS: Open Docker Desktop
# Linux: sudo systemctl start docker
```

### Issue: "Port already in use"

```bash
# Stop other services using the port
npx open-test stop

# Or change port
npx open-test run --port 8090
```

### Issue: "Cargo not found" (for tests)

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Restart terminal
source $HOME/.cargo/env
```

### Issue: Services not starting

```bash
# Check system health
npx open-test doctor

# View logs
npx open-test logs

# Try rebuilding
docker compose down -v
npx open-test run
```

## 🎯 Key Features

### ✨ One-Click Experience

- **Zero config needed** - Just run `npx open-test run`
- **Automatic dependency checks** - Detects and helps install missing tools
- **Smart service management** - Handles Docker containers automatically
- **Health monitoring** - Ensures services are ready before use

### 🤖 Agent-Like Behavior

- **Self-healing** - Automatically restarts failed services
- **Intelligent defaults** - Works out of the box
- **Helpful error messages** - Clear instructions when things go wrong
- **Progress feedback** - Shows what's happening at each step

### 🚀 Developer-Friendly

- **Interactive CLI** - Beautiful terminal UI
- **Quick feedback** - Fast status checks and logs
- **Flexible commands** - Do only what you need
- **CI/CD ready** - Perfect for automation pipelines

## 📚 Documentation

- **Full Docs**: [TESTING.md](./TESTING.md)
- **Architecture**: [ARCHITECTURE_V2.md](./ARCHITECTURE_V2.md)
- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)
- **Test Guide**: [TEST_SUMMARY.md](./TEST_SUMMARY.md)

## 💡 Tips

### Tip 1: Use npx for Latest Version

```bash
# Always get the latest version
npx open-test@latest run
```

### Tip 2: Check Status Often

```bash
# Quick health check
npx open-test status
```

### Tip 3: Follow Logs During Development

```bash
# See real-time logs
npx open-test logs api -f
```

### Tip 4: Run Tests in CI

```bash
# Perfect for CI/CD
npx open-test test --verbose
```

## 🔗 Links

- **GitHub**: https://github.com/yourusername/open-test
- **NPM**: https://www.npmjs.com/package/open-test
- **Documentation**: https://github.com/yourusername/open-test/docs
- **Issues**: https://github.com/yourusername/open-test/issues

## 📝 License

MIT License - see [LICENSE](./LICENSE) file for details.

---

**OpenTest CLI** - One-click AI-powered test automation 🚀
