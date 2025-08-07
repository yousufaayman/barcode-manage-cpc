import React, { useState, useEffect, useRef } from 'react';
import Layout from '../components/Layout';
import { barcodeApi, jobOrderApi, BarcodeData } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Eye, Edit3, Scan, Keyboard, Package, RefreshCw, Play, Square } from 'lucide-react';

type ScannerMode = 'view' | 'update' | 'updateQuantity' | 'secondDegree';
type InputMode = 'manual' | 'scanner';

const STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed'];

interface Phase {
  id: number;
  name: string;
}

interface SessionData {
  phase: number;
  status: string;
  initialBarcode: string;
  jobOrderId: number | null;
  colorId: number | null;
  expectedQuantity: number;
  scannedQuantity: number;
  scannedBarcodes: string[];
  isActive: boolean;
}

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
  const [phases, setPhases] = useState<Phase[]>([]);
  const [quantity, setQuantity] = useState<number>(0);
  const [isUpdatingQuantity, setIsUpdatingQuantity] = useState(false);
  const [isSecondDegreeMode, setIsSecondDegreeMode] = useState(false);
  const [secondDegreeToggle, setSecondDegreeToggle] = useState(true);
  
  // Session mode state
  const [sessionData, setSessionData] = useState<SessionData>({
    phase: 1,
    status: 'Pending',
    initialBarcode: '',
    jobOrderId: null,
    colorId: null,
    expectedQuantity: 0,
    scannedQuantity: 0,
    scannedBarcodes: [],
    isActive: false
  });

  // Set initial phase based on user role
  useEffect(() => {
    if (user && mode === 'update') {
      if (user.role === 'Admin') {
        // Admin can use any phase
        setSelectedPhase(1);
        setSessionData(prev => ({ ...prev, phase: 1 }));
      } else {
        // Map role to phase ID
        const roleToPhaseId: { [key: string]: number } = {
          'Cutting': 1,
          'Sewing': 2,
          'Packaging': 3
        };
        const phaseId = roleToPhaseId[user.role] || 1;
        setSelectedPhase(phaseId);
        setSessionData(prev => ({ ...prev, phase: phaseId }));
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

  // Fetch phases from backend
  useEffect(() => {
    barcodeApi.getPhases().then(phases => setPhases(phases.map((p: any) => ({ id: p.phase_id, name: p.phase_name }))));
  }, []);

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
      
      // Set initial quantity to batch quantity for update quantity mode
      if (mode === 'updateQuantity') {
        setQuantity(data.quantity);
      }

      // Handle update mode (formerly sessions mode)
      if (mode === 'update') {
        await handleSessionModeBarcode(data, barcodeToSubmit);
        return;
      }

      // Handle all modes except 'view' - these will create timeline entries
      if (mode !== 'view') {
        try {
          let updateData: any = {};

          if (mode === 'update') {
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

            // Only include fields that have changed
            if (selectedPhase !== data.current_phase) {
              updateData.current_phase = selectedPhase;
            }
            if (selectedStatus !== data.status) {
              updateData.status = selectedStatus;
            }
          } else if (mode === 'secondDegree') {
            // Update the batch to set is_second_degree based on the toggle
            updateData.is_second_degree = secondDegreeToggle;
            console.log('Second Degree mode - updateData:', updateData);
            console.log('secondDegreeToggle value:', secondDegreeToggle);
            console.log('Current mode:', mode);
          }
          // Note: updateQuantity mode is handled separately in handleQuantityUpdate function
          
          // Only make the API call if there are changes
          console.log('Final updateData:', updateData);
          console.log('updateData keys length:', Object.keys(updateData).length);
          if (Object.keys(updateData).length > 0) {
            console.log('Making API call with data:', updateData);
            const updatedData = await barcodeApi.updateBarcode(barcodeToSubmit, updateData);
            console.log('API response:', updatedData);
            
            // Update the local state with the response
            setBarcodeData(updatedData);
            setCurrentPhase(updatedData.current_phase);
            setStatus(updatedData.status);
            
            // Show success message
            setError('');
          } else {
            console.log('No update data to send - skipping API call');
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

  // Handle session mode barcode scanning
  const handleSessionModeBarcode = async (data: BarcodeData, barcodeToSubmit: string) => {
    if (!sessionData.isActive) {
      // First scan - initialize session
      try {
        // Calculate total expected quantity from all job order items with same job order ID and color ID
        const totalExpectedQuantity = await calculateTotalExpectedQuantity(data.job_order_id, data.color_id);
        
        if (totalExpectedQuantity > 0) {
          // Always update the batch with the selected phase and status for the session
          const updateData = {
            current_phase: sessionData.phase,
            status: sessionData.status
          };
          
          const updatedBatch = await barcodeApi.updateBarcode(barcodeToSubmit, updateData);
          
          // Update the barcode data with the updated batch information
          setBarcodeData(updatedBatch);
          setCurrentPhase(updatedBatch.current_phase);
          setStatus(updatedBatch.status);
          
          setSessionData(prev => ({
            ...prev,
            initialBarcode: barcodeToSubmit,
            jobOrderId: data.job_order_id,
            colorId: data.color_id,
            expectedQuantity: totalExpectedQuantity,
            scannedQuantity: data.quantity,
            scannedBarcodes: [barcodeToSubmit],
            isActive: true
          }));
          setError('');
        } else {
          setError(t('barcode.noJobOrderItemsFound'));
        }
      } catch (err) {
        setError(t('barcode.failedToGetJobOrderItem'));
        console.error('Failed to get job order items:', err);
      }
    } else {
      // Subsequent scans - check if barcode matches the session (same job order and color)
      try {
        // Check if barcode was already scanned
        if (sessionData.scannedBarcodes.includes(barcodeToSubmit)) {
          setError(t('barcode.barcodeAlreadyScanned'));
          return;
        }
        
        // Check if barcode matches the session (same job order and color)
        if (data.job_order_id === sessionData.jobOrderId && data.color_id === sessionData.colorId) {
          // Always update the batch with the selected phase and status for the session
          const updateData = {
            current_phase: sessionData.phase,
            status: sessionData.status
          };
          
          const updatedBatch = await barcodeApi.updateBarcode(barcodeToSubmit, updateData);
          
          // Update the barcode data with the updated batch information
          setBarcodeData(updatedBatch);
          setCurrentPhase(updatedBatch.current_phase);
          setStatus(updatedBatch.status);
          
          // Barcode matches - increment quantity counter
          setSessionData(prev => ({
            ...prev,
            scannedQuantity: prev.scannedQuantity + data.quantity,
            scannedBarcodes: [...prev.scannedBarcodes, barcodeToSubmit]
          }));
          setError('');
        } else {
          setError(t('barcode.barcodeNotMatchingSession'));
        }
      } catch (err) {
        setError(t('barcode.failedToValidateBarcode'));
        console.error('Failed to validate barcode:', err);
      }
    }
  };

  // Helper function to calculate total expected quantity from all batches with same job order ID and color ID
  const calculateTotalExpectedQuantity = async (jobOrderId: number, colorId: number): Promise<number> => {
    try {
      const batchesData = await barcodeApi.getBatchesByJobOrderAndColor(jobOrderId, colorId);
      return batchesData.total_quantity;
    } catch (err) {
      console.error('Error calculating total expected quantity from batches:', err);
      return 0;
    }
  };

  // Helper function to get job order item details from batch
  const getJobOrderItemFromBatch = async (batchData: BarcodeData) => {
    try {
      const jobOrderItem = await barcodeApi.getJobOrderItemByBarcode(batchData.barcode);
      return jobOrderItem;
    } catch (err) {
      console.error('Error getting job order item details:', err);
      return null;
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
      
      // Set initial quantity to batch quantity for update quantity mode
      if (mode === 'updateQuantity') {
        setQuantity(data.quantity);
      }

      // Handle update mode (formerly sessions mode)
      if (mode === 'update') {
        await handleSessionModeBarcode(data, currentBarcode);
        return;
      }

      // Handle all modes except 'view' - these will create timeline entries
      if (mode !== 'view') {
        try {
          let updateData: any = {};

          if (mode === 'update') {
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

            // Only include fields that have changed
            if (selectedPhase !== data.current_phase) {
              updateData.current_phase = selectedPhase;
            }
            if (selectedStatus !== data.status) {
              updateData.status = selectedStatus;
            }
          } else if (mode === 'secondDegree') {
            // Update the batch to set is_second_degree based on the toggle
            updateData.is_second_degree = secondDegreeToggle;
            console.log('Second Degree mode (handleSubmit) - updateData:', updateData);
            console.log('secondDegreeToggle value:', secondDegreeToggle);
            console.log('Current mode:', mode);
          }
          // Note: updateQuantity mode is handled separately in handleQuantityUpdate function
          
          // Only make the API call if there are changes
          console.log('Final updateData (handleSubmit):', updateData);
          console.log('updateData keys length:', Object.keys(updateData).length);
          if (Object.keys(updateData).length > 0) {
            console.log('Making API call with data (handleSubmit):', updateData);
            const updatedData = await barcodeApi.updateBarcode(currentBarcode, updateData);
            console.log('API response (handleSubmit):', updatedData);
            
            // Update the local state with the response
            setBarcodeData(updatedData);
            setCurrentPhase(updatedData.current_phase);
            setStatus(updatedData.status);
            
            // Show success message
            setError('');
          } else {
            console.log('No update data to send - skipping API call (handleSubmit)');
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
    setQuantity(0);
    setSecondDegreeToggle(true);
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
    const phase = phases.find(p => p.id === phaseId);
    return phase ? phase.name : 'Unknown';
  };

  const getStatusName = (status: string) => {
    // Fix the status key mapping to handle "In Progress" correctly
    if (status === 'In Progress') return t('status.inProgress');
    if (status === 'Pending') return t('status.pending');
    if (status === 'Completed') return t('status.completed');
    return status; // fallback
  };

  // New function to handle quantity update
  const handleQuantityUpdate = async () => {
    if (!barcodeData || quantity <= 0) {
      setError(t('barcode.invalidQuantity'));
      return;
    }

    setIsUpdatingQuantity(true);
    setError('');

    try {
      const updatedData = await barcodeApi.updateBarcode(barcodeData.barcode, {
        quantity: quantity
      });

      // Update local state with new data
      setBarcodeData(updatedData);
      setQuantity(updatedData.quantity);
      
      // Show success message
      setError('');
      
      // Focus back to barcode input for next scan
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
      }
    } catch (updateErr: any) {
      if (updateErr.response?.status === 404) {
        setError(t('barcode.batchNotFound'));
      } else if (updateErr.response?.status === 500) {
        setError(t('barcode.serverError'));
      } else {
        setError(t('barcode.failedToUpdateQuantity'));
      }
      console.error('Failed to update quantity:', updateErr);
    } finally {
      setIsUpdatingQuantity(false);
    }
  };

  // Quantity counter functions
  const incrementQuantity = () => {
    setQuantity(prev => prev + 1);
  };

  const decrementQuantity = () => {
    setQuantity(prev => Math.max(0, prev - 1));
  };

  const setQuantityDirectly = (value: number) => {
    setQuantity(Math.max(0, value));
  };

  // Reset quantity when mode changes
  useEffect(() => {
    if (mode !== 'updateQuantity') {
      setQuantity(0);
    }
  }, [mode]);



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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
              <h2 className="text-lg font-semibold">{t('barcode.scannerMode')}</h2>
              <div className="grid grid-cols-2 sm:flex sm:gap-2 gap-2">
                <button
                  onClick={() => {
                    setMode('view');
                    setBarcode('');
                    setBarcodeData(null);
                    setError('');
                    setScanned(false);
                    setQuantity(0);
                    setSecondDegreeToggle(true);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    mode === 'view'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Eye className="inline-block w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('barcode.viewMode')}</span>
                  <span className="sm:hidden">View</span>
                </button>
                <button
                  onClick={() => {
                    setMode('update');
                    setBarcode('');
                    setBarcodeData(null);
                    setError('');
                    setScanned(false);
                    setQuantity(0);
                    setSecondDegreeToggle(true);
                    // Reset session data
                    setSessionData({
                      phase: selectedPhase,
                      status: selectedStatus,
                      initialBarcode: '',
                      jobOrderId: null,
                      colorId: null,
                      expectedQuantity: 0,
                      scannedQuantity: 0,
                      scannedBarcodes: [],
                      isActive: false
                    });
                  }}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    mode === 'update'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Edit3 className="inline-block w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('barcode.updateMode')}</span>
                  <span className="sm:hidden">Update</span>
                </button>
                <button
                  onClick={() => {
                    setMode('updateQuantity');
                    setBarcode('');
                    setBarcodeData(null);
                    setError('');
                    setScanned(false);
                    setQuantity(0);
                    setSecondDegreeToggle(true);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    mode === 'updateQuantity'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Package className="inline-block w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('barcode.updateQuantityMode')}</span>
                  <span className="sm:hidden">Quantity</span>
                </button>
                <button
                  onClick={() => {
                    setMode('secondDegree');
                    setBarcode('');
                    setBarcodeData(null);
                    setError('');
                    setScanned(false);
                    setQuantity(0);
                    setSecondDegreeToggle(true);
                  }}
                  className={`px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    mode === 'secondDegree'
                      ? 'bg-green text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <RefreshCw className="inline-block w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{t('barcode.secondDegreeMode')}</span>
                  <span className="sm:hidden">2nd Degree</span>
                </button>
              </div>
            </div>
            

            


            {mode === 'updateQuantity' && (
              <div className="text-sm text-gray-600">
                <p>{t('barcode.updateQuantityDescription')}</p>
              </div>
            )}

            {mode === 'secondDegree' && (
              <div className="text-sm text-gray-600">
                <p>{t('barcode.secondDegreeDescription')}</p>
              </div>
            )}

            {mode === 'secondDegree' && (
              <div className="grid grid-cols-1 gap-6">
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-3 block">
                    {t('barcode.secondDegreeSetting')}
                  </Label>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => setSecondDegreeToggle(true)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        secondDegreeToggle === true
                          ? 'bg-green text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t('barcode.markAsSecondDegree')}
                    </button>
                    <button
                      onClick={() => setSecondDegreeToggle(false)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        secondDegreeToggle === false
                          ? 'bg-green text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {t('barcode.markAsFirstDegree')}
                    </button>
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    <p>{t('barcode.secondDegreeDescriptionText')}</p>
                  </div>
                </div>
              </div>
            )}

            {mode === 'update' && (
              <div className="text-sm text-gray-600 mb-4">
                <p>{t('barcode.sessionInstructions')}</p>
              </div>
            )}

            {mode === 'update' && (
              <div className="space-y-6">
                {sessionData.isActive && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center text-blue-800">
                      <svg className="w-5 h-5 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                      <span className="text-sm font-medium">
                        {t('barcode.phaseStatusLocked')}
                      </span>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">
                      {t('barcode.phase')}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {phases.map((phase) => (
                        <button
                          key={phase.id}
                          onClick={() => {
                            if (!sessionData.isActive) {
                              setSessionData(prev => ({ ...prev, phase: phase.id }));
                              setSelectedPhase(phase.id);
                            }
                          }}
                          disabled={sessionData.isActive}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-w-[80px] ${
                            sessionData.phase === phase.id
                              ? 'bg-green text-white'
                              : sessionData.isActive
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                            {phase.name}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium text-gray-700 mb-3 block">
                      {t('common.status')}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.map((status) => (
                        <button
                          key={status}
                          onClick={() => {
                            if (!sessionData.isActive) {
                              setSessionData(prev => ({ ...prev, status }));
                              setSelectedStatus(status);
                            }
                          }}
                          disabled={sessionData.isActive}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors min-w-[100px] ${
                            sessionData.status === status
                              ? 'bg-green text-white'
                              : sessionData.isActive
                              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                            {status === 'In Progress' ? t('status.inProgress') : 
                             status === 'Pending' ? t('status.pending') : 
                             t('status.completed')}
                        </button>
                      ))}
                    </div>
                  </div>
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

      {/* Quantity Update Interface */}
      {mode === 'updateQuantity' && barcodeData && (
        <div className="mb-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('barcode.updateQuantity')}</h3>
              
              {/* Current Quantity Display */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-center">
                  <h4 className="text-sm font-medium text-blue-800 mb-2">{t('barcode.currentQuantity')}</h4>
                  <p className="text-3xl font-bold text-blue-900">{barcodeData.quantity}</p>
                </div>
              </div>

              {/* Quantity Counter */}
              <div className="mb-6">
                <Label className="text-sm font-medium text-gray-700 mb-3 block text-center">
                  {t('barcode.newQuantity')}
                </Label>
                
                {/* Large Counter Interface */}
                <div className="flex items-center justify-center gap-6 mb-6">
                  <button
                    onClick={incrementQuantity}
                    className="w-20 h-20 bg-blue-600 text-white rounded-full text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center shadow-lg border-2 border-blue-700"
                  >
                    <span className="text-white">+</span>
                  </button>
                  
                  <div className="text-center">
                    <div className="text-7xl font-bold text-gray-900 mb-3">{quantity}</div>
                  </div>
                  
                  <button
                    onClick={decrementQuantity}
                    className="w-20 h-20 bg-red-600 text-white rounded-full text-3xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center shadow-lg border-2 border-red-700"
                    disabled={quantity <= 0}
                  >
                    <span className="text-white">-</span>
                  </button>
                </div>

                {/* Quick Quantity Buttons */}
                <div className="grid grid-cols-4 gap-3 mb-8">
                  {[
                    { value: 2, type: 'add', color: 'blue' },
                    { value: 5, type: 'add', color: 'blue' },
                    { value: 2, type: 'subtract', color: 'red' },
                    { value: 5, type: 'subtract', color: 'red' }
                  ].map(({ value, type, color }) => (
                    <button
                      key={`${type}-${value}`}
                      onClick={() => setQuantity(prev => type === 'add' ? prev + value : Math.max(0, prev - value))}
                      className={`px-4 py-3 rounded-lg transition-colors font-semibold border-2 shadow-sm ${
                        color === 'blue' 
                          ? 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200' 
                          : 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                      }`}
                    >
                      {type === 'add' ? '+' : '-'}{value}
                    </button>
                  ))}
                </div>

                {/* Update Button */}
                <div className="text-center">
                  <button
                    onClick={handleQuantityUpdate}
                    disabled={quantity <= 0 || isUpdatingQuantity}
                    className="px-12 py-6 bg-blue-600 text-white rounded-xl text-xl font-bold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed shadow-lg border-2 border-blue-700 min-w-[200px]"
                  >
                    <span className="text-white">
                      {isUpdatingQuantity ? t('common.updating') : t('barcode.updateQuantity')}
                    </span>
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Update Mode Interface (formerly Session Interface) */}
      {mode === 'update' && (
        <div className="mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('barcode.updateMode')}</h3>
                {sessionData.isActive && (
                  <button
                    onClick={() => {
                                          setSessionData(prev => ({
                      ...prev,
                      isActive: false,
                      initialBarcode: '',
                      jobOrderId: null,
                      colorId: null,
                      expectedQuantity: 0,
                      scannedQuantity: 0,
                      scannedBarcodes: []
                    }));
                    }}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <Square className="w-4 h-4" />
                    {t('barcode.endSession')}
                  </button>
                )}
              </div>

              {!sessionData.isActive ? (
                <div className="text-center py-8">
                  <div className="mb-4">
                    <Play className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h4 className="text-lg font-medium text-gray-700 mb-2">{t('barcode.startSession')}</h4>
                    <p className="text-sm text-gray-600">{t('barcode.sessionInstructions')}</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h5 className="font-medium text-gray-700 mb-2">{t('barcode.selectedPhase')}</h5>
                      <p className="text-sm text-gray-600">{getPhaseName(sessionData.phase)}</p>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h5 className="font-medium text-gray-700 mb-2">{t('barcode.selectedStatus')}</h5>
                      <p className="text-sm text-gray-600">{getStatusName(sessionData.status)}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Session Info */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
                      <h4 className="text-sm font-medium text-blue-800 mb-2">{t('barcode.expectedQuantity')}</h4>
                      <p className="text-2xl font-bold text-blue-900">{sessionData.expectedQuantity}</p>
                    </div>
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                      <h4 className="text-sm font-medium text-green-800 mb-2">{t('barcode.scannedQuantity')}</h4>
                      <p className="text-2xl font-bold text-green-900">{sessionData.scannedQuantity}</p>
                    </div>
                    <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg text-center">
                      <h4 className="text-sm font-medium text-purple-800 mb-2">{t('barcode.remaining')}</h4>
                      <p className="text-2xl font-bold text-purple-900">{Math.max(0, sessionData.expectedQuantity - sessionData.scannedQuantity)}</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-4 relative">
                    <div 
                      className={`h-4 rounded-full transition-all duration-300 ${
                        sessionData.scannedQuantity >= sessionData.expectedQuantity 
                          ? 'bg-green-600' 
                          : 'bg-blue-600'
                      }`}
                      style={{ 
                        width: `${Math.min(100, (sessionData.scannedQuantity / sessionData.expectedQuantity) * 100)}%` 
                      }}
                    ></div>
                    {sessionData.scannedQuantity >= sessionData.expectedQuantity && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓ COMPLETE</span>
                      </div>
                    )}
                  </div>

                  {/* Initial Barcode Info */}
                  <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">{t('barcode.initialBarcode')}</h4>
                    <p className="text-lg font-semibold text-gray-900">{sessionData.initialBarcode}</p>
                  </div>

                  {/* Session Summary */}
                  {sessionData.scannedQuantity >= sessionData.expectedQuantity && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-center">
                        <div className="flex-shrink-0">
                          <svg className="h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <div className="ml-3">
                          <h4 className="text-lg font-medium text-green-800">Session Complete!</h4>
                          <p className="text-sm text-green-700">
                            Successfully scanned {sessionData.scannedQuantity} out of {sessionData.expectedQuantity} expected quantity.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Scanned Barcodes List */}
                  {sessionData.scannedBarcodes.length > 0 && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">{t('barcode.scannedBarcodes')}</h4>
                      <div className="max-h-32 overflow-y-auto">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {sessionData.scannedBarcodes.map((barcode, index) => (
                            <div key={index} className="text-sm text-gray-600 bg-white px-2 py-1 rounded border">
                              {barcode}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
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
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <div className="grid grid-cols-1 gap-4">
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
