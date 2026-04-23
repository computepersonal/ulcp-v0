# customer-web — Domain Context

> Platform-wide conventions are in the **root CLAUDE.md**.
> Shared frontend design system and state management are in **apps/CLAUDE.md**.
> This file contains customer PWA-specific domain knowledge only.

---

## CUSTOMER PWA NAVIGATION

### Two Contexts

**PLATFORM HOME:**
- Top: hamburger + LocalCommerce + profile icon
- Bottom: Home | Explore
- Drawer: saved places, discover, support
- Profile dropdown: all orders (cross-business), loyalty (platform)

**INSIDE A PLACE (after QR scan):**
- Top: hamburger + Place Name (brand color) + profile icon
- Bottom: Home | Menu (+ floating elements)
- Drawer: place-specific

### Bottom Bar State Machine

```
Platform home:     Home | Explore
No items in cart:  Home | Menu
Items in cart:     Home | Menu + floating cart pill
Order placed:      Home | Menu + Track tab (with dot)
```

### Floating Cart Pill

Fixed above bottom bar, full width minus 16px margins
Height 52px, radius 16px, brand-500 bg
Content: cart count + total + View Cart arrow
Slide up on first item, bounce on each add
Disappears when order placed → Track appears

### Side Drawer Inside Place

280px, slides from left 200ms
Header: cover photo + logo + name + rating + hours
Links: Menu, Our Team (type-adaptive), Offers, Events, About, Help & Support, Exit Place

### Data Scoping

- Order history: place-scoped inside, all orders on platform home
- Loyalty: tenant points inside, platform points on home
- Profile icon (top right): always personal, never place-scoped

---

## CUSTOMER PWA SCREENS

### 1. Platform Home

Greeting, saved places grid (dots + pin badges), scan QR card
Popular near you, recently visited

### 2. Catalogue / Menu

Cover banner, business info, search, filter chips
Sections (collapsible), item cards with add button
Floating cart pill on first add

### 3. Item Detail

Full image, name, desc, rating, allergens
Variants (brand selected state)
Customisation, special instructions
Reviews (top 3 + see all), recommendations
Sticky: price + qty control + Add button

### 4. Cart

Items + qty controls, coupon input
Loyalty redemption toggle
Bill summary (subtotal, discount, points, GST, total)
Special instructions, Place Order sticky bottom

### 5. Payment

Order summary, dynamic payment methods (region-based)
Razorpay/Stripe SDK handles card UI
Security badge

### 6. Order Tracking

Dine-in: step progress + per-item status
Delivery: live map + rider info + steps
Call Waiter / Message Kitchen actions
Add more items link

### 7. Order History (place-scoped)

Orders at [Place Name] header
Cards with reorder button
Tenant loyalty points shown below
