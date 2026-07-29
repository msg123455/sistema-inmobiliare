import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function fetchGoogleFinanceRate(from, to) {
  const url = `https://www.google.com/finance/quote/${from}-${to}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  let match = html.match(/data-last-price="([\d.]+)"/);
  if (match) return parseFloat(match[1]);
  match = html.match(/class="YMlKec fxKbKc">([\d,]+\.?\d*)</);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  match = html.match(/class="YMlKec">([\d,]+\.?\d*)</);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return null;
}

async function fetchFallbackRates() {
  const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
  const data = await res.json();
  return { COP: data.usd.cop, EUR: data.usd.eur };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Try Google Finance first
    const [cop, eur] = await Promise.all([
      fetchGoogleFinanceRate('USD', 'COP'),
      fetchGoogleFinanceRate('USD', 'EUR'),
    ]);

    let rates;
    let source;
    if (cop && eur) {
      rates = { USD: 1, COP: cop, EUR: eur };
      source = 'Google Finance';
    } else {
      const fallback = await fetchFallbackRates();
      rates = { USD: 1, COP: fallback.COP, EUR: fallback.EUR };
      source = 'ECB fallback';
    }

    // Save to SyncState entity for caching
    const existing = await base44.asServiceRole.entities.SyncState.filter({ sync_token: 'exchange_rates' });
    const payload = {
      sync_token: 'exchange_rates',
      ultima_sincronizacion: new Date().toISOString(),
    };

    if (existing.length > 0) {
      await base44.asServiceRole.entities.SyncState.update(existing[0].id, payload);
    } else {
      await base44.asServiceRole.entities.SyncState.create(payload);
    }

    console.log(`Exchange rates updated: COP=${rates.COP}, EUR=${rates.EUR} (${source})`);

    return Response.json({
      success: true,
      source,
      timestamp: new Date().toISOString(),
      rates,
    });
  } catch (error) {
    console.error('Error updating exchange rates:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});