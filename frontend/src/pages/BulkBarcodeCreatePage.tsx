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

interface BarcodeEntry {
  barcode: string;
  brand: string;
  model: string;
  size: string;
  color: string;
  quantity: number;
  layers: number;
  serial: number;
  status?: 'success' | 'error' | 'duplicate';
  brand_id: number;
  model_id: number;
  size_id: number;
  color_id: number;
  last_updated_at?: string;
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
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.brand')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.model')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.size')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.color')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('barcode.quantity')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.layers')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.serial')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {error.details.map((detail, idx) => (
                      <TableRow key={idx} className="bg-red-50">
                        <TableCell className="font-medium md:px-4 md:py-2 px-2 py-1">{detail.rowNumber}</TableCell>
                        <TableCell className="text-red-600 md:px-4 md:py-2 px-2 py-1">{detail.error}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.brand}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.model}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.size}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.color}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.quantity}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.layers}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{detail.data?.serial}</TableCell>
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
    fetchPrinters();
  }, []);

  const fetchPrinters = async () => {
    try {
      const response = await api.get('/barcodes/printers');
      setPrinters(response.data.printers);
      if (response.data.printers.length > 0) {
        setSelectedPrinter(response.data.printers[0]);
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
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'barcode_template.xlsx');
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
      
      setErrorRows(error_rows);
      
      if (error_rows.length > 0) {
        const errorMessage = t('bulkBarcode.foundErrors', { count: error_rows.length });
        console.log('Translation debug:', {
          key: 'bulkBarcode.foundErrors',
          count: error_rows.length,
          result: errorMessage,
          currentLanguage: i18n.language
        });
        
        // Fallback if interpolation doesn't work
        const finalMessage = errorMessage.includes('{count}') 
          ? errorMessage.replace('{count}', error_rows.length.toString())
          : errorMessage;
        
        setErrors([{
          message: finalMessage,
          details: error_rows
        }]);
      }

      const updatedPreview = updatePreviewWithStatus(preview, valid_rows, response);
      setPreview(updatedPreview);
      
      const duplicates = response.data.duplicate_barcodes.length;
      const validCount = valid_rows.length;
      const errorCount = preview.length - validCount;

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
        let errorMessage = data.detail || t('bulkBarcode.failedToSubmit');

        if (status === 400) {
          errorMessage = data.detail || t('bulkBarcode.badRequest');
        } else if (status === 422) {
          const validationErrors = data.detail;
          errorMessage = Array.isArray(validationErrors)
            ? validationErrors.map((error: any) => `${error.loc[error.loc.length - 1]}: ${error.msg}`).join('\n')
            : t('bulkBarcode.validationError');
        }
        
        setErrors([{ message: errorMessage }]);
      } else {
        setErrors([{ message: err.message || t('bulkBarcode.networkError') }]);
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
    return rows.map(row => ({
      barcode: row.barcode,
      brand_id: row.brand_id,
      model_id: row.model_id,
      size_id: row.size_id,
      color_id: row.color_id,
      quantity: row.quantity,
      layers: row.layers,
      serial: row.serial,
      current_phase: 1, // Default to first phase (Cutting)
      status: 'Pending' // Default status for new batches
    }));
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
    const validation = validateRows(preview);
    if (!validation.isValid) {
      setErrors([{ message: validation.error }]);
      return;
    }

    try {
      setIsSubmitting(true);
      setErrors([]);
      
      const submitData = transformRowsForSubmission(validation.validRows);
      const response = await api.post('/barcodes/bulk/submit', submitData);
      
      const updatedPreview = updatePreviewWithStatus(preview, validation.validRows, response);
      setPreview(updatedPreview);
      
      const duplicates = response.data.duplicate_barcodes.length;
      const validCount = validation.validRows.length;
      const errorCount = preview.length - validCount;

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
        let errorMessage = data.detail || t('bulkBarcode.failedToSubmit');

        if (status === 400) {
          errorMessage = data.detail || t('bulkBarcode.badRequest');
        } else if (status === 422) {
          const validationErrors = data.detail;
          errorMessage = Array.isArray(validationErrors)
            ? validationErrors.map((error: any) => `${error.loc[error.loc.length - 1]}: ${error.msg}`).join('\n')
            : t('bulkBarcode.validationError');
        }
        
        setErrors([{ message: errorMessage }]);
      } else {
        setErrors([{ message: err.message || t('bulkBarcode.networkError') }]);
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
    if (!isSubmitted || !selectedPrinter) return;

    try {
      setIsPrinting(true);
      
      // Get barcodes that are either successful or duplicates
      const barcodesToPrint = preview
        .filter(item => item.status === 'success' || item.status === 'duplicate')
        .map(item => ({
          barcode: item.barcode,
          brand: item.brand,
          model: item.model,
          size: item.size,
          color: item.color,
          quantity: item.quantity,
          layers: item.layers,
          serial: item.serial
        }));

      if (barcodesToPrint.length === 0) {
        setErrors([{ message: t('bulkBarcode.noBarcodesForPrinting') }]);
        return;
      }

      // Call the print endpoint
      const response = await api.post('/barcodes/print', {
        barcodes: barcodesToPrint,
        count: printCount,
        printer_name: selectedPrinter
      });
      
      // Show success message
      setSubmitMessage(prev => 
        prev + '\n' + t('bulkBarcode.printedBarcodes', {
          count: barcodesToPrint.length,
          times: printCount,
          printer: selectedPrinter
        })
      );
    } catch (err: any) {
      setErrors([{ message: err.response?.data?.detail || t('bulkBarcode.failedToPrint') }]);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('bulkBarcode.title')}</h1>
        <p className="text-gray-600">{t('bulkBarcode.subtitle')}</p>
      </div>

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

        {!isLoading && preview.length > 0 && (
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
                      console.log('Translation debug (ErrorDisplay):', {
                        key: 'bulkBarcode.foundErrors',
                        count: errorRows.length,
                        result: errorMessage,
                        currentLanguage: i18n.language
                      });
                      
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
            
            {/* Main Preview Table */}
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
                      <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('common.status')}</TableHead>
                      <TableHead className="md:px-4 md:py-2 px-2 py-1">{t('barcode.barcode')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.brand')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.model')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.size')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.color')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('barcode.quantity')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.layers')}</TableHead>
                      <TableHead className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{t('bulkBarcode.serial')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentItems.map((entry, index) => (
                      <TableRow 
                        key={index}
                        className={cn(
                          entry.status === 'success' && 'bg-green-50',
                          entry.status === 'error' && 'bg-red-50',
                          entry.status === 'duplicate' && 'bg-yellow-50'
                        )}
                      >
                        <TableCell className="md:px-4 md:py-2 px-2 py-1">
                          {entry.status === 'success' && '✅'}
                          {entry.status === 'error' && '❌'}
                          {entry.status === 'duplicate' && '⚠️'}
                        </TableCell>
                        <TableCell className="md:px-4 md:py-2 px-2 py-1">{entry.barcode}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.brand}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.model}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.size}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.color}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.quantity}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.layers}</TableCell>
                        <TableCell className={cn("md:table-cell md:px-4 md:py-2 px-2 py-1", !showAllColumns && "hidden")}>{entry.serial}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && renderPagination(currentPage, totalPages, handlePageChange)}
            </div>
            
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
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder={t('bulkBarcode.selectPrinter')} />
                    </SelectTrigger>
                    <SelectContent>
                      {printers.map((printer) => (
                        <SelectItem key={printer} value={printer}>
                          {printer}
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
                  className="btn-primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting || preview.length === 0 || validateRows(preview).validRows?.length === 0}
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
            </ul>
          </div>
        )}
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
                    <TableHead>{t('bulkBarcode.serial')}</TableHead>
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
                      <TableCell>{item.serial}</TableCell>
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
    </Layout>
  );
};

export default BulkBarcodeCreatePage;
