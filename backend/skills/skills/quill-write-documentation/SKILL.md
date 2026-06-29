# Skill: Write API Documentation

**Agent:** QUILL (Writing & Communication)  
**Category:** Technical Writing  
**Complexity:** Intermediate  
**Estimated Time:** 1.8-2.5 seconds  
**Success Rate Target:** 90%+

---

## Purpose
Generates comprehensive API documentation with:
- Getting started guide
- Complete endpoint reference
- Request/response examples
- Error handling guide
- Authentication explanation
- Code samples (multiple languages)
- Troubleshooting section

---

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| apiSchema | object/string | yes | OpenAPI spec or API structure |
| apiName | string | yes | Name of the API (e.g., "User Service API") |
| baseUrl | string | yes | API base URL |
| tone | string | no | professional, friendly, technical (default: professional) |
| includeExamples | boolean | no | Include code examples (default: true) |
| languages | array | no | Code languages (JavaScript, Python, cURL) |
| audience | string | no | developers, non-technical, enterprise |

---

## Steps

### Step 1: Structure Documentation
- Create table of contents
- Outline main sections
- Plan code examples
- Define navigation structure

### Step 2: Write Introduction
- Explain API purpose and benefits
- List key features
- Define authentication requirements
- Provide quick start example

### Step 3: Document Endpoints
- List all endpoints with descriptions
- Document parameters for each
- Show request/response examples
- Add curl, JavaScript, Python examples
- Document error codes

### Step 4: Add Authentication Guide
- Explain auth flow
- Provide token generation example
- Show token refresh mechanism
- Security best practices

### Step 5: Create Examples & Tutorials
- Real-world usage scenarios
- Step-by-step walkthroughs
- Common patterns
- Performance tips

### Step 6: Write Reference Sections
- Complete parameter reference
- Error code reference
- Status code explanations
- Troubleshooting FAQs

---

## Outputs

```javascript
{
  "documentation": "// Complete Markdown documentation",
  "quickStart": "// Quick start guide (5 min)",
  "apiReference": "// Complete API reference",
  "codeExamples": "// Multi-language code samples",
  "troubleshooting": "// FAQ and troubleshooting",
  "htmlVersion": "// HTML-rendered version",
  "metadata": "// Doc metadata (version, updated date)"
}
```

---

## Success Criteria
✓ All endpoints documented  
✓ Examples are correct and runnable  
✓ Text is clear and concise  
✓ Consistent formatting throughout  
✓ Code samples follow best practices  
✓ Troubleshooting covers common issues  
✓ Well-organized table of contents

---

## Common Failures & Recovery
- **Missing endpoint:** Prompt for schema update
- **Example code errors:** Auto-test and fix
- **Unclear wording:** Refactor for clarity
- **Inconsistent formatting:** Standardize markdown

---

## Quality Metrics
- Reading level: Grade 10-12 (technical audience)
- Code example coverage: 100% of endpoints
- Completeness: All parameters documented
- Accuracy: Examples tested and verified

---

## Performance Notes
- Documentation generation: 2.1 seconds average
- Markdown file size: 40-80KB
- HTML render time: <200ms
- Search indexing: Full-text searchable

