import { Router } from 'express';
import { WebSocket } from 'ws';

const router = Router();
const APP_ID = '33whK0sZ6AVTDbjYp2MwL';
const PAT_TOKEN = 'pat_724a6b2029a1e8784e115e022c8bb71c38d7733319a565b1b59a33c7fbb7ceb6';
const DERIV_WS = 'wss://ws.binaryws.com/websockets/v3?app_id=' + APP_ID;

router.get('/deriv/authorize', async (req, res) => {
  try {
    const result = await new Promise((resolve, reject) => {
      const ws = new WebSocket(DERIV_WS);
      ws.on('open', () => {
        ws.send(JSON.stringify({ authorize: PAT_TOKEN }));
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        ws.close();
        if (msg.error) { reject(new Error(msg.error.message)); return; }
        if (msg.msg_type === 'authorize') { resolve(msg.authorize); }
      });
      ws.on('error', (e) => reject(e));
      setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 10000);
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

router.post('/deriv/trade', async (req, res) => {
  try {
    const { contract_type, symbol, duration, duration_unit, amount, basis } = req.body;
    const result = await new Promise((resolve, reject) => {
      const ws = new WebSocket(DERIV_WS);
      ws.on('open', () => {
        ws.send(JSON.stringify({ authorize: PAT_TOKEN }));
      });
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.error) { ws.close(); reject(new Error(msg.error.message)); return; }
        if (msg.msg_type === 'authorize') {
          ws.send(JSON.stringify({
            buy: 1, price: amount,
            parameters: { contract_type, symbol: symbol || 'R_75', duration, duration_unit: duration_unit || 't', amount, basis: basis || 'stake', currency: 'USD' }
          }));
        }
        if (msg.msg_type === 'buy') { ws.close(); resolve(msg.buy); }
      });
      ws.on('error', (e) => reject(e));
      setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 15000);
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) });
  }
});

export default router;
