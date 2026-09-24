/**
 * Demo knowledge base: a small fictional project ("TaskFlow API") so the whole
 * pipeline can be exercised without connecting a real repository.
 * It is ingested through the exact same parse → chunk → embed path as real data
 * and is always labelled as demo content in the UI.
 */
import type { RawFile } from "./parsing";

export const DEMO_SOURCE_NAME = "TaskFlow API (demo)";

export const DEMO_FILES: RawFile[] = [
  {
    file_name: "README.md",
    file_path: "README.md",
    content: `# TaskFlow API

TaskFlow is a small task-management service. It exposes a REST API for projects,
tasks and comments, backed by PostgreSQL.

## Stack

- Python 3.11 + FastAPI
- PostgreSQL 15
- JWT authentication (HS256)
- Deployed as a container behind an nginx reverse proxy

## Running locally

\`\`\`bash
pip install -r requirements.txt
export JWT_SECRET=dev-secret
export DATABASE_URL=postgresql://localhost/taskflow
uvicorn backend.main:app --reload
\`\`\`

## Layout

- \`backend/auth.py\` - authentication and token handling
- \`backend/routes.py\` - HTTP endpoints
- \`backend/db.py\` - database access layer
- \`config/settings.py\` - environment configuration
- \`docs/\` - written documentation
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "authentication.md",
    file_path: "docs/authentication.md",
    content: `# Authentication Flow

TaskFlow uses stateless JWT authentication.

## Issuing tokens

\`POST /api/login\` accepts an email and password. The password is verified
against the bcrypt hash stored in the \`users\` table. On success the service
issues an access token signed with \`JWT_SECRET\` using HS256 and a 60 minute
expiry.

## Validating tokens

Every request to a protected route passes through the authentication
middleware. The middleware reads the \`Authorization: Bearer <token>\` header,
decodes the token and loads the matching user. A missing, malformed, expired or
wrongly-signed token results in HTTP 401.

## Rotation

\`JWT_SECRET\` is read once at process start. Rotating the secret invalidates
every previously issued token, so all clients must sign in again.

## Roles

Roles are stored in the \`user_roles\` table, never on the user record. The
\`require_role\` dependency checks the role before the handler runs and returns
HTTP 403 when the role is missing.
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "api.md",
    file_path: "docs/api.md",
    content: `# API Reference

All endpoints are prefixed with \`/api\` and return JSON.

## POST /api/login

Body: \`{ "email": string, "password": string }\`
Returns: \`{ "access_token": string, "token_type": "bearer" }\`
Errors: 401 when credentials are invalid.

## GET /api/projects

Requires authentication. Returns the projects owned by the caller.

## POST /api/tasks

Requires authentication. Body: \`{ "project_id": uuid, "title": string, "due_at": iso8601 }\`.
Returns 201 with the created task. Returns 422 when \`title\` is empty.

## GET /api/tasks/{task_id}

Requires authentication. Returns 404 when the task does not belong to the caller.

## Rate limits

Unauthenticated requests are limited to 20 requests per minute per IP.
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "database.md",
    file_path: "docs/database.md",
    content: `# Database

PostgreSQL 15. Connections are pooled with a maximum of 10 connections per
worker process; \`DATABASE_URL\` configures the target.

## Tables

- \`users(id, email, password_hash, created_at)\`
- \`user_roles(id, user_id, role)\`
- \`projects(id, owner_id, name, created_at)\`
- \`tasks(id, project_id, title, status, due_at, created_at)\`
- \`comments(id, task_id, author_id, body, created_at)\`

## Migrations

Migrations live in \`migrations/\` and run on container start. A failed
migration aborts the boot sequence, and the container exits with code 1.

## Common issues

Connection pool exhaustion shows up as request timeouts under load. Increase
\`POOL_SIZE\` or reduce long-running transactions.
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "troubleshooting.md",
    file_path: "docs/troubleshooting.md",
    content: `# Troubleshooting

## 401 after deployment

Symptom: \`POST /api/login\` succeeds locally, but every authenticated request
returns 401 in production immediately after a deploy.

Most common causes:

1. \`JWT_SECRET\` differs between the environment that issued the token and the
   environment validating it. Tokens signed with the old secret fail validation
   after a rotation or a missing environment variable.
2. The nginx reverse proxy strips the \`Authorization\` header. Add
   \`proxy_set_header Authorization $http_authorization;\`.
3. Clock skew larger than the token leeway makes fresh tokens look expired.

## 500 on task creation

Usually a failed migration: check that \`tasks.due_at\` exists in the deployed
schema.

## Slow list endpoints

Missing index on \`tasks(project_id)\`. Add it and re-run \`ANALYZE\`.
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "auth.py",
    file_path: "backend/auth.py",
    content: `"""Authentication helpers for TaskFlow."""
import time
import jwt
from fastapi import Depends, HTTPException, Request

from config.settings import settings
from backend.db import get_user_by_email, get_user_by_id, get_roles


def create_access_token(user_id: str) -> str:
    """Sign a short-lived access token for the given user."""
    payload = {
        "sub": user_id,
        "iat": int(time.time()),
        "exp": int(time.time()) + settings.jwt_ttl_seconds,
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def authenticate(email: str, password: str) -> str:
    """Verify credentials and return an access token, or raise 401."""
    user = get_user_by_email(email)
    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return create_access_token(user.id)


def auth_middleware(request: Request):
    """Validate the bearer token on every protected route."""
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = header.split(" ", 1)[1]
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidSignatureError:
        # Raised when JWT_SECRET differs from the secret that signed the token.
        raise HTTPException(status_code=401, detail="Invalid token signature")
    user = get_user_by_id(claims["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user


def require_role(role: str):
    """Dependency factory enforcing a role from the user_roles table."""
    def dependency(user=Depends(auth_middleware)):
        if role not in get_roles(user.id):
            raise HTTPException(status_code=403, detail="Forbidden")
        return user
    return dependency
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "routes.py",
    file_path: "backend/routes.py",
    content: `"""HTTP endpoints for TaskFlow."""
from fastapi import APIRouter, Depends, HTTPException

from backend.auth import authenticate, auth_middleware
from backend.db import list_projects, insert_task, get_task

router = APIRouter(prefix="/api")


@router.post("/login")
def login(body: dict):
    """Exchange email and password for an access token."""
    token = authenticate(body["email"], body["password"])
    return {"access_token": token, "token_type": "bearer"}


@router.get("/projects")
def get_projects(user=Depends(auth_middleware)):
    """Return the projects owned by the authenticated caller."""
    return list_projects(user.id)


@router.post("/tasks", status_code=201)
def create_task(body: dict, user=Depends(auth_middleware)):
    """Create a task inside a project owned by the caller."""
    if not body.get("title"):
        raise HTTPException(status_code=422, detail="title is required")
    return insert_task(user.id, body["project_id"], body["title"], body.get("due_at"))


@router.get("/tasks/{task_id}")
def read_task(task_id: str, user=Depends(auth_middleware)):
    task = get_task(task_id, user.id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "db.py",
    file_path: "backend/db.py",
    content: `"""Database access layer backed by a pooled psycopg connection."""
import psycopg_pool

from config.settings import settings

pool = psycopg_pool.ConnectionPool(settings.database_url, max_size=settings.pool_size)


def query(sql: str, params: tuple = ()):
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            return cur.fetchall()


def get_user_by_email(email: str):
    rows = query("select id, email, password_hash from users where email = %s", (email,))
    return rows[0] if rows else None


def get_user_by_id(user_id: str):
    rows = query("select id, email from users where id = %s", (user_id,))
    return rows[0] if rows else None


def get_roles(user_id: str):
    return [r[0] for r in query("select role from user_roles where user_id = %s", (user_id,))]


def list_projects(owner_id: str):
    return query("select id, name from projects where owner_id = %s", (owner_id,))


def insert_task(user_id: str, project_id: str, title: str, due_at):
    return query(
        "insert into tasks (project_id, title, due_at) values (%s, %s, %s) returning id",
        (project_id, title, due_at),
    )


def get_task(task_id: str, user_id: str):
    rows = query(
        "select t.* from tasks t join projects p on p.id = t.project_id "
        "where t.id = %s and p.owner_id = %s",
        (task_id, user_id),
    )
    return rows[0] if rows else None
`,
    metadata: { source_type: "demo" },
  },
  {
    file_name: "settings.py",
    file_path: "config/settings.py",
    content: `"""Environment configuration for TaskFlow."""
import os
from dataclasses import dataclass


@dataclass
class Settings:
    jwt_secret: str
    jwt_ttl_seconds: int
    database_url: str
    pool_size: int


def load_settings() -> Settings:
    """Read configuration from the environment at process start."""
    secret = os.environ.get("JWT_SECRET")
    if not secret:
        # In production a missing JWT_SECRET falls back to an ephemeral value,
        # which invalidates every token issued by another replica.
        secret = os.urandom(16).hex()
    return Settings(
        jwt_secret=secret,
        jwt_ttl_seconds=int(os.environ.get("JWT_TTL", "3600")),
        database_url=os.environ["DATABASE_URL"],
        pool_size=int(os.environ.get("POOL_SIZE", "10")),
    )


settings = load_settings()
`,
    metadata: { source_type: "demo" },
  },
];

export const DEMO_EVALUATION_QUESTIONS = [
  {
    question: "Where is JWT authentication implemented?",
    expected_answer:
      "In backend/auth.py: create_access_token signs HS256 tokens and auth_middleware validates the bearer token on protected routes.",
    expected_sources: ["backend/auth.py", "docs/authentication.md"],
  },
  {
    question: "Why might login return 401 after deployment?",
    expected_answer:
      "Usually JWT_SECRET differs between environments, the proxy strips the Authorization header, or clock skew makes tokens look expired.",
    expected_sources: ["docs/troubleshooting.md", "config/settings.py"],
  },
  {
    question: "How are user roles stored and checked?",
    expected_answer:
      "Roles live in the user_roles table and are enforced by the require_role dependency, returning 403 when missing.",
    expected_sources: ["backend/auth.py", "docs/authentication.md"],
  },
  {
    question: "What does POST /api/tasks return when the title is empty?",
    expected_answer: "HTTP 422 with the detail 'title is required'.",
    expected_sources: ["backend/routes.py", "docs/api.md"],
  },
];
