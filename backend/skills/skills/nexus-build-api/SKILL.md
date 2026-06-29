# Skill: Build REST API with Authentication

**Agent:** NEXUS (Technical Architect)  
**Category:** Backend Development  
**Complexity:** Advanced  
**Estimated Time:** 2-3 seconds  
**Success Rate Target:** 95%+

---

## Purpose
Generates a complete, production-ready REST API with:
- Express.js server with modular structure
- Database integration (PostgreSQL/MongoDB)
- Authentication (JWT/OAuth)
- Input validation & error handling
- Comprehensive test suite
- API documentation

---

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| framework | string | yes | Express, Fastify, or Koa |
| authType | string | yes | JWT, OAuth2, or Session |
| database | string | yes | PostgreSQL, MongoDB, or SQLite |
| entities | array | no | Data entities (User, Post, Comment) |
| withTests | boolean | no | Include test suite (default: true) |
| withDocs | boolean | no | Include OpenAPI docs (default: true) |

---

## Steps

### Step 1: Initialize Project Structure
- Create package.json with dependencies
- Set up .env.example
- Initialize git repository
- Create folder structure (src/routes, src/models, src/middleware, tests/)

### Step 2: Setup Authentication
- Implement auth middleware
- Add JWT token generation/validation
- Create user authentication endpoints
- Add refresh token mechanism

### Step 3: Create Database Models
- Design schema based on entities
- Create model files with validation
- Set up migration system
- Add indexes for performance

### Step 4: Build API Routes
- Create CRUD endpoints for each entity
- Implement pagination and filtering
- Add error handling middleware
- Return proper HTTP status codes

### Step 5: Write Tests
- Unit tests for models
- Integration tests for endpoints
- Security tests for auth
- Achieve 80%+ coverage

### Step 6: Generate Documentation
- Create OpenAPI/Swagger spec
- Generate HTML docs
- Add usage examples
- Document authentication flow

---

## Outputs

```javascript
{
  "apiCode": "// Complete express server code",
  "models": "// Database models",
  "routes": "// API route handlers",
  "middleware": "// Auth and validation middleware",
  "tests": "// Complete test suite",
  "documentation": "// API documentation in Markdown",
  "packageJson": "// Dependencies list"
}
```

---

## Success Criteria
✓ Server starts without errors  
✓ All endpoints respond correctly  
✓ Authentication works as expected  
✓ Database queries execute properly  
✓ Tests pass (80%+ coverage)  
✓ Documentation is complete and clear

---

## Common Failures & Recovery
- **Missing dependencies:** Auto-add to package.json
- **Port already in use:** Use alternate port
- **Database connection error:** Provide connection string
- **Auth token invalid:** Regenerate with correct secret

---

## Performance Notes
- Typical execution: 2,100ms
- Memory usage: ~45MB for server startup
- Database queries: <100ms
- Auth validation: <10ms per request

