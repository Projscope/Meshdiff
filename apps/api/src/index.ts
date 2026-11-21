import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import healthRoute from "./routes/health.js";
import diffRoute from "./routes/diff.js";
import waitlistRoute from "./routes/waitlist.js";
import shareRoute from "./routes/share.js";
import projectsRoute from "./routes/projects.js";
import versionsRoute from "./routes/versions.js";
import approvalGatesRoute from "./routes/approvalGates.js";
import notificationsRoute from "./routes/notifications.js";
import commentsRoute from "./routes/comments.js";
import teamsRoute from "./routes/teams.js";
import workspaceRoute from "./routes/workspace.js";
import billingRoute from "./routes/billing.js";
import adminRoute from "./routes/admin.js";
import blogRoute from "./routes/blog.js";
import analyticsRoute from "./routes/analytics.js";
import feedbackRoute from "./routes/feedback.js";
import eventsRoute from "./routes/events.js";

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
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(cookie);
await app.register(healthRoute);
await app.register(diffRoute);
await app.register(waitlistRoute);
await app.register(shareRoute);
await app.register(projectsRoute);
await app.register(versionsRoute);
await app.register(approvalGatesRoute);
await app.register(notificationsRoute);
await app.register(commentsRoute);
await app.register(teamsRoute);
await app.register(workspaceRoute);
await app.register(billingRoute);
await app.register(adminRoute);
await app.register(blogRoute);
await app.register(analyticsRoute);
await app.register(feedbackRoute);
await app.register(eventsRoute);

const port = Number(process.env.PORT ?? 3001);

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
