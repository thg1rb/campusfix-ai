FROM golang:1.26.11-alpine AS build
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN go mod verify && CGO_ENABLED=0 go build -mod=readonly -o /server ./cmd/server

FROM alpine:3.23.8
RUN adduser -D app
COPY --from=build /server /server
USER app
CMD ["/server"]
