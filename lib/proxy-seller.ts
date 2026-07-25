import { z } from 'zod';

const ProxyEndpoint = z.object({ id: z.string(), host: z.string(), port: z.coerce.number().int().positive(), username: z.string(), password: z.string(), country: z.string().optional(), city: z.string().optional(), expiresAt: z.string().optional() });
export type ProxyEndpoint = z.infer<typeof ProxyEndpoint>;

export class ProxySellerClient {
  constructor(private readonly apiKey = process.env.PROXY_SELLER_API_KEY, private readonly baseUrl = process.env.PROXY_SELLER_API_BASE_URL) {
    if (!apiKey || !baseUrl) throw new Error('Proxy Seller configuration is missing');
  }

  async allocate(input: { country: string; city?: string; postalCode?: string; sessionId: string }): Promise<ProxyEndpoint> {
    const response = await fetch(`${this.baseUrl}/proxy/allocate`, { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'residential', protocol: 'http', country: input.country, city: input.city, postal_code: input.postalCode, session: input.sessionId }) });
    if (!response.ok) throw new Error(`Proxy Seller allocation failed: ${response.status}`);
    const body = await response.json();
    const candidate = body?.data ?? body;
    return ProxyEndpoint.parse({ id: String(candidate.id ?? input.sessionId), host: candidate.host ?? candidate.ip, port: candidate.port, username: candidate.username ?? candidate.user, password: candidate.password ?? candidate.pass, country: candidate.country, city: candidate.city, expiresAt: candidate.expires_at });
  }
}
