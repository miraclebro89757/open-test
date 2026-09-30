const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const inquirer = require('inquirer');
const ora = require('ora');
const { buildScaffoldDocument } = require('../llm/config-store');

async function initProject(projectName, options) {
  // Prompt for project name if not provided
  if (!projectName) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'projectName',
        message: 'Project name:',
        default: 'my-opentest-project'
      }
    ]);
    projectName = answers.projectName;
  }

  const projectPath = path.join(process.cwd(), projectName);

  // Check if directory exists
  if (fs.existsSync(projectPath)) {
    console.log(chalk.red(`\n❌ Directory "${projectName}" already exists\n`));
    process.exit(1);
  }

  const spinner = ora('Creating OpenTest project...').start();

  try {
    // Create project directory
    fs.mkdirSync(projectPath, { recursive: true });

    // Create directory structure
    const dirs = [
      'tests',
      'config',
      '.opentest'
    ];

    dirs.forEach(dir => {
      fs.mkdirSync(path.join(projectPath, dir), { recursive: true });
    });

    // Create configuration file
    const config = {
      name: projectName,
      version: '1.0.0',
      baseUrl: 'http://localhost:3000',
      tests: {
        directory: './tests',
        timeout: 30000,
        retries: 2
      },
      workers: {
        count: 4,
        memory: '150MB'
      },
      semantic: {
        threshold: 0.95,
        fingerprint: {
          structural: 0.30,
          semantic: 0.20,
          visual: 0.10,
          feature: 0.40
        }
      },
      ...buildScaffoldDocument(),
    };

    fs.writeFileSync(
      path.join(projectPath, 'opentest.config.json'),
      JSON.stringify(config, null, 2)
    );

    // Create sample test
    const sampleTest = `// OpenTest Sample Test
// This is a simple example to get you started

describe('Login Flow', () => {
  test('should login successfully', async ({ page }) => {
    // Navigate to login page
    await page.goto('https://example.com/login');
    
    // Fill login form (OpenTest uses semantic element location)
    await page.fill('username', 'testuser');
    await page.fill('password', 'password123');
    
    // Click submit button
    await page.click('submit-button');
    
    // Verify successful login
    await page.waitForSelector('dashboard');
    expect(await page.textContent('welcome-message')).toContain('Welcome');
  });
});
`;

    fs.writeFileSync(
      path.join(projectPath, 'tests', 'sample.test.js'),
      sampleTest
    );

    // Create README
    const readme = `# ${projectName}

OpenTest AI-powered test automation project.

## Quick Start

\`\`\`bash
# Run tests
npx open-test run

# Check status
npx open-test status

# View logs
npx open-test logs
\`\`\`

## Writing Tests

Tests are located in the \`tests/\` directory. OpenTest uses semantic element location, so you can reference elements by their semantic meaning instead of brittle selectors.

Example:
\`\`\`javascript
await page.fill('username', 'user@example.com');
await page.click('submit-button');
\`\`\`

## Configuration

Edit \`opentest.config.json\` to customize:
- Base URL of the app under test
- Timeout settings
- Worker configuration
- Semantic matching thresholds

## LLM provider

\`\`\`bash
npx open-test config
npx open-test config use free-openrouter
npx open-test config use deepseek-prod
npx open-test config ping
\`\`\`

\`baseUrl\` at the top of the file is the application under test. Model endpoints live under \`profiles\`.

## Documentation

- [OpenTest Docs](https://github.com/yourusername/open-test)
- [API Reference](https://github.com/yourusername/open-test/docs/api)
- [Best Practices](https://github.com/yourusername/open-test/docs/best-practices)
`;

    fs.writeFileSync(
      path.join(projectPath, 'README.md'),
      readme
    );

    // Create .gitignore
    const gitignore = `node_modules/
.env
.opentest/cache/
logs/
*.log
.DS_Store
`;

    fs.writeFileSync(
      path.join(projectPath, '.gitignore'),
      gitignore
    );

    spinner.succeed(chalk.green('Project created successfully!'));

    // Display next steps
    console.log(chalk.bold('\n✨ Next steps:\n'));
    console.log(chalk.cyan(`  cd ${projectName}`));
    console.log(chalk.cyan('  npx open-test run'));
    console.log();
    console.log(chalk.gray('📚 Documentation: https://github.com/yourusername/open-test'));
    console.log();

  } catch (error) {
    spinner.fail(chalk.red('Failed to create project'));
    console.error(error);
    process.exit(1);
  }
}

module.exports = { initProject };
