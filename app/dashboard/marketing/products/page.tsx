"use client";
// app/dashboard/marketing/products/page.tsx
// Gym retail, supplements, merchandise, and product listing catalog.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ShoppingBag, Plus, Search, Package, AlertTriangle, CheckCircle,
  Tag, Edit3, Trash2, X, ChevronRight, Layers, DollarSign,
  TrendingUp, ArrowDown, ArrowUp, RefreshCw
} from "lucide-react";
import { DesignStyles } from "../../components/DesignSystem";
import { useToast } from "../../components/ui";

interface GymProduct {
  id: string;
  name: string;
  sku: string;
  category: "Supplements" | "Apparel" | "Accessories" | "Nutrition & Drinks" | "Equipment";
  price: number; // in INR
  costPrice?: number;
  stock: number;
  description?: string;
  isActive: boolean;
  createdAt: string;
}

const DEFAULT_PRODUCTS: GymProduct[] = [
  {
    id: "prod-1",
    name: "100% Whey Protein Isolate (2kg)",
    sku: "SUPP-WPI-01",
    category: "Supplements",
    price: 4499,
    costPrice: 3200,
    stock: 18,
    description: "Ultra-filtered whey protein isolate, 27g protein per serving. Belgian Chocolate flavor.",
    isActive: true,
    createdAt: "2026-10-15",
  },
  {
    id: "prod-2",
    name: "Micronized Creatine Monohydrate (300g)",
    sku: "SUPP-CRM-02",
    category: "Supplements",
    price: 1199,
    costPrice: 750,
    stock: 24,
    description: "100% pure micronized creatine for explosive strength and recovery.",
    isActive: true,
    createdAt: "2026-10-18",
  },
  {
    id: "prod-3",
    name: "Premium Gym Performance T-Shirt",
    sku: "APP-TEE-BLK-L",
    category: "Apparel",
    price: 799,
    costPrice: 420,
    stock: 4, // low stock alert
    description: "Breathable moisture-wicking dry-fit tee with gym logo print.",
    isActive: true,
    createdAt: "2026-10-22",
  },
  {
    id: "prod-4",
    name: "Matte Black Stainless Steel Shaker (750ml)",
    sku: "ACC-SHK-750",
    category: "Accessories",
    price: 649,
    costPrice: 350,
    stock: 12,
    description: "Double-wall insulated shaker bottle with built-in blending whisk.",
    isActive: true,
    createdAt: "2026-10-25",
  },
  {
    id: "prod-5",
    name: "Heavy Duty Padded Lifting Straps (Pair)",
    sku: "ACC-STR-HD",
    category: "Accessories",
    price: 499,
    costPrice: 220,
    stock: 2, // low stock
    description: "Cotton blend with neoprene wrist padding for heavy deadlifts.",
    isActive: true,
    createdAt: "2026-11-02",
  },
  {
    id: "prod-6",
    name: "Sparkling Pre-Workout Energy Drink (330ml Can)",
    sku: "DRK-PWO-CAN",
    category: "Nutrition & Drinks",
    price: 180,
    costPrice: 110,
    stock: 35,
    description: "Zero sugar energy drink with 200mg natural caffeine and beta-alanine.",
    isActive: true,
    createdAt: "2026-11-10",
  },
  {
    id: "prod-7",
    name: "Fabric Resistance Booty Bands Set (3 Levels)",
    sku: "EQP-RES-SET",
    category: "Equipment",
    price: 899,
    costPrice: 450,
    stock: 0, // out of stock
    description: "Non-slip fabric loop bands for glute activation and warm-ups.",
    isActive: true,
    createdAt: "2026-11-12",
  },
];

const STORAGE_KEY = "psync.marketing.products.v1";

export default function ProductListingPage() {
  const { toast, show } = useToast();
  const [products, setProducts] = useState<GymProduct[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<GymProduct | null>(null);
  const [form, setForm] = useState<Partial<GymProduct>>({
    category: "Supplements",
    isActive: true,
    stock: 10,
  });

  // Load from local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setProducts(JSON.parse(saved));
      } else {
        setProducts(DEFAULT_PRODUCTS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_PRODUCTS));
      }
    } catch {
      setProducts(DEFAULT_PRODUCTS);
    }
  }, []);

  function saveProducts(list: GymProduct[]) {
    setProducts(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
  }

  // Stock quick adjustment
  function handleAdjustStock(id: string, delta: number) {
    const updated = products.map((p) => {
      if (p.id === id) {
        const next = Math.max(0, p.stock + delta);
        return { ...p, stock: next };
      }
      return p;
    });
    saveProducts(updated);
  }

  // Open Create Modal
  function handleOpenCreate() {
    setEditingProduct(null);
    setForm({
      name: "",
      sku: "SKU-" + Math.floor(1000 + Math.random() * 9000),
      category: "Supplements",
      price: 999,
      costPrice: 600,
      stock: 10,
      description: "",
      isActive: true,
    });
    setIsModalOpen(true);
  }

  // Open Edit Modal
  function handleOpenEdit(prod: GymProduct) {
    setEditingProduct(prod);
    setForm({ ...prod });
    setIsModalOpen(true);
  }

  // Save Modal
  function handleSave() {
    if (!form.name?.trim()) {
      show("Product name is required", "error");
      return;
    }
    if (form.price === undefined || form.price < 0) {
      show("Please enter a valid price", "error");
      return;
    }

    if (editingProduct) {
      const updated = products.map((p) =>
        p.id === editingProduct.id ? ({ ...p, ...form } as GymProduct) : p
      );
      saveProducts(updated);
      show(`Updated "${form.name}"`);
    } else {
      const newProduct: GymProduct = {
        id: "prod-" + Date.now(),
        name: form.name.trim(),
        sku: form.sku?.trim() || "SKU-" + Date.now().toString().slice(-4),
        category: form.category || "Supplements",
        price: Number(form.price) || 0,
        costPrice: Number(form.costPrice) || 0,
        stock: Number(form.stock) || 0,
        description: form.description?.trim() || "",
        isActive: form.isActive !== false,
        createdAt: new Date().toISOString().slice(0, 10),
      };
      saveProducts([newProduct, ...products]);
      show(`Added product "${newProduct.name}"`);
    }
    setIsModalOpen(false);
  }

  // Delete
  function handleDelete(id: string, name: string) {
    if (!confirm(`Delete product "${name}"?`)) return;
    const remaining = products.filter((p) => p.id !== id);
    saveProducts(remaining);
    show(`Deleted "${name}"`);
  }

  // Filtered Products
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
      if (stockFilter === "in_stock" && p.stock <= 5) return false;
      if (stockFilter === "low_stock" && (p.stock <= 0 || p.stock > 5)) return false;
      if (stockFilter === "out_of_stock" && p.stock > 0) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.sku.toLowerCase().includes(q);
        const matchCat = p.category.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchCat) return false;
      }
      return true;
    });
  }, [products, categoryFilter, stockFilter, search]);

  // Stats calculations
  const totalUnits = products.reduce((acc, p) => acc + (p.stock || 0), 0);
  const lowStockCount = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const outOfStockCount = products.filter((p) => p.stock === 0).length;
  const totalValuation = products.reduce((acc, p) => acc + (p.price * p.stock), 0);

  return (
    <div className="ps-page db">
      <DesignStyles />
      {toast}

      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: "var(--text-tertiary)" }}>Marketing</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>
            Product Listing
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 14 }}>
            Manage gym merchandise, protein supplements, training gear, and retail stock.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" className="ps-btn ps-btn--primary" onClick={handleOpenCreate}>
            <Plus size={16} strokeWidth={2.4} /> <span>Add Product</span>
          </button>
        </div>
      </header>

      {/* KPI Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 14, marginBottom: 24 }}>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Catalog Products</span>
            <Package size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>{products.length}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Active SKU items</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Total Inventory</span>
            <Layers size={18} style={{ color: "var(--green)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>{totalUnits}</div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Units in stock</div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Low / Out of Stock</span>
            <AlertTriangle size={18} style={{ color: lowStockCount + outOfStockCount > 0 ? "var(--amber)" : "var(--green)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: lowStockCount + outOfStockCount > 0 ? "var(--amber)" : "var(--text-primary)" }}>
            {lowStockCount + outOfStockCount}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>
            {lowStockCount} low, {outOfStockCount} out of stock
          </div>
        </div>

        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, padding: "16px 18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>Stock Value</span>
            <DollarSign size={18} style={{ color: "var(--purple)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "var(--text-primary)" }}>
            ₹{totalValuation.toLocaleString("en-IN")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 4 }}>Retail retail valuation</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 16,
          background: "var(--surface)",
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid var(--border)",
        }}
      >
        <div style={{ flex: 1, minWidth: 200, position: "relative" }}>
          <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)" }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products by name, SKU, or category..."
            className="ps-input"
            style={{ width: "100%", paddingLeft: 32, height: 36, fontSize: 13 }}
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All categories</option>
          <option value="Supplements">Supplements</option>
          <option value="Apparel">Apparel</option>
          <option value="Accessories">Accessories</option>
          <option value="Nutrition & Drinks">Nutrition & Drinks</option>
          <option value="Equipment">Equipment</option>
        </select>

        <select
          value={stockFilter}
          onChange={(e) => setStockFilter(e.target.value)}
          className="ps-select"
          style={{ height: 36, fontSize: 13 }}
        >
          <option value="all">All stock levels</option>
          <option value="in_stock">In Stock (&gt; 5)</option>
          <option value="low_stock">Low Stock (≤ 5)</option>
          <option value="out_of_stock">Out of Stock (0)</option>
        </select>
      </div>

      {/* Products Table */}
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "56px 20px" }}>
            <ShoppingBag size={36} style={{ color: "var(--text-tertiary)", margin: "0 auto 12px" }} />
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>No products found</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: 13.5, margin: "0 0 16px" }}>
              Add supplements, gym apparel, or energy drinks to your catalog.
            </p>
            <button type="button" className="ps-btn ps-btn--primary" onClick={handleOpenCreate}>
              <Plus size={15} /> Add first product
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: 12.5, fontWeight: 650 }}>
                  <th style={{ padding: "12px 16px" }}>Product</th>
                  <th style={{ padding: "12px 14px" }}>Category</th>
                  <th style={{ padding: "12px 14px" }}>SKU</th>
                  <th style={{ padding: "12px 14px" }}>Price</th>
                  <th style={{ padding: "12px 14px" }}>Inventory</th>
                  <th style={{ padding: "12px 14px" }}>Status</th>
                  <th style={{ padding: "12px 16px", textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((prod) => {
                  const isOut = prod.stock === 0;
                  const isLow = prod.stock > 0 && prod.stock <= 5;

                  return (
                    <tr key={prod.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 650, color: "var(--text-primary)" }}>{prod.name}</div>
                        {prod.description && (
                          <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {prod.description}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            padding: "3px 8px",
                            borderRadius: 6,
                            background: "var(--surface-2)",
                            color: "var(--text-secondary)",
                          }}
                        >
                          {prod.category}
                        </span>
                      </td>

                      <td style={{ padding: "14px 14px", fontFamily: "monospace", fontSize: 12, color: "var(--text-tertiary)" }}>
                        {prod.sku}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <div style={{ fontWeight: 700, color: "var(--text-primary)" }}>
                          ₹{prod.price.toLocaleString("en-IN")}
                        </div>
                        {prod.costPrice ? (
                          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)" }}>
                            Cost: ₹{prod.costPrice.toLocaleString("en-IN")}
                          </div>
                        ) : null}
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(prod.id, -1)}
                            disabled={prod.stock === 0}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 5,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              cursor: prod.stock === 0 ? "not-allowed" : "pointer",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--text-secondary)",
                            }}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center", color: isOut ? "var(--red)" : isLow ? "var(--amber)" : "var(--text-primary)" }}>
                            {prod.stock}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustStock(prod.id, 1)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 5,
                              border: "1px solid var(--border)",
                              background: "var(--surface)",
                              cursor: "pointer",
                              display: "grid",
                              placeItems: "center",
                              fontSize: 13,
                              fontWeight: 700,
                              color: "var(--text-secondary)",
                            }}
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td style={{ padding: "14px 14px" }}>
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 700,
                            padding: "3px 8px",
                            borderRadius: 12,
                            background: isOut
                              ? "rgba(220, 38, 38, 0.12)"
                              : isLow
                              ? "rgba(245, 158, 11, 0.12)"
                              : "rgba(34, 197, 94, 0.12)",
                            color: isOut ? "var(--red)" : isLow ? "var(--amber)" : "var(--green)",
                          }}
                        >
                          {isOut ? "Out of Stock" : isLow ? "Low Stock" : "In Stock"}
                        </span>
                      </td>

                      <td style={{ padding: "14px 16px", textAlign: "right" }}>
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <button
                            type="button"
                            className="ps-btn ps-btn--secondary"
                            style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                            onClick={() => handleOpenEdit(prod)}
                          >
                            <Edit3 size={13} /> Edit
                          </button>
                          <button
                            type="button"
                            className="ps-btn ps-btn--secondary"
                            style={{ height: 28, padding: "0 8px", color: "var(--red)" }}
                            onClick={() => handleDelete(prod.id, prod.name)}
                            title="Delete product"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal for Add / Edit */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "grid",
            placeItems: "center",
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: 16,
              maxWidth: 480,
              width: "100%",
              padding: 24,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid var(--border)",
              maxHeight: "90vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                {editingProduct ? "Edit Product" : "Add New Product"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer" }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Product Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Whey Protein Isolate"
                  value={form.name || ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="ps-input"
                  style={{ width: "100%", height: 38 }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Category
                  </label>
                  <select
                    value={form.category || "Supplements"}
                    onChange={(e) => setForm({ ...form, category: e.target.value as GymProduct["category"] })}
                    className="ps-select"
                    style={{ width: "100%", height: 38 }}
                  >
                    <option value="Supplements">Supplements</option>
                    <option value="Apparel">Apparel</option>
                    <option value="Accessories">Accessories</option>
                    <option value="Nutrition & Drinks">Nutrition & Drinks</option>
                    <option value="Equipment">Equipment</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    SKU / Barcode
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SUPP-001"
                    value={form.sku || ""}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Selling Price (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="999"
                    value={form.price ?? ""}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="650"
                    value={form.costPrice ?? ""}
                    onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })}
                    className="ps-input"
                    style={{ width: "100%", height: 38 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Current Stock Units
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.stock ?? 0}
                  onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                  className="ps-input"
                  style={{ width: "100%", height: 38 }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: 12.5, fontWeight: 600, marginBottom: 4, color: "var(--text-secondary)" }}>
                  Description / Specification
                </label>
                <textarea
                  placeholder="Size, flavor, volume, or key benefits..."
                  value={form.description || ""}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="ps-input"
                  style={{ width: "100%", minHeight: 65, paddingTop: 8 }}
                />
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  className="ps-btn ps-btn--secondary"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ps-btn ps-btn--primary"
                  onClick={handleSave}
                >
                  {editingProduct ? "Save Changes" : "Add Product"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
