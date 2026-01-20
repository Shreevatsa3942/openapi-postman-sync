#!/usr/bin/env node

/**
 * Postman Collection Merger
 * 
 * Intelligently merges a newly generated collection with an existing one,
 * preserving custom scripts (pre-request scripts, tests), while updating
 * endpoint definitions from the new OpenAPI spec.
 */

const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const _ = require('lodash');
const chalk = require('chalk');
const { readJsonFile, writeJsonFile, log } = require('./utils');

// CLI Configuration
program
    .name('merge-collections')
    .description('Merge Postman collections while preserving custom scripts')
    .version('1.0.0')
    .requiredOption('-n, --new <path>', 'Newly generated collection file path')
    .requiredOption('-e, --existing <path>', 'Existing collection file path')
    .option('-o, --output <path>', 'Output merged collection file path')
    .option('--preserve-tests', 'Preserve test scripts from existing collection', true)
    .option('--preserve-prerequest', 'Preserve pre-request scripts from existing collection', true)
    .option('--preserve-variables', 'Preserve collection variables from existing', true)
    .option('--dry-run', 'Show changes without writing output', false)
    .option('-v, --verbose', 'Enable verbose logging', false);

program.parse();

const options = program.opts();

/**
 * Main merge function
 */
async function merge() {
    try {
        log.info('Starting collection merge...');

        // Load collections
        const newCollectionPath = path.resolve(options.new);
        const existingCollectionPath = path.resolve(options.existing);

        if (!fs.existsSync(newCollectionPath)) {
            throw new Error(`New collection file not found: ${newCollectionPath}`);
        }

        if (!fs.existsSync(existingCollectionPath)) {
            log.warn(`Existing collection not found. Using new collection as-is.`);
            const newCollection = readJsonFile(newCollectionPath);
            const outputPath = options.output ? path.resolve(options.output) : existingCollectionPath;

            if (!options.dryRun) {
                writeJsonFile(outputPath, newCollection);
            }
            return newCollection;
        }

        const newCollection = readJsonFile(newCollectionPath);
        const existingCollection = readJsonFile(existingCollectionPath);

        log.info(`New collection: ${newCollection.info.name}`);
        log.info(`Existing collection: ${existingCollection.info.name}`);

        // Create a map of existing items by their path/name for quick lookup
        const existingItemsMap = buildItemsMap(existingCollection.item);

        if (options.verbose) {
            log.debug(`Found ${Object.keys(existingItemsMap).length} existing endpoints`);
        }

        // Merge items
        const mergedItems = mergeItems(newCollection.item, existingItemsMap, '');

        // Build merged collection
        const mergedCollection = {
            ...newCollection,
            info: {
                ...newCollection.info,
                // Preserve the existing collection ID for Postman sync
                _postman_id: existingCollection.info._postman_id || newCollection.info._postman_id
            },
            item: mergedItems
        };

        // Preserve collection-level scripts
        if (options.preservePrerequest && existingCollection.event) {
            const existingPreRequest = existingCollection.event.find(e => e.listen === 'prerequest');
            if (existingPreRequest) {
                if (!mergedCollection.event) mergedCollection.event = [];
                const newPreRequest = mergedCollection.event.find(e => e.listen === 'prerequest');
                if (!newPreRequest) {
                    mergedCollection.event.push(existingPreRequest);
                    log.info('Preserved collection-level pre-request script');
                }
            }
        }

        if (options.preserveTests && existingCollection.event) {
            const existingTest = existingCollection.event.find(e => e.listen === 'test');
            if (existingTest) {
                if (!mergedCollection.event) mergedCollection.event = [];
                const newTest = mergedCollection.event.find(e => e.listen === 'test');
                if (!newTest) {
                    mergedCollection.event.push(existingTest);
                    log.info('Preserved collection-level test script');
                }
            }
        }

        // Preserve collection variables
        if (options.preserveVariables && existingCollection.variable) {
            const existingVarKeys = new Set(existingCollection.variable.map(v => v.key));
            const newVarKeys = new Set((newCollection.variable || []).map(v => v.key));

            if (!mergedCollection.variable) mergedCollection.variable = [];

            // Add existing variables that aren't in the new collection
            for (const variable of existingCollection.variable) {
                if (!newVarKeys.has(variable.key)) {
                    mergedCollection.variable.push(variable);
                    if (options.verbose) {
                        log.debug(`Preserved variable: ${variable.key}`);
                    }
                }
            }
        }

        // Calculate and display diff
        const diff = calculateDiff(existingCollection, mergedCollection);
        displayDiff(diff);

        // Write output
        if (!options.dryRun) {
            const outputPath = options.output ? path.resolve(options.output) : existingCollectionPath;
            writeJsonFile(outputPath, mergedCollection);
            log.success(`✓ Merged collection written to: ${outputPath}`);
        } else {
            log.info('Dry run - no files written');
        }

        return mergedCollection;

    } catch (error) {
        log.error(`Merge failed: ${error.message}`);
        if (options.verbose) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

/**
 * Build a map of items by their unique path
 */
function buildItemsMap(items, parentPath = '', map = {}) {
    for (const item of items) {
        const itemPath = parentPath ? `${parentPath}/${item.name}` : item.name;

        if (item.item) {
            // It's a folder, recurse
            buildItemsMap(item.item, itemPath, map);
        } else {
            // It's a request
            const key = generateItemKey(item, itemPath);
            map[key] = { item, path: itemPath };
        }
    }

    return map;
}

/**
 * Generate a unique key for an item based on method + path
 */
function generateItemKey(item, itemPath) {
    if (item.request) {
        const method = typeof item.request.method === 'string'
            ? item.request.method
            : 'GET';

        let urlPath = '';
        if (item.request.url) {
            if (typeof item.request.url === 'string') {
                urlPath = item.request.url;
            } else if (item.request.url.path) {
                urlPath = Array.isArray(item.request.url.path)
                    ? item.request.url.path.join('/')
                    : item.request.url.path;
            }
        }

        return `${method}:${urlPath}`;
    }

    return itemPath;
}

/**
 * Merge items from new collection with existing items
 */
function mergeItems(newItems, existingItemsMap, parentPath) {
    return newItems.map(newItem => {
        const itemPath = parentPath ? `${parentPath}/${newItem.name}` : newItem.name;

        if (newItem.item) {
            // It's a folder, recurse
            return {
                ...newItem,
                item: mergeItems(newItem.item, existingItemsMap, itemPath)
            };
        } else {
            // It's a request, try to find matching existing item
            const key = generateItemKey(newItem, itemPath);
            const existing = existingItemsMap[key];

            if (existing) {
                return mergeRequest(newItem, existing.item);
            }

            return newItem;
        }
    });
}

/**
 * Merge a single request, preserving scripts from existing
 */
function mergeRequest(newRequest, existingRequest) {
    const merged = _.cloneDeep(newRequest);

    // Preserve events (pre-request scripts and tests)
    if (existingRequest.event && existingRequest.event.length > 0) {
        if (!merged.event) merged.event = [];

        for (const existingEvent of existingRequest.event) {
            const hasScript = existingEvent.script &&
                existingEvent.script.exec &&
                existingEvent.script.exec.length > 0 &&
                existingEvent.script.exec.some(line => line.trim() !== '');

            if (hasScript) {
                // Check if new request already has this event type
                const existingEventIndex = merged.event.findIndex(e => e.listen === existingEvent.listen);

                if (existingEventIndex === -1) {
                    // Add the existing event
                    merged.event.push(existingEvent);
                } else if (!hasNonEmptyScript(merged.event[existingEventIndex])) {
                    // Replace empty script with existing one
                    merged.event[existingEventIndex] = existingEvent;
                }
            }
        }
    }

    return merged;
}

/**
 * Check if an event has a non-empty script
 */
function hasNonEmptyScript(event) {
    return event.script &&
        event.script.exec &&
        event.script.exec.length > 0 &&
        event.script.exec.some(line => line.trim() !== '');
}

/**
 * Calculate diff between collections
 */
function calculateDiff(existingCollection, mergedCollection) {
    const existingEndpoints = new Set();
    const mergedEndpoints = new Set();

    const collectEndpoints = (items, set, prefix = '') => {
        for (const item of items) {
            if (item.item) {
                collectEndpoints(item.item, set, prefix + item.name + '/');
            } else {
                set.add(prefix + item.name);
            }
        }
    };

    collectEndpoints(existingCollection.item, existingEndpoints);
    collectEndpoints(mergedCollection.item, mergedEndpoints);

    return {
        added: [...mergedEndpoints].filter(e => !existingEndpoints.has(e)),
        removed: [...existingEndpoints].filter(e => !mergedEndpoints.has(e)),
        preserved: [...mergedEndpoints].filter(e => existingEndpoints.has(e))
    };
}

/**
 * Display diff summary
 */
function displayDiff(diff) {
    console.log('');
    log.info('=== Merge Summary ===');

    if (diff.added.length > 0) {
        console.log(chalk.green(`\n+ Added (${diff.added.length}):`));
        diff.added.forEach(e => console.log(chalk.green(`  + ${e}`)));
    }

    if (diff.removed.length > 0) {
        console.log(chalk.red(`\n- Removed (${diff.removed.length}):`));
        diff.removed.forEach(e => console.log(chalk.red(`  - ${e}`)));
    }

    if (diff.preserved.length > 0) {
        console.log(chalk.blue(`\n○ Preserved (${diff.preserved.length}):`));
        if (options.verbose) {
            diff.preserved.forEach(e => console.log(chalk.blue(`  ○ ${e}`)));
        } else {
            console.log(chalk.gray(`  (use --verbose to see all)`));
        }
    }

    console.log('');
}

// Run merge
merge();

module.exports = { merge };
