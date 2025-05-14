import React, { useState, useRef, ChangeEvent } from 'react';
import Layout from '../components/Layout';

interface BarcodeEntry {
  id: number;
  barcode: string;
  brandId: string;
  modelId: string;
  sizeId: string;
  colorId: string;
  quantity: number;
  layers: number;
}

const BulkBarcodeCreatePage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<BarcodeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setPreview([]);
    setIsSubmitted(false);
    
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    // Check file type (in a real app, you would check for Excel file types)
    if (selectedFile.type !== 'text/csv' && 
        !selectedFile.name.endsWith('.xlsx') && 
        !selectedFile.name.endsWith('.xls')) {
      setError('Please upload a valid Excel or CSV file');
      setFile(null);
      e.target.value = '';
      return;
    }
    
    setFile(selectedFile);
    setIsLoading(true);
    
    // Simulate file processing
    setTimeout(() => {
      // Generate mock preview data
      const mockPreview: BarcodeEntry[] = Array.from({ length: 5 }, (_, i) => ({
        id: i + 1,
        barcode: `BC${(1000000 + i).toString()}`,
        brandId: `BR-${(100 + i).toString()}`,
        modelId: `MD-${(200 + i).toString()}`,
        sizeId: `SZ-${(i % 5 + 1).toString()}`,
        colorId: `CL-${(i % 8 + 1).toString()}`,
        quantity: Math.floor(Math.random() * 50) + 1,
        layers: Math.floor(Math.random() * 5) + 1,
      }));
      
      setPreview(mockPreview);
      setIsLoading(false);
    }, 1000);
  };

  const handleSubmit = () => {
    if (!file || preview.length === 0) return;
    
    setIsSubmitting(true);
    
    // Simulate API call to submit data
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSubmitted(true);
    }, 1500);
  };

  const handleReset = () => {
    setFile(null);
    setError(null);
    setPreview([]);
    setIsSubmitted(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePrintBarcodes = () => {
    // In a real app, this would trigger a barcode printing process
    alert('Printing barcodes...');
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Bulk Barcode Creation</h1>
        <p className="text-gray-600">Upload an Excel file to create multiple barcodes at once</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Upload File</h2>
          
          <div className="mb-4">
            <div className={`border-2 border-dashed rounded-lg p-6 text-center ${error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-gray-50'}`}>
              <div className="mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-gray-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              
              <p className="text-sm text-gray-600 mb-2">
                Click to browse or drag and drop your file here
              </p>
              <p className="text-xs text-gray-500 mb-2">
                Supported formats: Excel (.xlsx, .xls), CSV
              </p>
              
              <button 
                type="button"
                className="mt-2 px-4 py-2 bg-green text-white rounded hover:opacity-90"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isSubmitting}
              >
                Browse Files
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
            
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
            
            {file && !error && (
              <div className="mt-3 flex items-center">
                <span className="text-sm font-medium">Selected file:</span>
                <span className="ml-2 text-sm text-gray-600">{file.name}</span>
                <button
                  type="button"
                  onClick={handleReset}
                  className="ml-2 text-sm text-red-600 hover:text-red-800"
                  disabled={isLoading || isSubmitting}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-10">
            <div className="w-12 h-12 border-4 border-green border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-gray-600">Processing file...</p>
          </div>
        )}

        {!isLoading && preview.length > 0 && !isSubmitted && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Preview Data</h2>
            <p className="text-sm text-gray-600 mb-4">
              Please verify the data below before submitting. The system detected {preview.length} barcodes.
            </p>
            
            <div className="table-container mb-4">
              <table className="table">
                <thead>
                  <tr>
                    <th>Barcode</th>
                    <th>Brand</th>
                    <th>Model</th>
                    <th>Size</th>
                    <th>Color</th>
                    <th>Quantity</th>
                    <th>Layers</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.barcode}</td>
                      <td>{entry.brandId}</td>
                      <td>{entry.modelId}</td>
                      <td>{entry.sizeId}</td>
                      <td>{entry.colorId}</td>
                      <td>{entry.quantity}</td>
                      <td>{entry.layers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-outline mr-3"
                onClick={handleReset}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </span>
                ) : (
                  'Submit Barcodes'
                )}
              </button>
            </div>
          </div>
        )}
        
        {isSubmitted && (
          <div className="text-center py-6 bg-lime bg-opacity-20 rounded-lg border border-lime mb-6">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Barcodes Created Successfully!</h3>
            <p className="text-gray-600 mb-4">
              {preview.length} barcodes have been added to the database.
            </p>
            <div className="flex justify-center">
              <button 
                type="button"
                className="btn-primary"
                onClick={handlePrintBarcodes}
              >
                Print Barcodes
              </button>
            </div>
          </div>
        )}
        
        {!isLoading && !file && (
          <div className="py-6">
            <h3 className="font-semibold mb-2">File Format Requirements:</h3>
            <ul className="list-disc pl-5 text-sm text-gray-600 space-y-1">
              <li>Excel files (.xlsx, .xls) or CSV format</li>
              <li>Required columns: barcode, brand_id, model_id, size_id, color_id, quantity, layers</li>
              <li>First row must be header row</li>
              <li>Each barcode must be unique</li>
              <li>Maximum 1000 records per upload</li>
            </ul>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BulkBarcodeCreatePage;
