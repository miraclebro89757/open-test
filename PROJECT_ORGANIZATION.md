# Project Organization Guidelines

## Artifact Storage Structure

This document explains how to organize and store project artifacts while protecting privacy and maintaining clarity.

### Problem Statement

When working on multiple projects, it's important to:
- Keep project artifacts organized and discoverable
- Protect sensitive business information
- Maintain clear separation between different projects
- Store artifacts in a way that's easy to share with team members

### Solution: Visible Folder Next to Requirement Document

All generated artifacts should be stored in a **visible (non-hidden) directory** placed alongside your requirement document.

### Example

```
~/Desktop/
├── Requirement_Document.md
├── SampleProject/              ← Artifact folder (matches project name)
│   ├── design/
│   ├── implementation/
│   ├── reports/
│   ├── test-cases/
│   ├── automation-scripts/
│   └── artifacts/
├── Another_Project_Document.md
├── AnotherProject/             ← Separate artifact folder
│   ├── design/
│   ├── reports/
│   └── ...
└── ...
```

### Key Principles

1. **Visible Directories Only**
   - Use regular folder names, not hidden folders (e.g., `.project`)
   - Ensure artifacts are easily accessible to team members
   - Hidden directories (starting with `.`) should not be used for artifacts

2. **Naming Convention**
   - Folder name should match or relate to the project/product name
   - Use clear, descriptive names
   - Avoid special characters and spaces when possible
   - Examples:
     - ✅ `SampleProject/`
     - ✅ `ProjectNameV1.1/`
     - ✅ `Client_ProjectName/`
     - ❌ `.hidden_project/`
     - ❌ `Project (Draft)/`

3. **Separation of Concerns**
   - Each project gets its own dedicated directory
   - Do not mix artifacts from different projects in one folder
   - Organize subdirectories by function (design, implementation, reports, etc.)

4. **Privacy and Confidentiality**
   - Remove or mask any sensitive business information
   - Do not include real company names, client names, or product details
   - Use generic or placeholder names for public repository examples
   - Store truly confidential projects in private repositories

### Folder Structure Template

```
ProjectName/
├── design/                      # Design documents and specifications
│   ├── architecture.md
│   ├── wireframes/
│   └── technical-specs.md
├── implementation/              # Implementation details
│   ├── codebase/
│   ├── deployment/
│   └── infrastructure/
├── reports/                     # Generated reports
│   ├── test-reports/
│   ├── coverage-reports/
│   └── analysis/
├── test-cases/                  # Test specifications
│   ├── functional-tests/
│   ├── api-tests/
│   └── performance-tests/
├── automation-scripts/          # Recorded and automated scripts
│   ├── ui-automation/
│   ├── api-automation/
│   └── regression-tests/
├── artifacts/                   # Generated outputs
│   ├── logs/
│   ├── screenshots/
│   └── recordings/
└── README.md                    # Project-specific documentation
```

### Privacy Considerations

When sharing your project or using it as a public example:

- **For Public Repositories:**
  - Use generic naming: "SampleProject", "ExampleApp", "DemoService"
  - Replace specific company/product names with placeholders
  - Store real projects in private repositories
  - Document the deidentification process

- **For Private Repositories:**
  - You can use real project and company names
  - Store in private GitHub/GitLab repositories
  - Ensure proper access controls are in place
  - Keep sensitive data out of version control

- **Mixed Scenarios:**
  - Public template + Private implementations
  - Keep the public version generic and reusable
  - Use separate repositories for public and private versions
  - Update documentation to clarify which is which

### Examples of Good vs. Poor Organization

#### ❌ Poor Example

```
~/Desktop/
├── 筑安通V1.1.3需求文档.md        # Company name exposed
├── .project/                      # Hidden directory
│   ├── 筑安通/                     # Real project name
│   └── ...
├── 易讯/                           # Real company name
│   └── files/
```

#### ✅ Good Example (Public)

```
~/Desktop/
├── Requirement_Document.md
├── SampleProject/
│   ├── design/
│   ├── implementation/
│   ├── reports/
│   └── artifacts/
├── README.md                      # Explains this is a sanitized example
```

#### ✅ Good Example (Private)

```
~/Desktop/
├── 筑安通V1.1.3需求文档.md
├── 筑安通/
│   ├── design/
│   ├── implementation/
│   ├── reports/
│   └── artifacts/
```
(Stored in a private repository with proper access controls)

### Migration Guide

If you have existing artifacts in hidden directories, here's how to migrate:

```bash
# 1. Create new visible directory structure
mkdir -p SampleProject/{design,implementation,reports,artifacts}

# 2. Copy existing artifacts
cp -r .project/* SampleProject/

# 3. Verify everything is copied correctly
ls -la SampleProject/

# 4. Commit changes to version control
git add SampleProject/
git rm -r .project
git commit -m "chore: migrate artifacts to visible directory structure"

# 5. Update documentation
# - Update project README with new paths
# - Inform team members of new structure
```

## Best Practices Summary

✅ **DO:**
- Use visible, non-hidden directories
- Name folders to match the project/product
- Organize by function (design, implementation, reports, etc.)
- Keep each project separate and self-contained
- Use generic names for public/example repositories
- Document the artifact structure in a README
- Store private projects in private repositories
- Sanitize public versions of real projects

❌ **DON'T:**
- Use hidden directories for artifacts (`.project`, `.cache`, etc.)
- Mix multiple projects in one folder
- Use special characters or excessive spaces in folder names
- Expose real company/product names in public repositories
- Store sensitive data in version control
- Ignore privacy and confidentiality requirements
- Create ambiguous folder structures

## Questions or Feedback?

If you have questions about this structure or suggestions for improvement, please open an Issue or discuss with your team.
