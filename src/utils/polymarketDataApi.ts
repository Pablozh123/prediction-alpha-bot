import axios from "axios";

const POLYMARKET_DATA_API_TIMEOUT_MS = 15_000;
const POLYMARKET_DATA_API_BASE_URL = "https://data-api.polymarket.com";

export type PolymarketPosition = Record<string, unknown>;
export type PolymarketActivity = Record<string, unknown>;

export async function fetchPositions(
  address: string
): Promise<PolymarketPosition[]> {
  const response = await axios.get<PolymarketPosition[]>(
    `${POLYMARKET_DATA_API_BASE_URL}/positions`,
    {
      params: {
        user: address,
        sizeThreshold: 0.1,
        limit: 500
      },
      timeout: POLYMARKET_DATA_API_TIMEOUT_MS
    }
  );

  return response.data;
}

export async function fetchActivity(
  address: string,
  limit = 100
): Promise<PolymarketActivity[]> {
  const response = await axios.get<PolymarketActivity[]>(
    `${POLYMARKET_DATA_API_BASE_URL}/activity`,
    {
      params: {
        user: address,
        type: "TRADE",
        limit
      },
      timeout: POLYMARKET_DATA_API_TIMEOUT_MS
    }
  );

  return response.data;
}
