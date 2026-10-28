// Usage: npm run admin:hash -- "your-password"   (or run without an argument and type it)
import { createInterface } from "node:readline";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  let pw = process.argv[2];
  if (!pw) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pw = await new Promise<string>((res) => rl.question("Admin password: ", (a) => { rl.close(); res(a); }));
  }
  if (!pw || pw.length < 8) {
    console.error("Use a password of at least 8 characters.");
    process.exit(1);
  }
  const hash = hashPassword(pw);
  console.log("\nAdd this to your environment (.env locally, Vercel → Settings → Environment Variables in production):\n");
  console.log(`ADMIN_PASSWORD_HASH="${hash}"\n`);
}
main();
