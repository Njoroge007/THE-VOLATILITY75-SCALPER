const APP_ID: string = (import.meta.env.VITE_DERIV_APP_ID as string | undefined) ?? '33wdOdbrWruFJscl2EdIW';
const API_BASE = '/api';

export { APP_ID };
export const SESSION_TTL_HOURS = 8;
export const derivWsUrl = () => 'wss://ws.binaryws.com/websockets/v3?app_id=' + APP_ID;

export type DiagEntry = { level: 'info' | 'error' | 'warn'; message: string; ts: number };
const _diagLog: DiagEntry[] = [];
export function getDiagLog(): DiagEntry[] { return [..._diagLog]; }
function diag(level: 'info' | 'error' | 'warn', message: string) {
  _diagLog.push({ level, message, ts: Date.now() });
  console.log('[Deriv ' + level + ']', message);
}

let accessToken: string | null = null;
export function getAccessToken(): string | null { return accessToken; }
export function restoreToken(token: string) { accessToken = token; }
export function clearAccessToken() { accessToken = null; }

const SESSION_KEY = 'deriv_session';
type Session = { token: string; accounts: any[]; selectedAccountId: string; expiresAt: number };

export function saveSession(token: string, accounts: any[], selectedAccountId: string) {
  const s: Session = { token, accounts, selectedAccountId, expiresAt: Date.now() + SESSION_TTL_HOURS * 3600000 };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s: Session = JSON.parse(raw);
    if (Date.now() > s.expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return s;
  } catch { return null; }
}

export function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch {} }

export function initiateLogin(): void {
  const redirectUri = window.location.origin + '/';
  const loginUrl =
    `https://oauth.deriv.com/oauth2/authorize` +
    `?app_id=${encodeURIComponent(APP_ID)}` +
    `&l=en` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;
  diag('info', 'Redirecting to Deriv OAuth login...');
  window.location.href = loginUrl;
}

export function handleOAuthCallback(_api?: string): { status: string; token?: string; message?: string } {
  const params = new URLSearchParams(window.location.search);
  const token1 = params.get('token1');
  const acct1  = params.get('acct1');

  if (token1 && acct1) {
    diag('info', 'OAuth tokens found in URL — account: ' + acct1);
    window.history.replaceState({}, '', window.location.pathname);
    accessToken = token1;
    return { status: 'connected', token: token1 };
  }

  return { status: 'pending' };
}

export async function authorizeAndGetAccounts(token: string, _api?: string): Promise<any[]> {
  diag('info', 'Authorizing via Deriv WebSocket (app_id=' + APP_ID + ')...');
  return new Promise((resolve, reject) => {
    const wsUrl = derivWsUrl();
    let ws: WebSocket;
    let settled = false;

    function settle(fn: () => void) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      fn();
    }

    try {
      ws = new WebSocket(wsUrl);
    } catch (e) {
      reject(new Error('Failed to open WebSocket: ' + (e as Error).message));
      return;
    }

    const timeout = setTimeout(() => {
      ws.close();
      settle(() => reject(new Error('WebSocket authorize timed out after 10 s')));
    }, 10_000);

    ws.onopen = () => {
      diag('info', 'WS open — sending authorize');
      ws.send(JSON.stringify({ authorize: token }));
    };

    ws.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data as string); } catch {
        settle(() => { ws.close(); reject(new Error('WS non-JSON response')); });
        return;
      }
      if (msg.error) {
        settle(() => { ws.close(); reject(new Error('Deriv auth error: ' + (msg.error.message ?? JSON.stringify(msg.error)))); });
        return;
      }
      if (msg.msg_type === 'authorize' && msg.authorize) {
        const auth = msg.authorize;
        diag('info', 'Authorized as ' + auth.loginid);
        const list = auth.account_list ?? [{ loginid: auth.loginid, currency: auth.currency, balance: auth.balance }];
        settle(() => {
          ws.close();
          resolve(list.map((a: any) => ({
            id:       a.loginid,
            currency: a.currency ?? 'USD',
            balance:  Number(a.balance ?? 0),
            token,
          })));
        });
      }
    };

    ws.onerror = () => {
      settle(() => reject(new Error(
        'WebSocket connection failed — check that app_id "' + APP_ID + '" is registered at Deriv and the token is valid'
      )));
    };

    ws.onclose = (ev) => {
      if (ev.code !== 1000 && ev.code !== 1001) {
        settle(() => reject(new Error('WebSocket closed unexpectedly: code ' + ev.code)));
      }
    };
  });
}
