/**
 * Utility functions for OpenAPI to Postman sync
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const chalk = require('chalk');

/**
 * Logging utilities with colored output
 */
const log = {
    info: (msg) => console.log(chalk.blue('ℹ'), msg),
    success: (msg) => console.log(chalk.green('✓'), msg),
    warn: (msg) => console.log(chalk.yellow('⚠'), msg),
    error: (msg) => console.log(chalk.red('✖'), msg),
    debug: (msg, data) => {
        console.log(chalk.gray('⊙'), chalk.gray(msg));
        if (data) console.log(chalk.gray(data));
    }
};

/**
 * Read and parse a JSON file
 */
function readJsonFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw new Error(`File not found: ${filePath}`);
        }
        throw new Error(`Failed to parse JSON file ${filePath}: ${error.message}`);
    }
}

/**
 * Write JSON to a file with pretty formatting
 */
function writeJsonFile(filePath, data) {
    const dir = path.dirname(filePath);

    // Create directory if it doesn't exist
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Fetch OpenAPI spec from a URL
 */
function fetchOpenApiFromUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const request = protocol.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirects
                return fetchOpenApiFromUrl(response.headers.location)
                    .then(resolve)
                    .catch(reject);
            }

            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: Failed to fetch ${url}`));
                return;
            }

            let data = '';
            response.on('data', chunk => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error(`Failed to parse response as JSON: ${error.message}`));
                }
            });
        });

        request.on('error', reject);
        request.setTimeout(30000, () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Deep clone an object
 */
function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Check if a value is a non-empty object
 */
function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(str) {
    return str
        .replace(/[^a-z0-9\-_]/gi, '_')
        .replace(/_+/g, '_')
        .toLowerCase();
}

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
    log,
    readJsonFile,
    writeJsonFile,
    fetchOpenApiFromUrl,
    deepClone,
    isObject,
    sanitizeFilename,
    formatBytes
};
