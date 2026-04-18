import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";
import { logger } from "@/lib/logger";

logger.info("Running PostgreSQL migrations...");
await migrate(db, { migrationsFolder: "./drizzle/pg" });
logger.info("Migrations complete.");
