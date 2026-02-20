FROM golang:1.24-bookworm AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /worker ./cmd/worker/main.go

FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    stockfish \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /worker /worker

ENV PORT=9000
ENV STOCKFISH_PATH=/usr/games/stockfish

EXPOSE 9000

CMD ["/worker"]
