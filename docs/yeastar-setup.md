# Yeastar TG400 setup

1. Enable **API** on the TG400 (HTTP WebCGI + TCP API port 5038).
2. Create an API user (`YEASTAR_USERNAME` / `YEASTAR_PASSWORD`).
3. Under **API Settings → IP restriction**, allow **only** the EC2 **Elastic IP** (see [deployment-aws.md](deployment-aws.md)).
4. Note SIM port number (`YEASTAR_SIM_PORT`, usually `1`).
5. On the server `.env`:
   - `YEASTAR_HOST` = router **public** static IP (not LAN IP)
   - `YEASTAR_HTTP_PORT` = external port forwarded to Yeastar HTTP (e.g. 8080)
   - `YEASTAR_API_PORT` = external port forwarded to 5038 (often 5038)
6. Keep `YEASTAR_SEND_ENABLED=false` until dashboard **Test Yeastar** succeeds.
7. Outbound uses GET `/cgi/WebCGI` — format: `1500101=account=USER&password=PASS&port=1&destination=NUM&content=MSG` (see [Yeastar HTTP SMS docs](https://support.yeastar.com/hc/en-us/articles/217393078)).
