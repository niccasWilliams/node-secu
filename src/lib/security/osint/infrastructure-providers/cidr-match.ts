// IPv4-CIDR-Matcher — kein externes Package nötig.
//
// Wird ausschließlich von infrastructureProviderService genutzt, um IPs gegen
// die hardcoded Provider-Ranges (Cloudflare 104.16/12, Railway 66.33.22/24, ...)
// zu matchen. IPv6 ignorieren wir bewusst — die Free-Tier-Listen, die wir
// (Cloudflare-IPs/Railway-Subnets) nutzen, sind primär IPv4.

export function ipv4ToInt(ip: string): number | null {
    const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!m) return null;
    const [, a, b, c, d] = m;
    const oct = [Number(a), Number(b), Number(c), Number(d)];
    if (oct.some((o) => o < 0 || o > 255)) return null;
    return ((oct[0] << 24) | (oct[1] << 16) | (oct[2] << 8) | oct[3]) >>> 0;
}

export function cidrMatchesIpv4(ip: string, cidr: string): boolean {
    const slashIdx = cidr.indexOf("/");
    if (slashIdx < 0) return false;
    const base = cidr.slice(0, slashIdx);
    const prefix = Number(cidr.slice(slashIdx + 1));
    if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return false;
    const ipInt = ipv4ToInt(ip);
    const baseInt = ipv4ToInt(base);
    if (ipInt === null || baseInt === null) return false;
    if (prefix === 0) return true;
    const mask = (~((1 << (32 - prefix)) - 1)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
}
