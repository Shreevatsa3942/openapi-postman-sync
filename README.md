# OpenAPI to Postman Collection Sync

Automate Postman collection updates from OpenAPI specifications in your CI/CD pipeline. This tool helps teams keep their Postman collections synchronized with Spring Boot (or any OpenAPI-generating) services.

## 🎯 Problem Solved

- **No more manual JSON edits** - Collections update automatically when APIs change
- **Preserves custom scripts** - Your pre-request scripts and tests survive updates
- **Seamless CI/CD integration** - Works with GitHub Actions, Jenkins, GitLab CI, etc.
- **Team-wide sync** - Everyone gets the latest APIs without manual imports

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_ORG/openapi-postman-sync.git
cd openapi-postman-sync

# Install dependencies
npm install
```

### Basic Usage

```bash
# Convert an OpenAPI spec to Postman collection
npm run convert -- --input ./my-api.json --output ./collection.json

# Merge with existing collection (preserving custom scripts)
npm run merge -- --new ./new-collection.json --existing ./old-collection.json
```

## 📖 Documentation

### Convert Command

Converts an OpenAPI specification to a Postman collection.

```bash
npm run convert -- [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-i, --input <path>` | OpenAPI spec file or URL (required) | - |
| `-o, --output <path>` | Output Postman collection path | `postman-collection.json` |
| `-n, --name <name>` | Collection name | OpenAPI title |
| `--folder-strategy <type>` | Organization: `tags` or `paths` | `tags` |
| `--base-url <url>` | Override base URL | From spec |
| `--env-file <path>` | Environment variables JSON | - |
| `-v, --verbose` | Verbose output | `false` |

**Examples:**

```bash
# From local file
npm run convert -- -i ./openapi.json -o ./my-collection.json

# From URL
npm run convert -- -i https://api.example.com/v3/api-docs -o ./collection.json

# With custom name and base URL
npm run convert -- -i ./spec.json -n "My API" --base-url "{{baseUrl}}"
```

### Merge Command

Merges a newly generated collection with an existing one, preserving custom scripts.

```bash
npm run merge -- [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `-n, --new <path>` | Newly generated collection (required) | - |
| `-e, --existing <path>` | Existing collection (required) | - |
| `-o, --output <path>` | Output path | Same as existing |
| `--preserve-tests` | Keep test scripts | `true` |
| `--preserve-prerequest` | Keep pre-request scripts | `true` |
| `--preserve-variables` | Keep collection variables | `true` |
| `--dry-run` | Show changes without writing | `false` |
| `-v, --verbose` | Verbose output | `false` |

**Examples:**

```bash
# Merge collections
npm run merge -- -n ./new.json -e ./existing.json -o ./merged.json

# Preview changes without modifying files
npm run merge -- -n ./new.json -e ./existing.json --dry-run -v
```

## 🔧 CI/CD Integration

### Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  Spring Boot Repo   │     │   This Tool      │     │  Postman Collection │
│  (API Source)       │────▶│   (Converter)    │────▶│  Repo               │
└─────────────────────┘     └──────────────────┘     └─────────────────────┘
         │                                                     │
         │ On push to main                                    │ Auto-PR created
         ▼                                                     ▼
   Generate OpenAPI                                     Collection updated
```

### Setup Instructions

#### Step 1: Add OpenAPI generation to your Spring Boot service

1. Add springdoc-openapi dependency (see `examples/spring-boot/pom.xml`)
2. Configure OpenAPI settings (see `examples/spring-boot/application.yml`)
3. Copy `workflows/generate-openapi.yml` to `.github/workflows/` in your service repo

#### Step 2: Setup your Postman collection repository

1. Fork/clone this tool to your org
2. Copy `workflows/update-collection.yml` to `.github/workflows/` in your Postman repo
3. Configure the repository secrets (see below)

#### Step 3: Configure GitHub secrets

In your **Spring Boot service repo**, add:
- `POSTMAN_REPO_TOKEN`: Personal Access Token with repo access

In your **Postman collection repo**, add:
- `GITHUB_TOKEN`: Automatically available

### Workflow Customization

Edit the workflow files to customize:

- **Service name**: Change `SERVICE_NAME` in generate-openapi.yml
- **Collection repo**: Change `POSTMAN_COLLECTION_REPO` in generate-openapi.yml
- **Auto-merge**: Set `AUTO_MERGE: true` in update-collection.yml
- **Reviewers**: Add usernames in the `reviewers` section

## 🏗️ Spring Boot Configuration

### Using springdoc-openapi (Recommended)

Add to your `pom.xml`:

```xml
<dependency>
    <groupId>org.springdoc</groupId>
    <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
    <version>2.3.0</version>
</dependency>
```

Add to your `application.yml`:

```yaml
springdoc:
  api-docs:
    enabled: true
    path: /v3/api-docs
  swagger-ui:
    enabled: true
    path: /swagger-ui.html
```

### Adding API Documentation to Controllers

```java
@RestController
@RequestMapping("/api/users")
@Tag(name = "Users", description = "User management operations")
public class UserController {

    @Operation(summary = "Get user by ID", description = "Returns a single user")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "User found"),
        @ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/{id}")
    public User getUser(@PathVariable @Parameter(description = "User ID") Long id) {
        // ...
    }
}
```

## 📁 Project Structure

```
openapi-postman-sync/
├── scripts/
│   ├── convert.js           # OpenAPI to Postman conversion
│   ├── merge-collections.js # Merge with script preservation
│   └── utils.js             # Utility functions
├── workflows/
│   ├── generate-openapi.yml # For Spring Boot repos
│   └── update-collection.yml # For Postman collection repo
├── examples/
│   ├── spring-boot/
│   │   ├── pom.xml          # Maven config example
│   │   └── application.yml  # SpringDoc config
│   └── sample-openapi.json  # Test OpenAPI spec
├── __tests__/
│   └── convert.test.js      # Unit tests
├── package.json
└── README.md
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Test conversion with sample spec
npm run convert -- -i examples/sample-openapi.json -o test-output.json
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `npm test`
5. Commit: `git commit -am 'Add my feature'`
6. Push: `git push origin feature/my-feature`
7. Create a Pull Request

## 📝 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙋 FAQ

### How do I preserve my custom test scripts?

The merge command automatically preserves test scripts and pre-request scripts from your existing collection. Just use:

```bash
npm run merge -- -n new.json -e existing.json --preserve-tests --preserve-prerequest
```

### Can I use this with Swagger 2.0?

Yes! The tool supports both Swagger 2.0 and OpenAPI 3.x specifications.

### What if multiple services update the collection at the same time?

Each service creates its own PR. GitHub will handle merge conflicts as with any other PR. Consider organizing collections by service (one file per service) to minimize conflicts.

### Can I sync directly to Postman cloud?

This tool focuses on git-based workflows. For direct Postman cloud sync, you would need to use the Postman API (requires Team/Enterprise plan).
