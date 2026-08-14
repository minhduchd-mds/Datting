FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ws-gateway .

FROM gcr.io/distroless/static-debian12
COPY --from=build /out/ws-gateway /ws-gateway
EXPOSE 8081
# Pod WebSocket là STATEFUL: terminationGracePeriodSeconds phải > DRAIN_WINDOW.
ENV DRAIN_WINDOW=25s
ENTRYPOINT ["/ws-gateway"]
