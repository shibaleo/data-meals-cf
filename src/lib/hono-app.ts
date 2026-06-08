import { Hono } from "hono";
import { logger } from "hono/logger";
import { authenticate, type AuthResult } from "@/lib/auth";

type Env = { Variables: { authResult: AuthResult } };

import health from "@/routes/health";
import foods from "@/routes/foods";
import meals from "@/routes/meals";
import intakes from "@/routes/intakes";
import analytics from "@/routes/analytics";
import users from "@/routes/users";
import apiKeys from "@/routes/api-keys";

const v1 = new Hono<Env>()
  .use("*", logger())
  .onError((err, c) => {
    console.error(err);
    const causeMsg = err.cause instanceof Error ? err.cause.message : "";
    const msg = causeMsg ? `${err.message} - ${causeMsg}` : (err.message || "Internal Server Error");
    if (causeMsg.includes("Network connection lost") || (err.message ?? "").includes("Network connection lost")) {
      throw err;
    }
    return c.json({ error: msg }, 500);
  })
  .route("/health", health)
  .use("*", async (c, next) => {
    const result = await authenticate(c.req.raw);
    if (!result) return c.json({ error: "Unauthorized" }, 401);
    c.set("authResult", result);
    await next();
  })
  .route("/foods", foods)
  .route("/meals", meals)
  .route("/intakes", intakes)
  .route("/analytics", analytics)
  .route("/users", users)
  .route("/api-keys", apiKeys)
  .get("/me", (c) => {
    const r = c.get("authResult");
    return c.json({ data: { id: r.userId, name: r.name, email: r.email } });
  });

const app = new Hono().basePath("/api").route("/v1", v1);

export default app;
export type AppType = typeof app;
