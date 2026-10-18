import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/feedback/ToastProvider';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { ReplenishmentPage } from '../features/replenishment/ReplenishmentPage';
import { apiClient } from '../lib/api-client';

vi.mock('../lib/api-client', () => ({
  apiClient: {
    listStores: vi.fn(),
    listInventory: vi.fn(),
    listMovements: vi.fn(),
    listRecommendations: vi.fn(),
    approveRecommendation: vi.fn(),
    executeRecommendation: vi.fn(),
    rejectRecommendation: vi.fn(),
    generateRecommendations: vi.fn(),
    emergencySurgeRestock: vi.fn(),
    checkHealth: vi.fn(),
  },
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

describe('Inventory & Replenishment Store Grouping and Refuel Linking', () => {
  const mockStores = [
    {
      id: 'store-manhattan-demo-02',
      name: 'DarkStore Manhattan Urban Network #02',
      status: 'ACTIVE',
      latitude: 40.73,
      longitude: -73.99,
      service_radius_km: 8,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'store-ord-1792148625903',
      name: 'DarkStore SoHo & Lower Manhattan #03',
      status: 'ACTIVE',
      latitude: 40.72,
      longitude: -74.00,
      service_radius_km: 8,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockInventory = [
    {
      id: 'inv-1',
      store_id: 'store-manhattan-demo-02',
      store_name: 'DarkStore Manhattan Urban Network #02',
      sku_id: 'sku-banana',
      sku_code: 'SKU-BANANA-01',
      product_name: 'Organic Fair-Trade Bananas 1kg',
      physical_on_hand: 5,
      reserved_stock: 0,
      available_stock: 5,
      safety_stock: 15,
      min_threshold: 15,
      unit_of_measure: 'kg',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-2',
      store_id: 'store-manhattan-demo-02',
      store_name: 'DarkStore Manhattan Urban Network #02',
      sku_id: 'sku-avocado',
      sku_code: 'SKU-AVO-02',
      product_name: 'Organic Hass Avocados (3-Pack)',
      physical_on_hand: 50,
      reserved_stock: 5,
      available_stock: 45,
      safety_stock: 10,
      min_threshold: 10,
      unit_of_measure: 'units',
      updated_at: new Date().toISOString(),
    },
    {
      id: 'inv-3',
      store_id: 'store-ord-1792148625903',
      store_name: 'DarkStore SoHo & Lower Manhattan #03',
      sku_id: 'sku-milk',
      sku_code: 'SKU-MILK-01',
      product_name: 'Farm Fresh Whole Milk 1L',
      physical_on_hand: 80,
      reserved_stock: 10,
      available_stock: 70,
      safety_stock: 15,
      min_threshold: 15,
      unit_of_measure: 'units',
      updated_at: new Date().toISOString(),
    },
  ];

  it('renders InventoryPage with store tabs and groups products by store', async () => {
    vi.mocked(apiClient.listStores).mockResolvedValue({ data: mockStores });
    vi.mocked(apiClient.listInventory).mockResolvedValue({
      data: mockInventory,
      pagination: { total: 3, page: 1, limit: 100, total_pages: 1 },
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter>
            <InventoryPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Verify page header
    expect(await screen.findByText(/Inventory & Stock Ledger/i)).toBeInTheDocument();

    // Verify store filter buttons exist
    expect(await screen.findByRole('button', { name: /All Dark Stores/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /DarkStore Manhattan Urban Network #02/i })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /DarkStore SoHo & Lower Manhattan #03/i })).toBeInTheDocument();

    // Verify products are grouped under store headers
    expect(await screen.findByText(/Organic Fair-Trade Bananas 1kg/i)).toBeInTheDocument();
    expect(await screen.findByText(/Organic Hass Avocados/i)).toBeInTheDocument();
    expect(await screen.findByText(/Farm Fresh Whole Milk 1L/i)).toBeInTheDocument();

    // Verify Refuel button exists for low-stock item (Banana: 5 ATP < 15 safety target)
    const refuelBtn = await screen.findByRole('button', { name: /Refuel/i });
    expect(refuelBtn).toBeInTheDocument();
  }, 15000);

  it('filters to a single store when store tab is clicked', async () => {
    vi.mocked(apiClient.listStores).mockResolvedValue({ data: mockStores });
    vi.mocked(apiClient.listInventory).mockResolvedValue({
      data: mockInventory.filter((i) => i.store_id === 'store-manhattan-demo-02'),
      pagination: { total: 2, page: 1, limit: 100, total_pages: 1 },
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/inventory?storeId=store-manhattan-demo-02']}>
            <InventoryPage selectedStoreId="store-manhattan-demo-02" />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Verify store spotlight banner rendered
    expect(
      await screen.findByText(/Showing all registered inventory positions for this dark store/i)
    ).toBeInTheDocument();
  }, 15000);

  it('renders ReplenishmentPage with target refuel banner when targetSkuId is in query params', async () => {
    vi.mocked(apiClient.listStores).mockResolvedValue({ data: mockStores });
    vi.mocked(apiClient.listRecommendations).mockResolvedValue({
      data: [
        {
          id: 'rec-banana-01',
          store_id: 'store-manhattan-demo-02',
          sku_id: 'sku-banana',
          sku_code: 'SKU-BANANA-01',
          product_name: 'Organic Fair-Trade Bananas 1kg',
          suggested_quantity: 100,
          recommended_quantity: 100,
          current_inventory: 5,
          safety_stock_deficit: 10,
          status: 'PENDING',
          supplier_name: 'Del Monte Organics',
          min_order_quantity: 50,
          pack_size: 10,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
      pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <MemoryRouter
            initialEntries={[
              '/replenishment?targetSkuId=sku-banana&targetStoreId=store-manhattan-demo-02&targetName=Organic%20Fair-Trade%20Bananas%201kg',
            ]}
          >
            <ReplenishmentPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Verify Active Refuel Target Banner
    expect(await screen.findByText(/Active Refuel Target/i)).toBeInTheDocument();
    expect(await screen.findByText(/Organic Fair-Trade Bananas 1kg/i)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Approve PO \(\+100 units\)/i })).toBeInTheDocument();

    // Verify Target Item badge in table row
    expect(await screen.findByText(/Target Item/i)).toBeInTheDocument();
  }, 15000);
});
