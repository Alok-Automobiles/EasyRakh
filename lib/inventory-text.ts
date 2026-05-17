/** Uppercase trimmed inventory text fields for persistence (URLs excluded). */
export function uppercaseInventoryPayload<
  T extends {
    itemName: string;
    itemNumber: string;
    uniqueCode: string;
    location: string;
    unitOfMeasure: string;
    brand: string;
    description: string;
    supplier: string;
  },
>(data: T): T {
  return {
    ...data,
    itemName: data.itemName.toUpperCase(),
    itemNumber: data.itemNumber.toUpperCase(),
    uniqueCode: data.uniqueCode.toUpperCase(),
    location: data.location.toUpperCase(),
    unitOfMeasure: data.unitOfMeasure.toUpperCase(),
    brand: data.brand.toUpperCase(),
    description: data.description.toUpperCase(),
    supplier: data.supplier.toUpperCase(),
  };
}
