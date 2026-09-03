import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { zebraPrinterService, ZebraPrinter } from '../services/zebraPrinterService';
import { Loader2, Printer, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface ZebraPrinterConfigProps {
  onPrinterSelected?: (printer: ZebraPrinter | null) => void;
  selectedPrinter?: string;
  className?: string;
}

const ZebraPrinterConfig: React.FC<ZebraPrinterConfigProps> = ({
  onPrinterSelected,
  selectedPrinter,
  className = ''
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [isServiceAvailable, setIsServiceAvailable] = useState<boolean | null>(null);
  const [availablePrinters, setAvailablePrinters] = useState<ZebraPrinter[]>([]);
  const [defaultPrinter, setDefaultPrinter] = useState<ZebraPrinter | null>(null);
  const [currentPrinter, setCurrentPrinter] = useState<string>(selectedPrinter || '');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    initializeZebraService();
  }, []);

  useEffect(() => {
    if (selectedPrinter) {
      setCurrentPrinter(selectedPrinter);
    }
  }, [selectedPrinter]);

  const initializeZebraService = async () => {
    setIsLoading(true);
    setError('');

    try {
      const isAvailable = await zebraPrinterService.checkServiceAvailability();
      setIsServiceAvailable(isAvailable);

      if (isAvailable) {
        const [printers, defaultPrinter] = await Promise.all([
          zebraPrinterService.getAvailablePrinters(),
          zebraPrinterService.getDefaultPrinter()
        ]);

        setAvailablePrinters(printers);
        setDefaultPrinter(defaultPrinter);

        if (defaultPrinter && !currentPrinter) {
          setCurrentPrinter(defaultPrinter.name);
          onPrinterSelected?.(defaultPrinter);
        }
      }
    } catch (error) {
      console.error('Error initializing Zebra service:', error);
      setError(error instanceof Error ? error.message : 'Failed to initialize Zebra service');
      setIsServiceAvailable(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrinterChange = async (printerName: string) => {
    setCurrentPrinter(printerName);
    
    try {
      await zebraPrinterService.setDefaultPrinter(printerName);
      const printer = availablePrinters.find(p => p.name === printerName) || null;
      onPrinterSelected?.(printer);
      setError('');
    } catch (error) {
      console.error('Error setting default printer:', error);
      setError(error instanceof Error ? error.message : 'Failed to set default printer');
    }
  };

  const getServiceStatusIcon = () => {
    if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (isServiceAvailable === null) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    if (isServiceAvailable) return <CheckCircle className="h-4 w-4 text-green-500" />;
    return <XCircle className="h-4 w-4 text-red-500" />;
  };

  const getServiceStatusText = () => {
    if (isLoading) return t('zebraPrinter.checkingService');
    if (isServiceAvailable === null) return t('zebraPrinter.serviceUnknown');
    if (isServiceAvailable) return t('zebraPrinter.serviceAvailable');
    return t('zebraPrinter.serviceUnavailable');
  };

  const getServiceStatusColor = () => {
    if (isLoading) return 'bg-yellow-100 text-yellow-800';
    if (isServiceAvailable === null) return 'bg-yellow-100 text-yellow-800';
    if (isServiceAvailable) return 'bg-green-100 text-green-800';
    return 'bg-red-100 text-red-800';
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer className="h-5 w-5" />
          {t('zebraPrinter.title')}
        </CardTitle>
        <CardDescription>
          {t('zebraPrinter.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Service Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('zebraPrinter.serviceStatus')}</span>
          <Badge className={getServiceStatusColor()}>
            <div className="flex items-center gap-1">
              {getServiceStatusIcon()}
              {getServiceStatusText()}
            </div>
          </Badge>
        </div>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Printer Selection */}
        {isServiceAvailable && (
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('zebraPrinter.selectPrinter')}</label>
            <Select value={currentPrinter} onValueChange={handlePrinterChange}>
              <SelectTrigger>
                <SelectValue placeholder={t('zebraPrinter.selectPrinterPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
		{availablePrinters.filter(p => p.name && p.name.trim() !== "").map((printer) => (
                  <SelectItem key={printer.name} value={printer.name}>
                    <div className="flex items-center justify-between w-full">
                      <span>{printer.name}</span>
                      <Badge variant="outline" className="ml-2">
                        {printer.connectionType}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Default Printer Info */}
        {defaultPrinter && (
          <div className="text-sm text-gray-600">
            <span className="font-medium">{t('zebraPrinter.defaultPrinter')}:</span> {defaultPrinter.name}
          </div>
        )}

        {/* Refresh Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={initializeZebraService}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t('zebraPrinter.refreshing')}
            </>
          ) : (
            t('zebraPrinter.refresh')
          )}
        </Button>

        {/* Installation Instructions */}
        {!isServiceAvailable && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">{t('zebraPrinter.installationRequired')}</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>{t('zebraPrinter.installStep1')}</li>
                  <li>{t('zebraPrinter.installStep2')}</li>
                  <li>{t('zebraPrinter.installStep3')}</li>
                </ol>
                <a
                  href="https://www.zebra.com/us/en/support-downloads/printer-software/browser-print.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 underline"
                >
                  {t('zebraPrinter.downloadLink')}
                </a>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default ZebraPrinterConfig;
