#!/usr/bin/env node

/**
 * OpenAPI to Postman Collection Converter
 * 
 * Converts OpenAPI specifications to Postman collections with support for:
 * - File and URL inputs
 * - Custom collection naming
 * - Folder organization options
 * - Integration with merge script for preserving custom scripts
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const Converter = require('openapi-to-postmanv2');
const chalk = require('chalk');
const { readJsonFile, writeJsonFile, log, fetchOpenApiFromUrl } = require('./utils');
const { sanitizeCollection } = require('./value-sanitizer');

// CLI Configuration
program
  .name('openapi-postman-sync')
  .description('Convert OpenAPI specifications to Postman collections')
  .version('1.0.0')
  .requiredOption('-i, --input <path>', 'OpenAPI spec file path or URL')
  .option('-o, --output <path>', 'Output Postman collection file path', 'postman-collection.json')
  .option('-n, --name <name>', 'Collection name (defaults to OpenAPI title)')
  .option('--folder-strategy <strategy>', 'Folder organization: "tags" or "paths"', 'tags')
  .option('--include-auth', 'Include authentication from OpenAPI security schemes', true)
  .option('--base-url <url>', 'Override base URL for requests')
  .option('--env-file <path>', 'Path to environment variables JSON file')
  .option('--values-map <path>', 'Path to JSON file with realistic value overrides for generated fields')
  .option('--skip-sanitize', 'Skip value sanitization (keep random generated values)', false)
  .option('-v, --verbose', 'Enable verbose logging', false);

program.parse();

const options = program.opts();

/**
 * Main conversion function
 */
async function convert() {
  try {
    log.info('Starting OpenAPI to Postman conversion...');

    // Load OpenAPI spec
    let openApiSpec;

    if (options.input.startsWith('http://') || options.input.startsWith('https://')) {
      log.info(`Fetching OpenAPI spec from URL: ${options.input}`);
      openApiSpec = await fetchOpenApiFromUrl(options.input);
    } else {
      const inputPath = path.resolve(options.input);
      log.info(`Reading OpenAPI spec from file: ${inputPath}`);

      if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
      }

      openApiSpec = readJsonFile(inputPath);
    }

    // Validate OpenAPI spec
    if (!openApiSpec.openapi && !openApiSpec.swagger) {
      throw new Error('Invalid OpenAPI specification: missing "openapi" or "swagger" field');
    }

    const specVersion = openApiSpec.openapi || openApiSpec.swagger;
    log.info(`Detected OpenAPI version: ${specVersion}`);

    // Conversion options
    const conversionOptions = {
      folderStrategy: options.folderStrategy,
      includeAuthInfoInExample: options.includeAuth,
      requestParametersResolution: 'Example',
      exampleParametersResolution: 'Example',
      optimizeConversion: true,
      stackLimit: 50
    };

    if (options.verbose) {
      log.debug('Conversion options:', JSON.stringify(conversionOptions, null, 2));
    }

    // Convert OpenAPI to Postman
    log.info('Converting OpenAPI spec to Postman collection...');

    const result = await new Promise((resolve, reject) => {
      Converter.convert(
        { type: 'json', data: openApiSpec },
        conversionOptions,
        (err, conversionResult) => {
          if (err) {
            reject(err);
          } else {
            resolve(conversionResult);
          }
        }
      );
    });

    if (!result.result) {
      throw new Error(`Conversion failed: ${result.reason}`);
    }

    let collection = result.output[0].data;

    // Override collection name if provided
    if (options.name) {
      collection.info.name = options.name;
    }

    // Override base URL if provided
    if (options.baseUrl) {
      collection = overrideBaseUrl(collection, options.baseUrl);
    }

    // Add environment variables if provided
    if (options.envFile) {
      const envVars = readJsonFile(path.resolve(options.envFile));
      collection = addEnvironmentVariables(collection, envVars);
    }

    // Sanitize random values with realistic defaults
    if (!options.skipSanitize) {
      log.info('Sanitizing generated values with realistic defaults...');
      let userValuesMap = null;
      if (options.valuesMap) {
        const valuesMapPath = path.resolve(options.valuesMap);
        if (fs.existsSync(valuesMapPath)) {
          userValuesMap = readJsonFile(valuesMapPath);
          log.info(`Loaded custom values map from: ${valuesMapPath}`);
        } else {
          log.warn(`Values map file not found: ${valuesMapPath} — using built-in defaults only`);
        }
      }
      collection = sanitizeCollection(collection, openApiSpec, userValuesMap);
    } else {
      log.info('Value sanitization skipped (--skip-sanitize)');
    }

    // Write output
    const outputPath = path.resolve(options.output);
    writeJsonFile(outputPath, collection);

    // Summary
    const itemCount = countItems(collection.item);
    log.success(`✓ Conversion complete!`);
    log.info(`  Collection: ${collection.info.name}`);
    log.info(`  Endpoints: ${itemCount}`);
    log.info(`  Output: ${outputPath}`);

    return collection;

  } catch (error) {
    log.error(`Conversion failed: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Override base URL in all requests
 */
function overrideBaseUrl(collection, baseUrl) {
  const traverse = (items) => {
    for (const item of items) {
      if (item.item) {
        traverse(item.item);
      } else if (item.request) {
        // Replace the host with a variable
        if (item.request.url) {
          if (typeof item.request.url === 'string') {
            item.request.url = item.request.url.replace(/^https?:\/\/[^\/]+/, baseUrl);
          } else if (item.request.url.raw) {
            item.request.url.raw = item.request.url.raw.replace(/^https?:\/\/[^\/]+/, baseUrl);
            item.request.url.host = [baseUrl.replace(/^https?:\/\//, '')];
          }
        }
      }
    }
  };

  traverse(collection.item);
  return collection;
}

/**
 * Add environment variables to collection
 */
function addEnvironmentVariables(collection, envVars) {
  if (!collection.variable) {
    collection.variable = [];
  }

  for (const [key, value] of Object.entries(envVars)) {
    collection.variable.push({
      key,
      value,
      type: 'string'
    });
  }

  return collection;
}

/**
 * Count total items (endpoints) in collection
 */
function countItems(items, count = 0) {
  for (const item of items) {
    if (item.item) {
      count = countItems(item.item, count);
    } else {
      count++;
    }
  }
  return count;
}

// Run conversion
convert();

module.exports = { convert };
