import "dotenv/config";

const to = process.env.SMS_TEST_MOBILE || "0450323290";
const u = new URL(`http://${process.env.YEASTAR_HOST}:${process.env.YEASTAR_HTTP_PORT}/cgi/WebCGI`);
u.searchParams.set("1500101", `account=${process.env.YEASTAR_USERNAME}`);
u.searchParams.set("password", process.env.YEASTAR_PASSWORD || "");
u.searchParams.set("port", process.env.YEASTAR_SIM_PORT || "1");
u.searchParams.set("destination", to);
u.searchParams.set("content", "node fetch test");

console.log("URL", u.toString().replace(process.env.YEASTAR_PASSWORD || "", "***"));
try {
  const res = await fetch(u, { signal: AbortSignal.timeout(15000) });
  const body = await res.text();
  console.log(JSON.stringify({ status: res.status, body: body.slice(0, 500) }, null, 2));
} catch (e) {
  console.error("fetch failed", e);
}
