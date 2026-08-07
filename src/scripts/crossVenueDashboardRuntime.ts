import "dotenv/config";
import { startCrossVenueDashboardServer } from "./crossVenueDashboardServer.js";

startCrossVenueDashboardServer({
  log: console.log,
});

setInterval(() => {
  // Keep the detached dashboard process alive.
}, 60_000);
