import usePersistentState from './usePersistentState';
import {
  DEFAULT_MARKET_ITEMS,
  DEFAULT_MARKET_ORDERS,
  DEFAULT_HOUSING_ITEMS,
  DEFAULT_HOUSING_CONTRACTS,
} from '../data/campusDefaults';

// Dữ liệu Chợ cũ & Phòng trọ, tự lưu LocalStorage
export default function useCampusData() {
  const [marketItems, setMarketItems] = usePersistentState('u2_market_items', DEFAULT_MARKET_ITEMS);
  const [marketOrders, setMarketOrders] = usePersistentState('u2_market_orders', DEFAULT_MARKET_ORDERS);
  const [housingItems, setHousingItems] = usePersistentState('u2_housing_items', DEFAULT_HOUSING_ITEMS);
  const [housingContracts, setHousingContracts] = usePersistentState(
    'u2_housing_contracts',
    DEFAULT_HOUSING_CONTRACTS
  );

  return {
    marketItems,
    setMarketItems,
    marketOrders,
    setMarketOrders,
    housingItems,
    setHousingItems,
    housingContracts,
    setHousingContracts,
  };
}
