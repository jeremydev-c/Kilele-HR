/**
 * How an IP address appears in the audit log. On the public demo anyone can
 * sign in as an admin, so visitors' addresses are cut down to the network part;
 * a real deployment shows them in full (that's what an audit trail is for).
 * Labels that aren't addresses ("seed", "test") are shown as they are.
 */
export function displayIp(ip: string | null | undefined, demo = process.env.DEMO_MODE === "true") {
  if (!ip) return null;
  if (!demo) return ip;
  const v4 = ip.replace(/^::ffff:/, "").match(/^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (v4) return `${v4[1]}.${v4[2]}.•.•`;
  if (ip === "::1") return "this computer";
  if (ip.includes(":")) return `${ip.split(":").slice(0, 2).join(":")}:•`;
  return ip;
}
