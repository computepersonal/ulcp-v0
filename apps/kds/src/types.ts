export interface KdsConfig {
  tenant_id: string;
  branch_id: string;
  station: 'kitchen' | 'bar';
  device_token: string;
  business_name?: string;
  branch_name?: string;
}

export interface KotItem {
  id: string;
  name: string;
  quantity: number;
  status: 'pending' | 'preparing' | 'ready' | 'served';
  notes?: string;
}

export interface Kot {
  id: string;
  kot_number: string;
  table_name?: string;
  order_type: string;
  status: 'pending' | 'acknowledged' | 'preparing' | 'ready' | 'served';
  items: KotItem[];
  created_at: string;
  tenant_id: string;
  branch_id: string;
}
