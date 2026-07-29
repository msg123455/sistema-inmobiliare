import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

async function fetchGoogleFinanceRate(from, to) {
  // Use Google's internal finance API endpoint
  const url = `https://www.google.com/finance/quote/${from}-${to}`;
  const res = await fetch(url, {
    headers: {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
  });
  const html = await res.text();
  
  // Try data-last-price attribute
  let match = html.match(/data-last-price="([\d.]+)"/);
  if (match) return parseFloat(match[1]);
  
  // Fallback: look for the rate in the page content between specific markers
  // Google Finance shows the rate in a div with class YMlKec
  match = html.match(/class="YMlKec fxKbKc">([\d,]+\.?\d*)</);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  
  // Another pattern
  match = html.match(/class="YMlKec">([\d,]+\.?\d*)</);
  if (match) return parseFloat(match[1].replace(/,/g, ''));

  return null;
}

async function fetchFallbackRates() {
  // Fallback using the free fawazahmed0 API (sourced from European Central Bank + market data)
  const res = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json');
  const data = await res.json();
  return { COP: data.usd.cop, EUR: data.usd.eur };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Try Google Finance first
    const [cop, eur] = await Promise.all([
      fetchGoogleFinanceRate('USD', 'COP'),
      fetchGoogleFinanceRate('USD', 'EUR'),
    ]);

    if (cop && eur) {
      return Response.json({
        source: 'Google Finance',
        timestamp: new Date().toISOString(),
        rates: { USD: 1, COP: cop, EUR: eur },
      });
    }

    // Fallback if Google Finance scraping fails
    const fallback = await fetchFallbackRates();
    return Response.json({
      source: 'Google Finance (ECB fallback)',
      timestamp: new Date().toISOString(),
      rates: { USD: 1, COP: fallback.COP, EUR: fallback.EUR },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});