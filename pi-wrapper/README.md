# TeamClaw pi-wrapper

Standalone WebSocket adapter that exposes the pi coding agent through the
OpenClaw gateway protocol subset used by TeamClaw chat.

## Runtime

- `PI_PORT`: listening port, default `18790`
- `PI_HOST`: listening host, default `0.0.0.0`
- `PI_AGENT_DIR`: pi global config directory, default `/home/node/.openclaw`

Start locally:

```bash
npm install --prefix pi-wrapper
node pi-wrapper/server.js
```

Or through the package script:

```bash
npm start --prefix pi-wrapper
```

Run protocol tests:

```bash
npm test --prefix pi-wrapper
```

## Gateway Surface

Implemented RPC methods:

- `connect`
- `agents.list`
- `chat.send`
- `chat.abort`
- `chat.history`
- `sessions.delete`
- `health`
- `config.get`
- `config.patch`

Pushed events:

- `chat`
- `agent`
- `tick`

`chat.send` accepts only pi session keys in the form
`agent:pi:<agentId>:tc:<userId>`. This keeps pi sessions isolated from the
OpenClaw runtime session keyspace.

## Integration Status

This package is the standalone #21 slice. TeamClaw routes still fail closed for
`runtime: "pi"` until the #22 integration slice points the chat APIs at this
wrapper.
