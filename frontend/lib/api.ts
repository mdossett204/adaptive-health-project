// lib/api.ts
const CREATE_ITEM_URL = process.env.NEXT_PUBLIC_MODAL_CREATE_ITEM_URL!;

const GET_ITEMS_URL = process.env.NEXT_PUBLIC_MODAL_GET_ITEM_URL!;

export interface Item {
  name: string;
  value: number;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function createItem(item: Item): Promise<ApiResponse<Item>> {
  const response = await fetch(CREATE_ITEM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(item),
  });

  if (!response.ok) {
    throw new Error("Failed to create item");
  }

  return response.json();
}

export async function getItems(): Promise<ApiResponse<Item[]>> {
  const response = await fetch(GET_ITEMS_URL);

  if (!response.ok) {
    throw new Error("Failed to fetch items");
  }

  return response.json();
}
