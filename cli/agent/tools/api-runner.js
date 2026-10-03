#!/usr/bin/env node
/**
 * API Runner - Execute pytest API test scripts
 * 
 * Features:
 * 1. Execute pytest scripts with environment variable injection
 * 2. Real-time test output streaming
 * 3. Report generation (JSON, HTML, JUnit XML)
 * 4. Retry logic for flaky tests
 * 5. Parallel execution support
 * 
 * @module api-runner
 */

const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Run pytest API test script
 * 
 * @param {string} scriptPath - Path to pytest script
 * @param {object} options - Execution options
 * @returns {Promise<object>} Execution result
 */
async function runPytestScript(scriptPath, options = {}) {
  console.log(`🚀 Running API test: ${scriptPath}`);
  
  const {
    verbose = true,
    envVars = {},
    outputDir = null,
    reportFormat = 'json',
    maxRetries = 0,
    timeout = 300000, // 5 minutes
  } = options;
  
  // Verify script exists
  try {
    await fs.access(scriptPath);
  } catch (error) {
    throw new Error(`Test script not found: ${scriptPath}`);
  }
  
  // Check if pytest is installed
  await verifyPytestInstalled();
  
  // Prepare output directory
  const outputPath = outputDir || path.join(path.dirname(scriptPath), 'test-results');
  await fs.mkdir(outputPath, { recursive: true });
  
  // Build pytest command
  const args = buildPytestArgs(scriptPath, outputPath, reportFormat, verbose);
  
  // Execute with retries
  let lastError = null;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    if (attempt > 0) {
      console.log(`  ↻ Retry attempt ${attempt}/${maxRetries}`);
    }
    
    try {
      const result = await executePytest(args, envVars, timeout);
      
      // Parse results
      const parsedResult = await parseTestResults(outputPath, reportFormat);
      
      console.log(`  ✓ Test execution completed`);
      console.log(`    Passed: ${parsedResult.passed}`);
      console.log(`    Failed: ${parsedResult.failed}`);
      console.log(`    Duration: ${parsedResult.duration}s`);
      
      return {
        success: parsedResult.failed === 0,
        result: parsedResult,
        output: result.output,
        attempt: attempt + 1,
      };
      
    } catch (error) {
      lastError = error;
      attempt++;
      
      if (attempt <= maxRetries) {
        // Wait before retry (exponential backoff)
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`  ⏳ Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }
  
  // All retries failed
  throw new Error(`Test failed after ${maxRetries + 1} attempts: ${lastError.message}`);
}

/**
 * Verify pytest is installed
 */
async function verifyPytestInstalled() {
  return new Promise((resolve, reject) => {
    const proc = spawn('pytest', ['--version'], { stdio: 'pipe' });
    
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`  ✓ pytest detected: ${output.trim()}`);
        resolve();
      } else {
        reject(new Error(
          'pytest not found. Install with: pip install pytest requests python-dotenv'
        ));
      }
    });
    
    proc.on('error', (error) => {
      reject(new Error(
        `pytest not found: ${error.message}. Install with: pip install pytest requests python-dotenv`
      ));
    });
  });
}

/**
 * Build pytest command arguments
 */
function buildPytestArgs(scriptPath, outputPath, reportFormat, verbose) {
  const args = [scriptPath];
  
  // Verbosity
  if (verbose) {
    args.push('-v', '-s'); // verbose + no capture (show prints)
  }
  
  // Report formats
  switch (reportFormat) {
    case 'json':
      args.push('--json-report', `--json-report-file=${path.join(outputPath, 'report.json')}`);
      break;
    case 'html':
      args.push('--html', path.join(outputPath, 'report.html'), '--self-contained-html');
      break;
    case 'junit':
      args.push('--junit-xml', path.join(outputPath, 'junit.xml'));
      break;
    case 'all':
      args.push(
        '--json-report', `--json-report-file=${path.join(outputPath, 'report.json')}`,
        '--html', path.join(outputPath, 'report.html'), '--self-contained-html',
        '--junit-xml', path.join(outputPath, 'junit.xml')
      );
      break;
  }
  
  // Additional useful flags
  args.push(
    '--tb=short', // shorter traceback format
    '--color=yes', // colorized output
  );
  
  return args;
}

/**
 * Execute pytest with streaming output
 */
function executePytest(args, envVars, timeout) {
  return new Promise((resolve, reject) => {
    console.log(`  📋 Command: pytest ${args.join(' ')}`);
    
    const proc = spawn('pytest', args, {
      env: {
        ...process.env,
        ...envVars,
      },
      stdio: 'pipe',
    });
    
    let stdout = '';
    let stderr = '';
    
    // Stream stdout in real-time
    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      process.stdout.write(text); // Echo to console
    });
    
    // Stream stderr in real-time
    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text); // Echo to console
    });
    
    // Timeout handler
    const timeoutId = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Test execution timed out after ${timeout}ms`));
    }, timeout);
    
    proc.on('close', (code) => {
      clearTimeout(timeoutId);
      
      if (code === 0) {
        resolve({
          exitCode: code,
          output: stdout,
          errors: stderr,
        });
      } else {
        reject(new Error(`pytest exited with code ${code}\n${stderr}`));
      }
    });
    
    proc.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(new Error(`Failed to execute pytest: ${error.message}`));
    });
  });
}

/**
 * Parse test results from output files
 */
async function parseTestResults(outputPath, reportFormat) {
  // Try to parse JSON report first (most detailed)
  const jsonReportPath = path.join(outputPath, 'report.json');
  
  try {
    const content = await fs.readFile(jsonReportPath, 'utf-8');
    const report = JSON.parse(content);
    
    return {
      passed: report.summary?.passed || 0,
      failed: report.summary?.failed || 0,
      skipped: report.summary?.skipped || 0,
      total: report.summary?.total || 0,
      duration: report.duration || 0,
      tests: report.tests || [],
      format: 'json',
    };
  } catch (error) {
    // Fallback: parse from pytest exit code and output
    console.warn(`  ⚠ Could not parse JSON report: ${error.message}`);
    
    return {
      passed: 0,
      failed: 0,
      skipped: 0,
      total: 0,
      duration: 0,
      tests: [],
      format: 'unknown',
    };
  }
}

/**
 * Run multiple API test scripts in parallel
 */
async function runMultiplePytestScripts(scriptPaths, options = {}) {
  console.log(`🚀 Running ${scriptPaths.length} API test scripts in parallel`);
  
  const results = await Promise.allSettled(
    scriptPaths.map(scriptPath => runPytestScript(scriptPath, options))
  );
  
  const summary = {
    total: scriptPaths.length,
    passed: 0,
    failed: 0,
    results: [],
  };
  
  results.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      summary.passed++;
      summary.results.push({
        script: scriptPaths[idx],
        success: true,
        ...result.value,
      });
    } else {
      summary.failed++;
      summary.results.push({
        script: scriptPaths[idx],
        success: false,
        error: result.reason.message,
      });
    }
  });
  
  console.log(`\n📊 Parallel execution summary:`);
  console.log(`   Total: ${summary.total}`);
  console.log(`   Passed: ${summary.passed}`);
  console.log(`   Failed: ${summary.failed}`);
  
  return summary;
}

/**
 * Generate consolidated HTML report from multiple test runs
 */
async function generateConsolidatedReport(results, outputPath) {
  const reportPath = path.join(outputPath, 'consolidated-report.html');
  
  const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>API Test Report</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            margin-bottom: 30px;
        }
        .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .summary-card {
            padding: 20px;
            border-radius: 6px;
            text-align: center;
        }
        .summary-card.total { background: #e3f2fd; }
        .summary-card.passed { background: #e8f5e9; }
        .summary-card.failed { background: #ffebee; }
        .summary-card .number {
            font-size: 36px;
            font-weight: bold;
            margin-bottom: 8px;
        }
        .summary-card .label {
            color: #666;
            font-size: 14px;
        }
        .test-results {
            margin-top: 30px;
        }
        .test-item {
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 6px;
            border-left: 4px solid;
        }
        .test-item.success {
            background: #f1f8f4;
            border-color: #4caf50;
        }
        .test-item.failure {
            background: #fef5f5;
            border-color: #f44336;
        }
        .test-name {
            font-weight: 600;
            margin-bottom: 5px;
        }
        .test-meta {
            font-size: 14px;
            color: #666;
        }
        .error {
            margin-top: 10px;
            padding: 10px;
            background: #fff3e0;
            border-radius: 4px;
            font-family: monospace;
            font-size: 12px;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🧪 API Test Report</h1>
        
        <div class="summary">
            <div class="summary-card total">
                <div class="number">${results.total}</div>
                <div class="label">Total Scripts</div>
            </div>
            <div class="summary-card passed">
                <div class="number">${results.passed}</div>
                <div class="label">Passed</div>
            </div>
            <div class="summary-card failed">
                <div class="number">${results.failed}</div>
                <div class="label">Failed</div>
            </div>
        </div>
        
        <div class="test-results">
            <h2>Test Results</h2>
            ${results.results.map(r => `
                <div class="test-item ${r.success ? 'success' : 'failure'}">
                    <div class="test-name">${path.basename(r.script)}</div>
                    <div class="test-meta">
                        ${r.success 
                          ? `✓ Passed (${r.result.passed} tests, ${r.result.duration}s)`
                          : `✗ Failed`
                        }
                    </div>
                    ${!r.success ? `<div class="error">${r.error}</div>` : ''}
                </div>
            `).join('\n')}
        </div>
    </div>
</body>
</html>`;
  
  await fs.writeFile(reportPath, html, 'utf-8');
  console.log(`📄 Consolidated report: ${reportPath}`);
  
  return reportPath;
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error(`Usage: node api-runner.js <test-script.py> [options]`);
    console.error(`Options:`);
    console.error(`  --verbose         Verbose output (default: true)`);
    console.error(`  --output-dir      Output directory for reports`);
    console.error(`  --format          Report format: json|html|junit|all (default: json)`);
    console.error(`  --retries         Max retry attempts (default: 0)`);
    console.error(`  --timeout         Timeout in milliseconds (default: 300000)`);
    console.error(`  --env KEY=VALUE   Environment variable to inject`);
    process.exit(1);
  }
  
  const scriptPath = args[0];
  
  // Parse options
  const options = {
    verbose: !args.includes('--no-verbose'),
    outputDir: null,
    reportFormat: 'json',
    maxRetries: 0,
    timeout: 300000,
    envVars: {},
  };
  
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output-dir' && args[i + 1]) {
      options.outputDir = args[++i];
    } else if (args[i] === '--format' && args[i + 1]) {
      options.reportFormat = args[++i];
    } else if (args[i] === '--retries' && args[i + 1]) {
      options.maxRetries = parseInt(args[++i], 10);
    } else if (args[i] === '--timeout' && args[i + 1]) {
      options.timeout = parseInt(args[++i], 10);
    } else if (args[i] === '--env' && args[i + 1]) {
      const [key, value] = args[++i].split('=');
      options.envVars[key] = value;
    }
  }
  
  try {
    const result = await runPytestScript(scriptPath, options);
    
    if (result.success) {
      console.log('\n✅ All tests passed!');
      process.exit(0);
    } else {
      console.error('\n❌ Some tests failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`\n❌ Execution failed: ${error.message}`);
    process.exit(1);
  }
}

// Export for use as module
module.exports = {
  runPytestScript,
  runMultiplePytestScripts,
  generateConsolidatedReport,
  verifyPytestInstalled,
  buildPytestArgs,
  parseTestResults,
};

// Run CLI if executed directly
if (require.main === module) {
  main();
}
