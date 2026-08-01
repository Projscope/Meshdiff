import Fastify from "fastify";
import healthRoute from "./routes/health.js";
import diffRoute from "./routes/diff.js";

const app = Fastify({ logger: true });

app.register(healthRoute);
app.register(diffRoute);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
