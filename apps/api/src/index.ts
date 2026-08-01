import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import healthRoute from "./routes/health.js";
import diffRoute from "./routes/diff.js";
import waitlistRoute from "./routes/waitlist.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
app.register(healthRoute);
app.register(diffRoute);
app.register(waitlistRoute);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
