const https = require('https');
const chalk = require('chalk');
const boxen = require('boxen');
const semver = require('semver');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Cache file location
const CACHE_DIR = path.join(os.homedir(), '.opentest');
const CACHE_FILE = path.join(CACHE_DIR, 'update-check.json');
const CHECK_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check for updates from npm registry
 */
async function checkForUpdates(currentVersion) {
  try {
    // Check cache first
    const cache = readCache();
    if (cache && Date.now() - cache.timestamp < CHECK_INTERVAL) {
      if (cache.latestVersion && semver.gt(cache.latestVersion, currentVersion)) {
        return {
          updateAvailable: true,
          currentVersion,
          latestVersion: cache.latestVersion,
          cached: true
        };
      }
      return { updateAvailable: false, cached: true };
    }

    // Fetch latest version from npm
    const latestVersion = await getLatestVersion();
    
    // Save to cache
    saveCache({ latestVersion, timestamp: Date.now() });

    if (latestVersion && semver.gt(latestVersion, currentVersion)) {
      return {
        updateAvailable: true,
        currentVersion,
        latestVersion,
        cached: false
      };
    }

    return { updateAvailable: false };

  } catch (error) {
    // Silently fail - don't interrupt user workflow
    return { updateAvailable: false, error: error.message };
  }
}

/**
 * Get latest version from npm registry
 */
function getLatestVersion() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'registry.npmjs.org',
      path: '/open-test/latest',
      method: 'GET',
      headers: {
        'User-Agent': 'open-test-cli'
      },
      timeout: 3000
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.version);
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Display update notification
 */
function displayUpdateNotification(updateInfo) {
  if (!updateInfo.updateAvailable) return;

  const { currentVersion, latestVersion } = updateInfo;

  const message = chalk.bold.cyan(`🎉 New version available!\n\n`) +
    chalk.white(`Current: ${chalk.yellow(currentVersion)}\n`) +
    chalk.white(`Latest:  ${chalk.green(latestVersion)}\n\n`) +
    chalk.gray(`Update command:\n`) +
    chalk.cyan(`  npm update -g open-test\n`) +
    chalk.gray(`\nOr use npx for latest:\n`) +
    chalk.cyan(`  npx open-test@latest run`);

  console.log(boxen(message, {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'cyan'
  }));
}

/**
 * Read cache file
 */
function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
}

/**
 * Save to cache file
 */
function saveCache(data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    // Silently fail
  }
}

/**
 * Clear update check cache
 */
function clearCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

/**
 * Check and notify (async, non-blocking)
 */
async function checkAndNotify(currentVersion, options = {}) {
  if (options.skipUpdateCheck) return;

  try {
    const updateInfo = await checkForUpdates(currentVersion);
    if (updateInfo.updateAvailable && !options.silent) {
      displayUpdateNotification(updateInfo);
    }
    return updateInfo;
  } catch (error) {
    // Silently fail
    return null;
  }
}

module.exports = {
  checkForUpdates,
  displayUpdateNotification,
  checkAndNotify,
  clearCache
};
