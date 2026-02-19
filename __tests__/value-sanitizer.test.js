/**
 * Tests for the Value Sanitizer module
 */

const {
    sanitizeCollection,
    resolveValue,
    isRandomValue,
    buildSchemaMap,
    findFieldSchema,
    buildEndpointKey,
    FORMAT_DEFAULTS,
    FIELD_NAME_DEFAULTS,
} = require('../scripts/value-sanitizer');

// ─── isRandomValue ────────────────────────────────────────────────────────────

describe('isRandomValue', () => {
    it('should detect lorem-ipsum style text', () => {
        expect(isRandomValue('ut labore sint tempor')).toBe(true);
        expect(isRandomValue('Duis nulla')).toBe(true);
        expect(isRandomValue('aliquip')).toBe(true);
        expect(isRandomValue('lorem ipsum dolor sit amet')).toBe(true);
    });

    it('should detect random email addresses', () => {
        expect(isRandomValue('xhWusLJP6pS@dtZnVkyxTktuLkmofguN.jrxq')).toBe(true);
        expect(isRandomValue('9ZcGNifob9M@uyoD.ugb')).toBe(true);
    });

    it('should detect old random dates', () => {
        expect(isRandomValue('1959-10-25T17:44:56.486Z')).toBe(true);
        expect(isRandomValue('1966-07-04T19:09:56.846Z')).toBe(true);
        expect(isRandomValue('1987-08-24T13:51:37.821Z')).toBe(true);
    });

    it('should detect urn:uuid format', () => {
        expect(isRandomValue('urn:uuid:36a23258-2561-a45b-0feb-223506c7ee66')).toBe(true);
    });

    it('should detect unreasonably large integers', () => {
        expect(isRandomValue(78171233)).toBe(true);
        expect(isRandomValue(-50000000)).toBe(true);
    });

    it('should NOT flag valid/normal values', () => {
        expect(isRandomValue('Buddy')).toBe(false);
        expect(isRandomValue('dog')).toBe(false);
        expect(isRandomValue(3)).toBe(false);
        expect(isRandomValue(25)).toBe(false);
        expect(isRandomValue('user@example.com')).toBe(false);
        expect(isRandomValue('2025-01-15T10:30:00.000Z')).toBe(false);
        expect(isRandomValue('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
        expect(isRandomValue(true)).toBe(false);
        expect(isRandomValue(100)).toBe(false);
    });
});

// ─── resolveValue ─────────────────────────────────────────────────────────────

describe('resolveValue', () => {
    it('should resolve by format (uuid)', () => {
        const result = resolveValue('id', { type: 'string', format: 'uuid' });
        expect(result).toBe(FORMAT_DEFAULTS['uuid']);
    });

    it('should resolve by format (email)', () => {
        const result = resolveValue('contact', { type: 'string', format: 'email' });
        expect(result).toBe('user@example.com');
    });

    it('should resolve by format (date-time)', () => {
        const result = resolveValue('timestamp', { type: 'string', format: 'date-time' });
        expect(result).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should resolve by field name', () => {
        expect(resolveValue('email', {})).toBe('user@example.com');
        expect(resolveValue('age', {})).toBe(25);
        expect(resolveValue('city', {})).toBe('Springfield');
        expect(resolveValue('firstName', {})).toBe('John');
    });

    it('should resolve by field name case-insensitively', () => {
        expect(resolveValue('Email', {})).toBe('user@example.com');
        expect(resolveValue('CITY', {})).toBe('Springfield');
    });

    it('should resolve by field name suffix matching', () => {
        expect(resolveValue('petName', {})).toBe('John Doe');
        expect(resolveValue('userEmail', {})).toBe('user@example.com');
    });

    it('should prefer schema example over heuristics', () => {
        const result = resolveValue('name', { example: 'Buddy' });
        expect(result).toBe('Buddy');
    });

    it('should prefer enum first value', () => {
        const result = resolveValue('status', { enum: ['available', 'pending', 'sold'] });
        expect(result).toBe('available');
    });

    it('should use user-provided field defaults', () => {
        const userMap = { fieldDefaults: { email: 'admin@mycompany.com' } };
        const result = resolveValue('email', {}, userMap);
        expect(result).toBe('admin@mycompany.com');
    });

    it('should use user-provided endpoint overrides', () => {
        const userMap = {
            fieldDefaults: { name: 'Default Name' },
            endpointOverrides: { 'POST:/pets': { name: 'Buddy' } }
        };
        const result = resolveValue('name', {}, userMap, 'POST:/pets');
        expect(result).toBe('Buddy');
    });

    it('should respect integer constraints', () => {
        const result = resolveValue('unknownField', { type: 'integer', minimum: 0, maximum: 100 });
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
    });

    it('should fall back to type defaults', () => {
        const result = resolveValue('unknownField', { type: 'boolean' });
        expect(result).toBe(true);
    });

    it('should return null when no resolution found', () => {
        const result = resolveValue('unknownField', {});
        expect(result).toBeNull();
    });

    it('endpoint override takes priority over field default', () => {
        const userMap = {
            fieldDefaults: { name: 'Default' },
            endpointOverrides: { 'POST:/pets': { name: 'Override' } }
        };
        expect(resolveValue('name', {}, userMap, 'POST:/pets')).toBe('Override');
        expect(resolveValue('name', {}, userMap, 'GET:/users')).toBe('Default');
    });
});

// ─── buildSchemaMap ───────────────────────────────────────────────────────────

describe('buildSchemaMap', () => {
    const spec = {
        components: {
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        name: { type: 'string', example: 'John' },
                        age: { type: 'integer', minimum: 0, maximum: 150 },
                    }
                }
            }
        }
    };

    it('should build a map of schema fields', () => {
        const map = buildSchemaMap(spec);
        expect(map.User).toBeDefined();
        expect(map.User.email.format).toBe('email');
        expect(map.User.id.format).toBe('uuid');
        expect(map.User.age.minimum).toBe(0);
    });

    it('should return empty map for spec without schemas', () => {
        expect(buildSchemaMap({})).toEqual({});
        expect(buildSchemaMap(null)).toEqual({});
        expect(buildSchemaMap({ components: {} })).toEqual({});
    });
});

// ─── findFieldSchema ──────────────────────────────────────────────────────────

describe('findFieldSchema', () => {
    const schemaMap = {
        User: {
            email: { type: 'string', format: 'email' },
            age: { type: 'integer', minimum: 0 }
        },
        Pet: {
            name: { type: 'string', example: 'Buddy' }
        }
    };

    it('should find field schema across all schemas', () => {
        expect(findFieldSchema('email', schemaMap).format).toBe('email');
        expect(findFieldSchema('name', schemaMap).example).toBe('Buddy');
    });

    it('should return null for unknown fields', () => {
        expect(findFieldSchema('unknown', schemaMap)).toBeNull();
    });
});

// ─── buildEndpointKey ─────────────────────────────────────────────────────────

describe('buildEndpointKey', () => {
    it('should build key from method + path', () => {
        const item = {
            request: {
                method: 'POST',
                url: { path: ['pets'] }
            }
        };
        expect(buildEndpointKey(item)).toBe('POST:/pets');
    });

    it('should convert path variables from :var to {var}', () => {
        const item = {
            request: {
                method: 'GET',
                url: { path: ['pets', ':petId'] }
            }
        };
        expect(buildEndpointKey(item)).toBe('GET:/pets/{petId}');
    });
});

// ─── sanitizeCollection (end-to-end) ──────────────────────────────────────────

describe('sanitizeCollection', () => {
    const openApiSpec = {
        components: {
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        email: { type: 'string', format: 'email' },
                        name: { type: 'string' },
                        createdAt: { type: 'string', format: 'date-time' }
                    }
                },
                Pet: {
                    type: 'object',
                    properties: {
                        name: { type: 'string', example: 'Buddy' },
                        age: { type: 'integer', minimum: 0 },
                        status: { type: 'string', enum: ['available', 'pending', 'sold'] }
                    }
                }
            }
        }
    };

    it('should sanitize random values in request body', () => {
        const collection = {
            item: [{
                name: 'Create User',
                request: {
                    method: 'POST',
                    url: { path: ['users'] },
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify({
                            name: 'ut labore sint tempor',
                            email: 'xhWusLJP6pS@dtZnVkyxTktuLkmofguN.jrxq',
                        }, null, 2)
                    }
                }
            }]
        };

        const result = sanitizeCollection(collection, openApiSpec);
        const body = JSON.parse(result.item[0].request.body.raw);
        expect(body.name).not.toBe('ut labore sint tempor');
        expect(body.email).toBe('user@example.com');
    });

    it('should sanitize random values in response bodies', () => {
        const collection = {
            item: [{
                name: 'List Users',
                request: { method: 'GET', url: { path: ['users'] } },
                response: [{
                    body: JSON.stringify([{
                        id: 'urn:uuid:36a23258-2561-a45b-0feb-223506c7ee66',
                        email: '9ZcGNifob9M@uyoD.ugb',
                        name: 'aliquip',
                        createdAt: '1959-10-25T17:44:56.486Z'
                    }], null, 2)
                }]
            }]
        };

        const result = sanitizeCollection(collection, openApiSpec);
        const body = JSON.parse(result.item[0].response[0].body);
        expect(body[0].id).toBe(FORMAT_DEFAULTS['uuid']);
        expect(body[0].email).toBe('user@example.com');
        expect(body[0].name).not.toBe('aliquip');
        expect(body[0].createdAt).toBe('2025-01-15T10:30:00.000Z');
    });

    it('should preserve already-valid values', () => {
        const collection = {
            item: [{
                name: 'Create Pet',
                request: {
                    method: 'POST',
                    url: { path: ['pets'] },
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify({
                            name: 'Buddy',
                            species: 'dog',
                            age: 3
                        }, null, 2)
                    }
                }
            }]
        };

        const result = sanitizeCollection(collection, openApiSpec);
        const body = JSON.parse(result.item[0].request.body.raw);
        expect(body.name).toBe('Buddy');
        expect(body.species).toBe('dog');
        expect(body.age).toBe(3);
    });

    it('should handle nested folder structure', () => {
        const collection = {
            item: [{
                name: 'Users',
                item: [{
                    name: 'Create User',
                    request: {
                        method: 'POST',
                        url: { path: ['users'] },
                        body: {
                            mode: 'raw',
                            raw: JSON.stringify({
                                name: 'Duis nulla',
                                email: '9ZcGNifob9M@uyoD.ugb'
                            }, null, 2)
                        }
                    }
                }]
            }]
        };

        const result = sanitizeCollection(collection, openApiSpec);
        const body = JSON.parse(result.item[0].item[0].request.body.raw);
        expect(body.name).not.toBe('Duis nulla');
        expect(body.email).toBe('user@example.com');
    });

    it('should apply user-provided values map', () => {
        const collection = {
            item: [{
                name: 'Create Pet',
                request: {
                    method: 'POST',
                    url: { path: ['pets'] },
                    body: {
                        mode: 'raw',
                        raw: JSON.stringify({
                            name: 'ut labore sint tempor',
                            age: 78171233
                        }, null, 2)
                    }
                }
            }]
        };

        const userMap = {
            fieldDefaults: { name: 'Custom Pet' },
            endpointOverrides: { 'POST:/pets': { age: 5 } }
        };

        const result = sanitizeCollection(collection, openApiSpec, userMap);
        const body = JSON.parse(result.item[0].request.body.raw);
        expect(body.name).toBe('Custom Pet');
        expect(body.age).toBe(5);
    });

    it('should handle empty collection gracefully', () => {
        expect(sanitizeCollection({}, {})).toEqual({});
        expect(sanitizeCollection(null, {})).toBeNull();
    });

    it('should sanitize path variables with random UUIDs', () => {
        const collection = {
            item: [{
                name: 'Get Pet',
                request: {
                    method: 'GET',
                    url: {
                        path: ['pets', ':petId'],
                        variable: [{
                            key: 'petId',
                            value: 'urn:uuid:36a23258-2561-a45b-0feb-223506c7ee66'
                        }]
                    }
                }
            }]
        };

        const result = sanitizeCollection(collection, openApiSpec);
        expect(result.item[0].request.url.variable[0].value).not.toContain('urn:uuid:');
    });
});
