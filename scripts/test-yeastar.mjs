import "dotenv/config";
import { sendSms } from "../dist/yeastar/send.js";

const to = process.env.SMS_TEST_MOBILE || "0000000000";
const result = await sendSms(to, "SMS dashboard connection test");
console.log(JSON.stringify({ to, ...result }, null, 2));
process.exit(result.accepted ? 0 : 1);
