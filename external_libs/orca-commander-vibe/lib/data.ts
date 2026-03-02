import { Position, Order, Account } from './types';

export interface PriceData {
  symbol: string;
  currentPrice: number;
  previousPrice: number;
  change: number;
  changePercent: number;
  lastUpdate: string;
}

export const dummyAccounts: Account[] = [
  // APEX_136189 group
  {
    id: 'D16934759',
    name: 'PAAPEX1361890000002',
    owner: 'APEX_136189',
  },
  {
    id: 'D18156704',
    name: 'PAAPEX1361890000007',
    owner: 'APEX_136189',
  },
  {
    id: 'D18156705',
    name: 'PAAPEX1361890000008',
    owner: 'APEX_136189',
  },
  {
    id: 'D18156715',
    name: 'PAAPEX1361890000009',
    owner: 'APEX_136189',
  },
  {
    id: 'D18156785',
    name: 'PAAPEX1361890000010',
    owner: 'APEX_136189',
  },
  // APEX_265995 group
  {
    id: 'D17157511',
    name: 'PAAPEX2659950000004',
    owner: 'APEX_265995',
  },
  {
    id: 'D18156168',
    name: 'PAAPEX2659950000005',
    owner: 'APEX_265995',
  },
  // APEX_266668 group
  {
    id: 'D17158695',
    name: 'PAAPEX2666680000001',
    owner: 'APEX_266668',
  },
  {
    id: 'D17159091',
    name: 'PAAPEX2666680000002',
    owner: 'APEX_266668',
  },
  {
    id: 'D17159229',
    name: 'PAAPEX2666680000003',
    owner: 'APEX_266668',
  },
  {
    id: 'D18155676',
    name: 'PAAPEX2666680000004',
    owner: 'APEX_266668',
  },
  {
    id: 'D18155751',
    name: 'PAAPEX2666680000005',
    owner: 'APEX_266668',
  },
  // APEX_272045 group
  {
    id: 'D17200370',
    name: 'PAAPEX2720450000001',
    owner: 'APEX_272045',
  },
  {
    id: 'D17200423',
    name: 'PAAPEX2720450000002',
    owner: 'APEX_272045',
  },
  {
    id: 'D17200474',
    name: 'PAAPEX2720450000003',
    owner: 'APEX_272045',
  },
  {
    id: 'D17200522',
    name: 'PAAPEX2720450000004',
    owner: 'APEX_272045',
  },
  {
    id: 'D18155916',
    name: 'PAAPEX2720450000005',
    owner: 'APEX_272045',
  },
];

export const dummyPositions: Position[] = [
  {
    symbol: 'CME_MINI:MES1!',
    side: 'long',
    quantity: 1,
    avgFillPrice: 6490.50,
    lastPrice: 6489.75,
    unrealizedPnL: -3.75,
    unrealizedPnLPercent: -0.01,
    tradeValue: 32452.50,
    marketValue: 32448.75,
    leverage: 20,
    margin: 1622.44,
    orderId: '2233521407',
  },
  {
    symbol: 'CME_MINI:ES1!',
    side: 'short',
    quantity: 2,
    avgFillPrice: 5125.25,
    takeProfit: 5110.00,
    stopLoss: 5140.00,
    lastPrice: 5120.50,
    unrealizedPnL: 9.50,
    unrealizedPnLPercent: 0.09,
    tradeValue: 102505.00,
    marketValue: 102410.00,
    leverage: 10,
    margin: 10250.50,
    orderId: '2233521500',
  },
];

export const dummyOrders: Order[] = [
  {
    symbol: 'CME_MINI:MES1!',
    side: 'sell',
    type: 'limit',
    quantity: 1,
    limitPrice: 6493.75,
    status: 'working',
    placingTime: '2025-01-22T16:48:30',
    orderId: '2233521993',
    expiry: '2025-01-29T16:48:29',
    leverage: 20,
  },
  {
    symbol: 'CME_MINI:MES1!',
    side: 'buy',
    type: 'limit',
    quantity: 1,
    limitPrice: 6481.25,
    status: 'working',
    placingTime: '2025-01-22T16:48:33',
    orderId: '2233522193',
    expiry: '2025-01-29T16:48:32',
    leverage: 20,
  },
  {
    symbol: 'CME_MINI:MES1!',
    side: 'buy',
    type: 'stop',
    quantity: 1,
    stopPrice: 6490.50,
    fillPrice: 6490.50,
    status: 'filled',
    placingTime: '2025-01-22T16:48:21',
    orderId: '2233521407',
    expiry: '2025-01-29T16:48:21',
    leverage: 20,
  },
  {
    symbol: 'CME_MINI:ES1!',
    side: 'sell',
    type: 'market',
    quantity: 1,
    status: 'cancelled',
    placingTime: '2025-01-22T16:30:15',
    orderId: '2233521000',
    expiry: '2025-01-29T16:30:15',
    leverage: 10,
  },
  {
    symbol: 'CME_MINI:NQ1!',
    side: 'buy',
    type: 'limit',
    quantity: 1,
    limitPrice: 18500.00,
    status: 'rejected',
    placingTime: '2025-01-22T16:15:45',
    orderId: '2233520500',
    expiry: '2025-01-29T16:15:45',
    leverage: 15,
    instruction: 'Insufficient margin',
  },
];

export const dummyPrices: PriceData[] = [
  {
    symbol: 'CME_MINI:MES1!',
    currentPrice: 6489.75,
    previousPrice: 6490.50,
    change: -0.75,
    changePercent: -0.012,
    lastUpdate: '16:48:30',
  },
  {
    symbol: 'CME_MINI:ES1!',
    currentPrice: 5120.50,
    previousPrice: 5125.25,
    change: -4.75,
    changePercent: -0.093,
    lastUpdate: '16:48:28',
  },
  {
    symbol: 'CME_MINI:NQ1!',
    currentPrice: 18495.25,
    previousPrice: 18490.00,
    change: 5.25,
    changePercent: 0.028,
    lastUpdate: '16:48:32',
  },
  {
    symbol: 'CME_MINI:YM1!',
    currentPrice: 38750.75,
    previousPrice: 38745.50,
    change: 5.25,
    changePercent: 0.014,
    lastUpdate: '16:48:29',
  },
];
