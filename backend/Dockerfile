FROM golang:1.24-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /server ./cmd/server/main.go

# Final image: Debian has stockfish in apt for all architectures
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /server /server

ENV PORT=8080
ENV STOCKFISH_PATH=/usr/games/stockfish

EXPOSE 8080

CMD ["/server"]
