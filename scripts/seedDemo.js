// `npm run seed:demo` — resets and re-seeds the deterministic Buildathon demo dataset
// (100 clients / 90 passed / 10 failed) for the pre-seeded demo merchant. See
// server/src/services/demoSeed.js. Test Mode only; no Razorpay call is made.

import { env } from "../server/src/config/env.js";
import { connectDB, disconnectDB } from "../server/src/config/db.js";
import { getOrCreateDemoMerchant } from "../server/src/services/demoMerchant.js";
import { seedDemoDataset } from "../server/src/services/demoSeed.js";
import { logger } from "../server/src/lib/logger.js";

async function main() {
  await connectDB(env.MONGODB_URI);
  const merchant = await getOrCreateDemoMerchant();
  const summary = await seedDemoDataset({ merchantId: merchant._id });
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(summary, null, 2));
  await disconnectDB();
}

main().catch(async (err) => {
  logger.error("seed:demo failed", { error: err.message });
  await disconnectDB().catch(() => {});
  process.exitCode = 1;
});
