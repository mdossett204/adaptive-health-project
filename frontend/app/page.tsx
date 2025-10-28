"use client";

import { useState, useEffect, useCallback } from "react";
import { getItems, createItem, Item } from "@/lib/api";

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getItems();
      if (result.success) {
        setItems(result.data ?? []);
      }
    } catch (error) {
      console.error("Error loading items:", error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  async function handleCreate() {
    try {
      await createItem({ name: "Test Item", value: 123 });
      loadItems();
    } catch (error) {
      console.error("Error creating item:", error);
    }
  }

  return (
    <div>
      <button onClick={handleCreate}>Create Item</button>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {items.map((item: Item, index: number) => (
            <li key={index}>{item.name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
