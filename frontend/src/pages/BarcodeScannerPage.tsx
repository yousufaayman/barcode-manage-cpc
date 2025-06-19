import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { barcodeApi, BarcodeData } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

interface Phase {
  id: number;
  name: string;
}

const PHASES: Phase[] = [
  { id: 1, name: 'Cutting' },
  { id: 2, name: 'Sewing' },
  { id: 3, name: 'Packaging' }
];

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'];

type ScannerMode = 'update' | 'view';

const BarcodeScannerPage: React.FC = () => {
  const { user } = useAuth();
  const [barcode, setBarcode] = useState('');
  const [currentPhase, setCurrentPhase] = useState<number>(1);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [scanned, setScanned] = useState(false);
  const [barcodeData, setBarcodeData] = useState<BarcodeData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<number>(1);
  const [selectedStatus, setSelectedStatus] = useState<string>('Pending');
  const [mode, setMode] = useState<ScannerMode>('view');
  const barcodeInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scanBufferRef = useRef<string>('');
  const scanTimeoutRef = useRef<NodeJS.Timeout>();

  // Set initial phase based on user role
  useEffect(() => {
    if (user && mode === 'update') {
      if (user.role === 'Admin') {
        // Admin can use any phase
        setSelectedPhase(1);
      } else {
        // Map role to phase ID
        const roleToPhaseId: { [key: string]: number } = {
          'Cutting': 1,
          'Sewing': 2,
          'Packaging': 3
        };
        setSelectedPhase(roleToPhaseId[user.role] || 1);
      }
    }
  }, [user, mode]);

  // Ensure input is always focused
  useEffect(() => {
    const focusInput = () => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    };

    // Focus on mount
    focusInput();

    // Focus on any click or keypress
    window.addEventListener('click', focusInput);
    window.addEventListener('keydown', focusInput);

    // Focus periodically to ensure it stays focused
    const focusInterval = setInterval(focusInput, 100);

    return () => {
      window.removeEventListener('click', focusInput);
      window.removeEventListener('keydown', focusInput);
      clearInterval(focusInterval);
    };
  }, []);

  // Auto-capture barcode input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If Enter is pressed, process the buffer
      if (e.key === 'Enter') {
        const scannedBarcode = scanBufferRef.current;
        if (scannedBarcode) {
          setBarcode(scannedBarcode);
          handleSubmit(new Event('submit') as unknown as React.FormEvent);
          scanBufferRef.current = '';
        }
        return;
      }

      // Add character to buffer
      scanBufferRef.current += e.key;
      
      // Set scanning state
      setIsScanning(true);

      // Clear any existing timeout
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }

      // Set a timeout to detect the end of scanning
      scanTimeoutRef.current = setTimeout(() => {
        setIsScanning(false);
        const scannedBarcode = scanBufferRef.current;
        if (scannedBarcode) {
          setBarcode(scannedBarcode);
          handleSubmit(new Event('submit') as unknown as React.FormEvent);
          scanBufferRef.current = '';
        }
      }, 50);
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) {
      setError('Please enter a barcode');
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    try {
      const data = await barcodeApi.scanBarcode(barcode);
      setBarcodeData(data);
      setCurrentPhase(data.current_phase);
      setStatus(data.status);
      setScanned(true);

      // Only update if in update mode
      if (mode === 'update') {
        try {
          // Validate phase selection for non-admin users
          if (user && user.role !== 'Admin') {
            const roleToPhaseId: { [key: string]: number } = {
              'Cutting': 1,
              'Sewing': 2,
              'Packaging': 3
            };
            const allowedPhaseId = roleToPhaseId[user.role];
            if (selectedPhase !== allowedPhaseId) {
              setError(`You can only scan items in the ${user.role} phase`);
              return;
            }
          }

          // Update the batch using the correct endpoint
          const updateData: any = {};
          
          // Only include fields that have changed
          if (selectedPhase !== data.current_phase) {
            updateData.current_phase = selectedPhase;
          }
          if (selectedStatus !== data.status) {
            updateData.status = selectedStatus;
          }
          
          // Only make the API call if there are changes
          if (Object.keys(updateData).length > 0) {
            const updatedData = await barcodeApi.updateBarcode(barcode, updateData);
            
            // Update the local state with the response
            setBarcodeData(updatedData);
            setCurrentPhase(updatedData.current_phase);
            setStatus(updatedData.status);
            
            // Show success message
            setError('');
          }
        } catch (updateErr: any) {
          // Handle specific error cases
          if (updateErr.response?.status === 404) {
            setError('Batch not found. Please check the barcode.');
          } else if (updateErr.response?.status === 500) {
            setError('Server error. Please try again or contact support.');
            console.error('Server error details:', updateErr.response?.data);
          } else {
            setError('Failed to update batch. Please try again.');
          }
          console.error('Failed to update batch:', updateErr);
        }
      }

      // Clear barcode and ensure focus
      setBarcode('');
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    } catch (err) {
      setError('Failed to scan barcode. Please try again.');
      setBarcodeData(null);
      setScanned(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setBarcode('');
    setCurrentPhase(1);
    setStatus('');
    setError('');
    setScanned(false);
    setBarcodeData(null);
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleSaveChanges = async (phase: number, newStatus: string) => {
    if (barcodeData) {
      try {
        const updatedData = await barcodeApi.updateBarcode(barcodeData.barcode, {
          current_phase: phase,
          status: newStatus
        });
        
        setBarcodeData(updatedData);
        setCurrentPhase(updatedData.current_phase);
        setStatus(updatedData.status);
      } catch (err) {
        console.error('Failed to save changes:', err);
      }
    }
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">Barcode Scanner</h1>
        <p className="text-gray-600">Scan or enter a barcode to {mode === 'update' ? 'update' : 'view'} item status</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {/* Mode Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Scanner Mode</h2>
          <div className="flex space-x-4">
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio"
                name="mode"
                value="view"
                checked={mode === 'view'}
                onChange={() => setMode('view')}
              />
              <span className="ml-2">View Mode</span>
            </label>
            <label className="inline-flex items-center">
              <input
                type="radio"
                className="form-radio"
                name="mode"
                value="update"
                checked={mode === 'update'}
                onChange={() => setMode('update')}
              />
              <span className="ml-2">Update Mode</span>
            </label>
          </div>
        </div>

        {/* Phase and Status Selection (only in update mode) */}
        {mode === 'update' && (
          <>
            {/* Phase Selection */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Select Phase</h2>
              <div className="flex space-x-4">
                {PHASES.map(phase => {
                  // Only show the phase that matches the user's role, or all phases for admin
                  const isAllowed = user?.role === 'Admin' || 
                    (user && phase.name === user.role);
                  
                  return (
                    <label 
                      key={phase.id} 
                      className={`inline-flex items-center ${!isAllowed ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="radio"
                        className="form-radio"
                        name="phase"
                        value={phase.id}
                        checked={selectedPhase === phase.id}
                        onChange={() => isAllowed && setSelectedPhase(phase.id)}
                        disabled={!isAllowed}
                      />
                      <span className="ml-2">{phase.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Status Selection */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-3">Select Status</h2>
              <div className="flex space-x-4">
                {STATUS_OPTIONS.map(statusOption => (
                  <label key={statusOption} className="inline-flex items-center">
                    <input
                      type="radio"
                      className="form-radio"
                      name="status"
                      value={statusOption}
                      checked={selectedStatus === statusOption}
                      onChange={() => setSelectedStatus(statusOption)}
                    />
                    <span className="ml-2">{statusOption}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Barcode Input */}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="barcode" className="block text-gray-700 font-medium mb-2">
              Barcode {isScanning && <span className="text-green-600">(Scanning...)</span>}
            </label>
            <div className="flex">
              <input
                ref={barcodeInputRef}
                id="barcode"
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                className="input-field flex-grow"
                placeholder="Scan or enter barcode"
                autoFocus
                autoComplete="off"
                onBlur={(e) => e.target.focus()} // Re-focus on blur
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

        {/* Last Scanned Item */}
        {scanned && barcodeData && (
          <div className="mt-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Last Scanned Item</h2>
              <div className="flex items-center space-x-4">
                {mode === 'update' && (
                  <div className="text-sm text-green-600">
                    ✓ Updated with Phase: {PHASES.find(p => p.id === selectedPhase)?.name} and Status: {selectedStatus}
                  </div>
                )}
                <button 
                  onClick={handleReset}
                  className="text-sm text-gray-600 hover:text-green underline"
                >
                  Clear
                </button>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-gray-600">Brand</dt>
                <dd>{barcodeData.brand_name}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Model</dt>
                <dd>{barcodeData.model_name}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Size</dt>
                <dd>{barcodeData.size_value}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Color</dt>
                <dd>{barcodeData.color_name}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Quantity</dt>
                <dd>{barcodeData.quantity}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Layers</dt>
                <dd>{barcodeData.layers}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Serial</dt>
                <dd>{barcodeData.serial}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Phase</dt>
                <dd>{barcodeData.phase_name}</dd>
              </div>
              <div>
                <dt className="text-gray-600">Status</dt>
                <dd>{barcodeData.status}</dd>
              </div>
            </div>
          </div>
        )}

        {!scanned && !isLoading && (
          <div className="mt-8 text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-gray-600">
              Scan a barcode to {mode === 'update' ? 'update' : 'view'} item status
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BarcodeScannerPage;
