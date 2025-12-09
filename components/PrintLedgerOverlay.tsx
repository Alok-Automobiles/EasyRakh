'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';

interface LedgerEntry {
  date: Date;
  description: string;
  credit: number;
  debit: number;
  balance: number;
  billUrl?: string;
  billPublicId?: string;
  transactionId?: string;
}

interface LedgerData {
  entity: {
    id: string;
    name: string;
    phone?: string;
    email?: string;
    address?: string;
    openingBalance: number;
    balanceType: 'credit' | 'debit';
  };
  entityType: string;
  openingBalance: {
    amount: number;
    type: 'credit' | 'debit';
  };
  entries: LedgerEntry[];
  totals: {
    credit: number;
    debit: number;
    balance: number;
  };
}

interface FirmInfo {
  firmTitle: string;
  gstNumber: string;
  firmPhone: string;
  firmEmail: string;
  firmAddress: string;
}

interface PrintLedgerOverlayProps {
  open: boolean;
  onClose: () => void;
  ledgerData: LedgerData | null;
  initialFirmInfo: FirmInfo | null;
}

export default function PrintLedgerOverlay({
  open,
  onClose,
  ledgerData,
  initialFirmInfo,
}: PrintLedgerOverlayProps) {
  const [firmInfo, setFirmInfo] = useState<FirmInfo>({
    firmTitle: '',
    gstNumber: '',
    firmPhone: '',
    firmEmail: '',
    firmAddress: '',
  });

  // Initialize firm info from props when overlay opens
  useEffect(() => {
    if (open && initialFirmInfo) {
      setFirmInfo(initialFirmInfo);
    }
  }, [open, initialFirmInfo]);

  // Lock body scroll when overlay is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    // Cleanup on unmount
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  // Handle ESC key to close
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open, onClose]);

  const handleFirmInfoChange = (field: keyof FirmInfo, value: string) => {
    setFirmInfo((prev) => ({ ...prev, [field]: value }));
  };

  const validateFirmInfo = (): boolean => {
    if (!firmInfo.firmTitle.trim()) {
      toast.error('Please enter Firm Title');
      return false;
    }
    if (!firmInfo.gstNumber.trim()) {
      toast.error('Please enter GST Number');
      return false;
    }
    if (!firmInfo.firmPhone.trim()) {
      toast.error('Please enter Phone Number');
      return false;
    }
    if (!firmInfo.firmEmail.trim()) {
      toast.error('Please enter Firm Email');
      return false;
    }
    if (!firmInfo.firmAddress.trim()) {
      toast.error('Please enter Address');
      return false;
    }
    return true;
  };

  const generatePDF = useCallback(() => {
    if (!ledgerData || !validateFirmInfo()) {
      return;
    }

    try {
      // A4 portrait document
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 18;
      const primaryGreen: [number, number, number] = [34, 197, 94];
      const darkGreen: [number, number, number] = [16, 185, 129];
      const mutedText: [number, number, number] = [75, 85, 99];

      // Decorative green header
      doc.setFillColor(primaryGreen[0], primaryGreen[1], primaryGreen[2]);
      doc.rect(0, 0, pageWidth, 38, 'F');
      doc.setFillColor(darkGreen[0], darkGreen[1], darkGreen[2]);
      doc.triangle(0, 0, 70, 0, 0, 38, 'F');
      doc.triangle(pageWidth, 0, pageWidth - 80, 0, pageWidth, 38, 'F');

      // Header text
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(firmInfo.firmTitle || 'Your Firm', margin, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const headerLines = doc.splitTextToSize(firmInfo.firmAddress || '', 80);
      if (headerLines.length) {
        doc.text(headerLines, margin, 23);
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(30);
      doc.text('LEDGER', pageWidth - margin, 20, { align: 'right' });

      // Reset text color for body content
      doc.setTextColor(17, 24, 39);
      let yPos = 50;

      // Invoice meta
      const formattedDate = format(new Date(), 'dd MMMM yyyy');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Invoice Date :', margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(formattedDate, margin + 32, yPos);

      doc.setFont('helvetica', 'bold');
      doc.text('Invoice to :', pageWidth - margin - 60, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(ledgerData.entity.name, pageWidth - margin, yPos, { align: 'right' });
      yPos += 6;

      doc.setDrawColor(229, 231, 235);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 10;

      const drawStackedInfo = (title: string, lines: string[]) => {
        const availableWidth = pageWidth - margin * 2;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(title, margin, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(mutedText[0], mutedText[1], mutedText[2]);

        const wrapped = lines
          .filter(Boolean)
          .flatMap((line) => doc.splitTextToSize(line, availableWidth));

        wrapped.forEach((line, index) => {
          doc.text(line, margin, yPos + index * 5);
        });

        yPos += wrapped.length * 5 + 8;
        doc.setTextColor(17, 24, 39);
      };

      drawStackedInfo('Firm Information', [
        `Firm: ${firmInfo.firmTitle}`,
        `GST: ${firmInfo.gstNumber}`,
        `Phone: ${firmInfo.firmPhone}`,
        `Email: ${firmInfo.firmEmail}`,
        `Address: ${firmInfo.firmAddress}`,
      ]);

      drawStackedInfo(
        ledgerData.entityType === 'customer' ? 'Customer' : 'Supplier',
        [
          `Name: ${ledgerData.entity.name}`,
          ledgerData.entity.phone ? `Phone: ${ledgerData.entity.phone}` : '',
          ledgerData.entity.email ? `Email: ${ledgerData.entity.email}` : '',
          ledgerData.entity.address ? `Address: ${ledgerData.entity.address}` : '',
        ]
      );

      yPos += 2;

      // Prepare table data
      const tableRows: (string | number)[][] = [];
      const formatAmount = (amount: number) => `Rs ${amount.toLocaleString('en-IN')}`;

      tableRows.push([
        format(new Date(), 'dd/MM/yyyy'),
        'Opening Balance',
        ledgerData.openingBalance.type === 'credit'
          ? formatAmount(ledgerData.openingBalance.amount)
          : '-',
        ledgerData.openingBalance.type === 'debit'
          ? formatAmount(ledgerData.openingBalance.amount)
          : '-',
        formatAmount(Math.abs(ledgerData.openingBalance.amount)),
      ]);

      ledgerData.entries.forEach((entry) => {
        tableRows.push([
          format(new Date(entry.date), 'dd/MM/yyyy'),
          entry.description || '-',
          entry.credit > 0 ? formatAmount(entry.credit) : '-',
          entry.debit > 0 ? formatAmount(entry.debit) : '-',
          formatAmount(Math.abs(entry.balance)),
        ]);
      });

      autoTable(doc, {
        startY: yPos,
        head: [['DATE', 'ITEM DESCRIPTION', 'CREDIT', 'DEBIT', 'BALANCE']],
        body: tableRows,
        foot: [
          [
            { content: 'SUBTOTAL', colSpan: 2, styles: { halign: 'right' } },
            { content: formatAmount(ledgerData.totals.credit), styles: { halign: 'right' } },
            { content: formatAmount(ledgerData.totals.debit), styles: { halign: 'right' } },
            {
              content: formatAmount(ledgerData.totals.balance),
              styles: { halign: 'right' },
            },
          ],
        ],
        headStyles: {
          fillColor: primaryGreen,
          textColor: 255,
          fontSize: 11,
          fontStyle: 'bold',
          halign: 'center',
          cellPadding: 4,
        },
        bodyStyles: {
          fontSize: 9,
          textColor: [31, 41, 55],
          lineColor: [229, 231, 235],
          lineWidth: 0.1,
        },
        alternateRowStyles: {
          fillColor: [247, 247, 247],
        },
        footStyles: {
          fillColor: [240, 253, 244],
          textColor: primaryGreen,
          fontStyle: 'bold',
          fontSize: 10,
        },
        columnStyles: {
          0: { cellWidth: 24 },
          1: { cellWidth: 78 },
          2: { cellWidth: 28, halign: 'right' },
          3: { cellWidth: 28, halign: 'right' },
          4: { cellWidth: 32, halign: 'right' },
        },
        margin: { left: margin, right: margin, top: 10, bottom: 20 },
        showFoot: 'lastPage',
        theme: 'plain',
      });

      // Generate filename
      const entityName = ledgerData.entity.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `ledger_${entityName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;

      // Save PDF
      doc.save(fileName);
      toast.success('PDF generated successfully');
    } catch (error) {
      console.error('Failed to generate PDF', error);
      toast.error('Failed to generate PDF. Please try again.');
    }
  }, [ledgerData, firmInfo]);

  const handleSaveAndPrint = () => {
    generatePDF();
  };

  const handleCancel = () => {
    onClose();
  };

  if (!ledgerData) {
    return null;
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={(e) => {
            // Close when clicking backdrop
            if (e.target === e.currentTarget) {
              onClose();
            }
          }}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="relative z-10 w-full max-w-5xl max-h-[90vh] mx-4 bg-white rounded-lg shadow-2xl overflow-hidden flex flex-col"
          >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b bg-gray-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Print Ledger</h2>
            <p className="text-sm text-gray-600 mt-1">
              Review and edit firm information before printing the ledger.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleCancel}
            className="rounded-full"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Firm Information Section */}
            <div className="space-y-4 border-b pb-4">
              <h3 className="text-lg font-semibold">Firm Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firmTitle">Firm Title *</Label>
                  <Input
                    id="firmTitle"
                    value={firmInfo.firmTitle}
                    onChange={(e) => handleFirmInfoChange('firmTitle', e.target.value)}
                    placeholder="Firm Title"
                  />
                </div>
                <div>
                  <Label htmlFor="gstNumber">GST Number *</Label>
                  <Input
                    id="gstNumber"
                    value={firmInfo.gstNumber}
                    onChange={(e) => handleFirmInfoChange('gstNumber', e.target.value)}
                    placeholder="GST Number"
                  />
                </div>
                <div>
                  <Label htmlFor="firmPhone">Phone Number *</Label>
                  <Input
                    id="firmPhone"
                    value={firmInfo.firmPhone}
                    onChange={(e) => handleFirmInfoChange('firmPhone', e.target.value)}
                    placeholder="Phone Number"
                  />
                </div>
                <div>
                  <Label htmlFor="firmEmail">Email *</Label>
                  <Input
                    id="firmEmail"
                    type="email"
                    value={firmInfo.firmEmail}
                    onChange={(e) => handleFirmInfoChange('firmEmail', e.target.value)}
                    placeholder="Email"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="firmAddress">Address *</Label>
                  <Textarea
                    id="firmAddress"
                    value={firmInfo.firmAddress}
                    onChange={(e) => handleFirmInfoChange('firmAddress', e.target.value)}
                    placeholder="Address"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Customer/Supplier Information Section */}
            <div className="space-y-4 border-b pb-4">
              <h3 className="text-lg font-semibold">
                {ledgerData.entityType === 'customer' ? 'Customer' : 'Supplier'} Information
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Name</Label>
                  <div className="text-sm text-gray-700 py-2">{ledgerData.entity.name}</div>
                </div>
                {ledgerData.entity.phone && (
                  <div>
                    <Label>Phone</Label>
                    <div className="text-sm text-gray-700 py-2">{ledgerData.entity.phone}</div>
                  </div>
                )}
                {ledgerData.entity.email && (
                  <div>
                    <Label>Email</Label>
                    <div className="text-sm text-gray-700 py-2">{ledgerData.entity.email}</div>
                  </div>
                )}
                {ledgerData.entity.address && (
                  <div className="col-span-2">
                    <Label>Address</Label>
                    <div className="text-sm text-gray-700 py-2">{ledgerData.entity.address}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Ledger Table Preview */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Ledger Entries</h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Description
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Credit
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Debit
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Balance
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {/* Opening Balance Row */}
                      <tr className="bg-gray-50">
                        <td className="px-4 py-2 text-sm text-gray-900">
                          {format(new Date(), 'MMM dd, yyyy')}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">Opening Balance</td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">
                          {ledgerData.openingBalance.type === 'credit'
                            ? `₹${ledgerData.openingBalance.amount.toLocaleString()}`
                            : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-gray-900">
                          {ledgerData.openingBalance.type === 'debit'
                            ? `₹${ledgerData.openingBalance.amount.toLocaleString()}`
                            : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">
                          ₹{Math.abs(ledgerData.openingBalance.amount).toLocaleString()}
                        </td>
                      </tr>

                      {/* Transaction Entries */}
                      {ledgerData.entries.map((entry, index) => {
                        const balanceColor = entry.balance >= 0 ? 'text-green-600' : 'text-red-600';
                        return (
                          <tr key={index}>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {format(new Date(entry.date), 'MMM dd, yyyy')}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {entry.description || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-green-600">
                              {entry.credit > 0 ? `₹${entry.credit.toLocaleString()}` : '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-right text-red-600">
                              {entry.debit > 0 ? `₹${entry.debit.toLocaleString()}` : '-'}
                            </td>
                            <td className={`px-4 py-2 text-sm text-right font-semibold ${balanceColor}`}>
                              {entry.balance >= 0 ? '' : '-'}₹
                              {Math.abs(entry.balance).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td
                          colSpan={2}
                          className="px-4 py-2 text-sm font-medium text-gray-900"
                        >
                          Total
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-medium text-green-600">
                          ₹{ledgerData.totals.credit.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-sm text-right font-medium text-red-600">
                          ₹{ledgerData.totals.debit.toLocaleString()}
                        </td>
                        <td
                          className={`px-4 py-2 text-right font-bold text-lg ${
                            ledgerData.totals.balance >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {ledgerData.totals.balance >= 0 ? '' : '-'}₹
                          {Math.abs(ledgerData.totals.balance).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t bg-gray-50">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSaveAndPrint}>Save & Print</Button>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

