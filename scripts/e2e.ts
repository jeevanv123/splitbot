import { initDb } from "../src/repo/db.js";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { route } from "../src/router/index.js";
import type { HandlerContext } from "../src/handlers/context.js";
import type { IncomingMessage } from "../src/types/messages.js";
import { rmSync } from "node:fs";

const DB_PATH = "./data/e2e.db";
rmSync(DB_PATH, { force: true });

const db = initDb(DB_PATH);
migrate(db as any, { migrationsFolder: "./drizzle" });

const llm = {
  messages: {
    create: async (req: any) => {
      const text = JSON.stringify(req).toLowerCase();
      if (text.includes("extract the bill")) {
        return { content: [{ type: "text", text: JSON.stringify({
          is_bill: true,
          items: [{ name: "pasta", price_paise: 62000 }, { name: "pizza", price_paise: 78000 }],
          tax_paise: 5000, tip_paise: 0, total_paise: 145000, currency: "INR",
        }) }] };
      }
      // assignItems
      return { content: [{ type: "text", text: JSON.stringify({
        assignments: [{ user_id: "+a", share_paise: 67000 }, { user_id: "+b", share_paise: 78000 }],
      }) }] };
    },
  },
};

const groupMembers = [{ userId: "+a", displayName: "Anu" }, { userId: "+b", displayName: "Beta" }];

async function send(msg: IncomingMessage): Promise<void> {
  const ctx: HandlerContext = { db, llm: llm as any, msg, groupMembers };
  const handler = route(ctx);
  const replies = await handler.run(ctx);
  console.log(`\n[${handler.name}]`);
  for (const r of replies) console.log(`  → ${r.to}\n  ${r.text.replace(/\n/g, "\n  ")}`);
}

(async () => {
  console.log("=== /split slash flow ===");
  await send({ kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "/split 200 chai", receivedAt: new Date(), rawId: "1" });

  console.log("\n=== Image flow ===");
  await send({ kind: "image", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "", imageBuffer: Buffer.from("fake"), receivedAt: new Date(), rawId: "2" });
  await send({ kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "Anu had pasta, Beta had pizza", receivedAt: new Date(), rawId: "3" });

  console.log("\n=== Balance + settle ===");
  await send({ kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "/upi anu@okhdfc", receivedAt: new Date(), rawId: "4" });
  await send({ kind: "text", groupId: "g1", senderId: "+b", senderDisplayName: "Beta", text: "/balance", receivedAt: new Date(), rawId: "5" });
  await send({ kind: "text", groupId: "g1", senderId: "+b", senderDisplayName: "Beta", text: "/settle", receivedAt: new Date(), rawId: "6" });

  console.log("\n=== /help ===");
  await send({ kind: "text", groupId: "g1", senderId: "+a", senderDisplayName: "Anu", text: "/help", receivedAt: new Date(), rawId: "7" });
})();
