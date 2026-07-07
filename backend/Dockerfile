FROM golang:1.25-alpine AS build
WORKDIR /src
COPY go.mod go.sum* ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/api ./cmd/api

FROM alpine:3.21
RUN adduser -D -u 10001 app
USER app
COPY --from=build /out/api /api
EXPOSE 8090
ENTRYPOINT ["/api"]
