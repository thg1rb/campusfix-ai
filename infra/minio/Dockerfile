# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM golang:1.26.11-alpine@sha256:ecb67f987aa1a57794c91d19ade7ae0209f2f0f5496aaef9e6ae85ddf92d02ab AS build
WORKDIR /src
ADD --checksum=sha256:45521908307306e925c98d629e1c17d78c8b72b6ee242b1bfb1409f7d8ee5841 https://codeload.github.com/minio/minio/tar.gz/9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a /tmp/minio.tar.gz
RUN tar -xzf /tmp/minio.tar.gz --strip-components=1 && go mod download && go mod verify
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -mod=readonly -tags kqueue -trimpath \
    -ldflags="-s -w \
    -X github.com/minio/minio/cmd.Version=2025-10-15T17:29:55Z \
    -X github.com/minio/minio/cmd.ReleaseTag=RELEASE.2025-10-15T17-29-55Z \
    -X github.com/minio/minio/cmd.CommitID=9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a \
    -X github.com/minio/minio/cmd.ShortCommitID=9e49d5e7a648 \
    -X github.com/minio/minio/cmd.CopyrightYear=2025" -o /out/minio .

FROM alpine:3.23.8@sha256:469c9ea410b9215eaee7976ba6c0639039b444be8e5d638f7abbada189971eb2
RUN addgroup -g 10001 minio && adduser -D -u 10001 -G minio minio \
    && mkdir /data && chown minio:minio /data
COPY --from=build /out/minio /usr/local/bin/minio
COPY --from=build /src/LICENSE /src/CREDITS /licenses/
USER minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
