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
  Plus,
  Trash2,
  Building2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Invoice, InvoiceItem } from '@/lib/types';

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

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const shouldDownload = searchParams.get('download') === 'true';

  const [invoice, setInvoice] = useState<InvoiceWithId | null>(null);
  const [firmInfo, setFirmInfo] = useState<FirmInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const hasFetchedRef = useRef(false);
  const hasDownloadedRef = useRef(false);

  const [showFirmInfoModal, setShowFirmInfoModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'download' | 'print' | null>(null);
  const [editFirmInfo, setEditFirmInfo] = useState<FirmInfo>({
    firmTitle: '',
    gstNumber: '',
    firmPhone: '',
    firmEmail: '',
    firmAddress: '',
  });

  const [editItems, setEditItems] = useState<(InvoiceItem & { id: string })[]>([]);
  const [editPaidAmount, setEditPaidAmount] = useState(0);
  const [editStatus, setEditStatus] = useState<'paid' | 'unpaid' | 'partial'>('unpaid');
  const [editNotes, setEditNotes] = useState('');
  const [editAddToLedger, setEditAddToLedger] = useState(false);

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
          invoiceData.invoice.items.map((item: InvoiceItem, idx: number) => ({
            ...item,
            id: idx.toString(),
          }))
        );
        setEditPaidAmount(invoiceData.invoice.paidAmount);
        setEditStatus(invoiceData.invoice.status);
        setEditNotes(invoiceData.invoice.notes || '');

        if (userRes.ok) {
          const userData = await userRes.json();
          if (userData.user) {
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

  const generatePDF = useCallback((download = true, overrideFirmInfo?: FirmInfo) => {
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
      doc.text(format(new Date(invoice.createdAt), 'MMMM dd, yyyy'), labelX + dateLabelWidth + 5, invoiceMetaY + 7);

      yPos = Math.max(yPos, invoiceMetaY + 15) + 10;

      const tableRows = invoice.items.map((item, idx) => [
        (idx + 1).toString(),
        item.description,
        `Rs ${item.amount.toLocaleString('en-IN')}`,
      ]);

      autoTable(doc, {
        startY: yPos,
        head: [['Item', 'Description', 'Amount']],
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
          0: { cellWidth: 20, halign: 'center' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 50, halign: 'right' },
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
      doc.text(`Date: ${format(new Date(invoice.createdAt), 'MMMM dd, yyyy')}`, pageWidth - margin, finalFooterY, { align: 'right' });

      const fileName = `${invoice.invoiceNumber.replace(/[^a-z0-9]/gi, '_')}.pdf`;

      if (download) {
        doc.save(fileName);
        toast.success('Invoice downloaded');
      } else {
        const pdfBlob = doc.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      toast.error('Failed to generate PDF');
    }
  }, [invoice, firmInfo, isFirmInfoComplete]);

  const handlePDFAction = useCallback((action: 'download' | 'print') => {
    if (!isFirmInfoComplete(firmInfo)) {
      setPendingAction(action);
      setShowFirmInfoModal(true);
      return;
    }
    generatePDF(action === 'download');
  }, [firmInfo, isFirmInfoComplete, generatePDF]);

  useEffect(() => {
    if (shouldDownload && invoice && !hasDownloadedRef.current) {
      hasDownloadedRef.current = true;
      if (isFirmInfoComplete(firmInfo)) {
        generatePDF(true);
      } else {
        setPendingAction('download');
        setShowFirmInfoModal(true);
      }
    }
  }, [shouldDownload, invoice, firmInfo, generatePDF, isFirmInfoComplete]);

  const addEditItem = useCallback(() => {
    setEditItems((prev) => [...prev, { id: Date.now().toString(), description: '', amount: 0 }]);
  }, []);

  useEffect(() => {
    if (!isEditing) return;
    if (showFirmInfoModal) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrlEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
      if (!isCmdOrCtrlEnter) return;

      e.preventDefault();
      addEditItem();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isEditing, showFirmInfoModal, addEditItem]);

  const removeEditItem = (itemId: string) => {
    if (editItems.length === 1) {
      toast.error('At least one item is required');
      return;
    }
    setEditItems(editItems.filter((item) => item.id !== itemId));
  };

  const updateEditItem = (itemId: string, field: 'description' | 'amount', value: string | number) => {
    setEditItems(
      editItems.map((item) =>
        item.id === itemId ? { ...item, [field]: value } : item
      )
    );
  };

  const editTotalAmount = editItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  useEffect(() => {
    if (isEditing) {
      if (editPaidAmount >= editTotalAmount && editTotalAmount > 0) {
        setEditStatus('paid');
      } else if (editPaidAmount > 0) {
        setEditStatus('partial');
      } else {
        setEditStatus('unpaid');
      }
    }
  }, [editPaidAmount, editTotalAmount, isEditing]);

  const handleSave = async () => {
    const validItems = editItems.filter((item) => item.description.trim() && item.amount > 0);
    if (validItems.length === 0) {
      toast.error('At least one item with description and amount is required');
      return;
    }

    setSaving(true);

    try {
      const payload = {
        items: validItems.map((item) => ({
          description: item.description.trim(),
          amount: item.amount,
        })),
        paidAmount: editPaidAmount,
        status: editStatus,
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

  const cancelEdit = () => {
    if (invoice) {
      setEditItems(
        invoice.items.map((item, idx) => ({
          ...item,
          id: idx.toString(),
        }))
      );
      setEditPaidAmount(invoice.paidAmount);
      setEditStatus(invoice.status);
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

      if (key === 's') {
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
                    title="Shortcut: Ctrl+S / Cmd+S"
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
              Created on {format(new Date(invoice.createdAt), 'MMMM dd, yyyy \'at\' h:mm a')}
            </p>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Items</h2>
            </div>

            {isEditing ? (
              <>
                <div className="space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto pr-2">
                  {editItems.map((item, index) => (
                    <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500">Description</Label>
                        <Input
                          value={item.description}
                          onChange={(e) => updateEditItem(item.id, 'description', e.target.value)}
                          placeholder={`Item ${index + 1}`}
                          className="mt-1"
                        />
                      </div>
                      <div className="w-32">
                        <Label className="text-xs text-gray-500">Amount (₹)</Label>
                        <Input
                          type="number"
                          value={item.amount || ''}
                          onChange={(e) => updateEditItem(item.id, 'amount', parseFloat(e.target.value) || 0)}
                          className="mt-1"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6 text-red-500 hover:text-red-700"
                        onClick={() => removeEditItem(item.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={addEditItem}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Item (Ctrl+Enter)
                  </Button>
                </div>
              </>
            ) : (
              <div className="space-y-2">
                {invoice.items.map((item, index) => (
                  <div key={index} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-gray-700">{item.description}</span>
                    <span className="font-medium">{currencyFormatter.format(item.amount)}</span>
                  </div>
                ))}
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

          {/* Payment Status (Edit Mode) */}
          {isEditing && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Status</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Status</Label>
                  <Select value={editStatus} onValueChange={(v) => setEditStatus(v as 'paid' | 'unpaid' | 'partial')}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="unpaid">Unpaid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Amount Paid (₹)</Label>
                  <Input
                    type="number"
                    value={editPaidAmount || ''}
                    onChange={(e) => setEditPaidAmount(parseFloat(e.target.value) || 0)}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Add to Ledger Option */}
              {!invoice.addedToLedger && invoice.customerId && (
                <div className="mt-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="editAddToLedger"
                      checked={editAddToLedger}
                      onChange={(e) => setEditAddToLedger(e.target.checked)}
                      className="mt-1 w-4 h-4 text-purple-600 border-gray-300 rounded"
                    />
                    <label htmlFor="editAddToLedger" className="cursor-pointer">
                      <span className="font-medium text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-purple-600" />
                        Add to Ledger
                      </span>
                      <p className="text-sm text-gray-600 mt-1">
                        Record this invoice in the customer&apos;s ledger
                      </p>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

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
                onClick={() => {
                  if (!isFirmInfoComplete(editFirmInfo)) {
                    toast.error('Please fill in all firm details');
                    return;
                  }
                  setFirmInfo(editFirmInfo);
                  setShowFirmInfoModal(false);
                  if (pendingAction) {
                    generatePDF(pendingAction === 'download', editFirmInfo);
                    setPendingAction(null);
                  }
                }}
                className="bg-slate-900 hover:bg-slate-800"
              >
                {pendingAction === 'download' ? 'Download Invoice' : 'Print Invoice'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </motion.div>
  );
}
