import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../services/api';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNavigate } from "react-router-dom";
import { jobOrderApi } from '../services/api';
import SearchableDropdown from '../components/SearchableDropdown';
import { zebraPrinterService, BarcodePrintData } from '../services/zebraPrinterService';

interface BarcodeEntry {
  barcode: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  quantity: number;
  layers: number;
  serial?: number;
  status?: 'success' | 'error' | 'duplicate';
  brand_id: number;
  model_id: number;
  size_id: number;
  color_id: number;
  last_updated_at?: string;
  is_second_degree?: boolean;
}

interface ErrorRow {
  rowNumber: number;
  data: any;
  error: string;
}

interface ErrorDisplayProps {
  errors: Array<{
    message: string;
    details?: Array<{
      rowNumber?: number;
      data?: any;
      error?: string;
    }>;
  }>;
  className?: string;
  showAllColumns: boolean;
}

const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ errors, className, showAllColumns }) => {
  const { t } = useTranslation();
  
  if (!errors.length) return null;

  return (
    <div className={cn("mt-2 text-sm text-red-600", className)}>
      {errors.map((error, index) => (
        <div key={index} className="mb-4">
          <p className="mb-2">{error.message}</p>
          {error.details && error.details.length > 0 && (
            <div className="border border-red-200 rounded-md">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-red-50">
                      <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('bulkBarcode.rowNumber')}</TableHead>
                      <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('common.error')}</TableHead>
                                              <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('bulkBarcode.size')}</TableHead>
                        <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('bulkBarcode.color')}</TableHead>
                        <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('barcode.quantity')}</TableHead>
                        <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('bulkBarcode.layers')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {error.details.map((detail, idx) => (
                      <TableRow key={idx} className="bg-red-50">
                        <TableCell className="font-medium md:px-4 md:py-2 px-2 py-1">{detail.rowNumber}</TableCell>
                        <TableCell className="text-red-600 md:px-4 md:py-2 px-2 py-1">{detail.error}</TableCell>
                        <TableCell className="md:px-4 md:py-2 px-2 py-1">{detail.data?.size}</TableCell>
                        <TableCell className="md:px-4 md:py-2 px-2 py-1">{detail.data?.color}</TableCell>
                        <TableCell className="md:px-4 md:py-2 px-2 py-1">{detail.data?.quantity}</TableCell>
                        <TableCell className="md:px-4 md:py-2 px-2 py-1">{detail.data?.layers}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

const BulkBarcodeCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  // Function to translate backend error messages
  const translateError = (errorMessage: string): string => {
    const errorMap: { [key: string]: string } = {
      'Size/color not allowed for this job order.': t('bulkBarcode.errors.sizeColorNotAllowed'),
      'Size not allowed for this job order.': t('bulkBarcode.errors.sizeNotAllowed'),
      'Color not allowed for this job order.': t('bulkBarcode.errors.colorNotAllowed'),
      'Missing required field:': t('bulkBarcode.errors.missingRequiredField'),
      'Missing required fields:': t('bulkBarcode.errors.missingRequiredFields'),
      'Quantity must be a positive number': t('bulkBarcode.errors.quantityPositive'),
      'Layers must be a positive number': t('bulkBarcode.errors.layersPositive'),
      'Quantity must be a valid number': t('bulkBarcode.errors.quantityValid'),
      'Layers must be a valid number': t('bulkBarcode.errors.layersValid'),
      'Missing required columns:': t('bulkBarcode.errors.missingRequiredColumns'),
      'Job order not found.': t('bulkBarcode.errors.jobOrderNotFound'),
      'The uploaded file is empty.': t('bulkBarcode.errors.emptyFile'),
      'Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.': t('bulkBarcode.errors.invalidFileFormat'),
      'The file is empty or contains no data.': t('bulkBarcode.errors.fileEmptyOrNoData'),
    };

    // Check for exact matches first
    if (errorMap[errorMessage]) {
      return errorMap[errorMessage];
    }

    // Check for partial matches (for messages that might have additional context)
    for (const [key, translation] of Object.entries(errorMap)) {
      if (errorMessage.includes(key)) {
        return errorMessage.replace(key, translation);
      }
    }

    // If no translation found, return the original message
    return errorMessage;
  };
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Array<{
    message: string;
    details?: Array<{
      rowNumber?: number;
      data?: any;
      error?: string;
    }>;
  }>>([]);
  const [preview, setPreview] = useState<BarcodeEntry[]>([]);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [duplicateBarcodes, setDuplicateBarcodes] = useState<any[]>([]);
  const [submitMessage, setSubmitMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [printCount, setPrintCount] = useState<number>(1);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [currentErrorPage, setCurrentErrorPage] = useState(1);
  const itemsPerPage = 10;
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [jobOrders, setJobOrders] = useState<{ job_order_id: number; job_order_number: string; model_name: string | null; brand_name: string | null }[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);
  const [selectedJobOrder, setSelectedJobOrder] = useState<{ job_order_id: number; job_order_number: string; model_name: string | null; brand_name: string | null } | null>(null);
  const [jobOrderItems, setJobOrderItems] = useState<import('../services/api').JobOrderItemWithDetails[]>([]);
  const [showSecondDegreeModal, setShowSecondDegreeModal] = useState(false);
  const [secondDegreeSelections, setSecondDegreeSelections] = useState<{[key: string]: number}>({});
  const [zebraPrinters, setZebraPrinters] = useState<string[]>([]);
  const [allPrinters, setAllPrinters] = useState<{name: string, type: 'server' | 'zebra'}[]>([]);

  // Calculate pagination for processed data
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = preview.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(preview.length / itemsPerPage);

  // Calculate pagination for error data
  const indexOfLastError = currentErrorPage * itemsPerPage;
  const indexOfFirstError = indexOfLastError - itemsPerPage;
  const currentErrors = errorRows.slice(indexOfFirstError, indexOfLastError);
  const totalErrorPages = Math.ceil(errorRows.length / itemsPerPage);

  // Handle page change for processed data
  const handlePageChange = (pageNumber: number) => {
    setCurrentPage(pageNumber);
  };

  // Handle page change for error data
  const handleErrorPageChange = (pageNumber: number) => {
    setCurrentErrorPage(pageNumber);
  };

  // Render pagination controls
  const renderPagination = (currentPage: number, totalPages: number, onPageChange: (page: number) => void) => {
    const pageNumbers = [];
    const maxPagesToShow = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = startPage + maxPagesToShow - 1;
    
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(i);
    }
    
    return (
      <div className="flex justify-center mt-4">
        <nav className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            {t('common.previous')}
          </button>
          
          {pageNumbers.map(number => (
            <button
              key={number}
              onClick={() => onPageChange(number)}
              className={`px-3 py-1 rounded border ${
                currentPage === number ? 'bg-green text-white' : 'hover:bg-gray-100'
              }`}
            >
              {number}
            </button>
          ))}
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            {t('common.next')}
          </button>
        </nav>
      </div>
    );
  };

  useEffect(() => {
    fetchAllPrinters();
  }, []);

  useEffect(() => {
    jobOrderApi.getAllSimple().then(setJobOrders);
  }, []);

  useEffect(() => {
    if (selectedJobOrderId !== null) {
      const found = jobOrders.find(j => j.job_order_id === selectedJobOrderId) || null;
      setSelectedJobOrder(found);
    } else {
      setSelectedJobOrder(null);
    }
  }, [selectedJobOrderId, jobOrders]);

  useEffect(() => {
    if (selectedJobOrderId) {
      jobOrderApi.getItemsWithDetails(selectedJobOrderId).then(setJobOrderItems);
    } else {
      setJobOrderItems([]);
    }
  }, [selectedJobOrderId]);

  const fetchAllPrinters = async () => {
    try {
      // Fetch server printers
      const serverResponse = await api.get('/barcodes/printers');
      const serverPrinters = serverResponse.data.printers || [];
      
      // Fetch Zebra printers
      let zebraPrintersList: string[] = [];
      try {
        const isZebraAvailable = await zebraPrinterService.checkServiceAvailability();
        if (isZebraAvailable) {
          const zebraPrintersData = await zebraPrinterService.getAvailablePrinters();
          zebraPrintersList = zebraPrintersData.map(p => p.name);
        }
      } catch (error) {
        console.log('Zebra printers not available:', error);
      }
      
      setZebraPrinters(zebraPrintersList);
      
      // Combine all printers with type information
      const combinedPrinters = [
        ...zebraPrintersList.map(name => ({ name, type: 'zebra' as const })),
        ...serverPrinters.map(name => ({ name, type: 'server' as const }))
      ];
      
      setAllPrinters(combinedPrinters);
      
      // Default to first Zebra printer, then first server printer
      if (zebraPrintersList.length > 0) {
        setSelectedPrinter(zebraPrintersList[0]);
      } else if (serverPrinters.length > 0) {
        setSelectedPrinter(serverPrinters[0]);
      }
    } catch (error) {
      console.error('Error fetching printers:', error);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await api.get('/barcodes/template', {
        responseType: 'blob'
      });
      let filename = 'barcode_template.xlsx';
      if (selectedJobOrder) {
        const jobOrderNumber = selectedJobOrder.job_order_number || 'JobOrder';
        const clientName = selectedJobOrder.brand_name || 'Client';
        const modelNumber = selectedJobOrder.model_name || 'Model';
        filename = `${jobOrderNumber}_${clientName}_${modelNumber}.xlsx`;
      }
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
    }
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsLoading(true);
    setErrors([]);
    setPreview([]);
    setErrorRows([]);
    setSubmitMessage('');
    setIsSubmitted(false);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedJobOrderId) {
      formData.append('job_order_id', String(selectedJobOrderId));
    }

    try {
      const response = await api.post('/barcodes/bulk/validate', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const { valid_rows, error_rows } = response.data;
      
      setPreview(valid_rows.map((row: any) => ({
        ...row,
        status: 'success' as const
      })));
      
      // Translate error messages in error_rows
      const translatedErrorRows = error_rows.map((errorRow: any) => ({
        ...errorRow,
        error: translateError(errorRow.error)
      }));
      
      setErrorRows(translatedErrorRows);
      
      // Check if there are any valid rows
      if (valid_rows.length === 0) {
        // No valid rows - show error message
        const errorMessage = t('bulkBarcode.noValidRows');
        setErrors([{
          message: errorMessage,
          details: translatedErrorRows
        }]);
        setSubmitMessage('');
        setIsSubmitted(false);
      } else if (error_rows.length > 0) {
        // Some rows have errors but there are valid rows too
        const errorMessage = t('bulkBarcode.foundErrors', { count: error_rows.length });
        
        // Fallback if interpolation doesn't work
        const finalMessage = errorMessage.includes('{count}') 
          ? errorMessage.replace('{count}', error_rows.length.toString())
          : errorMessage;
        
        setErrors([{
          message: finalMessage,
          details: translatedErrorRows
        }]);
        
        // Show validation summary message
        const successMessage = t('bulkBarcode.validationComplete', {
          count: valid_rows.length,
          errors: error_rows.length
        })
        .replace('{count}', String(valid_rows.length))
        .replace('{errors}', String(error_rows.length));

        setSubmitMessage(successMessage);
        setIsSubmitted(false); // Don't mark as submitted if there are errors
      } else {
        // All rows are valid
        const successMessage = t('bulkBarcode.allRowsValid', {
          count: valid_rows.length
        })
        .replace('{count}', String(valid_rows.length));

        setSubmitMessage(successMessage);
        setIsSubmitted(false); // Don't mark as submitted until user clicks submit button
      }

      const updatedPreview = updatePreviewWithStatus(preview, valid_rows, response);
      setPreview(updatedPreview);
      
    } catch (err: any) {
      if (err.response && err.response.data) {
        const { status, data } = err.response;
        let errorMessage = translateError(data.detail) || t('bulkBarcode.failedToSubmit');

        if (status === 400) {
          errorMessage = translateError(data.detail) || t('bulkBarcode.badRequest');
        } else if (status === 422) {
          const validationErrors = data.detail;
          errorMessage = Array.isArray(validationErrors)
            ? validationErrors.map((error: any) => `${error.loc[error.loc.length - 1]}: ${translateError(error.msg)}`).join('\n')
            : t('bulkBarcode.validationError');
        }
        
        setErrors([{ message: errorMessage }]);
      } else {
        setErrors([{ message: translateError(err.message) || t('bulkBarcode.networkError') }]);
      }
    } finally {
      setIsLoading(false);
      setIsSubmitting(false);
    }
  };

  const validateRows = (rows: BarcodeEntry[]) => {
    const validRows = rows.filter(row => row.status === 'success');
    if (validRows.length === 0) {
      return { isValid: false, error: 'No valid rows to submit' };
    }
    return { isValid: true, validRows };
  };

  const transformRowsForSubmission = (rows: BarcodeEntry[]) => {
    return rows.map(row => {
      const baseData = {
        job_order_id: selectedJobOrderId,
        size_id: row.size_id,
        color_id: row.color_id,
        quantity: row.quantity,
        layers: row.layers,
        current_phase: 1, // Default to first phase (Cutting)
        status: 'In Progress', // Default status for new batches
        is_second_degree: row.is_second_degree || false
      };

      // All batches now have barcodes (generated by backend validation)
      return {
        ...baseData,
        barcode: row.barcode,
        serial: row.serial ? String(row.serial).padStart(3, '0') : '001'
      };
    });
  };

  const updatePreviewWithStatus = (preview: BarcodeEntry[], validRows: BarcodeEntry[], response: any) => {
    const validBarcodes = validRows.map(row => row.barcode);
    const duplicateBarcodes = response.data.duplicate_barcodes.map((item: any) => item.barcode);
    
    return preview.map(row => {
      if (validBarcodes.includes(row.barcode)) {
        if (duplicateBarcodes.includes(row.barcode)) {
          return { ...row, status: 'duplicate' as const };
        } else {
          return { ...row, status: 'success' as const };
        }
      }
      return row;
    });
  };

  const handleSubmit = async () => {
    // Check if there are any valid rows to submit
    const validRows = preview.filter(row => row.status === 'success');
    
    if (validRows.length === 0) {
      // No valid rows to submit
      if (errorRows.length > 0) {
        // There are error rows - show the error details
        setErrors([{ 
          message: t('bulkBarcode.noValidRowsToSubmit'),
          details: errorRows
        }]);
      } else {
        // No rows at all
        setErrors([{ message: t('bulkBarcode.noRowsToSubmit') }]);
      }
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors([]);
      
      const submitData = transformRowsForSubmission(validRows);
      const response = await api.post('/barcodes/bulk/submit', submitData);
      
      const updatedPreview = updatePreviewWithStatus(preview, validRows, response);
      setPreview(updatedPreview);
      
      const duplicates = response.data.duplicate_barcodes?.length || 0;
      const validCount = validRows.length;
      const errorCount = errorRows.length;

      const successMessage = t('bulkBarcode.successfullySubmitted', {
        count: validCount,
        duplicates: duplicates,
        errors: errorCount
      })
      .replace('{count}', String(validCount))
      .replace('{duplicates}', String(duplicates))
      .replace('{errors}', String(errorCount));

      setSubmitMessage(successMessage);
      setIsSubmitted(true);
    } catch (err: any) {
      if (err.response && err.response.data) {
        const { status, data } = err.response;
        let errorMessage = translateError(data.detail) || t('bulkBarcode.failedToSubmit');

        if (status === 400) {
          errorMessage = translateError(data.detail) || t('bulkBarcode.badRequest');
        } else if (status === 422) {
          const validationErrors = data.detail;
          errorMessage = Array.isArray(validationErrors)
            ? validationErrors.map((error: any) => `${error.loc[error.loc.length - 1]}: ${translateError(error.msg)}`).join('\n')
            : t('bulkBarcode.validationError');
        }
        
        setErrors([{ message: errorMessage }]);
      } else {
        setErrors([{ message: translateError(err.message) || t('bulkBarcode.networkError') }]);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setErrors([]);
    setPreview([]);
    setErrorRows([]);
    setIsSubmitted(false);
    setSubmitMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePrintBarcodes = async () => {
    if (!isSubmitted || !selectedPrinter) {
      setErrors([{ message: t('bulkBarcode.selectPrinterMessage') }]);
      return;
    }

    try {
      setIsPrinting(true);
      
      // Only print barcodes with status 'success' (exclude duplicates)
      const barcodesToPrint = preview
        .filter(item => item.status === 'success')
        .map(item => ({
          barcode: item.barcode,
          brand: item.brand,
          model: item.model,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          layers: item.layers,
          serial: item.serial || 1
        }));

      if (barcodesToPrint.length === 0) {
        setErrors([{ message: t('bulkBarcode.noBarcodesForPrinting') }]);
        return;
      }

      // Check if selected printer is a Zebra printer
      const selectedPrinterInfo = allPrinters.find(p => p.name === selectedPrinter);
      const isZebraPrinter = selectedPrinterInfo?.type === 'zebra';

      if (isZebraPrinter) {
        // Use Zebra Browser Print for client-side printing
        const zebraPrintData: BarcodePrintData[] = barcodesToPrint.map(item => ({
          barcode: item.barcode,
          brand: item.brand,
          model: item.model,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          layers: item.layers,
          serial: item.serial
        }));

        await zebraPrinterService.printMultipleBarcodes(
          zebraPrintData,
          selectedPrinter,
          printCount
        );

        setSubmitMessage(prev => 
          prev + '\n' + t('zebraPrinter.printSuccess', {
            printer: selectedPrinter
          })
        );
      } else {
        // Use server-side printing (existing functionality)
        const response = await api.post('/barcodes/print', {
          barcodes: barcodesToPrint,
          count: printCount,
          printer_name: selectedPrinter
        });
        
        setSubmitMessage(prev => 
          prev + '\n' + t('bulkBarcode.printedBarcodes', {
            count: barcodesToPrint.length,
            times: printCount,
            printer: selectedPrinter
          })
        );
      }
    } catch (err: any) {
      const selectedPrinterInfo = allPrinters.find(p => p.name === selectedPrinter);
      const isZebraPrinter = selectedPrinterInfo?.type === 'zebra';
      
      const errorMessage = isZebraPrinter
        ? t('zebraPrinter.printError', { error: err.message })
        : translateError(err.response?.data?.detail) || t('bulkBarcode.failedToPrint');
      setErrors([{ message: errorMessage }]);
    } finally {
      setIsPrinting(false);
    }
  };

  const handleSecondDegreeBatch = () => {
    setShowSecondDegreeModal(true);
    // Initialize selections with 0 for all size/color combinations
    const initialSelections: {[key: string]: number} = {};
    jobOrderItems.forEach(item => {
      const key = `${item.size_value}_${item.color_name}`;
      initialSelections[key] = 0;
    });
    setSecondDegreeSelections(initialSelections);
  };


  const handleSecondDegreeSubmit = async () => {
    if (!selectedJobOrderId) return;

    try {
      setIsLoading(true);
      setErrors([]);

      // Create second degree batch data for validation
      const secondDegreeData: any[] = [];
      const validationErrors: string[] = [];
      
      Object.entries(secondDegreeSelections).forEach(([key, quantity]) => {
        if (quantity > 0) {
          const [size, color] = key.split('_');
          const item = jobOrderItems.find(i => i.size_value === size && i.color_name === color);
          
          if (!item) {
            validationErrors.push(`Size "${size}" and Color "${color}" combination not found in job order items`);
            return;
          }
          
          // Create data for validation for this size/color combination
          for (let i = 0; i < quantity; i++) {
            const data = {
              job_order_id: selectedJobOrderId,
              size_id: item.size_id,
              color_id: item.color_id,
              quantity: 0, // Second degree batches have quantity 0
              layers: 1, // Default layers
              current_phase: 1,
              status: 'In Progress',
              is_second_degree: true
            };
            secondDegreeData.push(data);
          }
        }
      });

      // Check for validation errors
      if (validationErrors.length > 0) {
        setErrors([{ message: validationErrors.join('\n') }]);
        return;
      }

      if (secondDegreeData.length === 0) {
        setErrors([{ message: t('bulkBarcode.noSecondDegreeBatchesSelected') }]);
        return;
      }

      // Validate and generate barcodes through backend
      const response = await api.post('/barcodes/bulk/validate-second-degree', secondDegreeData);
      const { valid_rows, error_rows } = response.data;

      if (error_rows.length > 0) {
        const errorMessages = error_rows.map((error: any) => 
          `Row ${error.rowNumber}: ${error.error}`
        );
        setErrors([{ message: errorMessages.join('\n') }]);
        return;
      }

      // Add validated entries to preview
      const validatedEntries: BarcodeEntry[] = valid_rows.map((row: any) => ({
        ...row,
        status: 'success' as const
      }));

      setPreview(prev => [...prev, ...validatedEntries]);
      setSubmitMessage(t('bulkBarcode.secondDegreeBatchesAddedToPreview', { count: validatedEntries.length }));
      setShowSecondDegreeModal(false);
      setSecondDegreeSelections({});

    } catch (err: any) {
      console.error('Error creating second degree batch entries:', err);
      setErrors([{ message: translateError(err.response?.data?.detail) || t('bulkBarcode.failedToCreateSecondDegree') }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('bulkBarcode.title')}</h1>
        <p className="text-gray-600">{t('bulkBarcode.subtitle')}</p>
      </div>

      {/* Job Order Selection */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <h2 className="text-lg font-semibold mb-3">{t('bulkBarcode.selectJobOrder')}</h2>
        <div className="mb-4">
          <SearchableDropdown
            value={selectedJobOrderId ? jobOrders.find(j => j.job_order_id === selectedJobOrderId)?.job_order_number || '' : ''}
            onChange={val => {
              const found = jobOrders.find(j => j.job_order_number === val);
              setSelectedJobOrderId(found ? found.job_order_id : null);
            }}
            options={jobOrders.map(order => order.job_order_number)}
            placeholder={t('bulkBarcode.selectJobOrderPlaceholder')}
            label={t('bulkBarcode.selectJobOrder')}
            disabled={jobOrders.length === 0}
            className="w-[300px]"
          />
        </div>
        {selectedJobOrder && (
          <div className="p-4 border rounded bg-gray-50 mb-2">
            <div><strong>{t('barcode.jobOrderNumber')}:</strong> {selectedJobOrder.job_order_number}</div>
            <div><strong>{t('bulkBarcode.model')}:</strong> {selectedJobOrder.model_name || t('bulkBarcode.noModel')}</div>
            <div><strong>{t('bulkBarcode.brand')}:</strong> {selectedJobOrder.brand_name || t('bulkBarcode.noBrand')}</div>
            {jobOrderItems.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-8">
                <div>
                  <div className="font-semibold mb-1">{t('bulkBarcode.referencedColors')}:</div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(jobOrderItems.map(i => i.color_name))).map(color => (
                      <span key={color} className="inline-block bg-green text-white text-xs px-2 py-1 rounded">
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-semibold mb-1">{t('bulkBarcode.referencedSizes')}:</div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(jobOrderItems.map(i => i.size_value))).map(size => (
                      <span key={size} className="inline-block bg-green text-white text-xs px-2 py-1 rounded">
                        {size}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* Add Second Degree Batch Button */}
        {selectedJobOrder && jobOrderItems.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              className="btn-outline border-blue-500 text-blue-600 hover:bg-blue-50"
              onClick={handleSecondDegreeBatch}
              disabled={isLoading || isSubmitting}
            >
              {t('bulkBarcode.addSecondDegreeBatch')}
            </button>
          </div>
        )}
      </div>

      {/* Block rest of form until job order is selected */}
      <div className={selectedJobOrder ? '' : 'pointer-events-none opacity-50'}>
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">{t('bulkBarcode.uploadFile')}</h2>
            
            <div className="mb-4">
              <button
                type="button"
                className="btn-primary mb-4"
                onClick={downloadTemplate}
              >
                {t('bulkBarcode.downloadTemplate')}
              </button>

              <div className={`border-2 border-dashed rounded-lg p-6 text-center ${errors.length > 0 ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50'}`}>
                <div className="mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                
                <p className="text-sm text-gray-600 mb-2">
                  {t('bulkBarcode.dragDropText')}
                </p>
                <p className="text-xs text-gray-500 mb-2">
                  {t('bulkBarcode.supportedFormats')}
                </p>
                
                <button 
                  type="button"
                  className="mt-2 px-4 py-2 bg-green text-white rounded hover:opacity-90"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isSubmitting}
                >
                  {t('bulkBarcode.browseFiles')}
                </button>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFileChange}
                  accept=".xlsx,.xls,.csv"
                  disabled={isLoading || isSubmitting}
                />
              </div>            
              {file && !errors.length && (
                <div className="mt-3 flex items-center">
                  <span className="text-sm font-medium">{t('bulkBarcode.selectedFile')}</span>
                  <span className="ml-2 text-sm text-gray-600">{file.name}</span>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="ml-2 text-sm text-red-600 hover:text-red-800"
                    disabled={isLoading || isSubmitting}
                  >
                    {t('bulkBarcode.remove')}
                  </button>
                </div>
              )}
            </div>
          </div>

          {isLoading && (
            <div className="text-center py-10">
              <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
              <p className="text-gray-600">{t('bulkBarcode.processingFile')}</p>
            </div>
          )}

          {!isLoading && (preview.length > 0 || errorRows.length > 0) && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">{t('bulkBarcode.previewData')}</h2>
              {submitMessage && (
                <p className="text-sm text-gray-600 mb-4">{submitMessage}</p>
              )}

              {/* Problem Rows Table */}
              {errorRows.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-md font-semibold mb-2 text-red-600">
                    {t('bulkBarcode.problemRows')} ({errorRows.length})
                  </h3>
                  <ErrorDisplay 
                    errors={[{
                      message: (() => {
                        const errorMessage = t('bulkBarcode.foundErrors', { count: errorRows.length });
                        
                        // Fallback if interpolation doesn't work
                        return errorMessage.includes('{count}') 
                          ? errorMessage.replace('{count}', errorRows.length.toString())
                          : errorMessage;
                      })(),
                      details: errorRows
                    }]} 
                    showAllColumns={showAllColumns}
                  />
                </div>
              )}
              
              {/* Main Preview Table - Only show if there are valid rows */}
              {preview.length > 0 && (
                <div className="border rounded-md">
                <div className="flex justify-end mb-2">
                  <button
                    onClick={() => setShowAllColumns(!showAllColumns)}
                    className="text-sm text-gray-600 hover:text-gray-800 flex items-center"
                  >
                    {showAllColumns ? (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        {t('bulkBarcode.hideAdditionalColumns')}
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        {t('bulkBarcode.showAdditionalColumns')}
                      </>
                    )}
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {isSubmitted && <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('common.status')}</TableHead>}
                        <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('barcode.barcode')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('barcode.jobOrderNumber')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.brand')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.model')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.size')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.color')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('barcode.quantity')}</TableHead>
                        <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.layers')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentItems.map((entry, index) => (
                        <TableRow 
                          key={index}
                          className={cn(
                            isSubmitted && entry.status === 'success' && 'bg-green-50',
                            isSubmitted && entry.status === 'error' && 'bg-red-50',
                            isSubmitted && entry.status === 'duplicate' && 'bg-yellow-50'
                          )}
                        >
                          {isSubmitted && (
                            <TableCell className="md:px-4 md:py-2 px-2 py-1">
                              {entry.status === 'success' && '✅'}
                              {entry.status === 'error' && '❌'}
                              {entry.status === 'duplicate' && '⚠️'}
                            </TableCell>
                          )}
                          <TableCell className="md:px-4 md:py-2 px-2 py-1">{entry.barcode}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{selectedJobOrder?.job_order_number || '-'}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.brand}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.model}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.size}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.color}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.quantity}</TableCell>
                          <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.layers}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {totalPages > 1 && renderPagination(currentPage, totalPages, handlePageChange)}
              </div>
              )}
              
              {isSubmitted && (
                <div className="flex flex-wrap gap-2 items-center justify-end mt-4">
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="printCount">{t('bulkBarcode.printCount')}</Label>
                    <Input
                      id="printCount"
                      type="number"
                      min={1}
                      max={100}
                      value={printCount}
                      onChange={(e) => setPrintCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                      className="w-20"
                      disabled={isPrinting}
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Label htmlFor="printer">{t('bulkBarcode.printer')}</Label>
                    <Select
                      value={selectedPrinter}
                      onValueChange={setSelectedPrinter}
                      disabled={isPrinting}
                    >
                      <SelectTrigger className="w-[250px]">
                        <SelectValue placeholder={t('bulkBarcode.selectPrinter')} />
                      </SelectTrigger>
                      <SelectContent>
                        {allPrinters.map((printer) => (
                          <SelectItem key={printer.name} value={printer.name}>
                            <div className="flex items-center justify-between w-full">
                              <span>{printer.name}</span>
                              <span className="ml-2 text-xs text-gray-500">
                                {printer.type === 'zebra' ? '🖨️ Zebra' : '🖥️ Server'}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={handlePrintBarcodes}
                    disabled={isPrinting || !isSubmitted || !selectedPrinter}
                    className={cn(
                      "bg-blue-600 hover:bg-blue-700 text-white",
                      isPrinting && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isPrinting ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('bulkBarcode.printing')}
                      </span>
                    ) : (
                      t('bulkBarcode.printBarcodes')
                    )}
                  </Button>
                </div>
              )}

              {!isSubmitted && (
                <div className="flex flex-wrap gap-2 justify-end mt-4">
                  <button
                    type="button"
                    className="btn-outline"
                    onClick={handleReset}
                    disabled={isSubmitting}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "btn-primary",
                      (preview.length === 0 || preview.filter(row => row.status === 'success').length === 0) && "opacity-50 cursor-not-allowed bg-gray-400 hover:bg-gray-400"
                    )}
                    onClick={handleSubmit}
                    disabled={isSubmitting || preview.length === 0 || preview.filter(row => row.status === 'success').length === 0}
                  >
                    {isSubmitting ? (
                      <span className="flex items-center">
                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        {t('bulkBarcode.submitting')}
                      </span>
                    ) : (
                      t('bulkBarcode.submitBarcodes')
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
          
          {!isLoading && !file && (
            <div className="py-6">
              <h3 className="font-semibold mb-2">{t('bulkBarcode.fileFormatRequirements')}</h3>
              <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
                <li>{t('bulkBarcode.excelCsvFormat')}</li>
                <li>{t('bulkBarcode.requiredColumns')}</li>
                <li>{t('bulkBarcode.headerRowRequired')}</li>
                <li>{t('bulkBarcode.uniqueBarcodes')}</li>
                <li>{t('bulkBarcode.maxRecords')}</li>
                <li className="text-green-600 font-medium">{t('bulkBarcode.serialAutoGenerated')}</li>
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Duplicates Dialog */}
      <Dialog open={showDuplicatesModal} onOpenChange={(open) => {
        if (!open) {
          setShowDuplicatesModal(false);
          setPreview([]);
          setErrorRows([]);
          setFile(null);
        }
      }}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('bulkBarcode.duplicateBarcodesFound')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">{submitMessage}</p>
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('barcode.barcode')}</TableHead>
                    <TableHead>{t('bulkBarcode.brand')}</TableHead>
                    <TableHead>{t('bulkBarcode.model')}</TableHead>
                    <TableHead>{t('bulkBarcode.size')}</TableHead>
                    <TableHead>{t('bulkBarcode.color')}</TableHead>
                    <TableHead>{t('barcode.quantity')}</TableHead>
                    <TableHead>{t('bulkBarcode.layers')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {duplicateBarcodes.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.barcode}</TableCell>
                      <TableCell>{item.brand}</TableCell>
                      <TableCell>{item.model}</TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.color}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.layers}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowDuplicatesModal(false);
                setPreview([]);
                setErrorRows([]);
                setFile(null);
              }}
            >
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Second Degree Batch Modal */}
      <Dialog open={showSecondDegreeModal} onOpenChange={setShowSecondDegreeModal}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t('bulkBarcode.createSecondDegreeBatches')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-gray-600 mb-4">{t('bulkBarcode.secondDegreeDescription')}</p>
            
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('bulkBarcode.size')}</TableHead>
                    <TableHead>{t('bulkBarcode.color')}</TableHead>
                    <TableHead>{t('bulkBarcode.quantity')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Array.from(new Set(jobOrderItems.map(item => `${item.size_value}_${item.color_name}`))).map(key => {
                    const [size, color] = key.split('_');
                    return (
                      <TableRow key={key}>
                        <TableCell>{size}</TableCell>
                        <TableCell>{color}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={99}
                            value={secondDegreeSelections[key] || 0}
                            onChange={(e) => setSecondDegreeSelections(prev => ({
                              ...prev,
                              [key]: Math.max(0, Math.min(99, parseInt(e.target.value) || 0))
                            }))}
                            className="w-20"
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            <div className="mt-4 text-sm text-gray-600">
              <p>{t('bulkBarcode.totalBatchesToCreate')}: {Object.values(secondDegreeSelections).reduce((sum, qty) => sum + qty, 0)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setShowSecondDegreeModal(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSecondDegreeSubmit}
              disabled={Object.values(secondDegreeSelections).every(qty => qty === 0) || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {t('bulkBarcode.creating')}
                </span>
              ) : (
                t('bulkBarcode.createBatches')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default BulkBarcodeCreatePage;
