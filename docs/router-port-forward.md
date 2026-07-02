# Router port forwarding

Target: Yeastar TG400 on the office LAN.

| External (WAN) | Internal host | Internal port | Protocol |
|----------------|---------------|---------------|----------|
| `YEASTAR_HTTP_PORT` (e.g. 8080) | Yeastar LAN IP | 80 | TCP |
| `YEASTAR_API_PORT` (5038) | Yeastar LAN IP | 5038 | TCP |

1. Assign a **static DHCP reservation** for the Yeastar LAN MAC address.
2. Create the two port-forward rules above.
3. Confirm the WAN IP matches what you put in `YEASTAR_HOST` (or use DDNS if the ISP changes IP — static IP preferred).
4. From AWS, test: `curl "http://WAN_IP:8080/..."` only after Yeastar whitelist includes AWS IP.

Do not expose Yeastar to `0.0.0.0/0` without IP restriction on the device.
