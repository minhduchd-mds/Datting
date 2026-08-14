import { createApp, demoDeps } from "./server.js";

const port = Number(process.env.PORT ?? 8080);
createApp(demoDeps()).listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`match-service lắng nghe :${port}
  thử:  curl 'http://localhost:${port}/v1/deck?uid=1&limit=5'
        curl -XPOST localhost:${port}/v1/swipe -d '{"from":"1","to":"2","action":"like"}'
        curl -XPOST localhost:${port}/v1/swipe -d '{"from":"2","to":"1","action":"like"}'   # → matched:true`);
});
