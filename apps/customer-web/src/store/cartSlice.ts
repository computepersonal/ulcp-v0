import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface CartItem {
  id: string;
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  variant?: string;
  notes?: string;
}

interface CartState {
  items: CartItem[];
  tenant_id: string | null;
  branch_id: string | null;
  business_type: string | null;
  slug: string | null;
  place_name: string | null;
  table_id: string | null;
  table_name: string | null;
}

const initialState: CartState = { items: [], tenant_id: null, branch_id: null, business_type: null, slug: null, place_name: null, table_id: null, table_name: null };

export const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addItem(
      state,
      action: PayloadAction<CartItem & { tenant_id: string; branch_id: string; business_type: string; slug: string; place_name?: string; table_id?: string; table_name?: string }>
    ) {
      const { tenant_id, branch_id, business_type, slug, place_name, table_id, table_name, ...item } = action.payload;
      if (state.tenant_id && state.tenant_id !== tenant_id) {
        state.items = [];
      }
      state.tenant_id = tenant_id;
      state.branch_id = branch_id;
      state.business_type = business_type;
      state.slug = slug;
      if (place_name) state.place_name = place_name;
      if (table_id) state.table_id = table_id;
      if (table_name) state.table_name = table_name;
      const existing = state.items.find(
        (i) => i.item_id === item.item_id && i.variant === item.variant
      );
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        state.items.push(item);
      }
    },
    updateQuantity(
      state,
      action: PayloadAction<{ id: string; quantity: number }>
    ) {
      const item = state.items.find((i) => i.id === action.payload.id);
      if (item) item.quantity = action.payload.quantity;
      state.items = state.items.filter((i) => i.quantity > 0);
    },
    clearCart(state) {
      state.items = [];
      state.tenant_id = null;
      state.branch_id = null;
      state.business_type = null;
      state.slug = null;
      state.place_name = null;
      state.table_id = null;
      state.table_name = null;
    }
  }
});

export const { addItem, updateQuantity, clearCart } = cartSlice.actions;
export default cartSlice.reducer;
