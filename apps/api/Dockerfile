# syntax=docker/dockerfile:1

# ---------------------------------------------------------------- base
FROM golang:1.25-alpine AS base
WORKDIR /app
RUN apk add --no-cache git ca-certificates tzdata wget
COPY go.mod go.sum* ./
RUN go mod download || true

# ---------------------------------------------------------------- dev
# Hot reload via air. Source is bind-mounted by docker-compose, so this stage
# intentionally does not COPY the code.
FROM base AS dev
# Pinned: air@latest now needs Go 1.26, newer than the base image.
RUN go install github.com/air-verse/air@v1.67.0
ENV CGO_ENABLED=0
EXPOSE 5000
CMD ["air", "-c", ".air.toml"]

# ---------------------------------------------------------------- builder
FROM base AS builder
COPY . .
ARG COMMIT=unknown
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath \
    -ldflags="-s -w -X main.commit=${COMMIT}" \
    -o /out/api .

# ---------------------------------------------------------------- prod
FROM alpine:3.20 AS prod
WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata wget && \
    adduser -D -u 10001 appuser
COPY --from=builder /out/api /app/api
COPY --from=builder /app/data /app/data
USER appuser
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:5000/healthz || exit 1
ENTRYPOINT ["/app/api"]
