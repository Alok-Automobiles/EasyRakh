'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

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
  entityType: 'customer' | 'supplier';
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

interface PrintLedgerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ledgerData: LedgerData | null;
  firmInfo: FirmInfo | null;
  onFirmInfoUpdate?: (info: FirmInfo) => void;
}

export default function PrintLedgerDialog({
  open,
  onOpenChange,
  ledgerData,
  firmInfo: initialFirmInfo,
  onFirmInfoUpdate,
}: PrintLedgerDialogProps) {
  const [firmInfo, setFirmInfo] = useState<FirmInfo>({
    firmTitle: '',
    gstNumber: '',
    firmPhone: '',
    firmEmail: '',
    firmAddress: '',
  });

  useEffect(() => {
    if (initialFirmInfo) {
      setFirmInfo(initialFirmInfo);
    }
  }, [initialFirmInfo]);

  const handleFirmInfoChange = (field: keyof FirmInfo, value: string) => {
    setFirmInfo((prev) => ({ ...prev, [field]: value }));
  };

  const validateFirmInfo = (): boolean => {
    if (!firmInfo.firmTitle.trim()) {
      alert('Please enter Firm Title');
      return false;
    }
    if (!firmInfo.gstNumber.trim()) {
      alert('Please enter GST Number');
      return false;
    }
    if (!firmInfo.firmPhone.trim()) {
      alert('Please enter Phone Number');
      return false;
    }
    if (!firmInfo.firmEmail.trim()) {
      alert('Please enter Firm Email');
      return false;
    }
    if (!firmInfo.firmAddress.trim()) {
      alert('Please enter Address');
      return false;
    }
    return true;
  };

  const generatePDF = () => {
    if (!ledgerData || !validateFirmInfo()) {
      return;
    }

    // A4 portrait document
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;

    // Firm Information Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(firmInfo.firmTitle, pageWidth / 2, yPos, { align: 'center' });
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`GST: ${firmInfo.gstNumber}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
    doc.text(`Phone: ${firmInfo.firmPhone}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
    doc.text(`Email: ${firmInfo.firmEmail}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;
    doc.text(firmInfo.firmAddress, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;

    // Customer/Supplier Information (Left side)
    const leftMargin = 14;
    const rightMargin = pageWidth - 14;
    const infoWidth = 80;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(
      ledgerData.entityType === 'customer' ? 'Customer Information' : 'Supplier Information',
      leftMargin,
      yPos
    );
    yPos += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${ledgerData.entity.name}`, leftMargin, yPos);
    yPos += 6;
    if (ledgerData.entity.phone) {
      doc.text(`Phone: ${ledgerData.entity.phone}`, leftMargin, yPos);
      yPos += 6;
    }
    if (ledgerData.entity.email) {
      doc.text(`Email: ${ledgerData.entity.email}`, leftMargin, yPos);
      yPos += 6;
    }
    if (ledgerData.entity.address) {
      const addressLines = doc.splitTextToSize(
        `Address: ${ledgerData.entity.address}`,
        infoWidth
      );
      doc.text(addressLines, leftMargin, yPos);
      yPos += addressLines.length * 6;
    }

    // Ledger Table
    yPos += 5;

    // Prepare table data
    const tableData: (string | number)[][] = [];

    // Helper to format amounts for PDF (avoid ₹ symbol – not supported in default font)
    const formatAmount = (amount: number) =>
      `Rs ${amount.toLocaleString('en-IN')}`;

    // Opening Balance Row
    tableData.push([
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

    // Transaction Entries
    ledgerData.entries.forEach((entry) => {
      tableData.push([
        format(new Date(entry.date), 'dd/MM/yyyy'),
        entry.description || '-',
        entry.credit > 0 ? formatAmount(entry.credit) : '-',
        entry.debit > 0 ? formatAmount(entry.debit) : '-',
        formatAmount(Math.abs(entry.balance)),
      ]);
    });

    // Totals Row
    tableData.push([
      '',
      'Total',
      formatAmount(ledgerData.totals.credit),
      formatAmount(ledgerData.totals.debit),
      formatAmount(Math.abs(ledgerData.totals.balance)),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Description', 'Credit (Rs)', 'Debit (Rs)', 'Balance (Rs)']],
      body: tableData,
      theme: 'striped',
      pageBreak: 'auto',
      headStyles: { fillColor: [66, 66, 66], textColor: 255, fontStyle: 'bold' },
      styles: {
        fontSize: 9,
        cellPadding: 3,
        overflow: 'linebreak',
      },
      bodyStyles: {
        valign: 'top',
      },
      columnStyles: {
        0: { cellWidth: 26 },
        1: { cellWidth: 70 },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 30, halign: 'right' },
      },
      margin: { left: leftMargin, right: rightMargin, top: 10, bottom: 15 },
    });

    // Generate filename
    const entityName = ledgerData.entity.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `ledger_${entityName}_${format(new Date(), 'yyyy-MM-dd')}.pdf`;

    // Save PDF
    doc.save(fileName);

    // Update firm info if callback provided
    if (onFirmInfoUpdate) {
      onFirmInfoUpdate(firmInfo);
    }
  };

  const handleSaveAndPrint = () => {
    generatePDF();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!ledgerData) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Print Ledger</DialogTitle>
          <DialogDescription>
            Review and edit firm information before printing the ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
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
                        className={`px-4 py-2 text-sm text-right font-bold text-lg ${
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

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSaveAndPrint}>Save & Print</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

