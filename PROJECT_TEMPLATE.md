# Go REST API Project Template

This document describes the architecture, patterns, and conventions used in this project. Use it as a blueprint to replicate the exact same structure for new projects.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | Go | 1.23.4 |
| Web Framework | Echo | v4.13.3 |
| ORM | GORM | v1.25.12 |
| Database | MySQL | 8.0 |
| Dependency Injection | Uber FX | v1.23.0 |
| Authentication | JWT (HS256) | v5.3.1 |
| Configuration | Viper + godotenv | v1.19.0 |
| Logging | Logrus | v1.9.3 |
| Validation | go-playground/validator | v10.24.0 |
| Migrations | gormigrate/v2 | v2.1.3 |
| Cloud Storage | AWS SDK v2 (Cloudflare R2) | v1.36.3 |
| Email | Google Gmail API + OAuth2 | — |
| Hashing | golang.org/x/crypto | v0.33.0 |
| UUID | google/uuid | v1.6.0 |

---

## Project Structure

```
my-api/
├── main.go                          # Entry point: env loading, FX app init, migration
├── seeder.go                        # Basic database seeding (test data)
├── massive_seeder.go                # Large-scale test data generation
├── docker-compose.yml               # Local MySQL service
├── Dockerfile                       # Multi-stage build (Go → Alpine)
├── k8s/
│   └── deployment.yaml              # Kubernetes deployment manifest
├── migrations/
│   └── YYYYMMDD_description.sql     # Manual SQL migration files
└── pkg/
    ├── core/
    │   └── config.go                # Config struct definitions
    ├── handlers/
    │   └── api/
    │       ├── api.go               # Server struct, route registration, middleware chain
    │       ├── middleware.go        # JWT auth, admin role check, optional JWT
    │       ├── request/
    │       │   └── request.go       # OTP generation, password hashing, pagination helpers
    │       └── *.handler.go         # One file per domain (auth, user, show, etc.)
    ├── models/
    │   └── *.go                     # GORM model + Store interface per domain
    ├── store/
    │   ├── store.go                 # Pagination utilities, common query helpers
    │   └── <domain>/
    │       └── <domain>.store.go    # GORM repository implementation
    ├── services/
    │   ├── email/
    │   │   └── email.service.go     # Gmail API integration
    │   └── storage/
    │       ├── storage.service.go   # R2/S3 operations
    │       └── r2_client.go         # R2 client constructor
    ├── logger/
    │   ├── logger.go                # Logrus setup
    │   └── middleware.go            # Request logging Echo middleware
    └── utils/
        ├── dateutil/                # Date range helpers (week, month, in_time_span)
        ├── hashutil/                # MD5, SHA, HMAC utilities
        ├── str/                     # String helpers
        └── validator/               # Custom validation error formatting
```

---

## Architecture Overview

The project follows a **Layered + Repository Pattern**:

```
HTTP Request
    ↓
Echo Router
    ↓
Middleware (JWT, Rate Limit, CORS, Logger)
    ↓
Handler (pkg/handlers/api/*.handler.go)
    ↓
Store Interface (pkg/models/*.go)
    ↓
Store Implementation (pkg/store/<domain>/<domain>.store.go)
    ↓
GORM → MySQL
```

Dependency injection via **Uber FX** wires all layers together at startup. Handlers depend on Store **interfaces** (not concrete types), which keeps them testable and decoupled.

---

## Configuration (`pkg/core/config.go`)

Define a single `Config` struct. All values come from environment variables via Viper.

```go
type Config struct {
    Environment string
    Commit      string
    JwtSecret   string
    MySQL       MySQLConfig
    Redis       RedisConfig
    MongoDBURI  string
    GoogleAPI   GoogleAPIConfig
    R2          R2Config
}

type MySQLConfig struct {
    Host     string
    Port     string
    Username string
    Password string
    Database string
}

type R2Config struct {
    Endpoint    string
    Region      string
    AccessKey   string
    SecretKey   string
    ImageBucket string
    VideoBucket string
}

type GoogleAPIConfig struct {
    ClientID     string
    ClientSecret string
    RefreshToken string
    AccessToken  string
}
```

### Required Environment Variables

```env
ENV=development

# JWT
JWT_SECRET_KEY=your_secret_key

# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USERNAME=root
MYSQL_PASSWORD=123456
MYSQL_DATABASE=mydb

# Cloudflare R2
R2_ENDPOINT=https://xxx.r2.cloudflarestorage.com
R2_REGION=auto
R2_ACCESS_KEY=xxx
R2_SECRET_KEY=xxx
R2_IMAGE_BUCKET=images
R2_VIDEO_BUCKET=videos

# Gmail OAuth2
GMAIL_CLIENT_ID=xxx
GMAIL_CLIENT_SECRET=xxx
GMAIL_REFRESH_TOKEN=xxx
GMAIL_ACCESS_TOKEN=xxx

# Redis (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# MongoDB (optional)
MONGODB_URI=mongodb://localhost:27017
```

---

## Bootstrap (`main.go`)

Startup sequence:

1. Load `.env` with `godotenv.Load(".env")`
2. Enable `viper.AutomaticEnv()` for environment variable binding
3. Set global timezone to `Asia/Bangkok`
4. Read all env vars into `Config` struct
5. Build the FX app:
   - Supply `Config`
   - Provide GORM DB client (runs migrations on first start)
   - Provide all store repositories as FX modules
   - Provide email and storage service modules
   - Provide `api.NewServer` with all dependencies injected
   - Invoke `runLakornsanAPI` to start Echo on port `5000`

### CLI Commands

```bash
go run main.go              # Start the API server
go run main.go up           # Run database migrations only
go run main.go seed         # Run migrations + seed basic test data
go run main.go massive_seed # Seed 100 shows × 100 episodes
```

---

## Models (`pkg/models/`)

Each model file contains:
1. The **GORM model struct**
2. The **Store interface** for that domain

```go
// pkg/models/user.go
package models

import "time"

type User struct {
    ID        uint      `gorm:"primarykey" json:"id"`
    Username  string    `gorm:"uniqueIndex" json:"username"`
    Email     string    `gorm:"uniqueIndex" json:"email"`
    Password  string    `json:"-"`
    Role      string    `gorm:"default:user" json:"role"`   // "admin" | "user"
    Status    string    `gorm:"default:active" json:"status"` // "active" | "deactivated"
    CreatedAt time.Time `json:"created_at"`
    UpdatedAt time.Time `json:"updated_at"`
}

type UserStore interface {
    Create(user *User) error
    Find(id int) (*User, error)
    FindByUsername(username string) (*User, error)
    FindByEmail(email string) (*User, error)
    List(query ListUserQuery) ([]*User, *store.PaginationResult, error)
    Update(user *User) error
    Delete(id int) error
}

type ListUserQuery struct {
    store.PaginationQuery
    Search string
}
```

> **Convention:** Every domain has exactly one model file with both the struct and the interface. Query parameter structs live in the same file.

---

## Stores (`pkg/store/<domain>/<domain>.store.go`)

The store is the data access layer. It implements the interface defined in the model file.

```go
// pkg/store/user/user.store.go
package user

import (
    "gorm.io/gorm"
    "myapi/pkg/models"
    "myapi/pkg/store"
)

type userStoreService struct {
    db *gorm.DB
}

func New(db *gorm.DB) models.UserStore {
    return &userStoreService{db: db}
}

func (s *userStoreService) Create(user *models.User) error {
    return s.db.Create(user).Error
}

func (s *userStoreService) Find(id int) (*models.User, error) {
    var user models.User
    err := s.db.First(&user, id).Error
    return &user, err
}

func (s *userStoreService) List(query models.ListUserQuery) ([]*models.User, *store.PaginationResult, error) {
    var users []*models.User
    q := s.db.Model(&models.User{})
    if query.Search != "" {
        q = q.Where("username LIKE ?", "%"+query.Search+"%")
    }
    var total int64
    q.Count(&total)
    q = store.WithPagination(q, &query.PaginationQuery)
    err := q.Find(&users).Error
    pagination := store.NewPaginationResult(total, query.Page, query.Limit)
    return users, pagination, err
}
```

### Pagination Helper (`pkg/store/store.go`)

```go
type PaginationQuery struct {
    Page  int `query:"page"`
    Limit int `query:"limit"`
}

type PaginationResult struct {
    Total       int64 `json:"total"`
    TotalPages  int   `json:"total_pages"`
    CurrentPage int   `json:"current_page"`
    Limit       int   `json:"limit"`
}

func WithPagination(q *gorm.DB, query *PaginationQuery) *gorm.DB {
    if query.Page < 1 { query.Page = 1 }
    if query.Limit < 1 { query.Limit = 20 }
    return q.Offset((query.Page - 1) * query.Limit).Limit(query.Limit)
}
```

---

## Handlers (`pkg/handlers/api/`)

### Server Setup (`api.go`)

```go
type Server struct {
    Config     core.Config
    UserStore  models.UserStore
    ShowStore  models.ShowStore
    // ... one field per store
    Email      *email.EmailService
    Storage    *storage.StorageService
}

func NewServer(
    config core.Config,
    userStore models.UserStore,
    // ...
) *Server {
    return &Server{
        Config:    config,
        UserStore: userStore,
        // ...
    }
}

func (s *Server) Start() {
    e := echo.New()

    // Global middleware
    e.Use(middleware.Recover())
    e.Use(middleware.Secure())
    e.Use(middleware.CORSWithConfig(...))
    e.Use(middleware.RateLimiter(...))
    e.Use(logger.Middleware())

    // Public routes
    auth := e.Group("/auth")
    auth.POST("/requestRegister", s.RequestRegister)
    auth.POST("/register", s.Register)
    auth.POST("/login", s.Login)

    // Protected routes
    api := e.Group("/api", s.JwtMiddleware())
    api.GET("/me", s.GetMe)
    api.PATCH("/me", s.UpdateMe)

    // Admin routes
    admin := e.Group("/admin", s.JwtMiddleware(), s.IsAdmin())
    admin.GET("/users", s.ListUsers)
    admin.DELETE("/users/:id", s.DeleteUser)

    e.Start(":5000")
}
```

### Handler File Structure

Each handler file follows this pattern:

```go
// pkg/handlers/api/user.handler.go
package api

import (
    "net/http"
    "github.com/labstack/echo/v4"
)

func (s *Server) GetMe(c echo.Context) error {
    userID := c.Get("id").(int)
    user, err := s.UserStore.Find(userID)
    if err != nil {
        return c.JSON(http.StatusNotFound, map[string]string{"error": "user not found"})
    }
    return c.JSON(http.StatusOK, user)
}

func (s *Server) UpdateMe(c echo.Context) error {
    var body struct {
        Username string `json:"username" validate:"required"`
    }
    if err := c.Bind(&body); err != nil {
        return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
    }
    if err := c.Validate(&body); err != nil {
        return c.JSON(http.StatusUnprocessableEntity, err)
    }
    // ...
}
```

---

## Middleware (`pkg/handlers/api/middleware.go`)

### JWT Middleware (Required Auth)

```go
func (s *Server) JwtMiddleware() echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            token := extractBearerToken(c)
            claims, err := validateJWT(token, s.Config.JwtSecret)
            if err != nil {
                return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
            }
            // Live status check — blocks deactivated users mid-session
            user, err := s.UserStore.Find(claims.ID)
            if err != nil || user.Status != "active" {
                return c.JSON(http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
            }
            c.Set("id", claims.ID)
            c.Set("username", claims.Username)
            c.Set("role", claims.Role)
            return next(c)
        }
    }
}
```

### Admin Middleware

```go
func (s *Server) IsAdmin() echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            role := c.Get("role").(string)
            if role != "admin" {
                return c.JSON(http.StatusForbidden, map[string]string{"error": "forbidden"})
            }
            return next(c)
        }
    }
}
```

### Optional JWT (Public routes enriched with user context)

```go
func (s *Server) OptionalJwt() echo.MiddlewareFunc {
    // Same as JwtMiddleware but never returns error — just skips if invalid
}
```

---

## Authentication Flow

### Registration

```
POST /auth/requestRegister  →  Generate OTP + send via Gmail
POST /auth/register         →  Validate OTP + create user (bcrypt password)
POST /auth/login            →  Verify credentials → return JWT (7-day expiry)
```

### Password Reset

```
POST  /auth/requestResetPassword  →  Generate OTP + send via Gmail
POST  /auth/verifyResetPassword   →  Validate OTP
PATCH /auth/resetPassword         →  Update with new bcrypt password
```

### JWT Claims

```json
{
  "id": 1,
  "username": "john",
  "role": "user",
  "exp": 1234567890
}
```

Token expiry: **7 days** (168 hours). Algorithm: **HS256**.

---

## Database Migrations

Migrations run automatically on startup via `gormigrate/v2`.

```go
func runMigrations(db *gorm.DB) error {
    m := gormigrate.New(db, gormigrate.DefaultOptions, []*gormigrate.Migration{
        {
            ID: "20240101_initial",
            Migrate: func(tx *gorm.DB) error {
                return tx.AutoMigrate(
                    &models.User{},
                    &models.Show{},
                    // ... all models
                )
            },
            Rollback: func(tx *gorm.DB) error {
                return tx.Migrator().DropTable("users", "shows")
            },
        },
    })
    return m.Migrate()
}
```

Manual SQL fixes go in `migrations/YYYYMMDD_description.sql` for documentation, applied separately.

---

## Docker

### Dockerfile (Multi-stage)

```dockerfile
# Stage 1: Build
FROM golang:latest AS build
WORKDIR /app
COPY . .
ARG COMMIT
RUN go mod download
RUN CGO_ENABLED=0 go build -ldflags "-X main.GitCommit=$COMMIT" -o artifacts/myapi .

# Stage 2: Runtime
FROM alpine:latest
RUN apk --no-cache add tzdata ca-certificates
WORKDIR /app
COPY --from=build /app/. .
EXPOSE 5000
CMD ["./artifacts/myapi"]
```

### docker-compose.yml (local development)

```yaml
version: "3.8"
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: 123456
      MYSQL_DATABASE: mydb
      TZ: Asia/Bangkok
    ports:
      - "3306:3306"
    volumes:
      - mysql-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mysql-data:
```

---

## Utilities

### Request Helpers (`pkg/handlers/api/request/request.go`)

| Function | Description |
|---|---|
| `HashPassword(password string) string` | bcrypt hash |
| `CheckPassword(hash, password string) bool` | bcrypt compare |
| `GenerateOTP() (code, ref string)` | Secure random 6-digit OTP + reference |
| `GetPaginationQuery(c echo.Context) store.PaginationQuery` | Parse `?page=&limit=` |

### Hash Utilities (`pkg/utils/hashutil/`)

- `MD5(input string) string`
- `SHA256(input string) string`
- `HMACSign(secret, data string) string`

### Date Utilities (`pkg/utils/dateutil/`)

- `InTimeSpan(start, end, check time.Time) bool`
- `StartOfWeek(t time.Time) time.Time`
- `StartOfMonth(t time.Time) time.Time`

### Validator (`pkg/utils/validator/`)

Custom error formatter for `go-playground/validator` that maps validation errors to user-friendly JSON responses.

---

## Adding a New Domain (Step-by-step)

1. **Model** — Create `pkg/models/<domain>.go` with GORM struct + Store interface
2. **Store** — Create `pkg/store/<domain>/<domain>.store.go` implementing the interface
3. **Handler** — Create `pkg/handlers/api/<domain>.handler.go` with Echo handlers
4. **Register** — Add store `fx.Provide` in `main.go` and store field in `api.Server`
5. **Routes** — Register routes in `api.go`'s `Start()` method
6. **Migration** — Add model to `AutoMigrate` list in `main.go`

---

## Key Conventions

- Server port: **5000**
- Timezone: **Asia/Bangkok** (set globally at startup)
- All DB timestamps: **created_at**, **updated_at** (managed by GORM)
- User roles: **`"admin"`** | **`"user"`**
- User statuses: **`"active"`** | **`"deactivated"`**
- Show flags: **`"publish"`** | **`"draft"`** | **`"schedul"`** | **`"hidden"`** | **`"delete"`**
- Soft deletes are NOT used — records are flagged with status/flag fields
- JSON response keys are **snake_case**
- Password fields are excluded from JSON with `json:"-"`
- All routes return JSON; error shape is `{"error": "message"}`
- Pagination response always includes `total`, `total_pages`, `current_page`, `limit`
