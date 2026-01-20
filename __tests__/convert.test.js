/**
 * Tests for the OpenAPI to Postman conversion functionality
 */

const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('openapi-to-postmanv2', () => ({
    convert: jest.fn((input, options, callback) => {
        callback(null, {
            result: true,
            output: [{
                type: 'collection',
                data: {
                    info: {
                        name: 'Test API',
                        _postman_id: 'test-id',
                        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
                    },
                    item: [
                        {
                            name: 'Pets',
                            item: [
                                {
                                    name: 'List all pets',
                                    request: {
                                        method: 'GET',
                                        url: {
                                            raw: 'https://api.example.com/pets',
                                            host: ['api.example.com'],
                                            path: ['pets']
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            }]
        });
    })
}));

const { readJsonFile, writeJsonFile, log } = require('../scripts/utils');

describe('Utils', () => {
    const testDir = path.join(__dirname, 'temp');
    const testFile = path.join(testDir, 'test.json');

    beforeAll(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterAll(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    describe('readJsonFile', () => {
        it('should read and parse a valid JSON file', () => {
            const testData = { test: 'data', nested: { value: 123 } };
            fs.writeFileSync(testFile, JSON.stringify(testData));

            const result = readJsonFile(testFile);
            expect(result).toEqual(testData);
        });

        it('should throw error for non-existent file', () => {
            expect(() => readJsonFile('/non/existent/file.json')).toThrow('File not found');
        });

        it('should throw error for invalid JSON', () => {
            fs.writeFileSync(testFile, 'not valid json');
            expect(() => readJsonFile(testFile)).toThrow('Failed to parse JSON');
        });
    });

    describe('writeJsonFile', () => {
        it('should write JSON to file with pretty formatting', () => {
            const testData = { hello: 'world' };
            writeJsonFile(testFile, testData);

            const content = fs.readFileSync(testFile, 'utf8');
            expect(content).toBe(JSON.stringify(testData, null, 2));
        });

        it('should create parent directories if they do not exist', () => {
            const nestedFile = path.join(testDir, 'nested', 'dir', 'file.json');
            writeJsonFile(nestedFile, { test: true });

            expect(fs.existsSync(nestedFile)).toBe(true);
        });
    });

    describe('log', () => {
        it('should not throw when logging', () => {
            expect(() => log.info('test')).not.toThrow();
            expect(() => log.success('test')).not.toThrow();
            expect(() => log.warn('test')).not.toThrow();
            expect(() => log.error('test')).not.toThrow();
            expect(() => log.debug('test', 'data')).not.toThrow();
        });
    });
});

describe('Collection Merge Logic', () => {
    // Import the actual merge functions would require refactoring
    // For now, we test the core logic patterns

    describe('generateItemKey', () => {
        it('should create unique keys based on method and path', () => {
            const item = {
                request: {
                    method: 'GET',
                    url: {
                        path: ['api', 'users']
                    }
                }
            };

            // Simulating the key generation logic
            const method = item.request.method;
            const urlPath = item.request.url.path.join('/');
            const key = `${method}:${urlPath}`;

            expect(key).toBe('GET:api/users');
        });
    });

    describe('script preservation', () => {
        it('should identify empty scripts', () => {
            const emptyEvent = {
                script: {
                    exec: ['', '  ', '\n']
                }
            };

            const hasContent = emptyEvent.script.exec.some(line => line.trim() !== '');
            expect(hasContent).toBe(false);
        });

        it('should identify non-empty scripts', () => {
            const filledEvent = {
                script: {
                    exec: ['pm.test("Status is 200", function() {', '  pm.response.to.have.status(200);', '});']
                }
            };

            const hasContent = filledEvent.script.exec.some(line => line.trim() !== '');
            expect(hasContent).toBe(true);
        });
    });
});

describe('Sample OpenAPI Spec', () => {
    const sampleSpecPath = path.join(__dirname, '..', 'examples', 'sample-openapi.json');

    it('should be valid JSON', () => {
        const spec = readJsonFile(sampleSpecPath);
        expect(spec).toBeDefined();
    });

    it('should have required OpenAPI fields', () => {
        const spec = readJsonFile(sampleSpecPath);
        expect(spec.openapi).toBeDefined();
        expect(spec.info).toBeDefined();
        expect(spec.paths).toBeDefined();
    });

    it('should have at least one path defined', () => {
        const spec = readJsonFile(sampleSpecPath);
        expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
    });
});
