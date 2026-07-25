import { z } from 'zod';

const TaskResponse = z.object({ taskId: z.string(), status: z.string().optional() });
export type DuoPlusTaskResult = z.infer<typeof TaskResponse>;

export class DuoPlusClient {
  constructor(private readonly token = process.env.DUOPLUS_API_TOKEN, private readonly baseUrl = process.env.DUOPLUS_API_BASE_URL) {
    if (!token || !baseUrl) throw new Error('DuoPlus configuration is missing');
  }
  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    if (!response.ok) throw new Error(`DuoPlus request failed at ${path}: ${response.status}`);
    return response.json();
  }
  async configureDevice(input: { phoneId: string; latitude: number; longitude: number; proxy: { host: string; port: number; username: string; password: string }; timezone?: string; language?: string }) {
    return this.request('/api/v1/cloudPhone/initProxy', { method: 'POST', body: JSON.stringify({ phoneId: input.phoneId, latitude: input.latitude, longitude: input.longitude, proxyType: 'http', proxyHost: input.proxy.host, proxyPort: input.proxy.port, proxyUsername: input.proxy.username, proxyPassword: input.proxy.password, timezone: input.timezone ?? 'auto', language: input.language ?? 'en-US' }) });
  }
  async startMapsTask(input: { phoneId: string; keyword: string; scanPointId: string; latitude: number; longitude: number; callbackUrl: string }): Promise<DuoPlusTaskResult> {
    const raw = await this.request('/api/v1/rpa/scheduled-task/create', { method: 'POST', body: JSON.stringify({ templateId: process.env.DUOPLUS_MAPS_TEMPLATE_ID, phoneIds: [input.phoneId], parameters: { keyword: input.keyword, scanPointId: input.scanPointId, latitude: input.latitude, longitude: input.longitude, callbackUrl: input.callbackUrl } }) });
    const value = raw?.data ?? raw;
    return TaskResponse.parse({ taskId: String(value.taskId ?? value.task_id ?? value.id), status: value.status });
  }
}
