# Build the tiny gate into a static binary, then ship it on distroless (no shell, non-root).
FROM golang:1.23-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /gate .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /gate /gate
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/gate"]
