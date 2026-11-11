export type Ticket = {
  id: string;
  recipient: string;
  amount: number;
  created: number;
};
export type Account = { balance: number; receipts: Ticket[] };
export type Audit = {
  seq: number;
  id: string;
  created: number;
  amount: number;
  expires: number | null;
  status: "SETTLED" | "HELD" | "RETURNED";
  kind: string;
  destination: string;
};
export type MonitorState = { held: number; credited: number; events: Audit[] };
export class ApiError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(detail);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/" + path, {
    ...options,
    cache: "no-store",
    headers: { "X-PanicLock-Client": "demo", ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      body.detail || "Bank unavailable. Please retry.",
    );
  }
  return response.json();
}
