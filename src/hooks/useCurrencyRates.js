import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

async function fetchRates() {
  const response = await base44.functions.invoke('getExchangeRates', {});
  return response.data;
}

export function useCurrencyRates() {
  const { data, isLoading } = useQuery({
    queryKey: ['currency-rates'],
    queryFn: fetchRates,
    staleTime: 1000 * 60 * 15,
    refetchInterval: 1000 * 60 * 15,
    initialData: { source: 'Cargando...', rates: { USD: 1, COP: 4200, EUR: 0.92 } },
  });

  const { data: appConfigs = [] } = useQuery({
    queryKey: ['app-config'],
    queryFn: () => base44.entities.AppConfig.list(),
    staleTime: 1000 * 60 * 5,
  });

  const serverRates = data?.rates || { USD: 1, COP: 4200, EUR: 0.92 };
  const config = appConfigs.find(c => c.clave === 'general') || {};

  const rates = {
    USD: 1,
    COP: config.tasa_cop || serverRates.COP,
    EUR: config.tasa_eur || serverRates.EUR,
  };

  const hasManual = !!(config.tasa_cop || config.tasa_eur);
  const source = hasManual ? 'Manual' : (data?.source || '');

  const convert = (amount, from, to) => {
    if (!amount || from === to) return amount || 0;
    const inUSD = amount / rates[from];
    return inUSD * rates[to];
  };

  const formatCurrency = (amount, currency) => {
    const symbols = { USD: '$', COP: '$', EUR: '€' };
    const prefix = symbols[currency] || '';
    if (currency === 'COP') return `${prefix}${Math.round(amount).toLocaleString()} COP`;
    return `${prefix}${amount.toFixed(2)} ${currency}`;
  };

  return { rates, source, isLoading, convert, formatCurrency };
}