// Configuration for price channels and instruments
export interface PriceChannelConfig {
  channel: string;
  symbol: string;
  instrument: string;
}

// Read price channel configurations from environment variables
export function getPriceChannelConfigs(): PriceChannelConfig[] {
  const configs: PriceChannelConfig[] = [];
  
  // Read from environment variables
  // Format: PRICE_CHANNEL_1=channel_name:symbol:instrument
  // Example: PRICE_CHANNEL_1=TRADOVATE_MESU5_PRICE:MESU5:MESU5
  
  let i = 1;
  while (true) {
    const envKey = `PRICE_CHANNEL_${i}`;
    const envValue = process.env[envKey];
    
    if (!envValue) break;
    
    const parts = envValue.split(':');
    if (parts.length === 3) {
      configs.push({
        channel: parts[0],
        symbol: parts[1],
        instrument: parts[2]
      });
    } else {
      console.warn(`Invalid PRICE_CHANNEL_${i} format: ${envValue}. Expected format: channel:symbol:instrument`);
    }
    
    i++;
  }
  
  // If no environment variables are set, log a warning but don't use fallbacks
  if (configs.length === 0) {
    console.warn('No price channel configurations found in environment variables. Please set PRICE_CHANNEL_1, PRICE_CHANNEL_2, etc.');
  }
  
  return configs;
}

// Create channel mapping for backward compatibility
export function getChannelMapping(): Record<string, string> {
  const configs = getPriceChannelConfigs();
  const mapping: Record<string, string> = {};
  
  configs.forEach(config => {
    mapping[config.channel] = config.symbol;
  });
  
  return mapping;
}

// Get instruments list for UI
export function getInstruments(): Array<{ symbol: string; instrument: string }> {
  const configs = getPriceChannelConfigs();
  return configs.map(config => ({
    symbol: config.symbol,
    instrument: config.instrument
  }));
}
