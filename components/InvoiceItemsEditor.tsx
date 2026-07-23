'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface EditableInvoiceItem {
  id: string;
  inventoryItemId?: string;
  itemNumber: string;
  itemName: string;
  quantity: number;
  quantityInput?: string;
  amount: number;
  amountInput?: string;
  unitCost?: number;
  unitCostInput?: string;
}

interface InventorySuggestion {
  id: string;
  itemNumber: string;
  itemName: string;
  quantity: number;
  unitOfMeasure: string;
  buyingPrice: number | null;
}

type ItemField = 'itemNumber' | 'itemName' | 'quantity' | 'amount' | 'unitCost';

interface InvoiceItemsEditorProps {
  items: EditableInvoiceItem[];
  onChange: (items: EditableInvoiceItem[]) => void;
  suggestionDelayMs?: number;
}

const itemFields: ItemField[] = ['itemNumber', 'itemName', 'quantity', 'amount', 'unitCost'];

export function createEmptyInvoiceItem(id = `${Date.now()}`): EditableInvoiceItem {
  return {
    id,
    inventoryItemId: undefined,
    itemNumber: '',
    itemName: '',
    quantity: 0,
    quantityInput: '',
    amount: 0,
    amountInput: '',
    unitCost: undefined,
    unitCostInput: '',
  };
}

function parseNumberInput(value: string) {
  if (value.trim() === '') return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getNumberInputValue(value: number, inputValue?: string) {
  if (inputValue !== undefined) return inputValue;
  return value ? String(value) : '';
}

export default function InvoiceItemsEditor({
  items,
  onChange,
  suggestionDelayMs = 250,
}: InvoiceItemsEditorProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const suggestionMenuRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<
    Record<string, Partial<Record<ItemField, HTMLInputElement | null>>>
  >({});
  const [pendingFocus, setPendingFocus] = useState<{ itemId: string; field: ItemField } | null>(
    null
  );
  const [activePartInput, setActivePartInput] = useState<{
    itemId: string;
    query: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<InventorySuggestion[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestionMenuPosition, setSuggestionMenuPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const setInputRef = useCallback(
    (itemId: string, field: ItemField, node: HTMLInputElement | null) => {
      if (!inputRefs.current[itemId]) {
        inputRefs.current[itemId] = {};
      }
      inputRefs.current[itemId][field] = node;
    },
    []
  );

  const focusInput = useCallback((itemId: string, field: ItemField) => {
    const node = inputRefs.current[itemId]?.[field];
    if (node) {
      node.focus();
      node.select();
    } else {
      setPendingFocus({ itemId, field });
    }
  }, []);

  useEffect(() => {
    if (!pendingFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const node = inputRefs.current[pendingFocus.itemId]?.[pendingFocus.field];
      if (node) {
        node.focus();
        node.select();
        setPendingFocus(null);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [items, pendingFocus]);

  const updateItem = useCallback(
    (itemId: string, updates: Partial<EditableInvoiceItem>) => {
      onChange(items.map((item) => (item.id === itemId ? { ...item, ...updates } : item)));
    },
    [items, onChange]
  );

  const addItem = useCallback(() => {
    const newItem = createEmptyInvoiceItem(`${Date.now()}-${items.length}`);
    onChange([...items, newItem]);
    setPendingFocus({ itemId: newItem.id, field: 'itemNumber' });
  }, [items, onChange]);

  const removeItem = useCallback(
    (itemId: string) => {
      if (items.length === 1) {
        toast.error('At least one item is required');
        return;
      }
      onChange(items.filter((item) => item.id !== itemId));
    },
    [items, onChange]
  );

  const closeSuggestions = useCallback(() => {
    setActivePartInput(null);
    setSuggestions([]);
    setHighlightedIndex(0);
    setLoadingSuggestions(false);
    setSuggestionMenuPosition(null);
  }, []);

  const updateSuggestionMenuPosition = useCallback(() => {
    if (!activePartInput) {
      setSuggestionMenuPosition(null);
      return;
    }

    const node = inputRefs.current[activePartInput.itemId]?.itemNumber;
    if (!node) {
      setSuggestionMenuPosition(null);
      return;
    }

    const rect = node.getBoundingClientRect();
    setSuggestionMenuPosition({
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
    });
  }, [activePartInput]);

  useEffect(() => {
    const query = activePartInput?.query.trim();
    if (!activePartInput || !query) {
      setSuggestions([]);
      setLoadingSuggestions(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingSuggestions(true);
      try {
        const params = new URLSearchParams({ itemNumber: query, limit: '8' });
        const response = await fetch(`/api/inventory/suggestions?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          setSuggestions([]);
          return;
        }
        const result = (await response.json()) as { items?: InventorySuggestion[] };
        setSuggestions(result.items || []);
        setHighlightedIndex(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setSuggestions([]);
        }
      } finally {
        setLoadingSuggestions(false);
      }
    }, suggestionDelayMs);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activePartInput, suggestionDelayMs]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !suggestionMenuRef.current?.contains(target)
      ) {
        closeSuggestions();
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [closeSuggestions]);

  useEffect(() => {
    if (!activePartInput) return;

    updateSuggestionMenuPosition();
    window.addEventListener('resize', updateSuggestionMenuPosition);
    window.addEventListener('scroll', updateSuggestionMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateSuggestionMenuPosition);
      window.removeEventListener('scroll', updateSuggestionMenuPosition, true);
    };
  }, [activePartInput, updateSuggestionMenuPosition]);

  const selectSuggestion = useCallback(
    (itemId: string, suggestion: InventorySuggestion) => {
      updateItem(itemId, {
        inventoryItemId: suggestion.id,
        itemNumber: suggestion.itemNumber,
        itemName: suggestion.itemName,
        unitCost: suggestion.buyingPrice ?? undefined,
        unitCostInput: suggestion.buyingPrice == null ? '' : String(suggestion.buyingPrice),
      });
      closeSuggestions();
      focusInput(itemId, 'quantity');
    },
    [closeSuggestions, focusInput, updateItem]
  );

  const focusRelativeInput = useCallback(
    (itemId: string, field: ItemField, direction: 1 | -1) => {
      const currentRowIndex = items.findIndex((item) => item.id === itemId);
      const currentFieldIndex = itemFields.indexOf(field);
      if (currentRowIndex === -1 || currentFieldIndex === -1) return;

      const flatIndex = currentRowIndex * itemFields.length + currentFieldIndex;
      const nextFlatIndex = flatIndex + direction;
      if (nextFlatIndex < 0) return;

      const nextRowIndex = Math.floor(nextFlatIndex / itemFields.length);
      const nextFieldIndex = nextFlatIndex % itemFields.length;
      const nextItem = items[nextRowIndex];
      if (!nextItem) return;

      focusInput(nextItem.id, itemFields[nextFieldIndex]);
    },
    [focusInput, items]
  );

  const handleItemNumberChange = (item: EditableInvoiceItem, value: string) => {
    updateItem(item.id, {
      itemNumber: value,
      inventoryItemId: undefined,
      ...(item.inventoryItemId ? { itemName: '', unitCost: undefined, unitCostInput: '' } : {}),
    });
    setActivePartInput({ itemId: item.id, query: value });
    window.requestAnimationFrame(updateSuggestionMenuPosition);
  };

  const handleKeyDown = (
    itemId: string,
    field: ItemField,
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    const suggestionsOpen = activePartInput?.itemId === itemId && suggestions.length > 0;

    if (field === 'itemNumber') {
      if (event.key === 'ArrowDown' && suggestionsOpen) {
        event.preventDefault();
        setHighlightedIndex((index) => Math.min(index + 1, suggestions.length - 1));
        return;
      }
      if (event.key === 'ArrowUp' && suggestionsOpen) {
        event.preventDefault();
        setHighlightedIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSuggestions();
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey && suggestionsOpen) {
        event.preventDefault();
        const suggestion = suggestions[highlightedIndex];
        if (suggestion) {
          selectSuggestion(itemId, suggestion);
        }
        return;
      }
    }

    if (event.key !== 'Enter') return;

    event.preventDefault();
    closeSuggestions();

    if (event.shiftKey) {
      focusRelativeInput(itemId, field, -1);
      return;
    }

    const isLastItem = items[items.length - 1]?.id === itemId;
    if (field === 'unitCost' && isLastItem) {
      addItem();
      return;
    }

    focusRelativeInput(itemId, field, 1);
  };

  const activeSuggestionsOpen =
    activePartInput && suggestionMenuPosition && (suggestions.length > 0 || loadingSuggestions);

  return (
    <div ref={rootRef} className="rounded-lg border border-gray-200 bg-white">
      <div className="overflow-x-auto rounded-lg">
        <table className="min-w-[1120px] w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <th className="w-14 px-3 py-3">S.No</th>
              <th className="w-48 px-3 py-3">Part Number</th>
              <th className="px-3 py-3">Item Name</th>
              <th className="w-32 px-3 py-3">Quantity</th>
              <th className="w-36 px-3 py-3">Selling Price</th>
              <th className="w-36 px-3 py-3">Cost Price</th>
              <th className="w-36 px-3 py-3 text-right">Line Total</th>
              <th className="w-12 px-3 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              return (
                <tr key={item.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-3 align-middle text-sm font-semibold text-gray-600">
                    {index + 1}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <Input
                      ref={(node) => setInputRef(item.id, 'itemNumber', node)}
                      value={item.itemNumber}
                      onChange={(event) => handleItemNumberChange(item, event.target.value)}
                      onFocus={() =>
                        setActivePartInput({ itemId: item.id, query: item.itemNumber })
                      }
                      onKeyDown={(event) => handleKeyDown(item.id, 'itemNumber', event)}
                      placeholder="Part number"
                      aria-label={`Row ${index + 1} part number`}
                      autoComplete="off"
                      className="h-9 bg-white shadow-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <div className="relative">
                      <Input
                        ref={(node) => setInputRef(item.id, 'itemName', node)}
                        value={item.itemName}
                        onChange={(event) =>
                          updateItem(item.id, { itemName: event.target.value })
                        }
                        onKeyDown={(event) => handleKeyDown(item.id, 'itemName', event)}
                        placeholder="Item name"
                        aria-label={`Row ${index + 1} item name`}
                        className={`h-9 bg-white shadow-none ${
                          item.inventoryItemId ? 'pr-9' : ''
                        }`}
                      />
                      {item.inventoryItemId && (
                        <CheckCircle2 className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-green-600" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <Input
                      ref={(node) => setInputRef(item.id, 'quantity', node)}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={getNumberInputValue(item.quantity, item.quantityInput)}
                      onChange={(event) =>
                        updateItem(item.id, {
                          quantityInput: event.target.value,
                          quantity: parseNumberInput(event.target.value),
                        })
                      }
                      onKeyDown={(event) => handleKeyDown(item.id, 'quantity', event)}
                      placeholder="0"
                      aria-label={`Row ${index + 1} quantity`}
                      className="h-9 bg-white text-right shadow-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <Input
                      ref={(node) => setInputRef(item.id, 'amount', node)}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={getNumberInputValue(item.amount, item.amountInput)}
                      onChange={(event) =>
                        updateItem(item.id, {
                          amountInput: event.target.value,
                          amount: parseNumberInput(event.target.value),
                        })
                      }
                      onKeyDown={(event) => handleKeyDown(item.id, 'amount', event)}
                      placeholder="0"
                      aria-label={`Row ${index + 1} amount`}
                      className="h-9 bg-white text-right shadow-none"
                    />
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <Input
                      ref={(node) => setInputRef(item.id, 'unitCost', node)}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={item.unitCostInput !== undefined ? item.unitCostInput : item.unitCost ?? ''}
                      onChange={(event) =>
                        updateItem(item.id, {
                          unitCostInput: event.target.value,
                          unitCost: event.target.value.trim() === '' ? undefined : parseNumberInput(event.target.value),
                        })
                      }
                      onKeyDown={(event) => handleKeyDown(item.id, 'unitCost', event)}
                      placeholder="Required"
                      aria-label={`Row ${index + 1} cost price`}
                      className={`h-9 bg-white text-right shadow-none ${item.unitCost === undefined ? 'border-amber-300' : ''}`}
                    />
                  </td>
                  <td className="px-3 py-3 text-right align-middle font-semibold text-gray-900">
                    {(item.quantity * item.amount).toLocaleString('en-IN', {
                      style: 'currency',
                      currency: 'INR',
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="px-3 py-3 align-middle">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:bg-red-50 hover:text-red-700"
                      onClick={() => removeItem(item.id)}
                      aria-label={`Remove row ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end border-t border-gray-100 bg-gray-50 px-3 py-3">
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-1 h-4 w-4" />
          Add Item
        </Button>
      </div>

      {activeSuggestionsOpen &&
        createPortal(
          <div
            ref={suggestionMenuRef}
            role="listbox"
            className="fixed z-[100] max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
            style={{
              top: suggestionMenuPosition.top,
              left: suggestionMenuPosition.left,
              width: suggestionMenuPosition.width,
            }}
          >
            {loadingSuggestions && suggestions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">Searching...</div>
            ) : (
              suggestions.map((suggestion, suggestionIndex) => (
                <button
                  key={suggestion.id}
                  type="button"
                  role="option"
                  aria-selected={suggestionIndex === highlightedIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(activePartInput.itemId, suggestion)}
                  className={`w-full px-3 py-2.5 text-left text-sm ${
                    suggestionIndex === highlightedIndex
                      ? 'bg-blue-50 text-blue-900'
                      : 'text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {suggestion.itemNumber}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {suggestion.itemName}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                      {suggestion.quantity} {suggestion.unitOfMeasure}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
