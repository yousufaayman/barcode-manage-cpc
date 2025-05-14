
import React, { useState } from 'react';
import Layout from '../components/Layout';

interface BarcodeData {
  barcode: string;
  brandId: string;
  modelId: string;
  sizeId: string;
  colorId: string;
  quantity: number;
  layers: number;
  serial: string;
  currentPhase: string;
  status: string;
}

const BarcodeScannerPage: React.FC = () => {
  const [barcode, setBarcode] = useState('');
  const [currentPhase, setCurrentPhase] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);
  const [barcodeData, setBarcodeData] = useState<BarcodeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) {
      setError('Please enter a barcode');
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    // Simulate API call to fetch barcode data
    setTimeout(() => {
      // For demo purposes, generate some fake data based on the barcode
      if (barcode.length >= 8) {
        const mockData: BarcodeData = {
          barcode: barcode,
          brandId: `BR-${barcode.substring(0, 3)}`,
          modelId: `MD-${barcode.substring(3, 6)}`,
          sizeId: `SZ-${barcode.substring(6, 7)}`,
          colorId: `CL-${barcode.substring(7, 8)}`,
          quantity: Math.floor(Math.random() * 100) + 1,
          layers: Math.floor(Math.random() * 5) + 1,
          serial: `SR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          currentPhase: ['In', 'Out', 'Pending'][Math.floor(Math.random() * 3)],
          status: ['Active', 'Inactive', 'Processing', 'Complete'][Math.floor(Math.random() * 4)],
        };
        
        setBarcodeData(mockData);
        setCurrentPhase(mockData.currentPhase);
        setStatus(mockData.status);
        setScanned(true);
      } else {
        setError('Invalid barcode format');
        setBarcodeData(null);
        setScanned(false);
      }
      
      setIsLoading(false);
    }, 800);
  };

  const handleReset = () => {
    setBarcode('');
    setCurrentPhase('');
    setStatus('');
    setError('');
    setScanned(false);
    setBarcodeData(null);
  };

  const handleSaveChanges = () => {
    if (barcodeData && currentPhase && status) {
      // In a real app, you would save these changes to the backend
      console.log('Saved changes:', { 
        barcode: barcodeData.barcode, 
        currentPhase, 
        status 
      });
      
      // Update the local state
      setBarcodeData({
        ...barcodeData,
        currentPhase,
        status
      });
      
      // Show success message (in a real app, you'd use a toast notification)
      alert('Changes saved successfully!');
    }
  };

  const getPhaseOptions = () => {
    return ['In', 'Out', 'Pending'].map(phase => (
      <option key={phase} value={phase}>{phase}</option>
    ));
  };

  const getStatusOptions = () => {
    return ['Active', 'Inactive', 'Processing', 'Complete'].map(statusOption => (
      <option key={statusOption} value={statusOption}>{statusOption}</option>
    ));
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Barcode Scanner</h1>
        <p className="text-gray-600">Scan or enter a barcode to retrieve item details and update status</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="barcode" className="block text-gray-700 font-medium mb-2">
              Barcode
            </label>
            <div className="flex">
              <input
                id="barcode"
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="input-field flex-grow"
                placeholder="Scan or enter barcode"
                autoFocus
              />
              <button 
                type="submit"
                className="btn-primary ml-2 flex items-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Scanning...
                  </>
                ) : (
                  'Scan'
                )}
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>
        </form>

        {scanned && barcodeData && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Barcode Details</h2>
              <button 
                onClick={handleReset}
                className="text-sm text-gray-600 hover:text-green underline"
              >
                Scan New Barcode
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <dl className="grid grid-cols-1 gap-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Barcode</dt>
                    <dd className="font-semibold">{barcodeData.barcode}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Brand ID</dt>
                    <dd>{barcodeData.brandId}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Model ID</dt>
                    <dd>{barcodeData.modelId}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Size ID</dt>
                    <dd>{barcodeData.sizeId}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Color ID</dt>
                    <dd>{barcodeData.colorId}</dd>
                  </div>
                </dl>
              </div>
              
              <div>
                <dl className="grid grid-cols-1 gap-y-3">
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Quantity</dt>
                    <dd>{barcodeData.quantity}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Layers</dt>
                    <dd>{barcodeData.layers}</dd>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Serial</dt>
                    <dd>{barcodeData.serial}</dd>
                  </div>
                  
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Current Phase</dt>
                    <dd>
                      <select 
                        value={currentPhase}
                        onChange={(e) => setCurrentPhase(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 bg-white text-sm"
                      >
                        {getPhaseOptions()}
                      </select>
                    </dd>
                  </div>
                  
                  <div className="flex justify-between py-2 border-b">
                    <dt className="text-gray-600">Status</dt>
                    <dd>
                      <select 
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 bg-white text-sm"
                      >
                        {getStatusOptions()}
                      </select>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end">
              <button 
                onClick={handleSaveChanges}
                className="btn-primary"
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {!scanned && !isLoading && (
          <div className="mt-8 text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-600">
              Enter a barcode and click "Scan" to view item details
            </p>
            <p className="text-gray-500 text-sm mt-2">
              For testing, enter a barcode with at least 8 digits
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BarcodeScannerPage;
