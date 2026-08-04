import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import healthRoute from "./routes/health.js";
import diffRoute from "./routes/diff.js";
import waitlistRoute from "./routes/waitlist.js";
import shareRoute from "./routes/share.js";
import projectsRoute from "./routes/projects.js";
import versionsRoute from "./routes/versions.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
app.register(healthRoute);
app.register(diffRoute);
app.register(waitlistRoute);
app.register(shareRoute);
app.register(projectsRoute);
app.register(versionsRoute);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
