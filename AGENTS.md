# AGENTS.md

## Purpose

This repository is designed for:

* Next.js App Router
* Long-term maintainability
* AI-assisted development
* Local LLM coding agents
* Predictable architecture
* Small focused files
* Scalable feature growth

All code changes should follow these rules unless explicitly instructed otherwise.

---

# Repository Root Rules

## Assume Current Directory Is The Project Root

Unless explicitly instructed otherwise:

* Assume the current working directory is already the repository root.
* Never create an additional top-level project folder.
* Never nest a repository inside itself.

Forbidden:

project/
└── project/

Forbidden:

project/
└── my-app/

Preferred:

project/
├── package.json
├── src/
├── AGENTS.md
└── README.md

---

## Next.js Initialization

When initializing Next.js:

If already inside the intended project directory:

Use:

npx create-next-app@latest .

Never:

npx create-next-app@latest project-name

Always inspect the current directory before initialization.

---

## File Creation

Create files relative to the repository root.

Correct:

src/features/auth/components/login-form.tsx

Incorrect:

project/src/features/auth/components/login-form.tsx

when already inside the repository root.

---

# Architecture Principles

## 1. Small Files First

Target file sizes:

* Components: ≤ 150 lines
* Hooks: ≤ 120 lines
* Services: ≤ 150 lines
* Actions: ≤ 100 lines
* API Routes: ≤ 100 lines
* Utility Files: ≤ 100 lines

Hard limit:

* No file should exceed 300 lines.

When approaching limits:

* Extract components
* Extract hooks
* Extract services
* Extract schemas
* Extract constants
* Extract helpers

Never continue growing large files.

---

## 2. Single Responsibility

Each file should have one clear responsibility.

Good:

user-card.tsx

use-user.ts

user.service.ts

user.schema.ts

Bad:

dashboard.tsx containing:

* forms
* tables
* dialogs
* fetching
* business logic

---

## 3. Feature-Based Organization

Organize by business domain.

Preferred:

src/
├── features/
│   ├── auth/
│   ├── users/
│   ├── billing/
│   └── dashboard/

Avoid large global folders:

src/
├── components/
├── hooks/
├── services/

for application-specific functionality.

---

# Recommended Folder Structure

src/
├── app/
│
├── features/
│   ├── auth/
│   │   ├── actions/
│   │   ├── components/
│   │   ├── constants/
│   │   ├── hooks/
│   │   ├── schemas/
│   │   ├── services/
│   │   ├── types/
│   │   ├── utils/
│   │   └── index.ts
│   │
│   └── users/
│
├── shared/
│   ├── ui/
│   ├── hooks/
│   ├── types/
│   ├── constants/
│   └── utils/
│
├── lib/
│   ├── auth/
│   ├── db/
│   ├── api/
│   └── validations/
│
├── config/
│
└── middleware.ts

---

# App Router Rules

Prefer:

* Server Components
* Server Actions
* Route Handlers

Before:

* Client Components
* Context
* Global State

Default assumption:

Everything is a Server Component unless interaction requires otherwise.

---

# Component Rules

## Keep Components Small

If JSX becomes difficult to scan:

Split immediately.

Example:

DashboardPage

Should become:

DashboardHeader

DashboardStats

DashboardFilters

DashboardTable

DashboardActions

---

## Component Responsibilities

Components should:

* Render UI
* Handle presentation concerns

Components should not:

* Perform database operations
* Contain large business logic
* Validate complex data
* Manage unrelated state

---

# Hooks Rules

Hooks should encapsulate behavior.

Examples:

use-pagination.ts

use-user-filter.ts

use-debounce.ts

Avoid:

use-dashboard-everything.ts

A hook should solve one problem.

---

# Service Layer Rules

Business logic belongs in services.

Example:

features/users/services/user.service.ts

UI components should never directly:

* Query databases
* Call ORMs
* Call third-party APIs
* Execute business rules

Instead:

UI → Action → Service

---

# Server Actions

Place actions near features.

Example:

features/users/actions/

create-user.ts

update-user.ts

delete-user.ts

Never create:

user.actions.ts

containing dozens of actions.

---

# Validation Rules

Use Zod.

Structure:

features/users/schemas/

create-user.schema.ts

update-user.schema.ts

Validation must not live inside components.

---

# Type Rules

Feature-specific types:

features/users/types/

Shared types:

shared/types/

Avoid:

types.ts

global-types.ts

massive type files

---

# Constants Rules

Keep constants close to features.

Good:

features/users/constants/user-roles.ts

Avoid:

shared/constants/everything.ts

---

# Utility Rules

Never create:

utils.ts

helpers.ts

common.ts

misc.ts

Instead:

format-date.ts

calculate-tax.ts

normalize-user.ts

One utility per concern.

---

# Import Rules

Use path aliases.

Preferred:

import { UserCard } from "@/features/users"

Avoid:

../../../../components/user-card

---

# Barrel Export Rules

Each feature should expose a clean public API.

Example:

features/users/index.ts

export * from "./components/user-card"
export * from "./hooks/use-user"
export * from "./services/user.service"

Consumers should import from the feature root whenever practical.

---

# State Management

Preferred order:

1. Server Components
2. URL Search Params
3. Local State
4. Context
5. Global Store

Do not introduce:

* Redux
* Zustand
* Jotai
* Context

without a clear need.

---

# API Route Rules

Route handlers should remain thin.

Allowed:

* Authentication
* Validation
* Service calls
* Response formatting

Not allowed:

* Large business logic
* Complex workflows

Move complexity into services.

---

# Naming Conventions

Components:

user-card.tsx

Hooks:

use-user.ts

Services:

user.service.ts

Schemas:

user.schema.ts

Types:

user.types.ts

Constants:

user.constants.ts

Actions:

create-user.ts

Route handlers:

route.ts

Use kebab-case for files.

---

# Refactoring Triggers

Refactor immediately when:

* File > 300 lines
* Component > 150 lines
* Hook > 120 lines
* Function > 50 lines
* More than 3 nested conditions
* More than 3 responsibilities

Do not continue adding code.

Refactor first.

---

# AI Agent Workflow

Before creating code:

1. Search existing feature folders.
2. Reuse existing components.
3. Reuse shared UI.
4. Reuse services.
5. Reuse schemas.
6. Reuse types.
7. Reuse hooks.

Before creating a new file:

Ask:

"Can this existing module be extended safely?"

Avoid duplication.

---

# AI Agent Editing Rules

Prefer:

* Creating small focused files
* Extracting logic
* Incremental edits

Avoid:

* Rewriting entire files
* Massive refactors
* Touching unrelated code

---

# Local LLM Optimization Rules

Optimize for limited context windows.

Preferred:

20 files × 50 lines

instead of:

1 file × 1000 lines

Keep modules highly focused.

Minimize cross-feature dependencies.

Avoid giant files at all costs.

---

# Testing Structure

Place tests near implementation.

Example:

users/

components/
services/

**tests**/

user.service.test.ts

Avoid centralized test folders for feature code.

---

# Forbidden Patterns

Never create:

utils.ts

helper.ts

helpers.ts

common.ts

misc.ts

god-component.tsx

mega-hook.ts

500+ line files

1000+ line files

Do not place unrelated logic in shared folders.

Do not duplicate business logic across features.

---

# Decision Priority

When unsure:

1. Keep files small.
2. Keep responsibilities isolated.
3. Organize by feature.
4. Reuse existing code.
5. Prefer composition.
6. Prefer server-side solutions.
7. Optimize for maintainability.
8. Optimize for AI-assisted development.

Small files and clear boundaries are always preferred over convenience.
