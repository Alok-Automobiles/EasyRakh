'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  FileText,
  Download,
  Printer,
  Share2,
  Edit2,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Phone,
  MapPin,
  BookOpen,
  Save,
  X,
  Building2,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Invoice, InvoiceItem } from '@/lib/types';
import InvoiceItemsEditor from '@/components/InvoiceItemsEditor';
import type { EditableInvoiceItem } from '@/components/InvoiceItemsEditor';
import { getInvoiceItemDisplayRows, getInvoicePdfTableRows } from '@/lib/invoice-format';
import { legacyUnitPrice } from '@/lib/invoice-calculations';

interface InvoiceWithId extends Invoice {
  id: string;
}

interface FirmInfo {
  firmTitle: string;
  gstNumber: string;
  firmPhone: string;
  firmEmail: string;
  firmAddress: string;
}

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const statusConfig = {
  paid: {
    label: 'Paid',
    icon: CheckCircle2,
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  partial: {
    label: 'Partial',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700 border-amber-200',
  },
  unpaid: {
    label: 'Unpaid',
    icon: AlertCircle,
    className: 'bg-red-100 text-red-700 border-red-200',
  },
};

function toEditableInvoiceItem(item: InvoiceItem, index: number): EditableInvoiceItem {
  return {
    id: `${index}`,
    inventoryItemId: item.inventoryItemId,
    itemNumber: item.itemNumber || '',
    itemName: item.itemName,
    quantity: item.quantity,
    amount: legacyUnitPrice(item),
    unitCost: item.unitCost,
    unitCostInput: item.unitCost === undefined ? '' : String(item.unitCost),
  };
}

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

function hasWholeNumberValues(item: EditableInvoiceItem) {
  return (
    Number.isInteger(item.quantity) &&
    Number.isInteger(item.amount) &&
    (item.unitCost === undefined || Number.isInteger(item.unitCost))
  );
}

function isValidInvoiceItem(item: EditableInvoiceItem) {
  return (
    item.itemName.trim().length > 0 &&
    hasWholeNumberValues(item) &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    Number.isFinite(item.amount) &&
    item.amount > 0 &&
    item.unitCost !== undefined &&
    Number.isFinite(item.unitCost) &&
    item.unitCost >= 0
  );
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const shouldDownload = searchParams.get('download') === 'true';
  const shouldShare = searchParams.get('share') === 'true';

  const [invoice, setInvoice] = useState<InvoiceWithId | null>(null);
  const [firmInfo, setFirmInfo] = useState<FirmInfo | null>(null);
  const [profileName, setProfileName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasFetchedRef = useRef(false);
  const hasDownloadedRef = useRef(false);
  const hasSharedRef = useRef(false);

  const [showFirmInfoModal, setShowFirmInfoModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'download' | 'print' | 'share' | null>(null);
  const [editFirmInfo, setEditFirmInfo] = useState<FirmInfo>({
    firmTitle: '',
    gstNumber: '',
    firmPhone: '',
    firmEmail: '',
    firmAddress: '',
  });

  const [editItems, setEditItems] = useState<EditableInvoiceItem[]>([]);
  const [editInvoiceDate, setEditInvoiceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editNotes, setEditNotes] = useState('');
  const [editAddToLedger, setEditAddToLedger] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const paymentRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    const fetchData = async () => {
      try {
        const [invoiceRes, userRes] = await Promise.all([
          fetch(`/api/invoices/${id}`),
          fetch('/api/auth/me'),
        ]);

        if (invoiceRes.status === 401) {
          router.push('/login');
          return;
        }

        if (!invoiceRes.ok) {
          toast.error('Invoice not found');
          router.push('/invoices');
          return;
        }

        const invoiceData = await invoiceRes.json();
        setInvoice(invoiceData.invoice);

        setEditItems(
          invoiceData.invoice.items.map((item: InvoiceItem, idx: number) =>
            toEditableInvoiceItem(item, idx)
          )
        );
        setEditInvoiceDate(format(
          new Date(invoiceData.invoice.invoiceDate || invoiceData.invoice.createdAt),
          'yyyy-MM-dd'
        ));
        setEditPaidAmount(invoiceData.invoice.paidAmount);
        setEditNotes(invoiceData.invoice.notes || '');

        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.user) {
            setProfileName(userData.user.name || 'Business Owner');
            const info = {
              firmTitle: userData.user.firmTitle || '',
              gstNumber: userData.user.gstNumber || '',
              firmPhone: userData.user.firmPhone || '',
              firmEmail: userData.user.firmEmail || '',
              firmAddress: userData.user.firmAddress || '',
            };
            setFirmInfo(info);
            setEditFirmInfo(info);
          }
        }
      } catch (error) {
        console.error('Failed to fetch invoice:', error);
        toast.error('Failed to load invoice');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, router]);

  const isFirmInfoComplete = useCallback((info: FirmInfo | null): boolean => {
    if (!info) return false;
    return !!(
      info.firmTitle.trim() &&
      info.gstNumber.trim() &&
      info.firmPhone.trim() &&
      info.firmEmail.trim() &&
      info.firmAddress.trim()
    );
  }, []);

  const generatePDF = useCallback(async (
    mode: 'download' | 'print' | 'share' = 'download',
    overrideFirmInfo?: FirmInfo,
  ) => {
    const useFirmInfo = overrideFirmInfo || firmInfo;
    if (!invoice || !useFirmInfo) {
      toast.error('Invoice data not loaded');
      return;
    }

    if (!isFirmInfoComplete(useFirmInfo)) {
      toast.error('Please fill in all firm details');
      return;
    }

    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 18;
      const black: [number, number, number] = [0, 0, 0];
      const mutedText: [number, number, number] = [75, 85, 99];

      const headerHeight = 45;
      doc.setFillColor(black[0], black[1], black[2]);
      doc.rect(0, 0, pageWidth, headerHeight, 'F');

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(36);
      const invoiceTitleWidth = doc.getTextWidth('INVOICE');
      const invoiceBoxWidth = invoiceTitleWidth + 20;
      doc.setFillColor(black[0], black[1], black[2]);
      doc.rect(margin, 10, invoiceBoxWidth, 25, 'F');
      doc.text('INVOICE', margin + 10, 26);

      const rightMargin = pageWidth - margin;
      const leftOfInvoiceBox = margin + invoiceBoxWidth + 10;
      const availableWidth = rightMargin - leftOfInvoiceBox;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      const firmNameX = pageWidth - margin;
      doc.text(useFirmInfo.firmTitle, firmNameX, 20, { align: 'right', maxWidth: availableWidth });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      let firmInfoY = 28;
      if (useFirmInfo.gstNumber) {
        doc.text(`GST: ${useFirmInfo.gstNumber}`, firmNameX, firmInfoY, { align: 'right', maxWidth: availableWidth });
        firmInfoY += 4;
      }
      if (useFirmInfo.firmPhone) {
        doc.text(`Phone: ${useFirmInfo.firmPhone}`, firmNameX, firmInfoY, { align: 'right', maxWidth: availableWidth });
        firmInfoY += 4;
      }
      if (useFirmInfo.firmEmail) {
        doc.text(useFirmInfo.firmEmail, firmNameX, firmInfoY, { align: 'right', maxWidth: availableWidth });
        firmInfoY += 4;
      }
      if (useFirmInfo.firmAddress) {
        const addrLines = doc.splitTextToSize(useFirmInfo.firmAddress, availableWidth);
        const maxLines = Math.floor((headerHeight - firmInfoY) / 4);
        const displayLines = addrLines.slice(0, maxLines);
        doc.text(displayLines, firmNameX, firmInfoY, { align: 'right', maxWidth: availableWidth });
      }

      doc.setTextColor(17, 24, 39);
      let yPos = headerHeight + 15;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Invoice To:', margin, yPos);
      yPos += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(invoice.customerName, margin, yPos);
      yPos += 5;
      if (invoice.customerPhone) {
        doc.text(`Phone: ${invoice.customerPhone}`, margin, yPos);
        yPos += 5;
      }
      if (invoice.customerAddress) {
        const custAddrLines = doc.splitTextToSize(invoice.customerAddress, 70);
        doc.text(custAddrLines, margin, yPos);
        yPos += custAddrLines.length * 5;
      }

      const invoiceMetaY = headerHeight + 15;
      const labelX = pageWidth - margin - 80;
      const valueX = pageWidth - margin;
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text('Invoice Number :', labelX, invoiceMetaY);
      doc.setFont('helvetica', 'bold');
      const labelWidth = doc.getTextWidth('Invoice Number :');
      doc.text(invoice.invoiceNumber, labelX + labelWidth + 5, invoiceMetaY);
      
      doc.setFont('helvetica', 'normal');
      doc.text('Invoice Date :', labelX, invoiceMetaY + 7);
      doc.setFont('helvetica', 'bold');
      const dateLabelWidth = doc.getTextWidth('Invoice Date :');
      doc.text(format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMMM dd, yyyy'), labelX + dateLabelWidth + 5, invoiceMetaY + 7);

      yPos = Math.max(yPos, invoiceMetaY + 15) + 10;

      const tableRows = getInvoicePdfTableRows(invoice.items);

      autoTable(doc, {
        startY: yPos,
        head: [['S.No', 'Part Number', 'Item Name', 'Quantity', 'Unit Price', 'Amount']],
        body: tableRows,
        headStyles: {
          fillColor: black,
          textColor: 255,
          fontSize: 10,
          fontStyle: 'bold',
          halign: 'left',
          cellPadding: 5,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [0, 0, 0],
          lineColor: [200, 200, 200],
          lineWidth: 0.2,
        },
        alternateRowStyles: {
          fillColor: [255, 255, 255],
        },
        columnStyles: {
          0: { cellWidth: 14, halign: 'center' },
          1: { cellWidth: 36 },
          2: { cellWidth: 'auto' },
          3: { cellWidth: 24, halign: 'right' },
          4: { cellWidth: 26, halign: 'right' },
          5: { cellWidth: 28, halign: 'right' },
        },
        margin: { left: margin, right: margin },
        theme: 'plain',
        showHead: 'everyPage',
        pageBreak: 'auto',
        rowPageBreak: 'avoid',
      });

      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;
      const pageHeight = doc.internal.pageSize.getHeight();
      const minFooterSpace = 40;

      let currentY = finalY;
      if (currentY + minFooterSpace > pageHeight) {
        doc.addPage();
        currentY = margin + 10;
      }

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.2);
      const totalRowHeight = 10;
      doc.rect(margin, currentY, pageWidth - margin * 2, totalRowHeight, 'FD');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      doc.text('Total Amount', margin + 25, currentY + 7);
      
      doc.text(`Rs ${invoice.totalAmount.toLocaleString('en-IN')}`, pageWidth - margin, currentY + 7, { align: 'right' });
      
      let totalsY = currentY + totalRowHeight + 8;

      if (invoice.paidAmount > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text('Paid:', margin + 25, totalsY);
        doc.text(`Rs ${invoice.paidAmount.toLocaleString('en-IN')}`, pageWidth - margin, totalsY, { align: 'right' });
        totalsY += 6;
        
        const balanceDue = invoice.totalAmount - invoice.paidAmount;
        if (balanceDue > 0) {
          doc.setFont('helvetica', 'bold');
          doc.text('Balance Due:', margin + 25, totalsY);
          doc.text(`Rs ${balanceDue.toLocaleString('en-IN')}`, pageWidth - margin, totalsY, { align: 'right' });
          totalsY += 8;
        }
      }

      if (invoice.notes && totalsY < pageHeight - 35) {
        doc.setTextColor(17, 24, 39);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        totalsY += 10;
        doc.text('Notes:', margin, totalsY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
        const notesLines = doc.splitTextToSize(invoice.notes, pageWidth - margin * 2);
        const notesHeight = notesLines.length * 5;
        if (totalsY + notesHeight > pageHeight - 30) {
          doc.addPage();
          totalsY = margin + 10;
        }
        doc.text(notesLines, margin, totalsY + 5);
        totalsY += notesHeight + 5;
      }

      const footerY = pageHeight - 30;
      if (totalsY > footerY - 15) {
        doc.addPage();
      }
      
      const currentPageY = totalsY > footerY - 15 ? margin + 10 : totalsY;
      const finalFooterY = pageHeight - 30;
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.text('Payment Information', margin, finalFooterY);
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);
      const paymentInfoY = finalFooterY + 5;
      if (invoice.status === 'paid') {
        doc.text('Status: Paid', margin, paymentInfoY);
      } else if (invoice.status === 'partial') {
        doc.text(`Status: Partial Payment (Rs ${invoice.paidAmount.toLocaleString('en-IN')} paid)`, margin, paymentInfoY);
      } else {
        doc.text('Status: Unpaid', margin, paymentInfoY);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(`Date: ${format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMMM dd, yyyy')}`, pageWidth - margin, finalFooterY, { align: 'right' });

      const fileName = `${invoice.invoiceNumber.replace(/[^a-z0-9]/gi, '_')}.pdf`;

      if (mode === 'download') {
        doc.save(fileName);
        toast.success('Invoice downloaded');
      } else if (mode === 'print') {
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
      } else if (mode === 'share') {
        const pdfBlob = doc.output('blob');
        const file = new File([pdfBlob], fileName, { type: 'application/pdf' });
        const balanceDue = invoice.totalAmount - invoice.paidAmount;
        const shareText =
          `Invoice ${invoice.invoiceNumber} from ${useFirmInfo.firmTitle}\n` +
          `Total: ₹${invoice.totalAmount.toLocaleString('en-IN')}` +
          (balanceDue > 0 ? ` • Balance Due: ₹${balanceDue.toLocaleString('en-IN')}` : ' • Paid');

        const nav = typeof navigator !== 'undefined' ? navigator : undefined;
        const shareData: ShareData = { title: `Invoice ${invoice.invoiceNumber}`, text: shareText, files: [file] };

        if (nav?.canShare?.(shareData) && nav.share) {
          try {
            await nav.share(shareData);
            toast.success('Invoice shared');
            return;
          } catch (err) {
            if ((err as DOMException)?.name === 'AbortError') return;
            console.warn('Web Share failed, falling back:', err);
          }
        }

        doc.save(fileName);
        const waUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        window.open(waUrl, '_blank', 'noopener,noreferrer');
        toast.success('PDF downloaded — attach it in the chat that just opened');
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    }
  }, [invoice, firmInfo, isFirmInfoComplete]);

  const handlePDFAction = useCallback((action: 'download' | 'print' | 'share') => {
    if (!isFirmInfoComplete(firmInfo)) {
      setPendingAction(action);
      setShowFirmInfoModal(true);
      return;
    }
    generatePDF(action);
  }, [firmInfo, isFirmInfoComplete, generatePDF]);

  useEffect(() => {
    if (shouldDownload && invoice && !hasDownloadedRef.current) {
      hasDownloadedRef.current = true;
      if (isFirmInfoComplete(firmInfo)) {
        generatePDF('download');
      } else {
        setPendingAction('download');
        setShowFirmInfoModal(true);
      }
    }
  }, [shouldDownload, invoice, firmInfo, generatePDF, isFirmInfoComplete]);

  useEffect(() => {
    if (shouldShare && invoice && !hasSharedRef.current) {
      hasSharedRef.current = true;
      if (isFirmInfoComplete(firmInfo)) {
        generatePDF('share');
      } else {
        setPendingAction('share');
        setShowFirmInfoModal(true);
      }
    }
  }, [shouldShare, invoice, firmInfo, generatePDF, isFirmInfoComplete]);

  const editTotalAmount = editItems.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.amount || 0),
    0
  );

  const handleSave = async () => {
    if (!editInvoiceDate) {
      toast.error('Invoice date is required');
      return;
    }
    if (editInvoiceDate > format(new Date(), 'yyyy-MM-dd')) {
      toast.error('Invoice date cannot be in the future');
      return;
    }

    const enteredItems = editItems.filter((item) => !isBlankInvoiceItem(item));
    if (enteredItems.length === 0) {
      toast.error('At least one complete item with selling price and cost price is required');
      return;
    }
    const decimalItem = enteredItems.find((item) => !hasWholeNumberValues(item));
    if (decimalItem) {
      const rowNumber = editItems.findIndex((item) => item.id === decimalItem.id) + 1;
      toast.error(`Use whole numbers only for quantity and prices in item row ${rowNumber}`);
      return;
    }
    const invalidItem = enteredItems.find((item) => !isValidInvoiceItem(item));
    if (invalidItem) {
      const rowNumber = editItems.findIndex((item) => item.id === invalidItem.id) + 1;
      toast.error(`Complete item row ${rowNumber}, including selling price and cost price`);
      return;
    }

    setSaving(true);

    try {
      const payload = {
        invoiceDate: editInvoiceDate,
        items: enteredItems.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          itemNumber: item.itemNumber.trim(),
          itemName: item.itemName.trim(),
          quantity: item.quantity,
          unitPrice: item.amount,
          unitCost: item.unitCost,
        })),
        notes: editNotes.trim(),
        addToLedger: editAddToLedger && !invoice?.addedToLedger,
      };

      const response = await fetch(`/api/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update invoice');
      }

      const data = await response.json();
      setInvoice(data.invoice);
      setIsEditing(false);
      toast.success('Invoice updated successfully!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update invoice');
    } finally {
      setSaving(false);
    }
  };

  const refreshInvoice = async () => {
    const response = await fetch(`/api/invoices/${id}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to refresh invoice');
    const data = await response.json();
    setInvoice(data.invoice);
    setEditPaidAmount(data.invoice.paidAmount);
  };

  const handleAddPayment = async () => {
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (!Number.isInteger(amount)) {
      toast.error('Payment amount must be a whole number');
      return;
    }
    if (!invoice || amount > invoice.totalAmount - invoice.paidAmount) {
      toast.error('Payment cannot be greater than the remaining balance');
      return;
    }
    setPaymentSaving(true);
    try {
      const idempotencyKey = paymentRequestIdRef.current || (paymentRequestIdRef.current = crypto.randomUUID());
      const response = await fetch(`/api/invoices/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date: paymentDate, idempotencyKey }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status < 500) paymentRequestIdRef.current = null;
        throw new Error(data.error || 'Failed to add payment');
      }
      await refreshInvoice();
      paymentRequestIdRef.current = null;
      setPaymentAmount('');
      setPaymentFormOpen(false);
      toast.success('Payment added to invoice and Daily Cash');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add payment');
    } finally {
      setPaymentSaving(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('Delete this payment from the invoice, Daily Cash, and ledger?')) return;
    setPaymentSaving(true);
    try {
      const response = await fetch(`/api/invoices/${id}/payments/${paymentId}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to delete payment');
      await refreshInvoice();
      toast.success('Payment deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete payment');
    } finally {
      setPaymentSaving(false);
    }
  };

  const cancelEdit = () => {
    if (invoice) {
      setEditItems(
        invoice.items.map((item, idx) => toEditableInvoiceItem(item, idx))
      );
      setEditPaidAmount(invoice.paidAmount);
      setEditInvoiceDate(format(new Date(invoice.invoiceDate || invoice.createdAt), 'yyyy-MM-dd'));
      setEditNotes(invoice.notes || '');
    }
    setIsEditing(false);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (!isCtrlOrCmd) return;

      const key = e.key.toLowerCase();

      if (showFirmInfoModal) return;

      if (key === 'n') {
        e.preventDefault();
        router.push('/invoices/new');
        return;
      }

      const isSaveShortcut = isCtrlOrCmd && e.shiftKey && e.key === 'Enter';
      if (isSaveShortcut) {
        e.preventDefault();
        if (isEditing && !saving) {
          handleSave();
        }
        return;
      }

      if (key === 'e' && !isEditing) {
        e.preventDefault();
        setIsEditing(true);
        return;
      }

      if (key === 'd') {
        e.preventDefault();
        handlePDFAction('download');
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, isEditing, saving, handleSave, handlePDFAction, showFirmInfoModal]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Skeleton className="h-12 w-64 mb-8" />
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!invoice) {
    return null;
  }

  const status = statusConfig[invoice.status];
  const StatusIcon = status.icon;

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

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100">
                <FileText className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                  {invoice.invoiceNumber}
                </h1>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={status.className}>
                    <StatusIcon className="w-3 h-3 mr-1" />
                    {status.label}
                  </Badge>
                  {invoice.addedToLedger && (
                    <Badge variant="outline" className="bg-purple-100 text-purple-700 border-purple-200">
                      <BookOpen className="w-3 h-3 mr-1" />
                      In Ledger
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-slate-900 hover:bg-slate-800"
                    title="Shortcut: Ctrl+Shift+Enter / Cmd+Shift+Enter"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? 'Saving...' : 'Save'}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    title="Shortcut: Ctrl+E / Cmd+E"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Edit
                  </Button>
                  <Button variant="outline" onClick={() => handlePDFAction('print')}>
                    <Printer className="w-4 h-4 mr-1" />
                    Print
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handlePDFAction('share')}
                    className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    title="Share via WhatsApp / Apps"
                  >
                    <Share2 className="w-4 h-4 mr-1" />
                    Share
                  </Button>
                  <Button
                    onClick={() => handlePDFAction('download')}
                    className="bg-slate-900 hover:bg-slate-800"
                    title="Shortcut: Ctrl+D / Cmd+D"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Download
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Customer Info */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <User className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Customer</h2>
            </div>
            {isEditing && (
              <div className="max-w-sm mb-4 pb-4 border-b border-gray-100">
                <Label htmlFor="editInvoiceDate">Invoice Date *</Label>
                <Input
                  id="editInvoiceDate"
                  type="date"
                  max={format(new Date(), 'yyyy-MM-dd')}
                  value={editInvoiceDate}
                  onChange={(event) => setEditInvoiceDate(event.target.value)}
                  className="mt-1"
                  required
                />
                <p className="mt-1.5 text-xs text-gray-500">
                  The customer PDF and linked ledger entry will use this date.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <p className="font-medium text-gray-900">{invoice.customerName}</p>
              {invoice.customerPhone && (
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  {invoice.customerPhone}
                </p>
              )}
              {invoice.customerAddress && (
                <p className="text-sm text-gray-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  {invoice.customerAddress}
                </p>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Invoice date {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMMM dd, yyyy')}
              {' · '}Record created {format(new Date(invoice.createdAt), 'MMMM dd, yyyy \'at\' h:mm a')}
            </p>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Items</h2>
            </div>

            {isEditing ? (
              <div>
                <InvoiceItemsEditor items={editItems} onChange={setEditItems} />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="w-16 py-2 pr-3">S.No</th>
                      <th className="w-40 px-3 py-2">Part Number</th>
                      <th className="px-3 py-2">Item Name</th>
                      <th className="w-28 px-3 py-2 text-right">Quantity</th>
                      <th className="w-32 px-3 py-2 text-right">Unit Price</th>
                      <th className="w-36 py-2 pl-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getInvoiceItemDisplayRows(invoice.items).map((item) => (
                      <tr key={item.serialNumber} className="border-b border-gray-100 last:border-0">
                        <td className="py-3 pr-3 font-medium text-gray-600">{item.serialNumber}</td>
                        <td className="px-3 py-3 text-gray-700">{item.itemNumber}</td>
                        <td className="px-3 py-3 font-medium text-gray-900">{item.itemName}</td>
                        <td className="px-3 py-3 text-right text-gray-700">{item.quantity}</td>
                        <td className="px-3 py-3 text-right text-gray-700">
                          {currencyFormatter.format(item.unitPrice)}
                        </td>
                        <td className="py-3 pl-3 text-right font-semibold text-gray-900">
                          {currencyFormatter.format(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">
                  {currencyFormatter.format(isEditing ? editTotalAmount : invoice.totalAmount)}
                </span>
              </div>
              {(isEditing ? editPaidAmount : invoice.paidAmount) > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-gray-600">Paid</span>
                  <span className="font-medium text-green-600">
                    {currencyFormatter.format(isEditing ? editPaidAmount : invoice.paidAmount)}
                  </span>
                </div>
              )}
              <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                <span className="font-semibold">Balance Due</span>
                <span className={`text-xl font-bold ${
                  (isEditing ? editTotalAmount - editPaidAmount : invoice.totalAmount - invoice.paidAmount) > 0 
                    ? 'text-red-600' 
                    : 'text-green-600'
                }`}>
                  {currencyFormatter.format(
                    isEditing 
                      ? editTotalAmount - editPaidAmount 
                      : invoice.totalAmount - invoice.paidAmount
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Private Profit Details</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-700">Sales</p>
                <p className="font-bold text-gray-900">{currencyFormatter.format(invoice.totalAmount)}</p>
              </div>
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-xs text-amber-700">COGS</p>
                <p className="font-bold text-gray-900">{currencyFormatter.format(invoice.totalCogs || 0)}</p>
              </div>
              <div className="rounded-lg bg-green-50 p-3">
                <p className="text-xs text-green-700">Gross Profit</p>
                <p className="font-bold text-gray-900">{currencyFormatter.format(invoice.grossProfit || 0)}</p>
              </div>
              <div className="rounded-lg bg-purple-50 p-3">
                <p className="text-xs text-purple-700">Gross Margin</p>
                <p className="font-bold text-gray-900">{(invoice.grossMargin || 0).toFixed(2)}%</p>
              </div>
            </div>
            {(invoice.missingCostItemCount || 0) > 0 && (
              <p className="mt-3 text-sm text-amber-700">
                {invoice.missingCostItemCount} historical item(s) need a cost price. Profit excludes those lines.
              </p>
            )}
            <p className="mt-3 text-xs text-gray-500">Cost and profit never appear on the customer PDF.</p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
                <p className="text-sm text-gray-500">Each payment is added to Daily Cash on its receipt date.</p>
              </div>
              {invoice.paidAmount < invoice.totalAmount && !isEditing && (
                <Button size="sm" onClick={() => setPaymentFormOpen((open) => !open)}>
                  <Plus className="w-4 h-4 mr-1" /> Add Payment
                </Button>
              )}
            </div>

            {paymentFormOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 rounded-lg border border-blue-100 bg-blue-50 p-3 mb-4">
                <div>
                  <Label htmlFor="paymentAmount">Amount received</Label>
                  <Input id="paymentAmount" type="number" inputMode="numeric" min="0" step="1" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 bg-white" />
                </div>
                <div>
                  <Label htmlFor="paymentDate">Payment date</Label>
                  <Input id="paymentDate" type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 bg-white" />
                </div>
                <Button onClick={handleAddPayment} disabled={paymentSaving} className="self-end">
                  {paymentSaving ? 'Saving...' : 'Save Payment'}
                </Button>
              </div>
            )}

            {(invoice.payments || []).length === 0 ? (
              <p className="text-sm text-gray-500">No payment history recorded.</p>
            ) : (
              <div className="space-y-2">
                {(invoice.payments || []).map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                    <div>
                      <p className="font-semibold text-gray-900">{currencyFormatter.format(payment.amount)}</p>
                      <p className="text-xs text-gray-500">{format(new Date(payment.date), 'dd MMM yyyy')}{payment.source === 'legacy' ? ' - Historical payment' : ' - Added to Daily Cash'}</p>
                    </div>
                    {payment.source !== 'legacy' && (
                      <Button variant="ghost" size="icon" disabled={paymentSaving} onClick={() => handleDeletePayment(payment.id)} className="text-red-600 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isEditing && !invoice.addedToLedger && invoice.customerId && (
              <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <label htmlFor="editAddToLedger" className="flex cursor-pointer items-start gap-3">
                  <input type="checkbox" id="editAddToLedger" checked={editAddToLedger} onChange={(e) => setEditAddToLedger(e.target.checked)} className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded" />
                  <span>
                    <span className="font-medium text-gray-900 flex items-center gap-2"><BookOpen className="w-4 h-4 text-purple-600" />Add to Ledger</span>
                    <span className="block text-sm text-gray-600 mt-1">Record this invoice and its payment history in the customer ledger.</span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Notes */}
          {(isEditing || invoice.notes) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              {isEditing ? (
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Additional notes..."
                  rows={3}
                />
              ) : (
                <p className="text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
              )}
            </div>
          )}
        </div>

        {/* Firm Info Modal */}
        <Dialog open={showFirmInfoModal} onOpenChange={setShowFirmInfoModal}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Firm Details Required
              </DialogTitle>
              <DialogDescription>
                Please enter your firm details to generate the invoice PDF. These details will appear in the &quot;From&quot; section of your invoice.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="firmTitle">Firm Name *</Label>
                <Input
                  id="firmTitle"
                  value={editFirmInfo.firmTitle}
                  onChange={(e) => setEditFirmInfo({ ...editFirmInfo, firmTitle: e.target.value })}
                  placeholder="Your Business Name"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="gstNumber">GST Number *</Label>
                <Input
                  id="gstNumber"
                  value={editFirmInfo.gstNumber}
                  onChange={(e) => setEditFirmInfo({ ...editFirmInfo, gstNumber: e.target.value })}
                  placeholder="e.g., 22AAAAA0000A1Z5"
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firmPhone">Phone *</Label>
                  <Input
                    id="firmPhone"
                    value={editFirmInfo.firmPhone}
                    onChange={(e) => setEditFirmInfo({ ...editFirmInfo, firmPhone: e.target.value })}
                    placeholder="Phone number"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="firmEmail">Email *</Label>
                  <Input
                    id="firmEmail"
                    type="email"
                    value={editFirmInfo.firmEmail}
                    onChange={(e) => setEditFirmInfo({ ...editFirmInfo, firmEmail: e.target.value })}
                    placeholder="Email address"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="firmAddress">Address *</Label>
                <Textarea
                  id="firmAddress"
                  value={editFirmInfo.firmAddress}
                  onChange={(e) => setEditFirmInfo({ ...editFirmInfo, firmAddress: e.target.value })}
                  placeholder="Full business address"
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowFirmInfoModal(false);
                  setPendingAction(null);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={async () => {
                  if (!isFirmInfoComplete(editFirmInfo)) {
                    toast.error('Please fill in all firm details');
                    return;
                  }
                  const profileResponse = await fetch('/api/auth/me', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: profileName || 'Business Owner', ...editFirmInfo }),
                  });
                  if (!profileResponse.ok) {
                    const result = await profileResponse.json().catch(() => ({}));
                    toast.error(result.error || 'Failed to save firm details');
                    return;
                  }
                  setFirmInfo(editFirmInfo);
                  setShowFirmInfoModal(false);
                  if (pendingAction) {
                    generatePDF(pendingAction, editFirmInfo);
                    setPendingAction(null);
                  }
                }}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {pendingAction === 'download'
                  ? 'Download Invoice'
                  : pendingAction === 'share'
                  ? 'Share Invoice'
                  : 'Print Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}
