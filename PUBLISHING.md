# OpenTest AI - Publishing Guide

## 📦 Publishing to npm

This guide explains how to publish OpenTest CLI to npm so users can run it with `npx opentest-ai@latest run`.

## Prerequisites

1. **npm Account**
   ```bash
   # Create account at https://www.npmjs.com/signup
   # Or login
   npm login
   ```

2. **Package Name Availability**
   ```bash
   # Check if "opentest-ai" is available
   npm view opentest-ai
   
   # If taken, update package.json with different name
   # e.g., "@yourorg/open-test" or "opentest-ai"
   ```

## Pre-Publish Checklist

### 1. Test Locally

```bash
# Install dependencies
npm install

# Test CLI commands
./test-cli.sh

# Test with npm link
npm link
open-test doctor
open-test --help

# Unlink after testing
npm unlink -g opentest-ai
```

### 2. Update Version

```bash
# Update version in package.json
npm version patch    # 1.0.0 -> 1.0.1
npm version minor    # 1.0.1 -> 1.1.0
npm version major    # 1.1.0 -> 2.0.0
```

### 3. Verify Package Contents

```bash
# See what will be published
npm pack --dry-run

# Check package size
npm pack
ls -lh *.tgz
```

### 4. Test Package Installation

```bash
# Pack the package
npm pack

# Install from tarball
npm install -g ./open-test-1.0.0.tgz

# Test it
open-test doctor
open-test --help

# Uninstall
npm uninstall -g opentest-ai
```

## Publishing Steps

### Option 1: Standard Publish

```bash
# 1. Login to npm
npm login

# 2. Publish
npm publish

# If scoped package
npm publish --access public
```

### Option 2: Publish with Tag

```bash
# Publish beta version
npm publish --tag beta

# Publish latest (default)
npm publish --tag latest

# Users can install specific tag
npx opentest-ai@beta run
```

### Option 3: Publish Specific Version

```bash
# Update version
npm version 1.0.0

# Publish
npm publish
```

## Post-Publish Verification

### 1. Check on npm

```bash
# View published package
npm view opentest-ai

# Check all versions
npm view opentest-ai versions

# Check latest version
npm view opentest-ai version
```

### 2. Test Installation

```bash
# Test global install
npm install -g opentest-ai
open-test --version

# Test npx (most important)
npx opentest-ai@latest --version
npx opentest-ai@latest doctor

# Test in new directory
mkdir test-install
cd test-install
npx opentest-ai@latest init my-project
```

### 3. Update Documentation

- Update README.md with correct npm package name
- Update installation instructions
- Add npm badge: `[![npm version](https://img.shields.io/npm/v/opentest-ai.svg)](https://www.npmjs.com/package/opentest-ai)`

## Package Configuration

### package.json Key Fields

```json
{
  "name": "open-test",
  "version": "1.0.0",
  "description": "AI-powered test automation platform",
  "main": "cli/index.js",
  "bin": {
    "open-test": "./cli/index.js",
    "opentest": "./cli/index.js"
  },
  "files": [
    "cli/",
    ".pi/",
    "schemas/",
    "opentest.config.example.json",
    "README.md",
    "PUBLISHING.md",
    "LICENSE",
    "!cli/**/*.test.js"
  ],
  "keywords": [
    "test",
    "automation",
    "ai",
    "semantic",
    "playwright",
    "e2e"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/miraclebro89757/open-test.git"
  },
  "preferGlobal": true
}
```

### Publishing surface

The `files` allowlist in `package.json` decides what ships — currently `cli/`, `.pi/`, `schemas/`, the config example, and the docs. There is deliberately no `.npmignore`: npm ignores it whenever `files` is present, so keeping one would only create a second source of truth that silently disagrees.

Exclude a file with a negation pattern inside `files`:

```json
"files": [
  "cli/",
  "!cli/**/*.test.js"
]
```

## Version Management

### Semantic Versioning

- **Patch** (1.0.X): Bug fixes, small improvements
- **Minor** (1.X.0): New features, backwards compatible
- **Major** (X.0.0): Breaking changes

```bash
# Examples
npm version patch -m "Fix: Corrected dependency check"
npm version minor -m "Feature: Added status command"
npm version major -m "Breaking: Changed CLI structure"
```

### Release Tags

```bash
# Latest (stable)
npm publish --tag latest

# Beta (testing)
npm publish --tag beta

# Alpha (experimental)
npm publish --tag alpha

# Canary (nightly)
npm publish --tag canary
```

## Troubleshooting

### Issue: "Package name taken"

Solution: Use scoped package or different name
```bash
# Update package.json
{
  "name": "@yourorg/open-test"
}

# Publish with public access
npm publish --access public
```

### Issue: "Authentication failed"

Solution: Re-login to npm
```bash
npm logout
npm login
```

### Issue: "Version already exists"

Solution: Update version number
```bash
npm version patch
npm publish
```

### Issue: "Package too large"

Solution: check the `files` allowlist in `package.json`, then verify.
```bash
# See exactly what would ship
npm pack --dry-run

# Exclude it with a negation pattern in "files", e.g. "!cli/**/*.test.js"
```

## Continuous Deployment

### GitHub Actions Example

`.github/workflows/publish.yml`:

```yaml
name: Publish to npm

on:
  release:
    types: [created]

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
          registry-url: 'https://registry.npmjs.org'
      
      - run: npm install
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Manual Release Process

```bash
# 1. Update version
npm version minor

# 2. Tag release
git tag v1.1.0
git push origin v1.1.0

# 3. Publish to npm
npm publish

# 4. Create GitHub release
# Go to: https://github.com/youruser/open-test/releases/new
```

## Maintenance

### Update Dependencies

```bash
# Check outdated packages
npm outdated

# Update dependencies
npm update

# Or use npm-check-updates
npx npm-check-updates -u
npm install
```

### Security Audit

```bash
# Check for vulnerabilities
npm audit

# Fix vulnerabilities
npm audit fix

# Force fix (may break things)
npm audit fix --force
```

### Deprecate Old Version

```bash
# Deprecate a version
npm deprecate open-test@1.0.0 "Please upgrade to 1.1.0"

# Deprecate all versions
npm deprecate open-test "Package moved to @neworg/open-test"
```

### Unpublish (Use with Caution!)

```bash
# Unpublish specific version (within 72 hours)
npm unpublish open-test@1.0.0

# Unpublish all versions (DANGER!)
npm unpublish open-test --force
```

## Best Practices

1. **Test Thoroughly**: Always test with `npm link` and `npm pack` before publishing
2. **Use Semantic Versioning**: Follow semver strictly
3. **Write Changelogs**: Keep CHANGELOG.md updated
4. **Tag Releases**: Use git tags for version control
5. **Monitor Usage**: Check npm download stats
6. **Respond to Issues**: Monitor GitHub issues and npm feedback
7. **Keep Dependencies Updated**: Regular security audits

## Resources

- [npm Documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [npm CLI Commands](https://docs.npmjs.com/cli/)
- [Publishing Packages](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)

---

**Ready to publish?** Run `./test-cli.sh` first!
