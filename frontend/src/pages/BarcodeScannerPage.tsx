import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { barcodeApi, BarcodeData } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Eye, Edit3, Scan, Keyboard } from 'lucide-react';

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
type InputMode = 'manual' | 'scanner';

const BarcodeScannerPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
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
  const [inputMode, setInputMode] = useState<InputMode>('scanner');
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

  // Auto-capture barcode input - only active in scanner mode
  useEffect(() => {
    if (inputMode !== 'scanner') {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys and other non-printable characters
      const modifierKeys = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab', 'Escape', 'Backspace', 'Delete'];
      const functionKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'];
      const navigationKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
      
      // Skip if it's a modifier key, function key, or navigation key
      if (modifierKeys.includes(e.key) || functionKeys.includes(e.key) || navigationKeys.includes(e.key)) {
        return;
      }
      
      // Skip if it's a key combination (e.g., Ctrl+A, Shift+A)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }
      
      // Skip if the key length is not 1 (indicating a special key)
      if (e.key.length !== 1) {
        return;
      }

      // If Enter is pressed, process the buffer
      if (e.key === 'Enter') {
        const scannedBarcode = scanBufferRef.current;
        if (scannedBarcode) {
          // In scanner mode, don't set the barcode state, just submit directly
          handleSubmitWithBarcode(scannedBarcode);
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
          // In scanner mode, don't set the barcode state, just submit directly
          handleSubmitWithBarcode(scannedBarcode);
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
  }, [inputMode]);

  // Function to handle input mode switching
  const handleInputModeChange = (newMode: InputMode) => {
    // Clear the entry field and results when switching modes
    setBarcode('');
    setBarcodeData(null);
    setError('');
    setScanned(false);
    setInputMode(newMode);
    
    // Clear the scan buffer when switching modes
    scanBufferRef.current = '';
    
    // Focus the input field after mode switch
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  // New function to handle submission with a specific barcode (for scanner mode)
  const handleSubmitWithBarcode = async (barcodeToSubmit: string) => {
    if (!barcodeToSubmit.trim()) {
      setError(t('barcode.enterBarcode'));
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    // In scanner mode, clear the text field and old results immediately
    if (inputMode === 'scanner') {
      setBarcode('');
      setBarcodeData(null);
      setScanned(false);
      setError('');
    }
    
    try {
      const data = await barcodeApi.scanBarcode(barcodeToSubmit);
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
              setError(t('barcode.phaseRestriction', { role: user.role }));
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
            const updatedData = await barcodeApi.updateBarcode(barcodeToSubmit, updateData);
            
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
            setError(t('barcode.batchNotFound'));
          } else if (updateErr.response?.status === 500) {
            setError(t('barcode.serverError'));
            console.error('Server error details:', updateErr.response?.data);
          } else {
            setError(t('barcode.failedToUpdate'));
          }
          console.error('Failed to update batch:', updateErr);
        }
      }
      
      // Focus the input field for the next scan
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(t('barcode.barcodeNotFound'));
      } else {
        setError(t('barcode.failedToScan'));
      }
      console.error('Failed to scan barcode:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) {
      setError(t('barcode.enterBarcode'));
      return;
    }
    
    setError('');
    setIsLoading(true);
    
    // Store the current barcode for the API call
    const currentBarcode = barcode;
    
    // In scanner mode, clear the text field immediately after submission
    if (inputMode === 'scanner') {
      setBarcode('');
      // Also clear old results immediately for continuous scanning
      setBarcodeData(null);
      setScanned(false);
      setError('');
    }
    
    try {
      const data = await barcodeApi.scanBarcode(currentBarcode);
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
              setError(t('barcode.phaseRestriction', { role: user.role }));
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
            const updatedData = await barcodeApi.updateBarcode(currentBarcode, updateData);
            
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
            setError(t('barcode.batchNotFound'));
          } else if (updateErr.response?.status === 500) {
            setError(t('barcode.serverError'));
            console.error('Server error details:', updateErr.response?.data);
          } else {
            setError(t('barcode.failedToUpdate'));
          }
          console.error('Failed to update batch:', updateErr);
        }
      }

      // In manual mode, clear the barcode input field after successful submission
      if (inputMode === 'manual') {
        setBarcode('');
      }
      
      // Focus the input field for the next scan
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError(t('barcode.barcodeNotFound'));
      } else {
        setError(t('barcode.failedToScan'));
      }
      console.error('Failed to scan barcode:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setBarcode('');
    setBarcodeData(null);
    setError('');
    setScanned(false);
    setCurrentPhase(1);
    setStatus('');
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleSaveChanges = async (phase: number, newStatus: string) => {
    if (!barcodeData) return;
    
    try {
      const updateData: any = {};
      if (phase !== barcodeData.current_phase) {
        updateData.current_phase = phase;
      }
      if (newStatus !== barcodeData.status) {
        updateData.status = newStatus;
      }
      
      if (Object.keys(updateData).length > 0) {
        const updatedData = await barcodeApi.updateBarcode(barcodeData.barcode, updateData);
        setBarcodeData(updatedData);
        setCurrentPhase(updatedData.current_phase);
        setStatus(updatedData.status);
      }
    } catch (err) {
      console.error('Failed to save changes:', err);
    }
  };

  const getPhaseName = (phaseId: number) => {
    const phase = PHASES.find(p => p.id === phaseId);
    return phase ? t(`phases.${phase.name.toLowerCase()}`) : 'Unknown';
  };

  const getStatusName = (status: string) => {
    // Fix the status key mapping to handle "In Progress" correctly
    if (status === 'In Progress') return t('status.inProgress');
    if (status === 'Pending') return t('status.pending');
    if (status === 'Completed') return t('status.completed');
    return status; // fallback
  };

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">{t('navigation.barcodeScanner')}</h1>
        <p className="text-gray-600">{t('barcode.scannerSubtitle')}</p>
      </div>

      {/* Mode Selection */}
      <div className="mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('barcode.scannerMode')}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setMode('view')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'view'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Eye className="inline-block w-4 h-4 mr-2" />
                  {t('barcode.viewMode')}
                </button>
                <button
                  onClick={() => setMode('update')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    mode === 'update'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Edit3 className="inline-block w-4 h-4 mr-2" />
                  {t('barcode.updateMode')}
                </button>
              </div>
            </div>
            
            {mode === 'update' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    {t('barcode.phase')}
                  </Label>
                  <RadioGroup
                    value={selectedPhase.toString()}
                    onValueChange={(value) => setSelectedPhase(parseInt(value))}
                    className="flex flex-col space-y-2"
                  >
                    {PHASES.map((phase) => (
                      <div key={phase.id} className="flex items-center space-x-2">
                        <RadioGroupItem value={phase.id.toString()} id={`phase-${phase.id}`} />
                        <Label htmlFor={`phase-${phase.id}`} className="text-sm">
                          {t(`phases.${phase.name.toLowerCase()}`)}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
                
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-2 block">
                    {t('common.status')}
                  </Label>
                  <RadioGroup
                    value={selectedStatus}
                    onValueChange={setSelectedStatus}
                    className="flex flex-col space-y-2"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <div key={status} className="flex items-center space-x-2">
                        <RadioGroupItem value={status} id={`status-${status}`} />
                        <Label htmlFor={`status-${status}`} className="text-sm">
                          {status === 'In Progress' ? t('status.inProgress') : 
                           status === 'Pending' ? t('status.pending') : 
                           t('status.completed')}
                        </Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Input Mode Selection */}
      <div className="mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('barcode.inputMode')}</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleInputModeChange('manual')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    inputMode === 'manual'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Keyboard className="inline-block w-4 h-4 mr-2" />
                  {t('barcode.manualMode')}
                </button>
                <button
                  onClick={() => handleInputModeChange('scanner')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    inputMode === 'scanner'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Scan className="inline-block w-4 h-4 mr-2" />
                  {t('barcode.scannerMode')}
                </button>
              </div>
            </div>
            
            <div className="text-sm text-gray-600">
              {inputMode === 'manual' ? (
                <p>{t('barcode.manualModeDescription')}</p>
              ) : (
                <p>{t('barcode.scannerModeDescription')}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barcode Input */}
      <form onSubmit={handleSubmit}>
        <div className="mb-6">
          <label htmlFor="barcode" className="block text-gray-700 font-medium mb-2">
            {t('barcode.barcode')} {isScanning && <span className="text-green-600">({t('barcode.scanning')})</span>}
          </label>
          <div className="flex">
            <input
              ref={barcodeInputRef}
              id="barcode"
              type="text"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              className="input-field flex-grow"
              placeholder={t('barcode.scanOrEnter')}
              autoFocus
            />
            <button
              type="button"
              onClick={() => {
                setBarcode('');
                setError('');
                if (barcodeInputRef.current) {
                  barcodeInputRef.current.focus();
                }
              }}
              className="btn-secondary ml-2 px-4"
              disabled={isLoading}
            >
              {t('common.clear')}
            </button>
            <button
              type="submit"
              className="btn-primary ml-2 px-6"
              disabled={isLoading}
            >
              {isLoading ? t('common.loading') : t('common.search')}
            </button>
          </div>
        </div>
      </form>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
          <p>{error}</p>
        </div>
      )}

      {/* Results Display */}
      {barcodeData && (
        <>
          <div className="mb-6">
            <Card>
              <CardContent className="p-6">
                {/* Basic Information */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('barcode.basicInformation')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.batchId')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.batch_id}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.barcode')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.barcode}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.quantity')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.quantity}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.layers')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.layers}</p>
                    </div>
                  </div>
                </div>

                {/* Product Details */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('barcode.productDetails')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.brand')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.brand_name}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.model')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.model_name}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.size')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.size_value}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.color')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.color_name}</p>
                    </div>
                  </div>
                </div>

                {/* Production Information */}
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('barcode.productionInformation')}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.serial')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{barcodeData.serial}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.phase')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{getPhaseName(barcodeData.current_phase)}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-gray-500 mb-1">{t('common.status')}</h4>
                      <p className="text-lg font-semibold text-gray-900">{getStatusName(barcodeData.status)}</p>
                    </div>
                  </div>
                </div>

                {/* Job Order Information */}
                {barcodeData.job_order_id && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('barcode.jobOrderInformation')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.jobOrderId')}</h4>
                        <p className="text-lg font-semibold text-gray-900">{barcodeData.job_order_id}</p>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-gray-500 mb-1">{t('barcode.jobOrderNumber')}</h4>
                        <p className="text-lg font-semibold text-gray-900">{barcodeData.job_order_number || 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Archive Status */}
                {barcodeData.archived_at && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('barcode.archiveInformation')}</h3>
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <div className="flex-shrink-0">
                          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h4 className="text-sm font-medium text-yellow-800">{t('barcode.archivedBatch')}</h4>
                          <p className="text-sm text-yellow-700">{t('barcode.archivedAt')}: {new Date(barcodeData.archived_at).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleReset}
              className="btn-secondary"
            >
              {t('common.clear')}
            </button>
          </div>
        </>
      )}
    </Layout>
  );
};

export default BarcodeScannerPage;
