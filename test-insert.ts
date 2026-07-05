import { getDb } from "./server/db";
import { users } from "./drizzle/schema";

async function test() {
  const db = await getDb();
  if (!db) {
    console.log("No DB");
    return;
  }
  try {
    const result = await db.insert(users).values({
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
      role: "launcher",
    });
    console.log("Result type:", typeof result);
    console.log("Result stringified:", JSON.stringify(result));
    const resArr = result as any;
    console.log("Result[0] type:", typeof resArr[0]);
    console.log("Result[0] stringified:", JSON.stringify(resArr[0]));
    if (resArr[0]) {
        console.log("insertId from [0]:", resArr[0].insertId);
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

test();
