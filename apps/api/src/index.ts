import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import healthRoute from "./routes/health.js";
import diffRoute from "./routes/diff.js";
import waitlistRoute from "./routes/waitlist.js";
import shareRoute from "./routes/share.js";
import projectsRoute from "./routes/projects.js";
import versionsRoute from "./routes/versions.js";
import commentsRoute from "./routes/comments.js";
import teamsRoute from "./routes/teams.js";
import workspaceRoute from "./routes/workspace.js";

const app = Fastify({ logger: true });

// Explicit methods list, rather than relying on @fastify/cors's automatic
// per-route detection — that reflects Fastify's internal OPTIONS route
// synthesis, which (registration-order-dependent) reported only
// GET,HEAD,POST as allowed on /projects/:id/versions/:id even though the
// DELETE handler on that exact path worked fine when called directly.
// Browsers correctly refuse to send the actual DELETE after a preflight
// that doesn't list it, surfacing as an opaque "Failed to fetch".
await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
app.register(healthRoute);
app.register(diffRoute);
app.register(waitlistRoute);
app.register(shareRoute);
app.register(projectsRoute);
app.register(versionsRoute);
app.register(commentsRoute);
app.register(teamsRoute);
app.register(workspaceRoute);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
