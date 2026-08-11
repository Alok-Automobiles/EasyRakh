'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { motion } from 'motion/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  User,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  BookOpen,
  CalendarDays,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import InvoiceItemsEditor, {
  createEmptyInvoiceItem,
} from '@/components/InvoiceItemsEditor';
import type { EditableInvoiceItem } from '@/components/InvoiceItemsEditor';
import { Customer } from '@/lib/types';
import { parseNumberInputOrZero } from '@/lib/number-input';
import { format } from 'date-fns';

interface CustomerWithId extends Customer {
  id: string;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function hasNumericEntry(value: number, inputValue?: string) {
  return inputValue !== undefined ? inputValue.trim() !== '' : value !== 0;
}

function isBlankInvoiceItem(item: EditableInvoiceItem) {
  return (
    !item.inventoryItemId &&
    !item.itemNumber.trim() &&
    !item.itemName.trim() &&
    !hasNumericEntry(item.quantity, item.quantityInput) &&
    !hasNumericEntry(item.amount, item.amountInput) &&
    item.unitCost === undefined
  );
}

function isValidInvoiceItem(item: EditableInvoiceItem) {
  return (
    item.itemName.trim().length > 0 &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    item.unitCost !== undefined &&
    Number.isFinite(item.unitCost) &&
    item.unitCost >= 0
  );
}

export default function NewInvoicePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const hasFetchedRef = useRef(false);
  const createRequestIdRef = useRef<string | null>(null);

  const [nextInvoiceNumber, setNextInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const [customers, setCustomers] = useState<CustomerWithId[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithId | null>(null);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [createNewCustomer, setCreateNewCustomer] = useState(false);

  const [items, setItems] = useState<EditableInvoiceItem[]>([
    createEmptyInvoiceItem('1'),
  ]);

  const [status, setStatus] = useState<'paid' | 'unpaid' | 'partial'>('unpaid');
  const [paidAmount, setPaidAmount] = useState(0);

  const [notes, setNotes] = useState('');
  const [addToLedger, setAddToLedger] = useState(false);
  const [firmDetailsComplete, setFirmDetailsComplete] = useState(false);

  const customerDropdownRef = useRef<HTMLDivElement | null>(null);

  const totalAmount = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.amount || 0),
    0
  );

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchData = async () => {
      try {
        const [customersRes, userRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/auth/me'),
        ]);

        if (customersRes.ok) {
          const data = await customersRes.json();
          setCustomers(data.customers || []);
        }

        if (userRes.ok) {
          const data = await userRes.json();
          const user = data.user || {};
          setFirmDetailsComplete(Boolean(
            user.firmTitle && user.gstNumber && user.firmPhone && user.firmEmail && user.firmAddress
          ));
        }
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
        toast.error('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (!invoiceDate) {
      setNextInvoiceNumber('');
      return;
    }

    const controller = new AbortController();
    const loadNextInvoiceNumber = async () => {
      try {
        const response = await fetch(
          `/api/invoices/next-number?invoiceDate=${encodeURIComponent(invoiceDate)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const data = await response.json();
        setNextInvoiceNumber(data.nextInvoiceNumber || '');
      } catch (error) {
        if ((error as DOMException)?.name !== 'AbortError') {
          console.error('Failed to fetch the next invoice number:', error);
        }
      }
    };

    loadNextInvoiceNumber();
    return () => controller.abort();
  }, [invoiceDate]);

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
      (c.phone && c.phone.includes(customerSearch))
  );

  const handleSelectCustomer = (customer: CustomerWithId) => {
    setSelectedCustomer(customer);
    setCustomerName(customer.name);
    setCustomerPhone(customer.phone || '');
    setCustomerAddress(customer.address || '');
    setCustomerSearch(customer.name);
    setShowCustomerDropdown(false);
    setCreateNewCustomer(false);
  };

  const handleCustomerSearchChange = (value: string) => {
    setCustomerSearch(value);
    setCustomerName(value);
    setShowCustomerDropdown(true);

    const exactMatch = customers.find(
      (c) => c.name.toLowerCase() === value.toLowerCase()
    );
    if (exactMatch) {
      setSelectedCustomer(exactMatch);
      setCustomerPhone(exactMatch.phone || '');
      setCustomerAddress(exactMatch.address || '');
      setCreateNewCustomer(false);
    } else {
      setSelectedCustomer(null);
      if (!createNewCustomer) {
        setCustomerPhone('');
        setCustomerAddress('');
      }
    }
  };

  const handleCreateNewCustomer = () => {
    setCreateNewCustomer(true);
    setSelectedCustomer(null);
    setShowCustomerDropdown(false);
  };

  const clearCustomerSelection = () => {
    setSelectedCustomer(null);
    setCreateNewCustomer(false);
    setCustomerName('');
    setCustomerSearch('');
    setCustomerPhone('');
    setCustomerAddress('');
    setShowCustomerDropdown(false);
  };

  useEffect(() => {
    if (!showCustomerDropdown) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!customerDropdownRef.current) return;
      if (!customerDropdownRef.current.contains(event.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowCustomerDropdown(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCustomerDropdown]);

  useEffect(() => {
    if (paidAmount >= totalAmount && totalAmount > 0) {
      setStatus('paid');
    } else if (paidAmount > 0) {
      setStatus('partial');
    } else {
      setStatus('unpaid');
    }
  }, [paidAmount, totalAmount]);

  const handleStatusChange = (newStatus: 'paid' | 'unpaid' | 'partial') => {
    setStatus(newStatus);
    if (newStatus === 'paid') {
      setPaidAmount(totalAmount);
    } else if (newStatus === 'unpaid') {
      setPaidAmount(0);
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!invoiceDate) {
      toast.error('Invoice date is required');
      return;
    }
    if (invoiceDate > format(new Date(), 'yyyy-MM-dd')) {
      toast.error('Invoice date cannot be in the future');
      return;
    }

    if (!customerName.trim()) {
      toast.error('Customer name is required');
      return;
    }

    if (!firmDetailsComplete) {
      toast.error('Complete and save your firm details before creating an invoice');
      router.push('/profile?returnTo=/invoices/new');
      return;
    }

    const enteredItems = items.filter((item) => !isBlankInvoiceItem(item));
    if (enteredItems.length === 0) {
      toast.error('At least one complete item with selling price and cost price is required');
      return;
    }
    const invalidItem = enteredItems.find((item) => !isValidInvoiceItem(item));
    if (invalidItem) {
      const rowNumber = items.findIndex((item) => item.id === invalidItem.id) + 1;
      toast.error(`Complete item row ${rowNumber}, including selling price and cost price`);
      return;
    }

    if (addToLedger && !selectedCustomer && !createNewCustomer) {
      toast.error('Select an existing customer or create a new one to add to ledger');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        clientRequestId: createRequestIdRef.current || (createRequestIdRef.current = crypto.randomUUID()),
        customerId: selectedCustomer?.id,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        items: enteredItems.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          itemNumber: item.itemNumber.trim(),
          itemName: item.itemName.trim(),
          quantity: item.quantity,
          unitPrice: item.amount,
          unitCost: item.unitCost,
        })),
        paidAmount,
        invoiceDate,
        paymentDate: invoiceDate,
        status,
        notes: notes.trim(),
        addToLedger,
        createCustomerIfNew: createNewCustomer && addToLedger,
      };

      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create invoice');
      }

      const data = await response.json();
      createRequestIdRef.current = null;
      await queryClient.invalidateQueries({ queryKey: ['invoices'] });
      toast.success('Invoice created successfully!');
      router.push(`/invoices/${data.invoice.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create invoice');
    } finally {
      setSubmitting(false);
    }
  }, [
    customerName,
    customerPhone,
    customerAddress,
    items,
    invoiceDate,
    paidAmount,
    status,
    notes,
    addToLedger,
    selectedCustomer,
    createNewCustomer,
    firmDetailsComplete,
    queryClient,
    router,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isSaveShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter';
      if (isSaveShortcut) {
        e.preventDefault();
        if (!submitting) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleSubmit, submitting]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="space-y-6">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link
            href="/invoices"
            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800 mb-4"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back to Invoices
          </Link>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Create Invoice
              </h1>
              {nextInvoiceNumber && (
                <p className="text-gray-500 text-sm">
                  Invoice #: {nextInvoiceNumber}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Invoice Details */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <CalendarDays className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Invoice Details</h2>
            </div>
            <div className="max-w-sm">
              <Label htmlFor="invoiceDate">Invoice Date *</Label>
              <Input
                id="invoiceDate"
                type="date"
                max={format(new Date(), 'yyyy-MM-dd')}
                value={invoiceDate}
                onChange={(event) => setInvoiceDate(event.target.value)}
                className="mt-1"
                required
              />
              <p className="mt-1.5 text-xs text-gray-500">
                Select today or an earlier date. The invoice number and PDF will use this date.
              </p>
            </div>
          </div>

          {/* Customer Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Customer Details</h2>
            </div>

            <div className="space-y-4">
              {/* Customer Search */}
              <div className="relative" ref={customerDropdownRef}>
                <Label htmlFor="customerSearch">Customer Name *</Label>
                <Input
                  id="customerSearch"
                  value={customerSearch}
                  onChange={(e) => handleCustomerSearchChange(e.target.value)}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Search or enter customer name..."
                  className="mt-1"
                />

                {/* Dropdown */}
                {showCustomerDropdown && customerSearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
                      <span>Press Esc or click outside to close</span>
                      <button
                        type="button"
                        onClick={() => setShowCustomerDropdown(false)}
                        className="p-1 rounded hover:bg-gray-200 text-gray-500 hover:text-gray-700"
                        aria-label="Close customer suggestions"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {filteredCustomers.length > 0 ? (
                      <>
                        {filteredCustomers.slice(0, 5).map((customer) => (
                          <button
                            key={customer.id}
                            type="button"
                            onClick={() => handleSelectCustomer(customer)}
                            className="w-full px-4 py-2.5 text-left hover:bg-gray-50 flex items-center justify-between"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{customer.name}</p>
                              {customer.phone && (
                                <p className="text-sm text-gray-500">{customer.phone}</p>
                              )}
                            </div>
                            {selectedCustomer?.id === customer.id && (
                              <CheckCircle2 className="w-4 h-4 text-green-600" />
                            )}
                          </button>
                        ))}
                      </>
                    ) : null}

                    {/* Create new option */}
                    {!selectedCustomer && customerSearch.length > 0 && (
                      <button
                        type="button"
                        onClick={handleCreateNewCustomer}
                        className="w-full px-4 py-2.5 text-left hover:bg-blue-50 text-blue-600 border-t border-gray-100"
                      >
                        <Plus className="w-4 h-4 inline mr-2" />
                        Create &quot;{customerSearch}&quot; as new customer
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Show selected customer badge or new customer indicator */}
              {selectedCustomer && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-green-50 rounded-lg text-sm text-green-700">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Existing customer selected</span>
                  </div>
                  <button
                    type="button"
                    onClick={clearCustomerSelection}
                    className="p-1 rounded hover:bg-green-100 text-green-700"
                    aria-label="Clear selected customer"
                    title="Clear selection"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {createNewCustomer && !selectedCustomer && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    <span>New customer will be created</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateNewCustomer(false)}
                    className="p-1 rounded hover:bg-blue-100 text-blue-700"
                    aria-label="Undo create new customer"
                    title="Undo"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customerPhone">Phone</Label>
                  <Input
                    id="customerPhone"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="customerAddress">Address</Label>
                  <Input
                    id="customerAddress"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Address"
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Items Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Invoice Items</h2>
            </div>

            <div>
              <InvoiceItemsEditor items={items} onChange={setItems} />
            </div>

            {/* Total */}
            <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end">
              <div className="text-right">
                <p className="text-sm text-gray-500">Total Amount</p>
                <p className="text-2xl font-bold text-gray-900">
                  {currencyFormatter.format(totalAmount)}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Status</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => handleStatusChange(v as 'paid' | 'unpaid' | 'partial')}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paid">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        Paid
                      </div>
                    </SelectItem>
                    <SelectItem value="partial">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        Partial Payment
                      </div>
                    </SelectItem>
                    <SelectItem value="unpaid">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-600" />
                        Unpaid
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="paidAmount">Amount Paid (₹)</Label>
                <Input
                  id="paidAmount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={paidAmount || ''}
                  onChange={(e) => setPaidAmount(parseNumberInputOrZero(e.target.value))}
                  placeholder="0"
                  className="mt-1"
                  disabled={status === 'paid' || status === 'unpaid'}
                />
              </div>
            </div>

            {/* Balance display */}
            {totalAmount > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Total</span>
                  <span className="font-medium">{currencyFormatter.format(totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Paid</span>
                  <span className="font-medium text-green-600">{currencyFormatter.format(paidAmount)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1 pt-1 border-t border-gray-200">
                  <span className="text-gray-600">Balance Due</span>
                  <span className={`font-bold ${totalAmount - paidAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {currencyFormatter.format(totalAmount - paidAmount)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Notes & Ledger Section */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Additional Options</h2>

            <div className="space-y-4">
              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional notes for this invoice..."
                  className="mt-1"
                  rows={3}
                />
              </div>

              {/* Add to Ledger Toggle */}
              <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5">
                    <input
                      type="checkbox"
                      id="addToLedger"
                      checked={addToLedger}
                      onChange={(e) => setAddToLedger(e.target.checked)}
                      className="w-4 h-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label htmlFor="addToLedger" className="font-medium text-gray-900 cursor-pointer flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-purple-600" />
                      Add to Ledger
                    </label>
                    <p className="text-sm text-gray-600 mt-1">
                      {status === 'paid' 
                        ? 'Record payment received in customer\'s ledger.'
                        : status === 'partial'
                        ? 'Record partial payment and outstanding amount in customer\'s ledger.'
                        : 'Record the outstanding amount as due in customer\'s ledger.'}
                    </p>
                    {addToLedger && !selectedCustomer && !createNewCustomer && (
                      <p className="text-sm text-amber-600 mt-2">
                        Note: Select an existing customer or create a new one to add to ledger.
                      </p>
                    )}
                    {addToLedger && createNewCustomer && (
                      <p className="text-sm text-blue-600 mt-2">
                        A new customer &quot;{customerName}&quot; will be created and added to your ledger.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/invoices')}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-slate-900 hover:bg-slate-800"
              title="Shortcut: Ctrl+Shift+Enter / Cmd+Shift+Enter"
            >
              {submitting ? 'Creating...' : 'Create Invoice'}
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
